fn main() {
    // cfg!(target_os) em build scripts avalia o HOST, não o alvo da compilação —
    // ao cross-compilar para Android isso linkava frameworks Apple e quebrava o build.
    // CARGO_CFG_TARGET_OS reflete o alvo real.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-lib=framework=AVFoundation");
        println!("cargo:rustc-link-lib=framework=Speech");

        // Embed Info.plist as __TEXT,__info_plist Mach-O section.
        // tauri dev runs the binary directly (not from a .app bundle), so the
        // system cannot find Info.plist via the bundle structure. TCC (privacy
        // enforcement) reads this embedded section to verify that
        // NSSpeechRecognitionUsageDescription and NSMicrophoneUsageDescription
        // are present, and kills the process with SIGABRT if they aren't.
        let plist = std::path::Path::new("Info.plist");
        if plist.exists() {
            let abs = plist.canonicalize().expect("Info.plist canonicalize");
            println!("cargo:rustc-link-arg=-sectcreate");
            println!("cargo:rustc-link-arg=__TEXT");
            println!("cargo:rustc-link-arg=__info_plist");
            println!("cargo:rustc-link-arg={}", abs.display());
            println!("cargo:rerun-if-changed=Info.plist");
        }
    }
    tauri_build::build()
}
