/**
 * The five empty states — Plan 089 Phase 2 (T004, + P2 fix round 1).
 *
 * Test Doc:
 * - Why: an empty fleet page has five completely different causes and four of them are somebody's
 *   problem to fix. Collapsing them into one grey "no data" is the confident lie this plan exists to
 *   prevent, so each state is pinned to its discriminator here.
 * - Contract: AC-08, the roadrunner ruling that added filtered-to-zero, and terra's finding 2, which
 *   added `all-idle` — the state that was previously reported as `filtered`.
 * - Usage Notes: pure props in, DOM out — no hook, no provider, no clock.
 * - Quality Contribution: the highest-value assertion in the file is that `rows: []` with
 *   `fleetSize: 178` does NOT render "no seats here". `fleetSize` is the GLOBAL count; using it as
 *   the local discriminator would report an empty workspace as a full one and vice versa.
 * - Worked Example: running poller, no error, 0 rows, 178 seats elsewhere → "No seats matched this
 *   workspace", with the path being matched printed for comparison.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  FleetEmptyState,
  fleetEmptyReason,
} from '../../../../apps/web/src/features/089-first-class-pij/components/fleet-empty-state';
import { UI_WORKSPACE_PATH, minutesAgo, pollerStatus } from '../../../fixtures/pij/fleet-ui';

const NOW = Date.parse('2026-07-26T12:00:00.000Z');

function renderState(props: Partial<Parameters<typeof FleetEmptyState>[0]>) {
  return render(
    <FleetEmptyState
      rowCount={0}
      visibleCount={0}
      scope="workspace"
      status={pollerStatus()}
      workspacePath={UI_WORKSPACE_PATH}
      now={NOW}
      {...props}
    />
  );
}

/** The two counts and the scope, spelled out at every call site so no default hides the argument. */
function reasonFor(props: Partial<Parameters<typeof fleetEmptyReason>[0]>) {
  return fleetEmptyReason({
    rowCount: 0,
    visibleCount: 0,
    scope: 'workspace',
    status: pollerStatus(),
    workspacePath: UI_WORKSPACE_PATH,
    now: NOW,
    ...props,
  });
}

