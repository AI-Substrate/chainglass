/**
 * The Flows tab — Plan 089 Phase 3 (T001, T003) · AC-07.
 *
 * Test Doc:
 * - Why: absence is this view's dominant output — 83 of this repo's 86 plan folders have never had a
 *   flow — so "renders absence honestly" is not an edge case here, it is the main case. Four of the
 *   five plan states and all three tab-level states are absences, and each has a different owner and
 *   a different remedy.
 * - Contract: AC-07 (five designed states, visually distinct, none an error and none a blank); T001
 *   (tab shell, `refresh()` on tab change, the global-scope state, `flowsFilteredOut` on THIS tab);
 *   T003 (plan list, histogram, exact wordings); C-09 (completion never from the file set).
 * - Usage Notes: the five state fixtures are MATERIALIZED plan folders read by the real
 *   `IFlowReader` — a hand-written `state: 'legacy'` would let a wrong expectation and a wrong
 *   classifier agree. Containment cases use hand-built summaries, because a temp directory is inside
 *   no workspace. No `vi.mock()` anywhere; `FakePijApi` and the real SSE provider drive the shell.
 * - Quality Contribution: pins the two ways this tab could lie — collapsing five distinguishable
 *   causes into one grey blank, and reporting a capability boundary (global scope) as a failure.
 * - Worked Example: the five fixtures → five cards, five distinct `data-reason`s, and a histogram
 *   reading 1 live / 1 legacy / 1 untracked / 1 not-started / 1 corrupt.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  FlowsTab,
  flowHistogram,
  flowsAbsenceReason,
} from '../../../../apps/web/src/features/089-first-class-pij/components/flows-tab';
import { PijPageClient } from '../../../../apps/web/src/features/089-first-class-pij/components/pij-page-client';
import { createFlowReader } from '../../../../apps/web/src/features/089-first-class-pij/server/flow-reader';
import type { FlowSummary } from '../../../../apps/web/src/features/089-first-class-pij/server/flow-reader.interface';
import { MultiplexedSSEProvider } from '../../../../apps/web/src/lib/sse/multiplexed-sse-provider';
import { createFakeMultiplexedSSEFactory } from '../../../fakes/fake-multiplexed-sse';
import { FakePijApi } from '../../../fakes/fake-pij-api';
import { FLOW_FIXTURES, materializeFlowFixture } from '../../../fixtures/flows';
import { UI_WORKSPACE_PATH, pollerStatus } from '../../../fixtures/pij/fleet-ui';
import { flowSummary } from '../../../fixtures/pij/flow-ui';

/** One materialized fixture per ruled state, read by the real reader. */
const STATE_FIXTURES = [
  FLOW_FIXTURES.live088,
  FLOW_FIXTURES.legacyE308,
  FLOW_FIXTURES.untrackedWork,
  FLOW_FIXTURES.notStarted,
  FLOW_FIXTURES.corruptJson,
] as const;

let fiveStates: FlowSummary[];
let kitchenSink: FlowSummary;
const cleanups: Array<() => void> = [];

beforeAll(async () => {
  const reader = createFlowReader();
  fiveStates = [];
  for (const name of STATE_FIXTURES) {
    const { planDir, cleanup } = materializeFlowFixture(name);
    cleanups.push(cleanup);
    fiveStates.push(await reader.read(planDir));
  }
  const sink = materializeFlowFixture(FLOW_FIXTURES.kitchenSink);
  cleanups.push(sink.cleanup);
  kitchenSink = await reader.read(sink.planDir);
});

afterAll(() => {
  for (const cleanup of cleanups) cleanup();
});

function renderTab(props: Partial<Parameters<typeof FlowsTab>[0]> = {}) {
  return render(
    <FlowsTab
      flows={fiveStates}
      error={null}
      scope="workspace"
      workspacePath={UI_WORKSPACE_PATH}
      filteredOut={0}
      {...props}
    />
  );
}

