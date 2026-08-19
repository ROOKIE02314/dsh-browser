import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { beforeEach, describe, expect, it } from 'vitest'
import { applyBrowserFeed, emptyBrowserFeedState } from '../src/projection.ts'
import type { BrowserFeedState } from '../src/projection.ts'

let seqCounter = 0

beforeEach(() => {
  seqCounter = 0
})

/** Build one envelope-shaped session event with a fresh seq. */
function event(type: SessionEvent['type'], data: unknown): SessionEvent {
  return { type, seq: ++seqCounter, time: seqCounter * 1000, data } as SessionEvent
}

/** Fold a list of events from the empty state with default bounds. */
function fold(
  events: SessionEvent[],
  state: BrowserFeedState = emptyBrowserFeedState(),
  maxEntries = 200,
  excerptChars = 512,
): BrowserFeedState {
  return events.reduce((current, next) => applyBrowserFeed(current, next, maxEntries, excerptChars), state)
}

describe('applyBrowserFeed', () => {
  it('returns the same reference for unrelated events', () => {
    const state = emptyBrowserFeedState()
    expect(applyBrowserFeed(state, event('user/message', {}), 200, 512)).toBe(state)
    expect(applyBrowserFeed(state, event('tool/call', { callId: 'c1', name: 'bash', arguments: {} }), 200, 512)).toBe(state)
    expect(applyBrowserFeed(state, event('tool/result', { message: { content: [] } }), 200, 512)).toBe(state)
  })

  it('prepends a running entry on a browser tool/call and flips open', () => {
    const state = fold([
      event('tool/call', { callId: 'c1', name: 'browser', arguments: { command: 'open', args: ['https://example.com'] } }),
    ])
    expect(state.open).toBe(true)
    expect(state.entries).toHaveLength(1)
    expect(state.entries[0]!).toMatchObject({
      callId: 'c1',
      action: 'open',
      args: ['https://example.com'],
      outcome: 'running',
      excerpt: '',
      at: 1000,
    })
  })

  it('finalizes the running entry on its tool/result', () => {
    const state = fold([
      event('tool/call', { callId: 'c1', name: 'browser', arguments: { command: 'click', args: ['e21'] } }),
      event('tool/result', {
        message: {
          content: [{ type: 'tool-result', toolCallId: 'c1', content: [{ type: 'text', text: 'Clicked' }], isError: false }],
        },
      }),
    ])
    expect(state.entries).toHaveLength(1)
    expect(state.entries[0]!).toMatchObject({ outcome: 'ok', excerpt: 'Clicked' })
    expect(state.pending).toEqual({})
  })

  it('finalizes the matching entry while newer rows pass through unchanged', () => {
    const state = fold([
      event('tool/call', { callId: 'c1', name: 'browser', arguments: { command: 'open', args: [] } }),
      event('tool/call', { callId: 'c2', name: 'browser', arguments: { command: 'snapshot', args: [] } }),
      event('tool/result', {
        message: {
          content: [{ type: 'tool-result', toolCallId: 'c1', content: [{ type: 'text', text: 'opened' }] }],
        },
      }),
    ])
    expect(state.entries[1]!).toMatchObject({ callId: 'c1', outcome: 'ok', excerpt: 'opened' })
    expect(state.entries[0]!).toMatchObject({ callId: 'c2', outcome: 'running' })
  })

  it('tolerates non-array content and non-text blocks in the excerpt', () => {
    const state = fold([
      event('tool/call', { callId: 'c1', name: 'browser', arguments: { command: 'open', args: [] } }),
      event('tool/result', {
        message: {
          content: [{
            type: 'tool-result',
            toolCallId: 'c1',
            content: [{ type: 'image', source: {} }, { type: 'text', text: 42 }, 'junk'],
          }],
        },
      }),
    ])
    expect(state.entries[0]!.excerpt).toBe('')
    const nonArray = fold([
      event('tool/code-dispatch', {
        subCallId: 'run:code:9',
        name: 'browser',
        arguments: { command: 'snapshot', args: [] },
        isError: false,
        content: 'not-an-array',
      }),
    ])
    expect(nonArray.entries[0]!.excerpt).toBe('')
  })

  it('marks a failing result as error and flips open on close', () => {
    const state = fold([
      event('tool/call', { callId: 'c1', name: 'browser', arguments: { command: 'open', args: [] } }),
      event('tool/result', {
        message: {
          content: [{ type: 'tool-result', toolCallId: 'c1', content: [{ type: 'text', text: 'boom' }], isError: true }],
        },
      }),
      event('tool/call', { callId: 'c2', name: 'browser', arguments: { command: 'close', args: [] } }),
    ])
    expect(state.entries[1]!).toMatchObject({ callId: 'c1', outcome: 'error', excerpt: 'boom' })
    expect(state.entries[0]!).toMatchObject({ callId: 'c2', outcome: 'running' })
    expect(state.open).toBe(false)
  })

  it('lands a settled Code Mode dispatch fully formed', () => {
    const state = fold([
      event('tool/code-dispatch', {
        subCallId: 'run:code:1',
        name: 'browser',
        arguments: { command: 'goto', args: ['https://example.com'] },
        isError: false,
        content: [{ type: 'text', text: 'navigated' }],
      }),
    ])
    expect(state.entries).toHaveLength(1)
    expect(state.entries[0]!).toMatchObject({ callId: 'run:code:1', action: 'goto', outcome: 'ok', excerpt: 'navigated' })
  })

  it('marks a failing Code Mode dispatch as error and skips foreign tools', () => {
    const state = fold([
      event('tool/code-dispatch', {
        subCallId: 'run:code:2',
        name: 'browser',
        arguments: { command: 'click', args: ['e21'] },
        isError: true,
        content: [{ type: 'text', text: 'boom' }],
      }),
      event('tool/code-dispatch', {
        subCallId: 'run:code:3',
        name: 'bash',
        arguments: { command: 'ls' },
        isError: false,
        content: [],
      }),
    ])
    expect(state.entries).toHaveLength(1)
    expect(state.entries[0]!).toMatchObject({ outcome: 'error', excerpt: 'boom' })
  })

  it('ignores malformed tool/result messages without a tool-result block', () => {
    const state = emptyBrowserFeedState()
    expect(applyBrowserFeed(state, event('tool/result', { message: { content: [] } }), 200, 512)).toBe(state)
    expect(applyBrowserFeed(state, event('tool/result', { message: { content: [{ type: 'text', text: 'x' }] } }), 200, 512)).toBe(state)
  })

  it('ignores a tool/result whose callId has no pending entry', () => {
    const state = emptyBrowserFeedState()
    const next = applyBrowserFeed(state, event('tool/result', {
      message: {
        content: [{ type: 'tool-result', toolCallId: 'ghost', content: [{ type: 'text', text: 'x' }] }],
      },
    }), 200, 512)
    expect(next).toBe(state)
  })

  it('caps native call entries too and sticks the truncated flag', () => {
    const events = Array.from({ length: 4 }, (_, index) => event('tool/call', {
      callId: `c${index}`,
      name: 'browser',
      arguments: { command: 'snapshot', args: [] },
    }))
    const state = fold(events, emptyBrowserFeedState(), 2)
    expect(state.entries).toHaveLength(2)
    expect(state.truncated).toBe(true)
    expect(state.entries[0]!.callId).toBe('c3')
    expect(state.entries[1]!.callId).toBe('c2')
  })

  it('caps entries and sticks the truncated flag', () => {
    const events = Array.from({ length: 5 }, (_, index) => event('tool/code-dispatch', {
      subCallId: `run:code:${index}`,
      name: 'browser',
      arguments: { command: 'snapshot', args: [] },
      isError: false,
      content: [],
    }))
    const state = fold(events, emptyBrowserFeedState(), 3)
    expect(state.entries).toHaveLength(3)
    expect(state.truncated).toBe(true)
    expect(state.entries[0]!.callId).toBe('run:code:4')
    expect(state.entries[2]!.callId).toBe('run:code:2')
  })

  it('caps the reply excerpt with an ellipsis', () => {
    const state = fold([
      event('tool/result', {
        message: {
          content: [{ type: 'tool-result', toolCallId: 'c1', content: [{ type: 'text', text: 'x'.repeat(100) }] }],
        },
      }),
    ], fold([
      event('tool/call', { callId: 'c1', name: 'browser_help', arguments: {} }),
    ]), 200, 10)
    expect(state.entries[0]!.excerpt).toBe(`${'x'.repeat(10)}…`)
  })

  it('replays deterministically from the empty state', () => {
    const events = [
      event('tool/call', { callId: 'c1', name: 'browser', arguments: { command: 'open', args: ['https://example.com'] } }),
      event('tool/result', {
        message: {
          content: [{ type: 'tool-result', toolCallId: 'c1', content: [{ type: 'text', text: 'ok' }] }],
        },
      }),
    ]
    const once = fold(events)
    const twice = fold(events)
    expect(twice).toEqual(once)
  })

  it('extracts the command defensively from non-object arguments', () => {
    const state = fold([
      event('tool/call', { callId: 'c1', name: 'browser', arguments: 'not-an-object' }),
    ])
    expect(state.entries[0]!).toMatchObject({ action: 'browser', args: [] })
  })
})
