import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import BrowserRuntime, {
  BROWSER_PROVIDER_AMBIGUOUS,
  BROWSER_PROVIDER_CONFIGURED_MISSING,
  BROWSER_PROVIDER_CONFIGURED_UNAVAILABLE,
  BROWSER_PROVIDER_UNAVAILABLE,
} from '../src/index.ts'
import type { BrowserProvider } from '../src/types.ts'

const sessionId = SessionId('session-1')

/** A provider stub with togglable availability. */
function stubProvider(id: string, isAvailable: boolean): BrowserProvider {
  return {
    id,
    available: () => isAvailable,
    help: async () => `help-${id}`,
    run: async (session, command, args) => ({ output: `${id}:${session}:${command}:${args.join(',')}` }),
    sessions: async () => [{ name: `sess-${id}` }],
    dashboardUrl: () => `http://${id}/`,
    close: async () => {},
    closeAll: async () => {},
  }
}

describe('BrowserRuntime selection', () => {
  it('auto-selects the single usable provider', async () => {
    const ctx = new Context()
    await ctx.plugin(BrowserRuntime, {})
    ctx.browser.register(stubProvider('a', true))
    await expect(ctx.browser.run(sessionId, 'open', ['https://x']))
      .resolves.toMatchObject({ output: 'a:session-1:open:https://x' })
    expect(ctx.browser.dashboardUrl()).toBe('http://a/')
  })

  it('prefers the configured provider when usable', async () => {
    const ctx = new Context()
    await ctx.plugin(BrowserRuntime, { provider: 'b' })
    ctx.browser.register(stubProvider('a', true))
    ctx.browser.register(stubProvider('b', true))
    await expect(ctx.browser.help()).resolves.toBe('help-b')
  })

  it('throws CONFIGURED_MISSING for an unregistered configured id', async () => {
    const ctx = new Context()
    await ctx.plugin(BrowserRuntime, { provider: 'ghost' })
    ctx.browser.register(stubProvider('a', true))
    await expect(ctx.browser.run(sessionId, 'open', [])).rejects.toThrow(expect.objectContaining({ code: BROWSER_PROVIDER_CONFIGURED_MISSING }))
  })

  it('throws CONFIGURED_UNAVAILABLE for a registered but unavailable configured id', async () => {
    const ctx = new Context()
    await ctx.plugin(BrowserRuntime, { provider: 'b' })
    ctx.browser.register(stubProvider('b', false))
    await expect(ctx.browser.run(sessionId, 'open', [])).rejects.toThrow(expect.objectContaining({ code: BROWSER_PROVIDER_CONFIGURED_UNAVAILABLE }))
  })

  it('throws AMBIGUOUS with multiple usable providers and no config', async () => {
    const ctx = new Context()
    await ctx.plugin(BrowserRuntime, {})
    ctx.browser.register(stubProvider('a', true))
    ctx.browser.register(stubProvider('b', true))
    await expect(ctx.browser.run(sessionId, 'open', [])).rejects.toThrow(expect.objectContaining({ code: BROWSER_PROVIDER_AMBIGUOUS }))
  })

  it('throws UNAVAILABLE with no usable provider', async () => {
    const ctx = new Context()
    await ctx.plugin(BrowserRuntime, {})
    ctx.browser.register(stubProvider('a', false))
    await expect(ctx.browser.run(sessionId, 'open', [])).rejects.toThrow(expect.objectContaining({ code: BROWSER_PROVIDER_UNAVAILABLE }))
    expect(ctx.browser.dashboardUrl()).toBeUndefined()
  })

  it('rejects a duplicate provider id', async () => {
    const ctx = new Context()
    await ctx.plugin(BrowserRuntime, {})
    ctx.browser.register(stubProvider('a', true))
    expect(() => ctx.browser.register(stubProvider('a', true))).toThrow(/already registered/)
  })

  it('forwards close/closeAll/sessions to the selected provider', async () => {
    const ctx = new Context()
    await ctx.plugin(BrowserRuntime, {})
    const provider = stubProvider('a', true)
    ctx.browser.register(provider)
    await expect(ctx.browser.sessions()).resolves.toEqual([{ name: 'sess-a' }])
    await expect(ctx.browser.close(sessionId)).resolves.toBeUndefined()
    await expect(ctx.browser.closeAll()).resolves.toBeUndefined()
  })
})

describe('BrowserRuntime registration disposal', () => {
  it('unregisters on the returned disposer', async () => {
    const ctx = new Context()
    await ctx.plugin(BrowserRuntime, {})
    const dispose = ctx.browser.register(stubProvider('a', true))
    await expect(ctx.browser.run(sessionId, 'open', [])).resolves.toBeDefined()
    dispose()
    await expect(ctx.browser.run(sessionId, 'open', [])).rejects.toThrow(expect.objectContaining({ code: BROWSER_PROVIDER_UNAVAILABLE }))
  })
})
