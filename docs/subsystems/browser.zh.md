# 浏览器自动化

[English](browser.md) | 中文

浏览器自动化 seam 是一项可选的 Host 能力，横跨 Service Definition（[`dsh-browser`](../../packages/browser/browser)，`ctx.browser`）、Playwright 提供方（[`dsh-browser-playwright`](../../packages/browser/browser-playwright)）和面向模型的消费方（[`dsh-tool-browser`](../../packages/browser/tool-browser)）。提供方负责直接启动 CDP 进程与按会话命名的 daemon；消费方负责工具 schema 与可重放的 `browser/feed` 投影。客户端标签页见 [`dsh-client-ui-browser`](../../packages/client/ui-browser/README.md)。

源码：[`packages/browser/browser/src/index.ts`](../../packages/browser/browser/src/index.ts)

## 提供方选择

`ctx.browser` 在命令、help 请求或会话操作执行时解析提供方。配置了提供方 id 时，该 id 必须已注册且可用；未配置 id 时，只有一个可用提供方才会被选中；零个或多个可用提供方会产生结构化错误。注册随 fiber 作用域生效，提供方卸载后不再参与后续选择。

内置提供方将 `@playwright/cli` 与 `playwright-core` 精确锁定为一组。每个 DSH 会话对应一个清洗后的 `dsh-<sessionId>` Playwright 会话名；provider 的 `browserHome` 持有 `.playwright` 标记，用于隔离 daemon registry。dashboard 是绑定回环地址的 Host 子进程，并通过 `host.describe.browser.dashboardUrl` 向可选客户端暴露。dashboard 启动失败或浏览器可执行文件检查失败会阻止 provider 加载；直接读取 Host 服务时，dashboard 缺失仍按可选能力处理。

由于 GUI daemon 无法在 shell 的 Seatbelt 策略下运行，浏览器进程由 Host provider 直接启动，而不是经由 shell sandbox。这使 provider 在进程级拥有浏览器状态的管理权限。默认使用非持久 profile；启用持久状态会把 Host 配置的登录权限带入浏览器会话。

## 面向模型的执行与回放

`dsh-tool-browser` 注册 `browser` 与 `browser_help`。一次 browser 调用携带一个经过 allowlist 校验的 CLI 动词和有界参数，并将 provider 的有界回复作为 `{ command, args, output }` 返回。原生调用与 Code Mode dispatch 使用同一 provider，并通过现有 `tool/*` 会话事件记录。

`browser/feed` 投影将这些持久事件折叠为按时间倒序的动作行，包含命令、参数、结果状态、时间戳和有界结果摘录。原生调用在对应 tool result 到达前保持 `running`，已完成的 Code Mode 调用也会进入投影；行数有上限，`open` 则由生命周期动词推导。持久日志中的 JSON 文本参数会在提取命令前解析；格式错误的参数会产生中性的 browser 行，不会破坏回放。投影是同步且可安全重放的，刷新页面后无需 provider 即可重建动作流。dashboard iframe 显示实时状态，不参与回放。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxbrowser--browserruntime"></a>

### `ctx.browser` — `BrowserRuntime`

The browser capability service. Registered as `ctx.browser` (one instance per context).

Selection semantics (resolved at execution time, never order-dependent):

- A configured id that is registered and `available()` → that provider.
- A configured id not registered → BROWSER_PROVIDER_CONFIGURED_MISSING.
- A configured id registered but unavailable → BROWSER_PROVIDER_CONFIGURED_UNAVAILABLE.
- No id configured, exactly one registered usable provider → that provider.
- No id configured, multiple usable providers → BROWSER_PROVIDER_AMBIGUOUS.
- No id configured, no usable provider → BROWSER_PROVIDER_UNAVAILABLE.

```ts cordis-catalog
/**
 * Register one backend; the registration dies with the registering fiber.
 * @param provider - the backend to register under its own id.
 * @returns the registration's disposer.
 */
register(provider: BrowserProvider): () => void

/**
 * Run one command in the named dsh session's browser through the selected provider.
 * @param sessionId - owning dsh session (keys the backend's per-session browser).
 * @param command - backend command verb.
 * @param args - positionals and `--flag=value` tokens, appended after the verb.
 * @param signal - optional cooperative cancellation forwarded to the provider.
 * @returns the provider's bounded reply.
 */
async run(sessionId: SessionId, command: string, args: readonly string[], signal?: AbortSignal): Promise<BrowserRunResult>

/**
 * The selected backend's command vocabulary reference.
 * @returns the backend's CLI help text.
 */
async help(): Promise<string>

/**
 * List backend browser sessions with current page facts when known.
 * @returns the selected provider's session listing.
 */
async sessions(): Promise<readonly BrowserSessionInfo[]>

/**
 * Monitoring dashboard URL of the selected provider, or undefined when the capability is
 * absent or no dashboard is serving. Deliberately non-throwing: readers such as
 * `host.describe` treat the dashboard as an optional surface.
 * @returns the dashboard URL when present.
 */
dashboardUrl(): string | undefined

/**
 * Close the named dsh session's browser when it is open.
 * @param sessionId - owning dsh session.
 */
async close(sessionId: SessionId): Promise<void>

/** Close every browser the selected backend owns (host shutdown). */
async closeAll(): Promise<void>
```

Types: [SessionId](core.md)

Source: [`packages/browser/browser/src/index.ts:58`](../../packages/browser/browser/src/index.ts)
<!-- END GENERATED cordis-surface -->
