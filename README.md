# DesktopCal Lightweight

一个基于 Tauri 的轻量桌面月历工具骨架项目，当前已完成前后端基础脚手架初始化，并替换为贴近目标产品的月历壳子页面。

## 当前状态

- `src/` 已切换为桌面月历静态骨架，包含顶部导航、5 周月历网格和编辑区占位。
- `src-tauri/` 已完成 Tauri 2 基础配置，可直接作为后续 SQLite、托盘和窗口行为开发入口。
- 设计需求文档位于 `docs/DESIGN.md`。

## 本地开发

```bash
pnpm install
pnpm tauri dev
```

## 下一步建议

1. 在 Rust 侧引入 SQLite 与设置存储。
2. 定义 `get_calendar`、`get_day_entry`、`save_day_entry` 等命令接口。
3. 将当前前端 mock 数据替换为真实后端返回。
