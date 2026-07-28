/**
 * The focus button — Plan 089 Phase 4, T006. The CLIENT half of C-06.
 *
 * Test Doc (suite-level):
 * - Why: the server route refuses what it should, but C-06 is a claim about *how the request comes
 *   to exist*: only because a human clicked. That is not observable from the route's tests — it is a
 *   property of the client surface, and it is what the audit test at the bottom of this file checks
 *   statically. The rest pin the three button states and the verbatim rendering of what came back.
 * - Contract: dossier T006 — button only where the seat's workspace is the current one; disabled
 *   out-of-scope; absent in global scope; results shown as observations.
 * - Usage Notes: a fake `fetch` is injected through `FleetView`'s `focusFetchImpl` seam. No
 *   `vi.mock()`, no real network (constitution P4).
 * - Quality Contribution: proves the one mutation in this feature cannot fire without a click, and
 *   that its refusals reach the human in the route's own words.
 * - Worked Example: click focus on `pij-prime-owl` → one POST → "focused @220" rendered.
 */
import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { handlePijFocusRequest } from '../../../../apps/web/app/api/pij/focus/route';
import { FleetView } from '../../../../apps/web/src/features/089-first-class-pij/components/fleet-view';
import { createPijPoller } from '../../../../apps/web/src/features/089-first-class-pij/server/pij-poller.service';
import { createPijRecords } from '../../../../apps/web/src/features/089-first-class-pij/server/pij-records';
import { FakeFocusExecutor } from '../../../fakes/fake-focus-executor';
import { FakePijExecutor, execFileFailure } from '../../../fakes/fake-pij-executor';
import {
  BroadcastRecorder,
  FakeScheduler,
  FakeSpineCursor,
} from '../../../fakes/fake-pij-poller-deps';
import {
  UI_FLEET_ROWS,
  UI_PM_ID,
  UI_PRIME_ID,
  UI_SIBLING_PATH,
  UI_TREE_ROOTS,
  UI_WORKSPACE_PATH,
  fleetRow,
  pollerStatus,
} from '../../../fixtures/pij/fleet-ui';

const NOW = Date.parse('2026-07-26T12:00:00.000Z');

/** A `fetch` double that records every request and answers with one canned response. */
function fakeFetch(response: { status: number; body: unknown }) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body,
    } as Response;
  }) as typeof fetch;
  return { impl, calls };
}

/**
 * A `fetch` double that answers from the REAL focus route.
 *
 * Used where the assertion is about the two halves AGREEING — a canned body proves only that the
 * client can read the field the test author put there. Everything server-side is a fake (constitution
 * P4): the pij CLI, the scheduler, the cursor, the broadcast.
 */
function routeBackedFetch(overrides: { nodeShowFails?: Error; focusFails?: Error }): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const exec = new FakePijExecutor().whenJson(['list', '--json', '--badge'], []);
    if (overrides.nodeShowFails) {
      exec.when(['node', 'show', UI_PRIME_ID, '--json']).fails(overrides.nodeShowFails);
    } else {
      // A perfectly focusable seat: in this workspace, active, with a window. Everything before the
      // tmux call has to SUCCEED for the tmux branch to be reachable at all.
      exec.whenJson(['node', 'show', UI_PRIME_ID, '--json'], {
        id: UI_PRIME_ID,
        cwd: UI_WORKSPACE_PATH,
        liveness: 'active',
        lastEventAt: '2026-07-26T11:59:00.000Z',
        windowId: '@220',
      });
    }

    const poller = createPijPoller({
      cursor: new FakeSpineCursor(1),
      records: createPijRecords({ exec: exec.exec, defaultCwd: UI_WORKSPACE_PATH }),
      broadcast: new BroadcastRecorder().broadcast,
      scheduler: new FakeScheduler(),
      now: () => new Date(NOW),
    });
    await poller.start();

    const request = new NextRequest(`http://localhost${String(input)}`, {
      method: 'POST',
      body: String(init?.body ?? '{}'),
      headers: { 'content-type': 'application/json' },
    });
    const focus = new FakeFocusExecutor();
    if (overrides.focusFails) focus.fails(overrides.focusFails);
    return handlePijFocusRequest(request, {
      authFn: async () => ({ user: { name: 'jordan' } }),
      poller,
      focusExecutor: focus.exec,
    });
  }) as typeof fetch;
}

