import { PijRailPanel, PijRailView } from '@/features/089-first-class-pij/components/pij-rail-view';
import type { PijTreeNode } from '@/features/089-first-class-pij/server/pij-records.interface';
import { fakeStatusRecord } from '@/features/089-first-class-pij/server/pij-status.contract';
import { type FleetRow, asPijId } from '@/features/089-first-class-pij/types';
import { MultiplexedSSEProvider } from '@/lib/sse/multiplexed-sse-provider';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { createFakeMultiplexedSSEFactory } from '../../../fakes/fake-multiplexed-sse';
import { FakePijApi } from '../../../fakes/fake-pij-api';
import { fleetRow } from '../../../fixtures/pij/fleet-ui';

const NOW = Date.parse('2026-07-29T00:30:00.000Z');

function row(id: string, overrides: Partial<FleetRow> = {}): FleetRow {
  return fleetRow(id, {
    lastEventAt: new Date(NOW - 60_000).toISOString(),
    ...overrides,
  });
}

const tree: PijTreeNode[] = [
  {
    id: 'pij-prime',
    prime: true,
    children: [
      {
        id: 'pij-pm-current',
        children: [{ id: 'pij-worker-blocked' }, { id: 'pij-worker-question' }],
      },
    ],
  },
  { id: 'pij-worker-loose' },
  { id: 'pij-role-unknown' },
  { id: 'pij-pm-empty' },
  { id: 'pij-pm-stale' },
];

const rows: FleetRow[] = [
  row('pij-prime', { prime: true, orchestrationRole: 'prime', state: 'working' }),
  row('pij-pm-current', {
    orchestrationRole: 'pm',
    state: 'working',
    currentTask: 'Coordinate a deliberately long project title that must truncate in the rail',
  }),
  row('pij-worker-blocked', {
    orchestrationRole: 'worker',
    badge: 'blocked',
    currentTask: 'Waiting for the fixture writer',
    extra: {
      semanticState: 'blocked',
      stateNote: {
        text: 'Waiting for the fixture writer to publish the contract.',
        state: 'blocked',
        at: new Date(NOW - 120_000).toISOString(),
      },
    },
  }),
  row('pij-worker-question', {
    orchestrationRole: 'worker',
    badge: 'blocked',
    currentTask: 'Ask whether the live delta should win',
    extra: {
      semanticState: 'question',
      stateNote: {
        text: 'Should the lower-sequence live delta win under the swapped adapter?',
        state: 'question',
        at: new Date(NOW - 3 * 60 * 60_000).toISOString(),
      },
    },
  }),
  row('pij-worker-loose', { orchestrationRole: 'worker' }),
  row('pij-role-unknown', { orchestrationRole: null }),
  row('pij-pm-empty', { orchestrationRole: 'pm' }),
  row('pij-pm-stale', { orchestrationRole: 'pm' }),
];

function wrapper({ children }: { children: ReactNode }) {
  const sse = createFakeMultiplexedSSEFactory();
  return (
    <MultiplexedSSEProvider channels={['pij']} eventSourceFactory={sse.factory}>
      {children}
    </MultiplexedSSEProvider>
  );
}

