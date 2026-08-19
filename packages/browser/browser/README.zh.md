# @deepseek-ai/dsh-browser

[English](README.md) | 中文

浏览器自动化 capability seam（`ctx.browser`）的服务定义：提供者注册表与执行期选择，用于通过 CDP 驱动浏览器。提供者以稳定 id 注册并自管引擎进程；seam 只负责选择与错误词汇。第一个提供者是 [`dsh-browser-playwright`](../browser-playwright/README.md)（playwright-cli 后端）；面向模型的消费方是 [`dsh-tool-browser`](../tool-browser/README.md)。

## 服务：`BrowserRuntime`（ctx 键：`browser`）

### 公开 API

- `ctx.browser.register(provider: BrowserProvider): () => void` 注册一个后端；注册随注册方 fiber 一起销毁。重复 id 抛 `BROWSER_DUPLICATE_PROVIDER`。
- `ctx.browser.run(sessionId, command, args, signal?): Promise<BrowserRunResult>` 经选中的提供者在指定 dsh 会话的浏览器里执行一条命令。
- `ctx.browser.help(): Promise<string>` 选中后端的命令词汇参考（其 CLI 帮助文本）。
- `ctx.browser.sessions(): Promise<readonly BrowserSessionInfo[]>` 列出后端浏览器会话及已知的当前页面信息。
- `ctx.browser.dashboardUrl(): string | undefined` 选中提供者的监控面板 URL；没有面板服务时为 undefined。对 `host.describe` 这类可选读取方故意不抛错。
- `ctx.browser.close(sessionId): Promise<void>` 关闭指定 dsh 会话的浏览器（若已打开）。
- `ctx.browser.closeAll(): Promise<void>` 关闭所选后端拥有的全部浏览器（宿主关闭时）。

### 选择语义

执行期解析、与注册顺序无关：配置的 `provider` id 已注册且可用则胜出；配置的 id 未注册抛 `BROWSER_PROVIDER_CONFIGURED_MISSING`，已注册但不可用抛 `BROWSER_PROVIDER_CONFIGURED_UNAVAILABLE`。未配置 id 时，恰好一个可用提供者自动选中；多个可用抛 `BROWSER_PROVIDER_AMBIGUOUS`；没有可用抛 `BROWSER_PROVIDER_UNAVAILABLE`。

### 关键类型

- `BrowserProvider` — `{ id, available(), help(), run(), sessions(), dashboardUrl(), close(), closeAll() }`：一个浏览器自动化后端，自管引擎进程与按会话的浏览器状态。
- `BrowserRunResult` — `{ output }`：后端返回的有界文本（或 JSON）回复。
- `BrowserSessionInfo` — `{ name, url?, title? }`：列表中的一条后端会话记录。

## 模型体验

无，seam 只负责解析提供者并转发其输出；面向模型的词汇与上下文效应由 `dsh-tool-browser` 承担。

#### KV Cache 效应

无；本包不组装也不发送提供者请求。

## 已知限制与待办

- **目前只有一个提供者家族** — playwright 后端是唯一注册的提供者；选择语义为 seam 契约而存在并由测试覆盖，而非由第二个已发布的端支撑。
- **`available()` 是提供者自己的声明** — seam 每次调用时检查它，但从不亲自探测引擎；夸大就绪状态的后端会在 `run()` 时失败。
