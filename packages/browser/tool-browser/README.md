# @deepseek-ai/dsh-tool-browser

English | [中文](README.zh.md)

Model-facing `browser` and `browser_help` tools over the [browser capability seam](../browser/README.md), plus the `browser/feed` session projection the web GUI's browser panel renders. This package owns schemas, validation, presentation, and the feed vocabulary — never a concrete backend.

## Tools

- `browser` — `{ command, args? }`: run one playwright-cli verb against this session's CDP browser and return its bounded reply. The backend keeps cookies and page state across calls within the session. `snapshot` returns element refs (e.g. `e21`) for `click`/`fill`/`check` targets.
- `browser_help` — returns the backend's command reference (the pinned CLI's `--help` text, cached by the provider).

Both tools fail with the provider's `BrowserError` codes when no backend is usable, the browser is missing, a command is unknown, or the CLI exits non-zero; the message carries the CLI's bounded reply so the model self-corrects.

## `browser/feed` projection

Key `browser/feed`, value `{ entries, truncated, open }`. The unit folds the session log only:

- a `tool/call` for a browser tool prepends a `running` row;
- its `tool/result` finalizes that exact row with `ok`/`error` and a bounded reply excerpt;
- a settled `tool/code-dispatch` (Code Mode `await tools.browser(...)`) lands fully formed, so Code Mode calls appear in the feed without native cards;
- `open`/`attach` set `open: true`, `close`/`detach` set `open: false` (a heuristic over commands, not a backend query).

Rows are capped at `maxFeedEntries` (oldest dropped, `truncated` sticks); excerpts are capped at `feedExcerptChars`. The value is pure replay mathematics, so the panel renders identically after a reload with or without the provider.

## Config

```yaml
- id: tool-browser
  name: '@deepseek-ai/dsh-tool-browser'
  config:
    enabled: true
    maxFeedEntries: 200
    feedExcerptChars: 512
    timeoutMs: 125000
```

## Model Experience

### Request context and condition

#### What the model sees

Two tool schemas (`browser`, `browser_help`) join prompt assembly whenever this row is mounted; their exact model-facing shape lives in the generated [tool catalog](../../../docs/tool-catalog.md) under this package's name. Per-call, the model sees the backend's bounded reply (or a `BrowserError` message carrying it).

#### Token effect

Conditional on call: each command reply is capped at the provider's `maxOutputBytes` (default 65536) with a truncation marker; failed calls carry the same bound in the error message.

#### KV Cache effect

Append-only per call: the fixed schema and descriptions stay prefix-stable while the package is mounted; mounting or unmounting the row, or changing its `enabled` flag, replaces the tool assembly and invalidates reuse.

## Known Limitations and Deferred Work

- **`open` is a command heuristic** — the flag does not reflect tab detach/reload edge cases; a backend query for real page state belongs to a future provider capability.
- **Feed rows live only while the projection registry is composed** — headless assemblies without `dsh-session-projection` simply omit the feed; the tools keep working.
- **No per-tool system-prompt guidance section** — the tool descriptions carry the workflow (snapshot before click); a dedicated section belongs to a preset that wants stronger steering.