describe('PijRailView', () => {
  it('renders the mock roster anatomy with honest hot-window counts', () => {
    render(
      <PijRailView
        rows={rows}
        tree={tree}
        snapshotStatuses={[
          fakeStatusRecord({
            peer: asPijId('pij-pm-current'),
            project: 'plan-090',
            prev: 'Finished contract wiring.',
            next: 'Build the rail view.',
            ts: new Date(NOW - 60_000).toISOString(),
          }),
          fakeStatusRecord({
            peer: asPijId('pij-pm-stale'),
            project: 'stale-project',
            ts: new Date(NOW - 30 * 60_000 - 1).toISOString(),
          }),
        ]}
        now={NOW}
        workspacePath="/Users/fixture/substrate/chainglass"
      />,
      { wrapper }
    );

    expect(screen.getByTestId('pij-prime-pij-prime')).toBeTruthy();
    expect(screen.getByTestId('pij-team-pij-pm-current')).toBeTruthy();
    expect(screen.getByTestId('pij-worker-pij-worker-blocked')).toBeTruthy();
    expect(screen.getAllByText('NOW').length).toBeGreaterThan(0);
    expect(screen.getAllByText('NEXT').length).toBeGreaterThan(0);
    expect(screen.queryByText('plan-090')).toBeNull();
    // Twice, by design: the truncating project line and the hover card's full-text copy.
    expect(
      screen.getAllByText(
        'Coordinate a deliberately long project title that must truncate in the rail'
      ).length
    ).toBeGreaterThan(0);
    expect(screen.getByTestId('pij-hot-count').textContent).toContain('8 seats currently hot');
    expect(screen.getByTestId('pij-hot-count').textContent).toContain('hot');
  });

  it('names the tmux window under a seat title, only when the label joins', () => {
    /*
    Test Doc:
    - Why: a seat's `windowId` (`@12`) is meaningless to the human scanning for the pane to jump to;
      the rail names the window as tmux itself does (`3:cheetah`). The join is optional twice over —
      a node may carry no windowId, and the map may not cover it — and both absences must cost the
      line alone.
    - Contract: label rendered under the seat with a windowId the map covers; no line for seats it
      does not; nothing anywhere when `windows` is absent entirely.
    - Usage Notes: —
    - Quality Contribution: pins the render half of the label pipeline (route join is pinned in
      routes.test.ts).
    - Worked Example: windowId '@3' + { '@3': '3:cheetah' } → '⊞ 3:cheetah'.
    */
    const treeWithWindows: PijTreeNode[] = [
      {
        id: 'pij-prime',
        prime: true,
        windowId: '@9',
        children: [{ id: 'pij-pm-current', windowId: '@3', children: [] }],
      },
      { id: 'pij-pm-empty' },
    ];

    const { unmount } = render(
      <PijRailView
        rows={rows}
        tree={treeWithWindows}
        snapshotStatuses={[]}
        now={NOW}
        workspacePath="/Users/fixture/substrate/chainglass"
        windows={{ '@3': '3:cheetah' }}
      />,
      { wrapper }
    );

    expect(screen.getByTestId('pij-window-pij-pm-current').textContent).toContain('3:cheetah');
    // '@9' is not in the map, and pij-pm-empty has no windowId at all — no line for either.
    expect(screen.queryByTestId('pij-window-pij-prime')).toBeNull();
    expect(screen.queryByTestId('pij-window-pij-pm-empty')).toBeNull();
    unmount();

    render(
      <PijRailView
        rows={rows}
        tree={treeWithWindows}
        snapshotStatuses={[]}
        now={NOW}
        workspacePath="/Users/fixture/substrate/chainglass"
      />,
      { wrapper }
    );
    expect(screen.queryByTestId('pij-window-pij-pm-current')).toBeNull();
  });

  it('carries full id and binding facts in the CSS hover card, only when the row has them', () => {
    /*
    Test Doc:
    - Why: the rail truncates seat ids and shows no model/effort at all — hover is where the full
      identity lives. A native `title` needs a motionless ~1s dwell and is shadowed by inner
      elements' own titles, which read as "no hover at all" (Jordan, 2026-07-30) — so this is a
      CSS `group-hover` card. Facts must be the row's own: an unbound model line would be a guess.
    - Contract: every seat gets a card with its full id; provider · model · effort joins only when
      bound — never a placeholder.
    - Usage Notes: the card is display-toggled by CSS, so it exists in the DOM unhovered — assert
      content, not visibility.
    - Worked Example: bound PM → 'copilot · gpt-5.6 · high effort'.
    */
    const boundRows = rows.map((r) =>
      r.id === 'pij-pm-current'
        ? { ...r, boundProvider: 'copilot', boundModel: 'gpt-5.6', effort: 'high' }
        : r
    );
    render(
      <PijRailView
        rows={boundRows}
        tree={tree}
        snapshotStatuses={[]}
        now={NOW}
        workspacePath="/Users/fixture/substrate/chainglass"
      />,
      { wrapper }
    );

    const bound = screen.getByTestId('seat-hover-pij-pm-current');
    expect(bound.textContent).toContain('pij-pm-current');
    expect(bound.textContent).toContain('copilot · gpt-5.6 · high effort');
    // Worker rows get a card too; no binding on record → no facts separator, not a placeholder.
    expect(screen.getByTestId('seat-hover-pij-worker-loose').textContent).toContain(
      'pij-worker-loose'
    );
    expect(screen.getByTestId('seat-hover-pij-pm-empty').textContent).not.toContain('·');
  });

  it('renders every status absence discriminator and keeps stale text', () => {
    render(
      <PijRailView
        rows={rows}
        tree={tree}
        snapshotStatuses={[
          fakeStatusRecord({
            peer: asPijId('pij-pm-stale'),
            prev: 'Keep this stale text visible.',
            ts: new Date(NOW - 30 * 60_000 - 1).toISOString(),
          }),
        ]}
        now={NOW}
        workspacePath="/Users/fixture/substrate/chainglass"
      />,
      { wrapper }
    );

    // `not-a-pm` deliberately renders NOTHING: a non-PM has no status to be missing, and the line
    // was pure filler (Jordan, 2026-07-30). The other discriminators stay visible.
    expect(screen.queryByTestId('pij-status-not-a-pm-pij-worker-loose')).toBeNull();
    expect(screen.getByTestId('pij-status-role-unknown-pij-role-unknown')).toBeTruthy();
    expect(screen.getByTestId('pij-status-no-status-yet-pij-pm-empty')).toBeTruthy();
    expect(screen.getByTestId('pij-status-status-stale-pij-pm-stale').textContent).toContain(
      'Keep this stale text visible.'
    );
  });

  it('pins declared questions independently of the badge and keeps blocked notes inline', () => {
    render(
      <PijRailView
        rows={rows}
        tree={tree}
        snapshotStatuses={[]}
        now={NOW}
        workspacePath="/Users/fixture/substrate/chainglass"
      />,
      { wrapper }
    );

    expect(screen.getByTestId('pij-question-pij-worker-question')).toHaveAttribute(
      'data-reason',
      'declared-note'
    );
    expect(screen.getByTestId('pij-question-pij-worker-question')).toHaveAttribute(
      'data-aged',
      'true'
    );
    expect(screen.getByTestId('pij-question-pij-worker-question').textContent).toContain(
      'asked 3h ago'
    );
    expect(screen.getByTestId('pij-worker-pij-worker-question')).toHaveAttribute(
      'data-state',
      'blocked'
    );
    expect(screen.getByTestId('pij-blocked-note-pij-worker-blocked')).toHaveAttribute(
      'data-reason',
      'blocked-note-inline'
    );
    expect(screen.queryByTestId('pij-question-pij-worker-blocked')).toBeNull();
  });

  it('uses truncation classes without fixed-width or nowrap overflow classes', () => {
    const { container } = render(
      <PijRailView
        rows={rows}
        tree={tree}
        snapshotStatuses={[]}
        now={NOW}
        workspacePath="/Users/fixture/substrate/chainglass"
      />,
      { wrapper }
    );
    const rail = screen.getByTestId('pij-rail-view');
    const project = screen.getByTitle(
      'Coordinate a deliberately long project title that must truncate in the rail'
    );

    expect(project.className).toContain('truncate');
    expect(rail.innerHTML).not.toContain('whitespace-nowrap');
    expect(rail.innerHTML).not.toMatch(/\bw-\[/);
    expect(container.querySelectorAll('.truncate').length).toBeGreaterThan(0);
  });

  it('focuses a NEEDS-YOU pin on click and renders route refusals beside the pin', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const observation = 'seat pij-worker-question was not live at the last read';
    const focusFetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return {
        ok: false,
        status: 409,
        json: async () => ({ reason: 'not-live', observation }),
      } as Response;
    }) as typeof fetch;

    render(
      <PijRailView
        rows={rows}
        tree={tree}
        snapshotStatuses={[]}
        now={NOW}
        workspacePath="/Users/fixture/substrate/chainglass"
        focusFetchImpl={focusFetchImpl}
      />,
      { wrapper }
    );

    expect(calls).toHaveLength(0);
    await userEvent.click(screen.getByTestId('pij-question-pij-worker-question'));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toContain('/api/pij/focus?workspace=');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      seatId: 'pij-worker-question',
    });
    expect(screen.getByTestId('focus-question-result-pij-worker-question')).toHaveAttribute(
      'data-reason',
      'not-live'
    );
    expect(screen.getByTestId('focus-question-result-pij-worker-question').textContent).toBe(
      observation
    );
  });

  it('anchors worktree rails to the threaded main checkout path', async () => {
    const api = new FakePijApi();
    render(
      <PijRailPanel
        mainPath="/Users/fixture/substrate/chainglass"
        worktreePath="/Users/fixture/substrate/chainglass-worktrees/090-pij-rail"
        fleetFetchImpl={api.fetch}
        clock={() => NOW}
      />,
      { wrapper }
    );

    await waitFor(() => expect(api.countOf('tree')).toBe(1));

    expect(api.calls).toContain(
      '/api/pij/tree?workspace=%2FUsers%2Ffixture%2Fsubstrate%2Fchainglass&all=1'
    );
    expect(api.calls).toContain(
      '/api/pij/flow?workspace=%2FUsers%2Ffixture%2Fsubstrate%2Fchainglass'
    );
    expect(screen.getByTestId('pij-rail-scope').textContent).toContain('⑂ 090-pij-rail → main');
  });
});
