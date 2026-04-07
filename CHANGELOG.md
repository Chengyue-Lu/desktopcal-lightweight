# Changelog

## 2026-04-07

- Initialized the repository as a Tauri 2 + React + TypeScript desktop app scaffold.
- Replaced the default starter demo with a project-specific desktop calendar shell.
- Added Rust Tauri commands for `get_calendar`, `get_day_entry`, `save_day_entry`, `get_settings`, and `save_settings`.
- Added SQLite persistence for daily entries using the `daily_entries` schema from the design doc.
- Added tolerant markdown-like line parsing and serialization for `- [ ] task` and `- [x] task`.
- Added local JSON-backed settings persistence with defaults for window size, display toggles, and last viewed date.
- Connected the React UI to real Tauri commands so month data and day entries load from the backend.
- Implemented a minimal line-based editor with checkbox toggles, Enter-to-insert, remove-line, and save behavior.
- Added a first pass of calendar summary rendering, week-number display, and lightweight holiday labels.
- Ignored `src-tauri/target` in `.gitignore` to keep local Rust build output out of version control.

## 2026-04-08

- Updated the design document to replace the fixed bottom editor direction with an anchored floating day editor.
- Clarified that the calendar must remain the primary visual focus and editing should appear only on demand.
- Added a new default sizing direction: landscape-first, with width greater than height.
- Added explicit prototype correction notes so later implementation follows the lighter, less crowded interaction model.
- Refined the popup editor spec to use auto-numbered simple text input with Enter-to-create-next-line behavior.
- Locked the task interaction model to a single completion button at each row start, with no extra action buttons or helper text.
- Rebuilt the frontend editor from a fixed bottom panel into an anchored floating popup attached to the selected day cell.
- Simplified the popup editor to auto-numbered plain text rows with only one completion toggle per task.
- Updated the default app window sizing to a landscape-first layout (`960 x 720`) with wider minimum bounds.
- Refined the interaction so single click selects, double click opens the inline-expanding editor, and outside click auto-saves then closes.
- Reworked the calendar interaction again so the editor now lives inside the selected day cell and expands in place while nearby cells are repelled via transform-based redraw.
- Tightened the editor typography and controls to fit the compact inline-expanded cell design.
- Replaced the radial repulsion redraw with a gap-compensation propagation model so horizontal and vertical movement attenuate by row and column distance, with diagonal cells inheriting both axes for cleaner alignment.
- Added matching avoidance transforms for weekday headers and week-number labels so the expanded editor keeps more breathing room around the outer grid labels.
- Stripped the inline editor chrome down to a pure text-first layout by hiding the date/save header, shrinking typography, and collapsing task row spacing.
- Locked day cells to a fixed size so opening or adding many items no longer stretches the editor box; overflow now stays inside the scrolling editor area.
- Fixed the editing-state hover/opacity regression so expanded cells stay fully readable instead of fading back toward the translucent display style.
- Compressed the display-state day layout to a denser date-plus-list presentation with tighter spacing and smaller preview typography.
- Switched the visible calendar navigation framing from month-based stepping to a rolling five-week window centered on the current week (`-1 / +3` weeks), with the header now showing the actual date span.
- Flattened the top toolbar into a single compact row, removed the extra eyebrow label, and tightened the title/button height to better match the weekday header rhythm.
- Simplified the toolbar controls to `↑ / ⌂ / ↓` and changed window navigation from one-week nudges to two-week jumps per click.
- Cleaned up the corrupted front-end date and toolbar text, then rebuilt the main React screen around a compact five-week desktop widget layout.
- Added a lightweight in-app settings panel for width, height, top/right anchor offsets, and auto-launch, and wired it to the existing settings persistence flow.
- Lowered the inline editor expansion ratio to `1.1`, kept the fixed-size white editing cell, and preserved the gap-compensation redraw model while removing the old editor header chrome entirely.
- Updated the Rust settings model with right/top anchor offsets, synchronized persisted auto-launch state with the Tauri autostart plugin, and applied size/position changes immediately on save.
- Added a system tray with show, hide, settings, and quit actions, plus left-click visibility toggling for faster desktop use.
- Changed the Tauri desktop shell to an undecorated, skip-taskbar, always-on-bottom window that re-anchors itself to the top-right of the primary work area.
- Intercepted window close requests so the app hides instead of exiting, keeping the widget resident under tray control.
- Replaced the bundled application icons by center-cropping the provided PNG to roughly `70%` visual bounds and regenerating the full Tauri icon set for both app and tray usage.
- Reworked the settings panel into an isolated draft form so clicks and unsaved edits no longer mutate live window state or interfere with the main calendar rendering path.
- Reworked the settings panel again into a fully local child component so interacting with its controls no longer rerenders the main calendar tree before `应用`.
- Added a front-end window resize/reposition step after `应用` so size and right-top anchoring change immediately instead of relying only on backend-side window application.
- Removed the main panel's fixed-width ceiling and made the shell fill the window height so manual window resizing is visually reflected by the calendar surface itself.
- Granted the frontend capability permission set for `setSize`, `setPosition`, and current-monitor access so settings application can move and resize the actual Tauri window instead of only triggering a React reflow.
- Made autostart reconciliation state-aware and tolerant of missing startup entries so ordinary settings saves are no longer blocked by `os error 2` when auto-launch is already absent.
- Excluded the settings panel and settings button from the editor's outside-click autosave chain to avoid collapsing the main content area while settings are being adjusted.
- Increased the default window footprint to a larger landscape layout (`1440 x 936`) while keeping the existing minimum-size guardrails.
- Lowered the main glass panel opacity for a lighter semi-transparent desktop background feel.
- Enabled a transparent Tauri window and moved the translucency/blur treatment to the outer app shell so the desktop shows through the true window backdrop instead of leaving an opaque dark rectangle behind the calendar.
- Changed the auto-launch control into a compact slider switch aligned with its label, reset the default window geometry to `1300 x 850` with `5px` top/right anchoring offsets, and pushed the outer app backdrop closer to near-transparent glass.
- Removed unused front-end settings/payload fields and deleted leftover month/editor date helper functions that were no longer used after the five-week view refactor.
- Rewrote the project README for the `0.1.0` release line and added a dedicated current-version release document for packaging and handoff.
