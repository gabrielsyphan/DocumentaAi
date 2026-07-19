import { useEffect, useMemo, useState } from "react";
import type { Flashcard } from "../../types";
import { pickDistractors, shuffle, xpFor, type SessionResult } from "../../lib/arcade";

interface Props {
  round: Flashcard[];
  /** Todos os cards com verso — pool de distratores */
  pool: Flashcard[];
  onFinish: (result: SessionResult) => void;
}

type Phase = "answering" | "feedback";

export default function MultipleChoiceGame({ round, pool, onFinish }: Props) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("answering");
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [xp, setXp] = useState(0);

  const card = round[idx];

  // Alternativas fixas por pergunta (recalcula só quando muda o card)
  const options = useMemo(() => {
    const distractors = pickDistractors(pool, card, 3);
    return shuffle([{ text: card.back, correct: true }, ...distractors.map((d) => ({ text: d, correct: false }))]);
  }, [card, pool]);

  // Teclas 1–4 escolhem a alternativa correspondente
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= options.length) handlePick(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, phase, combo, xp, idx]);

  function handlePick(i: number) {
    if (phase !== "answering") return;
    setPicked(i);
    setPhase("feedback");
    const hit = options[i].correct;
    let nextXp = xp;
    if (hit) {
      const newCombo = combo + 1;
      nextXp += xpFor("correct", newCombo);
      setXp(nextXp);
      setCombo(newCombo);
      setBestCombo((b) => Math.max(b, newCombo));
      setCorrectCount((c) => c + 1);
    } else {
      setCombo(0);
    }
    setTimeout(() => {
      if (idx + 1 >= round.length) {
        onFinish({
          correct: hit ? correctCount + 1 : correctCount,
          total: round.length,
          xp: nextXp,
          bestCombo: Math.max(bestCombo, hit ? combo + 1 : 0),
        });
      } else {
        setIdx(idx + 1);
        setPicked(null);
        setPhase("answering");
      }
    }, 1100);
  }

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

      <p className="arcade-question-label">Qual é o verso deste card?</p>
      <div className="arcade-prompt">{card.front}</div>

      <div className="arcade-options">
        {options.map((opt, i) => {
          let cls = "arcade-option";
          if (phase === "feedback") {
            if (opt.correct) cls += " correct";
            else if (picked === i) cls += " wrong";
            else cls += " dim";
          }
          return (
            <button key={i} className={cls} onClick={() => handlePick(i)} disabled={phase === "feedback"}>
              <span className="arcade-option-key">{i + 1}</span>
              {opt.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
