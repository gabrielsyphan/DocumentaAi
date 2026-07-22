// ── Efeitos sonoros do Arcade ─────────────────────────────────────────────────
// Acerto/erro sintetizados via Web Audio API (osciladores) — sem arquivos de
// áudio pra baixar/versionar, mesmo espírito do TTS via Web Speech API já
// usado no app. Preferência de ligar/desligar persiste em localStorage.

const SOUND_KEY = "documentaai_arcade_sound";

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  // Safari ainda expõe só o prefixo webkit em algumas versões
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function isSoundEnabled(): boolean {
  return localStorage.getItem(SOUND_KEY) !== "off";
}

export function setSoundEnabled(enabled: boolean): void {
  localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
}

interface Note {
  freq: number;
  start: number;
  duration: number;
  type?: OscillatorType;
}

// Envelope simples (rampa linear na entrada, exponencial na saída) evita o
// "clique" que um corte abrupto de volume causaria no início/fim da nota.
function playTones(notes: Note[], volume: number): void {
  const audio = getContext();
  if (!audio) return;
  const now = audio.currentTime;
  for (const note of notes) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = note.type ?? "sine";
    osc.frequency.value = note.freq;
    const t0 = now + note.start;
    const t1 = t0 + note.duration;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  }
}

export function playCorrect(): void {
  if (!isSoundEnabled()) return;
  playTones(
    [
      { freq: 880, start: 0, duration: 0.1 },
      { freq: 1318.5, start: 0.09, duration: 0.16 },
    ],
    0.15
  );
}

export function playWrong(): void {
  if (!isSoundEnabled()) return;
  playTones([{ freq: 220, start: 0, duration: 0.18, type: "square" }], 0.08);
}
