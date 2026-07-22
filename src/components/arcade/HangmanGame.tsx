import { useEffect, useMemo, useState } from "react";
import { Heart } from "lucide-react";
import type { Flashcard } from "../../types";
import { normalizeLetter, xpFor, type SessionResult } from "../../lib/arcade";
import { playCorrect, playWrong } from "../../lib/sound";

interface Props {
  round: Flashcard[];
  onFinish: (result: SessionResult) => void;
}

const MAX_LIVES = 6;
const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

function isLetter(ch: string): boolean {
  return /[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(ch);
}

export default function HangmanGame({ round, onFinish }: Props) {
  const [idx, setIdx] = useState(0);
  const [guessed, setGuessed] = useState<Set<string>>(new Set()); // letras normalizadas
  const [lives, setLives] = useState(MAX_LIVES);
  const [verdict, setVerdict] = useState<"won" | "lost" | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [xp, setXp] = useState(0);

  const card = round[idx];
  const secret = card.front.trim();

  const secretLetters = useMemo(
    () => new Set([...secret].filter(isLetter).map(normalizeLetter)),
    [secret]
  );

  function handleGuess(raw: string) {
    if (verdict !== null) return;
    const letter = normalizeLetter(raw);
    if (!/^[a-z]$/.test(letter) || guessed.has(letter)) return;
    const newGuessed = new Set(guessed).add(letter);
    setGuessed(newGuessed);

    if (secretLetters.has(letter)) {
      playCorrect();
      const allFound = [...secretLetters].every((l) => newGuessed.has(l));
      if (allFound) {
        setVerdict("won");
        const newCombo = combo + 1;
        // Bônus pelas vidas restantes — errar menos vale mais
        setXp((x) => x + xpFor("correct", newCombo) + lives);
        setCombo(newCombo);
        setBestCombo((b) => Math.max(b, newCombo));
        setCorrectCount((c) => c + 1);
      }
    } else {
      playWrong();
      const newLives = lives - 1;
      setLives(newLives);
      if (newLives === 0) {
        setVerdict("lost");
        setCombo(0);
      }
    }
  }

  // Teclado físico: letras chutam, Enter avança após terminar a palavra
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && verdict !== null) handleNext();
      else if (e.key.length === 1) handleGuess(e.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guessed, lives, verdict, combo, idx]);

  function handleNext() {
    if (idx + 1 >= round.length) {
      onFinish({ correct: correctCount, total: round.length, xp, bestCombo });
    } else {
      setIdx(idx + 1);
      setGuessed(new Set());
      setLives(MAX_LIVES);
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
        <span className="arcade-lives">
          {Array.from({ length: MAX_LIVES }, (_, i) => (
            <Heart key={i} size={13} className={i < lives ? "full" : "empty"} />
          ))}
        </span>
        <span className="arcade-xp-live">+{xp} XP</span>
      </div>

      <p className="arcade-question-label">Descubra a palavra — dica:</p>
      <div className="arcade-prompt">{card.back}</div>

      <div className={`arcade-hangman-word${answered ? (verdict === "won" ? " good" : " bad") : ""}`}>
        {[...secret].map((ch, i) => {
          if (!isLetter(ch)) return <span key={i} className="arcade-hangman-sep">{ch}</span>;
          const show = guessed.has(normalizeLetter(ch)) || answered;
          return (
            <span key={i} className={`arcade-hangman-slot${show ? " revealed" : ""}`}>
              {show ? ch : ""}
            </span>
          );
        })}
      </div>

      {!answered ? (
        <div className="arcade-keyboard">
          {KEY_ROWS.map((row) => (
            <div key={row} className="arcade-keyboard-row">
              {[...row].map((letter) => {
                const used = guessed.has(letter);
                const hit = used && secretLetters.has(letter);
                return (
                  <button
                    key={letter}
                    className={`arcade-key${used ? (hit ? " hit" : " miss") : ""}`}
                    disabled={used}
                    onClick={() => handleGuess(letter)}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className={`arcade-feedback ${verdict === "won" ? "good" : "bad"}`}>
            {verdict === "won" ? (
              <span><strong>Acertou!</strong> {lives} {lives === 1 ? "vida sobrando" : "vidas sobrando"} (+{lives} XP de bônus)</span>
            ) : (
              <span><strong>A palavra era:</strong> {secret}</span>
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
