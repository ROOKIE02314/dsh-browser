/**
 * playwright-cli provider for the browser capability seam (`ctx.browser`): spawns the pinned
 * `@playwright/cli` against a dedicated daemon bucket so dsh sessions never share registry state
 * with other playwright-cli usage on the machine, and serves the `show` dashboard whose live
 * screencast the web GUI embeds. Browser processes are spawned directly by this host plugin —
 * never through the shell sandbox, which cannot host GUI browsers.
 * @module @deepseek-ai/dsh-browser-playwright
 */

import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { BrowserError } from '@deepseek-ai/dsh-browser'
import type { BrowserProvider, BrowserRunResult, BrowserSessionInfo } from '@deepseek-ai/dsh-browser'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { chromium } from 'playwright-core'
import { browserPresent } from './availability.ts'
import {
  BROWSER_DEFAULT_MAX_OUTPUT_BYTES,
  BROWSER_DEFAULT_TIMEOUT_MS,
  BROWSER_GLOBAL_COMMANDS,
  PLAYWRIGHT_WORKSPACE_MARKER,
  isKnownCommand,
  sessionNameFor,
} from './cli.ts'
import { DashboardServer } from './dashboard.ts'
import { runCli } from './spawn.ts'

export {
  BROWSER_COMMANDS,
  BROWSER_DEFAULT_MAX_OUTPUT_BYTES,
  BROWSER_DEFAULT_TIMEOUT_MS,
  BROWSER_GLOBAL_COMMANDS,
  PLAYWRIGHT_WORKSPACE_MARKER,
  sessionNameFor,
} from './cli.ts'
export { browserPresent } from './availability.ts'
export type { SpawnResult, SpawnOptions } from './spawn.ts'
export { DashboardServer } from './dashboard.ts'
export type { DashboardOptions } from './dashboard.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'browser-playwright'

/** The seam this provider registers into. */
export const inject = ['browser']

/** Maximum characters accepted in one CLI argument token. */
const MAX_ARG_CHARS = 4_096

/** Maximum number of argument tokens accepted per command. */
const MAX_ARG_COUNT = 40

/**
 * Plugin config. `cliPath` defaults to the pinned `@playwright/cli` entry inside this package's
 * dependency tree; `browserHome` defaults to `<process cwd>/.dsh-browser`, which also carries the
 * `.playwright` marker that gives dsh sessions their own daemon bucket.
 */
export interface Config {
  /** Dashboard server settings; omit the block to use the loopback defaults. */
  dashboard?: {
    /** Serve the monitoring dashboard (default true). */
    enabled?: boolean
    /** Loopback port (default 12789). */
    port?: number
    /** Bind host (default 127.0.0.1). */
    host?: string
  }
  /** Keep browser profiles on disk across restarts (default false). */
  persistent?: boolean
  /** Prefix for backend session names (default `dsh`). */
  sessionPrefix?: string
  /** Absolute path overriding the pinned playwright-cli entry. */
  cliPath?: string
  /** Absolute directory owning the daemon bucket and CLI working directory. */
  browserHome?: string
  /** Fail at load when no browser executable is found (default true). */
  requireBrowser?: boolean
  /** Byte bound on one CLI reply (default 65536). */
  maxOutputBytes?: number
  /** Wall-clock budget per command in ms (default 120000). */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  dashboard: z.object({
    enabled: z.boolean().default(true),
    port: z.number().default(12789),
    host: z.string().default('127.0.0.1'),
  }),
  persistent: z.boolean().default(false),
  sessionPrefix: z.string().default('dsh'),
  cliPath: z.string(),
  browserHome: z.string(),
  requireBrowser: z.boolean().default(true),
  maxOutputBytes: z.number().default(BROWSER_DEFAULT_MAX_OUTPUT_BYTES),
  timeoutMs: z.number().default(BROWSER_DEFAULT_TIMEOUT_MS),
})

