// ── Export em PDF real (pdfmake) ──────────────────────────────────────────────
// Gera PDFs de estudo: página única ou pasta inteira como "livro" (capa,
// sumário com número de página, capítulos numerados, rodapé com paginação).
// pdfmake é carregado lazy (~2 MB) — mesmo padrão do Excalidraw.
// O arquivo é salvo via comando Rust `save_binary_file` (dialog nativo).

import { invoke, isTauri } from "@tauri-apps/api/core";

/* eslint-disable @typescript-eslint/no-explicit-any */

type InlineItem = {
  type: string;
  text?: string;
  styles?: Record<string, boolean>;
  props?: Record<string, string>;
  content?: InlineItem[];
};

type BNBlock = {
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: BNBlock[];
};

export interface BookChapter {
  title: string;
  emoji?: string | null;
  /** Profundidade na árvore da pasta (0 = filho direto) — vira nível do capítulo */
  level: number;
  blocks: BNBlock[];
  /** "folder" vira página divisória de seção; "page" é capítulo com conteúdo */
  kind?: "folder" | "page";
}

// ── pdfmake lazy singleton ────────────────────────────────────────────────────

let _pdfMake: any = null;

async function getPdfMake(): Promise<any> {
  if (_pdfMake) return _pdfMake;
  const mod: any = await import("pdfmake/build/pdfmake");
  const pdfMake = mod.default ?? mod;
  // Registra a fonte padrão (Roboto) no virtual file system do pdfmake 0.3
  await import("pdfmake/build/fonts/Roboto");
  _pdfMake = pdfMake;
  return pdfMake;
}

// ── Conversão BlockNote → pdfmake ─────────────────────────────────────────────

function inlineToPdf(items: InlineItem[]): any[] {
  return (items ?? []).flatMap((item) => {
    if (item.type === "link") return inlineToPdf(item.content ?? []);
    if (item.type === "wikilink") {
      return [{ text: item.props?.title ?? "", color: "#7c6cd8", bold: true }];
    }
    if (item.type !== "text" || !item.text) return [];
    const s = item.styles ?? {};
    const decorations: string[] = [];
    if (s.strike || s.strikethrough) decorations.push("lineThrough");
    if (s.underline) decorations.push("underline");
    return [{
      text: item.text,
      bold: !!s.bold,
      italics: !!s.italic,
      ...(decorations.length ? { decoration: decorations } : {}),
      ...(s.code ? { color: "#8250df" } : {}),
    }];
  });
}

function tableToPdf(content: any): any {
  const rows: any[][] = (content?.rows ?? []).map((row: any) =>
    (row.cells ?? []).map((cell: any) => ({
      text: inlineToPdf(Array.isArray(cell) ? cell : cell?.content ?? []),
      margin: [2, 2, 2, 2],
    }))
  );
  if (rows.length === 0) return null;
  // Todas as linhas precisam do mesmo nº de colunas
  const cols = Math.max(...rows.map((r) => r.length));
  for (const r of rows) while (r.length < cols) r.push({ text: "" });
  return {
    table: { body: rows, widths: Array(cols).fill("*") },
    layout: "lightHorizontalLines",
    margin: [0, 4, 0, 8],
    fontSize: 10,
  };
}

