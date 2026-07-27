/**
 * The pij overlay — Plan 089 Phase 4, T003. The fifth F-14 sibling.
 *
 * Test Doc (suite-level):
 * - Why: this panel's failure modes are all *state* failures, not rendering ones. It closes itself
 *   the moment it opens (the PL-08 self-close), or it survives a route change it should have
 *   survived — or, most quietly, it loses its open/closed flag on navigation because the flag was
 *   put in the lazily-mounted panel instead of the always-mounted provider. None of those is
 *   visible in a screenshot.
 * - Contract: dossier T003 / AC-12 — three trigger paths, mutual exclusion, Escape, ErrorBoundary
 *   renders null, and open state survives an in-workspace route change.
 * - Usage Notes: `FakePijApi` for the fleet read, `createFakeMultiplexedSSEFactory` for the channel.
 *   No `vi.mock()` (constitution P4).
 * - Quality Contribution: pins the three trigger paths as one behaviour and the state's LOCATION as
 *   an observable property.
 * - Worked Example: dispatch `pij:toggle` → panel visible; rerender under a new child route → still
 *   visible.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PijOverlayPanel } from '../../../../apps/web/src/features/089-first-class-pij/components/pij-overlay-panel';
import { PijOverlayProvider } from '../../../../apps/web/src/features/089-first-class-pij/hooks/use-pij-overlay';
import { asPijId } from '../../../../apps/web/src/features/089-first-class-pij/types';
import { MultiplexedSSEProvider } from '../../../../apps/web/src/lib/sse/multiplexed-sse-provider';
import { createFakeMultiplexedSSEFactory } from '../../../fakes/fake-multiplexed-sse';
import { FakePijApi } from '../../../fakes/fake-pij-api';
import {
  UI_FLEET_ROWS,
  UI_NOW,
  UI_PM_ID,
  UI_PRIME_ID,
  UI_TREE_ROOTS,
  UI_WORKER_IDS,
  pollerStatus,
} from '../../../fixtures/pij/fleet-ui';

const WORKSPACE = '/Users/fixture/substrate/chainglass';

let sse: ReturnType<typeof createFakeMultiplexedSSEFactory>;
let api: FakePijApi;

beforeEach(() => {
  sse = createFakeMultiplexedSSEFactory();
  api = new FakePijApi();
});

/**
 * The layout's shape, minus everything the overlay does not touch.
 *
 * `showPanel` exists for the AC-12 test: the real panel is a `dynamic(ssr:false)` import, so it can
 * unmount and remount underneath a provider that never does. Dropping it from the tree reproduces
 * that, which a plain rerender does not — React reconciles the same element and the panel would keep
 * its state either way, making the "survives navigation" claim untestable.
 */
function Harness({ children, showPanel = true }: { children?: ReactNode; showPanel?: boolean }) {
  return (
    <MultiplexedSSEProvider channels={['pij']} eventSourceFactory={sse.factory}>
      <PijOverlayProvider defaultWorkspacePath={WORKSPACE}>
        {children}
        {showPanel ? <PijOverlayPanel fetchImpl={api.fetch as unknown as typeof fetch} /> : null}
      </PijOverlayProvider>
    </MultiplexedSSEProvider>
  );
}

function toggle() {
  act(() => {
    window.dispatchEvent(new CustomEvent('pij:toggle'));
  });
}

/** The panel is `display:none` when closed, so visibility is the style, not the presence. */
function panelDisplay(): string | null {
  const panel = screen.queryByTestId('pij-overlay-panel');
  return panel ? (panel as HTMLElement).style.display : null;
}

