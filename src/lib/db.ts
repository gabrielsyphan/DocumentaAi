import Database from "@tauri-apps/plugin-sql";
import type { Page, PageVersion, Flashcard } from "../types";

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:documentaai.db");
    await db.execute(`
      CREATE TABLE IF NOT EXISTS pages (
        id          TEXT PRIMARY KEY,
        parent_id   TEXT REFERENCES pages(id) ON DELETE CASCADE,
        title       TEXT NOT NULL DEFAULT 'Sem título',
        emoji       TEXT,
        content     TEXT,
        order_index REAL NOT NULL DEFAULT 0,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        type        TEXT NOT NULL DEFAULT 'document',
        tags        TEXT NOT NULL DEFAULT '[]',
        deleted_at    TEXT,
        reminder_date TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )
    `);
    for (const migration of [
      "ALTER TABLE pages ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE pages ADD COLUMN type TEXT NOT NULL DEFAULT 'document'",
      "ALTER TABLE pages ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'",
      "ALTER TABLE pages ADD COLUMN deleted_at TEXT",
      "ALTER TABLE pages ADD COLUMN reminder_date TEXT",
    ]) {
      try { await db.execute(migration); } catch { /* coluna já existe */ }
    }
    await db.execute(`
      CREATE TABLE IF NOT EXISTS page_versions (
        id       TEXT PRIMARY KEY,
        page_id  TEXT NOT NULL,
        title    TEXT NOT NULL DEFAULT '',
        content  TEXT,
        saved_at TEXT NOT NULL
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS flashcards (
        id            TEXT PRIMARY KEY,
        page_id       TEXT NOT NULL,
        front         TEXT NOT NULL,
        back          TEXT NOT NULL DEFAULT '',
        interval      INTEGER NOT NULL DEFAULT 1,
        repetitions   INTEGER NOT NULL DEFAULT 0,
        ease_factor   REAL NOT NULL DEFAULT 2.5,
        next_review   TEXT NOT NULL,
        last_reviewed TEXT,
        created_at    TEXT NOT NULL
      )
    `);
    // Auto-limpeza: remove páginas deletadas há mais de 30 dias
    await db.execute(
      `DELETE FROM pages WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-30 days')`
    );
  }
  return db;
}

type RawPage = Omit<Page, "tags"> & { tags: string | null; reminder_date?: string | null };

export async function fetchAllPages(): Promise<Page[]> {
  const database = await getDb();
  const rows = await database.select<RawPage[]>(
    "SELECT * FROM pages WHERE deleted_at IS NULL ORDER BY order_index ASC"
  );
  return rows.map((row) => ({
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
    deleted_at: null,
    reminder_date: row.reminder_date ?? null,
  }));
}

export async function fetchTrash(): Promise<Page[]> {
  const database = await getDb();
  const rows = await database.select<RawPage[]>(
    "SELECT * FROM pages WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"
  );
  return rows.map((row) => ({
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
    reminder_date: row.reminder_date ?? null,
  }));
}

export async function upsertPage(page: Page): Promise<void> {
  const database = await getDb();
  await database.execute(
    `INSERT INTO pages (id, parent_id, title, emoji, content, order_index, is_favorite, type, tags, deleted_at, reminder_date, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT(id) DO UPDATE SET
       parent_id     = excluded.parent_id,
       title         = excluded.title,
       emoji         = excluded.emoji,
       content       = excluded.content,
       order_index   = excluded.order_index,
       is_favorite   = excluded.is_favorite,
       type          = excluded.type,
       tags          = excluded.tags,
       deleted_at    = excluded.deleted_at,
       reminder_date = excluded.reminder_date,
       updated_at    = excluded.updated_at`,
    [
      page.id,
      page.parent_id,
      page.title,
      page.emoji,
      page.content,
      page.order_index,
      page.is_favorite,
      page.type,
      JSON.stringify(page.tags ?? []),
      page.deleted_at ?? null,
      page.reminder_date ?? null,
      page.created_at,
      page.updated_at,
    ]
  );
}

// CTE recursiva que coleta uma página e todos os seus descendentes ($id no placeholder indicado)
const DESCENDANTS_CTE = `WITH RECURSIVE descendants(id) AS (
  SELECT id FROM pages WHERE id = {P}
  UNION ALL
  SELECT p.id FROM pages p JOIN descendants d ON p.parent_id = d.id
)`;

