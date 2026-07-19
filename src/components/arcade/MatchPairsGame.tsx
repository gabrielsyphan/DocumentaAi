import { useEffect, useMemo, useRef, useState } from "react";
import type { Flashcard } from "../../types";
import { shuffle, XP_PAIR, type SessionResult } from "../../lib/arcade";

interface Props {
  round: Flashcard[];
  onFinish: (result: SessionResult) => void;
}

const PAIRS_PER_BOARD = 5;

interface Chip {
  cardId: string;
  text: string;
  side: "front" | "back";
}

export default function MatchPairsGame({ round, onFinish }: Props) {
  // Tabuleiros de até 5 pares
  const boards = useMemo(() => {
    const out: Flashcard[][] = [];
    for (let i = 0; i < round.length; i += PAIRS_PER_BOARD) {
      const slice = round.slice(i, i + PAIRS_PER_BOARD);
      if (slice.length >= 2) out.push(slice);
      else if (out.length > 0) out[out.length - 1].push(...slice);
      else out.push(slice);
    }
    return out;
  }, [round]);

  const [boardIdx, setBoardIdx] = useState(0);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Chip | null>(null);
  const [wrongPair, setWrongPair] = useState<[string, string] | null>(null); // [cardId+side, ...]
  const [errors, setErrors] = useState(0);
  const [totalMatched, setTotalMatched] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const doneRef = useRef(false);

  const board = boards[boardIdx];

  const chips = useMemo(() => {
    const fronts: Chip[] = shuffle(board.map((c) => ({ cardId: c.id, text: c.front, side: "front" as const })));
    const backs: Chip[] = shuffle(board.map((c) => ({ cardId: c.id, text: c.back, side: "back" as const })));
    return { fronts, backs };
  }, [board]);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const totalPairs = round.length;

  function chipKey(c: Chip) {
    return `${c.cardId}:${c.side}`;
  }

  function handleChip(chip: Chip) {
    if (matched.has(chip.cardId) || wrongPair) return;
    if (!selected) {
      setSelected(chip);
      return;
    }
    if (chipKey(selected) === chipKey(chip)) {
      setSelected(null); // clicou de novo no mesmo — desmarca
      return;
    }
    if (selected.side === chip.side) {
      setSelected(chip); // trocou a seleção dentro da mesma coluna
      return;
    }
    // Um de cada lado: verifica o par
    if (selected.cardId === chip.cardId) {
      const newMatched = new Set(matched).add(chip.cardId);
      setMatched(newMatched);
      setSelected(null);
      const newTotal = totalMatched + 1;
      setTotalMatched(newTotal);
      if (newMatched.size === board.length) {
        if (boardIdx + 1 < boards.length) {
          setTimeout(() => {
            setBoardIdx(boardIdx + 1);
            setMatched(new Set());
          }, 450);
        } else if (!doneRef.current) {
          doneRef.current = true;
          setTimeout(() => {
            onFinish({
              correct: newTotal,
              total: totalPairs,
              xp: Math.max(0, newTotal * XP_PAIR - errors * 2),
              bestCombo: 0,
            });
          }, 550);
        }
      }
    } else {
      setErrors((e) => e + 1);
      setWrongPair([chipKey(selected), chipKey(chip)]);
      setSelected(null);
      setTimeout(() => setWrongPair(null), 550);
    }
  }

  function renderChip(chip: Chip) {
    const key = chipKey(chip);
    let cls = "arcade-chip";
    if (matched.has(chip.cardId)) cls += " matched";
    else if (selected && chipKey(selected) === key) cls += " selected";
    else if (wrongPair?.includes(key)) cls += " wrong";
    return (
      <button key={key} className={cls} onClick={() => handleChip(chip)}>
        {chip.text}
      </button>
    );
  }

  return (
    <div className="arcade-game">
      <div className="arcade-progress">
        <div className="arcade-progress-fill" style={{ width: `${(totalMatched / totalPairs) * 100}%` }} />
      </div>
      <div className="arcade-game-meta">
        <span>{totalMatched} / {totalPairs} pares</span>
        <span>{errors > 0 ? `${errors} ${errors === 1 ? "erro" : "erros"}` : "sem erros"}</span>
        <span className="arcade-xp-live">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </span>
      </div>

      <p className="arcade-question-label">Combine cada frente com o seu verso</p>

      <div className="arcade-match-board">
        <div className="arcade-match-col">{chips.fronts.map(renderChip)}</div>
        <div className="arcade-match-col">{chips.backs.map(renderChip)}</div>
      </div>
    </div>
  );
}