/** Converte blocos em conteúdo pdfmake, agrupando listas consecutivas. */
export function blocksToPdfContent(blocks: BNBlock[], depth = 0): any[] {
  const out: any[] = [];
  let bullets: any[] = [];
  let numbered: any[] = [];

  const flush = () => {
    if (bullets.length) { out.push({ ul: bullets, style: "para" }); bullets = []; }
    if (numbered.length) { out.push({ ol: numbered, style: "para" }); numbered = []; }
  };

  for (const block of blocks) {
    const inline = Array.isArray(block.content) ? inlineToPdf(block.content as InlineItem[]) : [];
    const childContent = block.children?.length ? blocksToPdfContent(block.children, depth + 1) : [];

    switch (block.type) {
      case "bulletListItem":
        numbered.length && flush();
        bullets.push(childContent.length ? { stack: [{ text: inline }, ...childContent] } : { text: inline });
        continue;
      case "numberedListItem":
        bullets.length && flush();
        numbered.push(childContent.length ? { stack: [{ text: inline }, ...childContent] } : { text: inline });
        continue;
      case "checkListItem":
        numbered.length && flush();
        bullets.push({
          text: [{ text: block.props?.checked ? "[x] " : "[  ] ", bold: true }, ...inline],
        });
        continue;
    }

    flush();

    switch (block.type) {
      case "heading": {
        const level = Math.min(Number(block.props?.level ?? 1), 3);
        out.push({ text: inline, style: `h${level}` });
        break;
      }
      case "codeBlock": {
        const code = (Array.isArray(block.content) ? (block.content as InlineItem[]) : [])
          .map((c) => c.text ?? "")
          .join("");
        out.push({
          table: { widths: ["*"], body: [[{ text: code, style: "code" }]] },
          layout: { defaultBorder: false, fillColor: () => "#f4f2ef" },
          margin: [0, 4, 0, 8],
        });
        break;
      }
      case "image": {
        const url = block.props?.url as string | undefined;
        if (url?.startsWith("data:image")) {
          try {
            out.push({ image: url, fit: [455, 420], margin: [0, 6, 0, 10] });
          } catch { /* imagem inválida — pula */ }
        }
        break;
      }
      case "table": {
        const t = tableToPdf(block.content);
        if (t) out.push(t);
        break;
      }
      case "captureStamp":
        break; // marcador interno do quick capture — não vai para o PDF
      default: {
        if (inline.length) out.push({ text: inline, style: "para" });
        break;
      }
    }

    if (childContent.length) {
      out.push({ stack: childContent, margin: [14, 0, 0, 0] });
    }
  }
  flush();
  return out;
}

// ── Estilos e helpers comuns ──────────────────────────────────────────────────

const STYLES = {
  para: { fontSize: 11, lineHeight: 1.35, margin: [0, 2, 0, 4] as number[] },
  h1: { fontSize: 17, bold: true, margin: [0, 14, 0, 6] as number[] },
  h2: { fontSize: 14, bold: true, margin: [0, 11, 0, 5] as number[] },
  h3: { fontSize: 12, bold: true, margin: [0, 8, 0, 4] as number[] },
  code: { fontSize: 9.5, color: "#333333", margin: [6, 5, 6, 5] as number[], preserveLeadingSpaces: true },
  chapter: { fontSize: 20, bold: true, margin: [0, 0, 0, 12] as number[] },
  section: { fontSize: 16, bold: true, margin: [0, 0, 0, 10] as number[] },
};

function footer(currentPage: number, pageCount: number): any {
  if (currentPage === 1) return null; // capa sem número
  return {
    text: `${currentPage} / ${pageCount}`,
    alignment: "center",
    fontSize: 9,
    color: "#999999",
    margin: [0, 8, 0, 0],
  };
}

