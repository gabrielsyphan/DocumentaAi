// ── Cliente de sync por rede local (usado no mobile) ─────────────────────────
//
// O desktop roda o servidor (porta 7420). O mobile manda todas as suas páginas
// via POST /sync; o servidor aplica merge last-write-wins e responde com as
// páginas em que a cópia dele é mais nova. Aplicamos essas do nosso lado e
// pronto — os dois bancos convergem.

import { fetchAllPagesForSync, applySyncPages, type SyncPageRow } from "./db";

export const SYNC_PORT = 7420;
const STORAGE_KEY = "documentaai-sync-address";

export interface SyncResult {
  sent: number;
  received: number;
  applied: number;
}

export function getSavedSyncAddress(): string {
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export function saveSyncAddress(address: string): void {
  localStorage.setItem(STORAGE_KEY, address.trim());
}

/** Normaliza "192.168.1.42" ou "192.168.1.42:7420" para host:porta. */
function normalizeAddress(address: string): string {
  const a = address.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return a.includes(":") ? a : `${a}:${SYNC_PORT}`;
}

/** Testa se o desktop está acessível na rede. */
export async function pingDesktop(address: string): Promise<boolean> {
  try {
    const res = await fetch(`http://${normalizeAddress(address)}/ping`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.app === "documentaai";
  } catch {
    return false;
  }
}

/** Executa uma sincronização completa com o desktop. */
export async function syncWithDesktop(address: string): Promise<SyncResult> {
  const addr = normalizeAddress(address);
  const pages = await fetchAllPagesForSync();

  let res: Response;
  try {
    res = await fetch(`http://${addr}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pages }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error(
      "Não foi possível conectar ao desktop. Confira se o app está aberto, " +
        "com o sync ligado, e se os dois aparelhos estão na mesma rede Wi-Fi."
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `O desktop respondeu com erro (${res.status})${body ? `: ${body.slice(0, 200)}` : "."}`
    );
  }

  const data: { pages: SyncPageRow[] } = await res.json();
  const applied = await applySyncPages(data.pages);

  return { sent: pages.length, received: data.pages.length, applied };
}

const CONNECT_ERROR =
  "Não foi possível conectar ao desktop. Confira se o app está aberto, " +
  "com o sync ligado, e se os dois aparelhos estão na mesma rede Wi-Fi.";

/**
 * Baixar do desktop: a versão do desktop sobrescreve a cópia local e cria as
 * páginas que faltam (até recriando as que estavam na lixeira daqui). Páginas
 * que só existem neste aparelho ficam intocadas.
 */
export async function pullFromDesktop(address: string): Promise<SyncResult> {
  const addr = normalizeAddress(address);
  let res: Response;
  try {
    res = await fetch(`http://${addr}/pages`, { signal: AbortSignal.timeout(30000) });
  } catch {
    throw new Error(CONNECT_ERROR);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `O desktop respondeu com erro (${res.status})${body ? `: ${body.slice(0, 200)}` : "."}`
    );
  }
  const data: { pages: SyncPageRow[] } = await res.json();
  const applied = await applySyncPages(data.pages, "force");
  return { sent: 0, received: data.pages.length, applied };
}

/**
 * Enviar para o desktop: a versão deste aparelho sobrescreve a cópia do
 * desktop e cria as que faltam lá (até recriando as que o desktop deletou).
 * Nada é apagado no desktop — só envia as páginas vivas daqui.
 */
export async function pushToDesktop(address: string): Promise<SyncResult> {
  const addr = normalizeAddress(address);
  const all = await fetchAllPagesForSync();
  const pages = all.filter((p) => p.deleted_at === null);

  let res: Response;
  try {
    res = await fetch(`http://${addr}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pages }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error(CONNECT_ERROR);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `O desktop respondeu com erro (${res.status})${body ? `: ${body.slice(0, 200)}` : "."}`
    );
  }
  const data: { applied: number } = await res.json();
  return { sent: pages.length, received: 0, applied: data.applied };
}
