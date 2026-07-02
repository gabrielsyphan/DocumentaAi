import { create } from "zustand";

export type Theme = "dark" | "light" | "nord" | "dracula" | "rose" | "solarized";
export type PageSort = "default" | "title" | "updated" | "created";

export const THEMES: { value: Theme; label: string; dark: boolean }[] = [
  { value: "dark", label: "Escuro", dark: true },
  { value: "light", label: "Claro", dark: false },
  { value: "nord", label: "Nord", dark: true },
  { value: "dracula", label: "Dracula", dark: true },
  { value: "rose", label: "Rosé Pine", dark: true },
  { value: "solarized", label: "Solarized", dark: true },
];

function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
}

const savedTheme = (localStorage.getItem("documentaai-theme") as Theme) ?? "dark";
applyTheme(savedTheme);

interface UIState {
  theme: Theme;
  sidebarOpen: boolean;
  activeTag: string | null;
  focusMode: boolean;
  pageSort: PageSort;
  expandedPages: Set<string>;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setActiveTag: (tag: string | null) => void;
  toggleFocusMode: () => void;
  setPageSort: (sort: PageSort) => void;
  collapsePage: (id: string, descendantIds: string[]) => void;
  expandPage: (id: string) => void;

}

export const useUIStore = create<UIState>((set) => ({
  theme: savedTheme,
  sidebarOpen: true,
  activeTag: null,
  focusMode: false,
  pageSort: "default",
  expandedPages: new Set<string>(),

  setTheme: (theme) => {
    localStorage.setItem("documentaai-theme", theme);
    applyTheme(theme);
    set({ theme });
  },

  toggleTheme: () =>
    set((s) => {
      const next = s.theme === "dark" ? "light" : "dark";
      localStorage.setItem("documentaai-theme", next);
      applyTheme(next);
      return { theme: next };
    }),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setActiveTag: (tag) => set({ activeTag: tag }),
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  setPageSort: (pageSort) => set({ pageSort }),

  collapsePage: (id, descendantIds) =>
    set((s) => {
      const next = new Set(s.expandedPages);
      next.delete(id);
      descendantIds.forEach((d) => next.delete(d));
      return { expandedPages: next };
    }),

  expandPage: (id) =>
    set((s) => {
      const next = new Set(s.expandedPages);
      next.add(id);
      return { expandedPages: next };
    }),
}));
