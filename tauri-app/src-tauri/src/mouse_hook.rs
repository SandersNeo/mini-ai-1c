//! Global low-level mouse hook (WH_MOUSE_LL).
//! Detects right-click on 1C Configurator windows and emits Tauri events.
//!
//! Does NOT inject into the 1cv8.exe process — hook lives in mini-ai process.
//! Requires a dedicated Windows message loop thread.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};
use windows::Win32::Foundation::MAX_PATH;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::ProcessStatus::K32GetModuleFileNameExW;
use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetKeyState, VK_CONTROL};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetAncestor, GetMessageW, GetWindowThreadProcessId, SetWindowsHookExW,
    UnhookWindowsHookEx, WindowFromPoint, GA_ROOT, HHOOK, MSG, MSLLHOOKSTRUCT, WH_MOUSE_LL,
    WM_RBUTTONDOWN, WM_RBUTTONUP,
};

static HOOK_INSTALLED: AtomicBool = AtomicBool::new(false);
/// True while we're suppressing a Ctrl+RClick sequence (DOWN was suppressed → UP must be too).
static SUPPRESS_RBUTTONUP: AtomicBool = AtomicBool::new(false);
/// Enables the experimental overlay interception for Ctrl+RightClick in Configurator.
static EDITOR_BRIDGE_ENABLED: AtomicBool = AtomicBool::new(false);

/// Shared AppHandle for use inside the hook callback (set once before installing hook).
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RightClickEvent {
    pub x: i32,
    pub y: i32,
    pub hwnd: isize,
    pub child_hwnd: isize,
}

pub fn set_editor_bridge_enabled(enabled: bool) {
    EDITOR_BRIDGE_ENABLED.store(enabled, Ordering::Relaxed);
    if !enabled {
        SUPPRESS_RBUTTONUP.store(false, Ordering::Relaxed);
    }
}

/// Install the global mouse hook on a dedicated thread with a Windows message loop.
/// Call once from `setup()`. Idempotent — safe to call multiple times.
pub fn install_mouse_hook(app_handle: AppHandle) {
    if HOOK_INSTALLED.load(Ordering::Relaxed) {
        return;
    }

    std::thread::spawn(move || {
        let _ = APP_HANDLE.set(app_handle);

        unsafe {
            let hook = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook_callback), None, 0)
                .expect("Failed to install WH_MOUSE_LL hook");

            HOOK_INSTALLED.store(true, Ordering::Relaxed);
            crate::app_log!("[MouseHook] WH_MOUSE_LL installed");

            // Message loop — required to keep the hook alive and receive callbacks.
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, HWND::default(), 0, 0).as_bool() {
                // No TranslateMessage/DispatchMessage needed — callbacks fire directly.
            }

            let _ = UnhookWindowsHookEx(hook);
            HOOK_INSTALLED.store(false, Ordering::Relaxed);
            crate::app_log!("[MouseHook] WH_MOUSE_LL uninstalled");
        }
    });
}

/// WH_MOUSE_LL callback — called for every global mouse event.
unsafe extern "system" fn mouse_hook_callback(
    n_code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    if n_code >= 0 {
        let msg = w_param.0 as u32;

        // Suppress WM_RBUTTONUP if we already suppressed the matching DOWN.
        // 1C opens its context menu on WM_RBUTTONUP, so we must suppress both.
        if msg == WM_RBUTTONUP && SUPPRESS_RBUTTONUP.load(Ordering::Relaxed) {
            SUPPRESS_RBUTTONUP.store(false, Ordering::Relaxed);
            return LRESULT(1);
        }

        if msg == WM_RBUTTONDOWN {
            let hook_struct = &*(l_param.0 as *const MSLLHOOKSTRUCT);
            let pt = hook_struct.pt;
            let hwnd = WindowFromPoint(pt);
            let root_hwnd = GetAncestor(hwnd, GA_ROOT);
            let target_hwnd = if root_hwnd.0.is_null() {
                hwnd
            } else {
                root_hwnd
            };

            if is_configurator_window(target_hwnd) {
                // Only intercept Ctrl+RClick — regular RClick passes through to 1C unchanged.
                let ctrl_held = (GetKeyState(VK_CONTROL.0 as i32) & 0x8000u16 as i16) != 0;

                if ctrl_held && EDITOR_BRIDGE_ENABLED.load(Ordering::Relaxed) {
                    if let Some(handle) = APP_HANDLE.get() {
                        let _ = handle.emit(
                            "configurator-rclick",
                            RightClickEvent {
                                x: pt.x,
                                y: pt.y,
                                hwnd: target_hwnd.0 as isize,
                                child_hwnd: hwnd.0 as isize,
                            },
                        );
                        crate::app_log!(
                            "[MouseHook] Ctrl+RClick on 1C at ({}, {}), HWND={}",
                            pt.x,
                            pt.y,
                            target_hwnd.0 as isize
                        );
                    }
                    // Mark that UP must also be suppressed, then suppress DOWN.
                    SUPPRESS_RBUTTONUP.store(true, Ordering::Relaxed);
                    return LRESULT(1);
                }
                // Regular RClick → native 1C menu opens as usual
            }
        }
    }

    CallNextHookEx(HHOOK::default(), n_code, w_param, l_param)
}

/// Check if the given HWND belongs to a 1C Configurator process (1cv8.exe).
unsafe fn is_configurator_window(hwnd: HWND) -> bool {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;

    if hwnd.0.is_null() {
        return false;
    }

    let mut process_id = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut process_id));

    if process_id == 0 {
        return false;
    }

    let Ok(process_handle) = OpenProcess(
        PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
        false,
        process_id,
    ) else {
        return false;
    };

    let mut buffer = [0u16; MAX_PATH as usize];
    let len = K32GetModuleFileNameExW(process_handle, None, &mut buffer);
    let _ = windows::Win32::Foundation::CloseHandle(process_handle);

    if len == 0 {
        return false;
    }

    let path = OsString::from_wide(&buffer[..len as usize])
        .to_string_lossy()
        .to_lowercase();

    path.ends_with("1cv8.exe")
        || path.ends_with("1cv8c.exe")
        || path.ends_with("1cv8s.exe")
        || path.ends_with("1cv8t.exe")
        || path.ends_with("1cv8ct.exe")
        || path.ends_with("1cv8st.exe")
}
