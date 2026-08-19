import { useEffect, useRef } from 'react'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { BrowserFeed } from '@deepseek-ai/dsh-tool-browser/types'
import type { BrowserViewInjected } from './index.ts'
import type { BrowserKey } from './locales.ts'
import css from './BrowserView.module.css'

/** Full browser details-tab props from the runtime and injected host face. */
export type BrowserViewProps = PropsRuntime<'conversation.details.view'>
  & InjectFace<BrowserViewInjected>
  & PropsLocale<'browser'>

/** Format a durable event timestamp without adding client-side state. */
function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** Render the dashboard and replay-derived browser action feed. */
export function BrowserView({ activeView, onSelectView, useProjection, useHostDescription, openDetails, sessionId, t }: BrowserViewProps) {
  const feed = useProjection('browser/feed')
  const dashboardUrl = useHostDescription(description => description?.browser?.dashboardUrl)
  const autoOpened = useRef(false)
  const entries = feed?.entries ?? []

  useEffect(() => {
    autoOpened.current = false
  }, [sessionId])

  useEffect(() => {
    if (entries.length === 0 || autoOpened.current) return
    autoOpened.current = true
    // The feed is mounted alongside the other detail views so it can observe
    // projection updates; selecting this view makes the first browser action
    // visible when the panel opens.
    onSelectView('browser')
    openDetails()
  }, [entries.length, onSelectView, openDetails, sessionId])

  return (
    <div className={css.root} data-active={activeView === 'browser' || undefined}>
      <section className={css.dashboard} aria-label={t('dashboard.title')}>
        {dashboardUrl === undefined
          ? <div className={css.unavailable}>{t('dashboard.unavailable')}</div>
          : (
            <>
              <iframe
                className={css.frame}
                src={dashboardUrl}
                title={t('dashboard.title')}
                allow="clipboard-read; clipboard-write"
              />
              <div className={css.replay}>{t('dashboard.replay')}</div>
            </>
          )}
      </section>
      <section className={css.feed} aria-label={t('feed.title')}>
        <div className={css.feedHeader}>
          <h2 className={css.feedTitle}>{t('feed.title')}</h2>
          {feed?.truncated === true && <span className={css.truncated}>{t('feed.truncated')}</span>}
        </div>
        {entries.length === 0
          ? <div className={css.empty}>{t('feed.empty')}</div>
          : <ol className={css.entries}>
            {entries.map(entry => <FeedEntry key={`${entry.callId}:${entry.at}`} entry={entry} t={t} />)}
          </ol>}
      </section>
    </div>
  )
}

function FeedEntry({ entry, t }: { entry: BrowserFeed['entries'][number]; t: (key: BrowserKey) => string }) {
  const status = entry.outcome === 'running' ? t('feed.running') : entry.outcome === 'ok' ? t('feed.ok') : t('feed.error')
  return (
    <li className={css.entry} data-outcome={entry.outcome}>
      <div className={css.entryLine}>
        <time className={css.time}>{formatTime(entry.at)}</time>
        <code className={css.action}>{entry.action}</code>
        <span className={css.status}>{status}</span>
      </div>
      {entry.args.length > 0 && <div className={css.detail}><span>{t('feed.args')}</span><code>{entry.args.join(' ')}</code></div>}
      {entry.excerpt !== '' && <div className={css.detail}><span>{t('feed.result')}</span><pre>{entry.excerpt}</pre></div>}
    </li>
  )
}
