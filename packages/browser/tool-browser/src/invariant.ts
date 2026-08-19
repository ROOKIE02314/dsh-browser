/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-tool-browser`.
 * @module @deepseek-ai/dsh-tool-browser/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tool-browser'

/** Cordis companion plugin name. */
export const name = 'tool-browser-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the feed fold is defensive by contract (malformed logged payloads are
 * skipped, never thrown), and the durable call/result pairing a stricter check would assert is
 * already owned by the core session invariant (`tool/result` without a prior `tool/call`);
 * feed fold totality and replay determinism are package-tested instead.
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
