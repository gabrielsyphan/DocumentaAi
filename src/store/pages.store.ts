import { create } from "zustand";
import type { Page, PageWithChildren } from "../types";
import { fetchAllPages, fetchTrash, upsertPage, softDeletePage, restorePageFromTrash, removePage } from "../lib/db";

// Coleta o id e todos os descendentes hierárquicos (subpáginas, sub-subpáginas...)
function collectDescendantIds(pages: Page[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of pages) {
      if (p.parent_id && ids.has(p.parent_id) && !ids.has(p.id)) {
        ids.add(p.id);
        changed = true;
      }
    }
  }
  return ids;
}

function isDailyNoteEmpty(content: string | null): boolean {
  if (!content) return true;
  try {
    const blocks = JSON.parse(content);
    if (!Array.isArray(blocks) || blocks.length === 0) return true;
    // Único parágrafo vazio = editor abriu mas nunca foi digitado nada
    if (blocks.length === 1) {
      const b = blocks[0];
      if ((b.type === "paragraph") && (!b.content || b.content.length === 0)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function buildTree(pages: Page[]): PageWithChildren[] {
  const sorted = [...pages].sort((a, b) => a.order_index - b.order_index);
  const map = new Map<string, PageWithChildren>();
  const roots: PageWithChildren[] = [];

  sorted.forEach((p) => map.set(p.id, { ...p, children: [] }));
  sorted.forEach((p) => {
    const node = map.get(p.id)!;
    if (p.parent_id && map.has(p.parent_id)) {
      map.get(p.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

interface PagesState {
  pages: Page[];
  tree: PageWithChildren[];
  trash: Page[];
  selectedPageId: string | null;
  navHistory: string[];
  navIndex: number;
  loading: boolean;
  load: () => Promise<void>;
  loadTrash: () => Promise<void>;
  createPage: (parentId?: string, overrides?: { title?: string; emoji?: string; content?: string; type?: Page["type"] }) => Promise<Page>;
  createDailyNote: (dateStr?: string) => Promise<Page>;
  updatePage: (id: string, updates: Partial<Page>) => Promise<void>;
  trashPage: (id: string) => Promise<void>;
  restorePage: (id: string) => Promise<void>;
  permanentDeletePage: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  movePage: (draggedId: string, targetId: string, position: "before" | "after" | "inside") => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  selectPage: (id: string | null) => void;
  navBack: () => void;
  navForward: () => void;
}

export const usePagesStore = create<PagesState>((set, get) => {
  // Daily note criada mas nunca digitada → descarta ao sair dela.
  // Centralizado aqui para valer em TODOS os caminhos de navegação:
  // clicar numa página, trocar de dia no calendário, ⌘N, ⌘[ / ⌘] etc.
  function discardIfEmptyDaily(prevId: string | null) {
    if (!prevId) return;
    const prev = get().pages.find((p) => p.id === prevId);
    if (!prev || prev.type !== "daily" || !isDailyNoteEmpty(prev.content)) return;
    removePage(prevId).then(() => {
      const { pages, navHistory, navIndex } = get();
      const updated = pages.filter((p) => p.id !== prevId);
      // Tira a página descartada do histórico para ⌘[ / ⌘] não caírem numa página que não existe mais
      const newHistory = navHistory.filter((h) => h !== prevId);
      const removedBefore = navHistory.slice(0, navIndex + 1).filter((h) => h === prevId).length;
      set({
        pages: updated,
        tree: buildTree(updated.filter((p) => p.type !== "daily")),
        navHistory: newHistory,
        navIndex: Math.min(Math.max(navIndex - removedBefore, 0), newHistory.length - 1),
      });
    });
  }

  return {
  pages: [],
  tree: [],
  trash: [],
  selectedPageId: null,
  navHistory: [],
  navIndex: -1,
  loading: false,

  load: async () => {
    set({ loading: true });
    const pages = await fetchAllPages();
    set({ pages, tree: buildTree(pages.filter((p) => p.type !== "daily")), loading: false });
  },

  loadTrash: async () => {
    const trash = await fetchTrash();
    set({ trash });
  },

  createPage: async (parentId, overrides) => {
    const now = new Date().toISOString();
    const page: Page = {
      id: crypto.randomUUID(),
      parent_id: parentId ?? null,
      title: overrides?.title ?? "Sem título",
      emoji: overrides?.emoji ?? null,
      content: overrides?.content ?? null,
      order_index: Date.now(),
      is_favorite: 0,
      type: overrides?.type ?? "document",
      tags: [],
      deleted_at: null,
      reminder_date: null,
      created_at: now,
      updated_at: now,
    };
    await upsertPage(page);
    const pages = [...get().pages, page];
    set({ pages, tree: buildTree(pages.filter((p) => p.type !== "daily")) });
    // Seleciona via selectPage para descartar daily vazia anterior e registrar no histórico
    get().selectPage(page.id);
    return page;
  },

  createDailyNote: async (dateStr) => {
    const date = dateStr ?? new Date().toISOString().slice(0, 10);
    const { pages } = get();
    const existing = pages.find((p) => p.type === "daily" && p.title === date);
    if (existing) {
      get().selectPage(existing.id);
      return existing;
    }
    const now = new Date().toISOString();
    const page: Page = {
      id: crypto.randomUUID(),
      parent_id: null,
      title: date,
      emoji: null,
      content: null,
      order_index: Date.now(),
      is_favorite: 0,
      type: "daily",
      tags: [],
      deleted_at: null,
      reminder_date: null,
      created_at: now,
      updated_at: now,
    };
    await upsertPage(page);
    const newPages = [...pages, page];
    set({ pages: newPages, tree: buildTree(newPages.filter((p) => p.type !== "daily")) });
    get().selectPage(page.id);
    return page;
  },

  updatePage: async (id, updates) => {
    const pages = get().pages.map((p) =>
      p.id === id ? { ...p, ...updates, updated_at: new Date().toISOString() } : p
    );
    const updated = pages.find((p) => p.id === id)!;
    await upsertPage(updated);
    set({ pages, tree: buildTree(pages.filter((p) => p.type !== "daily")) });
  },

  trashPage: async (id) => {
    await softDeletePage(id);
    // A deleção é em cascata no banco — remove o item e as subpáginas do estado também
    const removed = collectDescendantIds(get().pages, id);
    const pages = get().pages.filter((p) => !removed.has(p.id));
    const { selectedPageId } = get();
    set({
      pages,
      tree: buildTree(pages.filter((p) => p.type !== "daily")),
      selectedPageId: selectedPageId && removed.has(selectedPageId) ? null : selectedPageId,
    });
  },

  restorePage: async (id) => {
    await restorePageFromTrash(id);
    const allPages = await fetchAllPages();
    set({ pages: allPages, tree: buildTree(allPages.filter((p) => p.type !== "daily")) });
    const trash = await fetchTrash();
    set({ trash });
  },

  permanentDeletePage: async (id) => {
    await removePage(id);
    // O banco também apagou descendentes que estavam na lixeira — recarrega a lista
    const trash = await fetchTrash();
    set({ trash });
  },

  emptyTrash: async () => {
    const { trash } = get();
    for (const p of trash) await removePage(p.id);
    set({ trash: [] });
  },

  movePage: async (draggedId, targetId, position) => {
    const { pages } = get();
    const dragged = pages.find((p) => p.id === draggedId)!;
    const target = pages.find((p) => p.id === targetId)!;

    let updated: Page;

    if (position === "inside") {
      const targetChildren = pages
        .filter((p) => p.parent_id === targetId && p.id !== draggedId)
        .sort((a, b) => a.order_index - b.order_index);
      const last = targetChildren[targetChildren.length - 1];
      const newIndex = last ? last.order_index + 1 : 0;
      updated = { ...dragged, parent_id: targetId, order_index: newIndex };
    } else {
      const siblings = pages
        .filter((p) => p.parent_id === target.parent_id && p.id !== draggedId)
        .sort((a, b) => a.order_index - b.order_index);

      const targetIdx = siblings.findIndex((p) => p.id === targetId);

      let newIndex: number;
      if (position === "before") {
        const prev = siblings[targetIdx - 1];
        newIndex = prev ? (prev.order_index + target.order_index) / 2 : target.order_index - 1;
      } else {
        const next = siblings[targetIdx + 1];
        newIndex = next ? (target.order_index + next.order_index) / 2 : target.order_index + 1;
      }

      updated = { ...dragged, parent_id: target.parent_id, order_index: newIndex };
    }

    await upsertPage(updated);
    const newPages = pages.map((p) => (p.id === draggedId ? updated : p));
    set({ pages: newPages, tree: buildTree(newPages.filter((p) => p.type !== "daily")) });
  },

  toggleFavorite: async (id) => {
    const { pages } = get();
    const page = pages.find((p) => p.id === id)!;
    const updated = { ...page, is_favorite: page.is_favorite ? 0 : 1 };
    await upsertPage(updated);
    const newPages = pages.map((p) => (p.id === id ? updated : p));
    set({ pages: newPages, tree: buildTree(newPages.filter((p) => p.type !== "daily")) });
  },

  selectPage: (id) => {
    if (!id) {
      discardIfEmptyDaily(get().selectedPageId);
      set({ selectedPageId: null });
      return;
    }
    const { selectedPageId, navHistory, navIndex } = get();
    if (id === selectedPageId) return;

    discardIfEmptyDaily(selectedPageId);

    const trimmed = navHistory.slice(0, navIndex + 1);
    const newHistory = [...trimmed, id];
    set({ selectedPageId: id, navHistory: newHistory, navIndex: newHistory.length - 1 });
  },

  navBack: () => {
    const { navHistory, navIndex, selectedPageId } = get();
    if (navIndex <= 0) return;
    const newIndex = navIndex - 1;
    set({ selectedPageId: navHistory[newIndex], navIndex: newIndex });
    discardIfEmptyDaily(selectedPageId);
  },

  navForward: () => {
    const { navHistory, navIndex, selectedPageId } = get();
    if (navIndex >= navHistory.length - 1) return;
    const newIndex = navIndex + 1;
    set({ selectedPageId: navHistory[newIndex], navIndex: newIndex });
    discardIfEmptyDaily(selectedPageId);
  },
  };
});