export async function softDeletePage(id: string): Promise<void> {
  const database = await getDb();
  // updated_at também é atualizado para o sync LWW propagar a deleção
  // Cascata: subpáginas ainda não deletadas recebem o mesmo deleted_at
  // (o timestamp comum permite restaurar o grupo junto depois)
  const now = new Date().toISOString();
  await database.execute(
    `${DESCENDANTS_CTE.replace("{P}", "$2")}
     UPDATE pages SET deleted_at = $1, updated_at = $1
     WHERE id IN (SELECT id FROM descendants) AND deleted_at IS NULL`,
    [now, id]
  );
}

export async function restorePageFromTrash(id: string): Promise<void> {
  const database = await getDb();
  const rows = await database.select<{ deleted_at: string | null }[]>(
    "SELECT deleted_at FROM pages WHERE id = $1",
    [id]
  );
  const deletedAt = rows[0]?.deleted_at ?? null;
  // updated_at também é atualizado para o sync LWW propagar a restauração
  // Cascata: restaura junto os descendentes deletados na mesma operação
  // (mesmo deleted_at); itens jogados no lixo separadamente ficam lá
  await database.execute(
    `${DESCENDANTS_CTE.replace("{P}", "$2")}
     UPDATE pages SET deleted_at = NULL, updated_at = $1
     WHERE id IN (SELECT id FROM descendants) AND (id = $2 OR deleted_at = $3)`,
    [new Date().toISOString(), id, deletedAt]
  );
}

export async function removePage(id: string): Promise<void> {
  const database = await getDb();
  await database.execute(
    `${DESCENDANTS_CTE.replace("{P}", "$1")}
     DELETE FROM pages WHERE id IN (SELECT id FROM descendants)`,
    [id]
  );
}

export async function saveVersion(
  pageId: string,
  title: string,
  content: string | null
): Promise<void> {
  const database = await getDb();
  await database.execute(
    `INSERT INTO page_versions (id, page_id, title, content, saved_at) VALUES ($1, $2, $3, $4, $5)`,
    [crypto.randomUUID(), pageId, title, content, new Date().toISOString()]
  );
  await database.execute(
    `DELETE FROM page_versions WHERE page_id = $1 AND id NOT IN (
       SELECT id FROM page_versions WHERE page_id = $1 ORDER BY saved_at DESC LIMIT 30
     )`,
    [pageId, pageId]
  );
}

export async function getVersions(pageId: string): Promise<PageVersion[]> {
  const database = await getDb();
  return database.select<PageVersion[]>(
    `SELECT * FROM page_versions WHERE page_id = $1 ORDER BY saved_at DESC`,
    [pageId]
  );
}

export async function deletePageVersions(pageId: string): Promise<void> {
  const database = await getDb();
  await database.execute("DELETE FROM page_versions WHERE page_id = $1", [pageId]);
}

// ── Flashcards ────────────────────────────────────────────────────────────────