/** Validated, defaulted provider config. */
export interface ResolvedConfig {
  readonly dashboardEnabled: boolean
  readonly port: number
  readonly host: string
  readonly persistent: boolean
  readonly sessionPrefix: string
  readonly cliPath: string
  readonly browserHome: string
  readonly maxOutputBytes: number
  readonly timeoutMs: number
}

/** System Chrome candidate paths by platform; playwright's `channel: chrome` launch uses these. */
/* v8 ignore start -- platform-conditional candidate list; the CI lane runs on one platform. */
const CHROME_CANDIDATES: readonly string[] = process.platform === 'darwin'
  ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  : process.platform === 'linux'
    ? ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
    : process.platform === 'win32'
      ? [path.join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe')]
      : []
/* v8 ignore stop */

/**
 * Whether a launchable browser exists: a playwright-managed build at the pinned core's computed
 * path, or a system Chrome candidate the CLI's `channel: chrome` launch can use.
 * @returns true when some browser is present.
 */
/* v8 ignore start -- real browser presence varies by host; e2e owns this environment probe. */
function browserAvailable(): boolean {
  return browserPresent(chromiumExecutablePath(), CHROME_CANDIDATES, existsSync)
}
/* v8 ignore stop */

/** The pinned core's computed browser path; a vendor throw degrades to "absent". */
/* v8 ignore next 1 -- vendor-dependent probe: whether playwright-core's executablePath() throws is a version fact, not a product branch */
function chromiumExecutablePath(): string {
  try {
    return chromium.executablePath()
  } catch (_noRegistryEntry) {
    return ''
  }
}

/**
 * Validate one field at load; a self-contained misconfiguration throws before serving.
 * @param config - raw browser-playwright configuration.
 * @returns the validated configuration with explicit defaults.
 */
export function assertConfig(config: Config): ResolvedConfig {
  const dashboard = config.dashboard ?? {}
  const port = dashboard.port ?? 12789
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`browser-playwright: dashboard port must be an integer in 1..65535, got ${String(port)}`)
  }
  const host = dashboard.host ?? '127.0.0.1'
  if (typeof host !== 'string' || host.trim() === '' || host.includes('\n')) {
    throw new Error('browser-playwright: dashboard host must be a single-line non-empty string')
  }
  const sessionPrefix = config.sessionPrefix ?? 'dsh'
  if (!/^[a-z0-9][a-z0-9._-]{0,31}$/.test(sessionPrefix)) {
    throw new Error(`browser-playwright: sessionPrefix must match ^[a-z0-9][a-z0-9._-]{0,31}$, got ${JSON.stringify(sessionPrefix)}`)
  }
  const timeoutMs = config.timeoutMs ?? BROWSER_DEFAULT_TIMEOUT_MS
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 2_147_483_647) {
    throw new Error(`browser-playwright: timeoutMs must be an integer in 1000..2147483647, got ${String(timeoutMs)}`)
  }
  const maxOutputBytes = config.maxOutputBytes ?? BROWSER_DEFAULT_MAX_OUTPUT_BYTES
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1_024) {
    throw new Error(`browser-playwright: maxOutputBytes must be an integer >= 1024, got ${String(maxOutputBytes)}`)
  }
  const require = createRequire(import.meta.url)
  const cliPath = config.cliPath
    ?? path.join(path.dirname(require.resolve('@playwright/cli/package.json')), 'playwright-cli.js')
  if (!existsSync(cliPath)) {
    throw new Error(`browser-playwright: playwright-cli entry not found at ${cliPath}; pin @playwright/cli or set cliPath`)
  }
  return {
    dashboardEnabled: dashboard.enabled ?? true,
    port,
    host,
    persistent: config.persistent ?? false,
    sessionPrefix,
    cliPath,
    browserHome: config.browserHome ?? path.join(process.cwd(), '.dsh-browser'),
    maxOutputBytes,
    timeoutMs,
  }
}

/** The playwright backend: one provider instance owns the CLI budget and the dashboard. */
export class PlaywrightBrowserProvider implements BrowserProvider {
  readonly id = 'playwright'

