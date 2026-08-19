# @deepseek-ai/dsh-browser-playwright

English | [中文](README.zh.md)

playwright-cli provider for the [browser capability seam](../browser/README.md): spawns the pinned `@playwright/cli` against a dedicated daemon bucket and serves the `show` dashboard whose live screencast the web GUI embeds (`dsh-client-ui-browser`). The model-facing consumer is [`dsh-tool-browser`](../tool-browser/README.md).

## What this package owns

- **Pinned CLI** — depends on `@playwright/cli@0.1.17` (playwright-core `1.62.0-alpha-1783623505000`); the provider runs `<cli>/playwright-cli.js` with `process.execPath` from its own dependency tree, never the user's global install.
- **Isolated daemon bucket** — every invocation runs with cwd `browserHome` (default `<process cwd>/.dsh-browser`), which contains a `.playwright` marker, so playwright's registry keys sessions under this directory and never mixes with other playwright-cli usage on the machine. `close-all` therefore only touches dsh-owned browsers.
- **Per-session naming** — each dsh session maps to backend session `<sessionPrefix>-<sessionId>` via `-s=`, so parallel dsh sessions never share browser state. Cookie state persists across commands within a backend session; `persistent: true` additionally survives restarts (`open --persistent`).
- **Dashboard** — `playwright-cli show --port=<dashboard.port> --host=<dashboard.host>` runs from `browserHome` in its own process group. The provider keeps the CLI's parent-liveness stdin pipe open, accepts the dashboard root's normal redirect as HTTP readiness, and tears the group down on dispose. The Cordis plugin awaits readiness and fails loading on a startup error; direct optional readers still receive `undefined` until the dashboard is serving.
- **Spawn posture** — browser processes are spawned directly by this host plugin, never through the shell sandbox, which cannot host GUI browsers. This is deliberate: a CDP browser is an unconfined GUI process, so `persistent` login state carries the user's real authority on closed sites. Defaults stay non-persistent; mount this row only in compositions whose agent you trust to browse.

## Config

```yaml
- id: browser-playwright
  name: '@deepseek-ai/dsh-browser-playwright'
  config:
    dashboard: { enabled: true, port: 12789, host: '127.0.0.1' }
    persistent: false
    sessionPrefix: dsh
    requireBrowser: true
    maxOutputBytes: 65536
    timeoutMs: 120000
```

- `requireBrowser: true` fails plugin load when neither a playwright-managed browser build nor a system Chrome candidate exists; the error names `playwright-cli install-browser` as the fix. Set it false (tests, deferred install) to move the failure to the first `open`.
- `cliPath` overrides the pinned entry (tests point it at a fixture script); `browserHome` overrides the daemon bucket directory.
- One CLI reply is capped at `maxOutputBytes` across stdout+stderr with a truncation marker; `timeoutMs` bounds each command before SIGTERM/SIGKILL.

## Error codes

`BROWSER_UNKNOWN_COMMAND`, `BROWSER_INVALID_ARGS`, `BROWSER_COMMAND_TIMEOUT`, `BROWSER_COMMAND_ABORTED`, `BROWSER_COMMAND_FAILED` (message carries the CLI's bounded reply, which names the real cause such as a missing browser or a closed session).

## Model Experience

Indirectly, through [`dsh-tool-browser`](../tool-browser/README.md), which renders this provider's bounded replies and failure messages into model context; this package touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Dashboard readiness identifies HTTP availability only** — a port already answering HTTP is accepted as ready even if another process owns it; the dashboard cannot identify itself. The bind defaults to a loopback port this repository does not otherwise use.
- **`sessions()` reports dsh-owned names only** — the mirror records backend sessions this provider ran commands for; URL/title facts stay unknown until the CLI gains a parseable `list` format.
- **`close` treats "is not open" as success** — matching text, not exit semantics; a future CLI may reword that diagnostic.
- **Browser builds are version-locked** — upgrading the pinned CLI requires `playwright-cli install-browser` for the matching builds and a recheck of the `BROWSER_COMMANDS` allowlist in [cli.ts](src/cli.ts).