export async function createFlashcard(card: Flashcard): Promise<void> {
  const database = await getDb();
  await database.execute(
    `INSERT INTO flashcards (id, page_id, front, back, interval, repetitions, ease_factor, next_review, last_reviewed, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [card.id, card.page_id, card.front, card.back, card.interval, card.repetitions, card.ease_factor, card.next_review, card.last_reviewed, card.created_at]
  );
}

export async function updateFlashcard(id: string, updates: Partial<Flashcard>): Promise<void> {
  const database = await getDb();
  const fields = Object.keys(updates).filter((k) => k !== "id");
  const setClause = fields.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const values = fields.map((k) => (updates as Record<string, unknown>)[k]);
  await database.execute(
    `UPDATE flashcards SET ${setClause} WHERE id = $1`,
    [id, ...values]
  );
}

export async function fetchFlashcardsByPage(pageId: string): Promise<Flashcard[]> {
  const database = await getDb();
  return database.select<Flashcard[]>(
    "SELECT * FROM flashcards WHERE page_id = $1 ORDER BY created_at DESC",
    [pageId]
  );
}

export async function fetchAllFlashcards(): Promise<Flashcard[]> {
  const database = await getDb();
  return database.select<Flashcard[]>("SELECT * FROM flashcards ORDER BY created_at DESC");
}

export async function fetchDueFlashcards(): Promise<Flashcard[]> {
  const database = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  return database.select<Flashcard[]>(
    "SELECT * FROM flashcards WHERE next_review <= $1 ORDER BY next_review ASC",
    [today]
  );
}

export async function countDueFlashcards(): Promise<number> {
  const database = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const rows = await database.select<[{ count: number }]>(
    "SELECT COUNT(*) as count FROM flashcards WHERE next_review <= $1",
    [today]
  );
  return rows[0]?.count ?? 0;
}

export async function deleteFlashcard(id: string): Promise<void> {
  const database = await getDb();
  await database.execute("DELETE FROM flashcards WHERE id = $1", [id]);
}

export async function deleteFlashcardsByPage(pageId: string): Promise<void> {
  const database = await getDb();
  await database.execute("DELETE FROM flashcards WHERE page_id = $1", [pageId]);
}

// ── Sync por rede local ───────────────────────────────────────────────────────

// Linha crua da tabela pages — o formato que trafega no protocolo de sync
// (tags permanece string JSON; datas permanecem strings)
export interface SyncPageRow {
  id: string;
  parent_id: string | null;
  title: string;
  emoji: string | null;
  content: string | null;
  order_index: number;
  is_favorite: number;
  type: string;
  tags: string;
  deleted_at: string | null;
  reminder_date: string | null;
  created_at: string;
  updated_at: string;
}

/** Todas as páginas, incluindo as da lixeira — o sync precisa propagar deleções. */
export async function fetchAllPagesForSync(): Promise<SyncPageRow[]> {
  const database = await getDb();
  return database.select<SyncPageRow[]>(
    `SELECT id, parent_id, title, emoji, content, order_index, is_favorite,
            type, tags, deleted_at, reminder_date, created_at, updated_at
     FROM pages`
  );
}

// datetime('now') do SQLite gera "YYYY-MM-DD HH:MM:SS"; toISOString() gera
// "YYYY-MM-DDTHH:MM:SS.sssZ". Ambos UTC — trocar espaço por T ordena certo.
function normTs(ts: string): string {
  return ts.replace(" ", "T");
}

/**
 * Aplica páginas vindas do outro dispositivo.
 * - mode "newer" (merge): só aplica se updated_at for mais recente que o local
 * - mode "force" (baixar do desktop): aplica incondicionalmente — sobrescreve
 *   a cópia local e recria páginas até se estavam na lixeira daqui
 *
 * Cuidados com a FK parent_id REFERENCES pages(id) ON DELETE CASCADE:
 * - pais são aplicados antes dos filhos (ordenação topológica no lote)
 * - upsert via ON CONFLICT DO UPDATE — nunca INSERT OR REPLACE, que executa
 *   DELETE+INSERT internamente e dispararia o CASCADE apagando subpáginas
 */
export async function applySyncPages(
  pages: SyncPageRow[],
  mode: "newer" | "force" = "newer"
): Promise<number> {
  const database = await getDb();

  // Ordena o lote: pais antes dos filhos (à prova de ciclos via visited)
  const byId = new Map(pages.map((p) => [p.id, p]));
  const sorted: SyncPageRow[] = [];
  const visited = new Set<string>();
  const visit = (p: SyncPageRow) => {
    if (visited.has(p.id)) return;
    visited.add(p.id);
    if (p.parent_id && byId.has(p.parent_id)) visit(byId.get(p.parent_id)!);
    sorted.push(p);
  };
  pages.forEach(visit);

  let applied = 0;
  for (const p of sorted) {
    if (mode === "newer") {
      const local = await database.select<{ updated_at: string }[]>(
        "SELECT updated_at FROM pages WHERE id = $1",
        [p.id]
      );
      const isNewer = local.length === 0 || normTs(p.updated_at) > normTs(local[0].updated_at);
      if (!isNewer) continue;
    }
    await database.execute(
      `INSERT INTO pages
        (id, parent_id, title, emoji, content, order_index, is_favorite,
         type, tags, deleted_at, reminder_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT(id) DO UPDATE SET
         parent_id     = excluded.parent_id,
         title         = excluded.title,
         emoji         = excluded.emoji,
         content       = excluded.content,
         order_index   = excluded.order_index,
         is_favorite   = excluded.is_favorite,
         type          = excluded.type,
         tags          = excluded.tags,
         deleted_at    = excluded.deleted_at,
         reminder_date = excluded.reminder_date,
         created_at    = excluded.created_at,
         updated_at    = excluded.updated_at`,
      [
        p.id, p.parent_id, p.title, p.emoji, p.content, p.order_index,
        p.is_favorite, p.type, p.tags, p.deleted_at, p.reminder_date,
        p.created_at, p.updated_at,
      ]
    );
    applied++;
  }
  return applied;
}

// Creates a consistent full backup at destPath using VACUUM INTO (includes WAL data).
export async function vacuumInto(destPath: string): Promise<void> {
  const database = await getDb();
  // VACUUM INTO copies the entire DB to destPath; path must be a string literal in SQL.
  const safe = destPath.replace(/'/g, "''");
  await database.execute(`VACUUM INTO '${safe}'`);
}
