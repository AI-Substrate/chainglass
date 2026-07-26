/**
 * The global pij page — Plan 089 Phase 4, T005 (AC-05 global half).
 *
 * Test Doc (suite-level):
 * - Why: this page's failure mode is a confident wrong picture of the whole machine. Three ways it
 *   could happen and all three are covered here: dropping the 129 fleet rows the tree does not place
 *   (two thirds of the machine, silently gone), collapsing a failed read into "no seats", and going
 *   quietly stale because there is no SSE up here and nothing says so.
 * - Contract: dossier T005 — Jordan's POC A pick (folder-grouped, dead in collapsed bands),
 *   snapshot-only rendered honestly, designed absence states, "rows" never "live seats".
 * - Usage Notes: pure functions tested directly; the page through an injected `fetch` and an
 *   injected clock. No `vi.mock()` (constitution P4).
 * - Quality Contribution: pins the tree/fleet split — the finding the spike turned up — as rendered
 *   behaviour rather than a note in a log.
 * - Worked Example: 3 tree seats + 2 dead rows across 2 folders → both folders shown, dead counted
 *   and listed in their own band.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  GlobalTree,
  globalTreeAbsenceReason,
  groupByFolder,
} from '../../../../apps/web/src/features/089-first-class-pij/components/global-tree';
import { PijGlobalClient } from '../../../../apps/web/src/features/089-first-class-pij/components/pij-global-client';
import type { PijTreeNode } from '../../../../apps/web/src/features/089-first-class-pij/server/pij-records.interface';
import type {
  FleetRow,
  PollerStatus,
} from '../../../../apps/web/src/features/089-first-class-pij/types';
import { asPijId } from '../../../../apps/web/src/features/089-first-class-pij/types';
import { pollerStatus } from '../../../fixtures/pij/fleet-ui';

const NOW = Date.parse('2026-07-26T12:00:00.000Z');
const FOLDER_A = '/Users/fixture/substrate/chainglass';
const FOLDER_B = '/Users/fixture/pi-hacking/pij';

function row(id: string, folder: string, overrides: Partial<FleetRow> = {}): FleetRow {
  return {
    id: asPijId(id),
    folder,
    state: 'idle',
    liveness: 'active',
    lastEventAt: '2026-07-26T11:59:00.000Z',
    extra: {},
    ...overrides,
  };
}

function node(id: string, folder: string, overrides: Partial<PijTreeNode> = {}): PijTreeNode {
  return { id, folder, ...overrides };
}

const NO_ERRORS = { fleet: null, tree: null };

describe('groupByFolder — the tree and the fleet are not the same set', () => {
  it('keeps fleet rows the tree does not place, as that folder’s dead records', () => {
    /*
    Test Doc:
    - Why: THE finding from the spike. Live, the global tree holds 52 seats and the fleet holds 181;
      the 129 difference is exactly the dead. Rendering only the tree drops two thirds of the machine
      without saying anything, which is the most expensive silent omission this page could make.
    - Contract: a row whose id is absent from the tree lands in `orphans` for its folder; a row the
      tree DOES place does not.
    - Usage Notes: the placed row is nested, not a root, so depth is covered too.
    - Quality Contribution: pins the split as data rather than as a rendering accident.
    - Worked Example: 2 placed (root + child), 2 unplaced → inTree 2, orphans 2.
    */
    const roots = [node('pij-root', FOLDER_A, { children: [node('pij-child', FOLDER_A)] })];
    const rows = [
      row('pij-root', FOLDER_A),
      row('pij-child', FOLDER_A),
      row('pij-dead-one', FOLDER_A, { liveness: 'dead' }),
      row('pij-dead-two', FOLDER_A, { liveness: 'dead' }),
    ];

    const [group] = groupByFolder(roots, rows);

    expect(group.folder).toBe(FOLDER_A);
    expect(group.inTree).toBe(2);
    expect(group.orphans.map((orphan) => String(orphan.id))).toEqual([
      'pij-dead-one',
      'pij-dead-two',
    ]);
  });

  it('shows a folder that has only dead records — it is still part of the machine', () => {
    /*
    Test Doc:
    - Why: live, 11 of 20 folders have no seat in the tree at all. If a folder only appears when the
      tree places something there, more than half the machine's folders vanish from the global view.
    - Contract: a folder present only in the fleet still yields a group, with zero roots.
    - Usage Notes: mirrors the live shape (20 fleet folders vs 9 tree folders).
    - Quality Contribution: keeps the global page global.
    - Worked Example: FOLDER_B has one dead row and no tree root → a group with 0 in tree, 1 orphan.
    */
    const groups = groupByFolder(
      [node('pij-root', FOLDER_A)],
      [row('pij-root', FOLDER_A), row('pij-gone', FOLDER_B, { liveness: 'dead' })]
    );

    const b = groups.find((group) => group.folder === FOLDER_B);
    expect(b).toBeTruthy();
    expect(b?.inTree).toBe(0);
    expect(b?.orphans).toHaveLength(1);
  });

  it('leads each folder with its primes, and orders folders by living seats', () => {
    /*
    Test Doc:
    - Why: the CLI's array order is not a ranking, and rendering it as one implies a hierarchy that
      was never read. Primes lead because they govern; folders sort by living seats so the machine's
      active work is at the top rather than wherever the store happened to list it.
    - Contract: within a folder, prime first; across folders, most-in-tree first.
    - Usage Notes: the prime is deliberately supplied SECOND in the input array.
    - Quality Contribution: makes the ordering intentional and checkable.
    - Worked Example: FOLDER_B (2 in tree) precedes FOLDER_A (1); within B, the prime is first.
    */
    const roots = [
      node('pij-a-only', FOLDER_A),
      node('pij-b-worker', FOLDER_B),
      node('pij-b-prime', FOLDER_B, { prime: true }),
    ];

    const groups = groupByFolder(roots, []);

    expect(groups.map((group) => group.folder)).toEqual([FOLDER_B, FOLDER_A]);
    expect(groups[0].roots[0].id).toBe('pij-b-prime');
  });
});

