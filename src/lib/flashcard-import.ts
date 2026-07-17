// Extrai pares "frente - verso" do conteúdo BlockNote de uma página,
// para importação em massa de flashcards (ex: estudo de idiomas com
// "frase em inglês - tradução em português" por linha).

export interface ParsedCard {
  front: string;
  back: string;
}

type AnyInline = { type: string; text?: string; content?: AnyInline[] };
type AnyBlock = { type: string; content?: unknown; children?: AnyBlock[] };

// Separador: hífen, en-dash ou em-dash cercado de espaços — evita quebrar
// palavras hifenizadas ("floor-to-ceiling") no meio.
const SEPARATOR = /\s+[-–—]\s+/;

// Blocos que não contêm frases de estudo
const SKIP_TYPES = new Set(["heading", "codeBlock", "table", "image", "video", "audio", "file", "captureStamp"]);

function inlineText(items: AnyInline[]): string {
  return items
    .map((c) => (c.type === "text" ? (c.text ?? "") : inlineText(c.content ?? [])))
    .join("");
}

// Coleta as linhas de texto dos blocos na ordem do documento.
// Um bloco pode ter várias linhas internas (Shift+Enter vira "\n" no texto).
function collectLines(blocks: AnyBlock[]): string[] {
  const lines: string[] = [];
  function walk(block: AnyBlock) {
    if (!SKIP_TYPES.has(block.type) && Array.isArray(block.content)) {
      const text = inlineText(block.content as AnyInline[]);
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) lines.push(trimmed);
      }
    }
    (block.children ?? []).forEach(walk);
  }
  blocks.forEach(walk);
  return lines;
}

export function parseCardsFromBlocks(blocks: unknown): ParsedCard[] {
  if (!Array.isArray(blocks)) return [];
  const cards: ParsedCard[] = [];

  for (const line of collectLines(blocks as AnyBlock[])) {
    const match = SEPARATOR.exec(line);
    if (match) {
      const front = line.slice(0, match.index).trim();
      const back = line.slice(match.index + match[0].length).trim();
      if (front) cards.push({ front, back });
    } else if (cards.length > 0) {
      // Linha sem separador = continuação do verso do card anterior
      // (frase longa que quebrou para a linha de baixo)
      const last = cards[cards.length - 1];
      last.back = last.back ? `${last.back} ${line}` : line;
    }
  }
  return cards;
}

// Normaliza para comparar duplicados (caixa e espaços não contam)
export function normalizeCardKey(front: string): string {
  return front.trim().toLowerCase().replace(/\s+/g, " ");
}

// ── Export CSV para o Anki ────────────────────────────────────────────────────

// Aspas duplas dentro do campo viram "" (escape padrão de CSV)
function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// Gera CSV que o Anki importa direto (Arquivo → Importar):
// as linhas iniciadas com # são diretivas que o Anki 2.1.55+ entende
// (e versões antigas ignoram como comentário).
export function flashcardsToAnkiCsv(cards: { front: string; back: string }[]): string {
  const lines = ["#separator:Comma", "#html:false"];
  for (const c of cards) {
    lines.push(`${csvField(c.front)},${csvField(c.back)}`);
  }
  return lines.join("\n") + "\n";
}

// Nome de arquivo seguro a partir do título da página ("16/07/2026" tem barras!)
export function safeFileName(title: string): string {
  return (title.trim() || "flashcards").replace(/[/\\:*?"<>|]/g, "-");
}
