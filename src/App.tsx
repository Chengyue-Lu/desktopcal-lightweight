import { listen } from "@tauri-apps/api/event";
import { LogicalPosition, LogicalSize, currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import {
  startTransition,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import "./App.css";
import type { AppSettings, CalendarDayCell, CalendarPayload, LineItem } from "./lib/api";
import { getCalendar, getDayEntry, getSettings, saveDayEntry, saveSettings } from "./lib/api";
import { getTodayIsoDate, shiftDayIsoDate, toReadableWindow } from "./lib/date";

const DEFAULT_SETTINGS: AppSettings = {
  windowWidth: 1300,
  windowHeight: 850,
  anchorTopOffset: 5,
  anchorRightOffset: 5,
  autoLaunch: false,
  showWeekNumbers: true,
  showHolidayLabels: true,
  lastViewMonth: null,
};

const BLANK_LINE: LineItem = { text: "", done: false };
const EDIT_SCALE = 1.1;
const EDGE_PADDING = 10;
const AXIS_COMPENSATION = [0.24, 0.38, 0.52, 0.68, 0.84];
const OUTER_COMPENSATION = [0.18, 0.3, 0.44, 0.6, 0.76];

function createEditableLines(lines: LineItem[]) {
  return lines.length > 0 ? lines : [{ ...BLANK_LINE }];
}

function getCompensation(series: number[], index: number) {
  return series[Math.min(index, series.length - 1)] ?? series[series.length - 1] ?? 1;
}

function computeAxisPush(expansion: number, gap: number, steps: number, series: number[]) {
  let remaining = expansion;

  for (let index = 0; index < steps; index += 1) {
    remaining = Math.max(0, remaining - gap * getCompensation(series, index));
    if (remaining === 0) {
      return 0;
    }
  }

  return remaining;
}

function computeAxisTranslation(
  itemIndex: number,
  anchorIndex: number,
  expansion: number,
  gap: number,
  series: number[],
) {
  const offset = itemIndex - anchorIndex;
  if (offset === 0) {
    return 0;
  }

  return Math.sign(offset) * computeAxisPush(expansion, gap, Math.abs(offset), series);
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sanitizeSettings(settings: AppSettings): AppSettings {
  const width = Number(settings.windowWidth);
  const height = Number(settings.windowHeight);
  const topOffset = Number(settings.anchorTopOffset);
  const rightOffset = Number(settings.anchorRightOffset);

  return {
    ...settings,
    windowWidth: Number.isFinite(width) ? Math.max(760, Math.round(width)) : DEFAULT_SETTINGS.windowWidth,
    windowHeight: Number.isFinite(height) ? Math.max(560, Math.round(height)) : DEFAULT_SETTINGS.windowHeight,
    anchorTopOffset: Number.isFinite(topOffset) ? Math.max(0, Math.round(topOffset)) : 0,
    anchorRightOffset: Number.isFinite(rightOffset) ? Math.max(0, Math.round(rightOffset)) : 0,
  };
}

function parseDraftNumber(value: string, fallback: number, minimum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(minimum, Math.round(parsed));
}

async function applyWindowGeometry(settings: AppSettings) {
  const monitor = await currentMonitor();
  const window = getCurrentWindow();

  await window.setSize(new LogicalSize(settings.windowWidth, settings.windowHeight));

  if (!monitor) {
    return;
  }

  const workArea = monitor.workArea;
  const scaleFactor = monitor.scaleFactor || 1;
  const workLeft = workArea.position.x / scaleFactor;
  const workTop = workArea.position.y / scaleFactor;
  const workWidth = workArea.size.width / scaleFactor;
  const x = workLeft + workWidth - settings.windowWidth - settings.anchorRightOffset;
  const y = workTop + settings.anchorTopOffset;

  await window.setPosition(
    new LogicalPosition(Math.max(workLeft, x), Math.max(workTop, y)),
  );
}

function SettingsPanel({
  initialSettings,
  isSaving,
  onApply,
  onClose,
  panelRef,
}: {
  initialSettings: AppSettings;
  isSaving: boolean;
  onApply: (settings: AppSettings) => void;
  onClose: () => void;
  panelRef: RefObject<HTMLDivElement | null>;
}) {
  const [windowWidth, setWindowWidth] = useState(String(initialSettings.windowWidth));
  const [windowHeight, setWindowHeight] = useState(String(initialSettings.windowHeight));
  const [anchorTopOffset, setAnchorTopOffset] = useState(String(initialSettings.anchorTopOffset));
  const [anchorRightOffset, setAnchorRightOffset] = useState(
    String(initialSettings.anchorRightOffset),
  );
  const [autoLaunch, setAutoLaunch] = useState(initialSettings.autoLaunch);

  useEffect(() => {
    setWindowWidth(String(initialSettings.windowWidth));
    setWindowHeight(String(initialSettings.windowHeight));
    setAnchorTopOffset(String(initialSettings.anchorTopOffset));
    setAnchorRightOffset(String(initialSettings.anchorRightOffset));
    setAutoLaunch(initialSettings.autoLaunch);
  }, [initialSettings]);

  return (
    <aside
      className="settings-panel"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      ref={panelRef}
    >
      <div className="settings-panel__grid">
        <label>
          <span>宽</span>
          <input
            min={760}
            onChange={(event) => setWindowWidth(event.currentTarget.value)}
            type="number"
            value={windowWidth}
          />
        </label>
        <label>
          <span>高</span>
          <input
            min={560}
            onChange={(event) => setWindowHeight(event.currentTarget.value)}
            type="number"
            value={windowHeight}
          />
        </label>
        <label>
          <span>右</span>
          <input
            min={0}
            onChange={(event) => setAnchorRightOffset(event.currentTarget.value)}
            type="number"
            value={anchorRightOffset}
          />
        </label>
        <label>
          <span>上</span>
          <input
            min={0}
            onChange={(event) => setAnchorTopOffset(event.currentTarget.value)}
            type="number"
            value={anchorTopOffset}
          />
        </label>
      </div>

      <label className="settings-panel__switch">
        <span>开机自启</span>
        <span className="settings-panel__switch-control">
          <input
            checked={autoLaunch}
            onChange={(event) => setAutoLaunch(event.currentTarget.checked)}
            type="checkbox"
          />
          <span aria-hidden="true" className="settings-panel__switch-track">
            <span className="settings-panel__switch-thumb" />
          </span>
        </span>
      </label>

      <div className="settings-panel__actions">
        <button disabled={isSaving} onClick={onClose} type="button">取消</button>
        <button
          disabled={isSaving}
          onClick={() =>
            onApply({
              ...initialSettings,
              windowWidth: parseDraftNumber(windowWidth, initialSettings.windowWidth, 760),
              windowHeight: parseDraftNumber(windowHeight, initialSettings.windowHeight, 560),
              anchorTopOffset: parseDraftNumber(
                anchorTopOffset,
                initialSettings.anchorTopOffset,
                0,
              ),
              anchorRightOffset: parseDraftNumber(
                anchorRightOffset,
                initialSettings.anchorRightOffset,
                0,
              ),
              autoLaunch,
            })
          }
          type="button"
        >
          {isSaving ? "保存中..." : "应用"}
        </button>
      </div>
    </aside>
  );
}

function DayCell({
  day,
  editing,
  selected,
  showHolidayLabel,
  draftLines,
  isDayLoading,
  style,
  onSelect,
  onOpenEditor,
  onToggleDone,
  onInputChange,
  onInputKeyDown,
  registerRef,
  registerInputRef,
}: {
  day: CalendarDayCell;
  editing: boolean;
  selected: boolean;
  showHolidayLabel: boolean;
  draftLines: LineItem[];
  isDayLoading: boolean;
  style?: CSSProperties;
  onSelect: (isoDate: string) => void;
  onOpenEditor: (isoDate: string) => void;
  onToggleDone: (lineIndex: number) => void;
  onInputChange: (lineIndex: number, value: string) => void;
  onInputKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>, lineIndex: number) => void;
  registerRef: (isoDate: string, node: HTMLDivElement | null) => void;
  registerInputRef: (lineIndex: number, node: HTMLInputElement | null) => void;
}) {
  const [, monthText, dayText] = day.isoDate.split("-");
  const shortEditorDate = `${Number(monthText)}月${Number(dayText)}日`;

  return (
    <div
      className={[
        "day-cell",
        day.isToday ? "day-cell--today" : "",
        day.isWeekend ? "day-cell--weekend" : "",
        !day.isCurrentMonth ? "day-cell--muted" : "",
        selected ? "day-cell--selected" : "",
        editing ? "day-cell--editing" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onSelect(day.isoDate)}
      onDoubleClick={() => onOpenEditor(day.isoDate)}
      ref={(node) => registerRef(day.isoDate, node)}
      style={style}
    >
      {editing ? (
        <div className="editor-inline__body">
          <p className="editor-inline__date">{shortEditorDate}</p>
          {isDayLoading ? (
            <p className="editor-inline__state">加载中...</p>
          ) : (
            draftLines.map((line, index) => (
              <div className="task-line" key={`${day.isoDate}-${index}`}>
                <button
                  aria-label={line.done ? "标记为未完成" : "标记为已完成"}
                  className={[
                    "task-line__toggle",
                    line.done ? "task-line__toggle--done" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleDone(index);
                  }}
                  type="button"
                />
                <span className="task-line__index">{index + 1}.</span>
                <input
                  className={[
                    "task-line__input",
                    line.done ? "task-line__input--done" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onChange={(event) => onInputChange(index, event.currentTarget.value)}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => onInputKeyDown(event, index)}
                  ref={(node) => registerInputRef(index, node)}
                  spellCheck={false}
                  type="text"
                  value={line.text}
                />
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          <div className="day-cell__header">
            <span className="day-cell__date">{day.dayOfMonth}</span>
            {showHolidayLabel && day.holidayLabel ? (
              <span className="day-cell__holiday">{day.holidayLabel}</span>
            ) : null}
          </div>
          <div className="day-cell__tasks">
            {day.previewTasks.map((task, index) => (
              <p
                className={task.done ? "day-cell__task day-cell__task--done" : "day-cell__task"}
                key={`${day.isoDate}-${index}-${task.text}`}
              >
                {index + 1}. {task.text}
              </p>
            ))}
            {day.overflowCount > 0 ? <p className="day-cell__overflow">+{day.overflowCount}</p> : null}
          </div>
        </>
      )}
    </div>
  );
}

function App() {
  const todayIsoDate = getTodayIsoDate();
  const [settings, setSettingsState] = useState<AppSettings | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [referenceDate, setReferenceDate] = useState(todayIsoDate);
  const [selectedDate, setSelectedDate] = useState(todayIsoDate);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [calendar, setCalendar] = useState<CalendarPayload | null>(null);
  const [draftLines, setDraftLines] = useState<LineItem[]>(createEditableLines([]));
  const [cellTransforms, setCellTransforms] = useState<Record<string, CSSProperties>>({});
  const [weekdayTransforms, setWeekdayTransforms] = useState<Record<number, CSSProperties>>({});
  const [weekLabelTransforms, setWeekLabelTransforms] = useState<Record<number, CSSProperties>>({});
  const [weekHeadTransform, setWeekHeadTransform] = useState<CSSProperties>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCalendarLoading, setIsCalendarLoading] = useState(true);
  const [isDayLoading, setIsDayLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const pendingFocusIndexRef = useRef<number | null>(null);
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const stageRef = useRef<HTMLDivElement | null>(null);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const editorDate = editingDate;

  const allDates = useMemo(
    () => calendar?.weeks.flatMap((week) => week.days.map((day) => day.isoDate)) ?? [],
    [calendar],
  );

  const dayGridIndex = useMemo(() => {
    const positions: Record<string, { rowIndex: number; colIndex: number }> = {};

    calendar?.weeks.forEach((week, rowIndex) => {
      week.days.forEach((day, colIndex) => {
        positions[day.isoDate] = { rowIndex, colIndex };
      });
    });

    return positions;
  }, [calendar]);

  useEffect(() => {
    const nextFocusIndex = pendingFocusIndexRef.current;
    if (nextFocusIndex === null || !editorOpen) {
      return;
    }

    const target = inputRefs.current[nextFocusIndex];
    if (target) {
      target.focus();
      target.select();
    }
    pendingFocusIndexRef.current = null;
  }, [draftLines, editorOpen]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const loadedSettings = sanitizeSettings(await getSettings());
        if (cancelled) {
          return;
        }

        const initialReferenceDate = loadedSettings.lastViewMonth ?? todayIsoDate;
        setSettingsState(loadedSettings);
        setReferenceDate(initialReferenceDate);
        setErrorMessage(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setSettingsState(DEFAULT_SETTINGS);
        setErrorMessage(`加载设置失败：${String(error)}`);
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [todayIsoDate]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    listen("desktopcal://open-settings", () => {
      if (!disposed) {
        setIsSettingsOpen(true);
      }
    })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        unlisten = cleanup;
      })
      .catch((error) => {
        if (!disposed) {
          setErrorMessage(`监听托盘事件失败：${String(error)}`);
        }
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!settings) {
      return;
    }

    let cancelled = false;

    async function loadCalendarData() {
      setIsCalendarLoading(true);
      try {
        const payload = await getCalendar(referenceDate);
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setCalendar(payload);
        });
        setErrorMessage(null);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(`加载日历失败：${String(error)}`);
        }
      } finally {
        if (!cancelled) {
          setIsCalendarLoading(false);
        }
      }
    }

    loadCalendarData();

    return () => {
      cancelled = true;
    };
  }, [referenceDate, settings]);

  useEffect(() => {
    if (!editorOpen || !editorDate) {
      return;
    }

    const currentEditorDate = editorDate;
    let cancelled = false;

    async function loadDayData() {
      setIsDayLoading(true);
      try {
        const payload = await getDayEntry(currentEditorDate);
        if (cancelled) {
          return;
        }

        setDraftLines(createEditableLines(payload));
        pendingFocusIndexRef.current = 0;
        setErrorMessage(null);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(`加载当日事项失败：${String(error)}`);
        }
      } finally {
        if (!cancelled) {
          setIsDayLoading(false);
        }
      }
    }

    loadDayData();

    return () => {
      cancelled = true;
    };
  }, [editorDate, editorOpen]);

  useEffect(() => {
    if (!editorOpen || !editorDate) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Element | null;
      if (
        target?.closest(".day-cell") ||
        target?.closest(".settings-panel") ||
        target?.closest(".topbar__button--settings")
      ) {
        return;
      }

      void saveCurrentEntry(true);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        void saveCurrentEntry(true);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [draftLines, editorDate, editorOpen]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (settingsPanelRef.current?.contains(target)) {
        return;
      }
      if (settingsButtonRef.current?.contains(target)) {
        return;
      }
      setIsSettingsOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isSettingsOpen]);

  useLayoutEffect(() => {
    if (!calendar || !editorOpen || !editorDate) {
      setCellTransforms({});
      setWeekdayTransforms({});
      setWeekLabelTransforms({});
      setWeekHeadTransform({});
      return;
    }

    const anchorNode = dayRefs.current[editorDate];
    const stageNode = stageRef.current;
    const anchorIndex = dayGridIndex[editorDate];
    if (!anchorNode || !stageNode || !anchorIndex) {
      setCellTransforms({});
      setWeekdayTransforms({});
      setWeekLabelTransforms({});
      setWeekHeadTransform({});
      return;
    }

    const anchorLeft = anchorNode.offsetLeft;
    const anchorTop = anchorNode.offsetTop;
    const anchorWidth = anchorNode.offsetWidth;
    const anchorHeight = anchorNode.offsetHeight;
    const stageWidth = stageNode.clientWidth;
    const stageHeight = stageNode.clientHeight;
    const horizontalGaps: number[] = [];
    const verticalGaps: number[] = [];

    calendar.weeks.forEach((week, rowIndex) => {
      week.days.forEach((day, colIndex) => {
        const currentNode = dayRefs.current[day.isoDate];
        if (!currentNode) {
          return;
        }

        const nextDay = week.days[colIndex + 1];
        if (nextDay) {
          const nextNode = dayRefs.current[nextDay.isoDate];
          if (nextNode) {
            horizontalGaps.push(
              nextNode.offsetLeft - (currentNode.offsetLeft + currentNode.offsetWidth),
            );
          }
        }

        const nextWeek = calendar.weeks[rowIndex + 1];
        if (nextWeek) {
          const lowerNode = dayRefs.current[nextWeek.days[colIndex]?.isoDate];
          if (lowerNode) {
            verticalGaps.push(
              lowerNode.offsetTop - (currentNode.offsetTop + currentNode.offsetHeight),
            );
          }
        }
      });
    });

    const gapX = average(horizontalGaps) || 10;
    const gapY = average(verticalGaps) || 10;
    const extraHalfWidth = (anchorWidth * (EDIT_SCALE - 1)) / 2;
    const extraHalfHeight = (anchorHeight * (EDIT_SCALE - 1)) / 2;
    const scaledLeft = anchorLeft - extraHalfWidth;
    const scaledRight = anchorLeft + anchorWidth + extraHalfWidth;
    const scaledTop = anchorTop - extraHalfHeight;
    const scaledBottom = anchorTop + anchorHeight + extraHalfHeight;
    let anchorShiftX = 0;
    let anchorShiftY = 0;

    if (scaledLeft < EDGE_PADDING) {
      anchorShiftX = EDGE_PADDING - scaledLeft;
    } else if (scaledRight > stageWidth - EDGE_PADDING) {
      anchorShiftX = stageWidth - EDGE_PADDING - scaledRight;
    }

    if (scaledTop < EDGE_PADDING) {
      anchorShiftY = EDGE_PADDING - scaledTop;
    } else if (scaledBottom > stageHeight - EDGE_PADDING) {
      anchorShiftY = stageHeight - EDGE_PADDING - scaledBottom;
    }

    const nextCellStyles: Record<string, CSSProperties> = {};
    const nextWeekdayStyles: Record<number, CSSProperties> = {};
    const nextWeekLabelStyles: Record<number, CSSProperties> = {};
    const weekHeadX =
      -computeAxisPush(extraHalfWidth, gapX, anchorIndex.colIndex + 1, OUTER_COMPENSATION) +
      anchorShiftX;
    const weekHeadY =
      -computeAxisPush(extraHalfHeight, gapY, anchorIndex.rowIndex + 1, OUTER_COMPENSATION) +
      anchorShiftY;

    for (const isoDate of allDates) {
      const cellIndex = dayGridIndex[isoDate];
      if (!cellIndex) {
        continue;
      }

      if (isoDate === editorDate) {
        nextCellStyles[isoDate] = {
          transform: `translate3d(${anchorShiftX}px, ${anchorShiftY}px, 0) scale(${EDIT_SCALE})`,
          transformOrigin: "center center",
          zIndex: 10,
        };
        continue;
      }

      const translationX =
        computeAxisTranslation(
          cellIndex.colIndex,
          anchorIndex.colIndex,
          extraHalfWidth,
          gapX,
          AXIS_COMPENSATION,
        ) + anchorShiftX;
      const translationY =
        computeAxisTranslation(
          cellIndex.rowIndex,
          anchorIndex.rowIndex,
          extraHalfHeight,
          gapY,
          AXIS_COMPENSATION,
        ) + anchorShiftY;

      nextCellStyles[isoDate] =
        translationX === 0 && translationY === 0
          ? {}
          : {
              transform: `translate3d(${translationX}px, ${translationY}px, 0)`,
            };
    }

    for (let columnIndex = 0; columnIndex < 7; columnIndex += 1) {
      const translationX =
        computeAxisTranslation(
          columnIndex,
          anchorIndex.colIndex,
          extraHalfWidth,
          gapX,
          AXIS_COMPENSATION,
        ) + anchorShiftX;
      const translationY = weekHeadY;

      nextWeekdayStyles[columnIndex] =
        translationX === 0 && translationY === 0
          ? {}
          : {
              transform: `translate3d(${translationX}px, ${translationY}px, 0)`,
            };
    }

    for (let rowIndex = 0; rowIndex < calendar.weeks.length; rowIndex += 1) {
      const translationX = weekHeadX;
      const translationY =
        computeAxisTranslation(
          rowIndex,
          anchorIndex.rowIndex,
          extraHalfHeight,
          gapY,
          AXIS_COMPENSATION,
        ) + anchorShiftY;

      nextWeekLabelStyles[rowIndex] =
        translationX === 0 && translationY === 0
          ? {}
          : {
              transform: `translate3d(${translationX}px, ${translationY}px, 0)`,
            };
    }

    setCellTransforms(nextCellStyles);
    setWeekdayTransforms(nextWeekdayStyles);
    setWeekLabelTransforms(nextWeekLabelStyles);
    setWeekHeadTransform(
      weekHeadX === 0 && weekHeadY === 0
        ? {}
        : {
            transform: `translate3d(${weekHeadX}px, ${weekHeadY}px, 0)`,
          },
    );
  }, [allDates, calendar, dayGridIndex, editorDate, editorOpen]);

  async function persistSettings(nextSettings: AppSettings) {
    const sanitized = sanitizeSettings(nextSettings);
    setSettingsState(sanitized);

    try {
      const saved = sanitizeSettings(await saveSettings(sanitized));
      setSettingsState(saved);
      setErrorMessage(null);
      return saved;
    } catch (error) {
      setErrorMessage(`保存设置失败：${String(error)}`);
      return null;
    }
  }

  async function saveCurrentEntry(closeOnSuccess: boolean) {
    if (!editorDate || isSaving) {
      return true;
    }

    setIsSaving(true);
    try {
      const savedLines = await saveDayEntry(editorDate, draftLines);
      setDraftLines(createEditableLines(savedLines));

      const payload = await getCalendar(referenceDate);
      startTransition(() => {
        setCalendar(payload);
      });

      if (closeOnSuccess) {
        setEditorOpen(false);
        setEditingDate(null);
      }

      setErrorMessage(null);
      return true;
    } catch (error) {
      setErrorMessage(`保存事项失败：${String(error)}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleApplySettings(nextSettings: AppSettings) {
    setIsSettingsSaving(true);
    const saved = await persistSettings(nextSettings);
    if (saved) {
      try {
        await applyWindowGeometry(saved);
      } catch (error) {
        setErrorMessage(`应用窗口尺寸失败：${String(error)}`);
      }
    }
    setIsSettingsSaving(false);
    if (saved) {
      setIsSettingsOpen(false);
    }
  }

  function navigateWindow(offset: number) {
    const nextReferenceDate = shiftDayIsoDate(referenceDate, offset * 14);
    setReferenceDate(nextReferenceDate);
    setEditorOpen(false);
    setEditingDate(null);
    void persistSettings({
      ...(settings ?? DEFAULT_SETTINGS),
      lastViewMonth: nextReferenceDate,
    });
  }

  function jumpToToday() {
    setReferenceDate(todayIsoDate);
    setSelectedDate(todayIsoDate);
    setEditorOpen(false);
    setEditingDate(null);
    void persistSettings({
      ...(settings ?? DEFAULT_SETTINGS),
      lastViewMonth: todayIsoDate,
    });
  }

  function updateDraftLine(index: number, patch: Partial<LineItem>) {
    setDraftLines((currentLines) =>
      currentLines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    );
  }

  function insertLine(afterIndex: number) {
    setDraftLines((currentLines) => {
      const nextLines = [...currentLines];
      const insertIndex = Math.max(afterIndex + 1, 0);
      nextLines.splice(insertIndex, 0, { ...BLANK_LINE });
      return nextLines;
    });
    pendingFocusIndexRef.current = Math.max(afterIndex + 1, 0);
  }

  function removeLine(index: number) {
    setDraftLines((currentLines) => {
      if (currentLines.length === 1) {
        return [{ ...BLANK_LINE }];
      }

      const nextLines = currentLines.filter((_, lineIndex) => lineIndex !== index);
      return nextLines.length > 0 ? nextLines : [{ ...BLANK_LINE }];
    });
    pendingFocusIndexRef.current = Math.max(index - 1, 0);
  }

  function handleLineKeyDown(event: ReactKeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === "Enter") {
      event.preventDefault();
      insertLine(index);
      return;
    }

    if (event.key === "Backspace" && draftLines[index]?.text === "" && draftLines.length > 1) {
      event.preventDefault();
      removeLine(index);
    }
  }

  function handleSelectDate(isoDate: string) {
    if (editorOpen && editorDate && isoDate !== editorDate) {
      setSelectedDate(isoDate);
      void saveCurrentEntry(true);
      return;
    }

    setSelectedDate(isoDate);
  }

  async function handleOpenEditor(isoDate: string) {
    if (editorOpen && editorDate && editorDate !== isoDate) {
      const saved = await saveCurrentEntry(true);
      if (!saved) {
        return;
      }
    }

    setSelectedDate(isoDate);
    setEditingDate(isoDate);
    setEditorOpen(true);
    setDraftLines(createEditableLines([]));
  }

  function registerDayRef(isoDate: string, node: HTMLDivElement | null) {
    dayRefs.current[isoDate] = node;
  }

  function registerInputRef(lineIndex: number, node: HTMLInputElement | null) {
    inputRefs.current[lineIndex] = node;
  }

  const windowTitle = calendar ? toReadableWindow(calendar.weeks) : "";
  const showWeekNumbers = settings?.showWeekNumbers ?? true;
  const showHolidayLabels = settings?.showHolidayLabels ?? true;

  return (
    <main className="app-shell">
      <section className="calendar-panel">
        <header className="topbar">
          <div className="topbar__title">
            <h1>{windowTitle}</h1>
          </div>

          <div className="topbar__actions">
            <button aria-label="向前两周" onClick={() => navigateWindow(-1)} type="button">
              ↑
            </button>
            <button aria-label="回到今天" onClick={jumpToToday} type="button">
              ⌂
            </button>
            <button aria-label="向后两周" onClick={() => navigateWindow(1)} type="button">
              ↓
            </button>
            <button
              aria-label="打开设置"
              className="topbar__button--settings"
              onClick={(event) => {
                event.stopPropagation();
                setIsSettingsOpen((current) => !current);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              ref={settingsButtonRef}
              type="button"
            >
              ⚙
            </button>
          </div>
        </header>

        {isSettingsOpen ? (
          <SettingsPanel
            initialSettings={settings ?? DEFAULT_SETTINGS}
            isSaving={isSettingsSaving}
            onApply={(nextSettings) => {
              void handleApplySettings(nextSettings);
            }}
            onClose={() => setIsSettingsOpen(false)}
            panelRef={settingsPanelRef}
          />
        ) : null}

        <section className="calendar-stage" ref={stageRef}>
          <section
            aria-label="five-week-grid"
            className={showWeekNumbers ? "calendar-grid" : "calendar-grid calendar-grid--no-week"}
          >
            {showWeekNumbers ? (
              <div className="week-label week-label--head" style={weekHeadTransform}>
                周
              </div>
            ) : null}

            {(calendar?.weekdayLabels ?? []).map((label, columnIndex) => (
              <div className="weekday" key={label} style={weekdayTransforms[columnIndex]}>
                {label}
              </div>
            ))}

            {calendar?.weeks.map((week, rowIndex) => (
              <div className="calendar-row" key={`week-${week.weekNumber}-${week.days[0].isoDate}`}>
                {showWeekNumbers ? (
                  <div className="week-label" style={weekLabelTransforms[rowIndex]}>
                    W{String(week.weekNumber).padStart(2, "0")}
                  </div>
                ) : null}

                {week.days.map((day) => {
                  const editing = editorOpen && editorDate === day.isoDate;
                  return (
                    <DayCell
                      day={day}
                      draftLines={editing ? draftLines : []}
                      editing={editing}
                      isDayLoading={editing ? isDayLoading : false}
                      key={day.isoDate}
                      onInputChange={(lineIndex, value) =>
                        updateDraftLine(lineIndex, { text: value })
                      }
                      onInputKeyDown={handleLineKeyDown}
                      onOpenEditor={handleOpenEditor}
                      onSelect={handleSelectDate}
                      onToggleDone={(lineIndex) =>
                        updateDraftLine(lineIndex, {
                          done: !draftLines[lineIndex]?.done,
                        })
                      }
                      registerInputRef={registerInputRef}
                      registerRef={registerDayRef}
                      selected={selectedDate === day.isoDate}
                      showHolidayLabel={showHolidayLabels}
                      style={cellTransforms[day.isoDate]}
                    />
                  );
                })}
              </div>
            ))}
          </section>
        </section>

        {errorMessage ? <p className="error-note">{errorMessage}</p> : null}
        {isCalendarLoading ? <p className="loading-note">正在刷新日历...</p> : null}
      </section>
    </main>
  );
}

export default App;
