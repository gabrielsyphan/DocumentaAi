import { useCallback, useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { usePagesStore } from "../../store/pages.store";
import Sidebar from "../sidebar/Sidebar";
import Editor from "../editor/Editor";
import CanvasEditor from "../editor/CanvasEditor";
import SearchModal from "../search/SearchModal";
import TemplateGallery from "../templates/TemplateGallery";
import UpdateBanner from "./UpdateBanner";

export default function AppShell() {
  const { selectedPageId, pages, createPage } = usePagesStore();
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
    },
    [createPage]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="app-shell">
      <Sidebar onSearch={() => setSearchOpen(true)} onTemplates={() => setTemplatesOpen(true)} />

      <main className="editor-area">
        {selectedPageId && selectedPage?.type === "canvas" ? (
          <CanvasEditor key={selectedPageId} pageId={selectedPageId} />
        ) : selectedPageId ? (
          <Editor key={selectedPageId} pageId={selectedPageId} />
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
