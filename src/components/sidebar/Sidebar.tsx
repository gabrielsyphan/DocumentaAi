import {
  Plus, Sun, Moon, Search, Star, FileText, RefreshCw, CalendarDays,
  LayoutTemplate, PenTool, Folder, FolderOpen, ChevronDown, ChevronLeft,
  ChevronRight, X as XIcon, ArrowUpAZ, Clock, Trash2, RotateCcw, Eraser,
  FileUp, Palette,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePagesStore } from "../../store/pages.store";
import { useUIStore, type PageSort, THEMES } from "../../store/ui.store";
import { tagColor } from "../../lib/tags";
import type { Page } from "../../types";
import PageItem from "./PageItem";
import { DragProvider } from "./DragContext";
import { markdownToBlocks } from "../../lib/markdown-import";

interface Props {
  onSearch: () => void;
  onTemplates: () => void;
}

const SORT_LABELS: Record<PageSort, string> = {
  default: "Padrão",
  title: "A–Z",
  updated: "Editado",
  created: "Criado",
};

function applySort(pages: Page[], sort: PageSort): Page[] {
  if (sort === "default") return pages;
  return [...pages].sort((a, b) => {
    if (sort === "title") return (a.title || "").localeCompare(b.title || "");
    if (sort === "updated") return b.updated_at.localeCompare(a.updated_at);
    if (sort === "created") return b.created_at.localeCompare(a.created_at);
    return 0;
  });
}

// ── Mini-calendário de daily notes ────────────────────────────────────────────

