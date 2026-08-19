# dsh-browser

English | [中文](README.zh.md)

`dsh-browser` is a browser-enabled source distribution of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It adds a Playwright-backed, session-scoped browser capability to the DSH Web UI: the agent can open pages, inspect snapshots, interact with elements, and retain cookies within its own session.

This repository is an independent community distribution, not an official DeepSeek release. It contains only committed open-source source files; browser profiles, downloads, screenshots, credentials, and local configuration are excluded.

## Browser demo

The video below demonstrates a DSH agent using this harness to search public web pages, inspect browser snapshots, and interact with the rendered page.

https://github.com/user-attachments/assets/03d771ff-a1d8-4df8-b34c-3dda8e8c0617

## Run

### Run from source

The browser packages are not yet published independently on npm, so install this repository from source.

```sh
git clone https://github.com/ROOKIE02314/dsh-browser.git
cd dsh-browser
pnpm install --frozen-lockfile
pnpm --filter @deepseek-ai/dsh-browser-playwright exec playwright-cli install-browser
pnpm run build
pnpm dsh web --patch examples/browser/cordis.yml
```

Requirements: Node.js `^22.19.0 || >=24`, pnpm 11.7.0, and either the browser installed by the command above or a supported local Google Chrome. Open the URL printed by `dsh web`, create a session, then ask the agent to run `browser open https://example.com`, `browser snapshot`, and `browser click e21`.

`examples/browser/cordis.yml` enables the `browser`, `browser-playwright`, and `tool-browser` rows. They stay disabled in the ordinary Web profile, so browser automation is an explicit opt-in.

## Security

The Playwright browser is a Host process and does not run inside DSH's shell sandbox. It can reach sites visible to the Host and, after sign-in, act with that account's authority. Enable it only for agents you trust.

- Keep `persistent: false` unless retaining browser login state after a restart is intentional.
- The dashboard binds to loopback by default; do not expose it through a public proxy.
- Do not put browser profiles, screenshots, downloads, cookies, API keys, or `.env` files in Git. The repository ignores the standard local browser directories, but review `git status` before every commit.

See [the browser example](examples/browser/README.md) for the Web UI flow, [the browser subsystem reference](docs/subsystems/browser.md) for the capability design, and [the Playwright provider README](packages/browser/browser-playwright/README.md) for configuration.

## Community contributions

The code is organized as a DSH capability seam:

- `packages/browser/browser` defines `ctx.browser` and provider selection.
- `packages/browser/browser-playwright` provides the pinned Playwright CLI backend.
- `packages/browser/tool-browser` adds model-facing `browser` and `browser_help` tools.
- `packages/client/ui-browser` renders the replayable action feed and live dashboard.

Additional browser providers are welcome. Keep provider processes and session state in the provider package; keep the model-facing tool schema provider-neutral. Read [the architecture guide](docs/architecture.md) before changing packages.

## License and provenance

The source is distributed under the [MIT License](LICENSE). It is derived from DeepSeek Harness at source commit `5bb9087465203c46704a9a7ccfa0588d6db7bcb4`; [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) records dependency licenses.
