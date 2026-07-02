import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ── Database path ──────────────────────────────────────────────────────────────

function getDbPath(): string {
  // Explicit override always wins
  if (process.env.DOCUMENTAAI_DB_PATH) {
    if (existsSync(process.env.DOCUMENTAAI_DB_PATH)) return process.env.DOCUMENTAAI_DB_PATH;
    throw new Error(`DOCUMENTAAI_DB_PATH is set to '${process.env.DOCUMENTAAI_DB_PATH}' but the file was not found.`);
  }

  const home = homedir();
  const candidates = [
    // macOS
    join(home, "Library", "Application Support", "com.documentaai.app", "documentaai.db"),
    // Linux — XDG data dir (Tauri default)
    join(process.env.XDG_DATA_HOME ?? join(home, ".local", "share"), "com.documentaai.app", "documentaai.db"),
    // Linux — XDG config dir (some distros / Tauri versions)
    join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "com.documentaai.app", "documentaai.db"),
    // Windows — Roaming AppData
    join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "com.documentaai.app", "documentaai.db"),
    // Windows — Local AppData (less common but possible)
    join(process.env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "com.documentaai.app", "documentaai.db"),
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  throw new Error(
    `DocumentaAI database not found.\n` +
    `Make sure the app has been opened at least once.\n\n` +
    `To locate the database manually:\n` +
    `  Linux/macOS: find ~ -name "documentaai.db" 2>/dev/null\n` +
    `  Windows (PowerShell): Get-ChildItem -Recurse -Filter documentaai.db $env:APPDATA\n\n` +
    `Then set DOCUMENTAAI_DB_PATH in your MCP client config:\n` +
    `  { "env": { "DOCUMENTAAI_DB_PATH": "/absolute/path/to/documentaai.db" } }\n\n` +
    `Paths searched:\n${candidates.join("\n")}`
  );
}

