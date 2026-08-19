/**
 * Pure CLI vocabulary of the playwright backend: the command allowlist (mirrored from
 * playwright-cli's help.json), session-name sanitization, and argv defaults. Keep the
 * allowlist in sync with the pinned `@playwright/cli` version.
 * @module @deepseek-ai/dsh-browser-playwright/cli
 */

/** Every verb the pinned playwright-cli accepts, mirrored from its help.json. */
export const BROWSER_COMMANDS: readonly string[] = [
  'open', 'attach', 'close', 'detach', 'goto', 'type', 'click', 'dblclick', 'fill', 'drag',
  'drop', 'hover', 'select', 'upload', 'check', 'uncheck', 'snapshot', 'find', 'eval', 'console',
  'dialog-accept', 'dialog-dismiss', 'resize', 'run-code', 'delete-data', 'go-back', 'go-forward',
  'reload', 'press', 'keydown', 'keyup', 'mousemove', 'mousedown', 'mouseup', 'mousewheel',
  'screenshot', 'pdf', 'tab-list', 'tab-new', 'tab-close', 'tab-select', 'state-load', 'state-save',
  'cookie-list', 'cookie-get', 'cookie-set', 'cookie-delete', 'cookie-clear', 'localstorage-list',
  'localstorage-get', 'localstorage-set', 'localstorage-delete', 'localstorage-clear',
  'sessionstorage-list', 'sessionstorage-get', 'sessionstorage-set', 'sessionstorage-delete',
  'sessionstorage-clear', 'requests', 'request', 'request-headers', 'request-body',
  'response-headers', 'response-body', 'route', 'route-list', 'unroute', 'network-state-set',
  'config-print', 'install', 'install-browser', 'tracing-start', 'tracing-stop', 'video-start',
  'video-stop', 'video-chapter', 'video-show-actions', 'video-hide-actions', 'show', 'pause-at',
  'resume', 'step-over', 'generate-locator', 'highlight', 'list', 'close-all', 'kill-all', 'tray',
]

/** Commands that address the whole backend rather than one session. */
export const BROWSER_GLOBAL_COMMANDS: readonly string[] = ['close-all', 'kill-all']

/** Default bound on one CLI reply, including the failure marker when cut. */
export const BROWSER_DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024

/** Default per-command wall-clock budget before the child is terminated. */
export const BROWSER_DEFAULT_TIMEOUT_MS = 120_000

/** Marker file/dir that makes playwright-cli treat a directory as its workspace root. */
export const PLAYWRIGHT_WORKSPACE_MARKER = '.playwright'

/**
 * Whether a verb is in the pinned CLI's command set.
 * @param command - candidate CLI verb.
 * @returns true when the verb is accepted by the pinned CLI.
 */
export function isKnownCommand(command: string): boolean {
  return BROWSER_COMMANDS.includes(command)
}

/**
 * Sanitize a dsh session id into a filesystem-safe playwright session name: lowercase,
 * non-`[a-z0-9._-]` characters replaced, capped at 64 characters.
 * @param sessionId - raw dsh session id.
 * @param prefix - configured session prefix.
 * @returns the backend session name.
 */
export function sessionNameFor(sessionId: string, prefix: string): string {
  const body = sessionId.toLowerCase().replace(/[^a-z0-9._-]+/g, '_').slice(0, 64)
  return `${prefix}-${body}`
}

/**
 * Truncation marker appended when the reply byte bound is reached.
 * @param truncatedBytes - number of bytes omitted from the reply.
 * @returns the marker text appended to the bounded reply.
 */
export function truncationMarker(truncatedBytes: number): string {
  return `\n[output truncated: ${truncatedBytes} bytes beyond bound]`
}
