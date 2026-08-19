# browser

English | [中文](README.zh.md)

This overlay enables the Playwright-backed browser capability in the Web bundle. It is intended for a trusted browser preset: the provider starts the CDP browser and dashboard directly from the Host process, outside the shell sandbox, and the `browser` tool is available to the session agent.

## Run it

Build the frontend and start the Web surface with the overlay:

```sh
pnpm run build
pnpm dsh web --patch examples/browser/cordis.yml
```

Open the printed URL, create or select a session, and ask the agent to use `browser open https://example.com`, `browser snapshot`, and a follow-up action such as `browser click e21`. The details column opens the Browser tab after the first action and shows the live Playwright dashboard when the provider is ready.

Manual login through the dashboard shares that session's cookies with later tool calls. Keep `persistent: false` unless the deployment explicitly accepts that login state remains available to the Host process.

## Scope

The overlay enables the three host rows; it does not define a separate agent preset format. A deployment that wants browser access only for selected sessions should copy this composition into its existing preset mechanism and keep the rows in the host plane. The dashboard binds to loopback and the action feed is replayable from the session log; the iframe itself is a live view and is not replayed.

## Model Experience

The session receives the `browser` and `browser_help` tools from [`dsh-tool-browser`](../../packages/browser/tool-browser/README.md). The browser tab is supplied by [`dsh-client-ui-browser`](../../packages/client/ui-browser/README.md).

## Known Limitations and Deferred Work

- The provider uses one Host `browserHome` and dashboard workspace for the process; per-workspace dashboard grouping is not exposed.
- A missing browser executable or dashboard startup failure stops the browser provider from loading; the error names the installation or port to correct.
- The dashboard is loopback-only and the direct Host spawn intentionally bypasses the shell sandbox; do not enable this overlay for an untrusted agent.