  /** Backend session name → last command verb, the provider's honest session record. */
  private readonly sessionMirror = new Map<string, string>()
  private readonly dashboard = new DashboardServer()
  private readonly browserPresent: boolean
  private readonly readyTimeoutMs = 15_000
  private readonly dashboardReady: Promise<void>
  private helpPromise: Promise<string> | undefined

  constructor(private readonly config: ResolvedConfig, browserPresent: boolean) {
    this.browserPresent = browserPresent
    if (!this.browserPresent) {
      throw new Error(
        'browser-playwright: no browser executable found; run `playwright-cli install-browser` '
        + 'or install Google Chrome, or set requireBrowser: false to defer the failure to execution',
      )
    }
    this.dashboardReady = this.config.dashboardEnabled
      ? this.startDashboard().catch((error: unknown) => {
        // Direct provider users still get a non-throwing optional dashboard;
        // the plugin apply path awaits this same promise and fails load loud.
        console.error('browser-playwright: dashboard failed to start', error)
        throw error
      })
      : Promise.resolve()
    void this.dashboardReady.catch(() => {})
  }

  available(): boolean {
    return this.browserPresent
  }

  help(): Promise<string> {
    this.helpPromise ??= this.loadHelp()
    return this.helpPromise
  }

  /** One spawn of the pinned CLI's global help, cached for the process lifetime. */
  private async loadHelp(): Promise<string> {
    const result = await runCli(process.execPath, this.config.cliPath, ['--help'], {
      cwd: this.config.browserHome,
      timeoutMs: this.config.timeoutMs,
      maxOutputBytes: this.config.maxOutputBytes,
    })
    if (result.exitCode !== 0) {
      throw new BrowserError(`browser --help failed (exit ${result.exitCode}):\n${result.output}`, 'BROWSER_COMMAND_FAILED')
    }
    return result.output
  }

  async run(
    sessionId: SessionId,
    command: string,
    args: readonly string[],
    signal?: AbortSignal,
  ): Promise<BrowserRunResult> {
    if (!isKnownCommand(command)) {
      throw new BrowserError(`unknown browser command "${command}"; run browser_help for the command list`, 'BROWSER_UNKNOWN_COMMAND')
    }
    assertArgs(args)
    await this.ensureHome()
    const name = sessionNameFor(String(sessionId), this.config.sessionPrefix)
    const argv = [...BROWSER_GLOBAL_COMMANDS.includes(command) ? [] : [`-s=${name}`], command, ...args]
    if (command === 'open' && this.config.persistent) argv.push('--persistent')
    const result = await runCli(process.execPath, this.config.cliPath, argv, {
      cwd: this.config.browserHome,
      timeoutMs: this.config.timeoutMs,
      maxOutputBytes: this.config.maxOutputBytes,
      ...signal !== undefined ? { signal } : {},
    })
    if (!BROWSER_GLOBAL_COMMANDS.includes(command)) this.sessionMirror.set(name, command)
    if (result.timedOut) {
      throw new BrowserError(`browser ${command} timed out after ${this.config.timeoutMs}ms`, 'BROWSER_COMMAND_TIMEOUT')
    }
    if (result.aborted) {
      throw new BrowserError(`browser ${command} aborted`, 'BROWSER_COMMAND_ABORTED')
    }
    if (result.exitCode !== 0) {
      throw new BrowserError(`browser ${command} failed (exit ${result.exitCode}):\n${result.output}`, 'BROWSER_COMMAND_FAILED')
    }
    return { output: result.output }
  }

  sessions(): Promise<readonly BrowserSessionInfo[]> {
    return Promise.resolve([...this.sessionMirror.keys()].map(name => ({ name })))
  }

  dashboardUrl(): string | undefined {
    return this.config.dashboardEnabled ? this.dashboard.url() : undefined
  }

