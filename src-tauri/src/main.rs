// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Must be set before GTK/GDK initializes (happens inside tauri::Builder).
    // On Wayland, WebKit2GTK's renderer subprocess cannot access the Wayland
    // socket from inside the AppImage sandbox, causing the entire window to
    // go black. Forcing X11 (XWayland) and disabling DMA-BUF fixes this.
    #[cfg(target_os = "linux")]
    {
        std::env::set_var("GDK_BACKEND", "x11");
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    documentaai_lib::run()
}
