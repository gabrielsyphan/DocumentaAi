// Paleta: cores Tailwind 400 — funcionam bem no tema claro e escuro
const PALETTE = [
  "#f87171", // red-400
  "#fb923c", // orange-400
  "#fbbf24", // amber-400
  "#4ade80", // green-400
  "#34d399", // emerald-400
  "#22d3ee", // cyan-400
  "#60a5fa", // blue-400
  "#a78bfa", // violet-400
  "#f472b6", // pink-400
  "#e879f9", // fuchsia-400
];

export function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) & 0x7fffffff;
  }
  return PALETTE[hash % PALETTE.length];
}

export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_àáâãéêíóôõúç]/g, "")
    .slice(0, 32);
}
