import { Suspense, lazy, useEffect, useRef } from "react";
import "@excalidraw/excalidraw/index.css";
import { Maximize2 } from "lucide-react";
import { usePagesStore } from "../../store/pages.store";
import { useUIStore, THEMES } from "../../store/ui.store";

// Carrega Excalidraw de forma lazy — a lib é grande (~2 MB)
const Excalidraw = lazy(() =>
  import("@excalidraw/excalidraw").then((m) => ({ default: m.Excalidraw }))
);

interface Props {
  pageId: string;
}

export default function CanvasEditor({ pageId }: Props) {
  const { pages, updatePage } = usePagesStore();
  const { theme, focusMode, toggleFocusMode } = useUIStore();
  const page = pages.find((p) => p.id === pageId);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Fundo do canvas combina com o editor ao criar uma nova página canvas
  const CANVAS_BG: Record<string, string> = {
    dark: "#1e1e1e", light: "#ffffff", nord: "#2e3440",
    dracula: "#282a36", rose: "#191724", solarized: "#002b36",
  };
  const DEFAULT_APP_STATE = {
    viewBackgroundColor: CANVAS_BG[theme] ?? "#1e1e1e",
    gridModeEnabled: false,
  };

  const initialData = (() => {
    if (!page?.content) return { elements: [], appState: DEFAULT_APP_STATE };
    try {
      const parsed = JSON.parse(page.content);
      // garante que novos campos do appState são mergeados com os salvos
      return { ...parsed, appState: { ...DEFAULT_APP_STATE, ...parsed.appState } };
    } catch {
      return { elements: [], appState: DEFAULT_APP_STATE };
    }
  })();

  useEffect(() => {
    return () => clearTimeout(saveTimer.current);
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleChange(elements: readonly any[], appState: any, files: any) {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updatePage(pageId, {
        content: JSON.stringify({
          elements: Array.from(elements),
          appState: {
            viewBackgroundColor: appState.viewBackgroundColor,
            gridModeEnabled: appState.gridModeEnabled,
          },
          files,
        }),
      });
    }, 600);
  }

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    updatePage(pageId, { title: e.target.value });
  }

  return (
    <div className="canvas-container">
      <div className="editor-topbar canvas-topbar">
        <input
          className="page-title-input"
          value={page?.title ?? ""}
          onChange={handleTitleChange}
          placeholder="Sem título"
        />
        {!focusMode && (
          <div className="topbar-actions">
            <button
              className="topbar-action-btn"
              onClick={toggleFocusMode}
              title="Modo foco (⌘⇧F)"
            >
              <Maximize2 size={15} />
            </button>
          </div>
        )}
      </div>

      <div className="canvas-area">
        <Suspense fallback={<div className="canvas-loading">Carregando canvas...</div>}>
          <div style={{ width: "100%", height: "100%" }}>
            <Excalidraw
              key={pageId}
              initialData={{ ...initialData, scrollToContent: true }}
              onChange={handleChange}
              theme={THEMES.find((t) => t.value === theme)?.dark !== false ? "dark" : "light"}
            />
          </div>
        </Suspense>
      </div>
    </div>
  );
}
