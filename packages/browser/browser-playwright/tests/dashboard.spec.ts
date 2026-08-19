import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { DashboardServer } from '../src/dashboard.ts'

const fixture = fileURLToPath(new URL('./fixtures/fake-cli.mjs', import.meta.url))

const servers: DashboardServer[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.stop()))
})

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

function options(port: number, readyTimeoutMs = 2_000): Parameters<DashboardServer['start']>[0] {
  return {
    node: process.execPath,
    cliPath: fixture,
    port,
    host: '127.0.0.1',
    workspaceDir: '/',
    readyTimeoutMs,
  }
}

/** Build a tracked server under the given fixture mode. */
function tracked(mode: string): DashboardServer {
  process.env.FAKE_CLI_MODE = mode
  const server = new DashboardServer()
  servers.push(server)
  return server
}

describe('DashboardServer', () => {
  it('serves a URL once the HTTP surface answers, and clears it on stop', async () => {
    const port = await freePort()
    const server = tracked('dashboard')
    await server.start(options(port))
    expect(server.url()).toBe(`http://127.0.0.1:${port}/`)
    await server.stop()
    expect(server.url()).toBeUndefined()
  })

  it('keeps the parent pipe open and accepts the dashboard root redirect as ready', async () => {
    const port = await freePort()
    const server = tracked('redirect')
    await server.start(options(port))
    expect(server.url()).toBe(`http://127.0.0.1:${port}/`)
  })

  it('rejects when the child exits before serving', async () => {
    const port = await freePort()
    const server = tracked('fail')
    await expect(server.start(options(port))).rejects.toThrow(/exited before serving/)
  })

  it('rejects when the child is killed by a signal before serving', async () => {
    const port = await freePort()
    const server = tracked('suicide')
    await expect(server.start(options(port, 3_000))).rejects.toThrow(/exit signal/)
  })

  it('rejects when the readiness deadline expires with no surface', async () => {
    const port = await freePort()
    const server = tracked('silent')
    await expect(server.start(options(port, 300))).rejects.toThrow(/did not answer/)
    await server.stop()
  })

  it('rejects when the surface accepts but never answers (probe timeout)', async () => {
    const port = await freePort()
    const server = tracked('hang')
    await expect(server.start(options(port, 1_200))).rejects.toThrow(/did not answer/)
    await server.stop()
  })

  it('start is single-flight and returns the served URL on re-entry', async () => {
    const port = await freePort()
    const server = tracked('dashboard')
    await server.start(options(port))
    await expect(server.start(options(port))).resolves.toBeUndefined()
    expect(server.url()).toBe(`http://127.0.0.1:${port}/`)
    await server.stop()
  })

  it('escalates to SIGKILL when the child ignores SIGTERM', async () => {
    const port = await freePort()
    const server = tracked('stubborn')
    await server.start(options(port))
    const started = Date.now()
    await server.stop()
    // The grace period (3s) elapsed before the group died.
    expect(Date.now() - started).toBeGreaterThanOrEqual(2_500)
    expect(server.url()).toBeUndefined()
  })

  it('stop is idempotent before any start', async () => {
    const server = tracked('echo')
    await expect(server.stop()).resolves.toBeUndefined()
    await expect(server.stop()).resolves.toBeUndefined()
    expect(server.url()).toBeUndefined()
  })
})
