import { PijRailPanel, PijRailView } from '@/features/089-first-class-pij/components/pij-rail-view';
import type { PijTreeNode } from '@/features/089-first-class-pij/server/pij-records.interface';
import { fakeStatusRecord } from '@/features/089-first-class-pij/server/pij-status.contract';
import { type FleetRow, asPijId } from '@/features/089-first-class-pij/types';
import { MultiplexedSSEProvider } from '@/lib/sse/multiplexed-sse-provider';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
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

  it('shows a fixed-position hover card with full id and binding facts, per hovered row', async () => {
    /*
    Test Doc:
    - Why: the rail truncates seat ids and shows no model/effort at all — hover is where the full
      identity lives. A native `title` needs a motionless ~1s dwell and is shadowed by inner
      elements' own titles ("no hover at all", Jordan, 2026-07-30); an absolute-positioned card is
      clipped by the team cards' `overflow-hidden` (cut off live, same day). So: hover state + a
      `position: fixed` card. Facts must be the row's own: an unbound model line would be a guess.
    - Contract: no card until the row is hovered; on hover, full id plus provider · model · effort
      when bound (never a placeholder); the card leaves with the pointer.
    - Usage Notes: userEvent.hover fires mouseEnter on the row wrapper, where the handlers live.
    - Worked Example: bound PM → 'copilot · gpt-5.6 · high effort' at a fixed offset.
    */
    const user = userEvent.setup();
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

    expect(screen.queryByTestId('seat-hover-pij-pm-current')).toBeNull();
    await user.hover(screen.getByTestId('seat-row-pij-pm-current'));
    const bound = screen.getByTestId('seat-hover-pij-pm-current');
    expect(bound.textContent).toContain('pij-pm-current');
    expect(bound.textContent).toContain('copilot · gpt-5.6 · high effort');
    expect(bound.style.position === '' ? 'fixed-via-class' : bound.style.position).toBeTruthy();
    await user.unhover(screen.getByTestId('seat-row-pij-pm-current'));
    expect(screen.queryByTestId('seat-hover-pij-pm-current')).toBeNull();

    // Worker rows get a card too; no binding on record → no facts separator, not a placeholder.
    await user.hover(screen.getByTestId('pij-worker-pij-worker-blocked'));
    expect(screen.getByTestId('seat-hover-pij-worker-blocked').textContent).toContain(
      'pij-worker-blocked'
    );
    expect(screen.getByTestId('seat-hover-pij-worker-blocked').textContent).not.toContain(' · ');
  });

  it('renders a prime card the prime wrote, and nothing where it wrote none', () => {
    /*
    Test Doc:
    - Why: optional-but-rendered (Jordan, 2026-07-30): the rail must show a prime card that exists
      — governance altitude is the prime's content obligation, not ours — while an absent one
      renders NOTHING, not a nag.
    - Contract: prime + record → NOW/NEXT under the prime header; prime + no record → no status
      element for that seat at all.
    - Usage Notes: —
    - Quality Contribution: pins the render half of the ruling (the resolve half is in
      pij-status.test.ts).
    - Worked Example: 'Ruled the r30 fork.' under pij-prime; nothing on the second render.
    */
    const { unmount } = render(
      <PijRailView
        rows={rows}
        tree={tree}
        snapshotStatuses={[
          fakeStatusRecord({
            peer: asPijId('pij-prime'),
            prev: 'Ruled the r30 fork.',
            next: 'Route the s12 allocation.',
            ts: new Date(NOW - 60_000).toISOString(),
          }),
        ]}
        now={NOW}
        workspacePath="/Users/fixture/substrate/chainglass"
      />,
      { wrapper }
    );
    expect(screen.getByTestId('pij-status-current-pij-prime').textContent).toContain(
      'Ruled the r30 fork.'
    );
    unmount();

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
    expect(screen.queryByTestId(/^pij-status-.*-pij-prime$/)).toBeNull();
  });

  it('copies the full seat id, and shows a failure rather than a false success', async () => {
    /*
    Test Doc:
    - Why: the rail truncates ids, so copying one by hand means reading it off a hover card and
      retyping. The copy button removes that — but a clipboard write can genuinely fail (insecure
      origin, unfocused document, no clipboard API), and rendering "copied" for text that never
      reached the clipboard is the one outcome that silently costs the user their paste.
    - Contract: click → writeText called with the FULL id (not the truncated render); success shows
      data-status="copied"; a rejecting clipboard shows data-status="failed", never "copied".
    - Usage Notes: the button is a SIBLING of the row's focus button — nesting buttons is invalid
      HTML — so this also pins that clicking copy does not fire focus.
    - Quality Contribution: makes the silent-failure mode unreachable.
    - Worked Example: writeText('pij-pm-current') → ✓; rejecting writeText → ✕.
    */
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    // The copy now runs through `_platform/clipboard`, which reaches `writeText` only in a secure
    // context and otherwise takes the textarea fallback (a capability the rail gained by moving to
    // the shared primitive). jsdom is not secure by default, so declare it — the assertions below
    // are unchanged, and the rejection case still lands on 'failed' because jsdom has no
    // `execCommand` for the fallback to succeed with.
    Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true });
    const focusFetch = vi.fn();

    render(
      <PijRailView
        rows={rows}
        tree={tree}
        snapshotStatuses={[]}
        now={NOW}
        workspacePath="/Users/fixture/substrate/chainglass"
        focusFetchImpl={focusFetch as unknown as typeof fetch}
      />,
      { wrapper }
    );

    await user.click(screen.getByTestId('copy-seat-pij-pm-current'));
    expect(writeText).toHaveBeenCalledWith('pij-pm-current');
    await waitFor(() =>
      expect(screen.getByTestId('copy-seat-pij-pm-current').dataset.status).toBe('copied')
    );
    // Copy is not focus: the row's tmux mutation must not fire from this click.
    expect(focusFetch).not.toHaveBeenCalled();

    // A refusing clipboard must say so.
    writeText.mockRejectedValueOnce(new Error('not allowed'));
    await user.click(screen.getByTestId('copy-seat-pij-worker-blocked'));
    await waitFor(() =>
      expect(screen.getByTestId('copy-seat-pij-worker-blocked').dataset.status).toBe('failed')
    );
  });

  it('does not resurrect a closed assignment question from the cached tree (s075)', () => {
    /*
    Test Doc:
    - Why: `semanticState`/`stateNote` clear on `task close` (pij s075). They arrive on BOTH the
      row and the tree node, and the rail merges node-then-row — so a row that has dropped them
      would let the tree's stale copy survive the spread and keep a NEEDS-YOU pin alive for a
      question whose assignment is closed. Questions never expire by ruling (JC-3), so nothing
      downstream would ever clear it: the human would be pinned to answer a dead question.
      The tree is refetched on its own cadence, so this is not a brief window.
    - Contract: when a row exists it owns the four assignment denorms, including by omission —
      no pin, and the strip reports the designed empty state.
    - Usage Notes: the node deliberately carries a well-formed question; only the row is silent.
    - Quality Contribution: closes the resurrection path at the merge, for every consumer of
      placementRecord rather than just the strip.
    - Worked Example: node question + silent row → 'no declared questions'.
    */
    const staleQuestionTree: PijTreeNode[] = [
      {
        id: 'pij-pm-current',
        semanticState: 'question',
        stateNote: {
          text: 'Should the closed assignment still pin the human?',
          state: 'question',
          at: new Date(NOW - 60_000).toISOString(),
        },
        children: [],
      },
    ];
    // The row exists and carries no assignment denorms — the post-close shape.
    const clearedRow = { ...row('pij-pm-current', { orchestrationRole: 'pm' }), extra: {} };

    render(
      <PijRailView
        rows={[clearedRow]}
        tree={staleQuestionTree}
        snapshotStatuses={[]}
        now={NOW}
        workspacePath="/Users/fixture/substrate/chainglass"
      />,
      { wrapper }
    );

    expect(screen.queryByTestId('pij-question-pij-pm-current')).toBeNull();
    expect(screen.getByTestId('pij-needs-you-empty')).toBeTruthy();
  });

  it('never promises a nudge a paused watchdog will not deliver', () => {
    /*
    Test Doc:
    - Why: the live rail printed "updated 16h ago — watchdog will nudge" beside a seat whose
      watchdog was `paused (self)` (Jordan, 2026-07-30). The card was stale, nothing was coming,
      and the line said help was on the way — the worst shape a status line can take, because it
      tells the human to stop paying attention.
    - Contract: stale + paused → the real reason, no nudge promise anywhere in the line; stale +
      armed → the promise, since it is then true. Every seat also carries its watchdog state so
      "is this one being watched" is readable without hovering.
    - Usage Notes: watchdog rides `extra`, exactly as the poller delivers it.
    - Quality Contribution: binds a behavioural claim to the field that decides it.
    - Worked Example: pausedBy 'self' → "watchdog paused (self) · no nudge".
    */
    const staleTs = new Date(NOW - 16 * 60 * 60_000).toISOString();
    const pausedRows = rows.map((r) =>
      r.id === 'pij-pm-current'
        ? { ...r, extra: { ...r.extra, watchdog: { enabled: true, pausedBy: 'self' } } }
        : r
    );

    const { unmount } = render(
      <PijRailView
        rows={pausedRows}
        tree={tree}
        snapshotStatuses={[fakeStatusRecord({ peer: asPijId('pij-pm-current'), ts: staleTs })]}
        now={NOW}
        workspacePath="/Users/fixture/substrate/chainglass"
      />,
      { wrapper }
    );

    const paused = screen.getByTestId('pij-status-status-stale-pij-pm-current');
    expect(paused.textContent).toContain('watchdog paused (self)');
    expect(paused.textContent).not.toContain('will nudge');
    expect(screen.getByTestId('pij-watchdog-pij-pm-current').dataset.reason).toBe('paused');
    unmount();

    // Armed: the promise is true, so it is made.
    const armedRows = rows.map((r) =>
      r.id === 'pij-pm-current'
        ? { ...r, extra: { ...r.extra, watchdog: { enabled: true, intervalMs: 1_200_000 } } }
        : r
    );
    render(
      <PijRailView
        rows={armedRows}
        tree={tree}
        snapshotStatuses={[fakeStatusRecord({ peer: asPijId('pij-pm-current'), ts: staleTs })]}
        now={NOW}
        workspacePath="/Users/fixture/substrate/chainglass"
      />,
      { wrapper }
    );
    expect(screen.getByTestId('pij-status-status-stale-pij-pm-current').textContent).toContain(
      'watchdog will nudge'
    );
    expect(screen.getByTestId('pij-watchdog-pij-pm-current').dataset.reason).toBe('armed');
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

  it('shows a PA under its prime with its own chip, and never in the prime’s colour', () => {
    /*
    Test Doc:
    - Why: s078 adds `pa` — a seat whose job is to WATCH a prime. An instrument the human cannot see
      is the unfalsifiable class we spent the week cataloguing, so it renders; but if a glance can
      resolve the assistant into its subject, "the prime is alive and reporting" gets read off the
      wrong seat. Hence visible AND distinctly chipped (cheetah's render ruling, 2026-07-31).
    - Contract: a PA linked under a prime renders as one of the prime's sections, labelled `PA`, with
      a chip class that is not the prime's; a PA that has written NO card shows nothing (the silent
      branch, no nag); and a role value the rail has NOT been taught reads "role not recognised" —
      blaming the rail's vocabulary, not the seat.
    - Usage Notes: placement is tree-owned. An unlinked PA lands in the loose group — the reason
      lineage-at-spawn was the amendment asked of pij rather than solved by role-derived placement.
    - Quality Contribution: pins that the enum widening changed a LABEL, not the card obligations or
      the structure rules.
    - Worked Example: orchestrationRole 'pa' → 'PA' chip; 'quartermaster' → 'role not recognised'.
    */
    const paTree: PijTreeNode[] = [
      {
        id: 'pij-prime',
        prime: true,
        children: [{ id: 'pij-assistant' }, { id: 'pij-odd-role' }],
      },
    ];

    render(
      <PijRailView
        rows={[
          row('pij-prime', { prime: true, orchestrationRole: 'prime', state: 'working' }),
          row('pij-assistant', { orchestrationRole: 'pa', state: 'working' }),
          row('pij-odd-role', { orchestrationRole: 'quartermaster', state: 'working' }),
        ]}
        tree={paTree}
        snapshotStatuses={[]}
        now={NOW}
        workspacePath="/Users/fixture/substrate/chainglass"
      />,
      { wrapper }
    );

    const pa = screen.getByTestId('pij-team-pij-assistant');
    const chip = pa.querySelector('[data-role-reason]');
    expect(chip?.textContent).toBe('PA');
    expect(chip?.getAttribute('data-role-reason')).toBe('current');
    // Distinct from the prime's chip — the misread this render exists to prevent.
    const primeChip = screen.getByTestId('pij-prime-pij-prime').querySelector('[data-role-reason]');
    expect(primeChip?.textContent).toBe('Prime · main');
    expect(chip?.className).not.toBe(primeChip?.className);
    // A PA that has written nothing is silent — no nag, no "not applicable" filler.
    expect(pa.textContent).not.toContain('NOW');
    expect(screen.queryByTestId('pij-status-pa-not-written-pij-assistant')).toBeNull();

    const odd = screen.getByTestId('pij-team-pij-odd-role').querySelector('[data-role-reason]');
    expect(odd?.textContent).toBe('role not recognised');
    expect(odd?.getAttribute('data-role-reason')).toBe('role-unrecognised');
  });
});
