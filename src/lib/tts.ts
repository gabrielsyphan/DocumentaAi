import { useState, useEffect, useRef, useCallback } from "react";

type InlineItem = { type: string; text?: string; content?: InlineItem[]; props?: Record<string, string> };
type Block = { type: string; content?: InlineItem[]; children?: Block[] };

function inlineToText(items: InlineItem[] = []): string {
  return items
    .map((item) => {
      if (item.type === "text") return item.text ?? "";
      if (item.type === "link") return inlineToText(item.content ?? []);
      if (item.type === "wikilink") return item.props?.title ?? "";
      return "";
    })
    .join("");
}

function blockToText(block: Block): string {
  // Ignora código, imagens e mídia — faz sentido para leitura
  if (["codeBlock", "image", "video", "audio", "captureStamp"].includes(block.type)) return "";
  const text = inlineToText(block.content ?? []).trim();
  const childText = (block.children ?? []).map(blockToText).filter(Boolean).join(" ");
  return [text, childText].filter(Boolean).join(" ");
}

export function extractParagraphs(blocks: Block[]): string[] {
  return blocks.map(blockToText).filter(Boolean);
}

export function countWords(blocks: object[]): number {
  const text = extractParagraphs(blocks as Block[]).join(" ");
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

// ── useTTS ────────────────────────────────────────────────────────────────────

// Web Speech API is not available in WebKitGTK on Linux
const TTS_SUPPORTED = typeof window !== "undefined" && "speechSynthesis" in window;

export interface TTSState {
  supported: boolean;
  speaking: boolean;
  paused: boolean;
  currentIdx: number;
  totalChunks: number;
  voices: SpeechSynthesisVoice[];
  voiceURI: string;
  rate: number;
  setVoiceURI: (uri: string) => void;
  changeRate: (r: number) => void;
  play: (blocks: object[]) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

export function useTTS(): TTSState {
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURIState] = useState("");
  const [rate, setRate] = useState(1);

  const ref = useRef({ voiceURI: "", rate: 1, voices: [] as SpeechSynthesisVoice[], chunks: [] as string[], idx: 0 });

  useEffect(() => { ref.current.voiceURI = voiceURI; }, [voiceURI]);
  useEffect(() => { ref.current.rate = rate; }, [rate]);
  useEffect(() => { ref.current.voices = voices; }, [voices]);

  useEffect(() => {
    if (!TTS_SUPPORTED) return;
    const synth = window.speechSynthesis;
    function loadVoices() {
      const v = synth.getVoices();
      if (!v.length) return;
      setVoices(v);
      ref.current.voices = v;
      if (!ref.current.voiceURI) {
        const ptBr = v.find((x) => x.lang.startsWith("pt")) ?? v[0];
        setVoiceURIState(ptBr?.voiceURI ?? "");
      }
    }
    loadVoices();
    synth.addEventListener("voiceschanged", loadVoices);
    return () => synth.removeEventListener("voiceschanged", loadVoices);
  }, []);

  const speakFrom = useCallback((idx: number) => {
    if (!TTS_SUPPORTED) return;
    const synth = window.speechSynthesis;
    const { chunks, voiceURI, rate, voices } = ref.current;
    if (idx >= chunks.length) { setSpeaking(false); setPaused(false); return; }
    const utterance = new SpeechSynthesisUtterance(chunks[idx]);
    const voice = voices.find((v) => v.voiceURI === voiceURI);
    if (voice) utterance.voice = voice;
    utterance.rate = rate;
    utterance.onend = () => {
      ref.current.idx = idx + 1;
      setCurrentIdx(idx + 1);
      speakFrom(idx + 1);
    };
    synth.speak(utterance);
  }, []);

  function play(blocks: object[]) {
    if (!TTS_SUPPORTED) return;
    window.speechSynthesis.cancel();
    const chunks = extractParagraphs(blocks as Block[]);
    if (!chunks.length) return;
    ref.current.chunks = chunks;
    ref.current.idx = 0;
    setTotalChunks(chunks.length);
    setCurrentIdx(0);
    setSpeaking(true);
    setPaused(false);
    speakFrom(0);
  }

  function pause() {
    if (!TTS_SUPPORTED) return;
    window.speechSynthesis.pause();
    setPaused(true);
  }

  function resume() {
    if (!TTS_SUPPORTED) return;
    window.speechSynthesis.resume();
    setPaused(false);
  }

  function stop() {
    if (!TTS_SUPPORTED) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
    setCurrentIdx(0);
    ref.current.idx = 0;
  }

  function setVoiceURI(uri: string) {
    setVoiceURIState(uri);
    ref.current.voiceURI = uri;
  }

  function changeRate(r: number) {
    setRate(r);
    ref.current.rate = r;
    if (TTS_SUPPORTED && speaking && !paused) {
      window.speechSynthesis.cancel();
      speakFrom(ref.current.idx);
    }
  }

  return { supported: TTS_SUPPORTED, speaking, paused, currentIdx, totalChunks, voices, voiceURI, rate, setVoiceURI, changeRate, play, pause, resume, stop };
}
