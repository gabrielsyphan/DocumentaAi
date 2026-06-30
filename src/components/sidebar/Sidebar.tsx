import { Plus, Sun, Moon, Search, Star, FileText, RefreshCw, CalendarDays, LayoutTemplate, PenTool, ChevronDown, X as XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePagesStore } from "../../store/pages.store";
import { useUIStore } from "../../store/ui.store";
import { tagColor } from "../../lib/tags";
import PageItem from "./PageItem";
import { DragProvider } from "./DragContext";

interface Props {
  onSearch: () => void;
  onTemplates: () => void;
}

export default function Sidebar({ onSearch, onTemplates }: Props) {
  const { pages, tree, createPage, createDailyNote, selectPage, selectedPageId, load, loading } = usePagesStore();
  const { theme, toggleTheme, activeTag, setActiveTag } = useUIStore();
  const [showNewMenu, setShowNewMenu] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showNewMenu) return;
    const close = (e: MouseEvent) => {
      if (!newMenuRef.current?.contains(e.target as Node)) setShowNewMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showNewMenu]);

  // Auto-refresh quando a janela volta ao foco (ex: usuário usou MCP via Claude)
  useEffect(() => {
    const handleFocus = () => load();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [load]);
  const favorites = pages.filter((p) => p.is_favorite);
  const dailyNotes = pages
    .filter((p) => p.type === "daily")
    .sort((a, b) => b.title.localeCompare(a.title));
  const today = new Date().toISOString().slice(0, 10);

  // Tags únicas de todas as páginas (exceto daily)
  const allTags = Array.from(
    new Set(pages.filter((p) => p.type !== "daily").flatMap((p) => p.tags ?? []))
  ).sort();

  // Quando há filtro ativo, mostra páginas planas com a tag
  const filteredPages = activeTag
    ? pages.filter((p) => p.type !== "daily" && (p.tags ?? []).includes(activeTag))
    : null;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span>DocumentaAI</span>
      </div>

      <div className="sidebar-actions">
        <button className="sidebar-new-btn" onClick={onSearch}>
          <Search size={13} />
          Buscar
          <kbd className="sidebar-kbd">⌘K</kbd>
        </button>
        <button className="sidebar-new-btn" onClick={onTemplates}>
          <LayoutTemplate size={13} />
          Templates
        </button>
        <div className="new-page-wrapper" ref={newMenuRef}>
          <button className="sidebar-new-btn primary" onClick={() => setShowNewMenu((v) => !v)}>
            <Plus size={13} />
            Nova página
            <ChevronDown size={11} style={{ marginLeft: "auto" }} />
          </button>
          {showNewMenu && (
            <div className="new-page-menu">
              <button className="new-page-menu-item" onMouseDown={() => { setShowNewMenu(false); createPage(); }}>
                <FileText size={13} /> Documento
                <kbd className="sidebar-kbd">⌘N</kbd>
              </button>
              <button className="new-page-menu-item" onMouseDown={() => { setShowNewMenu(false); createPage(undefined, { title: "Sem título", type: "canvas" }); }}>
                <PenTool size={13} /> Canvas
              </button>
            </div>
          )}
        </div>
      </div>

      {favorites.length > 0 && (
        <>
          <div className="sidebar-section-label">Favoritos</div>
          <div className="favorites-list">
            {favorites.map((page) => (
              <button
                key={page.id}
                className={`favorite-item ${selectedPageId === page.id ? "active" : ""}`}
                onClick={() => selectPage(page.id)}
              >
                <span className="favorite-item-icon">
                  {page.emoji ?? <FileText size={13} />}
                </span>
                <span className="favorite-item-title">{page.title || "Sem título"}</span>
                <Star size={11} className="favorite-star" fill="currentColor" />
              </button>
            ))}
          </div>
        </>
      )}

      <div className="sidebar-section-label daily-section-label">
        <span>Daily Notes</span>
        <button className="daily-today-btn" onClick={() => createDailyNote()} title="Abrir nota de hoje">
          <CalendarDays size={12} />
          Hoje
        </button>
      </div>
      {dailyNotes.length > 0 && (
        <div className="daily-list">
          {dailyNotes.map((note) => (
            <button
              key={note.id}
              className={`daily-item ${selectedPageId === note.id ? "active" : ""}`}
              onClick={() => selectPage(note.id)}
            >
              <span className="daily-item-dot">{note.title === today ? "●" : "○"}</span>
              <span className="daily-item-title">{note.title}</span>
              {note.title === today && <span className="daily-today-badge">hoje</span>}
            </button>
          ))}
        </div>
      )}

      {allTags.length > 0 && (
        <>
          <div className="sidebar-section-label">Tags</div>
          <div className="tag-filter-list">
            {allTags.map((tag) => {
              const color = tagColor(tag);
              const isActive = activeTag === tag;
              return (
                <button
                  key={tag}
                  className={`tag-filter-chip ${isActive ? "active" : ""}`}
                  style={{
                    color,
                    background: isActive ? `${color}33` : `${color}15`,
                    borderColor: isActive ? `${color}88` : `${color}33`,
                  }}
                  onClick={() => setActiveTag(isActive ? null : tag)}
                >
                  {tag}
                  {isActive && <XIcon size={10} style={{ marginLeft: 4 }} />}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="sidebar-section-label">Páginas</div>

      <nav className="page-tree">
        {filteredPages ? (
          filteredPages.length === 0 ? (
            <p className="sidebar-empty">Sem páginas com essa tag</p>
          ) : (
            filteredPages.map((page) => (
              <button
                key={page.id}
                className={`tag-filtered-item ${selectedPageId === page.id ? "active" : ""}`}
                onClick={() => selectPage(page.id)}
              >
                <span className="page-item-emoji">{page.emoji ?? <FileText size={13} />}</span>
                <span className="page-item-title">{page.title || "Sem título"}</span>
              </button>
            ))
          )
        ) : (
          <DragProvider>
            {tree.length === 0 ? (
              <p className="sidebar-empty">Nenhuma página ainda</p>
            ) : (
              tree.map((page) => <PageItem key={page.id} page={page} depth={0} />)
            )}
          </DragProvider>
        )}
      </nav>

      <div className="sidebar-footer">
        <button
          className="theme-toggle"
          onClick={() => load()}
          title="Sincronizar páginas"
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "spin" : ""} />
        </button>
        <button className="theme-toggle" onClick={toggleTheme} title="Alternar tema">
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </aside>
  );
}