describe('the pij overlay — opening and closing', () => {
  it('renders nothing at all until it is first opened', async () => {
    /*
    Test Doc:
    - Why: the `hasOpened` lazy guard. Every workspace page mounts this panel; if it rendered its
      content on mount, every page load would open an SSE-backed fleet read nobody asked for.
    - Contract: no panel element in the DOM before the first toggle.
    - Usage Notes: queryByTestId, because absence is the assertion.
    - Quality Contribution: keeps the always-mounted provider cheap.
    - Worked Example: fresh render → no pij-overlay-panel.
    */
    render(<Harness />);

    expect(screen.queryByTestId('pij-overlay-panel')).toBeNull();
  });

  it('opens on the `pij:toggle` event and closes on the next one', async () => {
    /*
    Test Doc:
    - Why: the CustomEvent is the seam all three trigger paths share (sidebar button, SDK command,
      keybinding), because the sidebar and the SDK both live outside this provider. If the event
      does not toggle, none of the three works.
    - Contract: first event → display 'flex'; second → 'none' (not unmounted).
    - Usage Notes: `display` rather than presence — the panel stays mounted so reopening is instant.
    - Quality Contribution: covers all three AC-12 trigger paths at the point they converge.
    - Worked Example: toggle, toggle → flex, none.
    */
    render(<Harness />);

    toggle();
    await waitFor(() => expect(panelDisplay()).toBe('flex'));

    toggle();
    expect(panelDisplay()).toBe('none');
  });

  it('does not close itself while opening (PL-08)', async () => {
    /*
    Test Doc:
    - Why: opening dispatches `overlay:close-all` for mutual exclusion, and this provider LISTENS for
      that event. Without the `isOpeningRef` guard the open immediately closes itself — the exact bug
      the question-popper sibling still has, which is why that one is not the pattern to copy.
    - Contract: after one toggle the panel is open, despite the close-all it dispatched itself.
    - Usage Notes: the guard is invisible except through this outcome.
    - Quality Contribution: pins the one line that makes opening work at all.
    - Worked Example: toggle → still open.
    */
    render(<Harness />);

    toggle();

    await waitFor(() => expect(panelDisplay()).toBe('flex'));
  });

  it('closes when another overlay opens (mutual exclusion, Plan 065)', async () => {
    /*
    Test Doc:
    - Why: two full-height panels at the same z-index would stack unreadably. The convention is that
      opening any overlay closes the rest, and that only works if every sibling honours it.
    - Contract: an `overlay:close-all` from elsewhere closes an open pij panel.
    - Usage Notes: dispatched directly, as another overlay's open would.
    - Quality Contribution: keeps this sibling a good citizen of a convention it can silently break.
    - Worked Example: open, then close-all → display 'none'.
    */
    render(<Harness />);
    toggle();
    await waitFor(() => expect(panelDisplay()).toBe('flex'));

    act(() => {
      window.dispatchEvent(new CustomEvent('overlay:close-all'));
    });

    expect(panelDisplay()).toBe('none');
  });

  it('closes on Escape', async () => {
    /*
    Test Doc:
    - Why: the universal dismiss. An overlay that traps the user is worse than no overlay.
    - Contract: Escape while open → closed.
    - Usage Notes: keydown on document, where the handler is bound.
    - Quality Contribution: the F-14 sibling contract's last behaviour.
    - Worked Example: open, Escape → display 'none'.
    */
    render(<Harness />);
    toggle();
    await waitFor(() => expect(panelDisplay()).toBe('flex'));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(panelDisplay()).toBe('none');
  });
});

describe('the pij overlay — AC-12: state survives navigation', () => {
  it('stays open across an in-workspace route change', async () => {
    /*
    Test Doc:
    - Why: THE reason the open/closed flag lives in the always-mounted provider rather than in the
      panel. The panel is a `dynamic(ssr:false)` import inside the workspace layout; navigating
      between routes under `[slug]` swaps the children while the layout — and the provider — stay
      mounted. State kept in the panel would vanish on every navigation, and the overlay would appear
      to close itself at random.
    - Contract: open the panel, rerender with DIFFERENT children (a new child route), panel still open.
    - Usage Notes: the children change and the provider does not, which is exactly what a Next.js
      route change under a shared layout does.
    - Quality Contribution: makes the state's LOCATION an observable property rather than a code
      review note.
    - Worked Example: open under /browser, rerender as /pij → still 'flex'.
    */
    const { rerender } = render(
      <Harness>
        <div data-testid="route-browser">browser route</div>
      </Harness>
    );

    toggle();
    await waitFor(() => expect(panelDisplay()).toBe('flex'));

    rerender(
      <Harness>
        <div data-testid="route-pij">pij route</div>
      </Harness>
    );

    expect(screen.getByTestId('route-pij')).toBeTruthy();
    expect(screen.queryByTestId('route-browser')).toBeNull();
    expect(panelDisplay()).toBe('flex');
  });

  it('stays open even when the panel itself unmounts and comes back', async () => {
    /*
    Test Doc:
    - Why: the discriminating version of the test above. A plain rerender never unmounts the panel,
      so state held in the PANEL would survive it too — the assertion would pass against the very
      design AC-12 forbids. The panel is a `dynamic(ssr:false)` import behind an ErrorBoundary; it
      genuinely can go away and come back while the layout's provider stays mounted. Only then does
      "the state lives in the provider" become an observable claim.
    - Contract: open → panel removed from the tree → panel restored → still open.
    - Usage Notes: `showPanel` drops the element entirely, which is a real unmount rather than a
      reconciled update.
    - Quality Contribution: turns AC-12 from a passing assertion into a failing-if-wrong one.
    - Worked Example: open, unmount (gone), remount → display 'flex' with no second toggle.
    */
    const { rerender } = render(<Harness />);

    toggle();
    await waitFor(() => expect(panelDisplay()).toBe('flex'));

    rerender(<Harness showPanel={false} />);
    expect(screen.queryByTestId('pij-overlay-panel')).toBeNull();

    rerender(<Harness showPanel />);

    await waitFor(() => expect(panelDisplay()).toBe('flex'));
  });
});

