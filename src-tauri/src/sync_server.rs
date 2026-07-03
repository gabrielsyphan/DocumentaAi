// ── Servidor de sync por rede local (desktop-only) ───────────────────────────
//
// O desktop expõe um servidor HTTP na porta 7420. O app mobile (na mesma
// rede Wi-Fi) envia todas as suas páginas via POST /sync; o servidor aplica
// merge last-write-wins por página (updated_at mais recente vence) e responde
// com as páginas em que a cópia do desktop é mais nova — o mobile aplica o
// mesmo merge do lado dele. Sem nuvem, sem conta.

use std::collections::HashMap;
use std::sync::Mutex;

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use tauri::Manager;

pub const SYNC_PORT: u16 = 7420;

// Canal para desligar o servidor; Some(..) = rodando
static SHUTDOWN: Mutex<Option<tokio::sync::oneshot::Sender<()>>> = Mutex::new(None);

// ── Modelo ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SyncPage {
    pub id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub emoji: Option<String>,
    pub content: Option<String>,
    pub order_index: f64,
    pub is_favorite: i64,
    #[serde(rename = "type")]
    #[sqlx(rename = "type")]
    pub page_type: String,
    pub tags: String,
    pub deleted_at: Option<String>,
    pub reminder_date: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
struct SyncRequest {
    pages: Vec<SyncPage>,
}

#[derive(Serialize)]
struct SyncResponse {
    pages: Vec<SyncPage>,
}

#[derive(Serialize)]
struct PushResponse {
    applied: usize,
}

/// Normaliza timestamps para comparação lexicográfica: o SQLite `datetime('now')`
/// gera "YYYY-MM-DD HH:MM:SS" e o JS `toISOString()` gera "YYYY-MM-DDTHH:MM:SS.sssZ".
/// Ambos são UTC; trocando o espaço por 'T' a comparação de strings ordena certo.
fn norm(ts: &str) -> String {
    ts.replace(' ', "T")
}

// ── Rotas ─────────────────────────────────────────────────────────────────────

async fn ping() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "app": "documentaai",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

const SELECT_ALL: &str = "SELECT id, parent_id, title, emoji, content, order_index, is_favorite, \
     type, tags, deleted_at, reminder_date, created_at, updated_at FROM pages";

const UPSERT: &str = "INSERT INTO pages \
     (id, parent_id, title, emoji, content, order_index, is_favorite, \
      type, tags, deleted_at, reminder_date, created_at, updated_at) \
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
     ON CONFLICT(id) DO UPDATE SET \
       parent_id = excluded.parent_id, title = excluded.title, \
       emoji = excluded.emoji, content = excluded.content, \
       order_index = excluded.order_index, is_favorite = excluded.is_favorite, \
       type = excluded.type, tags = excluded.tags, \
       deleted_at = excluded.deleted_at, reminder_date = excluded.reminder_date, \
       created_at = excluded.created_at, updated_at = excluded.updated_at";

async fn upsert_page(pool: &SqlitePool, p: &SyncPage) -> Result<(), sqlx::Error> {
    sqlx::query(UPSERT)
        .bind(&p.id)
        .bind(&p.parent_id)
        .bind(&p.title)
        .bind(&p.emoji)
        .bind(&p.content)
        .bind(p.order_index)
        .bind(p.is_favorite)
        .bind(&p.page_type)
        .bind(&p.tags)
        .bind(&p.deleted_at)
        .bind(&p.reminder_date)
        .bind(&p.created_at)
        .bind(&p.updated_at)
        .execute(pool)
        .await
        .map(|_| ())
}

/// GET /pages — páginas vivas do desktop (para o "Baixar do desktop" no mobile).
/// Deleções não propagam nos modos direcionais, então a lixeira fica de fora.
async fn list_pages(
    State(pool): State<SqlitePool>,
) -> Result<Json<SyncResponse>, (StatusCode, String)> {
    let pages: Vec<SyncPage> = sqlx::query_as(
        &format!("{SELECT_ALL} WHERE deleted_at IS NULL"),
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(SyncResponse { pages }))
}

/// POST /push — aplica incondicionalmente as páginas recebidas (o mobile manda
/// só as vivas): sobrescreve as existentes e cria as que faltam — inclusive
/// recriando páginas que estavam na lixeira do desktop. Nunca deleta nada.
async fn push(
    State(pool): State<SqlitePool>,
    Json(req): Json<SyncRequest>,
) -> Result<Json<PushResponse>, (StatusCode, String)> {
    let mut applied = 0;
    for p in &req.pages {
        upsert_page(&pool, p)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        applied += 1;
    }
    Ok(Json(PushResponse { applied }))
}

