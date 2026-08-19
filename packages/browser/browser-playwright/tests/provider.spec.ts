import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import BrowserRuntime from '@deepseek-ai/dsh-browser'
import { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlaywrightBrowserProvider, assertConfig, browserPresent } from '../src/index.ts'
import * as playwrightPlugin from '../src/index.ts'
import type { Config } from '../src/index.ts'

const fixture = fileURLToPath(new URL('./fixtures/fake-cli.mjs', import.meta.url))

/** Pick a loopback port that is free right now. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => { resolve(port) })
    })
  })
}

const tempDirs: string[] = []

async function tempHome(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'browser-home-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

/** Provider config that never touches the real playwright CLI or browsers. */
async function testConfig(overrides: Partial<Config> = {}): Promise<ReturnType<typeof assertConfig>> {
  return assertConfig({
    dashboard: { enabled: false, port: 12789, host: '127.0.0.1' },
    cliPath: fixture,
    browserHome: await tempHome(),
    ...overrides,
  })
}

const sessionId = SessionId('session-1')

describe('browserPresent', () => {
  it('accepts the managed executable or any candidate', () => {
    const exists = (p: string) => p === '/ok/managed' || p === '/opt/chrome'
    expect(browserPresent('/ok/managed', ['/opt/chrome'], exists)).toBe(true)
    expect(browserPresent('/missing', ['/opt/chrome'], exists)).toBe(true)
    expect(browserPresent('/missing', ['/opt/firefox'], exists)).toBe(false)
  })
})

describe('assertConfig', () => {
  it('fills defaults and accepts a custom cliPath', async () => {
    const home = await tempHome()
    const resolved = assertConfig({ cliPath: fixture, browserHome: home })
    expect(resolved).toMatchObject({
      dashboardEnabled: true,
      port: 12789,
      host: '127.0.0.1',
      persistent: false,
      sessionPrefix: 'dsh',
      cliPath: fixture,
      browserHome: home,
      maxOutputBytes: 65536,
      timeoutMs: 120000,
    })
  })

  it('rejects an out-of-range dashboard port', async () => {
    await expect(testConfig({ dashboard: { enabled: false, port: 0, host: '127.0.0.1' } })).rejects.toThrow(/port must be an integer/)
  })

  it('rejects a multi-line dashboard host', async () => {
    await expect(testConfig({ dashboard: { enabled: false, port: 12789, host: 'a\nb' } })).rejects.toThrow(/host must be a single-line/)
  })

  it('rejects a malformed session prefix', async () => {
    await expect(testConfig({ sessionPrefix: 'Bad Prefix!' })).rejects.toThrow(/sessionPrefix must match/)
  })

  it('rejects a too-small timeout', async () => {
    await expect(testConfig({ timeoutMs: 500 })).rejects.toThrow(/timeoutMs must be an integer/)
  })

  it('rejects a too-small output bound', async () => {
    await expect(testConfig({ maxOutputBytes: 16 })).rejects.toThrow(/maxOutputBytes must be an integer/)
  })

  it('rejects a cliPath that does not exist', async () => {
    await expect(testConfig({ cliPath: '/nonexistent/playwright-cli.js' })).rejects.toThrow(/entry not found/)
  })

  it('defaults browserHome to <cwd>/.dsh-browser', async () => {
    const resolved = assertConfig({ cliPath: fixture })
    expect(resolved.browserHome).toBe(`${process.cwd()}/.dsh-browser`)
  })

  it('resolves the pinned playwright-cli entry by default', async () => {
    const resolved = assertConfig({ browserHome: await tempHome() })
    expect(resolved.cliPath).toMatch(/playwright-cli\.js$/)
  })
})

