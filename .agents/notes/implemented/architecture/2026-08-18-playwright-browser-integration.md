# Agent Note: Playwright browser capability and Web details view

Status: implemented

English | [中文](2026-08-18-playwright-browser-integration.zh.md)

## Problem

The harness needs a session-bound browser tool for CDP browsing and a Web details view that exposes both the live Playwright dashboard and a reload-safe action history. The browser daemon writes process-owned state that cannot run through the shell sandbox, while the dashboard and provider registry are host-process resources rather than per-session services.

## Decision

The browser capability is split into `dsh-browser` (Service Definition), `dsh-browser-playwright` (Provider), and `dsh-tool-browser` (Consumer). The provider starts the pinned Playwright CLI and dashboard directly from the Host process, isolates sessions through `browserHome` and sanitized `dsh-<sessionId>` names, binds the dashboard to loopback, holds the CLI's parent-liveness stdin pipe open, accepts the dashboard root's normal redirect as HTTP readiness, and fails its plugin load when browser availability or dashboard readiness is invalid. The default profile is non-persistent because a persistent profile carries the configured Host user's login authority.

The consumer records no new session event. It folds existing `tool/call`, `tool/result`, and `tool/code-dispatch` records into the synchronous `browser/feed` projection, including JSON-text durable arguments, bounded excerpts, pending status, and replay-safe row limits. The Host `host.describe` response publishes the optional dashboard URL without making browser capability mandatory.

The Web client adds `conversation.details.view` as a session-scoped list. The DetailsPanel keeps the built-in tool output in its existing `conversation.details.tool` child and exposes optional non-tool views through the new list; `ui-browser` contributes the `browser` entry, embeds the optional dashboard, and renders the feed. Optional view entries remain mounted and inactive entries are CSS-hidden so the browser component can observe the first feed row and select/open its tab automatically.

The Web bundle keeps the three host rows disabled and always includes the client row. A browser overlay enables the host rows for a trusted deployment. This keeps host-process singletons out of ordinary Web sessions while preserving one client composition that degrades to an unavailable dashboard when the capability is absent.

## Alternatives considered

**Run Playwright through the shell or subprocess capability.** This loses the browser daemon's required host filesystem and GUI process behavior under the shell sandbox, so the provider owns direct child-process startup and documents the resulting trust posture.

**Add browser-specific session events.** Existing tool call, result, and Code Mode dispatch records already carry the model-visible browser operation and result. A projection over those records preserves the session format and makes native and Code Mode calls converge without a second durable vocabulary.

**Render only the active details entry.** The standard `only` dispatch would prevent an inactive browser entry from observing a feed transition and opening the panel. The details list therefore keeps entries mounted and uses CSS visibility for this watcher-sensitive list; the package README records this scoped exception.

## Consequences

The host process can launch a GUI browser even when shell execution is confined, so enabling the provider is a deliberate trust decision. Dashboard startup is a load-time dependency when enabled, and its loopback URL is not a remote access mechanism. Action history survives reload through the session log, but the dashboard iframe always reflects live browser state. The client tab can be mounted without host browser rows and reports capability absence instead of changing the base Web composition.

## Verification

Provider lifecycle and CLI tests cover the direct spawn path and dashboard teardown; browser tool and projection tests cover schema validation, native and replayed calls, Code Mode dispatch, bounds, and durable JSON arguments. Client and host TypeScript aggregates include the new package and the Web bundle roster includes the disabled host rows plus the client row.
