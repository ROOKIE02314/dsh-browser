import { describe, expect, it } from 'vitest'
import {
  BROWSER_COMMANDS,
  BROWSER_DEFAULT_MAX_OUTPUT_BYTES,
  BROWSER_DEFAULT_TIMEOUT_MS,
  BROWSER_GLOBAL_COMMANDS,
  isKnownCommand,
  sessionNameFor,
  truncationMarker,
} from '../src/cli.ts'

describe('cli vocabulary', () => {
  it('accepts every pinned verb and rejects unknown ones', () => {
    expect(BROWSER_COMMANDS.length).toBeGreaterThan(50)
    for (const command of BROWSER_COMMANDS) expect(isKnownCommand(command)).toBe(true)
    expect(isKnownCommand('explode')).toBe(false)
    expect(isKnownCommand('')).toBe(false)
    expect(isKnownCommand('open; rm -rf')).toBe(false)
  })

  it('ships positive budget defaults', () => {
    expect(BROWSER_DEFAULT_MAX_OUTPUT_BYTES).toBeGreaterThan(0)
    expect(BROWSER_DEFAULT_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('marks only whole-backend commands as global', () => {
    expect(BROWSER_GLOBAL_COMMANDS).toEqual(['close-all', 'kill-all'])
  })
})

describe('sessionNameFor', () => {
  it('prefixes and lowercases a session id', () => {
    expect(sessionNameFor('Session-ABC-123', 'dsh')).toBe('dsh-session-abc-123')
  })

  it('replaces non-filesystem-safe characters', () => {
    expect(sessionNameFor('a/b\\c:d e', 'dsh')).toBe('dsh-a_b_c_d_e')
  })

  it('caps the body at 64 characters', () => {
    const long = 'x'.repeat(100)
    const name = sessionNameFor(long, 'dsh')
    expect(name.length).toBeLessThanOrEqual(4 + 64)
    expect(name.startsWith('dsh-')).toBe(true)
  })
})

describe('truncationMarker', () => {
  it('names the dropped byte count', () => {
    expect(truncationMarker(123)).toBe('\n[output truncated: 123 bytes beyond bound]')
  })
})