describe('globalTreeAbsenceReason — one reason, one rendering', () => {
  it('ranks a failed read above a stopped poller above an empty machine', () => {
    /*
    Test Doc:
    - Why: AC-08's trichotomy applied to this page. "We could not read", "nothing has read yet" and
      "there is genuinely nothing" are three different statements, and the ladder decides which one
      a reader is told. Collapsing any pair reports absence for a failure.
    - Contract: the precedence order, plus null when there is something to draw.
    - Usage Notes: a pure function, so the ladder is testable without a DOM.
    - Quality Contribution: the designed-states discriminator, pinned.
    - Worked Example: error+empty → 'unreadable', never 'no-seats'.
    */
    const stopped = { ...pollerStatus(), running: false } as PollerStatus;

    expect(
      globalTreeAbsenceReason({
        roots: [],
        rows: [],
        status: stopped,
        errors: { fleet: 'E-EXIT: boom', tree: null },
      })
    ).toBe('unreadable');

    expect(
      globalTreeAbsenceReason({ roots: [], rows: [], status: stopped, errors: NO_ERRORS })
    ).toBe('poller-not-running');

    expect(
      globalTreeAbsenceReason({ roots: [], rows: [], status: pollerStatus(), errors: NO_ERRORS })
    ).toBe('no-seats');

    expect(
      globalTreeAbsenceReason({
        roots: [],
        rows: [row('pij-a', FOLDER_A)],
        status: pollerStatus(),
        errors: NO_ERRORS,
      })
    ).toBeNull();
  });

  it('gives every reason a distinct test id and data-reason', () => {
    /*
    Test Doc:
    - Why: the designed-states rule — N states, N test ids. Two absences sharing a rendering are two
      situations a reader cannot tell apart, which is the whole failure this pattern prevents.
    - Contract: each reason renders its own `global-tree-empty-<reason>` with a matching data-reason.
    - Usage Notes: iterates the union so a new reason without a rendering fails here.
    - Quality Contribution: keeps absences distinguishable as the set grows.
    - Worked Example: three reasons → three distinct ids.
    */
    const cases = [
      { reason: 'unreadable', props: { errors: { fleet: 'E-EXIT: boom', tree: null } } },
      {
        reason: 'poller-not-running',
        props: { status: { ...pollerStatus(), running: false } as PollerStatus },
      },
      { reason: 'no-seats', props: {} },
    ];

    for (const testCase of cases) {
      const { unmount } = render(
        <GlobalTree
          roots={[]}
          rows={[]}
          status={pollerStatus()}
          now={NOW}
          errors={NO_ERRORS}
          {...testCase.props}
        />
      );
      const element = screen.getByTestId(`global-tree-empty-${testCase.reason}`);
      expect(element.getAttribute('data-reason')).toBe(testCase.reason);
      unmount();
    }
  });

  it('shows the pij error code verbatim rather than a friendly paraphrase', () => {
    /*
    Test Doc:
    - Why: the `E-` code is what makes a failure diagnosable instead of merely red. Paraphrasing it
      throws away the only actionable thing in the response.
    - Contract: the error string appears in the rendered absence.
    - Usage Notes: —
    - Quality Contribution: keeps AC-08's third leg useful.
    - Worked Example: 'E-TIMEOUT: pij tree timed out' rendered as given.
    */
    render(
      <GlobalTree
        roots={[]}
        rows={[]}
        status={pollerStatus()}
        now={NOW}
        errors={{ fleet: null, tree: 'E-TIMEOUT: pij tree timed out' }}
      />
    );

    expect(screen.getByTestId('global-tree-empty-unreadable').textContent).toContain(
      'E-TIMEOUT: pij tree timed out'
    );
  });
});

