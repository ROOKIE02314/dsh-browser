/** Browser details-tab plugin: dashboard iframe plus durable browser action feed. */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { HostDescriptionSource } from '@deepseek-ai/dsh-client-connection/client'
import { BrowserView } from './BrowserView.tsx'
import { en, NS, zh, type BrowserKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Browser details tab copy. */
    browser: BrowserKey
  }
}

/** Injected face for the browser details entry. */
export interface BrowserViewInjected {
  /** Open the details column after the first browser action arrives. */
  openDetails: () => void
  /** Host handshake source carrying the optional dashboard URL. */
  hooks: { hostDescription: HostDescriptionSource }
}

/** Required services for the details slot, layout opener, host description, and copy. */
export const inject = ['slots', 'locale', 'connection', 'layout']

/** Client plugin body. */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as ConnectionHandle
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-browser: dictionaries')
  ctx.slots.inject('conversation.details.view', () => ctx.slots.register({
    name: 'conversation.details.view',
    id: 'browser',
    order: 10,
    label: () => t('tab.browser'),
    locale: NS,
    inject: (): BrowserViewInjected => ({
      openDetails: () => { ctx.layout.openDetails() },
      hooks: { hostDescription: connection.hostDescription },
    }),
  }, BrowserView))
}
