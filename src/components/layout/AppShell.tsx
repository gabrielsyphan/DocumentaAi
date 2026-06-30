import { useCallback, useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { usePagesStore } from "../../store/pages.store";
import Sidebar from "../sidebar/Sidebar";
import Editor from "../editor/Editor";
import SearchModal from "../search/SearchModal";
import UpdateBanner from "./UpdateBanner";

export default function AppShell() {
  const { selectedPageId, createPage } = usePagesStore();
  const [searchOpen, setSearchOpen] = useState(false);

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
      <Sidebar onSearch={() => setSearchOpen(true)} />

      <main className="editor-area">
        {selectedPageId ? (
          // key força remontagem do editor ao trocar de página
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
      <UpdateBanner />
    </div>
  );
}