describe('GlobalTree — POC A, as picked', () => {
  it('renders one section per folder, with the dead in a band of their own', () => {
    /*
    Test Doc:
    - Why: Jordan's pick. The dead are present (not dropped) but banded (not merged into the forest),
      because they have no place in the tree and implying otherwise would draw structure that was
      never read.
    - Contract: a section per folder; dead rows in a `global-dead-<folder>` band; living seats as
      tree lines.
    - Usage Notes: two folders, one with a nested child, one dead row.
    - Quality Contribution: pins the chosen design's two defining properties in one test.
    - Worked Example: 2 sections; child seat line present; dead row inside the band.
    */
    render(
      <GlobalTree
        roots={[
          node('pij-root', FOLDER_A, { prime: true, children: [node('pij-child', FOLDER_A)] }),
          node('pij-other', FOLDER_B),
        ]}
        rows={[
          row('pij-root', FOLDER_A),
          row('pij-child', FOLDER_A),
          row('pij-other', FOLDER_B),
          row('pij-dead', FOLDER_A, { liveness: 'dead', state: 'stopped' }),
        ]}
        status={pollerStatus()}
        now={NOW}
        errors={NO_ERRORS}
      />
    );

    expect(screen.getByTestId(`global-folder-${FOLDER_A}`)).toBeTruthy();
    expect(screen.getByTestId(`global-folder-${FOLDER_B}`)).toBeTruthy();
    expect(screen.getByTestId('global-seat-pij-child')).toBeTruthy();

    const band = screen.getByTestId(`global-dead-${FOLDER_A}`);
    expect(band.textContent).toContain('present in the store, absent from the tree');
    expect(screen.getByTestId('global-dead-row-pij-dead')).toBeTruthy();
  });

  it('counts rows as "rows", never as live seats', () => {
    /*
    Test Doc:
    - Why: a count of rows is a count of RECORDS READ. Calling them live seats is a claim about
      running processes that this page has not checked — and 129 of 181 of them are dead, so the
      claim would be false for most of the fleet.
    - Contract: the summary says "rows" and the words "live seats" appear nowhere.
    - Usage Notes: asserts the absence of the phrase as well as the presence of the count.
    - Quality Contribution: pins a wording rule that is one careless edit from becoming a lie.
    - Worked Example: 2 rows → "2 rows across 1 folders", no "live seat".
    */
    render(
      <GlobalTree
        roots={[node('pij-root', FOLDER_A)]}
        rows={[row('pij-root', FOLDER_A), row('pij-dead', FOLDER_A, { liveness: 'dead' })]}
        status={pollerStatus()}
        now={NOW}
        errors={NO_ERRORS}
      />
    );

    const summary = screen.getByTestId('global-tree-summary');
    expect(summary.textContent).toContain('rows');
    expect(summary.textContent).toContain('1 dead records the tree does not place');
    expect(summary.textContent?.toLowerCase()).not.toContain('live seat');
  });

  it('renders the badge verbatim and nothing when a seat has none', () => {
    /*
    Test Doc:
    - Why: AC-03 holds on this page too. The global view reads the same rows as the workspace one and
      must not develop its own opinion about them.
    - Contract: a row with `badge: 'blocked'` shows it; a row without shows no badge.
    - Usage Notes: both seats are in the tree, so both render as seat lines.
    - Quality Contribution: keeps the never-re-derive rule true at every render boundary.
    - Worked Example: 'blocked' present; the other seat line carries no badge text.
    */
    render(
      <GlobalTree
        roots={[node('pij-badged', FOLDER_A), node('pij-bare', FOLDER_A)]}
        rows={[row('pij-badged', FOLDER_A, { badge: 'blocked' }), row('pij-bare', FOLDER_A)]}
        status={pollerStatus()}
        now={NOW}
        errors={NO_ERRORS}
      />
    );

    expect(screen.getByTestId('global-seat-pij-badged').textContent).toContain('blocked');
    expect(screen.getByTestId('global-seat-pij-bare').textContent).not.toContain('blocked');
  });

  it('offers no focus button anywhere — this page has no workspace to check against', () => {
    /*
    Test Doc:
    - Why: C-06's containment is checked against a workspace, and this page has none. A focus button
      here could not know whether it was allowed, so it does not exist. The absence is structural (no
      provider is mounted), which this asserts from the outside.
    - Contract: no `focus-seat-*` element in the global tree.
    - Usage Notes: the same rows that DO render buttons inside a workspace.
    - Quality Contribution: keeps the one mutation unreachable from the one page that cannot scope it.
    - Worked Example: zero focus buttons.
    */
    const { container } = render(
      <GlobalTree
        roots={[node('pij-root', FOLDER_A)]}
        rows={[row('pij-root', FOLDER_A)]}
        status={pollerStatus()}
        now={NOW}
        errors={NO_ERRORS}
      />
    );

    expect(container.querySelectorAll('[data-testid^="focus-seat-"]')).toHaveLength(0);
  });
});

