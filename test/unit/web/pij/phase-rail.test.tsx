/**
 * The phase rail — Plan 089 Phase 3 (T004) · AC-06.
 *
 * Test Doc:
 * - Why: the rail is the one place in this feature that draws a *sequence*, and a sequence is the
 *   easiest thing to draw confidently wrong. Flow documents store nodes newest-first, reviews branch
 *   off phases that are not the current one, and unreachable nodes have no position at all — three
 *   traps that all produce a rail which looks perfectly plausible.
 * - Contract: AC-06 (in-progress ph6 and the ph4 excursion reviews, against the real 088 fixture);
 *   C-09 (order by `order`; completion never from the file set); dossier T004.
 * - Usage Notes: the 088 fixture is MATERIALIZED and read by the real `IFlowReader` — a hand-written
 *   summary would let a wrong expectation and a wrong implementation agree with each other. No
 *   `vi.mock()`; the reader is the real one and the fixture is real bytes on disk.
 * - Quality Contribution: pins the three misreadings — array order, cursor-attached reviews, and
 *   spliced off-spine nodes — that would each make the rail lie about the plan's shape.
 * - Worked Example: 088 → six phases ph1…ph6, ph6 in progress at position 6 of 6, five done, and
 *   rv4/rv4b/rv4c hanging off ph4 while the cursor sits on ph6.
 */
import { render, screen, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PhaseRail,
  offSpinePhases,
  railPosition,
  reviewsForPhase,
  spinePhases,
} from '../../../../apps/web/src/features/089-first-class-pij/components/phase-rail';
import { createFlowReader } from '../../../../apps/web/src/features/089-first-class-pij/server/flow-reader';
import type { FlowSummary } from '../../../../apps/web/src/features/089-first-class-pij/server/flow-reader.interface';
import { FLOW_FIXTURES, materializeFlowFixture } from '../../../fixtures/flows';

let live088: FlowSummary;
let orphan: FlowSummary;
const cleanups: Array<() => void> = [];

beforeAll(async () => {
  const reader = createFlowReader();
  const a = materializeFlowFixture(FLOW_FIXTURES.live088);
  const b = materializeFlowFixture(FLOW_FIXTURES.orphanNode);
  cleanups.push(a.cleanup, b.cleanup);
  live088 = await reader.read(a.planDir);
  orphan = await reader.read(b.planDir);
});

afterAll(() => {
  for (const cleanup of cleanups) cleanup();
});

describe('PhaseRail — AC-06 against the real 088 flow', () => {
  it('draws the six phases in spine order with ph6 in progress', async () => {
    render(<PhaseRail flow={live088} />);

    const ids = [...document.querySelectorAll('[data-testid^="rail-phase-"]')].map((node) =>
      node.getAttribute('data-testid')
    );
    expect(ids).toEqual([
      'rail-phase-ph1',
      'rail-phase-ph2',
      'rail-phase-ph3',
      'rail-phase-ph4',
      'rail-phase-ph5',
      'rail-phase-ph6',
    ]);
    expect(screen.getByTestId('rail-position').textContent).toBe('phase 6 of 6');
    expect(screen.getByTestId('rail-done').textContent).toBe('5 of 6 done');
  });

  it('attaches the excursion reviews to ph4 — the phase they branch off, not the current one', async () => {
    // The trap, stated plainly: `nav.now` is ph6 and all three reviews are `branch_of: ph4`. Hanging
    // them off the cursor would report Phase 6 as thrice-reviewed when it has not been reviewed at all.
    render(<PhaseRail flow={live088} />);

    const ph4 = screen.getByTestId('rail-phase-ph4');
    const ph6 = screen.getByTestId('rail-phase-ph6');

    for (const id of ['rv4', 'rv4b', 'rv4c']) {
      const chip = within(ph4).getByTestId(`rail-review-${id}`);
      expect(chip.getAttribute('data-branch-of')).toBe('ph4');
      expect(within(ph6).queryByTestId(`rail-review-${id}`)).toBeNull();
    }
  });

  it('labels the counts as PHASE activations — flow data has no seat dimension to name', async () => {
    render(<PhaseRail flow={live088} />);

    // ph4 was entered twice; the wording must not invent a who.
    expect(screen.getByTestId('rail-activations-ph4').textContent).toContain('2 phase activations');
    expect(screen.getByTestId('rail-activations-ph6').textContent).toContain('1 phase activation');
    // ph3 has zero — rendered as nothing, not as "0 activations", which reads as a measurement.
    expect(screen.queryByTestId('rail-activations-ph3')).toBeNull();
  });

  it('names the basis for completion rather than counting files', async () => {
    render(<PhaseRail flow={live088} />);

    const completion = screen.getByTestId('rail-completion').textContent ?? '';
    expect(completion).toContain('active');
    expect(completion).toContain('nav.bag.status');
  });

  it('renders nav.next as advisory, never as what happens next', async () => {
    render(<PhaseRail flow={live088} />);

    const next = screen.getByTestId('rail-next').textContent ?? '';
    expect(next).toContain('advisory');
    expect(next).toContain('ship');
  });
});

describe('PhaseRail — order comes from `order`, never from array position', () => {
  it('renders identically when the phases arrive shuffled', async () => {
    // Flow documents store their nodes NEWEST FIRST, so array order is reverse order on real data.
    // Reversing the input must change nothing at all about the rail.
    const shuffled: FlowSummary = { ...live088, phases: [...live088.phases].reverse() };

    const { container: straight } = render(<PhaseRail flow={live088} />);
    const straightHtml = straight.innerHTML;
    const { container: reversed } = render(<PhaseRail flow={shuffled} />);

    expect(reversed.innerHTML).toBe(straightHtml);
  });

  it('sorts a copy — the caller’s array is left exactly as it was', async () => {
    // The phases array belongs to a snapshot other components render from. Sorting it in place is a
    // bug that only ever shows up somewhere else.
    const input = [...live088.phases].reverse();
    const before = input.map((phase) => phase.id);

    spinePhases(input);

    expect(input.map((phase) => phase.id)).toEqual(before);
  });
});

describe('PhaseRail — off-spine nodes are never given a position', () => {
  it('keeps an unreachable node out of the rail and says so', async () => {
    const strays = offSpinePhases(orphan.phases);
    expect(strays.length).toBeGreaterThan(0);

    render(<PhaseRail flow={orphan} />);

    for (const stray of strays) {
      expect(screen.queryByTestId(`rail-phase-${stray.id}`)).toBeNull();
    }
    const note = screen.getByTestId('rail-off-spine').textContent ?? '';
    expect(note).toContain('off the spine');
    for (const stray of strays) expect(note).toContain(stray.id);
  });
});

describe('PhaseRail — the exported helpers', () => {
  it('positions the cursor from nowPhaseId', async () => {
    expect(railPosition(live088)).toBe(6);
  });

  it('reports no position when the cursor is not on a spine phase', async () => {
    // A cursor parked on a chore or a review is a real state, and `null` is the honest answer for it —
    // far better than silently rounding to phase 1 or to the last done phase.
    expect(railPosition({ ...live088, nowPhaseId: 'rv4', phases: [] })).toBeNull();
  });

  it('keys reviews on branch_of and nothing else', async () => {
    expect(reviewsForPhase(live088.reviews, 'ph4').map((review) => review.id)).toEqual([
      'rv4',
      'rv4b',
      'rv4c',
    ]);
    expect(reviewsForPhase(live088.reviews, 'ph6')).toEqual([]);
  });
});
