/**
 * Pure types of the browser tool domain: the ONE home of the `browser/feed` projection-key
 * declaration plus the wire vocabulary it carries, free of host-side imports.
 * @module @deepseek-ai/dsh-tool-browser/types
 */

/** Settled state of one browser action in the feed. */
export type BrowserFeedOutcome = 'running' | 'ok' | 'error'

/** One feed row: a browser command with its bounded reply excerpt. */
export interface BrowserFeedEntry {
  /** Durable tool call id (native callId or code-dispatch subCallId). */
  readonly callId: string
  /** The playwright-cli verb that ran. */
  readonly action: string
  /** Positionals and `--flag=value` tokens, exactly as dispatched. */
  readonly args: readonly string[]
  /** Live state: `running` until the durable result lands, then `ok` or `error`. */
  readonly outcome: BrowserFeedOutcome
  /** Bounded tail of the reply (empty while running). */
  readonly excerpt: string
  /** Epoch milliseconds of the calling event. */
  readonly at: number
}

/**
 * The `browser/feed` projection value: the replay-derived action feed for one session plus a
 * heuristic "page open" flag (flipped by open/attach/close/detach commands).
 */
export interface BrowserFeed {
  /** Newest-first action rows, capped at the configured bound. */
  readonly entries: readonly BrowserFeedEntry[]
  /** True when the entry cap dropped older rows. */
  readonly truncated: boolean
  /** Whether the backend session has a page open, per the fold's last open/close command. */
  readonly open: boolean
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /**
     * Replay-derived feed of every browser tool action in this session (native and Code Mode
     * calls), newest first. The fold reads `tool/call` + `tool/result` pairs and settled
     * `tool/code-dispatch` events, so the value survives replay without the provider.
     */
    'browser/feed': BrowserFeed
  }
}
