use crate::settings::{self, AppSettings};
use tauri::AppHandle;

/// Get application settings
#[tauri::command]
pub fn get_settings() -> AppSettings {
    crate::app_log!("[DEBUG] get_settings called");
    settings::load_settings()
}

/// Save application settings
#[tauri::command]
pub fn save_settings(new_settings: AppSettings) -> Result<(), String> {
    settings::save_settings(&new_settings)?;

    #[cfg(windows)]
    {
        crate::configurator::set_rdp_mode(new_settings.configurator.rdp_mode);
        crate::mouse_hook::set_editor_bridge_enabled(
            new_settings.configurator.editor_bridge_enabled,
        );
    }

    Ok(())
}

/// Mark onboarding as completed
#[tauri::command]
pub fn complete_onboarding() -> Result<(), String> {
    let mut settings = settings::load_settings();
    settings.onboarding_completed = true;
    settings::save_settings(&settings)
}

#[tauri::command]
pub fn reset_onboarding() -> Result<(), String> {
    let mut settings = settings::load_settings();
    settings.onboarding_completed = false;
    settings::save_settings(&settings)
}

/// Restart the application
#[tauri::command]
pub fn restart_app_cmd(app_handle: AppHandle) {
    app_handle.restart();
}

/// Check if Node.js is installed and return its version string, or None if not found
#[tauri::command]
pub fn check_node_version_cmd() -> Option<String> {
    use std::process::Command;

    #[cfg(target_os = "windows")]
    let output = Command::new("cmd").args(["/C", "node --version"]).output();

    #[cfg(not(target_os = "windows"))]
    let output = Command::new("node").arg("--version").output();

    match output {
        Ok(o) if o.status.success() => String::from_utf8(o.stdout)
            .ok()
            .map(|s| s.trim().to_string()),
        _ => None,
    }
}

/// Export settings as JSON string without sensitive data
#[tauri::command]
pub fn export_settings() -> Result<String, String> {
    let mut safe_settings = settings::load_settings();

    // Clear sensitive fields from mcp_servers
    for server in safe_settings.mcp_servers.iter_mut() {
        server.login = None;
        server.password = None;
        server.headers = None;
        server.env = None;
    }

    // Clear active_llm_profile (profiles are not exported)
    safe_settings.active_llm_profile = String::new();

    serde_json::to_string_pretty(&safe_settings).map_err(|e| e.to_string())
}

/// Import settings from JSON string, preserving credentials from current settings
#[tauri::command]
pub fn import_settings(json_data: String) -> Result<(), String> {
    let mut imported: AppSettings =
        serde_json::from_str(&json_data).map_err(|e| format!("Ошибка парсинга JSON: {}", e))?;

    let current = settings::load_settings();

    // Restore credentials for servers that exist in current settings
    for server in imported.mcp_servers.iter_mut() {
        if let Some(current_server) = current.mcp_servers.iter().find(|s| s.id == server.id) {
            server.login = current_server.login.clone();
            server.password = current_server.password.clone();
            server.headers = current_server.headers.clone();
            server.env = current_server.env.clone();
        }
    }

    // Restore active_llm_profile from current settings
    imported.active_llm_profile = current.active_llm_profile.clone();

    settings::save_settings(&imported)
}

/// Check if Java is installed and available in PATH
#[tauri::command]
pub fn check_java_cmd() -> bool {
    use std::process::Command;

    // Try verification by running java -version
    #[cfg(target_os = "windows")]
    let output = Command::new("cmd").args(["/C", "java -version"]).output();

    #[cfg(not(target_os = "windows"))]
    let output = Command::new("java").arg("-version").output();

    match output {
        Ok(o) => o.status.success(),
        Err(_) => false,
    }
}
