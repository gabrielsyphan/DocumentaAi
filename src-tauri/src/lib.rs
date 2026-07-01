use tauri::Manager;
use tauri::tray::TrayIconBuilder;
use tauri::menu::{MenuBuilder, MenuItemBuilder, CheckMenuItemBuilder, PredefinedMenuItem};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
#[cfg(target_os = "macos")]
use std::sync::Mutex;

// ── Speech recognition (macOS only) ──────────────────────────────────────────
#[cfg(target_os = "macos")]
mod speech {
    use objc::{class, msg_send, sel, sel_impl, runtime::Object};
    use block::ConcreteBlock;
    use std::sync::Mutex;
    use std::time::Duration;
    use tauri::{AppHandle, Emitter};

    #[link(name = "AVFoundation", kind = "framework")]
    #[link(name = "Speech",       kind = "framework")]
    extern "C" {}

    struct Session {
        engine:     usize, // *mut Object (retained)
        task:       usize, // *mut Object (retained)
        input_node: usize, // *mut Object (not retained — owned by engine)
        recognizer: usize, // *mut Object (retained)
        request:    usize, // *mut Object (retained)
        app:        AppHandle,
    }
    // Safety: we control all ObjC pointer access through the Mutex.
    unsafe impl Send for Session {}

    static ACTIVE: Mutex<Option<Session>> = Mutex::new(None);

    // ── Authorization — can run on any thread ─────────────────────────────────
    pub fn request_auth() -> Result<(), String> {
        let (tx, rx) = std::sync::mpsc::channel::<isize>();
        let auth_block = ConcreteBlock::new(move |status: isize| {
            let _ = tx.send(status);
        });
        let auth_block = auth_block.copy();
        unsafe {
            let _: () = msg_send![class!(SFSpeechRecognizer), requestAuthorization: &*auth_block];
        }
        // SFSpeechRecognizerAuthorizationStatusAuthorized = 3
        match rx.recv_timeout(Duration::from_secs(60)) {
            Ok(3) => Ok(()),
            Ok(s) => Err(format!(
                "Reconhecimento de voz não autorizado (status {s}). \
                 Verifique Ajustes do Sistema → Privacidade → Reconhecimento de Fala."
            )),
            Err(_) => Err("Tempo esgotado aguardando autorização.".to_string()),
        }
    }

    // ── Start — must run setup on the main thread ─────────────────────────────
    pub fn start(app: AppHandle) -> Result<(), String> {
        let mut lock = ACTIVE.lock().map_err(|_| "Erro interno de mutex")?;
        if lock.is_some() {
            return Err("Já está transcrevendo".to_string());
        }

        let (tx, rx) = std::sync::mpsc::channel::<Result<Session, String>>();
        let app_for_setup = app.clone();

        // SFSpeechRecognizer and installTapOnBus: must be called on the main thread.
        // run_on_main_thread dispatches to the Tauri event loop — we await via channel.
        app.run_on_main_thread(move || {
            let result = unsafe { setup_session(app_for_setup) };
            let _ = tx.send(result);
        }).map_err(|e| format!("Falha ao despachar para main thread: {e}"))?;

        let session = rx
            .recv_timeout(Duration::from_secs(15))
            .map_err(|_| "Timeout ao iniciar reconhecimento de fala.".to_string())??;

        *lock = Some(session);
        Ok(())
    }

