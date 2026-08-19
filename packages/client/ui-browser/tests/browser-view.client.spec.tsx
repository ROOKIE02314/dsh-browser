// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HostDescription, HostDescriptionSource } from '@deepseek-ai/dsh-client-connection/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { BrowserFeed } from '@deepseek-ai/dsh-tool-browser/types'
import type { BrowserViewProps } from '../src/client/BrowserView.tsx'
import { BrowserView } from '../src/client/BrowserView.tsx'
import { apply as applyInvariant } from '../src/invariant.ts'
import { apply as applyNode } from '../src/index.ts'
import { apply, inject } from '../src/client/index.ts'
import { en, zh } from '../src/client/locales.ts'

afterEach(cleanup)

const SESSION_1 = 'session-1' as SessionId
const SESSION_2 = 'session-2' as SessionId

const t = ((key: string) => ({
  'tab.browser': 'Browser',
  'dashboard.title': 'Playwright dashboard',
  'dashboard.unavailable': 'Dashboard unavailable',
  'dashboard.replay': 'The feed below is replayable from the session log.',
  'feed.title': 'Browser actions',
  'feed.empty': 'No browser actions yet.',
  'feed.truncated': 'Older actions omitted',
  'feed.running': 'Running',
  'feed.ok': 'Done',
  'feed.error': 'Error',
  'feed.args': 'Arguments',
  'feed.result': 'Result',
}[key] ?? key)) as BrowserViewProps['t']

const source = (value: HostDescription | undefined): HostDescriptionSource => ({
  getSnapshot: () => value,
  subscribe: () => () => {},
})

function renderBrowser(
  feed: BrowserFeed | undefined,
  overrides: Partial<BrowserViewProps> = {},
) {
  const onSelectView = vi.fn()
  const openDetails = vi.fn()
  const useProjection = ((key: string) => key === 'browser/feed' ? feed : undefined) as BrowserViewProps['useProjection']
  const useHostDescription = ((selector: (value: HostDescription | undefined) => unknown) => selector(
    source({ version: 'test', cwd: '/workspace', provider: 'playwright', model: 'test', attachedSessions: 1, canOpenPath: false }).getSnapshot(),
  )) as BrowserViewProps['useHostDescription']
  const view = render(
    <BrowserView
      activeView="tool"
      onSelectView={onSelectView}
      useProjection={useProjection}
      useHostDescription={useHostDescription}
      openDetails={openDetails}
      sessionId={SESSION_1}
      useSession={() => undefined as never}
      useSessions={() => undefined as never}
      useWorkspaces={() => undefined as never}
      useInput={() => undefined as never}
      inputActions={{} as never}
      t={t}
      {...overrides}
    />,
  )
  return { ...view, onSelectView, openDetails }
}

