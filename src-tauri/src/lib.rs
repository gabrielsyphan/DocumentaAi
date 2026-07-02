use tauri::Manager;
use tauri::tray::TrayIconBuilder;
use tauri::menu::{MenuBuilder, MenuItemBuilder, CheckMenuItemBuilder, PredefinedMenuItem};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
#[cfg(target_os = "macos")]
use std::sync::Mutex;

// ── Speech recognition (macOS only) ──────────────────────────────────────────
#[cfg(target_os = "macos")]
mod speech {
    use objc::{msg_send, sel, sel_impl, runtime::{Class, Object}};
    use block::ConcreteBlock;
    use std::sync::Mutex;
    use std::time::Duration;
    use tauri::{AppHandle, Emitter};

    #[link(name = "AVFoundation", kind = "framework")]
    #[link(name = "Speech",       kind = "framework")]
    extern "C" {}

    struct Session {
        engine:     usize,
        task:       usize,
        input_node: usize,
        recognizer: usize,
        request:    usize,
        app:        AppHandle,
    }
    unsafe impl Send for Session {}

    static ACTIVE: Mutex<Option<Session>> = Mutex::new(None);

    // Returns a class or an Err — never panics (unlike class!() which panics on missing class)
    fn cls(name: &str) -> Result<*const Class, String> {
        Class::get(name)
            .map(|c| c as *const Class)
            .ok_or_else(|| format!("Classe ObjC '{name}' não encontrada. \
                O app pode precisar ser recompilado com suporte ao framework."))
    }

    // ── Authorization — dispatched to main thread ─────────────────────────────
    // Apple docs: "Call this method from the main application thread."
    pub fn request_auth(app: AppHandle) -> Result<(), String> {
        let sf_cls = cls("SFSpeechRecognizer")?; // verify framework is linked before dispatch

        let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
        let sf_cls_addr = sf_cls as usize; // usize is Send

        app.run_on_main_thread(move || {
            let sf = sf_cls_addr as *const Class;

            // Check current status synchronously first (avoids the dialog if already granted)
            // SFSpeechRecognizerAuthorizationStatus: NotDetermined=0, Denied=1, Restricted=2, Authorized=3
            let status: isize = unsafe { msg_send![sf, authorizationStatus] };
            if status == 3 {
                let _ = tx.send(Ok(()));
                return;
            }
            if status == 1 || status == 2 {
                let _ = tx.send(Err(
                    "Permissão de reconhecimento de fala negada. \
                     Verifique Ajustes do Sistema → Privacidade → Reconhecimento de Fala.".to_string()
                ));
                return;
            }

            // Not determined — show the system dialog
            let tx2 = tx.clone();
            let auth_block = ConcreteBlock::new(move |new_status: isize| {
                if new_status == 3 {
                    let _ = tx2.send(Ok(()));
                } else {
                    let _ = tx2.send(Err(format!(
                        "Reconhecimento de voz não autorizado (status {new_status})."
                    )));
                }
            });
            let auth_block = auth_block.copy();
            unsafe { let _: () = msg_send![sf, requestAuthorization: &*auth_block]; }
        }).map_err(|e| format!("run_on_main_thread falhou: {e}"))?;

        rx.recv_timeout(Duration::from_secs(60))
            .map_err(|_| "Tempo esgotado aguardando autorização.".to_string())?
    }

    // ── Start — all ObjC setup on main thread ─────────────────────────────────
    pub fn start(app: AppHandle) -> Result<(), String> {
        // Verify classes exist before dispatching (errors propagate cleanly here)
        cls("SFSpeechRecognizer")?;
        cls("SFSpeechAudioBufferRecognitionRequest")?;
        cls("AVAudioEngine")?;

        let mut lock = ACTIVE.lock().map_err(|_| "Mutex error")?;
        if lock.is_some() { return Err("Já está transcrevendo".to_string()); }

        let (tx, rx) = std::sync::mpsc::channel::<Result<Session, String>>();
        let app_setup = app.clone();

        app.run_on_main_thread(move || {
            let _ = tx.send(unsafe { setup_session(app_setup) });
        }).map_err(|e| format!("run_on_main_thread: {e}"))?;

        let session = rx
            .recv_timeout(Duration::from_secs(15))
            .map_err(|_| "Timeout ao iniciar reconhecimento.".to_string())??;

        *lock = Some(session);
        Ok(())
    }

