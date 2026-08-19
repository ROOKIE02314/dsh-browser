/**
 * Managed lifecycle for the playwright `show` dashboard: spawns the CLI's dashboard app in its
 * own process group, keeps its parent-liveness stdin pipe open, waits for the HTTP surface to
 * answer, and tears the group down on dispose. The dashboard serves the live screencast the web
 * GUI embeds.
 * @module @deepseek-ai/dsh-browser-playwright/dashboard
 */

import { spawn, type ChildProcess } from 'node:child_process'
import http from 'node:http'

/** Start parameters for one dashboard instance. */
export interface DashboardOptions {
  /** Node executable to run the CLI with. */
  readonly node: string
  /** Absolute path of the pinned playwright-cli entry. */
  readonly cliPath: string
  /** Loopback port to bind. */
  readonly port: number
  /** Bind host. */
  readonly host: string
  /** Workspace root the dashboard groups sessions under (matches CLI invocations). */
  readonly workspaceDir: string
  /** Deadline for the HTTP readiness probe. */
  readonly readyTimeoutMs: number
}

/** HTTP readiness probe interval. */
const READY_POLL_MS = 250

/** Group teardown grace before SIGKILL. */
const STOP_GRACE_MS = 3_000

/**
 * One dashboard server instance. `start` is single-flight; a child that exits on its own clears
 * the URL so readers observe the surface disappearing.
 */
export class DashboardServer {
  private child: ChildProcess | undefined
  private urlValue: string | undefined
  private starting: Promise<void> | undefined

  /**
   * The dashboard's origin while serving, or undefined.
   * @returns the serving origin, or undefined when the dashboard is stopped.
   */
  url(): string | undefined {
    return this.urlValue
  }

  /**
   * Start the dashboard and wait until its HTTP surface answers.
   * @param options - bind and readiness parameters.
   * @returns resolves once the surface is up; rejects when the child exits first or the
   * readiness deadline expires.
   */
  async start(options: DashboardOptions): Promise<void> {
    if (this.child !== undefined) return
    this.starting ??= this.startOnce(options)
    return this.starting
  }

  private async startOnce(options: DashboardOptions): Promise<void> {
    const child = spawn(options.node, [
      options.cliPath,
      'show',
      `--port=${options.port}`,
      `--host=${options.host}`,
    ], {
      cwd: options.workspaceDir,
      env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
      // playwright-cli treats stdin closure as parent death and shuts the dashboard down.
      stdio: ['pipe', 'ignore', 'ignore'],
      detached: true,
    })
    this.child = child
    child.once('exit', () => {
      if (this.child === child) {
        this.child = undefined
        this.urlValue = undefined
        this.starting = undefined
      }
    })
    try {
      await this.waitReady(`http://${options.host}:${options.port}/`, options.readyTimeoutMs, child)
    } catch (error) {
      this.starting = undefined
      throw error
    }
    this.urlValue = `http://${options.host}:${options.port}/`
  }

  /** Poll the dashboard origin until it answers successfully or redirects, the child exits, or the deadline expires. */
  private async waitReady(origin: string, readyTimeoutMs: number, child: ChildProcess): Promise<void> {
    const deadline = Date.now() + readyTimeoutMs
    for (;;) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`playwright dashboard exited before serving (exit ${child.exitCode ?? 'signal'})`)
      }
      const ok = await probe(origin)
      if (ok) return
      if (Date.now() >= deadline) {
        throw new Error(`playwright dashboard did not answer on ${origin} within ${readyTimeoutMs}ms`)
      }
      await new Promise(resolve => setTimeout(resolve, READY_POLL_MS))
    }
  }

  /** Stop the dashboard and wait for its process group to settle. Idempotent. */
  async stop(): Promise<void> {
    const child = this.child
    const pid = child?.pid
    if (child === undefined || pid === undefined) return
    // Stopped is a synchronous fact: a late exit must not clear a successor's state.
    this.child = undefined
    this.urlValue = undefined
    this.starting = undefined
    const exited = new Promise<void>((resolve) => {
      child.once('exit', () => { resolve() })
    })
    try {
      process.kill(-pid, 'SIGTERM')
    } catch (_noSuchGroup) {
      // The group leader already exited; the exit listener settles below.
    }
    const grace = setTimeout(() => {
      /* v8 ignore next 5 -- SIGKILL escalation handles a SIGTERM-ignoring child. */
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {
        // Nothing left to kill.
      }
    }, STOP_GRACE_MS)
    grace.unref()
    await exited
    clearTimeout(grace)
  }
}

/** One-shot GET probe; answers false on connection failure, timeout, or a status outside 2xx/3xx. */
function probe(origin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = http.get(origin, (response) => {
      resolve(response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 400)
      response.resume()
    })
    request.setTimeout(1_000, () => request.destroy())
    request.once('error', () => { resolve(false) })
  })
}
