// Tradução via Google Cloud Translation API v2 (REST com chave de API).
// A chave é do usuário e fica no localStorage — free tier de 500k chars/mês.
// Os endpoints googleapis.com liberam CORS, então dá para chamar direto do
// frontend, sem passar pelo Rust.

const KEY_STORAGE = "documentaai-translate-key";
const USAGE_STORAGE = "documentaai-translate-usage";

/** Free tier da Cloud Translation: 500 mil caracteres por mês-calendário */
export const FREE_TIER_CHARS = 500_000;

export function getTranslateKey(): string {
  return localStorage.getItem(KEY_STORAGE) ?? "";
}

export function setTranslateKey(key: string) {
  if (key.trim()) localStorage.setItem(KEY_STORAGE, key.trim());
  else localStorage.removeItem(KEY_STORAGE);
}

// ── Contador de consumo ───────────────────────────────────────────────────────
// A API não expõe o consumo via chave (só no Cloud Console), então contamos
// localmente cada caractere enviado. Como a chave só é usada por este app,
// a contagem local acompanha o valor oficial de perto. Zera a cada mês.

export interface MonthlyUsage {
  month: string; // "2026-07"
  chars: number;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function getMonthlyUsage(): MonthlyUsage {
  try {
    const raw = JSON.parse(localStorage.getItem(USAGE_STORAGE) ?? "null") as MonthlyUsage | null;
    if (raw && raw.month === currentMonth() && typeof raw.chars === "number") return raw;
  } catch { /* ignore */ }
  return { month: currentMonth(), chars: 0 };
}

function recordUsage(chars: number) {
  const cur = getMonthlyUsage();
  localStorage.setItem(
    USAGE_STORAGE,
    JSON.stringify({ month: cur.month, chars: cur.chars + chars })
  );
}

export type Direction = "auto" | "en-pt" | "pt-en";

export interface TranslateResult {
  text: string;
  /** Idioma de origem detectado pela API (só no modo auto), ex: "en" */
  detectedSource?: string;
}

async function callApi(text: string, target: string, source?: string): Promise<TranslateResult> {
  const key = getTranslateKey();
  if (!key) throw new Error("Nenhuma chave de API configurada");

  const res = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        target,
        ...(source ? { source } : {}),
        format: "text",
      }),
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg: string = body?.error?.message ?? `Erro HTTP ${res.status}`;
    // Mensagens comuns da API traduzidas para algo acionável
    if (res.status === 400 && /API key not valid/i.test(msg))
      throw new Error("Chave de API inválida — confira a chave nas configurações");
    if (res.status === 403)
      throw new Error("Acesso negado — verifique se a Cloud Translation API está ativada no projeto");
    throw new Error(msg);
  }

  const json = await res.json();
  const t = json?.data?.translations?.[0];
  if (!t) throw new Error("Resposta inesperada da API");
  // O Google cobra pelos caracteres ENVIADOS — registra só em chamada bem-sucedida.
  // Fica aqui dentro para o modo auto (que às vezes faz 2 chamadas) contar as duas.
  recordUsage(text.length);
  return { text: t.translatedText ?? "", detectedSource: t.detectedSourceLanguage };
}

export async function translate(text: string, direction: Direction): Promise<TranslateResult> {
  if (direction === "en-pt") return callApi(text, "pt", "en");
  if (direction === "pt-en") return callApi(text, "en", "pt");
  // auto: detecta a origem; se já era português, refaz para inglês
  const first = await callApi(text, "pt");
  if (first.detectedSource === "pt") {
    const second = await callApi(text, "en", "pt");
    return { ...second, detectedSource: "pt" };
  }
  return first;
}
