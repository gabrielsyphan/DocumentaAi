type Block = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  content?: Array<{ type: string; text?: string; styles?: Record<string, boolean>; href?: string; content?: unknown[] }>;
  children?: Block[];
};

// ── Markdown ──────────────────────────────────────────────────────────────────

function inlineToMd(items: Block["content"] = []): string {
  return items
    .map((item) => {
      if (item.type === "link") {
        const text = inlineToMd(item.content as Block["content"]);
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

function blockToMd(block: Block, depth = 0): string {
  const indent = "  ".repeat(depth);
  const inline = inlineToMd(block.content);
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
      line = "<!-- table -->";
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
