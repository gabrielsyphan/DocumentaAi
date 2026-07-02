type InlineNode =
  | { type: "text"; text: string; styles: Record<string, boolean> }
  | { type: "link"; href: string; content: Array<{ type: "text"; text: string; styles: Record<string, boolean> }> };

function parseInline(text: string): InlineNode[] {
  const result: InlineNode[] = [];
  let rest = text;

  while (rest) {
    let m: RegExpExecArray | null;

    if ((m = /^\*\*(.+?)\*\*/.exec(rest))) {
      result.push({ type: "text", text: m[1], styles: { bold: true } });
    } else if ((m = /^__(.+?)__/.exec(rest))) {
      result.push({ type: "text", text: m[1], styles: { bold: true } });
    } else if ((m = /^\*(.+?)\*/.exec(rest))) {
      result.push({ type: "text", text: m[1], styles: { italic: true } });
    } else if ((m = /^_([^_\s][^_]*[^_\s]|[^_\s])_/.exec(rest))) {
      result.push({ type: "text", text: m[1], styles: { italic: true } });
    } else if ((m = /^~~(.+?)~~/.exec(rest))) {
      result.push({ type: "text", text: m[1], styles: { strikethrough: true } });
    } else if ((m = /^`(.+?)`/.exec(rest))) {
      result.push({ type: "text", text: m[1], styles: { code: true } });
    } else if ((m = /^\[(.+?)\]\((.+?)\)/.exec(rest))) {
      result.push({ type: "link", href: m[2], content: [{ type: "text", text: m[1], styles: {} }] });
    } else {
      const idx = rest.slice(1).search(/[*_`~[\]]/) + 1;
      const take = idx > 0 ? idx : rest.length;
      const prev = result[result.length - 1];
      if (prev?.type === "text" && Object.keys(prev.styles).length === 0) {
        prev.text += rest.slice(0, take);
      } else {
        result.push({ type: "text", text: rest.slice(0, take), styles: {} });
      }
      rest = rest.slice(take);
      continue;
    }

    if (m) rest = rest.slice(m[0].length);
  }

  return result.length > 0 ? result : [{ type: "text", text: "", styles: {} }];
}

function blockProps() {
  return { textColor: "default", backgroundColor: "default", textAlignment: "left" };
}

export function markdownToBlocks(md: string): object[] {
  const lines = md.split("\n");
  const blocks: object[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim() || "text";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: "codeBlock",
        props: { ...blockProps(), language: lang },
        content: [{ type: "text", text: codeLines.join("\n"), styles: {} }],
        children: [],
      });
      i++;
      continue;
    }

    // Headings
    const hMatch = /^(#{1,3})\s+(.+)/.exec(line);
    if (hMatch) {
      blocks.push({
        type: "heading",
        props: { ...blockProps(), level: hMatch[1].length },
        content: parseInline(hMatch[2]),
        children: [],
      });
      i++;
      continue;
    }

    // Checkbox list
    const checkMatch = /^[-*]\s+\[([xX ])\]\s+(.*)/.exec(line);
    if (checkMatch) {
      blocks.push({
        type: "checkListItem",
        props: { ...blockProps(), checked: checkMatch[1].toLowerCase() === "x" },
        content: parseInline(checkMatch[2]),
        children: [],
      });
      i++;
      continue;
    }

    // Bullet list
    const bulletMatch = /^[-*+]\s+(.+)/.exec(line);
    if (bulletMatch) {
      blocks.push({
        type: "bulletListItem",
        props: blockProps(),
        content: parseInline(bulletMatch[1]),
        children: [],
      });
      i++;
      continue;
    }

    // Numbered list
    const numMatch = /^\d+\.\s+(.+)/.exec(line);
    if (numMatch) {
      blocks.push({
        type: "numberedListItem",
        props: blockProps(),
        content: parseInline(numMatch[1]),
        children: [],
      });
      i++;
      continue;
    }

    // Blockquote → paragraph
    const quoteMatch = /^>\s*(.*)/.exec(line);
    if (quoteMatch) {
      if (quoteMatch[1]) {
        blocks.push({
          type: "paragraph",
          props: blockProps(),
          content: parseInline(quoteMatch[1]),
          children: [],
        });
      }
      i++;
      continue;
    }

    // Horizontal rule → skip
    if (/^---+$/.test(line.trim())) { i++; continue; }

    // Empty line → skip
    if (!line.trim()) { i++; continue; }

    // Default: paragraph
    blocks.push({
      type: "paragraph",
      props: blockProps(),
      content: parseInline(line),
      children: [],
    });
    i++;
  }

  // Ensure at least one block
  if (blocks.length === 0) {
    blocks.push({
      type: "paragraph",
      props: blockProps(),
      content: [{ type: "text", text: "", styles: {} }],
      children: [],
    });
  }

  return blocks;
}
