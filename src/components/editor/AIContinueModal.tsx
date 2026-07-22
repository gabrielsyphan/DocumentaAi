import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Sparkles, X as XIcon, Square, RotateCcw } from "lucide-react";
import { MCP_PATH_STORAGE } from "../chat/ChatPanel";

interface Props {
  selectedText: string;
  /** Texto completo da página (antes e depois do trecho selecionado), para o
   * agente manter consistência com personagens/fatos/tom já estabelecidos. */
  pageContext: string;
  pageTitle: string;
  onInsert: (text: string) => void;
  onClose: () => void;
}

interface EngineCheck {
  available: boolean;
  bin_path: string | null;
  mcp_ok: boolean;
  mcp_path: string | null;
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? t.slice(0, max).trim() + "…" : t;
}

// Substitui o system prompt padrão do chat (que manda sempre responder em
// português) — aqui isso conflitaria com "continue no mesmo idioma" sempre
// que o trecho selecionado estiver em outro idioma (ex.: diário em inglês),
// e o modelo tentando obedecer aos dois acaba trocando de idioma no meio do texto.
const CONTINUE_SYSTEM_PROMPT =
  "Você é um assistente de escrita que continua textos exatamente no idioma em que foram escritos — " +
  "nunca troque de idioma no meio da resposta, mesmo que o pedido em si esteja em português. " +
  "Responda apenas com a continuação pedida, sem comentários, saudações ou explicações.";

function buildPrompt(selectedText: string, pageContext: string, pageTitle: string): string {
  return [
    `Você está ajudando a continuar um texto que o usuário está escrevendo na página "${pageTitle}". Neste pedido NÃO consulte a base de conhecimento — use apenas o texto fornecido abaixo.`,
    "",
    "Conteúdo completo da página, para contexto (pode incluir texto antes E depois do trecho selecionado — personagens, fatos e tom já estabelecidos):",
    '"""',
    (pageContext || selectedText).slice(0, 6000),
    '"""',
    "",
    "O trecho selecionado pelo usuário — o ponto exato de onde a continuação deve começar — é este:",
    '"""',
    selectedText.slice(0, 2000),
    '"""',
    "",
    "Escreva de 1 a 3 parágrafos que continuem NATURALMENTE logo após esse trecho selecionado, coerentes com o restante do texto da página. Do início ao fim no MESMO idioma em que o trecho selecionado está escrito (se estiver em inglês, continue inteiramente em inglês; nunca troque de idioma no meio). Mantenha o mesmo tom e estilo. Não repita o que já foi escrito e não reescreva partes que já existem depois do trecho selecionado.",
    "Responda APENAS com o texto da continuação: sem comentários, sem aspas, sem títulos markdown.",
  ].join("\n");
}

// Extrai só o texto do assistente das linhas emitidas pelo agente CLI — versão
// enxuta do parser do ChatPanel, sem chips de tool/multi-turno (aqui é sempre
// uma resposta única, então texto final substitui os deltas acumulados).
function useAgentText() {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];
    listen<string>("chat-agent-line", (e) => {
      let msg: unknown;
      try {
        msg = JSON.parse(e.payload);
        if (typeof msg !== "object" || msg === null) throw new Error("não é evento");
      } catch {
        setText((t) => t + e.payload + "\n"); // Kiro: texto puro
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = msg as any;
      if (m.type === "stream_event") {
        const ev = m.event;
        if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta") {
          setText((t) => t + ev.delta.text);
        }
        return;
      }
      if (m.type === "assistant") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const blocks = m.message?.content ?? [];
        const full = blocks
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((b: any) => b.type === "text")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((b: any) => b.text as string)
          .join("");
        if (full.trim()) setText(full);
        return;
      }
      if (m.type === "result" && m.subtype && m.subtype !== "success") {
        setError(
          m.subtype === "error_max_turns"
            ? "A geração atingiu o limite de turnos — tente com um trecho menor."
            : `O agente terminou com erro (${m.subtype}).`
        );
      }
    }).then((u) => unlisteners.push(u));

    listen<{ code: number; stderr: string }>("chat-agent-done", (e) => {
      setRunning(false);
      if (e.payload.code !== 0 && e.payload.code !== 143 /* SIGTERM = cancelado */) {
        const tail = e.payload.stderr.trim().split("\n").slice(-3).join("\n");
        setError(tail || `O processo terminou com código ${e.payload.code}.`);
      }
    }).then((u) => unlisteners.push(u));

    return () => unlisteners.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { text, setText, running, setRunning, error, setError };
}

export default function AIContinueModal({ selectedText, pageContext, pageTitle, onInsert, onClose }: Props) {
  const { text, setText, running, setRunning, error, setError } = useAgentText();
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const startedRef = useRef(false);

  const mcpOverride = localStorage.getItem(MCP_PATH_STORAGE) ?? undefined;

  async function generate() {
    setError(null);
    setText("");
    setRunning(true);
    try {
      await invoke("chat_agent_send", {
        engine: "claude",
        prompt: buildPrompt(selectedText, pageContext, pageTitle),
        sessionId: null,
        mcpPathOverride: mcpOverride ?? null,
        systemPrompt: CONTINUE_SYSTEM_PROMPT,
      });
    } catch (e) {
      setRunning(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const check = await invoke<EngineCheck>("chat_agent_check", {
        engine: "claude",
        mcpPathOverride: mcpOverride ?? null,
      }).catch(() => null);
      if (!check?.available) {
        setUnavailable("Claude Code não encontrado. Instale e faça login (mesma configuração do chat — ⌘J) para usar esta ação.");
        return;
      }
      if (!check.mcp_ok) {
        setUnavailable("Configuração do chat pendente. Abra o chat (⌘J) uma vez para concluir a instalação e volte aqui.");
        return;
      }
      generate();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function requestClose() {
    invoke("chat_agent_cancel").catch(() => {});
    onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleInsert() {
    if (!text.trim()) return;
    invoke("chat_agent_cancel").catch(() => {});
    onInsert(text.trim());
    onClose();
  }

  function handleStop() {
    invoke("chat_agent_cancel").catch(() => {});
  }

  return (
    <div className="ai-continue-overlay" onClick={requestClose}>
      <div className="ai-continue-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ai-continue-header">
          <span className="ai-continue-title"><Sparkles size={14} /> Continuar com IA</span>
          <button className="ai-continue-close" onClick={requestClose} title="Fechar (Esc)">
            <XIcon size={14} />
          </button>
        </div>

        <div className="ai-continue-selection">
          <span className="ai-continue-selection-label">A partir de:</span>
          <p className="ai-continue-selection-text">"{truncate(selectedText, 220)}"</p>
        </div>

        {unavailable ? (
          <p className="ai-continue-error">{unavailable}</p>
        ) : (
          <>
            <div className="ai-continue-output">
              {text || (running ? "Gerando…" : "")}
            </div>

            {error && <p className="ai-continue-error">{error}</p>}

            <div className="ai-continue-actions">
              {running ? (
                <button className="ai-continue-btn ghost" onClick={handleStop}>
                  <Square size={13} /> Parar
                </button>
              ) : (
                <>
                  <button className="ai-continue-btn ghost" onClick={requestClose}>Descartar</button>
                  {text.trim() && (
                    <button className="ai-continue-btn ghost" onClick={generate}>
                      <RotateCcw size={13} /> Gerar de novo
                    </button>
                  )}
                  <button className="ai-continue-btn primary" onClick={handleInsert} disabled={!text.trim()}>
                    Inserir na página
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
