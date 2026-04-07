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
  anchorTopOffset: number;
  anchorRightOffset: number;
  autoLaunch: boolean;
  showWeekNumbers: boolean;
  showHolidayLabels: boolean;
  lastViewMonth: string | null;
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
