// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Must run before GTK/GDK initializes (which happens inside tauri::Builder).
    //
    // Historicamente estas variáveis eram setadas incondicionalmente para curar
    // tela preta no Wayland + AppImage — mas WEBKIT_DISABLE_COMPOSITING_MODE=1
    // derruba TODA a renderização para a CPU e o GDK_BACKEND=x11 força XWayland
    // sempre, o que deixava o app lento em qualquer Linux. Agora cada workaround
    // só é aplicado quando o cenário problemático é detectado, e overrides
    // manuais do usuário (variável já setada no ambiente) são respeitados.
    #[cfg(target_os = "linux")]
    {
        let is_appimage = std::env::var_os("APPIMAGE").is_some();
        let on_wayland = std::env::var_os("WAYLAND_DISPLAY").is_some();

        // AppImage + Wayland: o sandbox bloqueia o socket Wayland dos
        // subprocessos do WebKit → janela preta. Força X11 (XWayland) só aí.
        if is_appimage && on_wayland && std::env::var_os("GDK_BACKEND").is_none() {
            std::env::remove_var("WAYLAND_DISPLAY");
            std::env::set_var("GDK_BACKEND", "x11");
        }

        // Driver NVIDIA proprietário: o renderer DMA-BUF do WebKitGTK causa
        // tela preta/artefatos. Desabilita só quando o driver está presente.
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
            && std::path::Path::new("/proc/driver/nvidia/version").exists()
        {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }

        // WEBKIT_DISABLE_COMPOSITING_MODE não é mais setado pelo app: era o
        // maior vilão de desempenho (composição por GPU inteira na CPU).
        // Quem tiver problema num driver específico ainda pode exportar a
        // variável manualmente antes de abrir o app.
    }

    documentaai_lib::run()
}
