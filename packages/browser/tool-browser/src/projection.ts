/**
 * The `browser/feed` projection unit: a replay-derived fold over `tool/call` + `tool/result`
 * pairs and settled `tool/code-dispatch` events whose tool name is a browser tool. Pure and
 * synchronous (projection contract); bounds come from the registering plugin's config.
 * @module @deepseek-ai/dsh-tool-browser/projection
 */

import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { BrowserFeed, BrowserFeedEntry } from './types.ts'

/** Tool names whose calls belong to this feed. */
export const BROWSER_TOOL_NAMES: readonly string[] = ['browser', 'browser_help']

/** Commands that flip the feed's heuristic `open` flag on. */
const OPENING_COMMANDS: readonly string[] = ['open', 'attach']

/** Commands that flip the feed's heuristic `open` flag off. */
const CLOSING_COMMANDS: readonly string[] = ['close', 'detach']

/** Feed entry cap applied by the registerer. */
export const BROWSER_FEED_DEFAULT_MAX_ENTRIES = 200

/** Reply-excerpt character cap applied by the registerer. */
export const BROWSER_FEED_DEFAULT_EXCERPT_CHARS = 512

/** Fold state: plain JSON (persisted-cache precondition), never a Map or Set. */
export interface BrowserFeedState {
  /** Newest-first rows. */
  readonly entries: BrowserFeedEntry[]
  /** callId → the exact entry object also present in `entries` (identity lookup). */
  readonly pending: Record<string, BrowserFeedEntry>
  /** Whether the backend session has a page open per the last open/close command. */
  readonly open: boolean
  /** True once the entry cap has dropped older rows. */
  readonly truncated: boolean
}

/**
 * Empty fold state.
 * @returns a new empty browser feed state.
 */
export const emptyBrowserFeedState = (): BrowserFeedState => ({ entries: [], pending: {}, open: false, truncated: false })

/** Wire payload schema of the `browser/feed` projection. */
export const browserFeedSchema = z.object({
  entries: z.array(z.object({
    callId: z.string().min(1),
    action: z.string().min(1),
    args: z.array(z.string()),
    outcome: z.union([z.literal('running'), z.literal('ok'), z.literal('error')]),
    excerpt: z.string(),
    at: z.number(),
  })),
  truncated: z.boolean(),
  open: z.boolean(),
}) as unknown as z.ZodType<BrowserFeed>

/** Whether a dispatched tool name belongs to this feed. */
function isBrowserCall(name: unknown): boolean {
  return typeof name === 'string' && BROWSER_TOOL_NAMES.includes(name)
}

/** Parse durable tool arguments, which are object-normalized in code mode and JSON text in logs. */
function argumentRecord(argumentsValue: unknown): Record<string, unknown> | undefined {
  if (typeof argumentsValue === 'object' && argumentsValue !== null && !Array.isArray(argumentsValue)) {
    return argumentsValue as Record<string, unknown>
  }
  if (typeof argumentsValue !== 'string') return undefined
  try {
    const parsed: unknown = JSON.parse(argumentsValue)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined
  } catch (_invalidJsonArguments) {
    return undefined
  }
}

/** Extract the dispatched command and args from JSON-normalized tool arguments. */
function commandOf(argumentsValue: unknown): { action: string; args: readonly string[] } {
  const record = argumentRecord(argumentsValue)
  const command = record?.['command']
  const args = record?.['args']
  return {
    action: typeof command === 'string' ? command : 'browser',
    args: Array.isArray(args) ? args.filter((arg): arg is string => typeof arg === 'string') : [],
  }
}

/** Build one running entry from a dispatched call. */
function entryFromArguments(callId: string, argumentsValue: unknown, at: number): BrowserFeedEntry {
  const command = commandOf(argumentsValue)
  return {
    callId,
    action: command.action,
    args: command.args,
    outcome: 'running',
    excerpt: '',
    at,
  }
}

/** Bounded text tail from a durable result's content blocks (duck-typed log data). */
function excerptFromContent(content: unknown, excerptChars: number): string {
  const blocks = Array.isArray(content) ? content : []
  const parts: string[] = []
  for (const block of blocks) {
    if (typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text') {
      const text = (block as { text?: unknown }).text
      if (typeof text === 'string') parts.push(text)
    }
  }
  const joined = parts.join('\n').trim()
  return joined.length > excerptChars ? `${joined.slice(0, excerptChars)}…` : joined
}

/** Heuristic page-open flip: only the four session-lifecycle commands move it. */
function nextOpen(open: boolean, argumentsValue: unknown): boolean {
  const { action } = commandOf(argumentsValue)
  if (OPENING_COMMANDS.includes(action)) return true
  if (CLOSING_COMMANDS.includes(action)) return false
  return open
}

/**
 * Fold one committed session event into the feed state. Non-browser events return the same
 * reference (the registry's Object.is gate); a browser call prepends a running row, its result
 * finalizes that exact row, and a settled Code Mode dispatch lands fully formed.
 * @param state - the state covering all prior events.
 * @param event - the next committed session event.
 * @param maxEntries - feed row cap.
 * @param excerptChars - reply-excerpt character cap.
 * @returns the next state (same reference when the event does not concern this feed).
 */
export function applyBrowserFeed(
  state: BrowserFeedState,
  event: SessionEvent,
  maxEntries: number,
  excerptChars: number,
): BrowserFeedState {
  switch (event.type) {
    case 'tool/call': {
      if (!isBrowserCall(event.data.name)) return state
      const entry = entryFromArguments(event.data.callId, event.data.arguments, event.time)
      const all = [entry, ...state.entries]
      const cut = all.length > maxEntries
      return {
        entries: cut ? all.slice(0, maxEntries) : all,
        pending: { ...state.pending, [event.data.callId]: entry },
        open: nextOpen(state.open, event.data.arguments),
        truncated: state.truncated || cut,
      }
    }
    case 'tool/result': {
      const block = event.data.message.content[0]
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- durable log data can be malformed at replay time.
      if (block === undefined || block.type !== 'tool-result') return state
      const pendingEntry = state.pending[block.toolCallId]
      if (pendingEntry === undefined) return state
      const finalized: BrowserFeedEntry = {
        ...pendingEntry,
        outcome: block.isError === true ? 'error' : 'ok',
        excerpt: excerptFromContent(block.content, excerptChars),
      }
      const pending = Object.fromEntries(
        Object.entries(state.pending).filter(([callId]) => callId !== block.toolCallId),
      ) as Record<string, BrowserFeedEntry>
      return {
        entries: state.entries.map(entry => entry === pendingEntry ? finalized : entry),
        pending,
        open: state.open,
        truncated: state.truncated,
      }
    }
    case 'tool/code-dispatch': {
      if (!isBrowserCall(event.data.name)) return state
      const entry: BrowserFeedEntry = {
        ...entryFromArguments(event.data.subCallId, event.data.arguments, event.time),
        outcome: event.data.isError ? 'error' : 'ok',
        excerpt: excerptFromContent(event.data.content, excerptChars),
      }
      const all = [entry, ...state.entries]
      const cut = all.length > maxEntries
      return {
        entries: cut ? all.slice(0, maxEntries) : all,
        pending: state.pending,
        open: nextOpen(state.open, event.data.arguments),
        truncated: state.truncated || cut,
      }
    }
    default:
      return state
  }
}