describe('PlaywrightBrowserProvider', () => {
  it('fails construction when the availability verdict is absent', async () => {
    const resolved = await testConfig()
    expect(() => new PlaywrightBrowserProvider(resolved, false)).toThrow(/no browser executable found/)
  })

  it('runs a command and records the session mirror', async () => {
    process.env.FAKE_CLI_MODE = 'echo'
    const resolved = await testConfig()
    const provider = new PlaywrightBrowserProvider(resolved, true)
    const result = await provider.run(sessionId, 'goto', ['https://example.com'])
    expect(result.output).toContain('-s=dsh-session-1 goto https://example.com')
    expect(await provider.sessions()).toEqual([{ name: 'dsh-session-1' }])
    await provider.dispose()
  })

  it('appends --persistent to open under persistent config', async () => {
    process.env.FAKE_CLI_MODE = 'echo'
    const resolved = await testConfig({ persistent: true })
    const provider = new PlaywrightBrowserProvider(resolved, true)
    const result = await provider.run(sessionId, 'open', ['https://example.com'])
    expect(result.output).toContain('open https://example.com --persistent')
    await provider.dispose()
  })

  it('rejects unknown commands before spawning', async () => {
    const resolved = await testConfig()
    const provider = new PlaywrightBrowserProvider(resolved, true)
    await expect(provider.run(sessionId, 'explode', [])).rejects.toThrow(/unknown browser command/)
    await provider.dispose()
  })

  it('rejects malformed argument tokens before spawning', async () => {
    const resolved = await testConfig()
    const provider = new PlaywrightBrowserProvider(resolved, true)
    await expect(provider.run(sessionId, 'click', [''])).rejects.toThrow(/non-empty strings/)
    await expect(provider.run(sessionId, 'click', Array.from({ length: 41 }, () => 'x'))).rejects.toThrow(/at most 40/)
    await expect(provider.run(sessionId, 'click', ['x'.repeat(5000)])).rejects.toThrow(/exceeds 4096/)
    await provider.dispose()
  })

  it('throws the CLI failure message on a non-zero exit', async () => {
    process.env.FAKE_CLI_MODE = 'fail'
    const resolved = await testConfig()
    const provider = new PlaywrightBrowserProvider(resolved, true)
    await expect(provider.run(sessionId, 'click', ['e1'])).rejects.toThrow(/browser click failed \(exit 2\)/)
    await provider.dispose()
  })

  it('throws a structured timeout error', async () => {
    process.env.FAKE_CLI_MODE = 'slow'
    const resolved = await testConfig({ timeoutMs: 1_000 })
    const provider = new PlaywrightBrowserProvider(resolved, true)
    await expect(provider.run(sessionId, 'open', ['https://example.com'])).rejects.toThrow(/timed out after 1000ms/)
    await provider.dispose()
  })

  it('caches the help text promise', async () => {
    process.env.FAKE_CLI_MODE = 'help'
    const resolved = await testConfig()
    const provider = new PlaywrightBrowserProvider(resolved, true)
    const first = provider.help()
    expect(provider.help()).toBe(first)
    expect(await first).toContain('fake-cli help:')
    await provider.dispose()
  })

  it('fails the help call with the CLI failure message', async () => {
    process.env.FAKE_CLI_MODE = 'fail'
    const resolved = await testConfig()
    const provider = new PlaywrightBrowserProvider(resolved, true)
    await expect(provider.help()).rejects.toThrow(/browser --help failed/)
    await provider.dispose()
  })

  it('reports an aborted command with a structured error', async () => {
    process.env.FAKE_CLI_MODE = 'slow'
    const resolved = await testConfig()
    const provider = new PlaywrightBrowserProvider(resolved, true)
    const controller = new AbortController()
    const pending = provider.run(sessionId, 'open', ['https://example.com'], controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow(/browser open aborted/)
    process.env.FAKE_CLI_MODE = 'echo'
    await provider.dispose()
  })

  it('runs a global command without a session flag or mirror entry', async () => {
    process.env.FAKE_CLI_MODE = 'echo'
    const resolved = await testConfig()
    const provider = new PlaywrightBrowserProvider(resolved, true)
    const result = await provider.run(sessionId, 'close-all', [])
    expect(result.output).toContain('fake-cli: close-all')
    expect(result.output).not.toContain('-s=')
    expect(await provider.sessions()).toEqual([])
    await provider.dispose()
  })

  it('closes an open session without error', async () => {
    process.env.FAKE_CLI_MODE = 'echo'
    const resolved = await testConfig()
    const provider = new PlaywrightBrowserProvider(resolved, true)
    await expect(provider.close(sessionId)).resolves.toBeUndefined()
    await provider.dispose()
  })

  it('propagates a failing close-all', async () => {
    process.env.FAKE_CLI_MODE = 'fail'
    const resolved = await testConfig()
    const provider = new PlaywrightBrowserProvider(resolved, true)
    await expect(provider.closeAll()).rejects.toThrow(/browser close-all failed/)
    await provider.dispose()
  })

  it('dispose stays total when close-all fails', async () => {
    process.env.FAKE_CLI_MODE = 'fail'
    const resolved = await testConfig()
    const provider = new PlaywrightBrowserProvider(resolved, true)
    await expect(provider.dispose()).resolves.toBeUndefined()
  })

  it('serves the dashboard URL when the dashboard is enabled', async () => {
    process.env.FAKE_CLI_MODE = 'dashboard'
    const port = await freePort()
    const resolved = await testConfig({ dashboard: { enabled: true, port, host: '127.0.0.1' } })
    const provider = new PlaywrightBrowserProvider(resolved, true)
    await expect.poll(() => provider.dashboardUrl()).toBe(`http://127.0.0.1:${port}/`)
    await provider.dispose()
    expect(provider.dashboardUrl()).toBeUndefined()
  })

  it('logs and hides the dashboard surface when it fails to start', async () => {
    process.env.FAKE_CLI_MODE = 'fail'
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const port = await freePort()
      const resolved = await testConfig({ dashboard: { enabled: true, port, host: '127.0.0.1' } })
      const provider = new PlaywrightBrowserProvider(resolved, true)
      await expect.poll(() => spy.mock.calls.length, { interval: 50, timeout: 2_000 }).toBeGreaterThan(0)
      expect(provider.dashboardUrl()).toBeUndefined()
      expect(spy).toHaveBeenCalledWith('browser-playwright: dashboard failed to start', expect.anything())
      await provider.dispose()
    } finally {
      spy.mockRestore()
    }
  })

  it('treats close on a closed session as idempotent success', async () => {
    process.env.FAKE_CLI_MODE = 'not-open'
    const resolved = await testConfig()
    const provider = new PlaywrightBrowserProvider(resolved, true)
    await expect(provider.close(sessionId)).resolves.toBeUndefined()
    await provider.dispose()
  })

  it('propagates a failing close', async () => {
    process.env.FAKE_CLI_MODE = 'fail'
    const resolved = await testConfig()
    const provider = new PlaywrightBrowserProvider(resolved, true)
    await expect(provider.close(sessionId)).rejects.toThrow(/browser close failed/)
    await provider.dispose()
  })

  it('clears the mirror on close-all', async () => {
    process.env.FAKE_CLI_MODE = 'echo'
    const resolved = await testConfig()
    const provider = new PlaywrightBrowserProvider(resolved, true)
    await provider.run(sessionId, 'goto', ['https://example.com'])
    await provider.closeAll()
    expect(await provider.sessions()).toEqual([])
    await provider.dispose()
  })

  it('reports no dashboard URL when the dashboard is disabled', async () => {
    const resolved = await testConfig()
    const provider = new PlaywrightBrowserProvider(resolved, true)
    expect(provider.dashboardUrl()).toBeUndefined()
    await provider.dispose()
  })
})

