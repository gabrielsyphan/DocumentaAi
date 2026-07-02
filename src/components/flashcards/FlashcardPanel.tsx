import { useEffect, useState } from "react";
import { BookOpen, X, RotateCcw, Check, Trophy, Plus, Trash2 } from "lucide-react";
import type { Flashcard } from "../../types";
import {
  createFlashcard,
  updateFlashcard,
  fetchFlashcardsByPage,
  fetchDueFlashcards,
  countDueFlashcards,
  deleteFlashcard,
} from "../../lib/db";
import { sm2, nextReviewDate, todayStr } from "../../lib/sm2";

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
  onClose,
  onCreated,
}: {
  pageId: string;
  initialFront: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [front, setFront] = useState(initialFront);
  const [back, setBack] = useState("");
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchFlashcardsByPage(pageId).then(setCards);
  }, [pageId]);

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