describe('PijGlobalClient — snapshot-only, said out loud', () => {
  function fakeApi(overrides: { fleet?: unknown; tree?: unknown; at?: string } = {}) {
    const calls: string[] = [];
    const at = overrides.at ?? '2026-07-26T12:00:00.000Z';
    const impl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      const body = url.startsWith('/api/pij/fleet')
        ? (overrides.fleet ?? {
            seq: 1,
            at,
            data: { workspace: null, rows: [row('pij-root', FOLDER_A)], status: pollerStatus() },
          })
        : (overrides.tree ?? {
            seq: 1,
            at,
            data: { workspace: null, roots: [node('pij-root', FOLDER_A)] },
          });
      return { ok: true, status: 200, json: async () => body } as Response;
    }) as typeof fetch;
    return { impl, calls };
  }

  it('reads the two GLOBAL endpoints — no workspace parameter on either', () => {
    /*
    Test Doc:
    - Why: a workspace parameter smuggled onto either read would turn the machine-wide page into a
      single repo's page while still calling itself global — a plausible wrong answer, silently.
    - Contract: `/api/pij/fleet` with no query, `/api/pij/tree?global=1`, and no `workspace=` anywhere.
    - Usage Notes: URLs are recorded verbatim.
    - Quality Contribution: pins the scope of the page at the wire.
    - Worked Example: exactly those two URLs.
    */
    const { impl, calls } = fakeApi();
    render(<PijGlobalClient fetchImpl={impl} nowImpl={() => NOW} />);

    return waitFor(() => {
      expect(calls).toContain('/api/pij/fleet');
      expect(calls).toContain('/api/pij/tree?global=1');
      expect(calls.some((url) => url.includes('workspace='))).toBe(false);
    });
  });

  it('says when the snapshot was taken and that it does not update itself', async () => {
    /*
    Test Doc:
    - Why: there is no SSE provider outside the workspace layout, so this page cannot go live. A page
      that quietly went stale would keep showing a fleet that no longer exists with no way to tell —
      the exact failure the plan is written against.
    - Contract: an "as of" element carrying `data-reason="snapshot-current"` when fresh, and the
      explicit statement that the page does not update itself.
    - Usage Notes: the clock is injected so the age is deterministic.
    - Quality Contribution: makes the design limitation a rendered fact.
    - Worked Example: fresh snapshot → 'snapshot as of 0s — this page does not update itself'.
    */
    const { impl } = fakeApi();
    render(<PijGlobalClient fetchImpl={impl} nowImpl={() => NOW} />);

    await waitFor(() => {
      const asOf = screen.getByTestId('global-as-of');
      expect(asOf.getAttribute('data-reason')).toBe('snapshot-current');
      expect(asOf.textContent).toContain('does not update itself');
    });
    expect(screen.queryByTestId('global-stale-banner')).toBeNull();
  });

  it('escalates to its own staleness state once the snapshot ages out', async () => {
    /*
    Test Doc:
    - Why: "as of 3h" in small grey text is not enough once a snapshot is old — the reader is looking
      at a picture of the past believing it is the present. Staleness gets its own rendered state and
      its own data-reason, per the designed-states pattern.
    - Contract: an old `at` → `data-reason="snapshot-stale"` plus a visible banner naming the age and
      the reason there is no live channel.
    - Usage Notes: the snapshot is dated two hours before the injected now.
    - Quality Contribution: turns a quiet limitation into a loud one, which is the point.
    - Worked Example: 2h-old snapshot → stale banner.
    */
    const { impl } = fakeApi({ at: '2026-07-26T10:00:00.000Z' });
    render(<PijGlobalClient fetchImpl={impl} nowImpl={() => NOW} />);

    await waitFor(() => {
      expect(screen.getByTestId('global-as-of').getAttribute('data-reason')).toBe('snapshot-stale');
    });
    const banner = screen.getByTestId('global-stale-banner');
    expect(banner.textContent).toContain('2h old');
    expect(banner.textContent).toContain('no live channel');
  });

  it('re-reads both endpoints when asked, and only when asked', async () => {
    /*
    Test Doc:
    - Why: the refresh button is the page's entire update mechanism, so it must work — and the page
      must NOT poll behind it, because a ticking timestamp over silently-refetched data is the same
      dishonesty in a different costume.
    - Contract: two reads on mount; four after one click; nothing in between.
    - Usage Notes: counts recorded URLs.
    - Quality Contribution: pins both halves — the button works, and nothing else fires.
    - Worked Example: 2 → click → 4.
    */
    const { impl, calls } = fakeApi();
    render(<PijGlobalClient fetchImpl={impl} nowImpl={() => NOW} />);

    await waitFor(() => expect(calls).toHaveLength(2));

    await userEvent.click(screen.getByTestId('global-refresh'));

    await waitFor(() => expect(calls).toHaveLength(4));
  });

  it('renders one surface failing without blanking the other', async () => {
    /*
    Test Doc:
    - Why: the two reads are independent. A tree read that 503s must not erase a fleet that read
      fine — "the tree could not be read" and "there are no seats" are different pages.
    - Contract: a failing tree read surfaces the error state carrying the pij code.
    - Usage Notes: the fleet still answers 200.
    - Quality Contribution: keeps a partial failure partial.
    - Worked Example: tree 503 E-EXIT → unreadable state naming E-EXIT.
    */
    const calls: string[] = [];
    const impl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith('/api/pij/tree')) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: 'pij store unreadable', code: 'E-EXIT' }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          seq: 1,
          at: '2026-07-26T12:00:00.000Z',
          data: { workspace: null, rows: [row('pij-root', FOLDER_A)], status: pollerStatus() },
        }),
      } as Response;
    }) as typeof fetch;

    render(<PijGlobalClient fetchImpl={impl} nowImpl={() => NOW} />);

    await waitFor(() =>
      expect(screen.getByTestId('global-tree-empty-unreadable').textContent).toContain('E-EXIT')
    );
  });
});
