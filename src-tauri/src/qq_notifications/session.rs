//! Opens one QQ conversation by locating its row in the running QQNT client.
//!
//! QQNT is Electron: its accessibility tree is hidden until a client (screen
//! reader or UIA) queries the render widget with WM_GETOBJECT. Once exposed,
//! the main panel's session list shows one `recent-contact-item` row per
//! conversation, whose accessible name starts with the contact's name — the
//! same name a toast notification carries as its title.

use windows::Win32::Foundation::HWND;

use crate::win32::{self, process, window};

/// The main QQ panel window: title "QQ", class `Chrome_WidgetWin_1`, no owner,
/// and large enough to exclude login or helper windows.
const QQ_WINDOW_CLASSES: [&str; 2] = ["Chrome_WidgetWin_1", "TXGuiFoundation"];
const QQ_WINDOW_MIN_WIDTH: i64 = 500;
const QQ_WINDOW_MIN_HEIGHT: i64 = 300;
/// Chromium builds its accessibility tree lazily; give it a moment after probing.
const A11Y_SETTLE: std::time::Duration = std::time::Duration::from_millis(400);
/// How long to wait for the session list to show the requested row in total.
const LOCATE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(3);
const LOCATE_RETRY: std::time::Duration = std::time::Duration::from_millis(120);

/// A top-level QQ window that could be the main panel.
struct QQWindow {
    handle: HWND,
}

fn is_main_panel_window(window: HWND) -> bool {
    if window::window_text(window, 32) != "QQ" {
        return false;
    }
    if !QQ_WINDOW_CLASSES.contains(&window::class_name(window).as_str()) {
        return false;
    }
    if window::has_owner(window) {
        return false;
    }
    let Some(position) = window::normal_position(window) else {
        return false;
    };
    let width = i64::from(position.right - position.left);
    let height = i64::from(position.bottom - position.top);
    width >= QQ_WINDOW_MIN_WIDTH && height >= QQ_WINDOW_MIN_HEIGHT
}

/// The preferred main panel: a visible window in front of hidden ones.
fn preferred_main_panel() -> Option<QQWindow> {
    let mut best: Option<(bool, i64, HWND)> = None;
    let _ = win32::window::for_each_top_level_window(|window| {
        if !is_main_panel_window(window) {
            return;
        }
        let visible = window::is_visible(window);
        let area = window::window_rect(window)
            .map(|rect| i64::from((rect.right - rect.left) * (rect.bottom - rect.top)))
            .unwrap_or(0);
        let better = match best {
            None => true,
            Some((best_visible, best_area, _)) => visible && (!best_visible || area > best_area),
        };
        if better {
            best = Some((visible, area, window));
        }
    });
    best.map(|(_, _, handle)| QQWindow { handle })
}

/// Whether `window` still belongs to the same QQ process it did when found.
fn window_is_stable(window: HWND, process_id: u32) -> bool {
    process::window_process_id(window) == process_id
}

/// Activates the QQ main panel and clicks the row whose accessible name starts
/// with `contact`. Returns an error the island can show as-is.
pub(super) fn open_session(contact: &str) -> Result<(), String> {
    let contact = contact.trim();
    if contact.is_empty() {
        return Err("QQ 会话名为空，无法定位。".into());
    }
    let Some(qq) = preferred_main_panel() else {
        // Same message the plain launcher shows when QQ is not running.
        return Err("QQ 未运行，请先登录 QQ。".into());
    };
    let process_id = process::window_process_id(qq.handle);
    // The client must restore its own UI first; Win32 restore commands can
    // expose a hidden webview (messenger_activation's rule).
    if !win32::window::is_interactive(qq.handle) {
        return Err("QQ 尚未恢复可交互的主窗口，请从系统托盘打开。".into());
    }
    if !win32::window::bring_to_foreground(qq.handle) {
        return Err("已找到 QQ 窗口，但未能切换到前台，请点击任务栏或托盘中的 QQ。".into());
    }
    // Turn on Chromium's accessibility tree; harmless when it is already on.
    win32::uia_list::enable_chromium_accessibility(qq.handle);
    std::thread::sleep(A11Y_SETTLE);

    let started = std::time::Instant::now();
    let mut last_reason = String::new();
    loop {
        if !window_is_stable(qq.handle, process_id) {
            return Err("QQ 窗口在定位会话时发生了变化，请重试。".into());
        }
        match win32::uia_list::click_class_named_row(qq.handle, "recent-contact-item", contact, || {
            window_is_stable(qq.handle, process_id)
        }) {
            Ok(()) => return Ok(()),
            Err(reason) => last_reason = reason,
        }
        if started.elapsed() >= LOCATE_TIMEOUT {
            break;
        }
        std::thread::sleep(LOCATE_RETRY);
    }
    Err(match last_reason.as_str() {
        "row not found" => format!("QQ 会话列表里没有找到「{contact}」，可能不在当前可见的列表位置。"),
        "more than one matching row" => format!("「{contact}」匹配了多个会话，请打开 QQ 手动选择。"),
        other => format!("未能点击 QQ 会话「{contact}」：{other}"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_empty_contact_is_rejected_without_touching_qq() {
        assert!(open_session("  ").is_err());
    }
}