function DailyCalendar({ dailyPages }: { dailyPages: Page[] }) {
  const { createDailyNote, selectPage, selectedPageId } = usePagesStore();
  const today = new Date().toISOString().slice(0, 10);
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const { year, month } = viewDate;

  const firstWeekDay = new Date(year, month, 1).getDay(); // 0=Dom
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const notesByDate = new Map(dailyPages.map((p) => [p.title, p]));

  function isoDate(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function handleDayClick(day: number) {
    const d = isoDate(day);
    const existing = notesByDate.get(d);
    if (existing) { selectPage(existing.id); return; }
    createDailyNote(d);
  }

  const cells: (number | null)[] = [
    ...Array(firstWeekDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthName = new Date(year, month, 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="daily-cal">
      <div className="daily-cal-header">
        <button className="daily-cal-nav" onClick={() => setViewDate(({ year: y, month: m }) =>
          m === 0 ? { year: y - 1, month: 11 } : { year: y, month: m - 1 }
        )}>
          <ChevronLeft size={13} />
        </button>
        <span className="daily-cal-month">{monthName}</span>
        <button className="daily-cal-nav" onClick={() => setViewDate(({ year: y, month: m }) =>
          m === 11 ? { year: y + 1, month: 0 } : { year: y, month: m + 1 }
        )}>
          <ChevronRight size={13} />
        </button>
      </div>
      <div className="daily-cal-grid">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <span key={i} className="daily-cal-weekday">{d}</span>
        ))}
        {cells.map((day, i) => {
          if (!day) return <span key={`empty-${i}`} />;
          const iso = isoDate(day);
          const hasNote = notesByDate.has(iso);
          const isToday = iso === today;
          const note = notesByDate.get(iso);
          const isSelected = note && selectedPageId === note.id;
          return (
            <button
              key={iso}
              className={[
                "daily-cal-day",
                isToday ? "today" : "",
                hasNote ? "has-note" : "",
                isSelected ? "selected" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => handleDayClick(day)}
              title={iso}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Lixeira ───────────────────────────────────────────────────────────────────

function TrashSection() {
  const { trash, loadTrash, restorePage, permanentDeletePage, emptyTrash } = usePagesStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) loadTrash();
  }, [open, loadTrash]);

  function relativeDate(iso: string) {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (diff === 0) return "hoje";
    if (diff === 1) return "ontem";
    return `${diff}d atrás`;
  }

  return (
    <div className="trash-section">
      <button className="sidebar-section-label trash-label" onClick={() => setOpen((v) => !v)}>
        <Trash2 size={12} />
        <span>Lixeira{trash.length > 0 && open ? ` (${trash.length})` : ""}</span>
        <ChevronDown size={11} className={`trash-chevron ${open ? "open" : ""}`} />
      </button>
      {open && (
        <div className="trash-list">
          {trash.length === 0 ? (
            <p className="sidebar-empty">Lixeira vazia</p>
          ) : (
            <>
              <button className="trash-empty-btn" onClick={() => { if (confirm("Esvaziar lixeira? Ação irreversível.")) emptyTrash(); }}>
                <Eraser size={11} /> Esvaziar lixeira
              </button>
              {trash.map((page) => (
                <div key={page.id} className="trash-item">
                  <span className="trash-item-icon">
                    {page.emoji ?? (page.type === "canvas" ? <PenTool size={12} /> : <FileText size={12} />)}
                  </span>
                  <span className="trash-item-title">{page.title || "Sem título"}</span>
                  <span className="trash-item-date">{relativeDate(page.deleted_at!)}</span>
                  <button className="trash-action-btn" onClick={() => restorePage(page.id)} title="Restaurar">
                    <RotateCcw size={12} />
                  </button>
                  <button className="trash-action-btn danger" onClick={() => { if (confirm("Excluir permanentemente?")) permanentDeletePage(page.id); }} title="Excluir para sempre">
                    <XIcon size={12} />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sidebar principal ─────────────────────────────────────────────────────────

export default function Sidebar({ onSearch, onTemplates }: Props) {
  const { pages, tree, createPage, createDailyNote, selectPage, selectedPageId, load, loading } = usePagesStore();
  const { theme, toggleTheme, setTheme, activeTag, setActiveTag, pageSort, setPageSort } = useUIStore();
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const themePickerRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  async function handleImportMarkdown(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    for (const file of files) {
      const text = await file.text();
      const blocks = markdownToBlocks(text);
      const title = file.name.replace(/\.(md|markdown)$/i, "");
      await createPage(undefined, { title, content: JSON.stringify(blocks) });
    }
    e.target.value = "";
  }

  useEffect(() => {
    if (!showNewMenu) return;
    const close = (e: MouseEvent) => {
      if (!newMenuRef.current?.contains(e.target as Node)) setShowNewMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showNewMenu]);

  useEffect(() => {
    if (!showSortMenu) return;
    const close = (e: MouseEvent) => {
      if (!sortMenuRef.current?.contains(e.target as Node)) setShowSortMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showSortMenu]);

  useEffect(() => {
    if (!showThemePicker) return;
    const close = (e: MouseEvent) => {
      if (!themePickerRef.current?.contains(e.target as Node)) setShowThemePicker(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showThemePicker]);

  useEffect(() => {
    const handleFocus = () => load();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [load]);

  const favorites = pages.filter((p) => p.is_favorite);
  const dailyNotes = pages.filter((p) => p.type === "daily");

  const allTags = Array.from(
    new Set(pages.filter((p) => p.type !== "daily").flatMap((p) => p.tags ?? []))
  ).sort();

  const filteredPages = activeTag
    ? pages.filter((p) => p.type !== "daily" && (p.tags ?? []).includes(activeTag))
    : null;

  // Ordenação das páginas planas não-diárias
  const nonDailyPages = pages.filter((p) => p.type !== "daily");
  const sortedPages = pageSort !== "default" ? applySort(nonDailyPages, pageSort) : null;

  const SORT_CYCLES: PageSort[] = ["default", "title", "updated", "created"];

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
        <button className="sidebar-new-btn" onClick={() => importInputRef.current?.click()}>
          <FileUp size={13} />
          Importar MD
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".md,.markdown"
          multiple
          style={{ display: "none" }}
          onChange={handleImportMarkdown}
        />
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
              <button className="new-page-menu-item" onMouseDown={() => { setShowNewMenu(false); createPage(undefined, { title: "Nova pasta", type: "folder" }); }}>
                <Folder size={13} /> Pasta
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
                  {page.emoji ?? (
                    page.type === "canvas" ? <PenTool size={13} /> :
                    page.type === "folder" ? <FolderOpen size={13} /> :
                    <FileText size={13} />
                  )}
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
      <DailyCalendar dailyPages={dailyNotes} />

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

      <div className="sidebar-section-label pages-section-label">
        <span>Páginas</span>
        <div className="sort-menu-wrapper" ref={sortMenuRef}>
          <button
            className={`sort-btn${pageSort !== "default" ? " active" : ""}`}
            onClick={() => setShowSortMenu((v) => !v)}
            title="Ordenar páginas"
          >
            {pageSort === "title" ? <ArrowUpAZ size={12} /> : <Clock size={12} />}
            {SORT_LABELS[pageSort]}
          </button>
          {showSortMenu && (
            <div className="sort-menu">
              {SORT_CYCLES.map((s) => (
                <button
                  key={s}
                  className={`sort-menu-item${pageSort === s ? " active" : ""}`}
                  onMouseDown={() => { setPageSort(s); setShowSortMenu(false); }}
                >
                  {SORT_LABELS[s]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

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
        ) : sortedPages ? (
          sortedPages.length === 0 ? (
            <p className="sidebar-empty">Nenhuma página ainda</p>
          ) : (
            sortedPages.map((page) => (
              <button
                key={page.id}
                className={`tag-filtered-item ${selectedPageId === page.id ? "active" : ""}`}
                onClick={() => selectPage(page.id)}
              >
                <span className="page-item-emoji">
                  {page.emoji ?? (
                    page.type === "canvas" ? <PenTool size={13} /> :
                    page.type === "folder" ? <Folder size={13} /> :
                    <FileText size={13} />
                  )}
                </span>
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

      <TrashSection />

      <div className="sidebar-footer">
        <span className="sidebar-shortcut-hint">
          {/Mac/.test(navigator.platform) ? "⌘⇧Space" : "Ctrl+Shift+Space"} captura rápida
        </span>
        <button
          className="theme-toggle"
          onClick={() => load()}
          title="Sincronizar páginas"
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "spin" : ""} />
        </button>
        <div style={{ position: "relative" }} ref={themePickerRef}>
          <button
            className={`theme-toggle${showThemePicker ? " active-footer" : ""}`}
            onClick={() => setShowThemePicker((v) => !v)}
            title="Tema de cor"
          >
            <Palette size={16} />
          </button>
          {showThemePicker && (
            <div className="theme-picker-menu">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  className={`theme-picker-item${theme === t.value ? " active" : ""}`}
                  onClick={() => { setTheme(t.value); setShowThemePicker(false); }}
                >
                  <span
                    className="theme-picker-dot"
                    style={{
                      background: t.value === "nord" ? "#81A1C1"
                        : t.value === "dracula" ? "#BD93F9"
                        : t.value === "rose" ? "#C4A7E7"
                        : t.value === "solarized" ? "#268BD2"
                        : t.value === "light" ? "#7b6cd8"
                        : "#9480f5",
                    }}
                  />
                  {t.label}
                  {theme === t.value && <span className="theme-picker-check">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="theme-toggle" onClick={toggleTheme} title="Alternar claro/escuro">
          {THEMES.find((t) => t.value === theme)?.dark ?? true ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </aside>
  );
}