describe('BrowserView', () => {
  it('renders an empty replay panel without opening details', () => {
    const view = renderBrowser(undefined)
    expect(screen.getByText('Dashboard unavailable')).toBeTruthy()
    expect(screen.getByText('No browser actions yet.')).toBeTruthy()
    expect(view.onSelectView).not.toHaveBeenCalled()
    expect(view.openDetails).not.toHaveBeenCalled()
  })

  it('renders live dashboard and action outcomes, then opens once for the first action', () => {
    const feed: BrowserFeed = {
      entries: [
        { callId: 'err', action: 'click', args: ['#submit'], outcome: 'error', excerpt: 'no node', at: 1_700_000_000_000 },
        { callId: 'run', action: 'snapshot', args: [], outcome: 'running', excerpt: '', at: 1_700_000_001_000 },
        { callId: 'ok', action: 'open', args: ['https://example.com'], outcome: 'ok', excerpt: '<html>', at: 1_700_000_002_000 },
      ],
      truncated: true,
      open: true,
    }
    const dashboardUrl = 'http://127.0.0.1:9333/'
    const view = renderBrowser(feed, {
      activeView: 'browser',
      useHostDescription: selector => selector({
        version: 'test', cwd: '/workspace', provider: 'playwright', model: 'test', attachedSessions: 1, canOpenPath: false,
        browser: { dashboardUrl },
      }),
    })
    expect(view.container.querySelector('iframe')?.getAttribute('src')).toBe(dashboardUrl)
    expect(screen.getByText('Older actions omitted')).toBeTruthy()
    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.getByText('Done')).toBeTruthy()
    expect(screen.getByText('Error')).toBeTruthy()
    expect(screen.getByText('https://example.com')).toBeTruthy()
    expect(screen.getByText('no node')).toBeTruthy()
    expect(view.onSelectView).toHaveBeenCalledOnce()
    expect(view.onSelectView).toHaveBeenCalledWith('browser')
    expect(view.openDetails).toHaveBeenCalledOnce()

    view.rerender(
      <BrowserView
        activeView="browser"
        onSelectView={view.onSelectView}
        useProjection={(key: string) => key === 'browser/feed' ? feed : undefined}
        useHostDescription={selector => selector({
          version: 'test', cwd: '/workspace', provider: 'playwright', model: 'test', attachedSessions: 1, canOpenPath: false,
          browser: { dashboardUrl },
        })}
        openDetails={view.openDetails}
        sessionId={SESSION_1}
        useSession={() => undefined as never}
        useSessions={() => undefined as never}
        useWorkspaces={() => undefined as never}
        useInput={() => undefined as never}
        inputActions={{} as never}
        t={t}
      />,
    )
    expect(view.openDetails).toHaveBeenCalledOnce()
  })

  it('reopens for a new host generation and uses the English dictionaries', () => {
    expect(en['dashboard.title']).toBe('Playwright live browser')
    expect(zh['dashboard.title']).toBe('Playwright 实时浏览器')
    const feed: BrowserFeed = {
      entries: [{ callId: 'open', action: 'open', args: [], outcome: 'ok', excerpt: '', at: 1_700_000_000_000 }],
      truncated: false,
      open: true,
    }
    const first = renderBrowser(feed)
    expect(first.openDetails).toHaveBeenCalledOnce()
    first.rerender(
      <BrowserView
        activeView="tool"
        onSelectView={first.onSelectView}
        useProjection={(key: string) => key === 'browser/feed' ? feed : undefined}
        useHostDescription={selector => selector(undefined)}
        openDetails={first.openDetails}
        sessionId={SESSION_2}
        useSession={() => undefined as never}
        useSessions={() => undefined as never}
        useWorkspaces={() => undefined as never}
        useInput={() => undefined as never}
        inputActions={{} as never}
        t={t}
      />,
    )
    expect(first.openDetails).toHaveBeenCalledTimes(2)
  })
})

describe('package registration', () => {
  it('registers the client details entry and invariant companion', async () => {
    const registered: Array<{ label?: () => string; inject?: () => unknown }> = []
    const hostDescription = source(undefined)
    const ctx = {
      get: (key: string) => key === 'connection' ? { hostDescription } : undefined,
      locale: { bind: () => t, register: () => () => {} },
      slots: {
        inject: (_name: string, factory: () => unknown) => { factory() },
        register: (entry: { label?: () => string; inject?: () => unknown }) => { registered.push(entry); return () => {} },
      },
      layout: { openDetails: vi.fn() },
      effect: (effect: () => unknown) => effect(),
    }
    apply(ctx as never)
    expect(registered).toHaveLength(1)
    expect(registered[0]?.label?.()).toBe('Browser')
    const injected = registered[0]?.inject?.() as { openDetails: () => void; hooks: { hostDescription: HostDescriptionSource } }
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- Vitest asymmetric matcher is typed as any.
    expect(injected).toEqual({ openDetails: expect.any(Function), hooks: { hostDescription } })
    injected.openDetails()
    expect(ctx.layout.openDetails).toHaveBeenCalledOnce()
    expect(inject).toEqual(['slots', 'locale', 'connection', 'layout'])
    expect(() => { applyNode() }).not.toThrow()

    const registrations: string[] = []
    const dispose = await applyInvariant({
      invariants: { register: (name: string, install: () => void) => { registrations.push(name); install(); return () => {} } },
    } as never)
    expect(registrations).toEqual(['@deepseek-ai/dsh-client-ui-browser'])
    expect(dispose).toBeTypeOf('function')
  })
})
