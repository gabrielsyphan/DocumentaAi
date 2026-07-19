import { useEffect, useRef, useState } from "react";
import { Volume2, Turtle } from "lucide-react";
import type { Flashcard } from "../../types";
import {
  checkAnswer, speakEnglish, stopSpeaking, xpFor,
  type AnswerVerdict, type SessionResult,
} from "../../lib/arcade";

interface Props {
  round: Flashcard[];
  onFinish: (result: SessionResult) => void;
}

export default function ListeningGame({ round, onFinish }: Props) {
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [verdict, setVerdict] = useState<AnswerVerdict | "skipped" | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [xp, setXp] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const card = round[idx];

  // Fala automaticamente ao entrar em cada pergunta; para ao sair do jogo
  useEffect(() => {
    speakEnglish(card.front);
    inputRef.current?.focus();
    return stopSpeaking;
  }, [card]);

  function handleCheck() {
    if (verdict !== null || !input.trim()) return;
    const v = checkAnswer(input, card.front);
    setVerdict(v);
    if (v !== "wrong") {
      const newCombo = combo + 1;
      setXp((x) => x + xpFor(v === "exact" ? "correct" : "close", newCombo));
      setCombo(newCombo);
      setBestCombo((b) => Math.max(b, newCombo));
      setCorrectCount((c) => c + 1);
    } else {
      setCombo(0);
    }
  }

  function handleSkip() {
    if (verdict !== null) return;
    setVerdict("skipped");
    setCombo(0);
  }

  function handleNext() {
    if (idx + 1 >= round.length) {
      onFinish({ correct: correctCount, total: round.length, xp, bestCombo });
    } else {
      setIdx(idx + 1);
      setInput("");
      setVerdict(null);
    }
  }

  const answered = verdict !== null;

  return (
    <div className="arcade-game">
      <div className="arcade-progress">
        <div className="arcade-progress-fill" style={{ width: `${(idx / round.length) * 100}%` }} />
      </div>
      <div className="arcade-game-meta">
        <span>{idx + 1} / {round.length}</span>
        {combo >= 2 && <span className="arcade-combo">combo ×{combo}</span>}
        <span className="arcade-xp-live">+{xp} XP</span>
      </div>

      <p className="arcade-question-label">Escreva o que você ouvir</p>

      <div className="arcade-listen-controls">
        <button className="arcade-listen-btn" onClick={() => speakEnglish(card.front)} title="Ouvir de novo">
          <Volume2 size={26} />
        </button>
        <button
          className="arcade-listen-btn small"
          onClick={() => speakEnglish(card.front, 0.65)}
          title="Ouvir devagar"
        >
          <Turtle size={20} />
        </button>
      </div>

      <input
        ref={inputRef}
        className="arcade-input"
        placeholder="Digite o que ouviu…"
        value={input}
        disabled={answered}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") answered ? handleNext() : handleCheck();
        }}
      />

      {!answered ? (
        <div className="arcade-actions">
          <button className="arcade-btn ghost" onClick={handleSkip}>Não sei</button>
          <button className="arcade-btn primary" onClick={handleCheck} disabled={!input.trim()}>
            Verificar
          </button>
        </div>
      ) : (
        <>
          <div className={`arcade-feedback ${verdict === "wrong" || verdict === "skipped" ? "bad" : "good"}`}>
            {verdict === "exact" && <strong>Perfeito!</strong>}
            {verdict === "close" && (
              <span><strong>Quase!</strong> O texto era: {card.front}</span>
            )}
            {(verdict === "wrong" || verdict === "skipped") && (
              <span><strong>O texto era:</strong> {card.front}</span>
            )}
            {card.back && <span className="arcade-feedback-extra">({card.back})</span>}
          </div>
          <div className="arcade-actions">
            <button className="arcade-btn primary" onClick={handleNext} autoFocus>
              {idx + 1 >= round.length ? "Ver resultado" : "Continuar (Enter)"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
