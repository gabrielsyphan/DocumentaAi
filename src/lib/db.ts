import Database from "@tauri-apps/plugin-sql";
import type { Page, PageVersion } from "../types";

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
        deleted_at  TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )
    `);
    for (const migration of [
      "ALTER TABLE pages ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE pages ADD COLUMN type TEXT NOT NULL DEFAULT 'document'",
      "ALTER TABLE pages ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'",
      "ALTER TABLE pages ADD COLUMN deleted_at TEXT",
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
    // Auto-limpeza: remove páginas deletadas há mais de 30 dias
    await db.execute(
      `DELETE FROM pages WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-30 days')`
    );
  }
  return db;
}

type RawPage = Omit<Page, "tags"> & { tags: string | null };

export async function fetchAllPages(): Promise<Page[]> {
  const database = await getDb();
  const rows = await database.select<RawPage[]>(
    "SELECT * FROM pages WHERE deleted_at IS NULL ORDER BY order_index ASC"
  );
  return rows.map((row) => ({
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
    deleted_at: null,
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
  }));
}

export async function upsertPage(page: Page): Promise<void> {
  const database = await getDb();
  await database.execute(
    `INSERT INTO pages (id, parent_id, title, emoji, content, order_index, is_favorite, type, tags, deleted_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT(id) DO UPDATE SET
       parent_id   = excluded.parent_id,
       title       = excluded.title,
       emoji       = excluded.emoji,
       content     = excluded.content,
       order_index = excluded.order_index,
       is_favorite = excluded.is_favorite,
       type        = excluded.type,
       tags        = excluded.tags,
       deleted_at  = excluded.deleted_at,
       updated_at  = excluded.updated_at`,
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
      page.created_at,
      page.updated_at,
    ]
  );
}

export async function softDeletePage(id: string): Promise<void> {
  const database = await getDb();
  await database.execute(
    "UPDATE pages SET deleted_at = datetime('now') WHERE id = $1",
    [id]
  );
}

export async function restorePageFromTrash(id: string): Promise<void> {
  const database = await getDb();
  await database.execute(
    "UPDATE pages SET deleted_at = NULL WHERE id = $1",
    [id]
  );
}

export async function removePage(id: string): Promise<void> {
  const database = await getDb();
  await database.execute("DELETE FROM pages WHERE id = $1", [id]);
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
