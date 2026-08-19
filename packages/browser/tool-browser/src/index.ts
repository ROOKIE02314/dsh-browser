/**
 * Model-facing `browser` and `browser_help` tools over the browser capability seam, plus the
 * `browser/feed` session projection that the web GUI's browser panel reads. This package owns
 * schemas, validation, presentation, and the feed vocabulary — never a concrete backend.
 * @module @deepseek-ai/dsh-tool-browser
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { BrowserError } from '@deepseek-ai/dsh-browser'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import {
  BROWSER_FEED_DEFAULT_EXCERPT_CHARS,
  BROWSER_FEED_DEFAULT_MAX_ENTRIES,
  applyBrowserFeed,
  browserFeedSchema,
  emptyBrowserFeedState,
} from './projection.ts'
import type { BrowserFeedState } from './projection.ts'
import type { BrowserFeed } from './types.ts'

export type * from './types.ts'
export {
  BROWSER_FEED_DEFAULT_EXCERPT_CHARS,
  BROWSER_FEED_DEFAULT_MAX_ENTRIES,
  BROWSER_TOOL_NAMES,
  applyBrowserFeed,
  browserFeedSchema,
  emptyBrowserFeedState,
} from './projection.ts'
export type { BrowserFeedState } from './projection.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-browser'

/** Services required by the browser tool suite. */
export const inject = ['tools', 'browser']

/** Default cooperative tool-call timeout budget (ms), above the provider's default. */
export const BROWSER_TOOL_DEFAULT_TIMEOUT_MS = 125_000

/**
 * Plugin config: feed bounds and the tool-call budget. The feed folds from the session log, so
 * these bounds only shape the UI-scale projection value, never the durable record.
 */
export interface Config {
  /** Register the browser tools (default true). */
  enabled?: boolean
  /** Maximum feed rows retained (default 200). */
  maxFeedEntries?: number
  /** Reply-excerpt character cap per feed row (default 512). */
  feedExcerptChars?: number
  /** Cooperative timeout budget (ms) for one browser command (default 125000). */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  maxFeedEntries: z.number().default(BROWSER_FEED_DEFAULT_MAX_ENTRIES),
  feedExcerptChars: z.number().default(BROWSER_FEED_DEFAULT_EXCERPT_CHARS),
  timeoutMs: z.number().default(BROWSER_TOOL_DEFAULT_TIMEOUT_MS),
})

/** Validated, defaulted tool config. */
interface ResolvedConfig {
  readonly maxFeedEntries: number
  readonly feedExcerptChars: number
  readonly timeoutMs: number
}

const BROWSER_DESCRIPTION =
  'Run one playwright-cli command against this session\'s CDP browser and return its reply. '
  + 'The browser keeps cookies and page state across calls within this session. Use `snapshot` '
  + 'to obtain element refs (e.g. e21) for click/fill targets, then act on them: `open <url>`, '
  + '`goto <url>`, `click <ref>`, `dblclick <ref>`, `type <text>`, `fill <ref> <text>`, '
  + '`press <key>`, `hover <ref>`, `check`/`uncheck <ref>`, `screenshot`, `go-back`, `reload`, '
  + '`wait <time>`, `tab-list`/`tab-new`/`tab-select`, `cookie-list`/`cookie-set`, '
  + '`state-save`/`state-load`. Pass one command per call; run `browser_help` for the full '
  + 'command reference. Prefer `snapshot` before clicking so refs stay current.'

const BROWSER_HELP_DESCRIPTION =
  'Return the playwright-cli command reference: every available verb with its options and '
  + 'examples. Call this when unsure how to express a browser action.'

/** Canonical browser-tool value. */
interface BrowserToolValue {
  readonly command: string
  readonly args: readonly string[]
  readonly output: string
}

/** Validate and default the tool config at load; a misconfigured bound fails loud. */
function resolveConfig(config: Config): ResolvedConfig {
  // schemastery has already filled every defaulted field.
  const resolved = config as unknown as ResolvedConfig
  const positive = (field: string, value: number, minimum: number): void => {
    if (!Number.isInteger(value) || value < minimum) {
      throw new Error(`tool-browser: ${field} must be an integer >= ${minimum}, got ${String(value)}`)
    }
  }
  positive('maxFeedEntries', resolved.maxFeedEntries, 1)
  positive('feedExcerptChars', resolved.feedExcerptChars, 64)
  positive('timeoutMs', resolved.timeoutMs, 1_000)
  return resolved
}

/** Render the pending card as the exact CLI line that will run. */
function presentBrowserCall(args: { command: string; args?: string[] }): GenericCallView | undefined {
  const line = ['browser', args.command, ...(args.args ?? [])].join(' ')
  return { card: 'generic', title: line, kind: 'execute', rawInput: line }
}

/** Render the completed card with the command's reply. */
function presentBrowserResult(args: { command: string }, result: ToolResult): GenericResultView | undefined {
  return { card: 'generic', title: `browser ${args.command}`, content: result.content }
}

/**
 * Register the browser tools and the `browser/feed` projection unit. The projection child
 * activates only when a projection registry is composed (headless assemblies stay unaffected).
 * @param ctx - Cordis context carrying `tools` and `browser`.
 * @param config - validated, defaulted plugin config.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)
  if (config.enabled === false) return

  ctx.tools.register(defineTool({
    name: 'browser',
    description: BROWSER_DESCRIPTION,
    parameters: {
      command: {
        type: 'string',
        required: true,
        description: 'The playwright-cli verb, e.g. open, goto, click, type, fill, snapshot, screenshot.',
      },
      args: {
        type: 'array',
        items: { type: 'string' },
        description: 'Positionals and --flag=value tokens for the command, e.g. ["https://example.com"] or ["e21"] or ["--filename=/tmp/page.png"].',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          command: { type: 'string', required: true },
          args: { type: 'array', items: { type: 'string' }, required: true },
          output: { type: 'string', required: true },
        },
      },
      render: (_args, value: BrowserToolValue) => [{ type: 'text', text: value.output }],
    },
    presentCall: presentBrowserCall,
    presentResult: presentBrowserResult,
    timeoutMs: resolved.timeoutMs,
    async execute(args, exec) {
      const agent = exec.agent
      if (agent === undefined) {
        throw new BrowserError('browser requires a session-bound agent', 'BROWSER_NO_AGENT')
      }
      const result = await ctx.browser.run(agent.session.id, args.command, args.args ?? [], exec.signal)
      return { command: args.command, args: args.args ?? [], output: result.output }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'browser_help',
    description: BROWSER_HELP_DESCRIPTION,
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value: string) => [{ type: 'text', text: value }],
    },
    async execute() {
      return ctx.browser.help()
    },
  }))

  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.sessionProjections.register<'browser/feed', BrowserFeedState>({
      key: 'browser/feed',
      schema: browserFeedSchema,
      init: emptyBrowserFeedState,
      apply: (state, event) => applyBrowserFeed(state, event, resolved.maxFeedEntries, resolved.feedExcerptChars),
      view: (state): BrowserFeed => ({
        entries: state.entries,
        truncated: state.truncated,
        open: state.open,
      }),
      stateVersion: 1,
    })
  })
}
