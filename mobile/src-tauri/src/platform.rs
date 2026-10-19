//! Android features are reached through Tauri's origin-checked IPC, never a
//! JavascriptInterface (which would also be exposed to challenge iframes).
#[cfg(target_os = "android")]
use tauri::Manager;

#[cfg(target_os = "android")]
struct Mobile(tauri::plugin::PluginHandle<tauri::Wry>);

#[cfg(target_os = "android")]
pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("mobile")
        .setup(|app, api| {
            app.manage(Mobile(api.register_android_plugin("to.kryo.mobile", "MobilePlugin")?));
            Ok(())
        })
        .build()
}

#[tauri::command]
pub async fn mobile_action(app: tauri::AppHandle, action: String, payload: serde_json::Value) -> Result<serde_json::Value, String> {
    if !matches!(action.as_str(), "configure" | "observe" | "poll" | "status" | "enable" | "settings" | "checkUpdate" | "installUpdate") {
        return Err("Unknown mobile action.".into());
    }
    #[cfg(target_os = "android")]
    {
        app.state::<Mobile>().0.run_mobile_plugin_async(&action, payload).await.map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, payload);
        Err("This feature is available in the Android app.".into())
    }
}
