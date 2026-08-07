/// pasteup Tauri 桌面壳（T1 最小可用：启动主窗口加载前端）。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
