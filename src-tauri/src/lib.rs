/// pasteup Tauri 桌面壳（T1 最小可用 → T15 屏幕取色）。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![pick_color])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 系统级屏幕取色（T15）：返回选中色 hex（`#rrggbb`），用户取消返回 `None`。
///
/// 前端经 `@tauri-apps/api` 的 `invoke('pick_color')` 调用（见 src/picker/pickScreenColor.ts）。
#[tauri::command]
async fn pick_color(app: tauri::AppHandle) -> Result<Option<String>, String> {
    platform::pick_color(app).await
}

/// 平台实现：macOS 走原生 NSColorSampler；Windows 覆盖层在 T17 双平台切片实现。
#[cfg(target_os = "macos")]
mod platform {
    use std::sync::Mutex;
    use std::time::Duration;

    use block2::RcBlock;
    use objc2_app_kit::{NSColor, NSColorSampler, NSColorSpace};
    use objc2_core_foundation::CGFloat;
    use tauri::AppHandle;
    use tokio::sync::oneshot;

    /// 调用 macOS 原生 `NSColorSampler`（系统拾色器，无需额外权限）。
    ///
    /// NSColorSampler 必须在主线程启动采样会话，而 Tauri command 跑在异步运行时线程，
    /// 故经 `run_on_main_thread` 派发。系统拾色器完成后在 main thread 回调 handler，
    /// 结果经 oneshot channel 跨线程回传，并带超时兜底（120s，防止异常挂起）。
    pub async fn pick_color(app: AppHandle) -> Result<Option<String>, String> {
        let (tx, rx) = oneshot::channel::<Option<String>>();
        let tx = Mutex::new(Some(tx));

        app.run_on_main_thread(move || {
            let sampler = NSColorSampler::new();
            // 回调恰好执行一次：从 Mutex 中 take 出 sender 后消费。
            let block = RcBlock::new(move |color: *mut NSColor| {
                let hex = color_to_hex(color);
                if let Some(tx) = tx.lock().unwrap().take() {
                    let _ = tx.send(hex);
                }
            });
            // SAFETY: objc2 将该方法标注为 unsafe；调用发生在 main thread。
            // block 会被 NSColorSampler 复制并保留至采样会话结束，不会悬垂。
            unsafe {
                sampler.showSamplerWithSelectionHandler(&block);
            }
        })
        .map_err(|e| format!("无法在主线程启动取色器：{e}"))?;

        match tokio::time::timeout(Duration::from_secs(120), rx).await {
            Ok(Ok(hex)) => Ok(hex),
            Ok(Err(_)) => Err("取色器结果通道异常关闭".into()),
            Err(_) => Err("取色超时（120s）".into()),
        }
    }

    /// 把 NSColor 转成 sRGB 的 `#rrggbb`；`color` 为 nil（用户取消）返回 `None`。
    ///
    /// 显式转换到 sRGB 再取分量：系统拾色器可能返回其他色彩空间（常见坑）。
    fn color_to_hex(color: *mut NSColor) -> Option<String> {
        if color.is_null() {
            return None;
        }
        // SAFETY: 回调中 color 非空且存活；仅在此同步读取，不持有引用。
        let color = unsafe { &*color };
        let srgb = NSColorSpace::sRGBColorSpace();
        let converted = color.colorUsingColorSpace(&srgb)?;
        let mut red: CGFloat = 0.0;
        let mut green: CGFloat = 0.0;
        let mut blue: CGFloat = 0.0;
        let mut alpha: CGFloat = 0.0;
        // SAFETY: 四个出参指针指向栈上局部变量，均合法。
        unsafe {
            converted.getRed_green_blue_alpha(&mut red, &mut green, &mut blue, &mut alpha);
        }
        Some(format!(
            "#{:02x}{:02x}{:02x}",
            to_byte(red),
            to_byte(green),
            to_byte(blue)
        ))
    }

    /// [0,1] 浮点分量 → 0..=255 字节（clamp + 四舍五入）。
    fn to_byte(v: CGFloat) -> u8 {
        (v.clamp(0.0, 1.0) * 255.0).round() as u8
    }
}

/// Windows：自制全屏覆盖层取色（Tauri 截屏 + 放大镜 + 中心像素）在 T17 双平台打包切片实现。
#[cfg(target_os = "windows")]
mod platform {
    use tauri::AppHandle;

    pub async fn pick_color(_app: AppHandle) -> Result<Option<String>, String> {
        Err("Windows 覆盖层取色将在 T17（双平台打包切片）实现".into())
    }
}

/// 其他平台（当前无桌面目标）：明确报错。
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod platform {
    use tauri::AppHandle;

    pub async fn pick_color(_app: AppHandle) -> Result<Option<String>, String> {
        Err("当前平台暂不支持屏幕取色".into())
    }
}
