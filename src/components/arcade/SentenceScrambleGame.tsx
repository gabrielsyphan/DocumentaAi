import { useMemo, useState } from "react";
import type { Flashcard } from "../../types";
import {
  normalizeAnswer, scrambleTarget, scrambleWords, xpFor, type SessionResult,
} from "../../lib/arcade";
import { playCorrect, playWrong } from "../../lib/sound";

interface Props {
  round: Flashcard[];
  onFinish: (result: SessionResult) => void;
}

interface Chip {
  id: number;
  word: string;
}

export default function SentenceScrambleGame({ round, onFinish }: Props) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number[]>([]); // ids na ordem escolhida
  const [verdict, setVerdict] = useState<"exact" | "wrong" | "skipped" | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [xp, setXp] = useState(0);

  // Alvo/dica e chips embaralhados, fixos por pergunta
  const question = useMemo(() => {
    const card = round[idx];
    const st = scrambleTarget(card)!; // rodada já vem filtrada por elegibilidade
    const chips: Chip[] = scrambleWords(st.target).map((word, i) => ({ id: i, word }));
    return { ...st, chips };
  }, [round, idx]);

  const available = question.chips.filter((c) => !picked.includes(c.id));
  const answered = verdict !== null;

  function handlePick(chip: Chip) {
    if (answered) return;
    setPicked((p) => [...p, chip.id]);
  }

  function handleUnpick(id: number) {
    if (answered) return;
    setPicked((p) => p.filter((x) => x !== id));
  }

  function handleCheck() {
    if (answered || picked.length !== question.chips.length) return;
    const built = picked
      .map((id) => question.chips.find((c) => c.id === id)!.word)
      .join(" ");
    const hit = normalizeAnswer(built) === normalizeAnswer(question.target);
    setVerdict(hit ? "exact" : "wrong");
    if (hit) {
      playCorrect();
      const newCombo = combo + 1;
      setXp((x) => x + xpFor("correct", newCombo));
      setCombo(newCombo);
      setBestCombo((b) => Math.max(b, newCombo));
      setCorrectCount((c) => c + 1);
    } else {
      playWrong();
      setCombo(0);
    }
  }

  function handleSkip() {
    if (answered) return;
    setVerdict("skipped");
    setCombo(0);
  }

  function handleNext() {
    if (idx + 1 >= round.length) {
      onFinish({ correct: correctCount, total: round.length, xp, bestCombo });
    } else {
      setIdx(idx + 1);
      setPicked([]);
      setVerdict(null);
    }
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

      <p className="arcade-question-label">Monte a frase que corresponde a:</p>
      <div className="arcade-prompt">{question.prompt}</div>

      <div className={`arcade-scramble-answer${answered ? (verdict === "exact" ? " good" : " bad") : ""}`}>
        {picked.length === 0 && <span className="arcade-scramble-placeholder">Toque nas palavras abaixo…</span>}
        {picked.map((id) => {
          const chip = question.chips.find((c) => c.id === id)!;
          return (
            <button key={id} className="arcade-word-chip picked" onClick={() => handleUnpick(id)}>
              {chip.word}
            </button>
          );
        })}
      </div>

      <div className="arcade-scramble-pool">
        {available.map((chip) => (
          <button key={chip.id} className="arcade-word-chip" onClick={() => handlePick(chip)}>
            {chip.word}
          </button>
        ))}
      </div>

      {!answered ? (
        <div className="arcade-actions">
          <button className="arcade-btn ghost" onClick={handleSkip}>Não sei</button>
          <button
            className="arcade-btn primary"
            onClick={handleCheck}
            disabled={picked.length !== question.chips.length}
          >
            Verificar
          </button>
        </div>
      ) : (
        <>
          <div className={`arcade-feedback ${verdict === "exact" ? "good" : "bad"}`}>
            {verdict === "exact" ? (
              <strong>Perfeito!</strong>
            ) : (
              <span><strong>A frase era:</strong> {question.target}</span>
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
