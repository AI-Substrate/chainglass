/**
 * Shared `[flowspace-mcp]` logger.
 *
 * FX002-5: extracted from `flowspace-mcp-client.ts` and
 * `flowspace-search-action.ts` so both consumers share a single LOG_PREFIX
 * and `log()` helper. Server-only (no `'server-only'` directive — the
 * `lib/server/` path is the convention).
 */

export const LOG_PREFIX = '[flowspace-mcp]';

export function log(...args: unknown[]): void {
  console.log(LOG_PREFIX, ...args);
}