    unsafe fn setup_session(app: AppHandle) -> Result<Session, String> {
        let nsa_cls  = cls("NSAutoreleasePool")?;
        let sf_cls   = cls("SFSpeechRecognizer")?;
        let req_cls  = cls("SFSpeechAudioBufferRecognitionRequest")?;
        let eng_cls  = cls("AVAudioEngine")?;

        let pool: *mut Object = msg_send![nsa_cls, new];

        let recognizer: *mut Object = msg_send![sf_cls, new];
        if recognizer.is_null() {
            let _: () = msg_send![pool, drain];
            return Err("SFSpeechRecognizer retornou nil — idioma não suportado?".to_string());
        }

        let request: *mut Object = msg_send![req_cls, new];
        let _: () = msg_send![request, setShouldReportPartialResults: true as i8];

        let engine: *mut Object     = msg_send![eng_cls, new];
        let input_node: *mut Object = msg_send![engine, inputNode];
        let format: *mut Object     = msg_send![input_node, outputFormatForBus: 0usize];
        let _: () = msg_send![format, retain]; // survive pool drain

        // Tap block: feeds PCM buffers into the recognition request
        let request_ptr = request as usize;
        let tap_block = ConcreteBlock::new(move |buf: *mut Object, _when: *mut Object| {
            unsafe {
                let _: () = msg_send![request_ptr as *mut Object, appendAudioPCMBuffer: buf];
            }
        });
        let tap_block = tap_block.copy();
        let _: () = msg_send![input_node,
            installTapOnBus: 0usize
            bufferSize: 4096u32
            format: format
            block: &*tap_block
        ];
        let _: () = msg_send![format, release];

        // Result handler block: emits events to the frontend
        let app_cb = app.clone();
        let result_block = ConcreteBlock::new(move |result: *mut Object, _err: *mut Object| {
            if result.is_null() { return; }
            unsafe {
                let is_final: i8 = msg_send![result, isFinal];
                let tr: *mut Object = msg_send![result, bestTranscription];
                let ns: *mut Object = msg_send![tr, formattedString];
                let c: *const std::os::raw::c_char = msg_send![ns, UTF8String];
                if c.is_null() { return; }
                let text = std::ffi::CStr::from_ptr(c).to_string_lossy().into_owned();
                let _ = app_cb.emit("transcription-chunk", serde_json::json!({
                    "text": text, "isFinal": is_final != 0
                }));
            }
        });
        let result_block = result_block.copy();

        let task: *mut Object = msg_send![recognizer,
            recognitionTaskWithRequest: request resultHandler: &*result_block];
        let _: () = msg_send![task, retain]; // autoreleased → retain

        let mut ns_err: *mut Object = std::ptr::null_mut();
        let ok: i8 = msg_send![engine, startAndReturnError: &mut ns_err];
        if ok == 0 {
            let desc = if ns_err.is_null() {
                "AVAudioEngine falhou ao iniciar.".to_string()
            } else {
                let d: *mut Object = msg_send![ns_err, localizedDescription];
                let c: *const std::os::raw::c_char = msg_send![d, UTF8String];
                if c.is_null() { "Erro desconhecido.".to_string() }
                else { std::ffi::CStr::from_ptr(c).to_string_lossy().into_owned() }
            };
            let _: () = msg_send![task, release];
            let _: () = msg_send![pool, drain];
            return Err(desc);
        }

        let _: () = msg_send![pool, drain];
        Ok(Session {
            engine: engine as usize, task: task as usize,
            input_node: input_node as usize, recognizer: recognizer as usize,
            request: request as usize, app,
        })
    }

