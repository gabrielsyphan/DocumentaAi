import { create } from "zustand";

type Theme = "dark" | "light";
export type PageSort = "default" | "title" | "updated" | "created";

interface UIState {
  theme: Theme;
  sidebarOpen: boolean;
  activeTag: string | null;
  focusMode: boolean;
  pageSort: PageSort;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setActiveTag: (tag: string | null) => void;
  toggleFocusMode: () => void;
  setPageSort: (sort: PageSort) => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: "dark",
  sidebarOpen: true,
  activeTag: null,
  focusMode: false,
  pageSort: "default",
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      return { theme: next };
    }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setActiveTag: (tag) => set({ activeTag: tag }),
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  setPageSort: (pageSort) => set({ pageSort }),
}));
