import { useEffect, useMemo, useState } from "react";
import {
  Gamepad2, X, Flame, Zap, ListChecks, Puzzle, Keyboard, Headphones,
  ArrowLeft, Trophy, RotateCcw,
} from "lucide-react";
import type { Flashcard } from "../../types";
import { fetchAllFlashcards } from "../../lib/db";
import { useIsMobile } from "../../hooks/useIsMobile";
import {
  addSessionResult, buildRound, levelInfo, loadStats, stopSpeaking,
  TTS_AVAILABLE, type ArcadeStats, type SessionResult,
} from "../../lib/arcade";
import MultipleChoiceGame from "./MultipleChoiceGame";
import MatchPairsGame from "./MatchPairsGame";
import TypeAnswerGame from "./TypeAnswerGame";
import ListeningGame from "./ListeningGame";

type GameId = "choice" | "match" | "type" | "listen";
type View = "hub" | "playing" | "result";

interface GameDef {
  id: GameId;
  name: string;
  desc: string;
  icon: React.ReactNode;
  roundSize: number;
  /** Cards elegíveis para este jogo */
  eligible: (withBack: Flashcard[], all: Flashcard[]) => Flashcard[];
  minCards: number;
}

const GAMES: GameDef[] = [
  {
    id: "choice",
    name: "Múltipla escolha",
    desc: "A frente aparece — escolha o verso certo entre 4 alternativas.",
    icon: <ListChecks size={22} />,
    roundSize: 10,
    eligible: (withBack) => withBack,
    minCards: 4,
  },
  {
    id: "match",
    name: "Combinar pares",
    desc: "Ligue cada frente ao seu verso contra o relógio.",
    icon: <Puzzle size={22} />,
    roundSize: 10,
    eligible: (withBack) => withBack,
    minCards: 3,
  },
  {
    id: "type",
    name: "Digite a resposta",
    desc: "Recall de verdade: escreva a resposta de memória (vale pequeno typo).",
    icon: <Keyboard size={22} />,
    roundSize: 8,
    eligible: (withBack) => withBack,
    minCards: 1,
  },
  {
    id: "listen",
    name: "Ouvir e escrever",
    desc: "O app fala a frente do card em inglês — escreva o que ouvir.",
    icon: <Headphones size={22} />,
    roundSize: 8,
    eligible: (_withBack, all) => all,
    minCards: 1,
  },
];