describe('FleetEmptyState', () => {
  it('renders nothing at all when there are seats to show', async () => {
    const { container } = renderState({ rowCount: 3, visibleCount: 3 });
    expect(container).toBeEmptyDOMElement();
  });

  it('state 1: no seats anywhere — running, no error, global fleet also empty', async () => {
    renderState({ status: pollerStatus({ fleetSize: 0 }) });

    expect(screen.getByTestId('fleet-empty-none')).toBeTruthy();
    expect(screen.getByText(/no pij seats on this machine yet/i)).toBeTruthy();
  });

  it('state 2: seats exist elsewhere — the count and the matched PATH are both shown', async () => {
    renderState({ status: pollerStatus({ fleetSize: 178 }) });

    const card = screen.getByTestId('fleet-empty-filtered');
    expect(card.textContent).toContain('178 seats live elsewhere');
    // The path is the diagnosis: a trailing slash or a symlink is only visible if it is printed.
    expect(card.textContent).toContain(UI_WORKSPACE_PATH);
    // And it must NOT claim the machine is empty.
    expect(screen.queryByTestId('fleet-empty-none')).toBeNull();
  });

  it('state 3: the reader is stopped', async () => {
    renderState({ status: pollerStatus({ running: false, fleetSize: 178 }) });

    expect(screen.getByTestId('fleet-empty-stale')).toBeTruthy();
    expect(screen.getByText(/reader is not running/i)).toBeTruthy();
  });

  it('state 3: the reader is running but has fallen behind', async () => {
    renderState({ status: pollerStatus({ lastRecordsPollAt: minutesAgo(11) }) });

    expect(screen.getByTestId('fleet-empty-stale')).toBeTruthy();
    expect(screen.getByText(/has not completed a record poll recently/i)).toBeTruthy();
  });

  it('state 4: the store could not be read — the pij code is shown verbatim', async () => {
    renderState({
      status: pollerStatus({
        lastError: {
          code: 'E-STORE-UNREADABLE',
          message: 'EACCES: permission denied',
          at: minutesAgo(1),
        },
      }),
    });

    const card = screen.getByTestId('fleet-empty-unreadable');
    expect(card.textContent).toContain('E-STORE-UNREADABLE');
    expect(card.textContent).toContain('EACCES: permission denied');
    expect(card.textContent).toMatch(/read failure, not an empty fleet/i);
  });

  it('renders the read failure even when it only reached us as an HTTP error', async () => {
    renderState({ status: pollerStatus(), fetchError: 'E-PIJ-TIMEOUT: pij list timed out' });

    expect(screen.getByTestId('fleet-empty-unreadable').textContent).toContain('E-PIJ-TIMEOUT');
  });

  it('state 5: the seats are here and the idle filter is hiding every one of them', async () => {
    // Distinct from `filtered`, and the distinction is the whole point: `filtered` says "none of these
    // seats is yours", `all-idle` says "all of these seats are yours and you asked not to see them".
    renderState({ rowCount: 4, visibleCount: 0, status: pollerStatus({ fleetSize: 178 }) });

    const card = screen.getByTestId('fleet-empty-all-idle');
    expect(card.textContent).toContain('4 seats');
    expect(card.textContent).toContain('48h');
    expect(screen.queryByTestId('fleet-empty-filtered')).toBeNull();
  });

  it('never claims "no seats matched this workspace" while scoped to the whole machine', async () => {
    // Global scope applies no workspace filter, so it has no standing to report one.
    renderState({ scope: 'global', status: pollerStatus({ fleetSize: 178 }) });

    expect(screen.queryByTestId('fleet-empty-filtered')).toBeNull();
    expect(reasonFor({ scope: 'global', status: pollerStatus({ fleetSize: 178 }) })).toBe('empty');
  });

  it('never uses fleetSize to decide whether THIS workspace is empty', async () => {
    // The load-bearing distinction, stated as a table: the same fleetSize appears on both sides, and
    // the answer is driven by the row counts and the reader's health instead.
    expect(
      reasonFor({ rowCount: 1, visibleCount: 1, status: pollerStatus({ fleetSize: 0 }) })
    ).toBeNull();
    expect(reasonFor({ status: pollerStatus({ fleetSize: 178 }) })).toBe('filtered');
    expect(reasonFor({ status: pollerStatus({ fleetSize: 0 }) })).toBe('empty');
  });

  it('ranks a failed read above a stale one, a stale reader above any count, and the idle filter above the workspace filter', async () => {
    // A stale reader's row count is not evidence of anything, so it must not be reported as a fact
    // about the fleet. And a workspace that HAS seats can never be reported as one that matched none.
    expect(
      reasonFor({
        status: pollerStatus({
          running: false,
          lastError: { code: 'E-X', message: 'x', at: minutesAgo(1) },
        }),
      })
    ).toBe('unreadable');
    expect(reasonFor({ status: null })).toBe('stale');
    expect(reasonFor({ rowCount: 2, status: pollerStatus({ fleetSize: 178 }) })).toBe('all-idle');
    // …but a stale reader still outranks the idle filter: its counts are not evidence either.
    expect(reasonFor({ rowCount: 2, status: pollerStatus({ running: false }) })).toBe('stale');
  });

  it('gives the five states five different test ids — they must never look alike', async () => {
    const seen = new Set<string>();
    const cases: Array<Partial<Parameters<typeof FleetEmptyState>[0]>> = [
      { status: pollerStatus({ fleetSize: 0 }) },
      { status: pollerStatus({ fleetSize: 178 }) },
      { status: pollerStatus({ running: false }) },
      { status: pollerStatus({ lastError: { code: 'E-X', message: 'x', at: minutesAgo(1) } }) },
      { rowCount: 2, status: pollerStatus({ fleetSize: 178 }) },
    ];
    for (const props of cases) {
      const { container, unmount } = renderState(props);
      const card = container.querySelector('[data-reason]');
      seen.add(card?.getAttribute('data-reason') ?? '');
      unmount();
    }
    expect([...seen].sort()).toEqual(['all-idle', 'empty', 'filtered', 'stale', 'unreadable']);
  });
});