function renderFleet(overrides: Partial<Parameters<typeof FleetView>[0]> = {}) {
  return render(
    <FleetView
      rows={UI_FLEET_ROWS}
      tree={UI_TREE_ROOTS}
      status={pollerStatus()}
      workspacePath={UI_WORKSPACE_PATH}
      now={NOW}
      scope="workspace"
      onScopeChange={() => {}}
      filteredOut={0}
      outsideRoot={0}
      {...overrides}
    />
  );
}

describe('the focus button — where it is, and where it deliberately is not', () => {
  it('offers focus for every seat in this workspace, on BOTH render paths', async () => {
    /*
    Test Doc:
    - Why: the affordance has to exist before anything else about it matters — and it has to exist on
      both paths a seat can reach the screen by. A prime renders in the shell's custom header, every
      other seat renders through `SeatRow`; covering only one would leave the global-absence test
      below unable to distinguish "correctly absent" from "never rendered anywhere".
    - Contract: the prime lead AND a member seat each render an enabled focus button.
    - Usage Notes: `UI_PRIME_ID` takes the header path; `UI_PM_ID` takes the SeatRow path.
    - Quality Contribution: the positive control for both absence tests, and the pin for the decision
      that the prime is focusable like any other seat.
    - Worked Example: two enabled buttons, one per path.
    */
    renderFleet();

    for (const id of [UI_PRIME_ID, UI_PM_ID]) {
      const button = screen.getByTestId(`focus-seat-${id}`) as HTMLButtonElement;
      expect(button, `${id} must offer focus`).toBeTruthy();
      expect(button.disabled, `${id} is in this workspace and must be enabled`).toBe(false);
    }
  });

  it('disables — rather than hides — the button for a seat outside this workspace', async () => {
    /*
    Test Doc:
    - Why: the sibling-directory hazard, at the point where it would focus another repo's agent. The
      seat IS in the list, so omitting its button silently would read as a rendering gap; disabling it
      with the reason in the title says the row was considered and refused.
    - Contract: a seat whose folder is `…/chainglass-worktree` renders a DISABLED button whose title
      names the directory it actually works in.
    - Usage Notes: the sibling path shares the workspace's prefix — `startsWith` would call it inside.
    - Quality Contribution: pins both the containment rule and the choice of disabled over hidden.
    - Worked Example: folder '/…/chainglass-worktree' → disabled, title names it.
    */
    renderFleet({
      rows: [fleetRow(UI_PRIME_ID, { prime: true, folder: UI_SIBLING_PATH })],
      tree: [],
    });

    const button = screen.getByTestId(`focus-seat-${UI_PRIME_ID}`) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain(UI_SIBLING_PATH);
    expect(button.title).toContain('outside this workspace');
  });

  it('renders no focus button at all in global scope', async () => {
    /*
    Test Doc:
    - Why: the global list has no workspace to check containment against, so every button there would
      be a button that cannot know whether it is allowed. The absence is structural — the global
      branch mounts no provider — rather than a condition someone can forget.
    - Contract: scope 'global' → no focus button for any row.
    - Usage Notes: the same rows that DO render a button in workspace scope.
    - Quality Contribution: proves the absence comes from the tree shape, not from the row data.
    - Worked Example: global scope → queryAllByTestId(/^focus-seat-/) is empty.
    */
    const { container } = renderFleet({ scope: 'global' });

    expect(container.querySelectorAll('[data-testid^="focus-seat-"]')).toHaveLength(0);
  });
});

