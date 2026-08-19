import { mkdtemp, rm } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { runCli } from '../src/spawn.ts'

const fixture = fileURLToPath(new URL('./fixtures/fake-cli.mjs', import.meta.url))
const node = process.execPath

const tempDirs: string[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'browser-spawn-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

/** One run against the fixture with the given mode. */
function run(mode: string, args: readonly string[] = ['goto', 'https://example.com'], options: Partial<Parameters<typeof runCli>[3]> = {}): ReturnType<typeof runCli> {
  process.env.FAKE_CLI_MODE = mode
  return runCli(node, fixture, args, {
    cwd: options.cwd ?? '/',
    timeoutMs: options.timeoutMs ?? 10_000,
    maxOutputBytes: options.maxOutputBytes ?? 65_536,
    ...options.signal !== undefined ? { signal: options.signal } : {},
    ...options,
  })
}

describe('runCli', () => {
  it('collects a successful stdout reply with the full argv', async () => {
    const result = await run('echo')
    expect(result).toMatchObject({ exitCode: 0, timedOut: false, aborted: false, truncatedBytes: 0 })
    expect(result.output).toContain('fake-cli: goto https://example.com')
  })

  it('appends stderr when the child exits non-zero', async () => {
    const result = await run('fail')
    expect(result.exitCode).toBe(2)
    expect(result.output).toContain('fake-cli failure line')
  })

  it('kills a slow child and reports the timeout', async () => {
    const result = await run('slow', ['open', 'https://example.com'], { timeoutMs: 300 })
    expect(result.timedOut).toBe(true)
    expect(result.exitCode).toBeNull()
    expect(result.aborted).toBe(false)
  })

  it('honors a caller abort signal', async () => {
    const controller = new AbortController()
    const pending = run('slow', ['open', 'https://example.com'], { signal: controller.signal })
    controller.abort()
    const result = await pending
    expect(result.aborted).toBe(true)
    expect(result.timedOut).toBe(false)
  })

  it('handles a signal that is already aborted at spawn', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await run('slow', ['open', 'https://example.com'], { signal: controller.signal })
    expect(result.aborted).toBe(true)
    expect(result.timedOut).toBe(false)
  })

  it('caps combined output at the byte bound and reports the dropped count', async () => {
    const result = await run('big', ['snapshot'], { maxOutputBytes: 1_000 })
    expect(result.truncatedBytes).toBeGreaterThan(0)
    expect(Buffer.byteLength(result.output)).toBeLessThan(2_000)
    expect(result.output).toContain('bytes beyond bound')
  })

  it('reports a missing cli module as a non-zero exit', async () => {
    const result = await runCli(node, '/nonexistent/cli.js', [], {
      cwd: await tempDir(),
      timeoutMs: 5_000,
      maxOutputBytes: 4_096,
    })
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('Cannot find module')
  })

  it('runs the child in the given cwd', async () => {
    const cwd = await tempDir()
    const result = await run('pwd', ['config-print'], { cwd })
    // macOS resolves /var → /private/var; compare the canonical path.
    expect(realpathSync(result.output.trimEnd())).toBe(realpathSync(cwd))
  })
})
