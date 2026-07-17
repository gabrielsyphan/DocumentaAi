// ── Base de conhecimento ──────────────────────────────────────────────────────
// Busca híbrida sobre as páginas do DocumentaAI:
//   1. Léxica  — SQLite FTS5 (BM25), sem dependências, instantânea
//   2. Semântica — embeddings locais via @huggingface/transformers
//      (multilingual-e5-small, ~112 MB baixados uma vez, roda em CPU)
// Os rankings são combinados por Reciprocal Rank Fusion (RRF).
//
// O índice mora em knowledge.db AO LADO do banco principal — é dado derivado,
// não entra em backup/sync e pode ser apagado sem perda (rebuild automático).
// A indexação é incremental: compara pages.updated_at com o que foi indexado.

import Database from "better-sqlite3";
import { dirname, join } from "path";

// ── Estado do módulo ──────────────────────────────────────────────────────────

let kdb: Database.Database | undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let embedderPromise: Promise<any> | null = null;
let embedderReady = false;
let embedError: string | null = null;
let embedTask: Promise<void> | null = null;

// Cache em memória dos vetores para o KNN (invalidado a cada escrita)
let vecCache: { ids: number[]; vectors: Float32Array[] } | null = null;

const EMBED_MODEL = "Xenova/multilingual-e5-small"; // 384 dims, PT+EN

// Chunks PEQUENOS (~400 chars ≈ 2-5 frases): testado na prática — chunks de
// 1200 chars misturavam frases demais e a média do embedding virava "mingau"
// (todas as notas de similaridade amontoadas em ±0.02). Com chunks pequenos o
// ranking semântico acerta com folga. O overlap carrega a última linha inteira
// (nunca corta no meio de palavra).
const CHUNK_MAX_CHARS = 400;
const CHUNK_OVERLAP_MAX_LINE = 150;

// Versão do schema/estratégia de chunking — mudou? reconstrói o índice
// (é dado derivado, rebuild é automático e barato)
const SCHEMA_VERSION = 2;

// ── Banco do índice ───────────────────────────────────────────────────────────

