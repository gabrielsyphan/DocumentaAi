import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  MessageSquareText, X as XIcon, Send, Square, Plus,
  Search as SearchIcon, FileText, AlertTriangle, ChevronDown,
  Download, Loader2, Check as CheckIcon, Languages,
} from "lucide-react";
import { usePagesStore } from "../../store/pages.store";
import { extractParagraphs } from "../../lib/tts";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Engine = "claude" | "kiro";

type ChatItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; live: boolean }
  | { kind: "tool"; name: string; detail: string };

interface EngineCheck {
  available: boolean;
  bin_path: string | null;
  mcp_ok: boolean;
  mcp_path: string | null;
}

const MCP_PATH_STORAGE = "documentaai-chat-mcp-path";

const ENGINE_LABELS: Record<Engine, string> = { claude: "Claude", kiro: "Kiro CLI" };

const INSTALL_STAGES: Record<string, string> = {
  download: "Baixando o pacote do GitHub…",
  extract: "Extraindo…",
  install: "Instalando dependências (npm install)…",
  build: "Compilando…",
};

function toolLabel(name: string, input: Record<string, unknown>): { name: string; detail: string } {
  const short = name.replace("mcp__documentaai__", "");
  const detail =
    typeof input.query === "string" ? input.query
    : typeof input.id === "string" ? input.id
    : JSON.stringify(input).slice(0, 60);
  return { name: short, detail };
}