describe('the focus button — what a click does, and what it reports', () => {
  it('posts exactly one focus request, only when clicked', async () => {
    /*
    Test Doc:
    - Why: C-06's whole point. Rendering the page must not focus anything; the click must, once.
    - Contract: zero requests after render; exactly one POST after one click, carrying the seat id in
      the body and the workspace in the query.
    - Usage Notes: the count is asserted BEFORE the click as well as after — a request fired on mount
      would otherwise hide inside the post-click total.
    - Quality Contribution: the behavioural half of the audit; the static half is below.
    - Worked Example: click → POST /api/pij/focus?workspace=… body {"seatId":"pij-prime-owl"}.
    */
    const { impl, calls } = fakeFetch({ status: 200, body: { focused: '@220' } });
    renderFleet({ focusFetchImpl: impl });

    expect(calls).toHaveLength(0);

    await userEvent.click(screen.getByTestId(`focus-seat-${UI_PRIME_ID}`));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toContain('/api/pij/focus');
    expect(calls[0].url).toContain(encodeURIComponent(UI_WORKSPACE_PATH));
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ seatId: UI_PRIME_ID });
  });

  it('shows the success as an observation naming the window that was focused', async () => {
    /*
    Test Doc:
    - Why: "focused" alone is unfalsifiable to the reader. Naming the window is the observation.
    - Contract: 200 { focused: '@220' } → the row shows 'focused @220'.
    - Usage Notes: window ids are the ONE identity this feature displays, and only as the result of a
      deliberate action (C-03 permits exactly this).
    - Quality Contribution: keeps the success path as informative as the refusals.
    - Worked Example: '@220' appears in the result element.
    */
    const { impl } = fakeFetch({ status: 200, body: { focused: '@220' } });
    renderFleet({ focusFetchImpl: impl });

    await userEvent.click(screen.getByTestId(`focus-seat-${UI_PRIME_ID}`));

    await waitFor(() =>
      expect(screen.getByTestId(`focus-result-${UI_PRIME_ID}`).textContent).toBe('focused @220')
    );
  });

  it("renders a refusal in the route's own words, with its reason attached", async () => {
    /*
    Test Doc:
    - Why: the route's wordings are the contract (dossier T004) precisely so the human reads what was
      OBSERVED. A client that rewrote them into "could not focus seat" would discard the only
      information in the response.
    - Contract: a 409 body's `observation` is rendered verbatim and its `reason` becomes `data-reason`.
    - Usage Notes: uses the not-live wording, the refusal a human will see most often — 129 of 181
      live seats are dead.
    - Quality Contribution: makes the verbatim-rendering rule a test rather than a convention.
    - Worked Example: "seat … last observed dead at …" shown exactly, data-reason 'not-live'.
    */
    const observation = `seat ${UI_PRIME_ID} last observed dead at 2026-07-25T01:23:05.517Z`;
    const { impl } = fakeFetch({
      status: 409,
      body: { reason: 'not-live', observation },
    });
    renderFleet({ focusFetchImpl: impl });

    await userEvent.click(screen.getByTestId(`focus-seat-${UI_PRIME_ID}`));

    await waitFor(() => {
      const result = screen.getByTestId(`focus-result-${UI_PRIME_ID}`);
      expect(result.textContent).toBe(observation);
      expect(result.getAttribute('data-reason')).toBe('not-live');
    });
  });

  it('renders the DESIGNED store-unreadable state, never the undesigned fallback', async () => {
    /*
    Test Doc:
    - Why: `data-reason` has exactly one value that is not a designed state — `'failed'`, the fallback
      for a response carrying no `reason` at all. Every route refusal is supposed to make that branch
      unreachable. The 503 store-failure path did not: it returned the shared { error, code, verb }
      shape, so `body.reason` was undefined and the most likely real-world failure of the five landed
      in the one state nobody designed. Nothing caught it, because the client's fallback is
      well-behaved — it renders the code and the message, looks entirely reasonable, and is simply the
      wrong state.
    - Contract: a 503 whose body carries reason 'store-unreadable' renders with that `data-reason`,
      not 'failed', and shows the route's observation verbatim.
    - Usage Notes: the body here mirrors what the route now returns, `code` included — the client must
      prefer the `observation` over the error/code fallback when both are present.
    - Quality Contribution: pins the client half of the fix, so a future route regression that drops
      `reason` again fails HERE too and not only in the route suite.
    - Worked Example: pij exits non-zero → data-reason 'store-unreadable', not 'failed'.
    */
    // Driven through the REAL route handler rather than a canned body: a hand-written body would
    // assert only that the client can read a field it is already reading, and would have passed
    // against the broken route. The bug lives in the seam between the two halves, so the test has to
    // span it.
    const impl = routeBackedFetch({ nodeShowFails: execFileFailure({ stderr: 'store on fire' }) });
    renderFleet({ focusFetchImpl: impl });

    await userEvent.click(screen.getByTestId(`focus-seat-${UI_PRIME_ID}`));

    await waitFor(() => {
      const result = screen.getByTestId(`focus-result-${UI_PRIME_ID}`);
      expect(result.getAttribute('data-reason')).toBe('store-unreadable');
      // Named explicitly: 'failed' is the ONE value here that is not a designed state.
      expect(result.getAttribute('data-reason')).not.toBe('failed');
      expect(result.textContent).toContain('E-EXIT');
      expect(result.textContent).toContain('store on fire');
    });
  });

  it('renders the DESIGNED tmux-refused state, distinct from a store failure', async () => {
    /*
    Test Doc:
    - Why: `data-reason` is what a client keys off, and it is the only part of the response a reader
      cannot check against the sentence beside it. When tmux refused, the route said
      'store-unreadable' — the union had no member for a tmux refusal, so the nearest one was reused —
      while the observation honestly named tmux. The two halves of the same response disagreed, and
      the machine-readable half was the one that lied: anything styling or branching on the reason
      would treat a live tmux problem as a broken pij store.
    - Contract: a tmux failure renders `data-reason="tmux-refused"`, never 'store-unreadable' and
      never the 'failed' fallback, with the route's observation verbatim.
    - Usage Notes: route-backed, with the focus executor rejecting — the pij read SUCCEEDS here, which
      is what makes the old wording so obviously wrong: nothing was unreadable.
    - Quality Contribution: pins the client end of the new union member, so a regression that folds it
      back into 'store-unreadable' fails on both sides of the seam.
    - Worked Example: tmux rejects → data-reason 'tmux-refused', text naming '@220'.
    */
    const impl = routeBackedFetch({ focusFails: new Error('no server running on /tmp/tmux-501') });
    renderFleet({ focusFetchImpl: impl });

    await userEvent.click(screen.getByTestId(`focus-seat-${UI_PRIME_ID}`));

    await waitFor(() => {
      const result = screen.getByTestId(`focus-result-${UI_PRIME_ID}`);
      expect(result.getAttribute('data-reason')).toBe('tmux-refused');
      expect(result.getAttribute('data-reason')).not.toBe('store-unreadable');
      expect(result.getAttribute('data-reason')).not.toBe('failed');
      expect(result.textContent).toContain('@220');
      expect(result.textContent).toContain('no server running');
    });
  });

  it('keeps one seat’s result off another seat’s row', async () => {
    /*
    Test Doc:
    - Why: outcomes are held in one provider for the whole list. Keyed wrongly, a refusal for one seat
      would appear against every row — every one of them a false statement about a different seat.
    - Contract: after focusing one seat, only that seat has a result element.
    - Usage Notes: two seats rendered, one clicked.
    - Quality Contribution: pins the keying, which is invisible until it is wrong everywhere at once.
    - Worked Example: click owl → exactly one result element in the document.
    */
    const { impl } = fakeFetch({ status: 200, body: { focused: '@220' } });
    renderFleet({ focusFetchImpl: impl });

    await userEvent.click(screen.getByTestId(`focus-seat-${UI_PRIME_ID}`));

    await waitFor(() => expect(screen.getByTestId(`focus-result-${UI_PRIME_ID}`)).toBeTruthy());
    expect(document.querySelectorAll('[data-testid^="focus-result-"]')).toHaveLength(1);
  });
});

