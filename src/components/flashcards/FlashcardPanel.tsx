import { useEffect, useRef, useState } from "react";
import { BookOpen, X, RotateCcw, Check, Trophy, Plus, Trash2, ListPlus, FileDown, FileText, Table2, Scissors, PenLine } from "lucide-react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Flashcard } from "../../types";
import { usePagesStore } from "../../store/pages.store";
import { useIsMobile } from "../../hooks/useIsMobile";
import {
  createFlashcard,
  updateFlashcard,
  fetchFlashcardsByPage,
  fetchDueFlashcards,
  countDueFlashcards,
  deleteFlashcard,
  deleteFlashcardsByPage,
} from "../../lib/db";
import { sm2, nextReviewDate, todayStr } from "../../lib/sm2";
import { parseCardsFromBlocks, normalizeCardKey, flashcardsToAnkiCsv, safeFileName, type ParsedCard } from "../../lib/flashcard-import";
import { exportStudySheetPdf, exportCutCardsPdf, exportQuizPdf } from "../../lib/flashcard-pdf";

// ── Contador de cards pendentes ───────────────────────────────────────────────

export function useDueCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    countDueFlashcards().then(setCount);
    const timer = setInterval(() => countDueFlashcards().then(setCount), 30_000);
    return () => clearInterval(timer);
  }, []);
  return count;
}

// ── Criar flashcard ───────────────────────────────────────────────────────────

