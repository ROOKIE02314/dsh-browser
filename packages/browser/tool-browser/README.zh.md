# @deepseek-ai/dsh-tool-browser

[English](README.md) | 中文

基于 [browser capability seam](../browser/README.md) 的面向模型工具 `browser` 与 `browser_help`，以及 Web GUI 浏览器面板渲染所用的 `browser/feed` 会话投影。本包拥有 schema、校验、呈现与 feed 词汇——从不拥有具体后端。

## 工具

- `browser` — `{ command, args? }`：对本会话的 CDP 浏览器执行一条 playwright-cli 命令并返回有界回复。后端在同一会话内跨调用保留 cookie 与页面状态。`snapshot` 返回元素 ref（如 `e21`），供 `click`/`fill`/`check` 定位。
- `browser_help` — 返回后端命令参考（锁定 CLI 的 `--help` 文本，由提供者缓存）。

后端不可用、浏览器缺失、命令未知或 CLI 非零退出时，两个工具都以提供者的 `BrowserError` 码失败；消息携带 CLI 的有界回复，便于模型自我纠正。

## `browser/feed` 投影

键 `browser/feed`，值 `{ entries, truncated, open }`。单元只折叠会话日志：

- 浏览器工具的 `tool/call` 前置插入一行 `running`；
- 其 `tool/result` 把该行定稿为 `ok`/`error` 并附有界回复摘录；
- 已定稿的 `tool/code-dispatch`（Code Mode 里 `await tools.browser(...)`）直接落成完整行，因此 Code Mode 调用无需原生卡片也出现在 feed 中；
- `open`/`attach` 置 `open: true`，`close`/`detach` 置 `open: false`（对命令的启发式，不是后端查询）。

行数以 `maxFeedEntries` 封顶（丢弃最旧，`truncated` 置位）；摘录以 `feedExcerptChars` 封顶。值是纯重放数学，因此面板在刷新后无论有无提供者都渲染一致。

## 配置

```yaml
- id: tool-browser
  name: '@deepseek-ai/dsh-tool-browser'
  config:
    enabled: true
    maxFeedEntries: 200
    feedExcerptChars: 512
    timeoutMs: 125000
```

## 模型体验

### 请求上下文与条件

#### 模型看到什么

本行挂载时，两个工具 schema（`browser`、`browser_help`）加入 prompt 组装；其精确的模型可见形状在生成的 [tool catalog](../../../docs/tool-catalog.md) 中按本包名登记。每次调用时，模型看到后端的有界回复（或携带该回复的 `BrowserError` 消息）。

#### Token 效应

按调用条件触发：每条命令回复以提供者的 `maxOutputBytes`（默认 65536）封顶并带截断标记；失败调用的错误消息受同一上界约束。

#### KV Cache 效应

按调用追加：固定的 schema 与描述在包挂载期间保持前缀稳定；挂载/卸载本行或改变其 `enabled` 标志会替换工具组装并失效复用。

## 已知限制与待办

- **`open` 是命令启发式** — 该标志不反映 tab detach/reload 等边界情形；真实页面状态的后端查询属于未来提供者能力。
- **feed 行只在投影注册表被组合时存在** — 没有 `dsh-session-projection` 的无头组装直接省略 feed；工具不受影响。
- **没有 per-tool 的 system-prompt 引导段** — 工具描述承载了工作流（先 snapshot 再 click）；需要更强引导的预设可自行添加专属段落。
