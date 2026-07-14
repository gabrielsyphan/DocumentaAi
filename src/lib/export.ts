type InlineItem = { type: string; text?: string; styles?: Record<string, boolean>; href?: string; content?: unknown[] };
// Células podem ser objeto { content } (formato atual) ou array de inlines (formato antigo)
type TableCell = { content?: InlineItem[] } | InlineItem[];
type TableContent = { type: "tableContent"; rows?: { cells?: TableCell[] }[] };
type Block = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  // Blocos de tabela têm content como objeto (tableContent), não array de inlines
  content?: InlineItem[] | TableContent;
  children?: Block[];
};

// ── Markdown ──────────────────────────────────────────────────────────────────

function inlineToMd(items: InlineItem[] = []): string {
  return items
    .map((item) => {
      if (item.type === "link") {
        const text = inlineToMd(item.content as InlineItem[]);
        return `[${text}](${item.href ?? ""})`;
      }
      if (item.type !== "text" || !item.text) return "";
      let t = item.text;
      if (item.styles?.bold)          t = `**${t}**`;
      if (item.styles?.italic)        t = `*${t}*`;
      if (item.styles?.strike)        t = `~~${t}~~`;
      if (item.styles?.code)          t = `\`${t}\``;
      if (item.styles?.underline)     t = `<u>${t}</u>`;
      return t;
    })
    .join("");
}

function cellToMd(cell: TableCell): string {
  return inlineToMd(Array.isArray(cell) ? cell : cell?.content ?? []);
}

function tableToMd(table: TableContent): string {
  const rows = table.rows ?? [];
  return rows
    .flatMap((row, i) => {
      const line = `| ${(row.cells ?? []).map(cellToMd).join(" | ")} |`;
      // Separador de cabeçalho após a primeira linha (obrigatório em Markdown)
      return i === 0 ? [line, `|${(row.cells ?? []).map(() => " --- ").join("|")}|`] : [line];
    })
    .join("\n");
}

function blockToMd(block: Block, depth = 0): string {
  const indent = "  ".repeat(depth);
  const inline = Array.isArray(block.content) ? inlineToMd(block.content) : "";
  const children = (block.children ?? []).map((c) => blockToMd(c, depth + 1)).join("\n");

  let line = "";
  switch (block.type) {
    case "heading": {
      const level = (block.props?.level as number) ?? 1;
      line = `${"#".repeat(level)} ${inline}`;
      break;
    }
    case "bulletListItem":
      line = `${indent}- ${inline}`;
      break;
    case "numberedListItem":
      line = `${indent}1. ${inline}`;
      break;
    case "checkListItem": {
      const checked = block.props?.checked ? "x" : " ";
      line = `${indent}- [${checked}] ${inline}`;
      break;
    }
    case "quote":
      line = `> ${inline}`;
      break;
    case "codeBlock": {
      const lang = (block.props?.language as string) ?? "";
      line = `\`\`\`${lang}\n${inline}\n\`\`\``;
      break;
    }
    case "image":
      line = `![image](${block.props?.url ?? ""})`;
      break;
    case "table":
      line = !Array.isArray(block.content) && block.content?.type === "tableContent"
        ? tableToMd(block.content)
        : "";
      break;
    default:
      line = inline;
  }

  return [line, children].filter(Boolean).join("\n");
}

export function blocksToMarkdown(title: string, blocks: Block[]): string {
  const body = blocks.map((b) => blockToMd(b)).filter(Boolean).join("\n\n");
  return `# ${title}\n\n${body}`;
}

export function downloadMarkdown(title: string, blocks: Block[]): void {
  const md = blocksToMarkdown(title, blocks);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9\-_. ]/gi, "_")}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── PDF (via print) ───────────────────────────────────────────────────────────

export function printToPdf(title: string): void {
  const original = document.title;
  document.title = title;
  window.print();
  document.title = original;
}