    // ── Stop — removeTapOnBus: requires main thread ───────────────────────────
    pub fn stop() -> Result<(), String> {
        let mut lock = ACTIVE.lock().map_err(|_| "Mutex error")?;
        if let Some(s) = lock.take() {
            let (done_tx, done_rx) = std::sync::mpsc::channel::<()>();
            s.app.run_on_main_thread(move || {
                if let Ok(pool_cls) = cls("NSAutoreleasePool") {
                    unsafe {
                        let pool: *mut Object = msg_send![pool_cls, new];
                        let _: () = msg_send![s.task as *mut Object, finish];
                        let _: () = msg_send![s.input_node as *mut Object, removeTapOnBus: 0usize];
                        let _: () = msg_send![s.engine as *mut Object, stop];
                        let _: () = msg_send![s.task       as *mut Object, release];
                        let _: () = msg_send![s.recognizer as *mut Object, release];
                        let _: () = msg_send![s.request    as *mut Object, release];
                        let _: () = msg_send![s.engine     as *mut Object, release];
                        let _: () = msg_send![pool, drain];
                    }
                }
                let _ = done_tx.send(());
            }).ok();
            done_rx.recv_timeout(Duration::from_secs(5)).ok();
        }
        Ok(())
    }
}

// ── Speech commands ───────────────────────────────────────────────────────────
#[tauri::command]
async fn request_speech_permission(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return speech::request_auth(app);
    #[cfg(not(target_os = "macos"))]
    Err("Transcrição de áudio só está disponível no macOS.".to_string())
}

#[tauri::command]
async fn start_transcription(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return speech::start(app);
    #[cfg(not(target_os = "macos"))]
    Err("Transcrição de áudio só está disponível no macOS.".to_string())
}

#[tauri::command]
async fn stop_transcription() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return speech::stop();
    #[cfg(not(target_os = "macos"))]
    Err("Transcrição de áudio só está disponível no macOS.".to_string())
}

// Tracks the PID of the app that was frontmost before quick-capture appeared,
// so focus returns to it (not the DocumentaAI main window) when quick-capture closes.
#[cfg(target_os = "macos")]
static PREV_FRONTMOST_PID: Mutex<Option<i32>> = Mutex::new(None);