describe('browser-playwright plugin registration', () => {
  it('registers the provider into ctx.browser (HMR-safe)', async () => {
    const ctx = new Context()
    await ctx.plugin(BrowserRuntime, {})
    const fiber = await ctx.plugin(playwrightPlugin, {
      dashboard: { enabled: false, port: 12789, host: '127.0.0.1' },
      requireBrowser: false,
      cliPath: fixture,
      browserHome: await tempHome(),
    })
    process.env.FAKE_CLI_MODE = 'echo'
    await expect(ctx.browser.run(sessionId, 'goto', ['https://example.com']))
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- Vitest asymmetric matcher is typed as any.
      .resolves.toMatchObject({ output: expect.stringContaining('fake-cli:') })
    await fiber.dispose()
    await expect(ctx.browser.run(sessionId, 'goto', ['https://example.com']))
      .rejects.toThrow(/no usable browser provider/)
  })

  it('fails plugin load when the enabled dashboard cannot start', async () => {
    const ctx = new Context()
    await ctx.plugin(BrowserRuntime, {})
    process.env.FAKE_CLI_MODE = 'fail'
    await expect(ctx.plugin(playwrightPlugin, {
      dashboard: { enabled: true, port: await freePort(), host: '127.0.0.1' },
      requireBrowser: false,
      cliPath: fixture,
      browserHome: await tempHome(),
    })).rejects.toThrow(/exited before serving|did not answer/)
  })

  it('keeps the dashboard serving until plugin disposal', async () => {
    const ctx = new Context()
    await ctx.plugin(BrowserRuntime, {})
    process.env.FAKE_CLI_MODE = 'redirect'
    const port = await freePort()
    const fiber = await ctx.plugin(playwrightPlugin, {
      dashboard: { enabled: true, port, host: '127.0.0.1' },
      requireBrowser: false,
      cliPath: fixture,
      browserHome: await tempHome(),
    })
    expect(ctx.browser.dashboardUrl()).toBe(`http://127.0.0.1:${port}/`)
    await fiber.dispose()
    expect(ctx.browser.dashboardUrl()).toBeUndefined()
  })

  it('has no default export (namespace plugin export shape)', () => {
    expect('default' in playwrightPlugin).toBe(false)
  })
})
