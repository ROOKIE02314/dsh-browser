/**
 * Service Definition for the browser automation capability seam (`ctx.browser`): a provider
 * registry plus execution-time selection for CDP-driven browser control. Providers register by
 * stable id and own their engine processes; selection pins a configured id or auto-selects the
 * single usable provider, so execution never depends on registration order.
 * @module @deepseek-ai/dsh-browser
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { BrowserProvider, BrowserRunResult, BrowserSessionInfo } from './types.ts'
import { BrowserError } from './types.ts'

export { BrowserError } from './types.ts'
export type {
  BrowserProvider,
  BrowserRunResult,
  BrowserSessionInfo,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    browser: BrowserRuntime
  }
}

/** A configured provider id is not registered. */
export const BROWSER_PROVIDER_CONFIGURED_MISSING = 'BROWSER_PROVIDER_CONFIGURED_MISSING'
/** A configured provider id is registered but reports unavailable. */
export const BROWSER_PROVIDER_CONFIGURED_UNAVAILABLE = 'BROWSER_PROVIDER_CONFIGURED_UNAVAILABLE'
/** No id configured and more than one registered provider reports usable. */
export const BROWSER_PROVIDER_AMBIGUOUS = 'BROWSER_PROVIDER_AMBIGUOUS'
/** No id configured and no registered provider reports usable. */
export const BROWSER_PROVIDER_UNAVAILABLE = 'BROWSER_PROVIDER_UNAVAILABLE'

/**
 * Config for the browser seam. `provider` pins which backend wins; omitted = auto-select when
 * exactly one registered provider is usable.
 */
export interface BrowserRuntimeConfig {
  /** Explicit provider id. */
  readonly provider?: string
}

/**
 * The browser capability service. Registered as `ctx.browser` (one instance per context).
 *
 * Selection semantics (resolved at execution time, never order-dependent):
 * - A configured id that is registered and `available()` → that provider.
 * - A configured id not registered → {@link BROWSER_PROVIDER_CONFIGURED_MISSING}.
 * - A configured id registered but unavailable →
 *   {@link BROWSER_PROVIDER_CONFIGURED_UNAVAILABLE}.
 * - No id configured, exactly one registered usable provider → that provider.
 * - No id configured, multiple usable providers → {@link BROWSER_PROVIDER_AMBIGUOUS}.
 * - No id configured, no usable provider → {@link BROWSER_PROVIDER_UNAVAILABLE}.
 */
export class BrowserRuntime extends Service {
  static Config: z<BrowserRuntimeConfig> = z.object({
    provider: z.string(),
  })

  private readonly providers = new Map<string, BrowserProvider>()

  constructor(ctx: Context, public config: BrowserRuntimeConfig = {}) {
    super(ctx, 'browser')
  }

  /**
   * Register one backend; the registration dies with the registering fiber.
   * @param provider - the backend to register under its own id.
   * @returns the registration's disposer.
   */
  register(provider: BrowserProvider): () => void {
    if (this.providers.has(provider.id)) {
      throw new BrowserError(`a browser provider with id "${provider.id}" is already registered`, 'BROWSER_DUPLICATE_PROVIDER')
    }
    const providers = this.providers
    const dispose = this.ctx.effect(function* () {
      providers.set(provider.id, provider)
      yield () => providers.delete(provider.id)
    }, 'browser.register()')
    // ctx.effect's disposer returns Promise<void>; our disposer API is synchronous.
    return () => { void dispose() }
  }

  /**
   * Run one command in the named dsh session's browser through the selected provider.
   * @param sessionId - owning dsh session (keys the backend's per-session browser).
   * @param command - backend command verb.
   * @param args - positionals and `--flag=value` tokens, appended after the verb.
   * @param signal - optional cooperative cancellation forwarded to the provider.
   * @returns the provider's bounded reply.
   */
  async run(sessionId: SessionId, command: string, args: readonly string[], signal?: AbortSignal): Promise<BrowserRunResult> {
    return this.select().run(sessionId, command, args, signal)
  }

  /**
   * The selected backend's command vocabulary reference.
   * @returns the backend's CLI help text.
   */
  async help(): Promise<string> {
    return this.select().help()
  }

  /**
   * List backend browser sessions with current page facts when known.
   * @returns the selected provider's session listing.
   */
  async sessions(): Promise<readonly BrowserSessionInfo[]> {
    return this.select().sessions()
  }

  /**
   * Monitoring dashboard URL of the selected provider, or undefined when the capability is
   * absent or no dashboard is serving. Deliberately non-throwing: readers such as
   * `host.describe` treat the dashboard as an optional surface.
   * @returns the dashboard URL when present.
   */
  dashboardUrl(): string | undefined {
    const provider = this.trySelect()
    return provider?.dashboardUrl()
  }

  /**
   * Close the named dsh session's browser when it is open.
   * @param sessionId - owning dsh session.
   */
  async close(sessionId: SessionId): Promise<void> {
    await this.select().close(sessionId)
  }

  /** Close every browser the selected backend owns (host shutdown). */
  async closeAll(): Promise<void> {
    await this.select().closeAll()
  }

  /** Resolve one provider for a call that requires it, throwing a structured error otherwise. */
  private select(): BrowserProvider {
    const selected = this.trySelect()
    if (selected !== undefined) return selected
    const configuredId = this.config.provider
    if (configuredId !== undefined) {
      const registered = this.providers.get(configuredId)
      if (registered === undefined) {
        throw new BrowserError(`browser provider "${configuredId}" is configured but not registered`, BROWSER_PROVIDER_CONFIGURED_MISSING)
      }
      // trySelect returned undefined for a registered configured id only when unavailable.
      throw new BrowserError(`browser provider "${configuredId}" is unavailable`, BROWSER_PROVIDER_CONFIGURED_UNAVAILABLE)
    }
    const usable = [...this.providers.values()].filter(provider => provider.available())
    if (usable.length > 1) {
      throw new BrowserError(
        `multiple browser providers are usable (${usable.map(provider => provider.id).join(', ')}); pin one with the provider config`,
        BROWSER_PROVIDER_AMBIGUOUS,
      )
    }
    throw new BrowserError('no usable browser provider', BROWSER_PROVIDER_UNAVAILABLE)
  }

  /** Resolve a provider without throwing, for optional surfaces such as the dashboard URL. */
  private trySelect(): BrowserProvider | undefined {
    const configuredId = this.config.provider
    if (configuredId !== undefined) {
      const registered = this.providers.get(configuredId)
      return registered?.available() === true ? registered : undefined
    }
    const usable = [...this.providers.values()].filter(provider => provider.available())
    return usable.length === 1 ? usable[0] : undefined
  }
}

export default BrowserRuntime