#[cfg(target_os = "macos")]
fn save_frontmost_pid() {
    use objc::{class, msg_send, sel, sel_impl, runtime::Object};
    unsafe {
        let workspace: *mut Object = msg_send![class!(NSWorkspace), sharedWorkspace];
        let app: *mut Object = msg_send![workspace, frontmostApplication];
        if !app.is_null() {
            let pid: i32 = msg_send![app, processIdentifier];
            if let Ok(mut guard) = PREV_FRONTMOST_PID.lock() {
                *guard = Some(pid);
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn activate_prev_app() {
    use objc::{class, msg_send, sel, sel_impl, runtime::Object};
    let pid = match PREV_FRONTMOST_PID.lock().ok().and_then(|g| *g) {
        Some(p) => p,
        None => return,
    };
    unsafe {
        let app: *mut Object = msg_send![
            class!(NSRunningApplication),
            runningApplicationWithProcessIdentifier: pid
        ];
        if !app.is_null() {
            // NSApplicationActivateIgnoringOtherApps = 1
            let _: bool = msg_send![app, activateWithOptions: 1u64];
        }
    }
}

/// Returns the path chosen by the user via a save-file dialog (for backup export).
/// The frontend then calls VACUUM INTO on this path so the backup is always consistent.
#[tauri::command]
async fn pick_backup_save_path(app: tauri::AppHandle, suggested_name: String) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let path = app
        .dialog()
        .file()
        .set_file_name(&suggested_name)
        .add_filter("DocumentaAI Backup", &["db"])
        .blocking_save_file();
    Ok(path.and_then(|p| p.as_path().map(|p| p.to_string_lossy().into_owned())))
}

/// Opens a file picker and returns the chosen backup path (or None if cancelled).
#[tauri::command]
async fn pick_restore_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let path = app
        .dialog()
        .file()
        .add_filter("DocumentaAI Backup", &["db"])
        .blocking_pick_file();
    Ok(path.and_then(|p| p.as_path().map(|p| p.to_string_lossy().into_owned())))
}

/// Copies the chosen backup .db over the current DB and removes stale WAL files.
/// The caller (JS) is responsible for restarting the app afterwards.
#[tauri::command]
async fn apply_restore(app: tauri::AppHandle, backup_path: String) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = data_dir.join("documentaai.db");

    std::fs::copy(std::path::PathBuf::from(&backup_path), &db_path)
        .map_err(|e| format!("Erro ao restaurar: {e}"))?;

    // Remove WAL/SHM so the restored DB starts without stale journal files
    let _ = std::fs::remove_file(data_dir.join("documentaai.db-wal"));
    let _ = std::fs::remove_file(data_dir.join("documentaai.db-shm"));

    Ok(())
}

/// Hides the quick-capture window and returns focus to the previously-frontmost app.
#[tauri::command]
fn close_quick_capture(app: tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    activate_prev_app();
    if let Some(win) = app.get_webview_window("quick-capture") {
        let _ = win.hide();
    }
}

/// Enables or disables launching DocumentaAI automatically at login.
#[tauri::command]
async fn set_autostart(enabled: bool, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    if enabled {
        app.autolaunch().enable().map_err(|e| e.to_string())?;
    } else {
        app.autolaunch().disable().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Returns whether launching at login is currently enabled.
#[tauri::command]
async fn get_autostart(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        // MacosLauncher is required by tauri-plugin-autostart 2.x on all platforms.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("quick-capture") {
                            if window.is_visible().unwrap_or(false) {
                                #[cfg(target_os = "macos")]
                                activate_prev_app();
                                let _ = window.hide();
                            } else {
                                #[cfg(target_os = "macos")]
                                save_frontmost_pid();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            close_quick_capture,
            set_autostart,
            get_autostart,
            request_speech_permission,
            start_transcription,
            stop_transcription,
            pick_backup_save_path,
            pick_restore_file,
            apply_restore,
        ])
        .setup(|app| {
            // When launched at login with --hidden, keep the main window hidden
            let args: Vec<String> = std::env::args().collect();
            if args.contains(&"--hidden".to_string()) {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.hide();
                }
            }

            // ── System tray icon ──────────────────────────────────────────────
            let autostart_on = {
                use tauri_plugin_autostart::ManagerExt;
                app.autolaunch().is_enabled().unwrap_or(false)
            };

            let open_item = MenuItemBuilder::new("Abrir DocumentaAI")
                .id("open")
                .build(app)?;
            let capture_item = MenuItemBuilder::new("Captura Rápida")
                .id("quick-capture")
                .build(app)?;
            let autostart_item = CheckMenuItemBuilder::new("Iniciar com o sistema")
                .id("autostart")
                .checked(autostart_on)
                .build(app)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItemBuilder::new("Sair")
                .id("quit")
                .build(app)?;

            let menu = MenuBuilder::new(app)
                .items(&[&open_item, &capture_item, &autostart_item, &sep, &quit_item])
                .build()?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "quick-capture" => {
                        if let Some(win) = app.get_webview_window("quick-capture") {
                            #[cfg(target_os = "macos")]
                            save_frontmost_pid();
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "autostart" => {
                        use tauri_plugin_autostart::ManagerExt;
                        let enabled = app.autolaunch().is_enabled().unwrap_or(false);
                        if enabled {
                            let _ = app.autolaunch().disable();
                        } else {
                            let _ = app.autolaunch().enable();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // ── Close main window → hide (keep app running in background) ────
            let app_handle = app.handle().clone();
            let main_win = app.get_webview_window("main").unwrap();
            main_win.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    if let Some(win) = app_handle.get_webview_window("main") {
                        let _ = win.hide();
                    }
                }
            });

            app.global_shortcut().register("CmdOrCtrl+Shift+Space")?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building tauri application")
        .run(|_app_handle, _event| {
            // RunEvent::Reopen fires when the Dock icon is clicked (macOS-only enum variant)
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                if let Some(win) = _app_handle.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
                if let Some(qc) = _app_handle.get_webview_window("quick-capture") {
                    let _ = qc.hide();
                }
            }
        });
}
