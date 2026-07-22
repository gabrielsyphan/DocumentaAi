import { useEffect, useMemo, useState } from "react";
import {
  Gamepad2, X, Flame, Zap, ListChecks, Puzzle, Keyboard, Headphones,
  ArrowLeft, Trophy, RotateCcw, Blocks, Brain, WholeWord, Shuffle,
  Volume2, VolumeX,
} from "lucide-react";
import type { Flashcard } from "../../types";
import { fetchAllFlashcards } from "../../lib/db";
import { useIsMobile } from "../../hooks/useIsMobile";
import {
  addSessionResult, buildRound, hangmanEligible, levelInfo, loadStats,
  memoryEligible, scrambleTarget, shuffle, stopSpeaking, TTS_AVAILABLE,
  type ArcadeStats, type SessionResult,
} from "../../lib/arcade";
import { isSoundEnabled, setSoundEnabled } from "../../lib/sound";
import MultipleChoiceGame from "./MultipleChoiceGame";
import MatchPairsGame from "./MatchPairsGame";
import TypeAnswerGame from "./TypeAnswerGame";
import ListeningGame from "./ListeningGame";
import SentenceScrambleGame from "./SentenceScrambleGame";
import MemoryGame from "./MemoryGame";
import HangmanGame from "./HangmanGame";

type GameId = "choice" | "match" | "type" | "listen" | "scramble" | "memory" | "hangman";
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
  /** Mensagem quando faltam cards elegíveis */
  lockHint: string;
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
    lockHint: "precisa de 4+ cards com verso",
  },
  {
    id: "match",
    name: "Combinar pares",
    desc: "Ligue cada frente ao seu verso contra o relógio.",
    icon: <Puzzle size={22} />,
    roundSize: 10,
    eligible: (withBack) => withBack,
    minCards: 3,
    lockHint: "precisa de 3+ cards com verso",
  },
  {
    id: "type",
    name: "Digite a resposta",
    desc: "Recall de verdade: escreva a resposta de memória (vale pequeno typo).",
    icon: <Keyboard size={22} />,
    roundSize: 8,
    eligible: (withBack) => withBack,
    minCards: 1,
    lockHint: "precisa de cards com verso",
  },
  {
    id: "scramble",
    name: "Monte a frase",
    desc: "As palavras vêm embaralhadas — toque na ordem certa para formar a frase.",
    icon: <Blocks size={22} />,
    roundSize: 8,
    eligible: (withBack) => withBack.filter((c) => scrambleTarget(c) !== null),
    minCards: 2,
    lockHint: "precisa de cards cujo texto tenha 2+ palavras",
  },
  {
    id: "memory",
    name: "Jogo da memória",
    desc: "Vire as cartas e encontre os pares frente ↔ verso.",
    icon: <Brain size={22} />,
    roundSize: 12,
    eligible: (withBack) => withBack.filter(memoryEligible),
    minCards: 3,
    lockHint: "precisa de 3+ cards com textos curtos",
  },
  {
    id: "hangman",
    name: "Palavra oculta",
    desc: "Chute letras e descubra a palavra escondida a partir da dica.",
    icon: <WholeWord size={22} />,
    roundSize: 6,
    eligible: (withBack) => withBack.filter(hangmanEligible),
    minCards: 1,
    lockHint: "precisa de cards com frente curta e só letras",
  },
  {
    id: "listen",
    name: "Ouvir e escrever",
    desc: "O app fala a frente do card em inglês — escreva o que ouvir.",
    icon: <Headphones size={22} />,
    roundSize: 8,
    eligible: (_withBack, all) => all,
    minCards: 1,
    lockHint: "precisa de cards",
  },
];

/** Quantas perguntas cada jogo contribui num segmento do Modo misto */
const MIX_SEGMENT_SIZES: Record<GameId, number> = {
  choice: 4, match: 5, type: 3, listen: 3, scramble: 3, memory: 5, hangman: 2,
};
const MIX_MAX_SEGMENTS = 4;

const EMPTY_RESULT: SessionResult = { correct: 0, total: 0, xp: 0, bestCombo: 0 };

interface MixSegment {
  def: GameDef;
  round: Flashcard[];
}

