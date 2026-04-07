# DesktopCal Lightweight

`DesktopCal Lightweight` 是一个基于 `Tauri 2 + React + TypeScript + Rust + SQLite` 的轻量桌面日历工具，当前发布线版本为 `0.1.0`。

它面向“常驻桌面、快速查看、快速记录”的个人使用场景，核心体验是：

- 五周窗口视图，默认展示当前周前 1 周、后 3 周
- 双击日期原位进入紧凑编辑态
- 事项按纯文本编号输入，支持完成状态切换
- 数据本地持久化，不依赖账号、网络或同步服务
- 托盘常驻、右上锚定、无原生边框

## 版本

- 应用版本：`0.1.0`
- 前端版本：见 [package.json](/d:/lcy/desktopcal-lightweight-develop/package.json)
- Tauri 配置版本：见 [tauri.conf.json](/d:/lcy/desktopcal-lightweight-develop/src-tauri/tauri.conf.json)
- Rust crate 版本：见 [Cargo.toml](/d:/lcy/desktopcal-lightweight-develop/src-tauri/Cargo.toml)

## 当前能力

- 五周滚动日历视图，支持 `↑ / ↓ / ⌂`
- 日期格摘要展示，超出条目显示 `+N`
- 双击日期进入编辑态，点击空白自动保存并关闭
- 紧凑任务编辑：回车新增、退格删空行、完成勾选
- SQLite 本地存储
- 设置项：窗口宽高、右偏移、上偏移、开机自启动
- 托盘：显示、隐藏、设置、退出
- 关闭窗口时隐藏到托盘而不是退出

## 当前限制

- 当前为 Windows 优先实现
- 节假日仍是内置静态数据，不是独立可配置数据源
- 还没有真正挂到 WorkerW/桌面图标层之后
- 仍有少量历史文案编码残留，后续需要继续清理

默认构建产物会输出到 `src-tauri/target/release/bundle/`。

## 目录说明

- [src](/d:/lcy/desktopcal-lightweight-develop/src)：React 前端界面与交互
- [src-tauri](/d:/lcy/desktopcal-lightweight-develop/src-tauri)：Rust 后端、托盘、窗口与打包配置
- [docs/design.md](/d:/lcy/desktopcal-lightweight-develop/docs/design.md)：产品设计文档
- [docs/RELEASE-0.1.0.md](/d:/lcy/desktopcal-lightweight-develop/docs/RELEASE-0.1.0.md)：当前版本说明
- [CHANGELOG.md](/d:/lcy/desktopcal-lightweight-develop/CHANGELOG.md)：开发变更记录