export function CreateFlashcardModal({
  pageId,
  initialFront,
  getBlocks,
  onClose,
  onCreated,
}: {
  pageId: string;
  initialFront: string;
  /** Blocos atuais do editor, para "Importar da página" */
  getBlocks?: () => unknown;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [front, setFront] = useState(initialFront);
  const [back, setBack] = useState("");
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<ParsedCard[] | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [exported, setExported] = useState(false);
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pageTitle = usePagesStore((s) => s.pages.find((p) => p.id === pageId)?.title) ?? "";
  const isMobile = useIsMobile();

  useEffect(() => {
    fetchFlashcardsByPage(pageId).then(setCards);
    return () => clearTimeout(confirmTimer.current);
  }, [pageId]);

  const existingKeys = new Set(cards.map((c) => normalizeCardKey(c.front)));
  const newFromPreview = (preview ?? []).filter(
    (p, i, arr) =>
      !existingKeys.has(normalizeCardKey(p.front)) &&
      // descarta duplicado dentro da própria lista (mantém a 1ª ocorrência)
      arr.findIndex((o) => normalizeCardKey(o.front) === normalizeCardKey(p.front)) === i
  );

  function handleParsePage() {
    setPreview(parseCardsFromBlocks(getBlocks?.() ?? []));
  }

  async function handleImport() {
    if (newFromPreview.length === 0) return;
    setSaving(true);
    const now = new Date().toISOString();
    for (const c of newFromPreview) {
      await createFlashcard({
        id: crypto.randomUUID(),
        page_id: pageId,
        front: c.front,
        back: c.back,
        interval: 1,
        repetitions: 0,
        ease_factor: 2.5,
        next_review: todayStr(),
        last_reviewed: null,
        created_at: now,
      });
    }
    setSaving(false);
    setPreview(null);
    setCards(await fetchFlashcardsByPage(pageId));
    onCreated();
  }

  async function handleExportCsv() {
    // Exporta na ordem de criação (a lista da tela é mais-recente-primeiro)
    const csv = flashcardsToAnkiCsv([...cards].reverse());
    const fileName = `${safeFileName(pageTitle)}-flashcards.csv`;
    let saved = false;
    if (isTauri()) {
      saved = await invoke<boolean>("save_text_file", {
        suggestedName: fileName,
        filterName: "CSV",
        extensions: ["csv"],
        contents: csv,
      });
    } else {
      // npm run dev no browser: download via blob funciona normalmente
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      saved = true;
    }
    if (saved) {
      setExported(true);
      setTimeout(() => setExported(false), 2000);
    }
  }

  async function handleExportPdf(kind: "sheet" | "cards" | "quiz") {
    setPdfMenuOpen(false);
    setPdfBusy(true);
    // Ordem de criação (a lista da tela é mais-recente-primeiro)
    const ordered = [...cards].reverse();
    try {
      if (kind === "sheet") await exportStudySheetPdf(pageTitle, ordered);
      else if (kind === "cards") await exportCutCardsPdf(pageTitle, ordered);
      else await exportQuizPdf(pageTitle, ordered);
    } finally {
      setPdfBusy(false);
    }
  }

  async function handleClearAll() {
    if (!confirmClear) {
      setConfirmClear(true);
      clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    clearTimeout(confirmTimer.current);
    setConfirmClear(false);
    await deleteFlashcardsByPage(pageId);
    setCards([]);
    onCreated();
  }

  async function handleCreate() {
    if (!front.trim()) return;
    setSaving(true);
    const now = new Date().toISOString();
    await createFlashcard({
      id: crypto.randomUUID(),
      page_id: pageId,
      front: front.trim(),
      back: back.trim(),
      interval: 1,
      repetitions: 0,
      ease_factor: 2.5,
      next_review: todayStr(),
      last_reviewed: null,
      created_at: now,
    });
    setFront("");
    setBack("");
    setSaving(false);
    const updated = await fetchFlashcardsByPage(pageId);
    setCards(updated);
    onCreated();
  }

  async function handleDelete(id: string) {
    await deleteFlashcard(id);
    setCards((prev) => prev.filter((c) => c.id !== id));
    onCreated();
  }

  return (
    <div className="fc-overlay" onClick={onClose}>
      <div className="fc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fc-modal-header">
          <span className="fc-modal-title"><BookOpen size={14} /> Flashcards desta página</span>
          <button className="fc-close" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="fc-create-form">
          <textarea
            className="fc-textarea"
            placeholder="Frente (pergunta ou conceito)…"
            value={front}
            onChange={(e) => setFront(e.target.value)}
            rows={2}
          />
          <textarea
            className="fc-textarea"
            placeholder="Verso (resposta ou explicação) — opcional"
            value={back}
            onChange={(e) => setBack(e.target.value)}
            rows={2}
          />
          <button
            className="fc-create-btn"
            onClick={handleCreate}
            disabled={saving || !front.trim()}
          >
            <Plus size={13} /> Criar card
          </button>
        </div>

        <div className="fc-tools">
          {getBlocks && (
            <button className="fc-tool-btn" onClick={handleParsePage} title='Cria um card para cada linha "frente - verso" da página'>
              <ListPlus size={12} /> Importar da página
            </button>
          )}
          {cards.length > 0 && !isMobile && (
            <button
              className="fc-tool-btn"
              onClick={handleExportCsv}
              title="Salva um .csv pronto para importar no Anki (Arquivo → Importar)"
            >
              <FileDown size={12} /> {exported ? "Exportado ✓" : "Exportar CSV (Anki)"}
            </button>
          )}
          {cards.length > 0 && !isMobile && (
            <div className="fc-export-wrap">
              <button
                className="fc-tool-btn"
                onClick={() => setPdfMenuOpen((v) => !v)}
                disabled={pdfBusy}
                title="Gera um PDF de estudo com os cards desta página"
              >
                <FileText size={12} /> {pdfBusy ? "Gerando…" : "Exportar PDF"}
              </button>
              {pdfMenuOpen && (
                <>
                  <div className="fc-export-backdrop" onClick={() => setPdfMenuOpen(false)} />
                  <div className="fc-export-menu">
                    <button className="fc-export-item" onClick={() => handleExportPdf("sheet")}>
                      <Table2 size={13} />
                      <span>
                        Folha de estudo
                        <small>Tabela frente | verso — dobre e teste-se</small>
                      </span>
                    </button>
                    <button className="fc-export-item" onClick={() => handleExportPdf("cards")}>
                      <Scissors size={13} />
                      <span>
                        Cartões recortáveis
                        <small>Imprima frente e verso, recorte e use</small>
                      </span>
                    </button>
                    <button className="fc-export-item" onClick={() => handleExportPdf("quiz")}>
                      <PenLine size={13} />
                      <span>
                        Quiz com gabarito
                        <small>Escreva as respostas e confira no final</small>
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {cards.length > 0 && (
            <button
              className={`fc-tool-btn danger${confirmClear ? " confirm" : ""}`}
              onClick={handleClearAll}
            >
              <Trash2 size={12} />
              {confirmClear ? "Clique de novo p/ confirmar" : `Excluir todos (${cards.length})`}
            </button>
          )}
        </div>

        {preview !== null && (
          <div className="fc-import-preview">
            <div className="fc-list-label">
              {preview.length === 0
                ? "Nenhum par encontrado"
                : `${preview.length} ${preview.length === 1 ? "par encontrado" : "pares encontrados"} · ${newFromPreview.length} novos`}
            </div>
            {preview.length === 0 ? (
              <p className="fc-empty-hint">
                Escreva cada frase numa linha no formato <code>frente - verso</code> (com espaços ao redor do hífen).
              </p>
            ) : (
              <div className="fc-import-list">
                {preview.map((p, i) => {
                  const isDup = existingKeys.has(normalizeCardKey(p.front)) ||
                    preview.findIndex((o) => normalizeCardKey(o.front) === normalizeCardKey(p.front)) !== i;
                  return (
                    <div key={i} className={`fc-card-row${isDup ? " fc-import-dup" : ""}`}>
                      <div className="fc-card-row-text">
                        <span className="fc-card-front">{p.front}</span>
                        <span className="fc-card-back">{p.back || "(sem verso)"}</span>
                      </div>
                      {isDup && <span className="fc-card-due">já existe</span>}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="fc-import-actions">
              {newFromPreview.length > 0 && (
                <button className="fc-create-btn" onClick={handleImport} disabled={saving}>
                  <ListPlus size={13} />
                  {saving ? "Importando…" : `Importar ${newFromPreview.length} ${newFromPreview.length === 1 ? "card" : "cards"}`}
                </button>
              )}
              <button className="fc-tool-btn" onClick={() => setPreview(null)}>Cancelar</button>
            </div>
          </div>
        )}

        {cards.length === 0 && preview === null && (
          <p className="fc-empty-hint">
            Selecione um trecho no editor antes de abrir este painel para pré-preencher a frente do card.
          </p>
        )}

        {cards.length > 0 && (
          <div className="fc-card-list">
            <div className="fc-list-label">Cards existentes ({cards.length})</div>
            {cards.map((card) => (
              <div key={card.id} className="fc-card-row">
                <div className="fc-card-row-text">
                  <span className="fc-card-front">{card.front}</span>
                  {card.back && <span className="fc-card-back">{card.back}</span>}
                </div>
                <span className="fc-card-due">
                  {card.next_review <= todayStr() ? "Pendente" : card.next_review}
                </span>
                <button
                  className="fc-delete-btn"
                  onClick={() => handleDelete(card.id)}
                  title="Excluir card"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sessão de revisão ─────────────────────────────────────────────────────────

type ReviewPhase = "front" | "back" | "done";

export function ReviewSession({ onClose }: { onClose: () => void }) {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<ReviewPhase>("front");
  const [reviewed, setReviewed] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDueFlashcards().then((c) => { setCards(c); setLoading(false); });
  }, []);

  const card = cards[idx];
  const total = cards.length;

  async function handleRate(quality: 0 | 3 | 4 | 5) {
    if (!card) return;
    const result = sm2(quality, {
      interval: card.interval,
      repetitions: card.repetitions,
      easeFactor: card.ease_factor,
    });
    await updateFlashcard(card.id, {
      interval: result.interval,
      repetitions: result.repetitions,
      ease_factor: result.easeFactor,
      next_review: nextReviewDate(result.interval),
      last_reviewed: todayStr(),
    });
    setReviewed((r) => r + 1);
    if (idx + 1 >= total) {
      setPhase("done");
    } else {
      setIdx((i) => i + 1);
      setPhase("front");
    }
  }

  if (loading) return (
    <div className="fc-overlay" onClick={onClose}>
      <div className="fc-modal fc-review-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fc-review-loading">Carregando…</div>
      </div>
    </div>
  );

  return (
    <div className="fc-overlay" onClick={onClose}>
      <div className="fc-modal fc-review-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fc-modal-header">
          <span className="fc-modal-title">
            <BookOpen size={14} />
            Revisão — {idx + 1} / {total}
          </span>
          <button className="fc-close" onClick={onClose}><X size={14} /></button>
        </div>

        {total === 0 ? (
          <div className="fc-review-done">
            <Trophy size={32} className="fc-trophy" />
            <h2>Sem cards para revisar!</h2>
            <p>Você está em dia. Volte mais tarde ou crie novos flashcards.</p>
            <button className="fc-done-btn" onClick={onClose}>Fechar</button>
          </div>
        ) : phase === "done" ? (
          <div className="fc-review-done">
            <Trophy size={32} className="fc-trophy" />
            <h2>Sessão concluída!</h2>
            <p>Você revisou <strong>{reviewed}</strong> {reviewed === 1 ? "card" : "cards"}.</p>
            <button className="fc-done-btn" onClick={onClose}>
              <Check size={14} /> Fechar
            </button>
          </div>
        ) : (
          <>
            <div className="fc-progress-bar">
              <div className="fc-progress-fill" style={{ width: `${(idx / total) * 100}%` }} />
            </div>

            <div className="fc-card-display">
              <div className="fc-card-face front">
                <p className="fc-card-text">{card.front}</p>
              </div>

              {phase === "back" && (
                <>
                  <div className="fc-card-divider">
                    <RotateCcw size={12} />
                    <span>Verso</span>
                  </div>
                  <div className="fc-card-face back">
                    <p className="fc-card-text">
                      {card.back || <span className="fc-no-back">Sem verso definido</span>}
                    </p>
                  </div>
                </>
              )}
            </div>

            {phase === "front" ? (
              <div className="fc-actions single">
                <button
                  className="fc-flip-btn"
                  onClick={() => setPhase("back")}
                >
                  <RotateCcw size={14} />
                  Virar card
                </button>
              </div>
            ) : (
              <div className="fc-actions rating">
                <button className="fc-rate-btn errei" onClick={() => handleRate(0)}>
                  Errei
                </button>
                <button className="fc-rate-btn dificil" onClick={() => handleRate(3)}>
                  Difícil
                </button>
                <button className="fc-rate-btn ok" onClick={() => handleRate(4)}>
                  OK
                </button>
                <button className="fc-rate-btn facil" onClick={() => handleRate(5)}>
                  Fácil
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
