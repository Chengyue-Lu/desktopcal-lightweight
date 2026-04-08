import { invoke } from "@tauri-apps/api/core";

export type LineItem = {
  text: string;
  done: boolean;
};

export type CalendarDayCell = {
  isoDate: string;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  holidayLabel: string | null;
  previewTasks: LineItem[];
  overflowCount: number;
};

export type CalendarWeek = {
  weekNumber: number;
  days: CalendarDayCell[];
};

export type CalendarPayload = {
  referenceDate: string;
  weekdayLabels: string[];
  weeks: CalendarWeek[];
};

export type AppSettings = {
  windowWidth: number;
  windowHeight: number;
  expandedWindowWidth: number;
  expandedWindowHeight: number;
  anchorTopOffset: number;
  anchorRightOffset: number;
  isCollapsed: boolean;
  autoLaunch: boolean;
  showWeekNumbers: boolean;
  showHolidayLabels: boolean;
  lastViewMonth: string | null;
};

export type WindowGeometryAnimationPayload = {
  targetWidth: number;
  targetHeight: number;
  durationMs?: number;
  steps?: number;
};

export function getCalendar(date: string) {
  return invoke<CalendarPayload>("get_calendar", { date });
}

export function getDayEntry(date: string) {
  return invoke<LineItem[]>("get_day_entry", { date });
}

export function saveDayEntry(date: string, lines: LineItem[]) {
  return invoke<LineItem[]>("save_day_entry", { date, lines });
}

export function getSettings() {
  return invoke<AppSettings>("get_settings");
}

export function saveSettings(payload: AppSettings) {
  return invoke<AppSettings>("save_settings", { payload });
}

export function animateWindowGeometry(payload: WindowGeometryAnimationPayload) {
  return invoke<void>("animate_window_geometry", { payload });
}
