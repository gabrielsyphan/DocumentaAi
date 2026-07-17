import { useEffect, useRef, useState } from "react";
import { Languages, X as XIcon, ArrowLeftRight, Copy, Check, KeyRound, Loader2 } from "lucide-react";
import {
  translate,
  getTranslateKey,
  setTranslateKey,
  getMonthlyUsage,
  FREE_TIER_CHARS,
  type Direction,
} from "../../lib/translate";

interface Props {
  open: boolean;
  onClose: () => void;
}

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "en-pt", label: "EN → PT" },
  { value: "pt-en", label: "PT → EN" },
];

function UsageMeter({ chars }: { chars: number }) {
  const pct = Math.min((chars / FREE_TIER_CHARS) * 100, 100);
  const level = pct >= 95 ? "danger" : pct >= 80 ? "warn" : "ok";
  const monthName = new Date().toLocaleDateString("pt-BR", { month: "long" });
  return (
    <div
      className="tr-usage"
      title="Contagem local do que este app enviou. O valor oficial fica no Google Cloud Console (APIs e serviços → Cloud Translation API → Cotas)."
    >
      <div className="tr-usage-bar">
        <div className={`tr-usage-fill ${level}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`tr-usage-label${level !== "ok" ? ` ${level}` : ""}`}>
        {chars.toLocaleString("pt-BR")} / {FREE_TIER_CHARS.toLocaleString("pt-BR")} caracteres em {monthName}
        {level === "danger" && " — limite quase estourando!"}
        {level === "warn" && " — atenção ao limite"}
      </span>
    </div>
  );
}

export default function TranslatePanel({ open, onClose }: Props) {
  const [hasKey, setHasKey] = useState(() => !!getTranslateKey());
  const [keyInput, setKeyInput] = useState("");
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [direction, setDirection] = useState<Direction>("auto");
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [detected, setDetected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [usage, setUsage] = useState(() => getMonthlyUsage());
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const requestId = useRef(0);

  // Recarrega o consumo ao abrir (pode ter virado o mês / traduzido em outra janela)
  useEffect(() => {
    if (open) setUsage(getMonthlyUsage());
  }, [open]);

  // Foca o campo de origem ao abrir
  useEffect(() => {
    if (open && hasKey && !showKeyConfig) {
      setTimeout(() => sourceRef.current?.focus(), 50);
    }
  }, [open, hasKey, showKeyConfig]);

  // Traduz automaticamente enquanto digita (debounce 600ms)
  useEffect(() => {
    if (!open || !hasKey) return;
    setError(null);
    if (!text.trim()) {
      setResult("");
      setDetected(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const r = await translate(text, direction);
        if (id !== requestId.current) return; // resposta antiga — descarta
        setResult(r.text);
        setDetected(r.detectedSource ?? null);
        setUsage(getMonthlyUsage());
        setLoading(false);
      } catch (e) {
        if (id !== requestId.current) return;
        setError(e instanceof Error ? e.message : "Erro ao traduzir");
        setUsage(getMonthlyUsage()); // no modo auto a 1ª chamada pode ter contado
        setLoading(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [text, direction, open, hasKey]);

  if (!open) return null;

  function handleSaveKey() {
    if (!keyInput.trim()) return;
    setTranslateKey(keyInput);
    setKeyInput("");
    setHasKey(true);
    setShowKeyConfig(false);
  }

  function handleSwap() {
    const newSource = result;
    setDirection((d) => {
      if (d === "en-pt") return "pt-en";
      if (d === "pt-en") return "en-pt";
      return d; // auto re-detecta sozinho
    });
    setText(newSource);
    setResult("");
    sourceRef.current?.focus();
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const needsSetup = !hasKey || showKeyConfig;

  return (
    <div className="tr-overlay" onClick={onClose}>
      <div
        className="tr-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      >
        <div className="tr-header">
          <span className="tr-title">
            <Languages size={14} /> Tradutor
          </span>
          {!needsSetup && (
            <div className="tr-directions">
              {DIRECTIONS.map((d) => (
                <button
                  key={d.value}
                  className={`tr-dir-btn${direction === d.value ? " active" : ""}`}
                  onClick={() => setDirection(d.value)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
          <button className="tr-close" onClick={onClose} title="Fechar (Esc)">
            <XIcon size={14} />
          </button>
        </div>

        {needsSetup ? (
          <div className="tr-setup">
            <p className="tr-setup-title">
              <KeyRound size={13} /> Chave da Cloud Translation API
            </p>
            <ol className="tr-setup-steps">
              <li>Acesse <code>console.cloud.google.com</code> e crie um projeto (ou use um existente)</li>
              <li>Em "APIs e serviços", ative a <strong>Cloud Translation API</strong></li>
              <li>Em "Credenciais", crie uma <strong>Chave de API</strong> e cole aqui</li>
            </ol>
            <p className="tr-setup-note">
              O free tier cobre 500 mil caracteres por mês. A chave fica salva só neste
              computador (localStorage).
            </p>
            <div className="tr-setup-form">
              <input
                className="tr-key-input"
                type="password"
                placeholder="AIza..."
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveKey()}
                autoFocus
              />
              <button className="tr-save-key-btn" onClick={handleSaveKey} disabled={!keyInput.trim()}>
                Salvar
              </button>
              {hasKey && (
                <button className="tr-cancel-btn" onClick={() => setShowKeyConfig(false)}>
                  Cancelar
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="tr-body">
              <textarea
                ref={sourceRef}
                className="tr-textarea"
                placeholder="Digite ou cole o texto..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
              />
              <div className="tr-middle">
                <button
                  className="tr-swap-btn"
                  onClick={handleSwap}
                  disabled={!result}
                  title="Inverter (usa a tradução como origem)"
                >
                  <ArrowLeftRight size={14} />
                </button>
              </div>
              <div className="tr-result-wrap">
                <textarea
                  className="tr-textarea tr-result"
                  placeholder="Tradução..."
                  value={result}
                  readOnly
                  rows={5}
                />
                {loading && <Loader2 size={14} className="tr-spinner" />}
                {result && !loading && (
                  <button className="tr-copy-btn" onClick={handleCopy} title="Copiar tradução">
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                )}
              </div>
            </div>

            {error && <p className="tr-error">{error}</p>}

            <UsageMeter chars={usage.chars} />

            <div className="tr-footer">
              <span className="tr-hint">
                {direction === "auto" && detected
                  ? `Detectado: ${detected.toUpperCase()} · `
                  : ""}
                {text.length > 0 ? `${text.length} caracteres` : "Tradução automática ao digitar"}
              </span>
              <button className="tr-change-key" onClick={() => setShowKeyConfig(true)}>
                <KeyRound size={11} /> Alterar chave
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