describe('FlowsTab — AC-07: five states, five distinguishable renderings', () => {
  it('classifies the five fixtures as the five ruled states (the fixtures themselves, verified)', async () => {
    // Guard against the green that lies: if the fixtures ever stopped covering all five states, every
    // assertion below would still pass while proving less than it claims.
    expect(fiveStates.map((flow) => flow.state).sort()).toEqual([
      'corrupt',
      'legacy',
      'live',
      'not-started',
      'untracked',
    ]);
  });

  it('gives the five states five different data-reasons — they must never look alike', async () => {
    renderTab();

    const reasons = [...document.querySelectorAll('[data-testid^="flow-plan-"][data-reason]')].map(
      (node) => node.getAttribute('data-reason')
    );
    expect([...new Set(reasons)].sort()).toEqual([
      'corrupt',
      'legacy',
      'live',
      'not-started',
      'untracked',
    ]);
  });

  it('reports legacy as an artefact of its age, never as an error', async () => {
    renderTab();
    const legacy = fiveStates.find((flow) => flow.state === 'legacy');
    if (!legacy) throw new Error('fixture set lost its legacy plan');

    const card = screen.getByTestId(`flow-plan-${legacy.planFolder}`);
    expect(card.textContent).toContain('predates the flow CLI');
    expect(card.textContent).toContain('needs re-creating');
    // Said in as many words, because "legacy" beside a red badge reads as a fault to fix, and the
    // file is exactly as it should be for when it was made.
    expect(card.textContent).toContain('Not an error');
    expect(card.querySelector('[data-testid="flow-state-badge-legacy"]')).toBeTruthy();
    expect(card.querySelector('[data-testid="flow-state-badge-corrupt"]')).toBeNull();
  });

  it('says "untracked work" — the work happened, only the tracking did not', async () => {
    renderTab();
    const untracked = fiveStates.find((flow) => flow.state === 'untracked');
    if (!untracked) throw new Error('fixture set lost its untracked plan');

    expect(screen.getByTestId(`flow-plan-${untracked.planFolder}`).textContent).toContain(
      'Untracked work'
    );
  });

  it('distinguishes not-started from untracked by the artifacts, not by the flow', async () => {
    renderTab();
    const notStarted = fiveStates.find((flow) => flow.state === 'not-started');
    if (!notStarted) throw new Error('fixture set lost its not-started plan');

    const card = screen.getByTestId(`flow-plan-${notStarted.planFolder}`);
    expect(card.textContent).toContain('no artifacts');
    expect(card.textContent).toContain('not a fault');
  });

  it('shows the corrupt reason verbatim — a paraphrased diagnosis is not a diagnosis', async () => {
    renderTab();
    const corrupt = fiveStates.find((flow) => flow.state === 'corrupt');
    if (!corrupt?.reason) throw new Error('the corrupt fixture stopped carrying a reason');

    expect(screen.getByTestId(`flow-plan-reason-${corrupt.planFolder}`).textContent).toBe(
      corrupt.reason
    );
  });

  it('draws the rail for the live plan and for no other', async () => {
    renderTab();

    for (const flow of fiveStates) {
      const rail = screen.queryByTestId(`phase-rail-${flow.planFolder}`);
      if (flow.state === 'live') expect(rail).toBeTruthy();
      else expect(rail).toBeNull();
    }
  });

  it('renders the adversarial kitchen-sink plan without crashing', async () => {
    // Unknown node type, an invalid status word, injection-shaped labels. Every one of those is a
    // thing the CLI genuinely persists, so tolerating them is the contract, not politeness.
    renderTab({ flows: [kitchenSink] });

    expect(screen.getByTestId(`flow-plan-${kitchenSink.planFolder}`)).toBeTruthy();
  });

  it('counts every state in the histogram, zeroes included', async () => {
    renderTab();

    for (const state of ['live', 'legacy', 'untracked', 'not-started', 'corrupt']) {
      expect(screen.getByTestId(`flow-histogram-${state}`).textContent).toContain('1');
    }
    expect(flowHistogram([])).toEqual({
      live: 0,
      legacy: 0,
      untracked: 0,
      'not-started': 0,
      corrupt: 0,
    });
  });
});

