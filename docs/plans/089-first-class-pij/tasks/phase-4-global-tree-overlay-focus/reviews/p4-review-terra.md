# Phase 4 Review — Terra

**Verdict: FIX_REQUIRED**

| Severity | Location | Finding |
|---|---|---|
| High | `apps/web/app/api/pij/focus/route.ts:131-140`; `apps/web/src/features/089-first-class-pij/server/route-deps.ts:102-111` | The fresh `nodeShow()` store-failure branch returns the shared `{ error, code, verb }` 503 from `storeUnreadable(error)` without `reason: "store-unreadable"`. This contradicts T004's closed `FocusReason` contract, which requires a machine `reason` on every focus refusal. Unlike the tmux-executor 503 branch, this common failure path leaves `use-seat-focus.tsx` with `body.reason === undefined`, so it renders the fallback `data-reason="failed"` instead of the designed state. The current test only asserts the `E-EXIT` code, allowing the contract break. Return a focus-specific 503 that preserves the `E-` code and includes `reason: "store-unreadable"` (and its exact observation), then extend the node-show failure and client-render tests. |

## Contract verification

- The containment ladder reads `detail.cwd`, never `folder`; its fixtures mirror the real `node show` key set. The sibling-prefix, `liveness !== 'active'`, absent-liveness wording, no-window, fresh-read-per-click, fixed-argv `execFile`, and strict `E-NOID` stderr-envelope decoder are all implemented and tested.
- Source audit found `select-window` only in the focus route; the client endpoint appears only in `use-seat-focus.tsx`, and the actual invocation is the `SeatRow` button `onClick`.
- The C-02 focus carve-out is narrow: its companion limits the route to `select-window`, forbids other tmux verbs, and client component copy contains no `tmux`.
- Global sections are built from the tree/fleet union; dead-only folders, the 52 + 129 = 181 reconciliation, the dead-band wording, verbatim badges, snapshot-only disclosure, and the >60s stale state are covered. The global route and client have no `useChannelEvents` call.
- The overlay uses the pr-view pattern: provider-owned state, `isOpeningRef`, `overlay:close-all`, `zIndex: 44`, anchor measurement, ErrorBoundary-to-null, all three trigger paths, and remount/navigation survival coverage.
- The sidebar diff contains exactly the two sanctioned additive UI elements: the overlay toggle and the global nav group above Dev.
- The AC map is honest: AC-05's phase chip is marked **absent, not faked**; AC-01 and the watcher probe are **written, pending Jordan**.

## Mutation gates — all restored with `apply_patch` and SHA-256 verified

| Gate | Temporary mutation | RED evidence | Restored SHA-256 |
|---|---|---|---|
| Containment | Flipped `!isFolderInWorkspace(detail.cwd, workspace)` in the focus route. | `focus-route.test.ts`: 7 failures; specifically the sibling-worktree refusal became 200 instead of 409. | `focus-route.ts`: `93b565e055aea4831e565badf81a91f2283ceaf3e9ca3be9054d49e4be3b4e69` |
| Second client caller | Added a second `fetch('/api/pij/focus')` caller to `seat-row.tsx`. | `seat-focus.test.tsx`: the endpoint audit found `seat-row.tsx` and `use-seat-focus.tsx`, rather than its sole allowed provider hook. | `seat-row.tsx`: `331b01b958bbf44a3f1c5919d794647a1e049cfd82e076257266eec3b47959b7` |
| Union sections | Replaced the fleet-row loop with `rows.filter(() => false)`. | `global-tree.test.tsx`: 4 failures, including the dead-only folder and dead-band regressions. | `global-tree.tsx`: `8de90f59b7918e6eb9779c3de235b3b31c3d0ccdf3d16ebb666554281e31a1bf` |
| Fence re-plant | Added `send-keys` to the focus route's executable code. | `fence.test.ts`: the focus-route companion assertion failed on the forbidden tmux verb. | `focus-route.ts`: `93b565e055aea4831e565badf81a91f2283ceaf3e9ca3be9054d49e4be3b4e69` |

## Validation

- `pnpm vitest run test/unit/web/pij/`: 23 files, 354 tests passed.
- Consumer suites (`sse`, `state`, `088`, `058`, `050`, `components`): 66 files, 629 tests passed.
- `npx tsc -p tsconfig.test.json --noEmit`: passed.
- `pnpm build`: passed, including `/api/pij/focus` and `/pij`.
- `dashboard-navigation.test.tsx`: exactly the established three failures: two obsolete `Dev` label assertions and one obsolete `w-16` sidebar-width assertion.
- `git diff --check`: passed.

## Re-review — Fix 1

**Verdict: APPROVE**

The `nodeShow()` unreadable-store branch now returns the focus-specific 503 with
`reason: "store-unreadable"`, preserves its `E-` code in both `code` and the verbatim
observation, and does not invoke tmux. The client test exercises this failure through the real
route handler (rather than a hand-written response) and confirms the rendered state is
`data-reason="store-unreadable"`, never the fallback `failed`.

`focus-route.test.ts` additionally drives all five refusal conditions through the handler and
sort-compares the emitted reason set with the declared `FocusReason` union. Removing the fixed
branch's `reason` field made that test fail alone, replacing `store-unreadable` with `undefined`;
after restoration, the route hash was byte-identical:

`395bc45dcd15271c1b8a67900128d3f02942e5f91a9ac184a20856af784101a8`.

- `pnpm vitest run test/unit/web/pij/`: 23 files, 356 tests passed.
- `npx tsc -p tsconfig.test.json --noEmit`: passed.
- `pnpm vitest run test/unit/web/pij/focus-route.test.ts test/unit/web/pij/seat-focus.test.tsx`:
  2 files, 24 tests passed.
