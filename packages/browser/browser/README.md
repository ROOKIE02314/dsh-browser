# @deepseek-ai/dsh-browser

English | [中文](README.zh.md)

Service Definition for the browser automation capability seam (`ctx.browser`): a provider registry plus execution-time selection for CDP-driven browser control. Providers register by stable id and own their engine processes; the seam adds selection and error vocabulary, nothing else. The first provider is [`dsh-browser-playwright`](../browser-playwright/README.md) (the `playwright-cli` backend); the model-facing consumer is [`dsh-tool-browser`](../tool-browser/README.md).

## Service: `BrowserRuntime` (ctx key: `browser`)

### Public API

- `ctx.browser.register(provider: BrowserProvider): () => void` Register one backend; the registration dies with the registering fiber. Duplicate ids throw `BROWSER_DUPLICATE_PROVIDER`.
- `ctx.browser.run(sessionId, command, args, signal?): Promise<BrowserRunResult>` Run one command in the named dsh session's browser through the selected provider.
- `ctx.browser.help(): Promise<string>` The selected backend's command vocabulary reference (its CLI help text).
- `ctx.browser.sessions(): Promise<readonly BrowserSessionInfo[]>` List backend browser sessions with current page facts when known.
- `ctx.browser.dashboardUrl(): string | undefined` Monitoring dashboard URL of the selected provider, or undefined when none is serving. Deliberately non-throwing for optional readers such as `host.describe`.
- `ctx.browser.close(sessionId): Promise<void>` Close the named dsh session's browser when it is open.
- `ctx.browser.closeAll(): Promise<void>` Close every browser the selected backend owns (host shutdown).

### Selection semantics

Resolved at execution time, never order-dependent: a configured `provider` id that is registered and available wins; a configured id not registered throws `BROWSER_PROVIDER_CONFIGURED_MISSING`, a configured id registered but unavailable throws `BROWSER_PROVIDER_CONFIGURED_UNAVAILABLE`. With no id configured, exactly one usable provider auto-selects; multiple usable providers throw `BROWSER_PROVIDER_AMBIGUOUS`; none throws `BROWSER_PROVIDER_UNAVAILABLE`.

### Key types

- `BrowserProvider` — `{ id, available(), help(), run(), sessions(), dashboardUrl(), close(), closeAll() }`: one browser automation backend owning its engine processes and per-session browser state.
- `BrowserRunResult` — `{ output }`: the backend's bounded text (or JSON) reply.
- `BrowserSessionInfo` — `{ name, url?, title? }`: one backend session as reported by a listing.

## Model Experience

None, as the seam resolves providers and forwards their output; `dsh-tool-browser` owns the model-facing vocabulary and any context effect.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **One provider family today** — the playwright backend is the only registered provider; selection semantics exist for the seam contract and are exercised by tests, not by a second shipped backend.
- **`available()` is a provider claim** — the seam checks it per call and never probes the engine itself; a backend that overstates readiness fails at `run()` time instead.