export default function ChatPanel({ open, onClose }: Props) {
  const { selectPage, pages, selectedPageId } = usePagesStore();
  const [engine, setEngine] = useState<Engine>("claude");
  const [check, setCheck] = useState<EngineCheck | null>(null);
  const [showEngineMenu, setShowEngineMenu] = useState(false);
  const [mcpPathInput, setMcpPathInput] = useState("");
  const [installStage, setInstallStage] = useState<string | null>(null);
  const [installDone, setInstallDone] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const engineMenuRef = useRef<HTMLDivElement>(null);

  const mcpOverride = localStorage.getItem(MCP_PATH_STORAGE) ?? undefined;

  const runCheck = useCallback(async (eng: Engine) => {
    try {
      const c = await invoke<EngineCheck>("chat_agent_check", {
        engine: eng,
        mcpPathOverride: localStorage.getItem(MCP_PATH_STORAGE) ?? null,
      });
      setCheck(c);
    } catch {
      setCheck(null);
    }
  }, []);

  useEffect(() => {
    if (open) {
      runCheck(engine);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open, engine, runCheck]);

  // Fecha o menu de engine ao clicar fora
  useEffect(() => {
    if (!showEngineMenu) return;
    const close = (e: MouseEvent) => {
      if (!engineMenuRef.current?.contains(e.target as Node)) setShowEngineMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showEngineMenu]);

  // ── Streaming: parseia cada linha JSON emitida pelo Rust ──
  const handleLine = useCallback((line: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let msg: any;
    try {
      msg = JSON.parse(line);
      if (typeof msg !== "object" || msg === null) throw new Error("não é evento");
    } catch {
      // Kiro emite texto puro — trata como delta do assistente
      setItems((prev) => appendDelta(prev, line + "\n"));
      return;
    }

    if (msg.type === "system" && msg.subtype === "init" && msg.session_id) {
      sessionRef.current = msg.session_id;
      return;
    }

    if (msg.type === "stream_event") {
      const ev = msg.event;
      if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta") {
        setItems((prev) => appendDelta(prev, ev.delta.text));
      }
      return;
    }

    if (msg.type === "assistant") {
      const blocks = msg.message?.content ?? [];
      setItems((prev) => {
        let next = [...prev];
        for (const b of blocks) {
          if (b.type === "text" && b.text?.trim()) {
            // Substitui o item "live" pelos dados autoritativos da mensagem completa
            const liveIdx = next.findIndex((it) => it.kind === "assistant" && it.live);
            if (liveIdx >= 0) next[liveIdx] = { kind: "assistant", text: b.text, live: false };
            else next = [...next, { kind: "assistant", text: b.text, live: false }];
          } else if (b.type === "tool_use") {
            const { name, detail } = toolLabel(b.name ?? "?", b.input ?? {});
            next = [...next, { kind: "tool", name, detail }];
          }
        }
        return next;
      });
      return;
    }

    if (msg.type === "result") {
      if (msg.session_id) sessionRef.current = msg.session_id;
      if (msg.subtype && msg.subtype !== "success") {
        setError(
          msg.subtype === "error_max_turns"
            ? "A conversa atingiu o limite de turnos — tente uma pergunta mais direta."
            : `O agente terminou com erro (${msg.subtype}).`
        );
      }
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const unlisteners: UnlistenFn[] = [];
    listen<string>("mcp-install-progress", (e) => setInstallStage(e.payload)).then((u) => unlisteners.push(u));
    listen<string>("chat-agent-line", (e) => handleLine(e.payload)).then((u) => unlisteners.push(u));
    listen<{ code: number; stderr: string }>("chat-agent-done", (e) => {
      setRunning(false);
      setItems((prev) => prev.map((it) => (it.kind === "assistant" ? { ...it, live: false } : it)));
      if (e.payload.code !== 0 && e.payload.code !== 143 /* SIGTERM = cancelado */) {
        const tail = e.payload.stderr.trim().split("\n").slice(-3).join("\n");
        setError(tail || `O processo terminou com código ${e.payload.code}.`);
      }
    }).then((u) => unlisteners.push(u));
    return () => unlisteners.forEach((u) => u());
  }, [open, handleLine]);

  // Autoscroll enquanto chegam mensagens
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

  if (!open) return null;

  // Página aberta no editor (o editor atualiza o store a cada tecla, então o
  // conteúdo aqui está sempre fresco)
  const currentPage = pages.find((p) => p.id === selectedPageId);
  let currentPageText = "";
  if (currentPage?.content && currentPage.type !== "canvas") {
    try {
      currentPageText = extractParagraphs(JSON.parse(currentPage.content)).join("\n");
    } catch { /* conteúdo inválido — sem quick action */ }
  }

  // `display` é o que aparece na bolha do usuário; `prompt` é o que vai ao agente
  async function sendPrompt(prompt: string, display: string) {
    if (running) return;
    setError(null);
    setItems((prev) => [...prev, { kind: "user", text: display }]);
    setRunning(true);
    try {
      await invoke("chat_agent_send", {
        engine,
        prompt,
        sessionId: engine === "claude" ? sessionRef.current : null,
        mcpPathOverride: mcpOverride ?? null,
      });
    } catch (e) {
      setRunning(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSend() {
    const prompt = input.trim();
    if (!prompt || running) return;
    setInput("");
    await sendPrompt(prompt, prompt);
  }

  function handleCorrectEnglish() {
    if (!currentPage || !currentPageText.trim()) return;
    const title = currentPage.title || "Sem título";
    const prompt = [
      `Aja como um professor de inglês corrigindo o texto de um aluno brasileiro. Neste pedido NÃO consulte a base de conhecimento — trabalhe apenas com o texto abaixo, vindo da página "${title}".`,
      "",
      "Responda em português, nesta estrutura:",
      "1. **Versão corrigida** — o texto reescrito em inglês natural, mantendo o estilo do aluno.",
      '2. **Erros e explicações** — para cada erro relevante (gramática, vocabulário, naturalidade), mostre "errado → certo" e explique em uma frase curta o porquê.',
      "3. **Flashcards sugeridos** — 3 a 6 linhas no formato `expressão correta em inglês - tradução ou lembrete do erro` (hífen cercado de espaços, uma linha por card), prontas para o aluno importar como flashcards.",
      "",
      "Se o texto não estiver em inglês ou estiver vazio, apenas diga isso.",
      "Formate para um chat simples: sem títulos markdown (#), sem tabelas e sem blocos de código — apenas **negrito** e listas.",
      "",
      "Texto do aluno:",
      '"""',
      currentPageText.slice(0, 8000),
      '"""',
    ].join("\n");
    sendPrompt(prompt, `Corrigir meu inglês — página "${title}"`);
  }

  function handleStop() {
    invoke("chat_agent_cancel").catch(() => {});
  }

  function handleNewConversation() {
    handleStop();
    sessionRef.current = null;
    setItems([]);
    setError(null);
    inputRef.current?.focus();
  }

  function handleSaveMcpPath() {
    localStorage.setItem(MCP_PATH_STORAGE, mcpPathInput.trim());
    runCheck(engine);
  }

  async function handleAutoInstall() {
    setInstallError(null);
    setInstallStage("download");
    try {
      await invoke<string>("install_mcp_server");
      setInstallDone(true);
      setInstallStage(null);
      // o caminho instalado é resolvido automaticamente pelo check
      await runCheck(engine);
    } catch (e) {
      setInstallStage(null);
      setInstallError(e instanceof Error ? e.message : String(e));
    }
  }

  // Clique num título de página citado → abre a página (se existir)
  function tryOpenPage(title: string) {
    const page = pages.find((p) => (p.title || "").toLowerCase() === title.toLowerCase());
    if (page) {
      selectPage(page.id);
      onClose();
    }
  }

  const needsSetup = check && (!check.available || !check.mcp_ok);

  return (
    <div className="chat-overlay" onClick={onClose}>
      <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="chat-header">
          <span className="chat-title">
            <MessageSquareText size={14} /> Chat com a base
          </span>
          <div className="chat-engine-wrap" ref={engineMenuRef}>
            <button className="chat-engine-btn" onClick={() => setShowEngineMenu((v) => !v)}>
              {ENGINE_LABELS[engine]} <ChevronDown size={11} />
            </button>
            {showEngineMenu && (
              <div className="chat-engine-menu">
                {(Object.keys(ENGINE_LABELS) as Engine[]).map((e) => (
                  <button
                    key={e}
                    className={`chat-engine-item${engine === e ? " active" : ""}`}
                    onClick={() => { setEngine(e); setShowEngineMenu(false); handleNewConversation(); }}
                  >
                    {ENGINE_LABELS[e]}
                    {e === "kiro" && <span className="chat-engine-note">sem memória de conversa</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="chat-icon-btn" onClick={handleNewConversation} title="Nova conversa">
            <Plus size={14} />
          </button>
          <button className="chat-icon-btn" onClick={onClose} title="Fechar (Esc)">
            <XIcon size={14} />
          </button>
        </div>

        {needsSetup ? (
          <div className="chat-setup">
            {!check.available ? (
              <>
                <p className="chat-setup-title">
                  <AlertTriangle size={13} /> {engine === "kiro" ? "kiro-cli" : "claude"} não encontrado
                </p>
                <p className="chat-setup-text">
                  {engine === "kiro"
                    ? "Instale o Kiro CLI (kiro.dev/cli) e faça login. Depois reabra este painel."
                    : "Instale o Claude Code (claude.com/claude-code) e faça login. Depois reabra este painel."}
                </p>
              </>
            ) : (
              <>
                <p className="chat-setup-title">
                  <AlertTriangle size={13} /> Servidor da base de conhecimento não instalado
                </p>
                <p className="chat-setup-text">
                  O chat usa o <strong>mcp-server</strong> do DocumentaAI para buscar nas suas páginas.
                  Ele pode ser instalado automaticamente — só precisa do{" "}
                  <strong>Node.js</strong> na máquina (nodejs.org).
                </p>

                {installStage ? (
                  <div className="chat-install-progress">
                    <Loader2 size={14} className="chat-install-spinner" />
                    <div>
                      <p className="chat-install-stage">
                        {INSTALL_STAGES[installStage] ?? "Instalando…"}
                      </p>
                      <p className="chat-install-hint">
                        Leva menos de um minuto. Não feche o app.
                      </p>
                    </div>
                  </div>
                ) : installDone ? (
                  <p className="chat-install-ok">
                    <CheckIcon size={13} /> Instalado! Abrindo o chat…
                  </p>
                ) : (
                  <button className="chat-install-btn" onClick={handleAutoInstall}>
                    <Download size={14} /> Instalar automaticamente
                  </button>
                )}

                {installError && <p className="chat-error" style={{ margin: "10px 0 0" }}>{installError}</p>}

                <details className="chat-setup-manual">
                  <summary>Configurar manualmente (avançado)</summary>
                  <ol className="chat-setup-steps">
                    <li>
                      Baixe <code>documentaai-mcp-server.zip</code> na página de releases do GitHub
                      (github.com/gabrielsyphan/documentaai/releases) e extraia numa pasta permanente
                    </li>
                    <li>Dentro da pasta extraída, rode <code>npm install</code> e depois <code>npm run build</code></li>
                    <li>Cole abaixo o caminho completo até <code>dist/index.js</code>:</li>
                  </ol>
                  <div className="chat-setup-form">
                    <input
                      className="chat-setup-input"
                      placeholder="/caminho/para/mcp-server/dist/index.js"
                      value={mcpPathInput}
                      onChange={(e) => setMcpPathInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveMcpPath()}
                    />
                    <button className="chat-setup-save" onClick={handleSaveMcpPath}>Salvar</button>
                  </div>
                </details>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="chat-messages" ref={listRef}>
              {items.length === 0 && (
                <div className="chat-empty">
                  <MessageSquareText size={22} />
                  <p>Pergunte qualquer coisa sobre as suas anotações.</p>
                  <p className="chat-empty-hint">
                    O agente busca na base de conhecimento e responde citando as páginas-fonte.
                    Usa a sua sessão logada do {ENGINE_LABELS[engine]} — sem custo extra.
                  </p>
                </div>
              )}
              {items.map((item, i) => {
                if (item.kind === "user") {
                  return <div key={i} className="chat-bubble user">{item.text}</div>;
                }
                if (item.kind === "tool") {
                  return (
                    <div key={i} className="chat-tool-chip">
                      {item.name === "get_page" ? <FileText size={11} /> : <SearchIcon size={11} />}
                      <span className="chat-tool-name">{item.name}</span>
                      <span className="chat-tool-detail">{item.detail}</span>
                    </div>
                  );
                }
                return (
                  <div key={i} className={`chat-bubble assistant${item.live ? " live" : ""}`}>
                    <AssistantText text={item.text} onPageClick={tryOpenPage} />
                  </div>
                );
              })}
              {running && <div className="chat-thinking">pensando…</div>}
            </div>

            {error && <p className="chat-error">{error}</p>}

            {currentPage && currentPageText.trim() && !running && (
              <div className="chat-quick-row">
                <button
                  className="chat-quick-chip"
                  onClick={handleCorrectEnglish}
                  title="Envia o texto da página aberta para o agente corrigir como professor de inglês"
                >
                  <Languages size={12} />
                  Corrigir meu inglês
                  <span className="chat-quick-page">{currentPage.title || "Sem título"}</span>
                </button>
              </div>
            )}

            <div className="chat-input-row">
              <textarea
                ref={inputRef}
                className="chat-input"
                placeholder="Pergunte sobre suas anotações… (Enter envia, Shift+Enter quebra linha)"
                value={input}
                rows={2}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  } else if (e.key === "Escape") {
                    onClose();
                  }
                }}
              />
              {running ? (
                <button className="chat-send-btn stop" onClick={handleStop} title="Parar">
                  <Square size={14} />
                </button>
              ) : (
                <button className="chat-send-btn" onClick={handleSend} disabled={!input.trim()} title="Enviar (Enter)">
                  <Send size={14} />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Acrescenta um delta de texto ao item assistant "live" (cria se não existe)
function appendDelta(items: ChatItem[], delta: string): ChatItem[] {
  const last = items[items.length - 1];
  if (last?.kind === "assistant" && last.live) {
    return [...items.slice(0, -1), { ...last, text: last.text + delta }];
  }
  return [...items, { kind: "assistant", text: delta, live: true }];
}

// Renderiza o texto do assistente: **negrito** vira <strong> e — quando o
// trecho em negrito é o título de uma página — vira link clicável para ela.
function AssistantText({ text, onPageClick }: { text: string; onPageClick: (title: string) => void }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = /^\*\*([^*]+)\*\*$/.exec(part);
        if (!m) return <span key={i}>{part}</span>;
        const inner = m[1].replace(/^"|"$/g, "");
        return (
          <strong key={i} className="chat-page-ref" onClick={() => onPageClick(inner)}>
            {m[1]}
          </strong>
        );
      })}
    </>
  );
}
