/**
 * Browser-availability decision, kept pure for deterministic tests: given a playwright-managed
 * executable path, platform Chrome candidates, and an existence probe, say whether some browser
 * the CLI can launch is present.
 * @module @deepseek-ai/dsh-browser-playwright/availability
 */

/**
 * Whether a launchable browser exists.
 * @param executablePath - the pinned playwright-core's computed browser executable path.
 * @param candidates - system Chrome candidate paths for this platform.
 * @param exists - existence probe (injected for tests).
 * @returns true when the managed build or one candidate exists.
 */
export function browserPresent(
  executablePath: string,
  candidates: readonly string[],
  exists: (path: string) => boolean,
): boolean {
  if (exists(executablePath)) return true
  return candidates.some(candidate => exists(candidate))
}
