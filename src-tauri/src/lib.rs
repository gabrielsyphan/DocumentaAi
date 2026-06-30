use tauri::Manager;
use tauri::tray::TrayIconBuilder;
use tauri::menu::{MenuBuilder, MenuItemBuilder, CheckMenuItemBuilder, PredefinedMenuItem};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
#[cfg(target_os = "macos")]
use std::sync::Mutex;

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
            let autostart_item = CheckMenuItemBuilder::new("Iniciar com o sistema")
                .id("autostart")
                .checked(autostart_on)
                .build(app)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItemBuilder::new("Sair")
                .id("quit")
                .build(app)?;

            let menu = MenuBuilder::new(app)
                .items(&[&open_item, &autostart_item, &sep, &quit_item])
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
