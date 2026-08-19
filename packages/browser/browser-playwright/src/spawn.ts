/**
 * Bounded child-process runner for the playwright CLI: one invocation per call, stdout/stderr
 * collected under one byte bound, wall-clock timeout, cooperative abort, and process-group
 * termination on teardown.
 * @module @deepseek-ai/dsh-browser-playwright/spawn
 */

import { spawn } from 'node:child_process'

/** Settled outcome of one CLI invocation. */
export interface SpawnResult {
  /** Exit code, or null when the child was killed (timeout, abort, or a kill signal). */
  readonly exitCode: number | null
  /** The wall-clock budget expired before the child exited. */
  readonly timedOut: boolean
  /** The caller's abort signal fired. */
  readonly aborted: boolean
  /** Bounded reply text (stdout, with stderr appended when the run did not succeed). */
  readonly output: string
  /** Bytes dropped from stdout+stderr past the byte bound. */
  readonly truncatedBytes: number
}

/** One invocation's knobs. */
export interface SpawnOptions {
  /** Working directory handed to the CLI (its workspace root). */
  readonly cwd: string
  /** Wall-clock budget before the child is terminated. */
  readonly timeoutMs: number
  /** Total byte bound on stdout+stderr combined. */
  readonly maxOutputBytes: number
  /** Optional cooperative cancellation forwarded from the tool execution. */
  readonly signal?: AbortSignal
}

/** Grace period between SIGTERM and SIGKILL while settling a killed child. */
const KILL_GRACE_MS = 3_000

/**
 * Run one CLI invocation to completion and collect its bounded reply.
 * @param node - node executable.
 * @param cliPath - absolute path of the pinned playwright-cli entry.
 * @param args - CLI arguments after the executable.
 * @param options - budget and cancellation knobs.
 * @returns the settled outcome; a spawn-level failure (missing executable) rejects.
 */
export async function runCli(
  node: string,
  cliPath: string,
  args: readonly string[],
  options: SpawnOptions,
): Promise<SpawnResult> {
  const buffers: Buffer[] = []
  const errorBuffers: Buffer[] = []
  let totalBytes = 0
  let truncatedBytes = 0
  let timedOut = false
  let aborted = false

  const child = spawn(node, [cliPath, ...args], {
    cwd: options.cwd,
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  /** Assemble the bounded reply: stdout, with stderr appended when the run did not succeed. */
  const renderOutput = (): string => {
    const failed = timedOut || aborted || child.exitCode !== 0
    const parts: string[] = []
    const stdout = Buffer.concat(buffers).toString('utf8')
    if (stdout.length > 0) parts.push(stdout)
    if (failed) {
      const stderr = Buffer.concat(errorBuffers).toString('utf8')
      if (stderr.length > 0) parts.push(stderr)
    }
    let text = parts.join('\n').trimEnd()
    if (truncatedBytes > 0) text += `\n[output truncated: ${truncatedBytes} bytes beyond bound]`
    return text
  }

  const push = (chunk: Buffer, into: Buffer[]): void => {
    const room = options.maxOutputBytes - totalBytes
    if (room <= 0) {
      truncatedBytes += chunk.length
      return
    }
    if (chunk.length <= room) {
      into.push(chunk)
      totalBytes += chunk.length
      return
    }
    into.push(chunk.subarray(0, room))
    truncatedBytes += chunk.length - room
    totalBytes = options.maxOutputBytes
  }

  child.stdout.on('data', (chunk: Buffer) => { push(chunk, buffers) })
  child.stderr.on('data', (chunk: Buffer) => { push(chunk, errorBuffers) })

  const killChild = (): void => {
    /* v8 ignore next 1 -- race-only arm: a second kill after the child already exited cannot be timed deterministically */
    if (child.exitCode !== null || child.signalCode !== null) return
    try {
      child.kill('SIGTERM')
    } catch {
      /* v8 ignore next -- only the exit-between-check-and-kill race reaches this arm */
      return
    }
    /* v8 ignore next 1 -- SIGKILL escalation handles a SIGTERM-ignoring child. */
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill('SIGKILL')
        } catch {
          // The child exited between the check and the kill.
        }
      }
    }, KILL_GRACE_MS).unref()
  }

  const timer = setTimeout(() => {
    timedOut = true
    killChild()
  }, options.timeoutMs)

  const onAbort = () => {
    aborted = true
    killChild()
  }
  if (options.signal !== undefined) {
    if (options.signal.aborted) onAbort()
    else options.signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    return await new Promise<SpawnResult>((resolve, reject) => {
      /* v8 ignore next 5 -- process.execPath spawn errors are host-level only. */
      child.once('error', (error: Error) => {
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
        reject(error)
      })
      child.once('exit', (code: number | null) => {
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
        resolve({
          exitCode: code,
          timedOut,
          aborted,
          output: renderOutput(),
          truncatedBytes,
        })
      })
    })
  } finally {
    options.signal?.removeEventListener('abort', onAbort)
  }
}