export default function ArcadeHub({ onClose }: { onClose: () => void }) {
  const isMobile = useIsMobile();
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [stats, setStats] = useState<ArcadeStats>(loadStats());
  const [view, setView] = useState<View>("hub");
  const [gameId, setGameId] = useState<GameId | "mix" | null>(null);
  const [round, setRound] = useState<Flashcard[]>([]);
  const [result, setResult] = useState<SessionResult | null>(null);
  // Estado do Modo misto
  const [mixSegments, setMixSegments] = useState<MixSegment[]>([]);
  const [mixIdx, setMixIdx] = useState(0);
  const [mixInterstitial, setMixInterstitial] = useState(false);
  const [mixAcc, setMixAcc] = useState<SessionResult>(EMPTY_RESULT);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());

  function toggleSound() {
    const next = !soundOn;
    setSoundEnabled(next);
    setSoundOn(next);
  }

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

  function gameAvailable(def: GameDef): boolean {
    if (!cards) return false;
    if (def.id === "listen" && (isMobile || !TTS_AVAILABLE)) return false;
    return def.eligible(withBack, cards).length >= def.minCards;
  }

  const availableDefs = GAMES.filter(gameAvailable);

  function startGame(def: GameDef) {
    if (!cards) return;
    setRound(buildRound(def.eligible(withBack, cards), def.roundSize));
    setGameId(def.id);
    setView("playing");
  }

  function startMix() {
    if (!cards) return;
    const defs = shuffle(availableDefs).slice(0, MIX_MAX_SEGMENTS);
    setMixSegments(
      defs.map((def) => ({
        def,
        round: buildRound(def.eligible(withBack, cards), MIX_SEGMENT_SIZES[def.id]),
      }))
    );
    setMixIdx(0);
    setMixAcc(EMPTY_RESULT);
    setMixInterstitial(true);
    setGameId("mix");
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

  function handleSegmentFinish(r: SessionResult) {
    stopSpeaking();
    const acc: SessionResult = {
      correct: mixAcc.correct + r.correct,
      total: mixAcc.total + r.total,
      xp: mixAcc.xp + r.xp,
      bestCombo: Math.max(mixAcc.bestCombo, r.bestCombo),
    };
    if (mixIdx + 1 < mixSegments.length) {
      setMixAcc(acc);
      setMixIdx(mixIdx + 1);
      setMixInterstitial(true);
    } else {
      handleFinish(acc);
    }
  }

  function playAgain() {
    if (gameId === "mix") {
      startMix();
      return;
    }
    const def = GAMES.find((g) => g.id === gameId);
    if (def) startGame(def);
  }

  function renderGame(id: GameId, gameRound: Flashcard[], onDone: (r: SessionResult) => void) {
    switch (id) {
      case "choice":
        return <MultipleChoiceGame round={gameRound} pool={withBack} onFinish={onDone} />;
      case "match":
        return <MatchPairsGame round={gameRound} onFinish={onDone} />;
      case "type":
        return <TypeAnswerGame round={gameRound} onFinish={onDone} />;
      case "listen":
        return <ListeningGame round={gameRound} onFinish={onDone} />;
      case "scramble":
        return <SentenceScrambleGame round={gameRound} onFinish={onDone} />;
      case "memory":
        return <MemoryGame round={gameRound} onFinish={onDone} />;
      case "hangman":
        return <HangmanGame round={gameRound} onFinish={onDone} />;
    }
  }

  const resultName = gameId === "mix" ? "Modo misto" : GAMES.find((g) => g.id === gameId)?.name;
  const mixCurrent = mixSegments[mixIdx];

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
        <button
          className="arcade-top-btn"
          onClick={toggleSound}
          title={soundOn ? "Desativar efeitos sonoros" : "Ativar efeitos sonoros"}
        >
          {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
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

              {availableDefs.length >= 2 && (
                <button className="arcade-card mix" onClick={startMix}>
                  <span className="arcade-card-icon"><Shuffle size={22} /></span>
                  <span className="arcade-card-name">Modo misto</span>
                  <span className="arcade-card-desc">
                    Uma sessão com um pouco de cada jogo — {Math.min(availableDefs.length, MIX_MAX_SEGMENTS)} partes sorteadas.
                  </span>
                </button>
              )}

              <div className="arcade-grid">
                {GAMES.map((def) => {
                  if (def.id === "listen" && (isMobile || !TTS_AVAILABLE)) return null;
                  const locked = !gameAvailable(def);
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
                      {locked && <span className="arcade-card-lock">{def.lockHint}</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {view === "playing" && gameId !== null && gameId !== "mix" &&
        renderGame(gameId, round, handleFinish)}

      {view === "playing" && gameId === "mix" && mixCurrent && (
        mixInterstitial ? (
          <div className="arcade-mix-interstitial">
            <span className="arcade-mix-step">Parte {mixIdx + 1} de {mixSegments.length}</span>
            <span className="arcade-card-icon">{mixCurrent.def.icon}</span>
            <h2>{mixCurrent.def.name}</h2>
            <p>{mixCurrent.def.desc}</p>
            <button className="arcade-btn primary" onClick={() => setMixInterstitial(false)} autoFocus>
              {mixIdx === 0 ? "Começar" : "Continuar"}
            </button>
          </div>
        ) : (
          // key força remontagem do componente a cada segmento
          <div key={mixIdx} className="arcade-mix-stage">
            {renderGame(mixCurrent.def.id, mixCurrent.round, handleSegmentFinish)}
          </div>
        )
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
              <RotateCcw size={14} /> Jogar de novo{resultName ? ` — ${resultName}` : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