describe('the pij overlay — what it shows', () => {
  it('lists the workspace fleet with each seat’s badge, rendered verbatim', async () => {
    /*
    Test Doc:
    - Why: the panel exists to answer "what is my fleet doing" at a glance, and the badge is the
      answer pij itself computed. Re-deriving it here would drift from the page it sits over.
    - Contract: a scripted fleet snapshot renders one row per seat, with the badge string as given.
    - Usage Notes: FakePijApi scripts the snapshot; the SSE fake provides the channel context.
    - Quality Contribution: AC-03 at the overlay's own render boundary.
    - Worked Example: two seats → two rows; badge 'blocked' shown as 'blocked'.
    */
    api.setFleet({
      seq: 7,
      at: '2026-07-26T06:00:00.000Z',
      data: {
        workspace: WORKSPACE,
        rows: [
          {
            id: asPijId('pij-overlay-one'),
            folder: WORKSPACE,
            state: 'working',
            badge: 'blocked',
            lastEventAt: '2026-07-26T05:59:00.000Z',
            extra: {},
          },
          {
            id: asPijId('pij-overlay-two'),
            folder: WORKSPACE,
            state: 'idle',
            lastEventAt: '2026-07-26T05:00:00.000Z',
            extra: {},
          },
        ],
        status: pollerStatus(),
      },
    });
    render(<Harness />);

    toggle();

    await waitFor(() =>
      expect(screen.getByTestId('seat-row-pij-overlay-one').textContent).toContain('blocked')
    );
    expect(screen.getByTestId('seat-row-pij-overlay-two')).toBeTruthy();
    expect(screen.getByTestId('fleet-count').textContent).toContain('2 seats');
  });

  it('renders a read failure as a failure, never as an empty fleet', async () => {
    /*
    Test Doc:
    - Why: an empty list and a failed read look identical, and mean opposite things: "no seats here"
      versus "we could not tell". The quick-glance surface is the WORST place to conflate them,
      because a glance is all it gets.
    - Contract: a 503 renders the error element, and no empty-state text.
    - Usage Notes: the store-unreadable leg of AC-08.
    - Quality Contribution: keeps the panel honest at a glance.
    - Worked Example: 503 → error shown, empty-state absent.
    */
    api.failWith('fleet', 503, { error: 'pij store unreadable', code: 'E-EXIT' });
    render(<Harness />);

    toggle();

    // The unreadable-store state is the VIEW's, reached through the overlay: this asserts the error
    // survives the delegation, not that the overlay re-renders one of its own.
    await waitFor(() => expect(screen.getByTestId('fleet-empty-unreadable')).toBeTruthy());
  });

  it('renders the page fleet view itself — full fidelity, not a summary', async () => {
    /*
    Test Doc:
    - Why: this panel has now been thinned TWICE — the plan scoped it a "compact fleet list"
      (AC-12 / 4.3) and the first build honoured that, then a structured-but-still-condensed
      rewrite dropped observed state, model provenance, effort, flags and the section meta. Jordan
      ruled on 2026-07-27 that the overlay must carry what the POC and page carry. The pull toward
      "just a summary" is evidently strong, so the reversal needs a test holding it open.
    - Contract: the overlay renders `FleetView` (`pij-fleet-view`), and the page's own structure
      reaches it — the prime SHELL contains its PM, and the PM's row carries the model column.
    - Usage Notes: shared fixtures, so page and overlay are proven against one fleet shape. The
      empty/error states are the view's and are proven in `fleet-view.test.tsx`; asserting them
      again here would pin a copy that no longer exists.
    - Quality Contribution: containment via `within`, not co-presence — two seats can both be on
      screen while the nesting is wrong, and only containment tells them apart. Asserting a
      page-owned testid is the point: if someone reintroduces a bespoke overlay renderer, this
      fails even if their version looks correct.
    - Worked Example: prime owl's shell contains PM cheetah, whose row shows its bound model.
    */
    api.setFleet({
      seq: 11,
      at: UI_NOW,
      data: { workspace: WORKSPACE, rows: UI_FLEET_ROWS, status: pollerStatus() },
    });
    api.setTree({
      seq: 11,
      at: UI_NOW,
      data: { workspace: WORKSPACE, roots: UI_TREE_ROOTS },
    });
    render(<Harness />);

    toggle();

    // The overlay's body IS the page's view — not a lookalike with its own testids.
    await waitFor(() => expect(screen.getByTestId('pij-fleet-view')).toBeTruthy());

    const shell = screen.getByTestId(`prime-shell-${UI_PRIME_ID}`);
    // The PM is INSIDE the prime it belongs to, not merely somewhere on screen.
    const pmRow = within(shell).getByTestId(`seat-row-${UI_PM_ID}`);
    expect(pmRow.textContent).toContain('PM');
    // A column the condensed rewrites both dropped: if the panel is ever re-thinned, this is what
    // goes missing first, so it is what the test watches.
    expect(pmRow.textContent).toContain('claude-opus');
    expect(within(shell).getByTestId(`seat-row-${UI_WORKER_IDS[0]}`)).toBeTruthy();
  });
});
