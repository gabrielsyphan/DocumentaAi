import { useEffect, useMemo, useRef, useState } from "react";
import { Search, FileText, PenTool, Folder, CalendarDays } from "lucide-react";
import { usePagesStore } from "../../store/pages.store";
import { useUIStore } from "../../store/ui.store";
import { extractParagraphs } from "../../lib/tts";
import { foldText } from "../../lib/text-search";
import type { Page } from "../../types";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ContentMatch {
  page: Page;
  before: string;
  match: string;
  after: string;
}

const CONTENT_MATCH_LIMIT = 20;
const SNIPPET_RADIUS = 45;

// Só páginas 'document'/'daily' têm conteúdo BlockNote (blocos); canvas
// guarda um JSON de outro formato (elements/appState) e não faz sentido buscar.
function hasBlockContent(page: Page): boolean {
  return page.type === "document" || page.type === "daily";
}

function pageIcon(page: Page) {
  if (page.type === "daily") return <CalendarDays size={14} />;
  if (page.emoji) return <span style={{ fontSize: 14, lineHeight: 1 }}>{page.emoji}</span>;
  if (page.type === "canvas") return <PenTool size={14} />;
  if (page.type === "folder") return <Folder size={14} />;
  return <FileText size={14} />;
}

export default function SearchModal({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const { pages, selectPage } = usePagesStore();
  const { setPendingFindQuery } = useUIStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // ⌘K ou Esc fecham o modal
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Texto plano de cada página, extraído uma vez por mudança nas páginas (não
  // a cada tecla digitada) — evita reparsear todo o JSON do BlockNote a cada
  // caractere da busca.
  const pageParagraphs = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const page of pages) {
      if (!hasBlockContent(page) || !page.content) continue;
      try {
        const blocks = JSON.parse(page.content);
        if (Array.isArray(blocks)) map.set(page.id, extractParagraphs(blocks));
      } catch {
        // conteúdo corrompido/formato inesperado — ignora essa página na busca
      }
    }
    return map;
  }, [pages]);

  const q = query.trim();
  const folded = foldText(q);

  const titleMatches = q
    ? pages.filter((p) => foldText(p.title || "Sem título").includes(folded))
    : pages.slice(0, 10);

  const contentMatches = useMemo(() => {
    if (!folded) return [] as ContentMatch[];
    const titleMatchIds = new Set(titleMatches.map((p) => p.id));
    const results: ContentMatch[] = [];
    for (const page of pages) {
      if (titleMatchIds.has(page.id)) continue; // já aparece na seção de títulos
      const paragraphs = pageParagraphs.get(page.id);
      if (!paragraphs) continue;
      for (const para of paragraphs) {
        const idx = foldText(para).indexOf(folded);
        if (idx === -1) continue;
        const start = Math.max(0, idx - SNIPPET_RADIUS);
        const end = Math.min(para.length, idx + q.length + SNIPPET_RADIUS);
        results.push({
          page,
          before: (start > 0 ? "…" : "") + para.slice(start, idx),
          match: para.slice(idx, idx + q.length),
          after: para.slice(idx + q.length, end) + (end < para.length ? "…" : ""),
        });
        break; // um trecho por página é suficiente para localizar
      }
      if (results.length >= CONTENT_MATCH_LIMIT) break;
    }
    return results;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folded, pages, pageParagraphs]);

  function handleSelectPage(id: string) {
    selectPage(id);
    onClose();
  }

  function handleSelectContent(match: ContentMatch) {
    selectPage(match.page.id);
    setPendingFindQuery(q);
    onClose();
  }

  if (!open) return null;

  const nothingFound = titleMatches.length === 0 && contentMatches.length === 0;

  return (
    <div className="search-overlay" onClick={onClose}>
      <div
        className="search-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Buscar páginas"
      >
        <div className="search-input-row">
          <Search size={15} className="search-icon" />
          <input
            ref={inputRef}
            className="search-input"
            placeholder="Buscar páginas e conteúdo..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="search-kbd">Esc</kbd>
        </div>

        <div className="search-results">
          {nothingFound ? (
            <p className="search-empty">Nenhum resultado encontrado</p>
          ) : (
            <>
              {titleMatches.length > 0 && q && (
                <div className="search-group-label">Páginas</div>
              )}
              {titleMatches.map((page) => (
                <button
                  key={page.id}
                  className="search-result-item"
                  onClick={() => handleSelectPage(page.id)}
                >
                  {pageIcon(page)}
                  <span>{page.title || "Sem título"}</span>
                </button>
              ))}

              {contentMatches.length > 0 && (
                <div className="search-group-label">Dentro das páginas</div>
              )}
              {contentMatches.map((m, i) => (
                <button
                  key={`${m.page.id}-${i}`}
                  className="search-result-item search-result-content"
                  onClick={() => handleSelectContent(m)}
                >
                  {pageIcon(m.page)}
                  <span className="search-result-content-body">
                    <span className="search-result-content-title">{m.page.title || "Sem título"}</span>
                    <span className="search-result-snippet">
                      {m.before}
                      <mark>{m.match}</mark>
                      {m.after}
                    </span>
                  </span>
                </button>
              ))}
            </>
          )}
        </div>

        {!query && pages.length > 0 && (
          <div className="search-hint">Todas as páginas</div>
        )}
      </div>
    </div>
  );
}
