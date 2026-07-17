import { FileText, PenTool, CalendarDays, Search, LayoutTemplate, Star, LayoutGrid, Folder, Clock } from "lucide-react";
import { usePagesStore } from "../../store/pages.store";
import { useIsMobile } from "../../hooks/useIsMobile";
import { revealInTree } from "../../lib/reveal";
import type { Page } from "../../types";

interface Props {
  onSearch: () => void;
  onTemplates: () => void;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "Boa madrugada";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function todayLong(): string {
  return new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function relativeTime(iso: string): string {
  const then = new Date(iso.replace(" ", "T")).getTime();
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  if (days < 30) return `${days}d atrás`;
  return new Date(then).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function pageIcon(page: Page) {
  if (page.emoji) return page.emoji;
  if (page.type === "canvas") return <PenTool size={15} />;
  if (page.type === "board") return <LayoutGrid size={15} />;
  if (page.type === "folder") return <Folder size={15} />;
  if (page.type === "daily") return <CalendarDays size={15} />;
  return <FileText size={15} />;
}

export default function HomeScreen({ onSearch, onTemplates }: Props) {
  const { pages, createPage, createDailyNote } = usePagesStore();
  const isMobile = useIsMobile();

  const recent = [...pages]
    .filter((p) => p.type !== "daily")
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .slice(0, 6);

  const favorites = pages.filter((p) => p.is_favorite).slice(0, 8);

  return (
    <div className="home-screen">
      <div className="home-content">
        <header className="home-header">
          <p className="home-date">{todayLong()}</p>
          <h1 className="home-greeting">{greeting()}</h1>
        </header>

        <div className="home-actions">
          <button className="home-action" onClick={() => createPage()}>
            <span className="home-action-icon"><FileText size={18} /></span>
            <span className="home-action-label">Nova página</span>
            {!isMobile && <kbd className="home-kbd">⌘N</kbd>}
          </button>
          <button className="home-action" onClick={() => createPage(undefined, { type: "canvas" })}>
            <span className="home-action-icon"><PenTool size={18} /></span>
            <span className="home-action-label">Novo canvas</span>
          </button>
          <button className="home-action" onClick={() => createDailyNote()}>
            <span className="home-action-icon"><CalendarDays size={18} /></span>
            <span className="home-action-label">Nota de hoje</span>
          </button>
          <button className="home-action" onClick={onSearch}>
            <span className="home-action-icon"><Search size={18} /></span>
            <span className="home-action-label">Buscar</span>
            {!isMobile && <kbd className="home-kbd">⌘K</kbd>}
          </button>
          <button className="home-action" onClick={onTemplates}>
            <span className="home-action-icon"><LayoutTemplate size={18} /></span>
            <span className="home-action-label">Templates</span>
          </button>
        </div>

        {favorites.length > 0 && (
          <section className="home-section">
            <h2 className="home-section-title">
              <Star size={13} /> Favoritas
            </h2>
            <div className="home-fav-row">
              {favorites.map((p) => (
                <button key={p.id} className="home-fav-chip" onClick={() => revealInTree(p.id)}>
                  <span className="home-fav-icon">{pageIcon(p)}</span>
                  {p.title || "Sem título"}
                </button>
              ))}
            </div>
          </section>
        )}

        {recent.length > 0 && (
          <section className="home-section">
            <h2 className="home-section-title">
              <Clock size={13} /> Editadas recentemente
            </h2>
            <div className="home-recent-grid">
              {recent.map((p, i) => (
                <button
                  key={p.id}
                  className="home-recent-card"
                  style={{ animationDelay: `${0.25 + i * 0.06}s` }}
                  onClick={() => revealInTree(p.id)}
                >
                  <span className="home-recent-icon">{pageIcon(p)}</span>
                  <span className="home-recent-title">{p.title || "Sem título"}</span>
                  <span className="home-recent-time">{relativeTime(p.updated_at)}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {pages.length === 0 && (
          <p className="home-empty-hint">
            Comece criando sua primeira página, ou explore os templates prontos.
          </p>
        )}
      </div>
    </div>
  );
}
