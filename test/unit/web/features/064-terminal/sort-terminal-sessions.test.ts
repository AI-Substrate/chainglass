/**
 * sortTerminalSessions — deterministic ordering for tmux session lists.
 *
 * FX005-1: defence-in-depth sort so the hook's fallback `enriched[0]` is
 * stable across fetches even when `tmux list-sessions` order shifts.
 */

import { sortTerminalSessions } from '@/features/064-terminal/lib/sort-terminal-sessions';
import { describe, expect, it } from 'vitest';

describe('sortTerminalSessions', () => {
  it('orders sessions by `created` ascending', () => {
    const input = [
      { name: 'beta', created: 200 },
      { name: 'alpha', created: 100 },
      { name: 'gamma', created: 300 },
    ];
    const out = sortTerminalSessions(input);
    expect(out.map((s) => s.name)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('breaks ties on identical `created` timestamps using name localeCompare', () => {
    // Same-millisecond collision — without a tiebreaker, JS Array.sort is
    // stable but order depends on input order; we want a name-based tiebreak
    // so two clients calling /api/terminal back-to-back agree on order.
    const input = [
      { name: 'zulu', created: 1000 },
      { name: 'alpha', created: 1000 },
      { name: 'mike', created: 1000 },
    ];
    const out = sortTerminalSessions(input);
    expect(out.map((s) => s.name)).toEqual(['alpha', 'mike', 'zulu']);
  });

  it('does not mutate the input array', () => {
    const input = [
      { name: 'beta', created: 200 },
      { name: 'alpha', created: 100 },
    ];
    const snapshot = [...input];
    sortTerminalSessions(input);
    expect(input).toEqual(snapshot);
  });

  it('returns the same order on repeated calls (idempotent)', () => {
    const input = [
      { name: 'b', created: 100 },
      { name: 'a', created: 100 },
      { name: 'c', created: 200 },
    ];
    const first = sortTerminalSessions(input);
    const second = sortTerminalSessions(input);
    expect(first.map((s) => s.name)).toEqual(second.map((s) => s.name));
  });

  it('handles an empty list', () => {
    expect(sortTerminalSessions([])).toEqual([]);
  });

  it('preserves all original session fields (extra props pass through)', () => {
    const input = [
      { name: 'beta', created: 200, attached: 1, windows: 3 },
      { name: 'alpha', created: 100, attached: 0, windows: 1 },
    ];
    const out = sortTerminalSessions(input);
    expect(out[0]).toEqual({ name: 'alpha', created: 100, attached: 0, windows: 1 });
    expect(out[1]).toEqual({ name: 'beta', created: 200, attached: 1, windows: 3 });
  });
});