  /** Wait until the optional dashboard is serving, or surface its startup failure. */
  async waitReady(): Promise<void> {
    await this.dashboardReady
  }

  async close(sessionId: SessionId): Promise<void> {
    const name = sessionNameFor(String(sessionId), this.config.sessionPrefix)
    const result = await runCli(process.execPath, this.config.cliPath, [`-s=${name}`, 'close'], {
      cwd: this.config.browserHome,
      timeoutMs: this.config.timeoutMs,
      maxOutputBytes: this.config.maxOutputBytes,
    })
    this.sessionMirror.delete(name)
    if (result.exitCode !== 0 && !/is not open/i.test(result.output)) {
      throw new BrowserError(`browser close failed (exit ${result.exitCode}):\n${result.output}`, 'BROWSER_COMMAND_FAILED')
    }
  }

  async closeAll(): Promise<void> {
    const result = await runCli(process.execPath, this.config.cliPath, ['close-all'], {
      cwd: this.config.browserHome,
      timeoutMs: this.config.timeoutMs,
      maxOutputBytes: this.config.maxOutputBytes,
    })
    this.sessionMirror.clear()
    if (result.exitCode !== 0) {
      throw new BrowserError(`browser close-all failed (exit ${result.exitCode}):\n${result.output}`, 'BROWSER_COMMAND_FAILED')
    }
  }

  /** Stop the dashboard group and best-effort close every browser; never rejects. */
  async dispose(): Promise<void> {
    /* v8 ignore next -- DashboardServer.stop() never rejects; teardown must remain total. */
    await this.dashboard.stop().catch(() => {})
    await this.closeAll().catch(() => {})
  }

  /** Create the browser home plus the `.playwright` marker that isolates the daemon bucket. */
  private async ensureHome(): Promise<void> {
    await mkdir(path.join(this.config.browserHome, PLAYWRIGHT_WORKSPACE_MARKER), { recursive: true })
  }

  /** Start the dashboard and return its readiness promise. */
  private async startDashboard(): Promise<void> {
    await this.ensureHome()
    await this.dashboard.start({
      node: process.execPath,
      cliPath: this.config.cliPath,
      port: this.config.port,
      host: this.config.host,
      workspaceDir: this.config.browserHome,
      readyTimeoutMs: this.readyTimeoutMs,
    })
  }
}

/** Reject malformed argument tokens before they reach the CLI. */
function assertArgs(args: readonly string[]): void {
  if (args.length > MAX_ARG_COUNT) {
    throw new BrowserError(`browser command accepts at most ${MAX_ARG_COUNT} argument tokens`, 'BROWSER_INVALID_ARGS')
  }
  for (const arg of args) {
    if (typeof arg !== 'string' || arg.length === 0) {
      throw new BrowserError('browser command arguments must be non-empty strings', 'BROWSER_INVALID_ARGS')
    }
    if (arg.length > MAX_ARG_CHARS) {
      throw new BrowserError(`browser command argument exceeds ${MAX_ARG_CHARS} characters`, 'BROWSER_INVALID_ARGS')
    }
  }
}

/**
 * Register the playwright backend on the seam; the dashboard and browser processes die with
 * this plugin's fiber.
 * @param ctx - Cordis context carrying the `browser` service.
 * @param config - validated, defaulted plugin config.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const resolved = assertConfig(config)
  const provider = new PlaywrightBrowserProvider(resolved, browserPresentFor(config))
  ctx.browser.register(provider)
  try {
    await provider.waitReady()
  } catch (error: unknown) {
    await provider.dispose()
    throw error
  }
  ctx.effect(() => {
    return async () => { await provider.dispose() }
  }, 'browser-playwright: provider teardown')
}

/** Resolve the load-time availability verdict from the requireBrowser config. */
/* v8 ignore start -- the default requireBrowser path depends on the host's browser installation. */
function browserPresentFor(config: Config): boolean {
  return (config.requireBrowser ?? true) ? browserAvailable() : true
}
/* v8 ignore stop */