describe('FlowsTab — the three tab-level absences', () => {
  it('renders a designed state in global scope, never an error and never a blank', async () => {
    // `/api/pij/flow` requires a workspace: there is no machine-wide flow view to fail at producing.
    renderTab({ scope: 'global' });

    const card = screen.getByTestId('flows-empty-global-scope');
    expect(card.getAttribute('data-reason')).toBe('global-scope');
    expect(card.textContent).toContain('workspace-scoped');
    expect(screen.queryByTestId('flows-empty-unreadable')).toBeNull();
  });

  it('keeps the E- code verbatim when the read failed', async () => {
    renderTab({ flows: [], error: 'E-STORE-UNREADABLE: EACCES: permission denied' });

    const card = screen.getByTestId('flows-empty-unreadable');
    expect(card.textContent).toContain('E-STORE-UNREADABLE');
    expect(card.textContent).toContain('read failure, not an empty repo');
  });

  it('prints the path it read when there are genuinely no plan folders', async () => {
    renderTab({ flows: [] });

    const card = screen.getByTestId('flows-empty-no-plans');
    expect(card.textContent).toContain(`${UI_WORKSPACE_PATH}/docs/plans`);
  });

  it('ranks global scope above a stale error — a boundary is not a fault', async () => {
    expect(flowsAbsenceReason({ flows: [], error: 'E-X: boom', scope: 'global' })).toBe(
      'global-scope'
    );
    expect(flowsAbsenceReason({ flows: [], error: 'E-X: boom', scope: 'workspace' })).toBe(
      'unreadable'
    );
    expect(flowsAbsenceReason({ flows: [], error: null, scope: 'workspace' })).toBe('no-plans');
    expect(flowsAbsenceReason({ flows: fiveStates, error: null, scope: 'workspace' })).toBeNull();
  });

  it('reports rejected plan folders in flow words, on the flow tab', async () => {
    // The Fleet tab's counter says "updates filtered out (other workspaces)" about SEATS. This one is
    // about plan folders, and the two must be readable side by side without either being false.
    renderTab({ filteredOut: 3 });

    const note = screen.getByTestId('flows-filtered-out').textContent ?? '';
    expect(note).toContain('3 flow updates filtered out');
    expect(note).toContain('plan folders in other workspaces');
  });
});

describe('the Flows tab in the page shell (T001)', () => {
  let sse: ReturnType<typeof createFakeMultiplexedSSEFactory>;
  let api: FakePijApi;

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <MultiplexedSSEProvider channels={['pij']} eventSourceFactory={sse.factory}>
        {children}
      </MultiplexedSSEProvider>
    );
  }

  beforeEach(() => {
    sse = createFakeMultiplexedSSEFactory();
    api = new FakePijApi();
    api
      .setFleet({
        seq: 40,
        at: '2026-07-26T12:00:00.000Z',
        data: {
          workspace: UI_WORKSPACE_PATH,
          rows: [],
          statuses: [],
          status: pollerStatus(),
        },
      })
      .setFlows({
        seq: 40,
        at: '2026-07-26T12:00:00.000Z',
        data: {
          workspace: UI_WORKSPACE_PATH,
          flows: [flowSummary('088-remote-app-view'), flowSummary('089-first-class-pij')],
        },
      });
  });

  async function renderPage() {
    const view = render(
      <PijPageClient
        workspacePath={UI_WORKSPACE_PATH}
        workspaceName="chainglass"
        fetchImpl={api.fetch}
      />,
      { wrapper }
    );
    await waitFor(() => expect(api.countOf('flow')).toBeGreaterThan(0));
    return view;
  }

  it('offers Flows as a third tab and renders the snapshot plans on it', async () => {
    await renderPage();

    await act(async () => {
      await userEvent.click(screen.getByRole('tab', { name: 'Flows' }));
    });

    expect(screen.getByTestId('pij-flows-tab')).toBeTruthy();
    expect(screen.getByTestId('flow-plan-089-first-class-pij')).toBeTruthy();
  });

  it('re-reads the flow snapshot on tab change — the flow surface has no poll of its own', async () => {
    await renderPage();
    const before = api.countOf('flow');

    // `mouseDown` rather than a full click: Radix activates a tab on mousedown AND on the focus that
    // follows it, and inside one `act()` those two land in a single React batch, so the guard that
    // normally makes the second a no-op has not committed yet. That is a test-environment artefact of
    // batching, not the browser's behaviour — and driving the one event Radix actually activates on
    // keeps this assertion exact instead of settling for "went up by at least one".
    await act(async () => {
      fireEvent.mouseDown(screen.getByRole('tab', { name: 'Flows' }));
    });

    await waitFor(() => expect(api.countOf('flow')).toBe(before + 1));
  });
});
