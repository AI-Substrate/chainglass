/**
 * The fleet view — Plan 089 Phase 2 (T003).
 *
 * Test Doc:
 * - Why: this is the page a human actually looks at, and its failure mode is not a crash — it is a
 *   plausible arrangement of true rows that implies a false structure. So the tests are about
 *   placement and provenance, not about pixels.
 * - Contract: the ratified POC (`scratch/pij-observatory-poc.html`), AC-03, T003's Done When list.
 * - Usage Notes: fixtures only, `now` injected. The tree fixture deliberately carries `pid`/`paneId`
 *   and an unknown extra field, because the real one does.
 * - Quality Contribution: pins the five rules that are easy to break silently — grouping comes from
 *   the tree, unplaced rows are still shown, a seat appears exactly once, the idle filter never hides
 *   an unknown timestamp, and a flow chip requires a confident join.
 * - Worked Example: prime `pij-prime-owl` governs two sections (PM `pij-pm-cheetah` with two workers,
 *   and standalone `pij-solo-mongoose`); `pij-loose-heron` and the unplaced row sit below.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FleetView } from '../../../../apps/web/src/features/089-first-class-pij/components/fleet-view';
import { seatRole } from '../../../../apps/web/src/features/089-first-class-pij/components/role-chip';
import type { FlowSummary } from '../../../../apps/web/src/features/089-first-class-pij/server/flow-reader.interface';
import type { PijTreeNode } from '../../../../apps/web/src/features/089-first-class-pij/server/pij-records.interface';
import { asPijId } from '../../../../apps/web/src/features/089-first-class-pij/types';
import {
  UI_FLEET_ROWS,
  UI_LOOSE_ID,
  UI_NO_EVENT_ID,
  UI_PM_ID,
  UI_PRIME_ID,
  UI_SOLO_ID,
  UI_STALE_ID,
  UI_TREE_ROOTS,
  UI_UNPLACED_ID,
  UI_WORKER_IDS,
  UI_WORKSPACE_PATH,
  fleetRow,
  pollerStatus,
} from '../../../fixtures/pij/fleet-ui';

const NOW = Date.parse('2026-07-26T12:00:00.000Z');

function renderFleet(overrides: Partial<Parameters<typeof FleetView>[0]> = {}) {
  const onScopeChange = vi.fn();
  const utils = render(
    <FleetView
      rows={UI_FLEET_ROWS}
      tree={UI_TREE_ROOTS}
      status={pollerStatus()}
      workspacePath={UI_WORKSPACE_PATH}
      now={NOW}
      scope="workspace"
      onScopeChange={onScopeChange}
      filteredOut={0}
      {...overrides}
    />
  );
  return { ...utils, onScopeChange };
}

/** Every seat id in the DOM, in document order, from the one attribute rows are tagged with. */
function renderedSeatIds(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-seat-id]')].map(
    (node) => node.getAttribute('data-seat-id') ?? ''
  );
}

