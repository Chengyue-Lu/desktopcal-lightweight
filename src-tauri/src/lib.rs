use chrono::{Datelike, Duration, Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration as StdDuration, SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalSize, State, WebviewWindow,
    WindowEvent,
};
use tauri_plugin_autostart::ManagerExt as AutostartExt;

const DATE_FORMAT: &str = "%Y-%m-%d";
const PREVIEW_LIMIT: usize = 2;
const FULL_MIN_WIDTH: u32 = 760;
const FULL_MIN_HEIGHT: u32 = 560;
const COMPACT_WIDTH: u32 = 320;
const COMPACT_HEIGHT: u32 = 44;
const MAIN_WINDOW_LABEL: &str = "main";
const EVENT_OPEN_SETTINGS: &str = "desktopcal://open-settings";
const TRAY_SHOW: &str = "tray-show";
const TRAY_HIDE: &str = "tray-hide";
const TRAY_SETTINGS: &str = "tray-settings";
const TRAY_QUIT: &str = "tray-quit";
const WEEKDAY_LABELS: [&str; 7] = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const HOLIDAYS: [(&str, &str); 4] = [
    ("2026-01-01", "元旦"),
    ("2026-04-05", "清明"),
    ("2026-05-01", "劳动节"),
    ("2026-10-01", "国庆"),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LineItem {
    text: String,
    done: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CalendarDayCell {
    iso_date: String,
    day_of_month: u32,
    is_current_month: bool,
    is_today: bool,
    is_weekend: bool,
    holiday_label: Option<String>,
    preview_tasks: Vec<LineItem>,
    overflow_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CalendarWeek {
    week_number: u32,
    days: Vec<CalendarDayCell>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CalendarPayload {
    reference_date: String,
    weekday_labels: Vec<String>,
    weeks: Vec<CalendarWeek>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct AppSettings {
    window_width: u32,
    window_height: u32,
    expanded_window_width: u32,
    expanded_window_height: u32,
    anchor_top_offset: u32,
    anchor_right_offset: u32,
    is_collapsed: bool,
    auto_launch: bool,
    show_week_numbers: bool,
    show_holiday_labels: bool,
    last_view_month: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            window_width: 1300,
            window_height: 850,
            expanded_window_width: 1300,
            expanded_window_height: 850,
            anchor_top_offset: 5,
            anchor_right_offset: 5,
            is_collapsed: false,
            auto_launch: false,
            show_week_numbers: true,
            show_holiday_labels: true,
            last_view_month: None,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowGeometryAnimationPayload {
    target_width: u32,
    target_height: u32,
    duration_ms: Option<u64>,
    steps: Option<u32>,
}

#[derive(Clone, Default)]
struct WindowAnimationState {
    is_animating: Arc<AtomicBool>,
}

#[tauri::command]
fn get_calendar(app: AppHandle, date: String) -> Result<CalendarPayload, String> {
    let reference_date = parse_iso_date(&date)?;
    let today = Local::now().date_naive();
    let settings = load_settings(&app)?;
    let week_start = start_of_week(reference_date);
    let range_start = week_start - Duration::days(7);
    let range_end = range_start + Duration::days(34);
    let connection = open_connection(&app)?;
    let entries = load_entries_in_range(&connection, range_start, range_end)?;

    let weeks = (0..5)
        .map(|week_index| {
            let current_week_start = range_start + Duration::days((week_index * 7) as i64);
            let days = (0..7)
                .map(|day_index| {
                    let current_day = current_week_start + Duration::days(day_index as i64);
                    let iso_date = format_iso_date(current_day);
                    let lines = entries.get(&iso_date).cloned().unwrap_or_default();

                    CalendarDayCell {
                        iso_date: iso_date.clone(),
                        day_of_month: current_day.day(),
                        is_current_month: current_day.month() == reference_date.month()
                            && current_day.year() == reference_date.year(),
                        is_today: current_day == today,
                        is_weekend: current_day.weekday().number_from_monday() >= 6,
                        holiday_label: holiday_label(&iso_date, settings.show_holiday_labels),
                        preview_tasks: lines.iter().take(PREVIEW_LIMIT).cloned().collect(),
                        overflow_count: lines.len().saturating_sub(PREVIEW_LIMIT),
                    }
                })
                .collect();

            CalendarWeek {
                week_number: current_week_start.iso_week().week(),
                days,
            }
        })
        .collect();

    Ok(CalendarPayload {
        reference_date: format_iso_date(reference_date),
        weekday_labels: WEEKDAY_LABELS.iter().map(ToString::to_string).collect(),
        weeks,
    })
}

#[tauri::command]
fn get_day_entry(app: AppHandle, date: String) -> Result<Vec<LineItem>, String> {
    let target_date = parse_iso_date(&date)?;
    let connection = open_connection(&app)?;
    let raw_md: Option<String> = connection
        .query_row(
            "SELECT raw_md FROM daily_entries WHERE date = ?1",
            params![format_iso_date(target_date)],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    Ok(raw_md.as_deref().map(parse_raw_md).unwrap_or_default())
}

#[tauri::command]
fn save_day_entry(app: AppHandle, date: String, lines: Vec<LineItem>) -> Result<Vec<LineItem>, String> {
    let target_date = parse_iso_date(&date)?;
    let normalized_lines = normalize_lines(lines);
    let connection = open_connection(&app)?;
    let date_key = format_iso_date(target_date);
    let now = current_timestamp_ms()?;

    if normalized_lines.is_empty() {
        connection
            .execute("DELETE FROM daily_entries WHERE date = ?1", params![date_key])
            .map_err(|error| error.to_string())?;
        return Ok(Vec::new());
    }

    let created_at: Option<i64> = connection
        .query_row(
            "SELECT created_at FROM daily_entries WHERE date = ?1",
            params![date_key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    let raw_md = serialize_lines(&normalized_lines);

    match created_at {
        Some(existing_created_at) => {
            connection
                .execute(
                    "UPDATE daily_entries SET raw_md = ?1, updated_at = ?2 WHERE date = ?3",
                    params![raw_md, now, date_key],
                )
                .map_err(|error| error.to_string())?;
            connection
                .execute(
                    "UPDATE daily_entries SET created_at = ?1 WHERE date = ?2",
                    params![existing_created_at, date_key],
                )
                .map_err(|error| error.to_string())?;
        }
        None => {
            connection
                .execute(
                    "INSERT INTO daily_entries (date, raw_md, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                    params![date_key, raw_md, now, now],
                )
                .map_err(|error| error.to_string())?;
        }
    }

    Ok(normalized_lines)
}

#[tauri::command]
fn get_settings(app: AppHandle) -> Result<AppSettings, String> {
    load_settings(&app)
}

#[tauri::command]
fn save_settings(app: AppHandle, payload: AppSettings) -> Result<AppSettings, String> {
    let mut next_settings = payload;
    next_settings.auto_launch = reconcile_autolaunch(&app, next_settings.auto_launch)?;

    persist_settings_file(&app, &next_settings)?;
    apply_window_settings(&app, &next_settings)?;
    Ok(next_settings)
}

#[tauri::command]
async fn animate_window_geometry(
    app: AppHandle,
    payload: WindowGeometryAnimationPayload,
    animation_state: State<'_, WindowAnimationState>,
) -> Result<(), String> {
    let window = main_window(&app)?;
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    let current_size: LogicalSize<f64> = window
        .inner_size()
        .map_err(|error| error.to_string())?
        .to_logical(scale_factor);
    let settings = load_settings(&app)?;
    let target_width = payload.target_width.max(COMPACT_WIDTH) as f64;
    let target_height = payload.target_height.max(COMPACT_HEIGHT) as f64;
    let duration_ms = payload.duration_ms.unwrap_or(200).max(1);
    let steps = payload.steps.unwrap_or(12).clamp(1, 24);
    let frame_delay = (duration_ms / steps as u64).max(1);
    let target_is_compact =
        target_width <= COMPACT_WIDTH as f64 + 0.5 && target_height <= COMPACT_HEIGHT as f64 + 0.5;

    animation_state.is_animating.store(true, Ordering::SeqCst);

    if target_is_compact {
        window
            .set_min_size(Some(LogicalSize::new(
                COMPACT_WIDTH as f64,
                COMPACT_HEIGHT as f64,
            )))
            .map_err(|error| error.to_string())?;
    }

    let result = async {
        for step in 1..=steps {
            let progress = step as f64 / steps as f64;
            let eased = 1.0 - (1.0 - progress).powi(3);
            let next_width = current_size.width + (target_width - current_size.width) * eased;
            let next_height = current_size.height + (target_height - current_size.height) * eased;

            window
                .set_size(LogicalSize::new(next_width, next_height))
                .map_err(|error| error.to_string())?;
            position_window_with_size(&window, &settings, next_width, next_height)?;

            if step < steps {
                thread::sleep(StdDuration::from_millis(frame_delay));
            }
        }

        if !target_is_compact {
            window
                .set_min_size(Some(LogicalSize::new(
                    FULL_MIN_WIDTH as f64,
                    FULL_MIN_HEIGHT as f64,
                )))
                .map_err(|error| error.to_string())?;
        }

        Ok::<(), String>(())
    }
    .await;

    animation_state.is_animating.store(false, Ordering::SeqCst);
    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WindowAnimationState::default())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = show_main_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let main_window = main_window(&app_handle)?;
            let settings = load_settings(&app_handle)?;

            attach_window_handlers(app_handle.clone(), main_window.clone());
            build_tray(&app_handle)?;
            apply_window_settings(&app_handle, &settings)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_calendar,
            get_day_entry,
            save_day_entry,
            get_settings,
            save_settings,
            animate_window_geometry
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn open_connection(app: &AppHandle) -> Result<Connection, String> {
    let db_path = database_path(app)?;
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let connection = Connection::open(db_path).map_err(|error| error.to_string())?;
    initialize_schema(&connection)?;
    Ok(connection)
}

fn initialize_schema(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS daily_entries (
              date TEXT PRIMARY KEY,
              raw_md TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            );
            ",
        )
        .map_err(|error| error.to_string())
}

fn load_entries_in_range(
    connection: &Connection,
    range_start: NaiveDate,
    range_end: NaiveDate,
) -> Result<HashMap<String, Vec<LineItem>>, String> {
    let mut statement = connection
        .prepare(
            "SELECT date, raw_md
             FROM daily_entries
             WHERE date >= ?1 AND date <= ?2",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map(
            params![format_iso_date(range_start), format_iso_date(range_end)],
            |row| {
                let date: String = row.get(0)?;
                let raw_md: String = row.get(1)?;
                Ok((date, parse_raw_md(&raw_md)))
            },
        )
        .map_err(|error| error.to_string())?;

    let mut entries = HashMap::new();
    for row in rows {
        let (date, lines) = row.map_err(|error| error.to_string())?;
        entries.insert(date, lines);
    }

    Ok(entries)
}

fn parse_raw_md(raw_md: &str) -> Vec<LineItem> {
    raw_md
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                return None;
            }

            if let Some(text) = trimmed.strip_prefix("- [ ] ") {
                return Some(LineItem {
                    text: text.trim().to_string(),
                    done: false,
                });
            }

            if let Some(text) = trimmed
                .strip_prefix("- [x] ")
                .or_else(|| trimmed.strip_prefix("- [X] "))
            {
                return Some(LineItem {
                    text: text.trim().to_string(),
                    done: true,
                });
            }

            Some(LineItem {
                text: trimmed.to_string(),
                done: false,
            })
        })
        .collect()
}

fn normalize_lines(lines: Vec<LineItem>) -> Vec<LineItem> {
    lines
        .into_iter()
        .filter_map(|line| {
            let text = line.text.trim().to_string();
            if text.is_empty() {
                None
            } else {
                Some(LineItem {
                    text,
                    done: line.done,
                })
            }
        })
        .collect()
}

fn serialize_lines(lines: &[LineItem]) -> String {
    lines
        .iter()
        .map(|line| {
            let marker = if line.done { "x" } else { " " };
            format!("- [{marker}] {}", line.text)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn parse_iso_date(input: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(input, DATE_FORMAT)
        .map_err(|_| format!("Invalid date format: {input}. Expected YYYY-MM-DD"))
}

fn format_iso_date(date: NaiveDate) -> String {
    date.format(DATE_FORMAT).to_string()
}

fn start_of_week(date: NaiveDate) -> NaiveDate {
    date - Duration::days((date.weekday().number_from_monday() - 1) as i64)
}

fn holiday_label(date: &str, enabled: bool) -> Option<String> {
    if !enabled {
        return None;
    }

    HOLIDAYS
        .iter()
        .find(|(holiday_date, _)| *holiday_date == date)
        .map(|(_, label)| (*label).to_string())
}

fn load_settings(app: &AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(app)?;
    let mut settings = if !path.exists() {
        AppSettings::default()
    } else {
        let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
        serde_json::from_str::<AppSettings>(&content).unwrap_or_default()
    };

    if let Ok(auto_launch) = current_autolaunch_state(app) {
        settings.auto_launch = auto_launch;
    }

    Ok(settings)
}

fn persist_settings_file(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let serialized = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    fs::write(path, serialized).map_err(|error| error.to_string())
}

fn apply_autolaunch(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|error| error.to_string())
    } else {
        manager.disable().map_err(|error| error.to_string())
    }
}

fn current_autolaunch_state(app: &AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|error| error.to_string())
        .or_else(|error| {
            if is_not_found_error(&error) {
                Ok(false)
            } else {
                Err(error)
            }
        })
}

fn reconcile_autolaunch(app: &AppHandle, desired: bool) -> Result<bool, String> {
    let current = current_autolaunch_state(app)?;
    if current == desired {
        return Ok(current);
    }

    match apply_autolaunch(app, desired) {
        Ok(()) => current_autolaunch_state(app).or(Ok(desired)),
        Err(error) if !desired && is_not_found_error(&error) => Ok(false),
        Err(error) => Err(error),
    }
}

fn is_not_found_error(error: &str) -> bool {
    error.contains("os error 2")
        || error.contains("系统找不到指定的文件")
        || error.contains("The system cannot find the file specified")
}

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(base_dir.join("desktopcal.sqlite3"))
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    Ok(base_dir.join(Path::new("settings.json")))
}

fn current_timestamp_ms() -> Result<i64, String> {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?;
    Ok(elapsed.as_millis() as i64)
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Main window not found".to_string())
}

fn apply_window_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let window = main_window(app)?;
    let (window_width, window_height) = effective_window_size(settings);
    apply_window_constraints(&window, settings)?;
    window
        .set_size(LogicalSize::new(window_width as f64, window_height as f64))
        .map_err(|error| error.to_string())?;
    position_window_with_size(&window, settings, window_width as f64, window_height as f64)?;
    window
        .set_skip_taskbar(true)
        .map_err(|error| error.to_string())?;
    window
        .set_always_on_bottom(true)
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn position_window(window: &WebviewWindow, settings: &AppSettings) -> Result<(), String> {
    let (window_width, window_height) = effective_window_size(settings);
    position_window_with_size(
        window,
        settings,
        window_width as f64,
        window_height as f64,
    )
}

fn effective_window_size(settings: &AppSettings) -> (u32, u32) {
    if settings.is_collapsed {
        (
            settings.window_width.max(COMPACT_WIDTH),
            settings.window_height.max(COMPACT_HEIGHT),
        )
    } else {
        (
            settings.window_width.max(FULL_MIN_WIDTH),
            settings.window_height.max(FULL_MIN_HEIGHT),
        )
    }
}

fn position_window_with_size(
    window: &WebviewWindow,
    settings: &AppSettings,
    window_width: f64,
    window_height: f64,
) -> Result<(), String> {
    let monitor = window
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Primary monitor not found".to_string())?;
    let scale_factor = monitor.scale_factor();
    let work_area = monitor.work_area();
    let logical_left = work_area.position.x as f64 / scale_factor;
    let logical_top = work_area.position.y as f64 / scale_factor;
    let logical_width = work_area.size.width as f64 / scale_factor;
    let logical_height = work_area.size.height as f64 / scale_factor;
    let right_edge = logical_left + logical_width;
    let bottom_edge = logical_top + logical_height;
    let x = (right_edge - window_width - settings.anchor_right_offset as f64).max(logical_left);
    let max_y = (bottom_edge - window_height).max(logical_top);
    let y = (logical_top + settings.anchor_top_offset as f64).min(max_y);

    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|error| error.to_string())
}

fn apply_window_constraints(window: &WebviewWindow, settings: &AppSettings) -> Result<(), String> {
    let min_size = if settings.is_collapsed {
        LogicalSize::new(COMPACT_WIDTH as f64, COMPACT_HEIGHT as f64)
    } else {
        LogicalSize::new(FULL_MIN_WIDTH as f64, FULL_MIN_HEIGHT as f64)
    };

    window
        .set_min_size(Some(min_size))
        .map_err(|error| error.to_string())
}

fn show_main_window(app: &AppHandle) -> Result<(), String> {
    let settings = load_settings(app)?;
    let window = main_window(app)?;

    apply_window_settings(app, &settings)?;
    if window.is_minimized().map_err(|error| error.to_string())? {
        window.unminimize().map_err(|error| error.to_string())?;
    }
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

fn hide_main_window(app: &AppHandle) -> Result<(), String> {
    main_window(app)?
        .hide()
        .map_err(|error| error.to_string())
}

fn show_settings_panel(app: &AppHandle) -> Result<(), String> {
    let window = main_window(app)?;
    show_main_window(app)?;
    window
        .emit(EVENT_OPEN_SETTINGS, ())
        .map_err(|error| error.to_string())
}

fn attach_window_handlers(app: AppHandle, window: WebviewWindow) {
    let event_window = window.clone();
    let animation_state = app.state::<WindowAnimationState>().inner().clone();
    window.on_window_event(move |event| match event {
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = hide_main_window(&app);
        }
        WindowEvent::Resized(size) => {
            if animation_state.is_animating.load(Ordering::SeqCst) {
                return;
            }

            if size.width > 0 && size.height > 0 {
                if let Ok(mut settings) = load_settings(&app) {
                    let logical: LogicalSize<f64> = PhysicalSize::new(size.width, size.height)
                        .to_logical(event_window.scale_factor().unwrap_or(1.0));

                    if settings.is_collapsed {
                        settings.window_width = logical.width.round().max(COMPACT_WIDTH as f64) as u32;
                        settings.window_height =
                            logical.height.round().max(COMPACT_HEIGHT as f64) as u32;
                    } else {
                        settings.window_width = logical.width.round().max(FULL_MIN_WIDTH as f64) as u32;
                        settings.window_height =
                            logical.height.round().max(FULL_MIN_HEIGHT as f64) as u32;
                        settings.expanded_window_width = settings.window_width;
                        settings.expanded_window_height = settings.window_height;
                    }

                    let _ = persist_settings_file(&app, &settings);
                    let _ = position_window(&event_window, &settings);
                }
            }
        }
        _ => {}
    });
}

fn build_tray(app: &AppHandle) -> Result<(), String> {
    let show_item = MenuItem::with_id(app, TRAY_SHOW, "显示", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let hide_item = MenuItem::with_id(app, TRAY_HIDE, "隐藏", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let settings_item = MenuItem::with_id(app, TRAY_SETTINGS, "设置", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let quit_item = MenuItem::with_id(app, TRAY_QUIT, "退出", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let menu = Menu::with_items(app, &[&show_item, &hide_item, &settings_item, &quit_item])
        .map_err(|error| error.to_string())?;
    let app_handle = app.clone();
    let tray_icon = app
        .default_window_icon()
        .ok_or_else(|| "Default window icon not found".to_string())?;

    TrayIconBuilder::with_id("desktopcal-tray")
        .icon(tray_icon.clone())
        .tooltip("DesktopCal Lightweight")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            TRAY_SHOW => {
                let _ = show_main_window(app);
            }
            TRAY_HIDE => {
                let _ = hide_main_window(app);
            }
            TRAY_SETTINGS => {
                let _ = show_settings_panel(app);
            }
            TRAY_QUIT => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(move |_tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Ok(window) = main_window(&app_handle) {
                    let is_visible = window.is_visible().unwrap_or(false);
                    if is_visible {
                        let _ = hide_main_window(&app_handle);
                    } else {
                        let _ = show_main_window(&app_handle);
                    }
                }
            }
        })
        .build(app)
        .map_err(|error| error.to_string())?;

    Ok(())
}
