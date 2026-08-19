/* oxlint-disable typescript/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any. */

import { Context } from '@deepseek-ai/cordis'
import { CallId, MessageId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import BrowserRuntime from '@deepseek-ai/dsh-browser'
import type { BrowserProvider } from '@deepseek-ai/dsh-browser'
import type { Agent } from '@deepseek-ai/dsh-agent'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as ToolBrowser from '@deepseek-ai/dsh-tool-browser'
import type { BrowserFeed } from '@deepseek-ai/dsh-tool-browser'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import { applyBrowserFeed, emptyBrowserFeedState } from '../src/projection.ts'

const testToolSignal = new AbortController().signal

/** Minimal live-agent stub carrying a real session (tool-goal's pattern). */
function stubAgent(rawId: string): Agent {
  const session = Session.create(SessionId(rawId))
  return {
    id: session.id,
    options: {},
    session,
    inbox: {} as Agent['inbox'],
    get status() { return 'running' as const },
    ctx: new Context(),
    send: () => {},
    followup: () => {},
    steer: () => ({ outcome: Promise.resolve({ status: 'rejected' as const }) }),
    inject() {},
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle() { return Promise.resolve() },
  }
}

/** Fake backend with a scripted reply. */
function fakeProvider(output: string): BrowserProvider {
  return {
    id: 'fake',
    available: () => true,
    help: async () => 'fake help text',
    run: async (session, command, args) => ({ output: `${output}|${session}|${command}|${args.join(',')}` }),
    sessions: async () => [],
    dashboardUrl: () => undefined,
    close: async () => {},
    closeAll: async () => {},
  }
}

/** Mount the registry, seam, provider, and tool suite. */
async function mount(config: ToolBrowser.Config = {}) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(BrowserRuntime, {})
  ctx.browser.register(fakeProvider('ok'))
  await ctx.plugin(SessionProjectionRegistry)
  const fiber = await ctx.plugin(ToolBrowser, config)
  return { ctx, fiber }
}

let counter = 0
const execute = (ctx: Context, name: string, args: unknown, agent?: Agent) => ctx.tools.execute({
  signal: testToolSignal,
  callId: CallId(`call-${++counter}`),
  name,
  arguments: args,
  ...(agent === undefined ? {} : { agent }),
})

describe('browser tool', () => {
  it('forwards a command to the backend and returns the canonical value', async () => {
    const { ctx } = await mount()
    const result = await execute(ctx, 'browser', { command: 'goto', args: ['https://example.com'] }, stubAgent('agent-1'))
    expect(result.isError).toBe(false)
    expect(result.value).toEqual({
      command: 'goto',
      args: ['https://example.com'],
      output: expect.stringContaining('|goto|https://example.com'),
    })
    const content = result.content[0]
    expect(content?.type).toBe('text')
    if (content?.type === 'text') expect(content.text).toContain('|goto|')
    // Omitted args normalize to the empty list.
    const noArgs = await execute(ctx, 'browser', { command: 'snapshot' }, stubAgent('agent-2'))
    expect(noArgs.isError).toBe(false)
    expect(noArgs.value).toEqual({ command: 'snapshot', args: [], output: expect.stringContaining('|snapshot|') })
  })

  it('presents the pending call as the CLI line', async () => {
    const { ctx } = await mount()
    const tool = ctx.tools.get('browser')
    const view = tool?.presentCall?.({ command: 'click', args: ['e21'] })
    expect(view).toEqual({ card: 'generic', title: 'browser click e21', kind: 'execute', rawInput: 'browser click e21' })
    const noArgs = tool?.presentCall?.({ command: 'open' })
    expect(noArgs).toEqual({ card: 'generic', title: 'browser open', kind: 'execute', rawInput: 'browser open' })
  })

  it('presents the completed result with the command title', async () => {
    const { ctx } = await mount()
    const tool = ctx.tools.get('browser')
    const view = tool?.presentResult?.({ command: 'snapshot' }, {
      content: [{ type: 'text', text: 'snap' }],
      isError: false,
    })
    expect(view).toEqual({ card: 'generic', title: 'browser snapshot', content: [{ type: 'text', text: 'snap' }] })
    // The registry wrapper owns malformed-replay degradation (soft-validation
    // returns undefined before the presenter runs).
    expect(tool?.presentCall?.('not-an-object')).toBeUndefined()
  })

  it('fails with BROWSER_NO_AGENT outside a session-bound execution', async () => {
    const { ctx } = await mount()
    const result = await execute(ctx, 'browser', { command: 'goto', args: [] })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({ type: 'text' })
    const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
    expect(text).toContain('session-bound agent')
  })

  it('validates args through the registry schema', async () => {
    const { ctx } = await mount()
    const result = await execute(ctx, 'browser', { args: [] })
    expect(result.isError).toBe(true)
  })
})

describe('browser_help tool', () => {
  it('returns the backend help text', async () => {
    const { ctx } = await mount()
    const result = await execute(ctx, 'browser_help', {})
    expect(result.isError).toBe(false)
    expect(result.value).toBe('fake help text')
  })
})

describe('tool-browser config', () => {
  it('rejects a non-positive feed bound at load', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(BrowserRuntime, {})
    await expect(ctx.plugin(ToolBrowser, { maxFeedEntries: 0 })).rejects.toThrow(/maxFeedEntries must be an integer/)
  })

  it('rejects a too-small excerpt cap at load', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(BrowserRuntime, {})
    await expect(ctx.plugin(ToolBrowser, { feedExcerptChars: 1 })).rejects.toThrow(/feedExcerptChars must be an integer/)
  })

  it('registers no tools when disabled', async () => {
    const { ctx } = await mount({ enabled: false })
    expect(ctx.tools.get('browser')).toBeUndefined()
    expect(ctx.tools.get('browser_help')).toBeUndefined()
  })
})

describe('browser/feed projection through the registry', () => {
  it('ignores non-record durable arguments and JSON arrays', () => {
    const state = emptyBrowserFeedState()
    const event = (argumentsValue: unknown) => ({
      type: 'tool/call',
      time: 1,
      data: { name: 'browser', callId: 'invalid', arguments: argumentsValue },
    }) as unknown as SessionEvent
    expect(applyBrowserFeed(state, event(42), 10, 64).entries[0]).toMatchObject({ action: 'browser', args: [] })
    expect(applyBrowserFeed(state, event('[]'), 10, 64).entries[0]).toMatchObject({ action: 'browser', args: [] })
  })

  it('serves a replay-derived feed for a real session log', async () => {
    const { ctx } = await mount()
    const session = Session.create(SessionId('feed-session'))
    const call = session.append('tool/call', {
      turn: 1,
      step: 1,
      callId: CallId('c1'),
      name: 'browser',
      arguments: JSON.stringify({ command: 'open', args: ['https://example.com'] }),
    })
    session.append('tool/result', {
      turn: 1,
      step: 1,
      message: {
        role: 'user',
        id: MessageId('result-1'),
        source: { kind: 'tool', callId: CallId('c1') },
        content: [{
          type: 'tool-result',
          toolCallId: CallId('c1'),
          content: [{ type: 'text', text: 'opened' }],
        }],
      },
    }, { surfaceOp: 'append', sourceEventSeqs: [call.seq] })
    const snapshot = ctx.sessionProjections.snapshot(session)
    const feed = snapshot.values['browser/feed'] as BrowserFeed
    expect(feed).toEqual({
      entries: [{
        callId: 'c1',
        action: 'open',
        args: ['https://example.com'],
        outcome: 'ok',
        excerpt: 'opened',
        at: expect.any(Number),
      }],
      truncated: false,
      open: true,
    })
  })
})
