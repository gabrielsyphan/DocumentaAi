// ── Chat embutido com agente CLI headless ─────────────────────────────────────
// Spawna `claude -p --output-format stream-json` (ou `kiro-cli chat
// --no-interactive`) restrito às tools de LEITURA da base de conhecimento MCP.
// Cada linha do stdout vira um evento Tauri ("chat-agent-line") que o frontend
// parseia e renderiza em streaming. Usa a sessão já logada do usuário no CLI —
// sem chave de API, sem custo extra além da assinatura existente.

use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

pub struct ChatState(pub Arc<Mutex<Option<Child>>>);

impl Default for ChatState {
    fn default() -> Self {
        ChatState(Arc::new(Mutex::new(None)))
    }
}

// Tools que o agente do chat pode usar — só leitura da base
const ALLOWED_TOOLS: &str = "mcp__documentaai__search_knowledge,mcp__documentaai__get_page,mcp__documentaai__list_knowledge_sources,mcp__documentaai__list_pages,mcp__documentaai__list_children,mcp__documentaai__search_pages,mcp__documentaai__search_content";

// Bloqueio explícito de tudo que escreve ou sai do escopo da base
const DISALLOWED_TOOLS: &str = "Bash,Write,Edit,Read,Glob,Grep,WebFetch,WebSearch,Task,NotebookEdit,mcp__documentaai__create_page,mcp__documentaai__update_page,mcp__documentaai__delete_page,mcp__documentaai__append_to_page,mcp__documentaai__move_page,mcp__documentaai__manage_tags,mcp__documentaai__get_daily_note,mcp__documentaai__reindex_knowledge";

const SYSTEM_PROMPT: &str = "Você é o assistente da base de conhecimento do DocumentaAI (as anotações pessoais do usuário). \
Antes de responder, consulte a base com a tool mcp__documentaai__search_knowledge — pode buscar várias vezes com termos diferentes. \
Cite sempre os títulos das páginas-fonte. Se a base não contém a resposta, diga isso claramente em vez de inventar. \
Responda em português, de forma direta e concisa.";

// ── Resolução de binários ─────────────────────────────────────────────────────
// Apps GUI no macOS não herdam o PATH do shell — procura em locais comuns.

fn resolve_bin(name: &str) -> Option<String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        format!("{home}/.local/bin/{name}"),
        format!("/opt/homebrew/bin/{name}"),
        format!("/usr/local/bin/{name}"),
        format!("{home}/.cargo/bin/{name}"),
    ];
    for c in &candidates {
        if std::path::Path::new(c).exists() {
            return Some(c.clone());
        }
    }
    // Última tentativa: PATH do processo (funciona em `npm run tauri dev`)
    if let Ok(out) = Command::new("which").arg(name).output() {
        if out.status.success() {
            let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !p.is_empty() {
                return Some(p);
            }
        }
    }
    None
}

fn engine_bin_name(engine: &str) -> &'static str {
    if engine == "kiro" { "kiro-cli" } else { "claude" }
}

/// Caminho do mcp-server: override do usuário (config no app) ou o caminho de
/// desenvolvimento (repo local, resolvido em tempo de compilação).
fn resolve_mcp_path(override_path: Option<&str>) -> Option<String> {
    if let Some(p) = override_path {
        if !p.trim().is_empty() && std::path::Path::new(p.trim()).exists() {
            return Some(p.trim().to_string());
        }
    }
    let dev_path = concat!(env!("CARGO_MANIFEST_DIR"), "/../mcp-server/dist/index.js");
    if std::path::Path::new(dev_path).exists() {
        return Some(dev_path.to_string());
    }
    None
}

/// PATH aumentado para o processo filho encontrar `node` (o MCP server precisa)
fn augmented_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let base = std::env::var("PATH").unwrap_or_default();
    format!("{home}/.local/bin:/opt/homebrew/bin:/usr/local/bin:{base}")
}

// ── Comandos ──────────────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct EngineCheck {
    pub available: bool,
    pub bin_path: Option<String>,
    pub mcp_ok: bool,
    pub mcp_path: Option<String>,
}

