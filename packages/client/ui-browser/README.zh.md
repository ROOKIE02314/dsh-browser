# @deepseek-ai/dsh-client-ui-browser

[English](README.md) | 中文

浏览器 details 视图的 Web 客户端插件。它在 `conversation.details.view` 中注册 `browser` 配置项，嵌入 `host.describe` 公布的回环 Playwright dashboard，并从 session runtime 渲染可重放的 `browser/feed` 投影。Host 浏览器能力仍是可选的：没有 dashboard URL 时标签页显示不可用状态，但仍可渲染来自持久历史的动作流。

## Details 视图

该配置项按 session 作用域注册，接收标准 details-view owner props（`activeView` 与 `onSelectView`），以及 session projection hook 和注入的 `hostDescription` observable。details shell 会保持已注册视图挂载，并使用 CSS 隐藏非活动视图，因此 browser 配置项可以在 details 栏关闭时观察第一条动作流记录。发生从空到非空的变化时，它会为当前 session 选择 Browser 标签并调用一次 layout opener。

上方区域是 provider 回环 dashboard 的 iframe，用于实时 screencast、鼠标、键盘和手动登录；它明确不参与会话回放。下方区域按时间倒序展示动作、状态、参数、时间戳和有界结果摘录；失败行与投影截断状态都会保留。

## 配置与组合

本包没有用户配置。将 `dsh.client` 行加入 Web roster 即可。即使 Host 浏览器行被禁用，本包也可以保持挂载；此时标签页会说明 dashboard 不可用，Host 提供 feed 后才会出现动作流。

## Model Experience

本包不改变模型体验：`browser` 与 `browser_help` 工具由 [`dsh-tool-browser`](../../browser/tool-browser/README.md) 负责，本包只渲染这些调用的用户可见结果。

#### KV Cache effect

无。本包不向模型请求增加内容。

## 已知限制与后续工作

- **dashboard 只提供实时视图** ——刷新会重建动作流，但不会恢复浏览器当前页面；iframe 会重新连接当前 Host dashboard。
- **dashboard 仅限回环** ——Host 有意公布回环 URL，客户端不通过 `/api` 代理它；远程 dashboard 暴露不属于本包范围。
- **保持挂载以支持 watcher** ——非活动 browser 视图保持挂载以支持自动打开，因此 details 列表使用 CSS 隐藏，而不是 `renderSlot(..., { only })`。