export default function ArcadeHub({ onClose }: { onClose: () => void }) {
  const isMobile = useIsMobile();
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [stats, setStats] = useState<ArcadeStats>(loadStats());
  const [view, setView] = useState<View>("hub");
  const [gameId, setGameId] = useState<GameId | null>(null);
  const [round, setRound] = useState<Flashcard[]>([]);
  const [result, setResult] = useState<SessionResult | null>(null);

  useEffect(() => {
    fetchAllFlashcards().then(setCards);
  }, []);

  // Esc: dentro de um jogo volta ao hub; no hub fecha o arcade
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (view === "playing") backToHub();
      else onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, onClose]);

  const withBack = useMemo(() => (cards ?? []).filter((c) => c.back.trim()), [cards]);
  const level = levelInfo(stats.xp);

  function startGame(def: GameDef) {
    if (!cards) return;
    setRound(buildRound(def.eligible(withBack, cards), def.roundSize));
    setGameId(def.id);
    setView("playing");
  }

  function backToHub() {
    stopSpeaking();
    setView("hub");
    setGameId(null);
    setResult(null);
  }

  function handleFinish(r: SessionResult) {
    stopSpeaking();
    setStats(addSessionResult(r));
    setResult(r);
    setView("result");
  }

  function playAgain() {
    const def = GAMES.find((g) => g.id === gameId);
    if (def) startGame(def);
  }

  const currentDef = GAMES.find((g) => g.id === gameId);

  return (
    <div className="arcade-overlay">
      <div className="arcade-topbar">
        {view !== "hub" ? (
          <button className="arcade-top-btn" onClick={backToHub} title="Voltar ao arcade">
            <ArrowLeft size={16} />
          </button>
        ) : (
          <span className="arcade-title"><Gamepad2 size={16} /> Arcade</span>
        )}
        <div className="arcade-stats">
          <span className="arcade-stat" title="Dias seguidos praticando">
            <Flame size={14} className={stats.streak > 0 ? "lit" : ""} /> {stats.streak}
          </span>
          <span className="arcade-stat" title={`Nível ${level.level} — ${level.into}/${level.span} XP`}>
            <Zap size={14} /> {stats.xp} XP
          </span>
          <span className="arcade-level" title={`Nível ${level.level}`}>
            <span className="arcade-level-num">Nv {level.level}</span>
            <span className="arcade-level-bar">
              <span className="arcade-level-fill" style={{ width: `${(level.into / level.span) * 100}%` }} />
            </span>
          </span>
        </div>
        <button className="arcade-top-btn" onClick={onClose} title="Fechar (Esc)">
          <X size={16} />
        </button>
      </div>

      {view === "hub" && (
        <div className="arcade-hub">
          {cards === null ? (
            <p className="arcade-empty">Carregando…</p>
          ) : cards.length === 0 ? (
            <div className="arcade-empty">
              <Gamepad2 size={28} />
              <p>Você ainda não tem flashcards.</p>
              <p className="arcade-empty-hint">
                Crie cards pelo botão de flashcards no editor (ou importe pares
                "frente - verso" de uma página) e volte aqui para treinar jogando.
              </p>
            </div>
          ) : (
            <>
              <p className="arcade-hub-sub">
                Treino livre com os seus {cards.length} cards — os que você mais erra aparecem primeiro.
                Jogar não altera o agendamento das revisões.
              </p>
              <div className="arcade-grid">
                {GAMES.map((def) => {
                  if (def.id === "listen" && (isMobile || !TTS_AVAILABLE)) return null;
                  const eligible = def.eligible(withBack, cards);
                  const locked = eligible.length < def.minCards;
                  return (
                    <button
                      key={def.id}
                      className="arcade-card"
                      disabled={locked}
                      onClick={() => startGame(def)}
                    >
                      <span className="arcade-card-icon">{def.icon}</span>
                      <span className="arcade-card-name">{def.name}</span>
                      <span className="arcade-card-desc">{def.desc}</span>
                      {locked && (
                        <span className="arcade-card-lock">
                          precisa de {def.minCards}+ cards com verso
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {view === "playing" && gameId === "choice" && (
        <MultipleChoiceGame round={round} pool={withBack} onFinish={handleFinish} />
      )}
      {view === "playing" && gameId === "match" && (
        <MatchPairsGame round={round} onFinish={handleFinish} />
      )}
      {view === "playing" && gameId === "type" && (
        <TypeAnswerGame round={round} onFinish={handleFinish} />
      )}
      {view === "playing" && gameId === "listen" && (
        <ListeningGame round={round} onFinish={handleFinish} />
      )}

      {view === "result" && result && (
        <div className="arcade-result">
          <Trophy size={34} className="arcade-trophy" />
          <h2>
            {result.total > 0 && result.correct === result.total
              ? "Rodada perfeita!"
              : result.correct / Math.max(1, result.total) >= 0.7
                ? "Mandou bem!"
                : "Bom treino!"}
          </h2>
          <div className="arcade-result-stats">
            <div className="arcade-result-stat">
              <span className="arcade-result-num">{result.correct}/{result.total}</span>
              <span className="arcade-result-label">acertos</span>
            </div>
            <div className="arcade-result-stat">
              <span className="arcade-result-num">+{result.xp}</span>
              <span className="arcade-result-label">XP</span>
            </div>
            {result.bestCombo >= 2 && (
              <div className="arcade-result-stat">
                <span className="arcade-result-num">×{result.bestCombo}</span>
                <span className="arcade-result-label">melhor combo</span>
              </div>
            )}
            <div className="arcade-result-stat">
              <span className="arcade-result-num">{stats.streak}</span>
              <span className="arcade-result-label">{stats.streak === 1 ? "dia seguido" : "dias seguidos"}</span>
            </div>
          </div>
          <div className="arcade-actions">
            <button className="arcade-btn ghost" onClick={backToHub}>
              Outros jogos
            </button>
            <button className="arcade-btn primary" onClick={playAgain}>
              <RotateCcw size={14} /> Jogar de novo{currentDef ? ` — ${currentDef.name}` : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
