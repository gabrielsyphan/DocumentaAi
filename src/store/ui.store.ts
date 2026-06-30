import { create } from "zustand";

type Theme = "dark" | "light";

interface UIState {
  theme: Theme;
  sidebarOpen: boolean;
  activeTag: string | null;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setActiveTag: (tag: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: "dark",
  sidebarOpen: true,
  activeTag: null,
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      return { theme: next };
    }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setActiveTag: (tag) => set({ activeTag: tag }),
}));
