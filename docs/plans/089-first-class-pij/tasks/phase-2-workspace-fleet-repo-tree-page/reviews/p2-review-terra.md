# Phase 2 Cross-Model Review — Terra

**Verdict: FIX_REQUIRED**

| Severity | Location | Claim | Proof and smallest fix |
| --- | --- | --- | --- |
| High | `apps/web/src/features/089-first-class-pij/hooks/use-pij-fleet.ts:155,298` | Live fleet updates freeze permanently after the channel has retained 1,000 messages. | `useChannelEvents` defaults to a sliding `maxMessages` cap of 1,000. After the first 1,000 messages, `appliedIndexRef` is 1,000 and each subsequent retained array is still length 1,000, so line 298 returns without applying any newer `fleet-delta` or `poller-status`. This silently violates the live-page contract. Use an unbounded history for this index-cursor consumer (`{ maxMessages: 0 }`), or replace it with a monotonic callback-owned queue, and add a regression test that applies message 1,001. |
| Medium | `apps/web/src/features/089-first-class-pij/components/fleet-view.tsx:70,120` | The empty-state discriminator is given the post-idle-filter count, not the scoped row count. | When all seats in this workspace are older than 48 hours, `visibleCount` is zero but `rows` is nonempty. The UI renders the false claim “No seats matched this workspace” while separately admitting that seats were hidden. In global scope it can make the same workspace-scoped claim. Pass the scoped snapshot row count to `FleetEmptyState` (or introduce an explicit all-idle state) and cover the all-idle case. |
| Medium | `apps/web/src/features/089-first-class-pij/lib/fleet-grouping.ts:155`; `apps/web/src/features/089-first-class-pij/components/role-chip.tsx:27` | Fleet rows can override the repo tree as the source of structure and Prime role. | Both expressions OR `row.prime` with the tree record, contrary to T003’s tree-only grouping/role rule. A stale or conflicting list snapshot can create a prime shell and Prime chip where the tree says the in-scope node is not a prime. The existing test only uses an unplaced impostor, so it cannot exercise this branch. Derive Prime solely from `node.prime` and add a conflicting in-tree row/node regression test. |

## Required evidence completed

- `pnpm vitest run test/unit/web/pij/`: 15 files, 225 tests passed.
- `npx tsc -p tsconfig.test.json --noEmit`: passed.
- `pnpm build`: passed; `/workspaces/[slug]/pij` is present.
- `test/integration/web/dashboard-navigation.test.tsx`: exactly the three known failures (two missing `Dev` label assertions, one obsolete `w-16` assertion).
- No `flow-delta` listener exists in the Phase 2 client; flow remains snapshot-only. The page passes the workspace record path (or resolved worktree path), never rebuilds one from the slug. No Phase 2 write/CLI path or forbidden DOM identity field was found.

## Dim-0 mutation gates

Temporary source backups were held under `/tmp/pij-p2-review-d1106100/`; no `git restore`, checkout, stash, or permanent source/test edit was used.

1. Changed `use-pij-fleet.ts:304-306` so `belongsHere` always returned `true`. `pnpm vitest run test/unit/web/pij/use-pij-fleet.test.tsx` went RED with exactly the two foreign/sibling containment cases failing; restoring the predicate returned 17/17 GREEN. The final source and backup SHA-256 are both `c78ee93c62f5e3c42bdab0c05dc8706d6a3c6f554a621c24c938ae914f1a42a1`.
2. Changed `fleet-empty-state.tsx:50` to prevent the `fleetSize > 0` filtered branch. `pnpm vitest run test/unit/web/pij/fleet-empty-state.test.tsx` went RED with the state-2 and discriminator assertions failing; restoring it returned 10/10 GREEN. The final source and backup SHA-256 are both `fbf92c081f9cc2fbf5cc553295beec90b53f2d28966a883f99164bfc5781b668`.

## Re-review — Fix round 1

**Verdict: APPROVE**

All three reported findings are closed:

| Prior finding | Verified repair |
| --- | --- |
| Live updates freeze after 1,000 messages | `usePijFleet` explicitly requests unbounded channel retention (`maxMessages: 0`), preserving the accumulating-array cursor contract. The new 1,001st and 1,002nd delta regression applies both updates. |
| All-idle workspace falsely reports a workspace mismatch | `FleetView` passes both the pre-filter scoped `rowCount` and drawn `visibleCount`; `fleetEmptyReason` selects `all-idle` when rows exist but every row is hidden. |
| Fleet `row.prime` overrides tree authority | `groupFleet` and `seatRole` now derive Prime exclusively from `node.prime`; the in-tree disagreement regression proves the row cannot create a shell or Prime chip. |

### Re-review mutation gate

Temporarily changed `apps/web/src/features/089-first-class-pij/hooks/use-pij-fleet.ts:167` from `maxMessages: 0` to `maxMessages: 1000`. `pnpm vitest run test/unit/web/pij/use-pij-fleet.test.tsx` went RED with exactly the retention regression failing at delta 1,001 (`expected delta-1001`, received `delta-1000`; 17 passed). Restored the one line with `apply_patch`; the source and temporary backup matched byte-for-byte and shared SHA-256 `4b9de94fdc6720e2a154c54fd76574303b8589664b55434fb4a14ce6af550f4c`. The same suite returned 18/18 GREEN.

### Re-review gates

- `pnpm vitest run test/unit/web/pij/`: 15 files, 233 tests passed.
- `npx tsc -p tsconfig.test.json --noEmit`: passed.
- `pnpm build`: passed; `/workspaces/[slug]/pij` is present.
- `pnpm vitest run test/integration/web/dashboard-navigation.test.tsx`: exactly the three established baseline failures (two obsolete `Dev` label assertions and one obsolete `w-16` sidebar assertion).

The Vitest runs continued to emit the non-fatal generated-standalone `tsconfck` configuration warnings. The production build continued to emit its established NFT tracing and CJS `import.meta` warnings.
