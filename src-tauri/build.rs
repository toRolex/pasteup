fn main() {
    // `cargo check` 不跑 beforeBuildCommand（vite build），而 tauri::generate_context!()
    // 要求 frontendDist 目录存在。这里在缺失时补一个占位 index.html，保证 T1 阶段
    // cargo check 即可通过；正常 `npm run build` 后会被真实产物覆盖。
    let dist = std::path::Path::new("../dist");
    if !dist.exists() {
        std::fs::create_dir_all(dist).expect("failed to create dist dir");
        std::fs::write(
            dist.join("index.html"),
            "<!doctype html><html><head><meta charset=\"utf-8\"><title>pasteup</title></head><body>pasteup placeholder</body></html>",
        )
        .expect("failed to write dist/index.html placeholder");
    }
    tauri_build::build()
}
