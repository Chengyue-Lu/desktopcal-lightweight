# DesktopCal Lightweight 0.1.0

## 版本定位
`0.1.0` 是当前项目的首个可打包基线版本。

这一版的目标不是做“全功能桌面日历”，而是完成一个足够稳定、可长期驻留桌面的最小闭环：
- 看日期
- 看最近几周安排
- 快速记录某天事项
- 本地保存
- 托盘常驻

## 功能范围
### 已实现
- 五周视图：当前周前 1 周、后 3 周
- 双击日期格进入原位扩展编辑态
- 紧凑任务输入与完成勾选
- 单日事项 SQLite 本地持久化
- 日期摘要与超出计数
- 托盘显示、隐藏、设置、退出
- 关闭主窗口自动隐藏到托盘
- 无边框、右上锚定、跳过任务栏
- 可配置窗口尺寸与右上偏移
- 开机自启动开关
- 自定义应用图标与托盘图标

### 未纳入本版本
- 云同步
- 多设备同步
- 标签、优先级、提醒、倒计时
- 富文本编辑
- 全局搜索
- 真正挂载到 Windows WorkerW 桌面层

## 当前交互模型
- 单击日期：选中
- 双击日期：进入编辑态
- 编辑态点击空白：自动保存并关闭
- `↑`：向前 2 周
- `↓`：向后 2 周
- `⌂`：回到今天所在窗口
- `⚙`：打开设置

## 默认参数
- 默认窗口大小：`1300 x 850`
- 默认锚点：主显示器工作区右上角
- 默认偏移：`右 5px / 上 5px`
- 默认运行形态：无边框、透明窗口、托盘常驻

## 存储说明
- 日程数据库：SQLite
- 设置存储：本地 JSON
- 事项内部存储格式：基于 markdown checkbox 的轻量序列化

## 打包说明
推荐命令：

```bash
pnpm tauri build
```

常见构建检查：
- Node / pnpm 可用
- Rust / cargo 可用
- Tauri CLI 可通过 `pnpm tauri` 调用
- 图标资源已放入 `src-tauri/icons`

默认构建产物目录：
- `src-tauri/target/release/bundle/`

## 已知问题
- 项目中仍有少量历史编码残留文案，后续应继续统一为正常中文
- 节假日仍是硬编码常量
- 桌面附着能力目前是“桌面挂件式”而不是真正嵌入桌面层

## 相关文件
- [README.md](/d:/lcy/desktopcal-lightweight-develop/README.md)
- [design.md](/d:/lcy/desktopcal-lightweight-develop/docs/design.md)
- [CHANGELOG.md](/d:/lcy/desktopcal-lightweight-develop/CHANGELOG.md)
