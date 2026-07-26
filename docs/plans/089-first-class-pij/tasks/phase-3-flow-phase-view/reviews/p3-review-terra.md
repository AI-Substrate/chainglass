# Phase 3 Cross-Model Review — Terra

**Verdict: APPROVE**

| Severity | Location | Claim | Proof |
| --- | --- | --- | --- |
| None | — | No Phase 3 defect found. | The shared hook is additive: `receivedCount` advances in the same updater that trims and survives `clearMessages()`. The pij cursor uses that absolute count with capped retention; the 1,001st and later deltas apply. The flow branch merges by `planDir`, bypasses the fleet-sequence guard, counts foreign plans only in `flowsFilteredOut`, and preserves deletions until a snapshot. The watcher uses injected `IFileWatcherFactory`, add/change debounce per plans root, watch-once bootstrap/lazy registration, C-04 refusal, non-fatal errors, and teardown. |

## Hand verification

- `use-channel-events.ts:71-101` adds only `receivedCount`; the 057-test consumer gate covers the shared hook plus state, 050, 058, and 088 consumers.
- `use-pij-fleet.ts:185-187, 330-344, 363-386, 416-427` uses the absolute stream coordinate, applies repeated-sequence flow deltas, keeps flow containment independent of fleet scope, and waits for refresh to remove a vanished plan.
- `flow-watcher.ts:125-250`, `route.ts:45-52`, and `start-pij-poller.ts:73-141` implement injected watching, bootstrap enumeration, lazy route registration, C-04 protection, and HMR-safe teardown. The recorded no-unlink capability drop is both documented and pinned by test.
- `phase-rail.ts:47-72, 139-180` sorts by phase order and keys reviews only by `branchOf`; the 088 fixture test confirms ph6 is active while rv4/rv4b/rv4c attach to ph4. `flows-tab.tsx` and its card/badge components render five distinct plan reasons plus global-scope, unreadable, and no-plans tab states.

## Dim-0 mutation gates

Temporary backups were held under `/tmp/pij-p3-review-d1106100`; no git restore, checkout, or stash was used.

1. Changed `apps/web/src/lib/sse/use-channel-events.ts:85` from `prev.receivedCount + 1` to `prev.receivedCount`. The post-trim retention regression went RED at the first capped batch (`expected delta-1000`, received `working`). Restored with `apply_patch`; source and backup were byte-identical and shared SHA-256 `95f29e72ab2d120c1d30a2306f6a2b5b30b4d314d7dcde0fa74dcfd04cd847ac`. The targeted regression returned GREEN.
2. Removed `apps/web/src/features/089-first-class-pij/server/flow-watcher.ts:235`'s `clearTimeout(existing)`. The atomic add/change burst went RED with two refreshes instead of one (and the same-root burst companion failed). Restored with `apply_patch`; source and backup were byte-identical and shared SHA-256 `f052be0e2ec5b7e56453b2a0a97dd2a8666d65d6baad6f07d05da84533a79bcb`. The atomic-replace selection returned GREEN.

## Validation

- `pnpm vitest run test/unit/web/pij/`: 18 files, 289 tests passed.
- `pnpm vitest run test/unit/web/sse/ test/unit/web/state/ test/unit/web/features/088-remote-view/ test/unit/web/features/058-workunit-editor/ test/unit/web/features/050-workflow-page/`: 57 files, 517 tests passed.
- `npx tsc -p tsconfig.test.json --noEmit`: passed.
- `pnpm build`: passed, including `/api/pij/flow` and `/workspaces/[slug]/pij`.
- `pnpm vitest run test/integration/web/dashboard-navigation.test.tsx`: exactly the established three failures: two obsolete `Dev` label assertions and one obsolete `w-16` sidebar assertion.

The Vitest gates emitted their established generated-standalone `tsconfck` warnings. The pij bootstrap test logs non-fatal ENOENT watcher errors for stale workspace paths; the watcher remains live and the suite passes. The production build emitted its established NFT tracing and CJS `import.meta` warnings.
