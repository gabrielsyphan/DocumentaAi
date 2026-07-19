// ── Arcade de flashcards ──────────────────────────────────────────────────────
// Helpers dos mini-jogos: montagem de rodadas (priorizando cards difíceis e
// vencidos), distratores, comparação tolerante a typos, XP/streak em
// localStorage e fala via Web Speech API (voz em inglês para o jogo de ditado).
// Os jogos são treino extra — NÃO mexem no agendamento SM-2 dos cards.

import type { Flashcard } from "../types";

// ── Estatísticas persistentes (XP, streak) ────────────────────────────────────

export interface ArcadeStats {
  xp: number;
  streak: number;
  /** Último dia jogado (YYYY-MM-DD) — base do cálculo de streak */
  lastPlayed: string | null;
  bestCombo: number;
  gamesPlayed: number;
}

export interface SessionResult {
  correct: number;
  total: number;
  xp: number;
  bestCombo: number;
}

const STATS_KEY = "documentaai_arcade_stats";

export function loadStats(): ArcadeStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) return { xp: 0, streak: 0, lastPlayed: null, bestCombo: 0, gamesPlayed: 0, ...JSON.parse(raw) };
  } catch { /* stats corrompidas — recomeça */ }
  return { xp: 0, streak: 0, lastPlayed: null, bestCombo: 0, gamesPlayed: 0 };
}

function dateStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Registra o fim de uma sessão: soma XP, atualiza streak diário e recordes. */
export function addSessionResult(result: SessionResult): ArcadeStats {
  const stats = loadStats();
  const today = dateStr();
  if (stats.lastPlayed !== today) {
    stats.streak = stats.lastPlayed === dateStr(-1) ? stats.streak + 1 : 1;
    stats.lastPlayed = today;
  }
  stats.xp += result.xp;
  stats.gamesPlayed += 1;
  stats.bestCombo = Math.max(stats.bestCombo, result.bestCombo);
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  return stats;
}

/** Nível a cada 100 XP; devolve progresso dentro do nível atual. */
export function levelInfo(xp: number): { level: number; into: number; span: number } {
  return { level: Math.floor(xp / 100) + 1, into: xp % 100, span: 100 };
}

// ── XP por resposta ───────────────────────────────────────────────────────────

export const XP_CORRECT = 10;
export const XP_CLOSE = 8;
export const XP_PAIR = 6;
/** Bônus quando o combo (acertos seguidos) chega a 3+ */
export const XP_COMBO_BONUS = 5;

export function xpFor(kind: "correct" | "close", combo: number): number {
  const base = kind === "correct" ? XP_CORRECT : XP_CLOSE;
  return base + (combo >= 3 ? XP_COMBO_BONUS : 0);
}

// ── Montagem de rodadas ───────────────────────────────────────────────────────

export function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Seleciona os cards de uma rodada: cards vencidos e com ease baixo (os que
 * você mais erra) têm prioridade, com um jitter aleatório para variar.
 */
export function buildRound(cards: Flashcard[], size: number): Flashcard[] {
  const today = dateStr();
  const scored = cards.map((c) => ({
    card: c,
    score:
      (c.next_review <= today ? 2 : 0) +
      (c.last_reviewed !== null && c.ease_factor < 2.4 ? 1.5 : 0) +
      Math.random() * 2,
  }));
  scored.sort((a, b) => b.score - a.score);
  return shuffle(scored.slice(0, size).map((s) => s.card));
}

/** Versos de outros cards para servirem de alternativas erradas. */
export function pickDistractors(cards: Flashcard[], correct: Flashcard, n: number): string[] {
  const seen = new Set([correct.back.trim().toLowerCase()]);
  const pool: string[] = [];
  for (const c of shuffle(cards)) {
    const back = c.back.trim();
    if (c.id === correct.id || !back || seen.has(back.toLowerCase())) continue;
    seen.add(back.toLowerCase());
    pool.push(back);
    if (pool.length === n) break;
  }
  return pool;
}

// ── Comparação tolerante a erros de digitação ─────────────────────────────────

export function normalizeAnswer(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,;:!?'"()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export type AnswerVerdict = "exact" | "close" | "wrong";

/** "close" = acertou com pequeno typo (tolerância cresce com o tamanho). */
export function checkAnswer(input: string, expected: string): AnswerVerdict {
  const a = normalizeAnswer(input);
  const b = normalizeAnswer(expected);
  if (!a) return "wrong";
  if (a === b) return "exact";
  const tolerance = b.length <= 4 ? 0 : b.length <= 8 ? 1 : 2;
  return levenshtein(a, b) <= tolerance ? "close" : "wrong";
}

// ── Fala (jogo de ditado) ─────────────────────────────────────────────────────

export const TTS_AVAILABLE = typeof window !== "undefined" && "speechSynthesis" in window;

/** Prefere voz local en-US/en-GB; cai na primeira voz em inglês disponível. */
export function pickEnglishVoice(): SpeechSynthesisVoice | null {
  if (!TTS_AVAILABLE) return null;
  const voices = window.speechSynthesis.getVoices();
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  return (
    en.find((v) => v.lang.toLowerCase().startsWith("en-us") && v.localService) ??
    en.find((v) => v.localService) ??
    en[0] ??
    null
  );
}

export function speakEnglish(text: string, rate = 1): void {
  if (!TTS_AVAILABLE || !text.trim()) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const voice = pickEnglishVoice();
  if (voice) utter.voice = voice;
  utter.lang = voice?.lang ?? "en-US";
  utter.rate = rate;
  window.speechSynthesis.speak(utter);
}

export function stopSpeaking(): void {
  if (TTS_AVAILABLE) window.speechSynthesis.cancel();
}
