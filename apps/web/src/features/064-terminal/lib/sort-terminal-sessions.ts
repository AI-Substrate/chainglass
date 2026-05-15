/**
 * Stable, deterministic ordering for `tmux list-sessions` output.
 *
 * `tmux` returns sessions in internal order (not guaranteed stable across
 * calls when sessions are created or destroyed). The hook `useTerminalSessions`
 * picks `enriched[0]` as a fallback when no session is preselected; if that
 * fallback shifts between fetches, the user lands in a different session
 * after a sleep/wake cycle. Sorting by `created` ascending — with `name` as a
 * tiebreaker for the rare same-millisecond collision — makes the fallback
 * deterministic.
 *
 * Plan-scoped: FX005 mobile-terminal-session-selection
 * Domain: terminal (internal helper — not part of the public domain contract).
 */

export interface SessionForSort {
  name: string;
  created: number;
}

export function sortTerminalSessions<T extends SessionForSort>(sessions: readonly T[]): T[] {
  return [...sessions].sort((a, b) => a.created - b.created || a.name.localeCompare(b.name));
}
