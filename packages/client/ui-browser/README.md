# @deepseek-ai/dsh-client-ui-browser

English | [中文](README.zh.md)

Web client plugin for the browser details view. It registers a `browser` entry in `conversation.details.view`, embeds the loopback Playwright dashboard advertised by `host.describe`, and renders the replay-derived `browser/feed` projection from the session runtime. The host capability remains optional: without a dashboard URL the tab shows an unavailable state while the feed can still render from durable history.

## Details view

The entry is session-scoped and receives the standard details-view owner props (`activeView` and `onSelectView`) plus the session projection hook and the injected `hostDescription` observable. The details shell keeps registered views mounted and hides inactive views with CSS so the browser entry can observe the first feed row while the details column is closed. On that transition it selects the Browser tab and calls the layout opener once for the session.

The upper panel is an iframe over the provider's loopback dashboard. It is a live control surface for screencast, mouse, keyboard, and manual login; it is explicitly not part of session replay. The lower panel lists newest-first actions with their state, arguments, timestamp, and bounded result excerpt. Error rows and projection truncation remain visible.

## Configuration and composition

The package has no user configuration. Add the `dsh.client` row to a Web roster. It is safe to keep mounted when the Host browser rows are disabled; the tab then reports that the dashboard is unavailable and the projection remains absent until a host feed is supplied.

## Model Experience

None, as [`dsh-tool-browser`](../../browser/tool-browser/README.md) owns the `browser` and `browser_help` tools and this package only renders their user-visible results.

#### KV Cache effect

None. The package contributes no model request content.

## Known Limitations and Deferred Work

- **Live dashboard only** — refresh reconstructs the action feed, not the browser's live page state; the iframe reconnects to the current Host dashboard.
- **Loopback dashboard** — the Host intentionally advertises a loopback URL and the client does not proxy it through `/api`; remote dashboard exposure is outside this package.
- **Mounted-view watcher** — inactive browser views stay mounted to support auto-open, so the component uses CSS hiding instead of `renderSlot(..., { only })` for this details list.
