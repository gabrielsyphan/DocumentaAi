import {
  Plus, Search, Star, FileText, RefreshCw, CalendarDays,
  LayoutTemplate, PenTool, Folder, FolderOpen, ChevronDown, ChevronLeft, LayoutGrid,
  ChevronRight, X as XIcon, ArrowUpAZ, Clock, Trash2, RotateCcw, Eraser,
  FileUp, Palette, BookOpen, Network, Check, HardDriveDownload, HardDriveUpload,
  MonitorSmartphone, Languages, MoreHorizontal,
} from "lucide-react";
import SyncModal from "../sync/SyncModal";
import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { createPortal } from "react-dom";
import { vacuumInto } from "../../lib/db";
import { usePagesStore } from "../../store/pages.store";
import { useUIStore, type PageSort, THEMES } from "../../store/ui.store";
import { tagColor } from "../../lib/tags";
import { revealInTree } from "../../lib/reveal";
import type { Page } from "../../types";
import PageItem from "./PageItem";
import { DragProvider } from "./DragContext";
import { markdownToBlocks } from "../../lib/markdown-import";
import { useDueCount, ReviewSession } from "../flashcards/FlashcardPanel";

const GraphView = lazy(() => import("../graph/GraphView"));

interface Props {
  onSearch: () => void;
  onTemplates: () => void;
  onTranslate: () => void;
}

const THEME_DOT_COLORS: Record<string, string> = {
  dark: "#9480f5",
  light: "#7b6cd8",
  nord: "#81A1C1",
  dracula: "#BD93F9",
  rose: "#C4A7E7",
  solarized: "#268BD2",
};

const SORT_LABELS: Record<PageSort, string> = {
  default: "Padrão",
  title: "A–Z",
  updated: "Editado",
  created: "Criado",
};

import type { PageWithChildren } from "../../types";