    // ── Actual setup — called on the main thread ──────────────────────────────
    unsafe fn setup_session(app: AppHandle) -> Result<Session, String> {
        // Autorelease pool: methods like inputNode / outputFormatForBus: return
        // autoreleased objects that need a pool on non-main-thread call paths.
        // We're on the main thread now, but keep the pool for explicitness.
        let pool: *mut Object = msg_send![class!(NSAutoreleasePool), new];

        let recognizer: *mut Object = msg_send![class!(SFSpeechRecognizer), new];
        if recognizer.is_null() {
            let _: () = msg_send![pool, drain];
            return Err("Não foi possível criar SFSpeechRecognizer. \
                        Verifique se o idioma do sistema é suportado.".to_string());
        }

        let request: *mut Object = msg_send![class!(SFSpeechAudioBufferRecognitionRequest), new];
        let _: () = msg_send![request, setShouldReportPartialResults: true as i8];

        let engine: *mut Object     = msg_send![class!(AVAudioEngine), new];
        let input_node: *mut Object = msg_send![engine, inputNode];
        let format: *mut Object     = msg_send![input_node, outputFormatForBus: 0usize];

        // Retain format so it survives the pool drain below
        let _: () = msg_send![format, retain];

        // Tap block — feeds audio buffers into the recognition request.
        // Captures request_ptr (usize = Copy) so the closure is Clone.
        let request_ptr = request as usize;
        let tap_block = ConcreteBlock::new(move |buffer: *mut Object, _when: *mut Object| {
            unsafe {
                let req = request_ptr as *mut Object;
                let _: () = msg_send![req, appendAudioPCMBuffer: buffer];
            }
        });
        let tap_block = tap_block.copy();

        let _: () = msg_send![input_node,
            installTapOnBus: 0usize
            bufferSize: 4096u32
            format: format
            block: &*tap_block
        ];

        // Release the extra retain now that it's installed in the engine
        let _: () = msg_send![format, release];

        // Result handler — emits Tauri events with the transcribed text
        let app_for_block = app.clone();
        let result_block = ConcreteBlock::new(move |result: *mut Object, _error: *mut Object| {
            if result.is_null() { return; }
            unsafe {
                let is_final: i8          = msg_send![result, isFinal];
                let tr: *mut Object       = msg_send![result, bestTranscription];
                let ns: *mut Object       = msg_send![tr, formattedString];
                let c: *const std::os::raw::c_char = msg_send![ns, UTF8String];
                if c.is_null() { return; }
                let text = std::ffi::CStr::from_ptr(c).to_string_lossy().into_owned();
                let _ = app_for_block.emit("transcription-chunk", serde_json::json!({
                    "text": text,
                    "isFinal": is_final != 0
                }));
            }
        });
        let result_block = result_block.copy();

        // recognitionTaskWithRequest:resultHandler: returns an autoreleased task → retain it
        let task: *mut Object = msg_send![recognizer,
            recognitionTaskWithRequest: request
            resultHandler: &*result_block
        ];
        let _: () = msg_send![task, retain];

        // Start audio capture
        let mut ns_error: *mut Object = std::ptr::null_mut();
        let ok: i8 = msg_send![engine, startAndReturnError: &mut ns_error];
        if ok == 0 {
            let desc = if !ns_error.is_null() {
                let d: *mut Object = msg_send![ns_error, localizedDescription];
                let c: *const std::os::raw::c_char = msg_send![d, UTF8String];
                if c.is_null() { "Erro desconhecido ao iniciar áudio.".to_string() }
                else { std::ffi::CStr::from_ptr(c).to_string_lossy().into_owned() }
            } else {
                "Falha ao iniciar AVAudioEngine.".to_string()
            };
            let _: () = msg_send![task, release];
            let _: () = msg_send![pool, drain];
            return Err(desc);
        }

        let _: () = msg_send![pool, drain];

        Ok(Session {
            engine:     engine     as usize,
            task:       task       as usize,
            input_node: input_node as usize,
            recognizer: recognizer as usize,
            request:    request    as usize,
            app,
        })
    }

    // ── Stop — removeTapOnBus: must also run on the main thread ──────────────
    pub fn stop() -> Result<(), String> {
        let mut lock = ACTIVE.lock().map_err(|_| "Erro interno de mutex")?;
        if let Some(s) = lock.take() {
            let (done_tx, done_rx) = std::sync::mpsc::channel::<()>();
            s.app.run_on_main_thread(move || {
                unsafe {
                    let pool: *mut Object  = msg_send![class!(NSAutoreleasePool), new];
                    let engine     = s.engine     as *mut Object;
                    let task       = s.task       as *mut Object;
                    let input_node = s.input_node as *mut Object;
                    let recognizer = s.recognizer as *mut Object;
                    let request    = s.request    as *mut Object;

                    let _: () = msg_send![task, finish];
                    let _: () = msg_send![input_node, removeTapOnBus: 0usize];
                    let _: () = msg_send![engine, stop];

                    let _: () = msg_send![task,       release];
                    let _: () = msg_send![recognizer, release];
                    let _: () = msg_send![request,    release];
                    let _: () = msg_send![engine,     release];
                    let _: () = msg_send![pool, drain];
                }
                let _ = done_tx.send(());
            }).ok();
            // Wait for cleanup (generous timeout; fire-and-forget if it hangs)
            done_rx.recv_timeout(Duration::from_secs(5)).ok();
        }
        Ok(())
    }
}

// ── Speech commands (exported to frontend) ────────────────────────────────────
#[tauri::command]
async fn request_speech_permission() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return speech::request_auth();
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
