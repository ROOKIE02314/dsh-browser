/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-browser-playwright`.
 * @module @deepseek-ai/dsh-browser-playwright/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-browser-playwright'

/** Cordis companion plugin name. */
export const name = 'browser-playwright-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the provider owns private child processes and a private session mirror
 * with no independent registry or event stream whose relation an invariant could check; spawn
 * bounds, teardown, and registration disposal are package-tested.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