async function generateAndSave(docDefinition: any, fileName: string): Promise<boolean> {
  const pdfMake = await getPdfMake();
  const base64: string = await pdfMake.createPdf(docDefinition).getBase64();
  if (isTauri()) {
    return invoke<boolean>("save_binary_file", {
      suggestedName: fileName,
      filterName: "PDF",
      extensions: ["pdf"],
      contentsBase64: base64,
    });
  }
  // npm run dev no browser
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

function safeFileName(title: string): string {
  return (title.trim() || "documento").replace(/[/\\:*?"<>|]/g, "-");
}

// A Roboto (única fonte embutida) não tem glifos de emoji — no PDF eles viram
// espaço em branco. Melhor removê-los dos títulos.
function stripEmoji(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function todayLong(): string {
  return new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

// ── Export de página única ────────────────────────────────────────────────────

export async function exportPageAsPdf(title: string, blocks: BNBlock[]): Promise<boolean> {
  const docDefinition = {
    info: { title, creator: "DocumentaAI" },
    pageSize: "A4",
    pageMargins: [56, 56, 56, 56],
    footer: (cur: number, total: number) =>
      ({ text: `${cur} / ${total}`, alignment: "center", fontSize: 9, color: "#999999", margin: [0, 8, 0, 0] }),
    content: [
      { text: stripEmoji(title) || "Sem título", fontSize: 22, bold: true, margin: [0, 0, 0, 4] },
      { text: `Exportado do DocumentaAI · ${todayLong()}`, fontSize: 9, color: "#999999", margin: [0, 0, 0, 16] },
      ...blocksToPdfContent(blocks),
    ],
    styles: STYLES,
  };
  return generateAndSave(docDefinition, `${safeFileName(title)}.pdf`);
}

// ── Export de pasta como livro ────────────────────────────────────────────────
// Cada item da pasta vira um capítulo numerado (subpastas aninham: 1, 1.1, …),
// com capa, sumário automático (com nº de página) e quebra de página entre
// capítulos.

function chapterNumbers(chapters: BookChapter[]): string[] {
  const counters: number[] = [];
  return chapters.map((ch) => {
    counters.length = ch.level + 1;
    counters[ch.level] = (counters[ch.level] ?? 0) + 1;
    for (let i = 0; i < counters.length; i++) counters[i] = counters[i] ?? 1;
    return counters.join(".");
  });
}

export async function exportFolderAsPdf(folderTitle: string, chapters: BookChapter[]): Promise<boolean> {
  const numbers = chapterNumbers(chapters);
  const title = stripEmoji(folderTitle) || "Sem título";

  const content: any[] = [
    // Capa
    { text: title, fontSize: 32, bold: true, alignment: "center", margin: [0, 220, 0, 10] },
    {
      text: `${chapters.length} ${chapters.length === 1 ? "capítulo" : "capítulos"} · ${todayLong()}`,
      fontSize: 11, alignment: "center", color: "#777777",
    },
    { text: "DocumentaAI", fontSize: 9, alignment: "center", color: "#aaaaaa", margin: [0, 6, 0, 0], pageBreak: "after" },
    // Sumário (números de página preenchidos pelo pdfmake)
    {
      toc: { title: { text: "Sumário", fontSize: 20, bold: true, margin: [0, 0, 0, 12] } },
      pageBreak: "after",
    },
  ];

  chapters.forEach((ch, i) => {
    const displayTitle = stripEmoji(ch.title || "") || "Sem título";
    const pageBreak = i > 0 ? { pageBreak: "before" as const } : {};

    if (ch.kind === "folder") {
      // Divisória de seção estilo livro: rótulo, título centralizado, linha
      // decorativa e mini-sumário dos itens diretos da seção.
      const children: { num: string; title: string }[] = [];
      for (let j = i + 1; j < chapters.length && chapters[j].level > ch.level; j++) {
        if (chapters[j].level === ch.level + 1) {
          children.push({ num: numbers[j], title: stripEmoji(chapters[j].title || "") || "Sem título" });
        }
      }
      content.push({
        stack: [
          {
            // Nó invisível só para o sumário: garante a entrada numerada
            // ("2  Gramática") sem repetir o número no título visual da página
            text: `${numbers[i]}  ${displayTitle}`,
            fontSize: 1, opacity: 0, margin: [0, 0, 0, 0],
            tocItem: true, tocMargin: [ch.level * 14, 0, 0, 0],
          },
          {
            text: `SEÇÃO ${numbers[i]}`,
            fontSize: 10, characterSpacing: 2, color: "#999999",
            alignment: "center", margin: [0, 160, 0, 14],
          },
          {
            text: displayTitle,
            fontSize: 26, bold: true, alignment: "center",
            margin: [0, 0, 0, 20],
          },
          {
            columns: [
              { width: "*", text: "" },
              { width: 90, canvas: [{ type: "line", x1: 0, y1: 0, x2: 90, y2: 0, lineWidth: 1, lineColor: "#cccccc" }] },
              { width: "*", text: "" },
            ],
            margin: [0, 0, 0, 26],
          },
          ...(children.length
            ? [
                { text: "Nesta seção", fontSize: 9, characterSpacing: 1.5, color: "#bbbbbb", alignment: "center", margin: [0, 0, 0, 8] },
                ...children.map((c) => ({
                  text: [{ text: `${c.num}`, color: "#999999" }, { text: `   ${c.title}` }],
                  fontSize: 11.5, color: "#555555", alignment: "center", margin: [0, 2.5, 0, 2.5],
                })),
              ]
            : []),
        ],
        ...pageBreak,
      });
      return;
    }

    content.push({
      text: `${numbers[i]}  ${displayTitle}`,
      style: ch.level === 0 ? "chapter" : "section",
      tocItem: true,
      tocMargin: [ch.level * 14, 0, 0, 0],
      ...pageBreak,
    });
    content.push(...blocksToPdfContent(ch.blocks));
  });

  const docDefinition = {
    info: { title, creator: "DocumentaAI" },
    pageSize: "A4",
    pageMargins: [56, 56, 56, 56],
    footer,
    content,
    styles: STYLES,
  };
  return generateAndSave(docDefinition, `${safeFileName(title)}.pdf`);
}
