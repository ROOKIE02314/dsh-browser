/**
 * Vocabulary for the browser capability seam (`ctx.browser`): the provider contract and the
 * normalized run/list results every browser backend shares. Providers execute CLI-style
 * commands against a stateful per-session browser and may expose a monitoring surface; the
 * seam resolves one usable provider at execution time.
 * @module @deepseek-ai/dsh-browser/types
 */

import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'

/**
 * One command run's normalized outcome. `output` is the backend's bounded text (or JSON) reply;
 * the provider enforces the byte bound, so the seam never forwards an unbounded reply.
 */
export interface BrowserRunResult {
  /** Bounded backend reply the model sees. */
  readonly output: string
}

/** One browser session as reported by a backend listing. */
export interface BrowserSessionInfo {
  /** Backend session name (`dsh-<sessionId>` for the playwright provider). */
  readonly name: string
  /** Current page URL, when the backend reports one. */
  readonly url?: string
  /** Current page title, when the backend reports one. */
  readonly title?: string
}

/**
 * One browser automation backend. Backends own their engine processes and per-session browser
 * state; the seam adds provider selection and error vocabulary, nothing else.
 */
export interface BrowserProvider {
  /** Stable registration id, used by the seam's `provider` config to pin selection. */
  readonly id: string
  /** Whether this backend can execute right now (browser binaries present and launchable). */
  available(): boolean
  /** The backend's command vocabulary reference (its CLI help text), cached by the backend. */
  help(): Promise<string>
  /**
   * Run one command in the named dsh session's browser; throws {@link BrowserError} on failure.
   * @param signal - optional cooperative cancellation from the calling tool execution.
   */
  run(sessionId: SessionId, command: string, args: readonly string[], signal?: AbortSignal): Promise<BrowserRunResult>
  /** List backend browser sessions with current page facts when the backend knows them. */
  sessions(): Promise<readonly BrowserSessionInfo[]>
  /** URL of the backend's monitoring dashboard, or undefined when none is serving. */
  dashboardUrl(): string | undefined
  /** Close the named dsh session's browser when it is open; idempotent. */
  close(sessionId: SessionId): Promise<void>
  /** Close every browser this backend owns (host shutdown); idempotent. */
  closeAll(): Promise<void>
}

/** Domain error for browser capability failures. */
export class BrowserError extends HarnessError {}