#[tauri::command]
pub fn chat_agent_check(engine: String, mcp_path_override: Option<String>) -> EngineCheck {
    let bin = resolve_bin(engine_bin_name(&engine));
    let mcp = resolve_mcp_path(mcp_path_override.as_deref());
    EngineCheck {
        available: bin.is_some(),
        bin_path: bin,
        mcp_ok: mcp.is_some(),
        mcp_path: mcp,
    }
}

#[tauri::command]
pub fn chat_agent_cancel(state: tauri::State<'_, ChatState>) {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(child) = guard.as_mut() {
            let _ = child.kill();
        }
    }
}

#[tauri::command]
pub fn chat_agent_send(
    app: tauri::AppHandle,
    state: tauri::State<'_, ChatState>,
    engine: String,
    prompt: String,
    session_id: Option<String>,
    mcp_path_override: Option<String>,
) -> Result<(), String> {
    let bin = resolve_bin(engine_bin_name(&engine))
        .ok_or_else(|| format!("Binário '{}' não encontrado. Instale e tente de novo.", engine_bin_name(&engine)))?;

    let mut cmd = Command::new(&bin);
    cmd.env("PATH", augmented_path());
    // cwd fixo no home: sessões do claude são por diretório (--resume depende disso)
    if let Ok(home) = std::env::var("HOME") {
        cmd.current_dir(home);
    }

    if engine == "kiro" {
        cmd.args(["chat", "--no-interactive", &prompt]);
    } else {
        let mcp_path = resolve_mcp_path(mcp_path_override.as_deref())
            .ok_or("Caminho do mcp-server não encontrado. Configure-o nas opções do chat.")?;
        let mcp_config = format!(
            r#"{{"mcpServers":{{"documentaai":{{"command":"node","args":["{}"]}}}}}}"#,
            mcp_path.replace('\\', "\\\\").replace('"', "\\\"")
        );
        cmd.args([
            "-p", &prompt,
            "--output-format", "stream-json",
            "--verbose",
            "--include-partial-messages",
            "--mcp-config", &mcp_config,
            "--strict-mcp-config",
            "--allowedTools", ALLOWED_TOOLS,
            "--disallowedTools", DISALLOWED_TOOLS,
            "--append-system-prompt", SYSTEM_PROMPT,
            "--max-turns", "15",
        ]);
        if let Some(sid) = &session_id {
            cmd.args(["--resume", sid]);
        }
    }

    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Falha ao iniciar {bin}: {e}"))?;
    let stdout = child.stdout.take().ok_or("stdout indisponível")?;
    let stderr = child.stderr.take().ok_or("stderr indisponível")?;

    // Cancela qualquer execução anterior e guarda a nova
    {
        let mut guard = state.0.lock().map_err(|_| "estado do chat corrompido")?;
        if let Some(old) = guard.as_mut() {
            let _ = old.kill();
        }
        *guard = Some(child);
    }

    let child_slot = state.0.clone();
    let app_out = app.clone();
    let app_done = app;

    // stderr em thread própria — vira o detalhe do erro se o processo falhar
    let stderr_buf: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
    let stderr_buf_reader = stderr_buf.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            if let Ok(mut buf) = stderr_buf_reader.lock() {
                buf.push_str(&line);
                buf.push('\n');
                // guarda só o final (mensagens de erro úteis ficam no fim)
                if buf.len() > 4000 {
                    let cut = buf.len() - 4000;
                    buf.drain(..cut);
                }
            }
        }
    });

    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let _ = app_out.emit("chat-agent-line", &line);
        }
        // stdout fechou → processo terminou (ou foi morto)
        let code = {
            let mut guard = child_slot.lock().ok();
            let child = guard.as_mut().and_then(|g| g.take());
            match child {
                Some(mut c) => c.wait().ok().and_then(|s| s.code()).unwrap_or(-1),
                None => -1,
            }
        };
        let stderr_tail = stderr_buf.lock().map(|b| b.clone()).unwrap_or_default();
        let _ = app_done.emit(
            "chat-agent-done",
            serde_json::json!({ "code": code, "stderr": stderr_tail }),
        );
    });

    Ok(())
}
