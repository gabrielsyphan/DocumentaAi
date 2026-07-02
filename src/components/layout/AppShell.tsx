import { useCallback, useEffect, useState, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { FileText, Minimize2, ChevronLeft, ChevronRight, AlertTriangle, RotateCcw } from "lucide-react";

class EditorErrorBoundary extends Component<
  { children: ReactNode; pageId: string; onClearContent: () => void },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode; pageId: string; onClearContent: () => void }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[EditorErrorBoundary] crash ao abrir página:", error, info);
  }

  componentDidUpdate(prev: { pageId: string }) {
    if (prev.pageId !== this.props.pageId && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      const btnBase: React.CSSProperties = {
        display: "flex", alignItems: "center", gap: 6,
        padding: "6px 16px", borderRadius: 7, border: "1px solid #3a3a3a",
        background: "transparent", color: "#e8e8e6", fontSize: 13, cursor: "pointer",
      };
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100%", gap: 16,
          color: "#787774", fontFamily: "inherit",
        }}>
          <AlertTriangle size={28} style={{ color: "#f87171" }} />
          <p style={{ fontSize: 15, color: "#e8e8e6" }}>Erro ao carregar o editor</p>
          <pre style={{
            fontSize: 11, color: "#787774", background: "#1a1a1a",
            padding: "10px 16px", borderRadius: 8, maxWidth: 560,
            whiteSpace: "pre-wrap", wordBreak: "break-all",
          }}>
            {this.state.error.message}
          </pre>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => this.setState({ error: null })} style={btnBase}>
              <RotateCcw size={13} /> Tentar novamente
            </button>
            <button
              onClick={() => { this.props.onClearContent(); this.setState({ error: null }); }}
              style={{ ...btnBase, borderColor: "#f87171", color: "#f87171" }}
              title="Apaga o conteúdo corrompido e abre a página em branco"
            >
              <AlertTriangle size={13} /> Limpar conteúdo
            </button>
          </div>
          <p style={{ fontSize: 11, color: "#555", maxWidth: 400, textAlign: "center" }}>
            "Limpar conteúdo" apaga os blocos com problema e abre a página em branco.<br />
            O título e os metadados são preservados.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
import { usePagesStore } from "../../store/pages.store";
import { useUIStore } from "../../store/ui.store";
import Sidebar from "../sidebar/Sidebar";
import Editor from "../editor/Editor";
import CanvasEditor from "../editor/CanvasEditor";
import FolderView from "../editor/FolderView";
import BoardEditor from "../editor/BoardEditor";
import SearchModal from "../search/SearchModal";
import TemplateGallery from "../templates/TemplateGallery";
import UpdateBanner from "./UpdateBanner";

const IS_MAC = /Mac/.test(navigator.platform);
const QUICK_CAPTURE_SHORTCUT = IS_MAC ? "⌘⇧Space" : "Ctrl+Shift+Space";

export default function AppShell() {
  const { selectedPageId, pages, createPage, updatePage, navBack, navForward, navHistory, navIndex } = usePagesStore();
  const canGoBack = navIndex > 0;
  const canGoForward = navIndex < navHistory.length - 1;
  const { focusMode, toggleFocusMode } = useUIStore();
  const selectedPage = pages.find((p) => p.id === selectedPageId);
  const [searchOpen, setSearchOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // ⌘K → busca
      if (mod && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
        return;
      }

      // ⌘N → nova página
      if (mod && e.key === "n") {
        e.preventDefault();
        createPage();
        return;
      }

      // ⌘⇧F → modo foco
      if (mod && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        toggleFocusMode();
        return;
      }

      // ⌘[ → voltar, ⌘] → avançar
      if (mod && e.key === "[") { e.preventDefault(); navBack(); return; }
      if (mod && e.key === "]") { e.preventDefault(); navForward(); return; }

      // Escape → sair do modo foco
      if (e.key === "Escape" && focusMode) {
        toggleFocusMode();
        return;
      }
    },
    [createPage, focusMode, toggleFocusMode, navBack, navForward]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className={`app-shell${focusMode ? " focus-mode" : ""}`}>
      {!focusMode && (
        <Sidebar onSearch={() => setSearchOpen(true)} onTemplates={() => setTemplatesOpen(true)} />
      )}

      <main className="editor-area">
        {focusMode && (
          <button
            className="focus-exit-btn"
            onClick={toggleFocusMode}
            title="Sair do modo foco (Esc)"
          >
            <Minimize2 size={13} />
          </button>
        )}

        {(canGoBack || canGoForward) && (
          <div className="nav-history-btns">
            <button
              className="nav-history-btn"
              onClick={navBack}
              disabled={!canGoBack}
              title="Voltar (⌘[)"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              className="nav-history-btn"
              onClick={navForward}
              disabled={!canGoForward}
              title="Avançar (⌘])"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {selectedPageId && selectedPage?.type === "canvas" ? (
          <EditorErrorBoundary key={selectedPageId} pageId={selectedPageId} onClearContent={() => updatePage(selectedPageId, { content: null })}>
            <CanvasEditor pageId={selectedPageId} />
          </EditorErrorBoundary>
        ) : selectedPageId && selectedPage?.type === "folder" ? (
          <EditorErrorBoundary key={selectedPageId} pageId={selectedPageId} onClearContent={() => updatePage(selectedPageId, { content: null })}>
            <FolderView pageId={selectedPageId} />
          </EditorErrorBoundary>
        ) : selectedPageId && selectedPage?.type === "board" ? (
          <EditorErrorBoundary key={selectedPageId} pageId={selectedPageId} onClearContent={() => updatePage(selectedPageId, { content: null })}>
            <BoardEditor pageId={selectedPageId} />
          </EditorErrorBoundary>
        ) : selectedPageId ? (
          <EditorErrorBoundary key={selectedPageId} pageId={selectedPageId} onClearContent={() => updatePage(selectedPageId, { content: null })}>
            <Editor pageId={selectedPageId} />
          </EditorErrorBoundary>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FileText size={22} />
            </div>
            <p>Selecione ou crie uma página</p>
            <p className="empty-hint">⌘N nova página · ⌘K buscar</p>
          </div>
        )}
      </main>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <TemplateGallery open={templatesOpen} onClose={() => setTemplatesOpen(false)} />
      <UpdateBanner />
    </div>
  );
}