function sortTree(nodes: PageWithChildren[], sort: PageSort): PageWithChildren[] {
  const cmp = (a: PageWithChildren, b: PageWithChildren): number => {
    if (sort === "title")   return (a.title || "").localeCompare(b.title || "", "pt-BR", { sensitivity: "base" });
    if (sort === "updated") return b.updated_at.localeCompare(a.updated_at);
    if (sort === "created") return b.created_at.localeCompare(a.created_at);
    return 0;
  };
  return [...nodes].sort(cmp).map(n => ({ ...n, children: sortTree(n.children, sort) }));
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
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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
        <ChevronDown size={11} className={`trash-chevron ${open ? "open" : ""}`} />
        <Trash2 size={12} />
        <span>Lixeira{trash.length > 0 && open ? ` (${trash.length})` : ""}</span>
      </button>
      {open && (
        <div className="trash-list">
          {trash.length === 0 ? (
            <p className="sidebar-empty">Lixeira vazia</p>
          ) : (
            <>
              {confirmEmpty ? (
                <div className="trash-confirm-row">
                  <span className="trash-confirm-text">Excluir tudo?</span>
                  <button className="trash-action-btn danger" onClick={() => { emptyTrash(); setConfirmEmpty(false); }}>
                    Sim
                  </button>
                  <button className="trash-action-btn" onClick={() => setConfirmEmpty(false)}>
                    Não
                  </button>
                </div>
              ) : (
                <button className="trash-empty-btn" onClick={() => setConfirmEmpty(true)}>
                  <Eraser size={11} /> Esvaziar lixeira
                </button>
              )}
              {trash.map((page) => (
                <div key={page.id} className="trash-item">
                  <span className="trash-item-icon">
                    {page.emoji ?? (page.type === "canvas" ? <PenTool size={12} /> : page.type === "board" ? <LayoutGrid size={12} /> : page.type === "daily" ? <CalendarDays size={12} /> : <FileText size={12} />)}
                  </span>
                  <span className="trash-item-title">{page.title || "Sem título"}</span>
                  <span className="trash-item-date">{relativeDate(page.deleted_at!)}</span>
                  <button className="trash-action-btn" onClick={() => restorePage(page.id)} title="Restaurar">
                    <RotateCcw size={12} />
                  </button>
                  {confirmDeleteId === page.id ? (
                    <>
                      <button className="trash-action-btn danger" onClick={() => { permanentDeletePage(page.id); setConfirmDeleteId(null); }} title="Confirmar exclusão">
                        <Check size={11} />
                      </button>
                      <button className="trash-action-btn" onClick={() => setConfirmDeleteId(null)} title="Cancelar">
                        <XIcon size={11} />
                      </button>
                    </>
                  ) : (
                    <button className="trash-action-btn danger" onClick={() => setConfirmDeleteId(page.id)} title="Excluir para sempre">
                      <XIcon size={12} />
                    </button>
                  )}
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

export default function Sidebar({ onSearch, onTemplates, onTranslate }: Props) {
  const { pages, tree, createPage, createDailyNote, selectPage, selectedPageId, load, loading } = usePagesStore();
  const { theme, setTheme, activeTag, setActiveTag, pageSort, setPageSort } = useUIStore();
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sortMenuRect, setSortMenuRect] = useState<DOMRect | null>(null);
  const sortBtnRef = useRef<HTMLButtonElement>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  // Daily Notes sempre começa fechada (desktop e mobile)
  const [showDailySection, setShowDailySection] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const dueCount = useDueCount();
  const [appVersion, setAppVersion] = useState("");
  const [backupStatus, setBackupStatus] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [restoreFilePath, setRestoreFilePath] = useState<string | null>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  async function handleBackup() {
    setBackupStatus("busy");
    try {
      const today = new Date().toISOString().split("T")[0];
      const savePath = await invoke<string | null>("pick_backup_save_path", {
        suggestedName: `documentaai-backup-${today}.db`,
      });
      if (!savePath) { setBackupStatus("idle"); return; }
      await vacuumInto(savePath);
      setBackupStatus("ok");
      setTimeout(() => setBackupStatus("idle"), 2000);
    } catch {
      setBackupStatus("err");
      setTimeout(() => setBackupStatus("idle"), 2500);
    }
  }

  async function handlePickRestoreFile() {
    try {
      const path = await invoke<string | null>("pick_restore_file");
      if (path) setRestoreFilePath(path);
    } catch (e) {
      console.error("Pick restore error:", e);
    }
  }

  async function handleApplyRestore() {
    if (!restoreFilePath) return;
    const path = restoreFilePath;
    setRestoreFilePath(null);
    try {
      await invoke("apply_restore", { backupPath: path });
      await relaunch();
    } catch (e) {
      console.error("Restore error:", e);
    }
  }

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

  useEffect(() => { getVersion().then(setAppVersion).catch(() => {}); }, []);

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
      const target = e.target as Node;
      const inMenu = sortMenuRef.current?.contains(target);
      const inBtn  = sortBtnRef.current?.contains(target);
      if (!inMenu && !inBtn) setShowSortMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showSortMenu]);

  useEffect(() => {
    if (!showMoreMenu) return;
    const close = (e: MouseEvent) => {
      if (!moreMenuRef.current?.contains(e.target as Node)) setShowMoreMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showMoreMenu]);

  useEffect(() => {
    const handleFocus = () => load();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [load]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayNote = pages.find((p) => p.type === "daily" && p.title === todayStr) ?? null;
  const todayLabel = new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });

  const favorites = pages.filter((p) => p.is_favorite);
  const dailyNotes = pages.filter((p) => p.type === "daily");

  const allTags = Array.from(
    new Set(pages.filter((p) => p.type !== "daily").flatMap((p) => p.tags ?? []))
  ).sort();

  const filteredPages = activeTag
    ? pages.filter((p) => p.type !== "daily" && (p.tags ?? []).includes(activeTag))
    : null;

  const displayTree = pageSort !== "default" ? sortTree(tree, pageSort) : tree;

  const SORT_CYCLES: PageSort[] = ["default", "title", "updated", "created"];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button
          className="sidebar-brand-btn"
          onClick={() => selectPage(null)}
          title="Ir para o início"
        >
          DocumentaAI
        </button>
        {appVersion && <span className="sidebar-version">v{appVersion}</span>}
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
              <button className="new-page-menu-item" onMouseDown={() => { setShowNewMenu(false); createPage(undefined, { title: "Novo board", type: "board" }); }}>
                <LayoutGrid size={13} /> Board
              </button>
            </div>
          )}
        </div>
      </div>

      <button
        className={`today-note-card${todayNote && selectedPageId === todayNote.id ? " active" : ""}`}
        onClick={() => createDailyNote()}
        title="Abrir ou criar nota de hoje"
      >
        <CalendarDays size={16} className="today-note-icon" />
        <div className="today-note-info">
          <span className="today-note-label">Hoje</span>
          <span className="today-note-date">{todayLabel}</span>
        </div>
        {todayNote && <span className="today-note-dot" title="Nota já existe" />}
      </button>

      {favorites.length > 0 && (
        <>
          <div className="sidebar-section-label">Favoritos</div>
          <div className="favorites-list">
            {favorites.map((page) => (
              <button
                key={page.id}
                className={`favorite-item ${selectedPageId === page.id ? "active" : ""}`}
                onClick={() => revealInTree(page.id)}
              >
                <span className="favorite-item-icon">
                  {page.emoji ?? (
                    page.type === "canvas" ? <PenTool size={13} /> :
                    page.type === "board" ? <LayoutGrid size={13} /> :
                    page.type === "folder" ? <FolderOpen size={13} /> :
                    page.type === "daily" ? <CalendarDays size={13} /> :
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
        <button
          ref={sortBtnRef}
          className={`sort-btn${pageSort !== "default" ? " active" : ""}`}
          onClick={() => {
            const rect = sortBtnRef.current?.getBoundingClientRect() ?? null;
            setSortMenuRect(rect);
            setShowSortMenu((v) => !v);
          }}
          title="Ordenar páginas"
        >
          {pageSort === "title" ? <ArrowUpAZ size={12} /> : <Clock size={12} />}
          {SORT_LABELS[pageSort]}
        </button>
      </div>

      {showSortMenu && sortMenuRect && createPortal(
        <div
          ref={sortMenuRef}
          className="sort-menu"
          style={{
            position: "fixed",
            top: sortMenuRect.bottom + 4,
            left: sortMenuRect.right,
            right: "auto",
            transform: "translateX(-100%)",
          }}
        >
          {SORT_CYCLES.map((s) => (
            <button
              key={s}
              className={`sort-menu-item${pageSort === s ? " active" : ""}`}
              onMouseDown={() => { setPageSort(s); setShowSortMenu(false); }}
            >
              {SORT_LABELS[s]}
            </button>
          ))}
        </div>,
        document.body
      )}

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
                <span className="page-item-emoji">{page.emoji ?? (page.type === "daily" ? <CalendarDays size={13} /> : <FileText size={13} />)}</span>
                <span className="page-item-title">{page.title || "Sem título"}</span>
              </button>
            ))
          )
        ) : (
          <DragProvider>
            {displayTree.length === 0 ? (
              <p className="sidebar-empty">Nenhuma página ainda</p>
            ) : (
              displayTree.map((page) => <PageItem key={page.id} page={page} depth={0} />)
            )}
          </DragProvider>
        )}
      </nav>

      <div className="daily-section">
        <div className="sidebar-section-label daily-section-label">
          <button
            className="daily-section-toggle"
            onClick={() => setShowDailySection((v) => !v)}
          >
            <ChevronDown size={11} className={`trash-chevron ${showDailySection ? "open" : ""}`} />
            <CalendarDays size={12} />
            Notas diárias
          </button>
          <button
            className="daily-today-btn"
            onClick={() => createDailyNote()}
            title="Abrir nota de hoje"
          >
            <CalendarDays size={12} />
            Hoje
          </button>
        </div>
        {showDailySection && <DailyCalendar dailyPages={dailyNotes} />}
      </div>

      <TrashSection />

      <div className="sidebar-footer">
        <button
          className={`theme-toggle fc-sidebar-btn${dueCount > 0 ? " active-footer" : ""}`}
          onClick={() => setShowReview(true)}
          title={dueCount > 0 ? `${dueCount} flashcard${dueCount > 1 ? "s" : ""} para revisar` : "Flashcards"}
          style={{ position: "relative" }}
        >
          <BookOpen size={16} />
          {dueCount > 0 && <span className="fc-sidebar-badge">{dueCount > 99 ? "99+" : dueCount}</span>}
        </button>
        <button
          className="theme-toggle"
          onClick={onTranslate}
          title="Tradutor (⌘T)"
        >
          <Languages size={16} />
        </button>

        {/* Ações menos frequentes agrupadas no menu "Mais" */}
        <div style={{ position: "relative" }} ref={moreMenuRef}>
          <button
            className={`theme-toggle${showMoreMenu ? " active-footer" : ""}`}
            onClick={() => setShowMoreMenu((v) => !v)}
            title="Mais opções"
          >
            <MoreHorizontal size={16} />
          </button>
          {showMoreMenu && (
            <div className="more-menu">
              <button
                className="more-menu-item"
                onClick={() => load()}
                disabled={loading}
              >
                <RefreshCw size={14} className={loading ? "spin" : ""} />
                Recarregar páginas
              </button>
              <button
                className="more-menu-item"
                onClick={() => { setShowMoreMenu(false); setShowSync(true); }}
              >
                <MonitorSmartphone size={14} />
                Sync por rede local
              </button>
              <button
                className="more-menu-item"
                onClick={() => { setShowMoreMenu(false); setShowGraph(true); }}
              >
                <Network size={14} />
                Graph view
              </button>

              <div className="more-menu-divider" />

              <button
                className="more-menu-item"
                onClick={handleBackup}
                disabled={backupStatus === "busy"}
              >
                <HardDriveDownload size={14} />
                {backupStatus === "busy" ? "Exportando…"
                  : backupStatus === "ok" ? "Backup exportado ✓"
                  : backupStatus === "err" ? "Erro ao exportar"
                  : "Exportar backup"}
              </button>
              <button
                className="more-menu-item"
                onClick={() => { setShowMoreMenu(false); handlePickRestoreFile(); }}
              >
                <HardDriveUpload size={14} />
                Importar backup…
              </button>

              <div className="more-menu-divider" />

              {/* Tema: fileira de bolinhas — clique aplica na hora */}
              <div className="more-menu-themes">
                <Palette size={14} />
                {THEMES.map((t) => (
                  <button
                    key={t.value}
                    className={`theme-dot-btn${theme === t.value ? " active" : ""}`}
                    style={{ background: THEME_DOT_COLORS[t.value] }}
                    onClick={() => setTheme(t.value)}
                    title={t.label}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmação de restore em modal central (o menu já fechou nesse ponto) */}
      {restoreFilePath &&
        createPortal(
          <div className="fc-overlay" onClick={() => setRestoreFilePath(null)}>
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "var(--sidebar-bg)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "14px 16px", width: 300,
                boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
              }}
            >
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--sidebar-text-active)", marginBottom: 4 }}>
                Restaurar backup?
              </p>
              <p style={{ fontSize: 11, color: "var(--sidebar-text)", opacity: 0.65, marginBottom: 6, wordBreak: "break-all" }}>
                {restoreFilePath.split(/[\\/]/).pop()}
              </p>
              <p style={{ fontSize: 11, color: "#f87171", marginBottom: 12 }}>
                Os dados atuais serão substituídos e o app será reiniciado.
              </p>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={handleApplyRestore}
                  style={{
                    flex: 1, padding: "6px 0", border: "none", borderRadius: 6,
                    background: "#f87171", color: "#fff", fontSize: 12, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Restaurar
                </button>
                <button
                  onClick={() => setRestoreFilePath(null)}
                  style={{
                    flex: 1, padding: "6px 0", border: "1px solid var(--border)", borderRadius: 6,
                    background: "transparent", color: "var(--sidebar-text)", fontSize: 12,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Modais em portal no <body>: no mobile a sidebar vira drawer com
          transform, o que faria o position:fixed deles alinhar ao drawer
          em vez da tela */}
      {showReview &&
        createPortal(<ReviewSession onClose={() => setShowReview(false)} />, document.body)}
      <SyncModal open={showSync} onClose={() => setShowSync(false)} />

      {showGraph &&
        createPortal(
          <Suspense fallback={null}>
            <GraphView
              pages={pages}
              selectedPageId={selectedPageId}
              onSelectPage={selectPage}
              onClose={() => setShowGraph(false)}
            />
          </Suspense>,
          document.body
        )}
    </aside>
  );
}