describe('C-06 audit — nothing but a click can reach the focus route', () => {
  const CLIENT_DIRS = [
    'apps/web/src/features/089-first-class-pij/components',
    'apps/web/src/features/089-first-class-pij/hooks',
    'apps/web/src/features/089-first-class-pij/lib',
  ];
  const REPO_ROOT = join(import.meta.dirname, '../../../..');
  /** The one file permitted to name the focus endpoint — the provider that owns the single fetch. */
  const FOCUS_HOOK = 'apps/web/src/features/089-first-class-pij/hooks/use-seat-focus.tsx';

  async function clientSources(): Promise<Array<{ path: string; code: string }>> {
    const files: Array<{ path: string; code: string }> = [];
    for (const dir of CLIENT_DIRS) {
      for (const name of await readdir(join(REPO_ROOT, dir))) {
        if (!['.ts', '.tsx'].includes(extname(name))) continue;
        files.push({
          path: `${dir}/${name}`,
          code: await readFile(join(REPO_ROOT, dir, name), 'utf8'),
        });
      }
    }
    return files;
  }

  it('names the focus endpoint in exactly one client file', async () => {
    /*
    Test Doc:
    - Why: "only the button calls it" is only checkable if there is one place to check. A second fetch
      anywhere in the client surface would make the claim unverifiable by reading.
    - Contract: `/api/pij/focus` appears in exactly one file, the provider hook.
    - Usage Notes: asserts the set of files first, so a rename fails here rather than silently
      reducing the check to zero.
    - Quality Contribution: keeps the audit below meaningful.
    - Worked Example: one match, in use-seat-focus.tsx.
    */
    const files = await clientSources();
    expect(files.length).toBeGreaterThanOrEqual(6);

    const naming = files.filter((file) => file.code.includes('/api/pij/focus'));

    expect(naming.map((file) => file.path)).toEqual([FOCUS_HOOK]);
  });

  it('reaches that fetch from no effect, timer, or self-firing handler', async () => {
    /*
    Test Doc:
    - Why: C-06 forbids an auto-fired focus. The ways it could happen are enumerable: a `useEffect`, a
      timer, or an event subscription in the file that owns the call. All three are checkable.
    - Contract: the provider contains no useEffect / setTimeout / setInterval / addEventListener /
      requestAnimationFrame; its exported entry point is a callback.
    - Usage Notes: the sibling half of the server-side audit in `fence.test.ts`, which proves the same
      property for the route.
    - Quality Contribution: closes the client end of the only mutation in this feature.
    - Worked Example: zero matches; `focus` is exposed through useCallback.
    */
    const code = await readFile(join(REPO_ROOT, FOCUS_HOOK), 'utf8');

    for (const trigger of [
      'useEffect',
      'useLayoutEffect',
      'setTimeout',
      'setInterval',
      'addEventListener',
      'requestAnimationFrame',
    ]) {
      expect(code, `${trigger} would let focus fire without a human`).not.toContain(trigger);
    }
    expect(code).toContain('useCallback');
  });

  it('wires the button to onClick and to nothing else', async () => {
    /*
    Test Doc:
    - Why: the last link in the chain. The provider can only be reached through `focus.focus(...)`,
      and every call site of it must be a click handler.
    - Contract: every `focus.focus(` occurrence in client components sits inside an `onClick`.
    - Usage Notes: matches the surrounding attribute rather than trusting the file's shape.
    - Quality Contribution: makes "the only caller is the row button" literally true and checked.
    - Worked Example: one call site, inside onClick.
    */
    const files = await clientSources();
    const callSites = files.flatMap((file) =>
      [...file.code.matchAll(/(.{0,40})focus\.focus\(/g)].map((match) => ({
        path: file.path,
        before: match[1],
      }))
    );

    expect(callSites.length).toBeGreaterThan(0);
    for (const site of callSites) {
      expect(site.before, `${site.path}: focus must be called from an onClick`).toMatch(/onClick=/);
    }
  });
});
