import { Suspense, lazy, useEffect, useRef } from "react";
import "@excalidraw/excalidraw/index.css";
import { Maximize2 } from "lucide-react";
import { usePagesStore } from "../../store/pages.store";
import { useUIStore, THEMES } from "../../store/ui.store";
import { CANVAS_LIBRARY } from "../../lib/canvas-library";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiRef = useRef<any>(null);

  const CANVAS_BG: Record<string, string> = {
    dark: "#1e1e1e", light: "#ffffff", nord: "#2e3440",
    dracula: "#282a36", rose: "#191724", solarized: "#002b36",
  };
  const DEFAULT_APP_STATE = {
    viewBackgroundColor: CANVAS_BG[theme] ?? "#1e1e1e",
    gridModeEnabled: false,
  };

  const initialData = (() => {
    if (!page?.content) return { elements: [], appState: DEFAULT_APP_STATE, libraryItems: CANVAS_LIBRARY };
    try {
      const parsed = JSON.parse(page.content);
      return {
        ...parsed,
        appState: { ...DEFAULT_APP_STATE, ...parsed.appState },
        libraryItems: CANVAS_LIBRARY,
      };
    } catch {
      return { elements: [], appState: DEFAULT_APP_STATE, libraryItems: CANVAS_LIBRARY };
    }
  })();

  // Zoom to fit ao abrir uma página com conteúdo
  useEffect(() => {
    const timer = setTimeout(() => {
      const api = apiRef.current;
      if (!api) return;
      const els = api.getSceneElements();
      if (els.length > 0) {
        api.scrollToContent(els, { fitToViewport: true, animate: false });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [pageId]);

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

  const isDark = THEMES.find((t) => t.value === theme)?.dark !== false;

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
              initialData={initialData}
              onChange={handleChange}
              theme={isDark ? "dark" : "light"}
              langCode="pt-BR"
              excalidrawAPI={(api) => {
                apiRef.current = api;
              }}
            />
          </div>
        </Suspense>
      </div>
    </div>
  );
}
