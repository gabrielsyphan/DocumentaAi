import { useEffect, useMemo, useRef, useState } from "react";
import type { Flashcard } from "../../types";
import { checkAnswer, xpFor, type AnswerVerdict, type SessionResult } from "../../lib/arcade";
import { playCorrect, playWrong } from "../../lib/sound";

interface Props {
  round: Flashcard[];
  onFinish: (result: SessionResult) => void;
}

export default function TypeAnswerGame({ round, onFinish }: Props) {
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [verdict, setVerdict] = useState<AnswerVerdict | "skipped" | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [xp, setXp] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Direção sorteada por pergunta: metade mostra a frente (responda o verso),
  // metade mostra o verso (responda a frente — a direção "produtiva")
  const directions = useMemo(() => round.map(() => Math.random() < 0.5), [round]);

  const card = round[idx];
  const showFront = directions[idx];
  const prompt = showFront ? card.front : card.back;
  const expected = showFront ? card.back : card.front;

  useEffect(() => {
    inputRef.current?.focus();
  }, [idx]);

  function handleCheck() {
    if (verdict !== null || !input.trim()) return;
    const v = checkAnswer(input, expected);
    setVerdict(v);
    if (v !== "wrong") {
      playCorrect();
      const newCombo = combo + 1;
      setXp((x) => x + xpFor(v === "exact" ? "correct" : "close", newCombo));
      setCombo(newCombo);
      setBestCombo((b) => Math.max(b, newCombo));
      setCorrectCount((c) => c + 1);
    } else {
      playWrong();
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

      <p className="arcade-question-label">
        {showFront ? "Escreva o verso deste card" : "Escreva a frente deste card"}
      </p>
      <div className="arcade-prompt">{prompt}</div>

      <input
        ref={inputRef}
        className="arcade-input"
        placeholder="Digite a resposta…"
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
              <span><strong>Quase perfeito!</strong> Resposta exata: {expected}</span>
            )}
            {(verdict === "wrong" || verdict === "skipped") && (
              <span><strong>Resposta certa:</strong> {expected}</span>
            )}
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