let _db: Database.Database | undefined;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(getDbPath());
    _db.pragma("journal_mode = WAL");
  }
  return _db;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Page {
  id: string;
  parent_id: string | null;
  title: string;
  emoji: string | null;
  content: string | null;
  order_index: number;
  is_favorite: number;
  type: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function parsedContent(content: string | null): unknown {
  if (!content) return [];
  try { return JSON.parse(content); } catch { return content; }
}

function parseTags(raw: string | null): string[] {
  try { return JSON.parse(raw ?? "[]"); } catch { return []; }
}

function pageToText(page: Page): string {
  const tags = parseTags(page.tags);
  return [
    `id: ${page.id}`,
    `title: ${page.emoji ? page.emoji + " " : ""}${page.title}`,
    `type: ${page.type ?? "document"}`,
    `parent_id: ${page.parent_id ?? "none"}`,
    `tags: ${tags.length ? tags.join(", ") : "none"}`,
    `favorite: ${page.is_favorite ? "yes" : "no"}`,
    `created_at: ${page.created_at}`,
    `updated_at: ${page.updated_at}`,
  ].join("\n");
}

function extractPlainText(content: string | null): string {
  if (!content) return "";
  try {
    const blocks = JSON.parse(content) as Array<{
      type: string;
      content?: Array<{ type: string; text?: string }>;
    }>;
    const TEXT_BLOCK_TYPES = new Set([
      "paragraph", "heading", "bulletListItem", "numberedListItem",
      "checkListItem", "quote",
    ]);
    return blocks
      .filter((b) => TEXT_BLOCK_TYPES.has(b.type))
      .map((b) =>
        (b.content ?? [])
          .filter((i) => i.type === "text")
          .map((i) => i.text ?? "")
          .join("")
      )
      .filter(Boolean)
      .join("\n");
  } catch {
    return content;
  }
}

function formatPageLine(p: Page, indent = 0): string {
  const prefix = "  ".repeat(indent) + "•";
  const tags = parseTags(p.tags);
  const tagStr = tags.length ? ` [${tags.join(", ")}]` : "";
  const typeStr = p.type && p.type !== "document" ? ` (${p.type})` : "";
  return `${prefix} [${p.id}] ${p.emoji ? p.emoji + " " : ""}${p.title}${typeStr}${tagStr}${p.is_favorite ? " ⭐" : ""}`;
}

function appendBlock(existing: string | null, text: string): string {
  const newBlock = {
    id: randomUUID(),
    type: "paragraph",
    props: { textColor: "default", backgroundColor: "default", textAlignment: "left" },
    content: [{ type: "text", text, styles: {} }],
    children: [],
  };
  const blocks = (() => { try { return JSON.parse(existing ?? "[]"); } catch { return []; } })();
  return JSON.stringify([...blocks, newBlock]);
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "list_pages",
    description: "List all pages. Returns id, title, emoji, type, tags, parent_id and favorite status.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_children",
    description: "List direct children of a page, or all root-level pages if no parent_id given. Use this to navigate the page hierarchy.",
    inputSchema: {
      type: "object",
      properties: {
        parent_id: { type: "string", description: "UUID of the parent page. Omit to list root pages." },
      },
    },
  },
  {
    name: "get_page",
    description: "Get the full content of a page by id. Returns metadata, plain text and BlockNote JSON. Canvas pages return Excalidraw JSON.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Page UUID" },
      },
      required: ["id"],
    },
  },
  {
    name: "search_pages",
    description: "Search pages by title (case-insensitive).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to search in page titles" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_content",
    description: "Full-text search across page titles AND content. Returns pages that contain the query anywhere.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to search in titles and content" },
      },
      required: ["query"],
    },
  },
  {
    name: "create_page",
    description: "Create a new page. Content can be BlockNote JSON or plain text. Use type='daily' for daily notes, type='canvas' for whiteboards.",
    inputSchema: {
      type: "object",
      properties: {
        title:     { type: "string",  description: "Page title" },
        content:   { type: "string",  description: "BlockNote JSON array or plain text" },
        parent_id: { type: "string",  description: "Parent page UUID (omit for root page)" },
        emoji:     { type: "string",  description: "Single emoji icon (optional)" },
        type:      { type: "string",  description: "'document' (default), 'daily', or 'canvas'" },
        tags:      { type: "array", items: { type: "string" }, description: "Initial tags (optional)" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_page",
    description: "Update an existing page's title, content, emoji or tags.",
    inputSchema: {
      type: "object",
      properties: {
        id:      { type: "string", description: "Page UUID" },
        title:   { type: "string", description: "New title (optional)" },
        content: { type: "string", description: "New content as BlockNote JSON (optional)" },
        emoji:   { type: "string", description: "New emoji icon (optional)" },
        tags:    { type: "array", items: { type: "string" }, description: "Replace all tags (optional)" },
      },
      required: ["id"],
    },
  },
  {
    name: "append_to_page",
    description: "Append one or more lines of text to an existing page without overwriting the existing content.",
    inputSchema: {
      type: "object",
      properties: {
        id:    { type: "string", description: "Page UUID" },
        lines: { type: "array", items: { type: "string" }, description: "Lines of text to append" },
      },
      required: ["id", "lines"],
    },
  },
  {
    name: "move_page",
    description: "Move a page to a different parent (reorganize hierarchy) and/or reorder it among siblings.",
    inputSchema: {
      type: "object",
      properties: {
        id:              { type: "string", description: "Page UUID to move" },
        parent_id:       { type: "string", description: "New parent UUID. Pass null to move to root." },
        order_before_id: { type: "string", description: "Place this page before the page with this UUID (optional). Omit to append at the end." },
      },
      required: ["id"],
    },
  },
  {
    name: "manage_tags",
    description: "Add or remove tags from a page without replacing all tags.",
    inputSchema: {
      type: "object",
      properties: {
        id:     { type: "string", description: "Page UUID" },
        add:    { type: "array", items: { type: "string" }, description: "Tags to add" },
        remove: { type: "array", items: { type: "string" }, description: "Tags to remove" },
      },
      required: ["id"],
    },
  },
  {
    name: "get_daily_note",
    description: "Get or create the daily note for a given date. If the note doesn't exist it is created automatically.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD format. Defaults to today." },
      },
    },
  },
  {
    name: "delete_page",
    description: "Delete a page and all its subpages (cascade).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Page UUID to delete" },
      },
      required: ["id"],
    },
  },
] as const;

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "documentaai", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  let db: Database.Database;
  try {
    db = getDb();
  } catch (e) {
    return {
      content: [{
        type: "text",
        text: `[DocumentaAI MCP] Não foi possível conectar ao banco de dados:\n${e instanceof Error ? e.message : String(e)}`,
      }],
      isError: true,
    };
  }

  switch (name) {

    case "list_pages": {
      const pages = db.prepare("SELECT * FROM pages ORDER BY order_index ASC").all() as Page[];
      const text = pages.map((p) => formatPageLine(p)).join("\n");
      return { content: [{ type: "text", text: pages.length ? text : "No pages found." }] };
    }

    case "list_children": {
      const { parent_id } = args as { parent_id?: string };
      const pages = parent_id
        ? db.prepare("SELECT * FROM pages WHERE parent_id = ? ORDER BY order_index ASC").all(parent_id) as Page[]
        : db.prepare("SELECT * FROM pages WHERE parent_id IS NULL ORDER BY order_index ASC").all() as Page[];

      if (!pages.length) {
        return { content: [{ type: "text", text: parent_id ? "No children found." : "No root pages found." }] };
      }
      // For each result, show how many children it has
      const text = pages.map((p) => {
        const childCount = (db.prepare("SELECT COUNT(*) as c FROM pages WHERE parent_id = ?").get(p.id) as { c: number }).c;
        const suffix = childCount > 0 ? ` → ${childCount} subpage${childCount > 1 ? "s" : ""}` : "";
        return formatPageLine(p) + suffix;
      }).join("\n");
      return { content: [{ type: "text", text }] };
    }

    case "get_page": {
      const { id } = args as { id: string };
      const page = db.prepare("SELECT * FROM pages WHERE id = ?").get(id) as Page | undefined;
      if (!page) return { content: [{ type: "text", text: `Page not found: ${id}` }], isError: true };

      const isCanvas = page.type === "canvas";
      const plainText = isCanvas ? "(canvas — see JSON below)" : extractPlainText(page.content);
      const text = [
        pageToText(page),
        "",
        isCanvas ? "── Excalidraw JSON ──" : "── Plain text ──",
        plainText || "(empty)",
        "",
        isCanvas ? "" : "── BlockNote JSON ──",
        isCanvas ? "" : JSON.stringify(parsedContent(page.content), null, 2),
      ].filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
      return { content: [{ type: "text", text }] };
    }

    case "search_pages": {
      const { query } = args as { query: string };
      const pages = db
        .prepare("SELECT * FROM pages WHERE title LIKE ? ORDER BY order_index ASC")
        .all(`%${query}%`) as Page[];
      const text = pages.map((p) => formatPageLine(p)).join("\n");
      return { content: [{ type: "text", text: pages.length ? text : `No pages matching "${query}".` }] };
    }

    case "search_content": {
      const { query } = args as { query: string };
      const q = query.toLowerCase();
      const all = db.prepare("SELECT * FROM pages").all() as Page[];
      const matches = all.filter((p) => {
        if (p.title.toLowerCase().includes(q)) return true;
        if (p.type === "canvas") return false; // skip Excalidraw binary-ish JSON
        return extractPlainText(p.content).toLowerCase().includes(q);
      });
      if (!matches.length) return { content: [{ type: "text", text: `No results for "${query}".` }] };
      const text = matches.map((p) => {
        const snippet = extractPlainText(p.content)
          .split("\n")
          .find((l) => l.toLowerCase().includes(q));
        return formatPageLine(p) + (snippet ? `\n    ↳ …${snippet.slice(0, 80)}…` : "");
      }).join("\n");
      return { content: [{ type: "text", text }] };
    }

    case "create_page": {
      const { title, content, parent_id, emoji, type, tags } = args as {
        title: string;
        content?: string;
        parent_id?: string;
        emoji?: string;
        type?: string;
        tags?: string[];
      };

      const maxOrder = (
        db.prepare("SELECT MAX(order_index) as m FROM pages WHERE parent_id IS ?")
          .get(parent_id ?? null) as { m: number | null }
      ).m ?? 0;

      const id = randomUUID();
      const ts = now();

      let finalContent = content ?? null;
      if (content && !content.trim().startsWith("[")) {
        finalContent = JSON.stringify([
          { id: randomUUID(), type: "paragraph", props: { textColor: "default", backgroundColor: "default", textAlignment: "left" }, content: [{ type: "text", text: content, styles: {} }], children: [] },
        ]);
      }

      db.prepare(
        `INSERT INTO pages (id, parent_id, title, emoji, content, order_index, is_favorite, type, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
      ).run(id, parent_id ?? null, title, emoji ?? null, finalContent, maxOrder + 1, type ?? "document", JSON.stringify(tags ?? []), ts, ts);

      return { content: [{ type: "text", text: `Page created.\nid: ${id}\ntitle: ${title}` }] };
    }

    case "update_page": {
      const { id, title, content, emoji, tags } = args as {
        id: string;
        title?: string;
        content?: string;
        emoji?: string;
        tags?: string[];
      };

      const page = db.prepare("SELECT * FROM pages WHERE id = ?").get(id) as Page | undefined;
      if (!page) return { content: [{ type: "text", text: `Page not found: ${id}` }], isError: true };

      db.prepare(
        "UPDATE pages SET title = ?, emoji = ?, content = ?, tags = ?, updated_at = ? WHERE id = ?"
      ).run(
        title ?? page.title,
        emoji !== undefined ? emoji : page.emoji,
        content !== undefined ? content : page.content,
        tags !== undefined ? JSON.stringify(tags) : page.tags,
        now(),
        id
      );

      return { content: [{ type: "text", text: `Page updated.\nid: ${id}\ntitle: ${title ?? page.title}` }] };
    }

    case "append_to_page": {
      const { id, lines } = args as { id: string; lines: string[] };
      const page = db.prepare("SELECT * FROM pages WHERE id = ?").get(id) as Page | undefined;
      if (!page) return { content: [{ type: "text", text: `Page not found: ${id}` }], isError: true };
      if (page.type === "canvas") return { content: [{ type: "text", text: "Cannot append text to a canvas page." }], isError: true };

      let content = page.content;
      for (const line of lines) {
        content = appendBlock(content, line);
      }

      db.prepare("UPDATE pages SET content = ?, updated_at = ? WHERE id = ?").run(content, now(), id);
      return { content: [{ type: "text", text: `Appended ${lines.length} line(s) to "${page.title}".` }] };
    }

    case "move_page": {
      const { id, parent_id, order_before_id } = args as {
        id: string;
        parent_id?: string | null;
        order_before_id?: string;
      };

      const page = db.prepare("SELECT * FROM pages WHERE id = ?").get(id) as Page | undefined;
      if (!page) return { content: [{ type: "text", text: `Page not found: ${id}` }], isError: true };

      // Prevent moving a page into one of its own descendants
      if (parent_id) {
        let cursor = parent_id;
        while (cursor) {
          if (cursor === id) return { content: [{ type: "text", text: "Cannot move a page into one of its own subpages." }], isError: true };
          const p = db.prepare("SELECT parent_id FROM pages WHERE id = ?").get(cursor) as { parent_id: string | null } | undefined;
          cursor = p?.parent_id ?? "";
        }
      }

      const targetParent = parent_id !== undefined ? (parent_id ?? null) : page.parent_id;

      let orderIndex: number;
      if (order_before_id) {
        const ref = db.prepare("SELECT order_index FROM pages WHERE id = ?").get(order_before_id) as { order_index: number } | undefined;
        orderIndex = ref ? ref.order_index - 0.5 : page.order_index;
      } else {
        const maxOrder = (db.prepare("SELECT MAX(order_index) as m FROM pages WHERE parent_id IS ?").get(targetParent ?? null) as { m: number | null }).m ?? 0;
        orderIndex = maxOrder + 1;
      }

      db.prepare("UPDATE pages SET parent_id = ?, order_index = ?, updated_at = ? WHERE id = ?")
        .run(targetParent, orderIndex, now(), id);

      const dest = targetParent
        ? (db.prepare("SELECT title FROM pages WHERE id = ?").get(targetParent) as { title: string } | undefined)?.title ?? targetParent
        : "root";
      return { content: [{ type: "text", text: `"${page.title}" moved to ${dest}.` }] };
    }

    case "manage_tags": {
      const { id, add, remove } = args as { id: string; add?: string[]; remove?: string[] };
      const page = db.prepare("SELECT * FROM pages WHERE id = ?").get(id) as Page | undefined;
      if (!page) return { content: [{ type: "text", text: `Page not found: ${id}` }], isError: true };

      let tags = parseTags(page.tags);
      if (add?.length)    tags = [...new Set([...tags, ...add])];
      if (remove?.length) tags = tags.filter((t) => !remove.includes(t));

      db.prepare("UPDATE pages SET tags = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(tags), now(), id);
      return { content: [{ type: "text", text: `Tags updated for "${page.title}".\nCurrent tags: ${tags.length ? tags.join(", ") : "none"}` }] };
    }

    case "get_daily_note": {
      const { date } = args as { date?: string };
      const dateStr = date ?? new Date().toISOString().slice(0, 10);

      const existing = db.prepare("SELECT * FROM pages WHERE title = ? AND type = 'daily'").get(dateStr) as Page | undefined;
      if (existing) {
        const plainText = extractPlainText(existing.content);
        const text = [
          pageToText(existing),
          "",
          "── Content ──",
          plainText || "(empty)",
        ].join("\n");
        return { content: [{ type: "text", text: `Daily note found.\n\n${text}` }] };
      }

      // Create it
      const id = randomUUID();
      const ts = now();
      const maxOrder = (db.prepare("SELECT MAX(order_index) as m FROM pages WHERE parent_id IS NULL").get() as { m: number | null }).m ?? 0;
      db.prepare(
        `INSERT INTO pages (id, parent_id, title, emoji, content, order_index, is_favorite, type, tags, created_at, updated_at)
         VALUES (?, NULL, ?, '📅', NULL, ?, 0, 'daily', '[]', ?, ?)`
      ).run(id, dateStr, maxOrder + 1, ts, ts);

      return { content: [{ type: "text", text: `Daily note created for ${dateStr}.\nid: ${id}` }] };
    }

    case "delete_page": {
      const { id } = args as { id: string };
      const page = db.prepare("SELECT id, title FROM pages WHERE id = ?").get(id) as Pick<Page, "id" | "title"> | undefined;
      if (!page) return { content: [{ type: "text", text: `Page not found: ${id}` }], isError: true };
      db.prepare("DELETE FROM pages WHERE id = ?").run(id);
      return { content: [{ type: "text", text: `Page "${page.title}" (${id}) deleted.` }] };
    }

    default:
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