async fn sync(
    State(pool): State<SqlitePool>,
    Json(req): Json<SyncRequest>,
) -> Result<Json<SyncResponse>, (StatusCode, String)> {
    let err500 = |e: sqlx::Error| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string());

    // Estado do servidor ANTES do merge — usado para decidir a resposta
    let server_pages: Vec<SyncPage> = sqlx::query_as(SELECT_ALL)
        .fetch_all(&pool)
        .await
        .map_err(err500)?;

    let server_map: HashMap<&str, &str> = server_pages
        .iter()
        .map(|p| (p.id.as_str(), p.updated_at.as_str()))
        .collect();

    let client_map: HashMap<&str, &str> = req
        .pages
        .iter()
        .map(|p| (p.id.as_str(), p.updated_at.as_str()))
        .collect();

    // Aplica páginas do cliente que são novas ou mais recentes que as locais
    for p in &req.pages {
        let apply = match server_map.get(p.id.as_str()) {
            None => true,
            Some(server_ts) => norm(&p.updated_at) > norm(server_ts),
        };
        if apply {
            upsert_page(&pool, p).await.map_err(err500)?;
        }
    }

    // Responde com páginas em que o desktop é mais novo (ou que o cliente não tem)
    let out: Vec<SyncPage> = server_pages
        .into_iter()
        .filter(|sp| match client_map.get(sp.id.as_str()) {
            None => true,
            Some(client_ts) => norm(&sp.updated_at) > norm(client_ts),
        })
        .collect();

    Ok(Json(SyncResponse { pages: out }))
}

// ── Controle do servidor (comandos Tauri) ─────────────────────────────────────

#[derive(Serialize)]
pub struct SyncServerStatus {
    pub running: bool,
    pub ip: Option<String>,
    pub port: u16,
}

fn current_status() -> SyncServerStatus {
    let running = SHUTDOWN.lock().map(|g| g.is_some()).unwrap_or(false);
    SyncServerStatus {
        running,
        ip: local_ip_address::local_ip().ok().map(|ip| ip.to_string()),
        port: SYNC_PORT,
    }
}

#[tauri::command]
pub fn sync_server_status() -> SyncServerStatus {
    current_status()
}

#[tauri::command]
pub async fn sync_server_start(app: tauri::AppHandle) -> Result<SyncServerStatus, String> {
    {
        let guard = SHUTDOWN.lock().map_err(|_| "Mutex error")?;
        if guard.is_some() {
            return Ok(current_status());
        }
    }

    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("documentaai.db");
    if !db_path.exists() {
        return Err("Banco de dados ainda não existe — abra uma página primeiro.".into());
    }

    // foreign_keys OFF (o sqlx liga por padrão): com FK ligada, inserir uma
    // subpágina antes do pai falha, e INSERT OR REPLACE num pai dispararia o
    // ON DELETE CASCADE apagando os filhos. O merge trata a árvore completa,
    // então a integridade referencial se resolve ao final do lote.
    let options = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(false)
        .foreign_keys(false);
    let pool = SqlitePoolOptions::new()
        .max_connections(2)
        .connect_with(options)
        .await
        .map_err(|e| format!("Erro ao abrir o banco: {e}"))?;

    let cors = tower_http::cors::CorsLayer::new()
        .allow_origin(tower_http::cors::Any)
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    let router = Router::new()
        .route("/ping", get(ping))
        .route("/sync", post(sync))
        .route("/pages", get(list_pages))
        .route("/push", post(push))
        .layer(cors)
        .with_state(pool);

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", SYNC_PORT))
        .await
        .map_err(|e| format!("Erro ao abrir a porta {SYNC_PORT}: {e}"))?;

    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    *SHUTDOWN.lock().map_err(|_| "Mutex error")? = Some(tx);

    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = rx.await;
            })
            .await;
    });

    Ok(current_status())
}

#[tauri::command]
pub fn sync_server_stop() -> SyncServerStatus {
    if let Ok(mut guard) = SHUTDOWN.lock() {
        if let Some(tx) = guard.take() {
            let _ = tx.send(());
        }
    }
    current_status()
}
