import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import QRCode from "qrcode";
import { X, Wifi, WifiOff, RefreshCw, MonitorSmartphone, CheckCircle2, AlertTriangle, Download, Upload } from "lucide-react";
import { useIsMobile } from "../../hooks/useIsMobile";
import { usePagesStore } from "../../store/pages.store";
import {
  getSavedSyncAddress,
  saveSyncAddress,
  syncWithDesktop,
  pullFromDesktop,
  pushToDesktop,
  type SyncResult,
} from "../../lib/sync";

interface SyncServerStatus {
  running: boolean;
  ip: string | null;
  port: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SyncModal({ open, onClose }: Props) {
  const isMobile = useIsMobile();
  if (!open) return null;

  // Portal no <body>: o drawer mobile usa transform, o que faria o
  // position:fixed do overlay ficar relativo à sidebar em vez da viewport
  return createPortal(
    <div className="sync-overlay" onClick={onClose}>
      <div className="sync-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sync-modal-header">
          <MonitorSmartphone size={16} />
          <span>Sync por rede local</span>
          <button className="sync-close-btn" onClick={onClose} title="Fechar">
            <X size={15} />
          </button>
        </div>
        {isMobile ? <MobileSync /> : <DesktopSync />}
      </div>
    </div>,
    document.body
  );
}

// ── Desktop: controla o servidor e mostra IP + QR code ───────────────────────

function DesktopSync() {
  const [status, setStatus] = useState<SyncServerStatus | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await invoke<SyncServerStatus>("sync_server_status"));
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (status?.running && status.ip) {
      QRCode.toDataURL(`${status.ip}:${status.port}`, {
        width: 200,
        margin: 1,
      }).then(setQrDataUrl).catch(() => setQrDataUrl(null));
    } else {
      setQrDataUrl(null);
    }
  }, [status]);

  async function toggle() {
    if (!status) return;
    setBusy(true);
    setError(null);
    try {
      const next = status.running
        ? await invoke<SyncServerStatus>("sync_server_stop")
        : await invoke<SyncServerStatus>("sync_server_start");
      setStatus(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const address = status?.ip ? `${status.ip}:${status.port}` : null;

  return (
    <div className="sync-modal-body">
      <button
        className={`sync-toggle-btn${status?.running ? " running" : ""}`}
        onClick={toggle}
        disabled={busy || !status}
      >
        {status?.running ? <Wifi size={15} /> : <WifiOff size={15} />}
        {status?.running ? "Servidor ligado — clique para desligar" : "Ligar servidor de sync"}
      </button>

      {error && (
        <p className="sync-error">
          <AlertTriangle size={13} /> {error}
        </p>
      )}

      {status?.running && address && (
        <>
          <p className="sync-hint">No celular, abra o Sync e informe este endereço:</p>
          <div className="sync-address">{address}</div>
          {qrDataUrl && (
            <img className="sync-qr" src={qrDataUrl} alt={`QR code: ${address}`} />
          )}
          <p className="sync-hint-small">
            Os dois aparelhos precisam estar na mesma rede Wi-Fi.
            A página mais recente vence em caso de edição nos dois lados.
          </p>
        </>
      )}

      {!status?.running && (
        <p className="sync-hint-small">
          Ligue o servidor e deixe o app aberto enquanto sincroniza pelo celular.
        </p>
      )}
    </div>
  );
}

// ── Mobile: cliente — endereço do desktop + botão de sincronizar ─────────────

/**
 * Máscara de endereço IP:porta com separadores automáticos.
 * - Após o 3º dígito de um octeto, o "." entra sozinho (192168142 → 192.168.14.2…)
 * - Após o 4º octeto, o próximo separador vira ":" e os dígitos seguintes são a porta
 * - Digitar "." encerra um octeto curto manualmente (192.168.1.4 + "." → começa a porta)
 */
function maskAddress(raw: string): string {
  let out = "";
  let octet = 0; // índice do octeto atual (0..3)
  let digits = 0; // dígitos no octeto atual
  let inPort = false;
  let portDigits = 0;

  for (const ch of raw) {
    if (inPort) {
      if (/\d/.test(ch) && portDigits < 5) {
        out += ch;
        portDigits++;
      }
      continue;
    }
    if (/\d/.test(ch)) {
      if (digits === 3) {
        if (octet < 3) {
          out += ".";
          octet++;
          digits = 0;
        } else {
          out += `:${ch}`;
          inPort = true;
          portDigits = 1;
          continue;
        }
      }
      out += ch;
      digits++;
    } else if (ch === "." || ch === ":") {
      if (digits === 0) continue; // não permite octeto vazio
      if (octet < 3) {
        out += ".";
        octet++;
        digits = 0;
      } else {
        out += ":";
        inPort = true;
      }
    }
  }
  return out;
}

type SyncMode = "merge" | "pull" | "push";

const MODE_SUCCESS: Record<SyncMode, (r: SyncResult) => string> = {
  merge: (r) =>
    `Sincronizado! ${r.applied} ${r.applied === 1 ? "página atualizada" : "páginas atualizadas"} neste aparelho.`,
  pull: (r) =>
    `Baixado! ${r.applied} ${r.applied === 1 ? "página do desktop aplicada" : "páginas do desktop aplicadas"} aqui.`,
  push: (r) =>
    `Enviado! ${r.applied} ${r.applied === 1 ? "página deste aparelho aplicada" : "páginas deste aparelho aplicadas"} no desktop.`,
};

function MobileSync() {
  const { load } = usePagesStore();
  const [address, setAddress] = useState(() => maskAddress(getSavedSyncAddress()));
  const [syncing, setSyncing] = useState<SyncMode | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(mode: SyncMode) {
    if (!address.trim() || syncing) return;
    setSyncing(mode);
    setSuccess(null);
    setError(null);
    try {
      saveSyncAddress(address);
      const r =
        mode === "merge" ? await syncWithDesktop(address)
        : mode === "pull" ? await pullFromDesktop(address)
        : await pushToDesktop(address);
      setSuccess(MODE_SUCCESS[mode](r));
      await load(); // recarrega a árvore (pull/merge mudam o banco local)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(null);
    }
  }

  return (
    <div className="sync-modal-body">
      <p className="sync-hint">
        No desktop, abra o Sync e ligue o servidor. Depois digite aqui o endereço
        que aparece lá — pontos e dois-pontos entram sozinhos (se não digitar a
        porta, usamos a padrão 7420):
      </p>
      <input
        className="sync-address-input"
        value={address}
        onChange={(e) => setAddress(maskAddress(e.target.value))}
        placeholder="192.168.1.42:7420"
        inputMode="decimal"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <button
        className="sync-toggle-btn"
        onClick={() => run("merge")}
        disabled={!address.trim() || syncing !== null}
      >
        <RefreshCw size={15} className={syncing === "merge" ? "spin" : ""} />
        {syncing === "merge" ? "Sincronizando…" : "Sincronizar (mais recente vence)"}
      </button>

      <div className="sync-direction-row">
        <button
          className="sync-direction-btn"
          onClick={() => run("pull")}
          disabled={!address.trim() || syncing !== null}
          title="A versão do desktop sobrescreve a deste aparelho"
        >
          <Download size={14} className={syncing === "pull" ? "spin" : ""} />
          Baixar do desktop
        </button>
        <button
          className="sync-direction-btn"
          onClick={() => run("push")}
          disabled={!address.trim() || syncing !== null}
          title="A versão deste aparelho sobrescreve a do desktop"
        >
          <Upload size={14} className={syncing === "push" ? "spin" : ""} />
          Enviar p/ desktop
        </button>
      </div>
      <p className="sync-hint-small">
        Baixar/Enviar sobrescrevem o outro lado com a versão de cá ou de lá,
        criando o que faltar — sem apagar nada. O Sincronizar mescla pelos
        dois lados (edição mais recente vence) e propaga deleções.
      </p>

      {success && (
        <p className="sync-success">
          <CheckCircle2 size={13} /> {success}
        </p>
      )}
      {error && (
        <p className="sync-error">
          <AlertTriangle size={13} /> {error}
        </p>
      )}
    </div>
  );
}