export function getKnowledgeDb(mainDbPath: string): Database.Database {
  if (kdb) return kdb;
  kdb = new Database(join(dirname(mainDbPath), "knowledge.db"));
  kdb.pragma("journal_mode = WAL");
  const version = kdb.pragma("user_version", { simple: true }) as number;
  if (version !== SCHEMA_VERSION) {
    kdb.exec(`
      DROP TABLE IF EXISTS chunks;
      DROP TABLE IF EXISTS chunks_fts;
    `);
    kdb.pragma(`user_version = ${SCHEMA_VERSION}`);
  }
  kdb.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id              INTEGER PRIMARY KEY,
      page_id         TEXT NOT NULL,
      chunk_index     INTEGER NOT NULL,
      text            TEXT NOT NULL,
      embedding       BLOB,
      page_updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_page ON chunks(page_id);
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      text,
      tokenize = 'unicode61 remove_diacritics 2'
    );
  `);
  return kdb;
}

// ── Extração de texto do BlockNote JSON ───────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

function inlineText(items: any[]): string {
  return (items ?? [])
    .map((i: any) => {
      if (i?.type === "text") return i.text ?? "";
      if (i?.type === "wikilink") return i.props?.title ?? "";
      if (Array.isArray(i?.content)) return inlineText(i.content);
      return "";
    })
    .join("");
}

function blockLines(block: any, out: string[]): void {
  if (block?.type === "table" && block.content?.rows) {
    for (const row of block.content.rows) {
      const cells = (row.cells ?? []).map((c: any) =>
        inlineText(Array.isArray(c) ? c : c?.content ?? [])
      );
      out.push(cells.join(" | "));
    }
  } else if (Array.isArray(block?.content)) {
    const text = inlineText(block.content).trim();
    if (text) out.push(text);
  }
  for (const child of block?.children ?? []) blockLines(child, out);
}

function pageLines(content: string | null): string[] {
  if (!content) return [];
  try {
    const blocks = JSON.parse(content);
    if (!Array.isArray(blocks)) return [];
    const out: string[] = [];
    for (const b of blocks) blockLines(b, out);
    return out;
  } catch {
    return [];
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Chunking ──────────────────────────────────────────────────────────────────
// Agrupa linhas consecutivas até ~400 chars. O overlap carrega a última linha
// do chunk anterior (se curta) para dar continuidade de contexto na borda.
// O título da página NÃO entra no texto (diluiria o embedding — datas de daily
// notes são ruído); ele vai só para o índice léxico e para a exibição.

function chunkPage(content: string | null): string[] {
  const lines = pageLines(content);
  if (lines.length === 0) return [];

  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  const flush = () => {
    if (current.length === 0) return;
    const text = current.join("\n");
    // não emite chunk que seja só a linha de overlap repetida
    if (!(current.length === 1 && chunks.length > 0 && chunks[chunks.length - 1].endsWith(current[0]))) {
      chunks.push(text);
    }
  };

  for (const line of lines) {
    if (currentLen > 0 && currentLen + line.length > CHUNK_MAX_CHARS) {
      flush();
      const last = current[current.length - 1];
      current = last.length <= CHUNK_OVERLAP_MAX_LINE ? [last] : [];
      currentLen = current.reduce((s, l) => s + l.length, 0);
    }
    current.push(line);
    currentLen += line.length;
  }
  flush();
  return chunks;
}

// ── Sincronização incremental do índice ───────────────────────────────────────

interface PageRow {
  id: string;
  title: string;
  content: string | null;
  updated_at: string;
}

export function syncIndex(mainDb: Database.Database, mainDbPath: string): { indexed: number; removed: number } {
  const k = getKnowledgeDb(mainDbPath);

  const pages = mainDb
    .prepare(
      `SELECT id, title, content, updated_at FROM pages
       WHERE deleted_at IS NULL AND type IN ('document', 'daily')`
    )
    .all() as PageRow[];

  const indexedState = new Map(
    (k.prepare("SELECT page_id, MAX(page_updated_at) as u FROM chunks GROUP BY page_id").all() as {
      page_id: string;
      u: string;
    }[]).map((r) => [r.page_id, r.u])
  );

  const deleteChunks = k.prepare("DELETE FROM chunks WHERE page_id = ?");
  const deleteFts = k.prepare("DELETE FROM chunks_fts WHERE rowid = ?");
  const selectChunkIds = k.prepare("SELECT id FROM chunks WHERE page_id = ?");
  const insertChunk = k.prepare(
    "INSERT INTO chunks (page_id, chunk_index, text, page_updated_at) VALUES (?, ?, ?, ?)"
  );
  const insertFts = k.prepare("INSERT INTO chunks_fts (rowid, text) VALUES (?, ?)");

  let indexed = 0;
  let removed = 0;

  const removePageChunks = (pageId: string) => {
    for (const row of selectChunkIds.all(pageId) as { id: number }[]) deleteFts.run(row.id);
    deleteChunks.run(pageId);
  };

  const tx = k.transaction(() => {
    const liveIds = new Set(pages.map((p) => p.id));

    // Páginas removidas/deletadas → tira do índice
    for (const pageId of indexedState.keys()) {
      if (!liveIds.has(pageId)) {
        removePageChunks(pageId);
        removed++;
      }
    }

    // Páginas novas ou alteradas → reindexa
    for (const page of pages) {
      if (indexedState.get(page.id) === page.updated_at) continue;
      removePageChunks(page.id);
      const chunks = chunkPage(page.content);
      chunks.forEach((text, i) => {
        const info = insertChunk.run(page.id, i, text, page.updated_at);
        // FTS indexa também o título — buscar palavras do título acha os chunks
        insertFts.run(info.lastInsertRowid, `${page.title}\n${text}`);
      });
      if (chunks.length > 0) indexed++;
    }
  });
  tx();

  if (indexed > 0 || removed > 0) vecCache = null;
  return { indexed, removed };
}

// ── Embeddings ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getEmbedder(): Promise<any> {
  if (!embedderPromise) {
    embedderPromise = import("@huggingface/transformers")
      .then(({ pipeline }) => pipeline("feature-extraction", EMBED_MODEL, { dtype: "q8" }))
      .then((p) => {
        embedderReady = true;
        embedError = null;
        return p;
      })
      .catch((e) => {
        embedError = e instanceof Error ? e.message : String(e);
        embedderPromise = null; // permite nova tentativa
        throw e;
      });
  }
  return embedderPromise;
}

// O modelo e5 exige prefixo "query:"/"passage:" para dar bons resultados
async function embed(texts: string[], kind: "query" | "passage"): Promise<Float32Array[]> {
  const embedder = await getEmbedder();
  const output = await embedder(
    texts.map((t) => `${kind}: ${t}`),
    { pooling: "mean", normalize: true }
  );
  const [n, dims] = output.dims as [number, number];
  const data = output.data as Float32Array;
  const result: Float32Array[] = [];
  for (let i = 0; i < n; i++) result.push(data.slice(i * dims, (i + 1) * dims));
  return result;
}

/** Calcula embeddings dos chunks que ainda não têm, em lotes. */
async function computeMissingEmbeddings(mainDbPath: string): Promise<number> {
  const k = getKnowledgeDb(mainDbPath);
  const update = k.prepare("UPDATE chunks SET embedding = ? WHERE id = ?");
  let total = 0;

  for (;;) {
    const batch = k
      .prepare("SELECT id, text FROM chunks WHERE embedding IS NULL LIMIT 16")
      .all() as { id: number; text: string }[];
    if (batch.length === 0) break;

    const vectors = await embed(batch.map((b) => b.text), "passage");
    const tx = k.transaction(() => {
      batch.forEach((b, i) => {
        update.run(Buffer.from(vectors[i].buffer, vectors[i].byteOffset, vectors[i].byteLength), b.id);
      });
    });
    tx();
    total += batch.length;
    vecCache = null;
  }
  return total;
}

/** Dispara o cálculo de embeddings em segundo plano (uma tarefa por vez). */
function ensureEmbeddingsInBackground(mainDbPath: string): void {
  if (embedTask) return;
  const k = getKnowledgeDb(mainDbPath);
  const pending = (k.prepare("SELECT COUNT(*) as c FROM chunks WHERE embedding IS NULL").get() as { c: number }).c;
  if (pending === 0) return;
  embedTask = computeMissingEmbeddings(mainDbPath)
    .then(() => undefined)
    .catch(() => { /* erro já registrado em embedError */ })
    .finally(() => { embedTask = null; });
}

// ── Busca ─────────────────────────────────────────────────────────────────────

function ftsQuery(query: string): string {
  const words = query
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  return words.map((w) => `"${w}"`).join(" OR ");
}

function loadVectors(k: Database.Database): { ids: number[]; vectors: Float32Array[] } {
  if (vecCache) return vecCache;
  const rows = k.prepare("SELECT id, embedding FROM chunks WHERE embedding IS NOT NULL").all() as {
    id: number;
    embedding: Buffer;
  }[];
  vecCache = {
    ids: rows.map((r) => r.id),
    vectors: rows.map(
      (r) => new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4)
    ),
  };
  return vecCache;
}

function cosine(a: Float32Array, b: Float32Array): number {
  // vetores já normalizados → produto escalar
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export interface KnowledgeResult {
  pageId: string;
  pageTitle: string;
  text: string;
  signals: string; // "léxico", "semântico" ou "léxico+semântico"
}

export interface KnowledgeSearchOutput {
  results: KnowledgeResult[];
  note: string | null; // avisos sobre o estado do índice semântico
}

export async function searchKnowledge(
  mainDb: Database.Database,
  mainDbPath: string,
  query: string,
  maxResults: number
): Promise<KnowledgeSearchOutput> {
  const k = getKnowledgeDb(mainDbPath);
  syncIndex(mainDb, mainDbPath);
  ensureEmbeddingsInBackground(mainDbPath);

  const CANDIDATES = 50;

  // 1. Ranking léxico (BM25)
  const fq = ftsQuery(query);
  const ftsRanked: number[] = fq
    ? (k
        .prepare(
          "SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY bm25(chunks_fts) LIMIT ?"
        )
        .all(fq, CANDIDATES) as { rowid: number }[]).map((r) => r.rowid)
    : [];

  // 2. Ranking semântico — só se o modelo estiver pronto (ou carregar em <10s,
  //    caso de modelo já baixado). Durante o 1º download cai no léxico puro.
  let semRanked: number[] = [];
  let note: string | null = null;

  const { ids, vectors } = loadVectors(k);
  if (ids.length > 0 || embedderReady) {
    try {
      const ready = await Promise.race([
        getEmbedder().then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 10_000)),
      ]);
      if (ready && ids.length > 0) {
        const [qVec] = await embed([query], "query");
        semRanked = ids
          .map((id, i) => ({ id, score: cosine(qVec, vectors[i]) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, CANDIDATES)
          .map((r) => r.id);
      } else if (!ready) {
        note = "Índice semântico ainda preparando (o modelo de embeddings está sendo baixado — primeira execução). Resultados desta busca são apenas léxicos.";
      }
    } catch {
      note = `Busca semântica indisponível (${embedError ?? "erro ao carregar modelo"}). Resultados apenas léxicos.`;
    }
  } else if (embedError) {
    note = `Busca semântica indisponível (${embedError}). Resultados apenas léxicos.`;
  } else {
    note = "Embeddings ainda não calculados (em preparação em segundo plano). Resultados desta busca são apenas léxicos.";
  }

  const pendingCount = (k.prepare("SELECT COUNT(*) as c FROM chunks WHERE embedding IS NULL").get() as { c: number }).c;
  if (!note && pendingCount > 0) {
    note = `Índice semântico parcial: ${pendingCount} trechos ainda sem embedding (processando em segundo plano).`;
  }

  // 3. Fusão por Reciprocal Rank Fusion
  const RRF_K = 60;
  const fused = new Map<number, { score: number; fts: boolean; sem: boolean }>();
  ftsRanked.forEach((id, rank) => {
    const cur = fused.get(id) ?? { score: 0, fts: false, sem: false };
    cur.score += 1 / (RRF_K + rank);
    cur.fts = true;
    fused.set(id, cur);
  });
  semRanked.forEach((id, rank) => {
    const cur = fused.get(id) ?? { score: 0, fts: false, sem: false };
    cur.score += 1 / (RRF_K + rank);
    cur.sem = true;
    fused.set(id, cur);
  });

  const topIds = [...fused.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, maxResults);

  if (topIds.length === 0) return { results: [], note };

  const getChunk = k.prepare("SELECT page_id, text FROM chunks WHERE id = ?");
  const getTitle = mainDb.prepare("SELECT title FROM pages WHERE id = ?");

  const results: KnowledgeResult[] = topIds.map(([id, meta]) => {
    const chunk = getChunk.get(id) as { page_id: string; text: string };
    const page = getTitle.get(chunk.page_id) as { title: string } | undefined;
    return {
      pageId: chunk.page_id,
      pageTitle: page?.title ?? "(página removida)",
      text: chunk.text.length > 900 ? chunk.text.slice(0, 900) + "…" : chunk.text,
      signals: meta.fts && meta.sem ? "léxico+semântico" : meta.fts ? "léxico" : "semântico",
    };
  });

  return { results, note };
}

// ── Reindex completo (warm-up) ────────────────────────────────────────────────

export async function reindexKnowledge(
  mainDb: Database.Database,
  mainDbPath: string
): Promise<{ pages: number; chunks: number; embedded: number }> {
  const k = getKnowledgeDb(mainDbPath);
  k.exec("DELETE FROM chunks; DELETE FROM chunks_fts;");
  vecCache = null;

  const { indexed } = syncIndex(mainDb, mainDbPath);
  const chunks = (k.prepare("SELECT COUNT(*) as c FROM chunks").get() as { c: number }).c;
  const embedded = await computeMissingEmbeddings(mainDbPath); // aguarda tudo (baixa o modelo se preciso)

  return { pages: indexed, chunks, embedded };
}

// ── Fontes indexadas ──────────────────────────────────────────────────────────

export function listKnowledgeSources(
  mainDb: Database.Database,
  mainDbPath: string
): { lines: string[]; status: string } {
  const k = getKnowledgeDb(mainDbPath);
  syncIndex(mainDb, mainDbPath);

  const rows = k
    .prepare(
      `SELECT page_id, COUNT(*) as chunks, SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) as embedded
       FROM chunks GROUP BY page_id`
    )
    .all() as { page_id: string; chunks: number; embedded: number }[];

  const getTitle = mainDb.prepare("SELECT title, type FROM pages WHERE id = ?");
  const lines = rows.map((r) => {
    const page = getTitle.get(r.page_id) as { title: string; type: string } | undefined;
    return `• [${r.page_id}] ${page?.title ?? "?"}${page?.type === "daily" ? " (daily)" : ""} — ${r.chunks} trecho${r.chunks > 1 ? "s" : ""}${r.embedded < r.chunks ? ` (${r.embedded}/${r.chunks} com embedding)` : ""}`;
  });

  const totalChunks = rows.reduce((s, r) => s + r.chunks, 0);
  const totalEmbedded = rows.reduce((s, r) => s + r.embedded, 0);
  const status = embedError
    ? `Embeddings: ERRO — ${embedError}`
    : `Embeddings: ${totalEmbedded}/${totalChunks} trechos${embedderReady ? " (modelo carregado)" : ""}`;

  return { lines, status };
}
