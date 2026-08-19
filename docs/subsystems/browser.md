# Browser Automation

English | [中文](browser.zh.md)

The browser automation seam — an optional host capability spanning the Service Definition ([`dsh-browser`](../../packages/browser/browser), `ctx.browser`), the Playwright provider ([`dsh-browser-playwright`](../../packages/browser/browser-playwright)), and the model-facing consumer ([`dsh-tool-browser`](../../packages/browser/tool-browser)). The provider owns direct CDP process startup and per-session daemon names; the consumer owns tool schemas and the replay-derived `browser/feed` projection. The client tab is documented by [`dsh-client-ui-browser`](../../packages/client/ui-browser/README.md).

Source: [`packages/browser/browser/src/index.ts`](../../packages/browser/browser/src/index.ts)

## Provider selection

`ctx.browser` resolves a provider when a command, help request, or session operation runs. A configured provider id must be registered and available. Without an id, exactly one available provider is selected; zero or multiple available providers produce a structured error. Registration is fiber-scoped, so unloading a provider removes it from future selection.

The shipped provider pins `@playwright/cli` and `playwright-core` together. Each DSH session maps to a sanitized `dsh-<sessionId>` Playwright session name, while the provider's `browserHome` owns the `.playwright` marker used to isolate the daemon registry. The dashboard is a Host child process bound to loopback and is exposed to optional clients through `host.describe.browser.dashboardUrl`. Dashboard startup and browser executable checks fail provider loading; direct service readers still treat an absent dashboard as optional.

Browser processes are spawned directly by the Host provider rather than through the shell sandbox because the GUI daemon cannot run under the shell's Seatbelt policy. This gives the provider process-level authority over browser state. Non-persistent profiles are the default; enabling persistent state carries the login authority of the configured Host into the browser session.

## Model-facing execution and replay

`dsh-tool-browser` registers `browser` and `browser_help`. A browser call carries one allowlisted CLI verb and bounded arguments, and returns the provider's bounded reply as `{ command, args, output }`. Native calls and Code Mode dispatches use the same provider and are recorded by the existing `tool/*` session events.

The `browser/feed` projection folds those durable events into newest-first rows containing the command, arguments, outcome, timestamp, and bounded result excerpt. It keeps pending native calls as `running` until their matching tool result arrives, handles settled Code Mode calls, caps rows, and derives a heuristic `open` flag from lifecycle verbs. A JSON-text tool argument from a durable log is parsed before the command is extracted; malformed arguments remain a neutral browser row rather than breaking replay. The projection is synchronous and replay-safe, so a reload reconstructs the action feed without the provider. The dashboard iframe is live state and is not replayed.

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
