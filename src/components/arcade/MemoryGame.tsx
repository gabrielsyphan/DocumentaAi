import { useMemo, useRef, useState } from "react";
import type { Flashcard } from "../../types";
import { shuffle, XP_PAIR, type SessionResult } from "../../lib/arcade";
import { playCorrect, playWrong } from "../../lib/sound";

interface Props {
  round: Flashcard[];
  onFinish: (result: SessionResult) => void;
}

const PAIRS_PER_BOARD = 6;
/** Bônus por fechar o tabuleiro com poucas jogadas (movimentos ≤ pares + 2) */
const XP_SHARP_BONUS = 8;

interface Cell {
  key: string;
  cardId: string;
  text: string;
}

export default function MemoryGame({ round, onFinish }: Props) {
  const boards = useMemo(() => {
    const out: Flashcard[][] = [];
    for (let i = 0; i < round.length; i += PAIRS_PER_BOARD) {
      const slice = round.slice(i, i + PAIRS_PER_BOARD);
      if (slice.length >= 3 || out.length === 0) out.push(slice);
      else out[out.length - 1].push(...slice);
    }
    return out;
  }, [round]);

  const [boardIdx, setBoardIdx] = useState(0);
  const [flipped, setFlipped] = useState<string[]>([]); // até 2 keys viradas
  const [matched, setMatched] = useState<Set<string>>(new Set()); // cardIds
  const [moves, setMoves] = useState(0);
  const [totalMatched, setTotalMatched] = useState(0);
  const [xp, setXp] = useState(0);
  const lockRef = useRef(false);
  const doneRef = useRef(false);

  const board = boards[boardIdx];
  const totalPairs = round.length;

  const cells = useMemo(() => {
    const all: Cell[] = board.flatMap((c) => [
      { key: `${c.id}:front`, cardId: c.id, text: c.front },
      { key: `${c.id}:back`, cardId: c.id, text: c.back },
    ]);
    return shuffle(all);
  }, [board]);

  function advance(newMoves: number, newMatchedSize: number, newTotal: number, xpNow: number) {
    if (newMatchedSize !== board.length) return;
    // Tabuleiro fechado — bônus de precisão e próximo tabuleiro ou fim
    const sharp = newMoves <= board.length + 2;
    const finalXp = xpNow + (sharp ? XP_SHARP_BONUS : 0);
    setXp(finalXp);
    if (boardIdx + 1 < boards.length) {
      setTimeout(() => {
        setBoardIdx(boardIdx + 1);
        setMatched(new Set());
        setFlipped([]);
        setMoves(0);
      }, 650);
    } else if (!doneRef.current) {
      doneRef.current = true;
      setTimeout(() => {
        onFinish({ correct: newTotal, total: totalPairs, xp: finalXp, bestCombo: 0 });
      }, 700);
    }
  }

  function handleCell(cell: Cell) {
    if (lockRef.current || matched.has(cell.cardId) || flipped.includes(cell.key)) return;
    if (flipped.length === 0) {
      setFlipped([cell.key]);
      return;
    }
    const [firstKey] = flipped;
    const first = cells.find((c) => c.key === firstKey)!;
    const newMoves = moves + 1;
    setMoves(newMoves);
    setFlipped([firstKey, cell.key]);
    if (first.cardId === cell.cardId) {
      playCorrect();
      const newMatched = new Set(matched).add(cell.cardId);
      const newTotal = totalMatched + 1;
      const xpNow = xp + XP_PAIR;
      setTimeout(() => {
        setMatched(newMatched);
        setFlipped([]);
        setTotalMatched(newTotal);
        setXp(xpNow);
        advance(newMoves, newMatched.size, newTotal, xpNow);
      }, 350);
    } else {
      playWrong();
      lockRef.current = true;
      setTimeout(() => {
        setFlipped([]);
        lockRef.current = false;
      }, 950);
    }
  }

  return (
    <div className="arcade-game">
      <div className="arcade-progress">
        <div className="arcade-progress-fill" style={{ width: `${(totalMatched / totalPairs) * 100}%` }} />
      </div>
      <div className="arcade-game-meta">
        <span>{totalMatched} / {totalPairs} pares</span>
        <span>{moves} jogadas</span>
        {boards.length > 1 && <span>tabuleiro {boardIdx + 1}/{boards.length}</span>}
        <span className="arcade-xp-live">+{xp} XP</span>
      </div>

      <p className="arcade-question-label">Encontre os pares frente ↔ verso</p>

      <div className="arcade-memory-grid">
        {cells.map((cell) => {
          const isMatched = matched.has(cell.cardId);
          const isFlipped = flipped.includes(cell.key) || isMatched;
          return (
            <button
              key={cell.key}
              className={`arcade-memory-cell${isFlipped ? " flipped" : ""}${isMatched ? " matched" : ""}`}
              onClick={() => handleCell(cell)}
            >
              {isFlipped ? cell.text : "?"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