describe('FleetView — grouping', () => {
  it('draws a prime shell governing one section per child of the prime', async () => {
    renderFleet();

    const shell = screen.getByTestId(`prime-shell-${UI_PRIME_ID}`);
    expect(shell.textContent).toContain('governs 2 sections');
    expect(within(shell).getByTestId(`team-section-${UI_PM_ID}`)).toBeTruthy();
    expect(within(shell).getByTestId(`team-section-${UI_SOLO_ID}`)).toBeTruthy();
  });

  it('puts a PM’s workers inside the PM’s section, nowhere else', async () => {
    renderFleet();

    const section = screen.getByTestId(`team-section-${UI_PM_ID}`);
    for (const worker of UI_WORKER_IDS) {
      expect(within(section).getByTestId(`seat-row-${worker}`)).toBeTruthy();
    }
    expect(section.textContent).toContain('3 seats');
  });

  it('renders every seat exactly once', async () => {
    // The structural invariant. A seat drawn twice — once in its team and once "for context" — makes
    // the fleet look bigger than it is and double-counts whatever a human is scanning for.
    const { container } = renderFleet();
    const ids = renderedSeatIds(container);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('places a root that is not a prime under "Outside any prime"', async () => {
    renderFleet();

    expect(screen.getByText(/Outside any prime/i)).toBeTruthy();
    expect(screen.getByTestId(`team-section-${UI_LOOSE_ID}`)).toBeTruthy();
  });

  it('still shows a row the tree snapshot has not placed, marked as unplaced', async () => {
    // The two reads are taken at different instants. A seat spawned since the last tree read is
    // unplaced, not absent — and hiding it would blank the screen at exactly the moment someone is
    // waiting for a seat they just spawned to appear.
    renderFleet();

    const section = screen.getByTestId(`team-section-${UI_UNPLACED_ID}`);
    expect(section.textContent).toContain('unplaced');
  });

  it('takes structure from the tree alone — a row claiming to be prime does not create a shell', async () => {
    const impostor = fleetRow('pij-impostor-mole', { prime: true });
    const { container } = renderFleet({ rows: [...UI_FLEET_ROWS, impostor] });

    // It is rendered (it is a real seat) but it governs nothing, because the tree never said so.
    expect(container.querySelector('[data-testid="prime-shell-pij-impostor-mole"]')).toBeNull();
    expect(screen.getByTestId('team-section-pij-impostor-mole')).toBeTruthy();
  });

  it('lets the TREE win when an in-tree row disagrees about being prime', async () => {
    // The sharper case: the seat IS in the tree, and the two records contradict each other. `pij tree`
    // is the derived structure view — the one place the platform contract says adoption is decided —
    // so a row that says otherwise is a stale or disagreeing copy, never a promotion.
    const { container } = renderFleet({
      rows: [fleetRow('pij-claims-prime', { prime: true }), fleetRow('pij-child-seat')],
      tree: [
        {
          id: 'pij-claims-prime',
          folder: UI_WORKSPACE_PATH,
          prime: false,
          children: [{ id: 'pij-child-seat', folder: UI_WORKSPACE_PATH }],
        },
      ],
    });

    expect(container.querySelector('[data-testid="prime-shell-pij-claims-prime"]')).toBeNull();
    const section = screen.getByTestId('team-section-pij-claims-prime');
    expect(within(section).queryByTestId('role-chip-Prime')).toBeNull();
    // It still has children in the tree, so the honest chip is PM.
    expect(within(section).getAllByTestId('role-chip-PM').length).toBeGreaterThan(0);
  });
});

describe('seatRole — the tree is the only structure record', () => {
  it('never derives Prime from a fleet row', async () => {
    const node: PijTreeNode = { id: 'pij-claims-prime', folder: UI_WORKSPACE_PATH, prime: false };
    expect(seatRole({ node, row: fleetRow('pij-claims-prime', { prime: true }) })).toBe('Worker');
    expect(seatRole({ node: { ...node, prime: true } })).toBe('Prime');
  });

  it('renders an unplaced row as a Worker until the tree adopts it', async () => {
    // A row the tree has not placed has no attested structure at all. Reading `row.prime` here would
    // put a Prime chip on a seat no tree has adopted — the same claim by a different route.
    expect(seatRole({ row: fleetRow('pij-unplaced-prime', { prime: true }) })).toBe('Worker');
  });
});

describe('FleetView — the idle filter', () => {
  it('hides a seat last heard from outside the 48h window, and says how many', async () => {
    const { container } = renderFleet();

    expect(renderedSeatIds(container)).not.toContain(UI_STALE_ID);
    expect(screen.getByTestId('fleet-hidden-count').textContent).toContain('1 hidden');
  });

  it('SHOWS a seat with no lastEventAt at all — absence is not idleness', async () => {
    const { container } = renderFleet();
    expect(renderedSeatIds(container)).toContain(UI_NO_EVENT_ID);
  });

  it('says the seats here are all idle rather than claiming none matched this workspace', async () => {
    // Seats ARE in this workspace; the idle filter is what emptied the list. Handing the empty state
    // the post-filter count turns "hidden by your own filter" into "none of the 178 seats on this
    // machine is yours", which sends a human looking for a path mismatch that does not exist.
    const stale = '2026-07-20T00:00:00.000Z';
    renderFleet({
      rows: [
        fleetRow('pij-old-one', { lastEventAt: stale }),
        fleetRow('pij-old-two', { lastEventAt: stale }),
      ],
      tree: [],
    });

    const card = screen.getByTestId('fleet-empty-all-idle');
    expect(card.textContent).toContain('2 seats');
    expect(card.textContent).toContain('48h');
    expect(screen.queryByTestId('fleet-empty-filtered')).toBeNull();
  });
});

describe('FleetView — scope toggle', () => {
  it('reports the toggle to its owner rather than deciding for itself', async () => {
    const { onScopeChange } = renderFleet();
    screen.getByRole('button', { name: /all \(hot tier\)/i }).click();
    expect(onScopeChange).toHaveBeenCalledWith('global');
  });

  it('renders the global scope as a flat list, not a forest of one-seat sections', async () => {
    // The tree read is repo-scoped; it would place almost none of a machine-wide fleet. Drawing
    // sections anyway would imply structure that was never read.
    const { container } = renderFleet({ scope: 'global' });

    expect(container.querySelector('[data-testid^="prime-shell-"]')).toBeNull();
    expect(container.querySelector('[data-testid^="team-section-"]')).toBeNull();
    expect(screen.getByTestId('fleet-count').textContent).toContain('hot tier, idle < 2d');
  });

  it('never makes a workspace-scoped claim while scoped to the whole machine', async () => {
    // "No seats matched this workspace" is a statement about a filter that global scope does not apply.
    const { container } = renderFleet({ scope: 'global', rows: [], tree: [] });

    expect(screen.queryByTestId('fleet-empty-filtered')).toBeNull();
    expect(container.textContent).not.toContain('matched this workspace');
  });
});

describe('FleetView — the flow join', () => {
  const flow: FlowSummary = {
    planDir: `${UI_WORKSPACE_PATH}/docs/plans/063-telemetry`,
    planFolder: '063-telemetry',
    state: 'live',
    completion: 'active',
    completionSource: 'nav.bag.status',
    phases: [
      {
        id: 'ph1',
        label: 'ph1',
        status: 'done',
        order: 1,
        current: false,
        activations: 2,
        offSpine: false,
      },
      {
        id: 'ph2',
        label: 'ph2',
        status: 'in_progress',
        order: 2,
        current: true,
        activations: 1,
        offSpine: false,
      },
      {
        id: 'ship',
        label: 'ship',
        status: 'assumed',
        order: 3,
        current: false,
        activations: 0,
        offSpine: false,
      },
    ],
    phasesDone: 1,
    phasesTotal: 3,
    reviews: [],
    nodes: [],
    eventCount: 7,
    signature: '7:ph2',
    readAt: '2026-07-26T12:00:00.000Z',
  };

  it('renders the chip and stage strip ONLY on a confident join', async () => {
    renderFleet({
      flowFor: (id) =>
        id === asPijId(UI_PM_ID)
          ? {
              join: {
                planDir: flow.planDir,
                planFolder: '063-telemetry',
                via: 'assignment.project.planPath',
                confident: true,
              },
              flow,
            }
          : undefined,
    });

    const section = screen.getByTestId(`team-section-${UI_PM_ID}`);
    expect(within(section).getByTestId('flow-chip').textContent).toContain(
      '063-telemetry · phase 2 of 3'
    );
    expect(within(section).getByTestId('stage-strip')).toBeTruthy();
    expect(section.textContent).toContain('project: 063-telemetry');
  });

  it('renders "no flow" for a join that is not confident, and no stage strip at all', async () => {
    // The forbidden alternative is a chip built from a name resemblance, which looks exactly as
    // authoritative as a real one while attributing someone else's phase to this team.
    renderFleet({
      flowFor: () => ({
        join: { planDir: null, planFolder: null, via: 'none', confident: false },
        flow,
      }),
    });

    const section = screen.getByTestId(`team-section-${UI_PM_ID}`);
    expect(within(section).getByTestId('flow-chip-absent').textContent).toContain('no flow');
    expect(within(section).queryByTestId('stage-strip')).toBeNull();
    expect(section.textContent).toContain('project: —');
  });

  it('shows "no flow" everywhere when no join is supplied — today’s live rendering', async () => {
    renderFleet();
    expect(screen.getAllByTestId('flow-chip-absent').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('flow-chip')).toBeNull();
  });
});

describe('FleetView — the AC-03 columns and their absences', () => {
  it('renders the ratified columns', async () => {
    renderFleet();
    const section = screen.getByTestId(`team-section-${UI_PM_ID}`);
    for (const column of ['seat', 'observed', 'model', 'effort', 'flags', 'last event']) {
      expect(within(section).getAllByText(column).length).toBeGreaterThan(0);
    }
  });

  it('renders an absent badge as absence, never as a synthesised one', async () => {
    renderFleet();
    // `pij-worker-vole` has no badge in the fixture, because `pij list` never carries one.
    const row = screen.getByTestId(`seat-row-${UI_WORKER_IDS[1]}`);
    expect(row.textContent).toContain('idle'); // the daemon's own state word
    expect(row.textContent).not.toContain('working'); // nothing invented from adjacent fields
  });

  it('labels a bound model as pinned until the bind is confirmed', async () => {
    renderFleet({
      rows: [
        ...UI_FLEET_ROWS,
        fleetRow('pij-pinned-seat', { boundModel: 'claude-opus-5' }),
        fleetRow('pij-observed-seat', { boundModel: 'claude-opus-5', bindHealth: 'ok' }),
      ],
    });

    expect(screen.getByTestId('seat-row-pij-pinned-seat').textContent).toContain('pinned');
    expect(screen.getByTestId('seat-row-pij-observed-seat').textContent).toContain('observed');
  });

  it('never renders the daemon’s "stalled" verdict — it reports the silence instead', async () => {
    const { container } = renderFleet({
      rows: [
        fleetRow('pij-quiet-seat', { state: 'stalled', lastEventAt: '2026-07-26T11:30:00.000Z' }),
      ],
      tree: [],
    });

    expect(container.textContent).not.toContain('stalled');
    expect(screen.getByTestId('seat-row-pij-quiet-seat').textContent).toContain('quiet 30m');
  });

  it('reports live updates that the containment filter rejected', async () => {
    renderFleet({ filteredOut: 3 });
    expect(screen.getByTestId('fleet-filtered-out').textContent).toContain(
      '3 updates filtered out'
    );
  });

  it('puts no pid or pane id in the DOM (C-03)', async () => {
    const { container } = renderFleet();
    expect(container.innerHTML).not.toMatch(/%\d{3,}/); // pane ids look like %1881
    expect(container.innerHTML).not.toContain('4242'); // the fixture prime's pid
  });
});

describe('FleetView — where the assignment text comes from', () => {
  it('falls back to the tree node when the fleet row carries no task', async () => {
    // Measured live 2026-07-26: `pij list` returns no `currentTask` on any of 179 rows, while
    // `pij tree` nodes carry it. Reading only the row leaves every real section titled
    // "(no assignment)" while the answer sits in the other snapshot.
    render(
      <FleetView
        rows={[fleetRow('pij-lead-seat', { currentTask: undefined })]}
        tree={[
          {
            id: 'pij-lead-seat',
            folder: UI_WORKSPACE_PATH,
            currentTask: 'Land the repo tree tab',
          },
        ]}
        status={pollerStatus()}
        workspacePath={UI_WORKSPACE_PATH}
        now={NOW}
        scope="workspace"
        onScopeChange={() => {}}
        filteredOut={0}
      />
    );

    expect(screen.getByTestId('team-section-pij-lead-seat').textContent).toContain(
      'Land the repo tree tab'
    );
  });

  it('renders the badge pij reported, verbatim, and renders nothing when a row has none', async () => {
    /*
    Test Doc:
    - Why: Phase 4's `--badge` adoption makes this column live for the first time. Two observed
      states exist and only two (measured on 181 live rows: with the flag every row carries a
      string, without it the key is absent on every row) — so the view must render the string
      exactly as given, and render nothing at all for the absent case. There is no null leg to
      handle, and inventing a placeholder for one would be inventing a state pij does not report.
    - Contract: `badge: 'blocked'` → the literal text 'blocked'; a row with no `badge` key → no
      badge element at all.
    - Usage Notes: `UI_WORKER_IDS[1]` is the fixture row deliberately kept badge-less.
    - Quality Contribution: Pins AC-03 at the render boundary — consumed verbatim, never re-derived,
      and absence rendered as absence.
    - Worked Example: 'blocked' shown; the badge-less seat has no seat-badge testid.
    */
    renderFleet({
      rows: [
        fleetRow(UI_PRIME_ID, { prime: true, state: 'working', badge: 'blocked' }),
        fleetRow(UI_WORKER_IDS[1], { state: 'idle' }),
      ],
    });

    expect(screen.getByTestId(`seat-badge-${UI_PRIME_ID}`).textContent).toBe('blocked');
    expect(screen.queryByTestId(`seat-badge-${UI_WORKER_IDS[1]}`)).toBeNull();
  });

  it('says "(no assignment)" when neither read has one — never a guess from the id', async () => {
    render(
      <FleetView
        rows={[fleetRow('pij-quiet-lead')]}
        tree={[]}
        status={pollerStatus()}
        workspacePath={UI_WORKSPACE_PATH}
        now={NOW}
        scope="workspace"
        onScopeChange={() => {}}
        filteredOut={0}
      />
    );

    expect(screen.getByTestId('team-section-pij-quiet-lead').textContent).toContain(
      '(no assignment)'
    );
  });
});
