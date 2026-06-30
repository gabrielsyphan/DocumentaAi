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
  const candidates = [
    // macOS
    join(homedir(), "Library", "Application Support", "com.documentaai.app", "documentaai.db"),
    // Linux (XDG)
    join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "com.documentaai.app", "documentaai.db"),
    // Windows
    join(process.env.APPDATA ?? "", "com.documentaai.app", "documentaai.db"),
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  // Allow override via env var
  if (process.env.DOCUMENTAAI_DB_PATH && existsSync(process.env.DOCUMENTAAI_DB_PATH)) {
    return process.env.DOCUMENTAAI_DB_PATH;
  }

  throw new Error(
    `DocumentaAI database not found. Open the app at least once, or set DOCUMENTAAI_DB_PATH.\nSearched:\n${candidates.join("\n")}`
  );
}

const db = new Database(getDbPath());
db.pragma("journal_mode = WAL"); // safe for concurrent access with the app

// ── Types ─────────────────────────────────────────────────────────────────────

interface Page {
  id: string;
  parent_id: string | null;
  title: string;
  emoji: string | null;
  content: string | null;
  order_index: number;
  is_favorite: number;
  created_at: string;
  updated_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function parsedContent(content: string | null): unknown {
  if (!content) return [];
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

function pageToText(page: Page): string {
  const lines: string[] = [
    `id: ${page.id}`,
    `title: ${page.emoji ? page.emoji + " " : ""}${page.title}`,
    `parent_id: ${page.parent_id ?? "none"}`,
    `favorite: ${page.is_favorite ? "yes" : "no"}`,
    `created_at: ${page.created_at}`,
    `updated_at: ${page.updated_at}`,
  ];
  return lines.join("\n");
}

function extractPlainText(content: string | null): string {
  if (!content) return "";
  try {
    const blocks = JSON.parse(content) as Array<{
      type: string;
      content?: Array<{ type: string; text?: string }>;
      children?: unknown[];
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

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "list_pages",
    description: "List all pages in DocumentaAI. Returns id, title, emoji, parent_id and favorite status.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_page",
    description: "Get the full content of a page by its id. Content is returned as BlockNote JSON and as plain text.",
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
    description: "Search pages by title (case-insensitive substring match).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to search in page titles" },
      },
      required: ["query"],
    },
  },
  {
    name: "create_page",
    description: "Create a new page. Content should be BlockNote JSON (array of blocks) or plain text.",
    inputSchema: {
      type: "object",
      properties: {
        title:     { type: "string", description: "Page title" },
        content:   { type: "string", description: "BlockNote JSON string or plain text" },
        parent_id: { type: "string", description: "Parent page UUID (optional — omit for root page)" },
        emoji:     { type: "string", description: "Single emoji for the page icon (optional)" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_page",
    description: "Update the title and/or content of an existing page.",
    inputSchema: {
      type: "object",
      properties: {
        id:      { type: "string", description: "Page UUID to update" },
        title:   { type: "string", description: "New title (optional)" },
        content: { type: "string", description: "New content as BlockNote JSON string (optional)" },
        emoji:   { type: "string", description: "New emoji icon (optional)" },
      },
      required: ["id"],
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
  { name: "documentaai", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  switch (name) {
    case "list_pages": {
      const pages = db.prepare("SELECT * FROM pages ORDER BY order_index ASC").all() as Page[];
      const text = pages
        .map((p) => `• [${p.id}] ${p.emoji ? p.emoji + " " : ""}${p.title}${p.parent_id ? ` (subpage of ${p.parent_id})` : ""}${p.is_favorite ? " ⭐" : ""}`)
        .join("\n");
      return {
        content: [{ type: "text", text: pages.length ? text : "No pages found." }],
      };
    }

    case "get_page": {
      const { id } = args as { id: string };
      const page = db.prepare("SELECT * FROM pages WHERE id = ?").get(id) as Page | undefined;
      if (!page) {
        return { content: [{ type: "text", text: `Page not found: ${id}` }], isError: true };
      }
      const plainText = extractPlainText(page.content);
      const text = [
        pageToText(page),
        "",
        "── Plain text ──",
        plainText || "(empty)",
        "",
        "── BlockNote JSON ──",
        JSON.stringify(parsedContent(page.content), null, 2),
      ].join("\n");
      return { content: [{ type: "text", text }] };
    }

    case "search_pages": {
      const { query } = args as { query: string };
      const pages = db
        .prepare("SELECT * FROM pages WHERE title LIKE ? ORDER BY order_index ASC")
        .all(`%${query}%`) as Page[];
      const text = pages
        .map((p) => `• [${p.id}] ${p.emoji ? p.emoji + " " : ""}${p.title}`)
        .join("\n");
      return {
        content: [{ type: "text", text: pages.length ? text : `No pages matching "${query}".` }],
      };
    }

    case "create_page": {
      const { title, content, parent_id, emoji } = args as {
        title: string;
        content?: string;
        parent_id?: string;
        emoji?: string;
      };

      // Determine max order_index among siblings
      const maxOrder = (
        db
          .prepare("SELECT MAX(order_index) as m FROM pages WHERE parent_id IS ?")
          .get(parent_id ?? null) as { m: number | null }
      ).m ?? 0;

      const id = randomUUID();
      const ts = now();

      // If content looks like plain text (not JSON), wrap in a paragraph block
      let finalContent = content ?? null;
      if (content && !content.trim().startsWith("[")) {
        finalContent = JSON.stringify([
          { id: randomUUID(), type: "paragraph", props: { textColor: "default", backgroundColor: "default", textAlignment: "left" }, content: [{ type: "text", text: content, styles: {} }], children: [] },
        ]);
      }

      db.prepare(
        `INSERT INTO pages (id, parent_id, title, emoji, content, order_index, is_favorite, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
      ).run(id, parent_id ?? null, title, emoji ?? null, finalContent, maxOrder + 1, ts, ts);

      return {
        content: [{ type: "text", text: `Page created.\nid: ${id}\ntitle: ${title}` }],
      };
    }

    case "update_page": {
      const { id, title, content, emoji } = args as {
        id: string;
        title?: string;
        content?: string;
        emoji?: string;
      };

      const page = db.prepare("SELECT * FROM pages WHERE id = ?").get(id) as Page | undefined;
      if (!page) {
        return { content: [{ type: "text", text: `Page not found: ${id}` }], isError: true };
      }

      const newTitle   = title   ?? page.title;
      const newEmoji   = emoji   !== undefined ? emoji   : page.emoji;
      const newContent = content !== undefined ? content : page.content;

      db.prepare(
        "UPDATE pages SET title = ?, emoji = ?, content = ?, updated_at = ? WHERE id = ?"
      ).run(newTitle, newEmoji, newContent, now(), id);

      return {
        content: [{ type: "text", text: `Page updated.\nid: ${id}\ntitle: ${newTitle}` }],
      };
    }

    case "delete_page": {
      const { id } = args as { id: string };
      const page = db.prepare("SELECT id, title FROM pages WHERE id = ?").get(id) as Pick<Page, "id" | "title"> | undefined;
      if (!page) {
        return { content: [{ type: "text", text: `Page not found: ${id}` }], isError: true };
      }
      // ON DELETE CASCADE handles subpages automatically
      db.prepare("DELETE FROM pages WHERE id = ?").run(id);
      return {
        content: [{ type: "text", text: `Page "${page.title}" (${id}) deleted.` }],
      };
    }

    default:
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
