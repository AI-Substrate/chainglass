# Fix FX002: FlowSpace MCP — Polish & Minih Review Follow-ups

**Created**: 2026-04-26
**Status**: Complete
**Plan**: [flowspace-mcp-search-plan.md](../flowspace-mcp-search-plan.md)
**Source**: Minih `code-review` agent verdict on FX001 (`harness/agents/code-review/runs/2026-04-26T13-42-26-977Z-696f/output/report.json` — APPROVE with 2 MED + 1 LOW), plus the four "Out of Scope" Medium/Low items deliberately deferred from FX001.
**Domain(s)**: `_platform/panel-layout`-adjacent (modify) + `file-browser` (modify)

---

## Problem

FX001 fixed the seven Critical/High items from the original mini-review. The minih agent then re-reviewed FX001 and APPROVED it with three smaller findings — two Medium (a residual hook query-drop edge case, a sequential-I/O perf nit) and one Low (a domain-doc Source Location gap). At the same time, FX001's "Out of Scope" section listed a separate Medium item (`mapMcpError` mis-scoped cache invalidation) and a few Nits that are quick wins. None of these block usability, but bundling them now closes the open feedback loop and avoids letting them rot into the rear-view mirror.

## Proposed Fix

Four tasks, no contract changes, no new domains:

1. **F001 — Hook query-drop**: move epoch invalidation ahead of the in-progress guard (or remove the guard entirely and let the existing epoch/cancellation logic handle supersedence). A new query while a prior poll/search is in flight should always supersede the older run.
2. **F002 — Parallel stale-file filter**: replace the per-result sequential `await access(...)` with `Promise.allSettled` so search latency scales with the slowest stat, not the sum.
3. **F003 — Domain doc Source Location**: add the four new FlowSpace files (one hook + three server modules) to the file-browser domain's Source Location table. Also add the `flowspace-mcp-client.ts` exports to `_platform/panel-layout`-adjacent if applicable.
4. **Bundled polish (deferred from FX001)**: scope the `mapMcpError` ENOENT branch so it no longer invalidates the global `fs2AvailableCache` on search-time errors; pin `checkFlowspaceAvailability`'s availability cache to `globalThis` (mirrors the `__FLOWSPACE_MCP_POOL__` HMR pattern); centralise the duplicate `[flowspace-mcp] log()` helpers into one shared logger; add elapsed-ms to the `spawn error` log line for grep-consistency with `spawn ready`.

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|--------------|
| `file-browser` | modify | `use-flowspace-search.ts` — drop `fetchInProgressRef` guard; rely on epoch/cancellation only. `docs/domains/file-browser/domain.md` — Source Location table updated. |
| `_platform/panel-layout`-adjacent (`apps/web/src/lib/server/`) | modify | `flowspace-search-action.ts` — parallel stale-file filter; `mapMcpError` ENOENT scope fix; availability cache pinned to `globalThis`. `flowspace-mcp-client.ts` — share the log helper (or import it from the shared module); spawn-error log includes elapsed ms. |
| **tests** | extend | One new hook test for rapid query changes (regression guard for F001). |

No domain contracts change. No effect on the discriminated union return type, the `> Restart FlowSpace` SDK command, the `globalThis.__FLOWSPACE_MCP_POOL__` shape, or any test seam exports.

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | FX002-1 | **F001 — Hook query-drop**: in `useFlowspaceSearch`, simplify the search-effect by removing the `fetchInProgressRef` early-out at the effect's entry. The existing epoch counter (`queryEpochRef`) cancels stale results inside the polling-loop body and post-run setters via the `cancelled` flag and epoch-equality check — that is the hook-side cancellation. The cross-call dedup of overlapping `flowspaceSearch` calls is handled **server-side** by `getOrSpawn`'s synchronous `pool.get → pool.set` prefix in `flowspace-mcp-client.ts` (see Discoveries #2 in FX001). Combined, that's enough — the early-out becomes redundant. | `file-browser` | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/041-file-browser/hooks/use-flowspace-search.ts` | New file `test/unit/web/features/041-file-browser/use-flowspace-search.test.tsx` exercises rapid query changes during a long-running poll: mount the hook, trigger query "foo" (debounce 300 ms), trigger "bar" before debounce resolves, await results, assert results === bar's results (no stale "foo" bleed-through). The existing 3-spawning-poll-then-result flow still works (no regression). | Minih F001. Per validation Agent 2: the rationale is that hook-side epoch + server-side `getOrSpawn` sync prefix together cover the surface — NOT epoch alone. Action calls during overlap may both observe `idle` and both call `void prewarmFlowspace(cwd)`; both invocations dedupe inside `getOrSpawn` (sync `pool.set` happens before any await). |
| [x] | FX002-2 | **F002 — Parallel stale-file filter**: replace the existing `for (const r of env.results) { await access(...); ... }` block with `(await Promise.allSettled(env.results.map((r) => access(join(cwd, r.filePath)).then(() => r))))` then `.filter((s) => s.status === 'fulfilled').map((s) => s.value)`. Same correctness — graph references to deleted files still get pruned — but the I/O fans out. | `_platform/panel-layout`-adjacent | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/lib/server/flowspace-search-action.ts` | A search returning 20 results no longer has its response time dominated by 20 sequential `stat` calls. **Order is preserved** (`Promise.allSettled` returns settled values in input order). Existing integration test still passes (warm <5 s). | Minih F002. Lift the existing filter loop into a single `Promise.allSettled` pass; preserve the score-sorted ordering. |
| [x] | FX002-3 | **F003 — Domain doc Source Location**: update `docs/domains/file-browser/domain.md` Source Location section to list `apps/web/src/features/041-file-browser/hooks/use-flowspace-search.ts`. Add a "Server-adjacent infrastructure" sub-listing (or extend the existing Source Location table) to catalog `apps/web/src/lib/server/flowspace-mcp-client.ts`, `flowspace-result-mapper.ts`, `flowspace-search-action.ts`, and the new `flowspace-log.ts` (created in FX002-5) — server-only utility modules consumed by file-browser hooks but living under `lib/server/` per repo convention. Each entry includes a one-line role description. **Out of scope for FX002**: `_platform/panel-layout/domain.md` updates — punt to a future fix or to whoever next touches that domain (validation Agent 1 + 3). | `file-browser` | `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/file-browser/domain.md` | The Source Location section explicitly names all five FlowSpace files (one hook + four server modules including `flowspace-log.ts`). A code reviewer can find every FlowSpace implementation by reading the domain doc alone. | Minih F003. Verified by code review (grep is too weak — Agent 2/3). |
| [x] | FX002-4 | **Bundled polish (correctness)**: (a) `mapMcpError` no longer matches `/ENOENT/i` against generic search-error messages and side-effects `fs2AvailableCache = null`. Move the cache invalidation into the spawn error path inside `flowspace-mcp-client.ts` (verified by injecting an ENOENT-like spawn failure via a transport-factory stub and asserting the cache flips to null). (b) Pin `fs2AvailableCache` and `fs2ResolvedPath` in `flowspace-search-action.ts` to `globalThis.__FLOWSPACE_AVAIL_CACHE__` so HMR doesn't re-run `command -v fs2` on every save (mirrors `__FLOWSPACE_MCP_POOL__`). | `_platform/panel-layout`-adjacent | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/lib/server/flowspace-search-action.ts` + `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/lib/server/flowspace-mcp-client.ts` | (a) An action-level test injects a callTool error response containing "ENOENT" (using an extended `FakeServerHandle` that takes an optional `errorMessage` override on the search tool); the test asserts `checkFlowspaceAvailability` still returns the cached `available` result afterward. A separate test stubs the transport factory to throw a synchronous ENOENT and asserts the pool entry is in error state and the availability cache is invalidated. (b) `fs2AvailableCache` survives Next.js HMR — log line `[flowspace-mcp] fs2 found at:` does NOT appear on every save. | Split out from the original FX002-4 bundle (validation Agent 2/3) so plan-6 can mark progress on correctness fixes independently of the developer-instrumentation bundle. Test infrastructure update is part of this task (extend `makeFakeFlowspaceServer()`). |
| [x] | FX002-5 | **Bundled polish (instrumentation)**: (a) Extract the duplicate `LOG_PREFIX`/`log()` helper into a new shared module `apps/web/src/lib/server/flowspace-log.ts` exporting `export const LOG_PREFIX: string = '[flowspace-mcp]'` and `export function log(...args: unknown[]): void`. Both `flowspace-search-action.ts` and `flowspace-mcp-client.ts` import from it and remove their local definitions. (b) Add elapsed-ms to the `[flowspace-mcp] spawn error` log line in `flowspace-mcp-client.ts`, matching the format of `spawn ready { cwd, ms }` (the IIFE's `started` timestamp is already in scope; just add `ms: Date.now() - started` to the log object). | `_platform/panel-layout`-adjacent | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/lib/server/flowspace-log.ts` (NEW) + `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/lib/server/flowspace-mcp-client.ts` + `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/lib/server/flowspace-search-action.ts` | (a) Both modules import `log` and `LOG_PREFIX` from `flowspace-log.ts` — no duplicate definitions; typecheck passes. (b) `[flowspace-mcp] spawn error` log lines include `ms: <elapsed>` field, formatted identically to `spawn ready`. | Split out from the original FX002-4 bundle. Pure developer-instrumentation; no user-facing impact. Can ship independently of FX002-4. |

## Workshops Consumed

- [`workshops/002-flowspace-mcp-search.md`](../workshops/002-flowspace-mcp-search.md) — design reference, no contradiction. None of the FX002 changes touch the workshop's design decisions (process-pool, HMR pattern, mtime recycle, idle reaper, Restart command). They polish the surrounding implementation.

## Acceptance

- [ ] **AC-FX02-1**: Typing a fresh query during a spawning poll or in-flight search supersedes the prior run. The prior run's results never overwrite the new query's spawning/loading state. Verified by a NEW unit test at `test/unit/web/features/041-file-browser/use-flowspace-search.test.tsx` (file does not exist today): mount the hook with `worktreePath`, trigger query "foo" (debounce 300 ms), trigger "bar" before debounce resolves, await results, assert results match `bar`'s response and no stale `foo` results bleed through.
- [ ] **AC-FX02-2**: Stale-file filter latency scales with the slowest single `stat`, not the sum across N results. **Order of results is preserved** — `Promise.allSettled` returns settled values in input order, and `.filter((s) => s.status === 'fulfilled').map((s) => s.value)` keeps the score-sorted ordering of the envelope. Verified by code review (the filter implementation visibly uses `Promise.allSettled` exactly once and preserves indices) plus a small unit test that runs the action with 5 results where indices 1 and 3 reference deleted files and asserts the returned results are `[r0, r2, r4]` in that order.
- [ ] **AC-FX02-3**: `docs/domains/file-browser/domain.md` Source Location explicitly lists all five FlowSpace files by path: `use-flowspace-search.ts`, `flowspace-mcp-client.ts`, `flowspace-result-mapper.ts`, `flowspace-search-action.ts`, and `flowspace-log.ts`. Each entry includes a one-line role description (hook / MCP client / pure mapper / server action / shared logger). Verified by reading the section and ticking off the five filenames — not by grep count.
- [ ] **AC-FX02-4a**: A search-time error message containing "ENOENT" does NOT invalidate `fs2AvailableCache` and does NOT surface "FlowSpace (fs2) is not installed". Verified by an action-level test that uses an extended `FakeServerHandle` (with optional `errorMessage` override on the search tool) to return `{ isError: true, content: [{ type: 'text', text: 'MCP error: ENOENT ...' }] }` from `tools/call`, then asserts subsequent `checkFlowspaceAvailability` still returns the cached `available` result.
- [ ] **AC-FX02-4b**: A separate test stubs the transport factory to throw a synchronous error matching `ENOENT` and verifies the pool entry is marked `error` AND the availability cache is invalidated — proving spawn-time ENOENT detection still works after the regex move. (Closes the gap validation Agent 2 flagged: SDK error wrapping may transform the error message; the test pins the contract.)
- [ ] **AC-FX02-4c**: Repeated edits to a server file in dev mode do NOT cause `[flowspace-mcp] fs2 found at:` to log on every save. The availability cache survives HMR via `globalThis.__FLOWSPACE_AVAIL_CACHE__`.
- [ ] **AC-FX02-5a**: Both `flowspace-search-action.ts` and `flowspace-mcp-client.ts` import `log` and `LOG_PREFIX` from `flowspace-log.ts` (named exports). No duplicate definitions remain. Typecheck passes.
- [ ] **AC-FX02-5b**: `[flowspace-mcp] spawn error` log lines include `ms: <elapsed>` field, formatted identically to `spawn ready`.
- [ ] **AC-FX02-6**: Repo-wide tests pass (432+ existing + ≥3 new tests added by this fix: 1 hook regression test for AC-FX02-1, 1 order-preservation test for AC-FX02-2, 1+ ENOENT-injection tests for AC-FX02-4a/b). Lint clean. No typecheck regressions.

## Discoveries & Learnings

_Populated during implementation by plan-6._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|

---

## Out of Scope

- **AC-FX-7 from FX001** (mid-search crash → mappable user-friendly error). Still deferred — promote to a future fix only if real-world telemetry shows raw `MCP error -32000` fragments leaking to the dropdown. The structural fixes in FX001 (retry loop + explicit `pool.delete` + `transport.onerror` wiring) handle the mechanics; only the user-facing error wording would benefit from further mapping.
- **`mode === 'semantic' ? 'semantic' : 'auto'` type narrowing** at the MCP-client boundary. Pure cosmetic; no behaviour impact. Skip until someone touches that signature.
- **`__clearFlowspacePool` should call `shutdownAllFlowspace` first**. Already discussed in the original review — currently OK because every test calls them in the right order in `afterEach`. If a future test forgets, the failure is noisy but bounded. Skip for now.

If/when these become real, file FX003.

---

## Validation Record (2026-04-26)

3 parallel Explore agents (broad scope, lens coverage 10/12).

| Agent | Lenses Covered | Issues | Verdict |
|-------|---------------|--------|---------|
| Source Truth & Cross-Reference | Hidden Assumptions, Concept Documentation, Integration & Ripple, Domain Boundaries, Technical Constraints | 4 raised → 1 LOW fixed; 3 false positives discounted (off-by-one, accurate to-do description, AC-as-future-state framing) | ⚠️ → ✅ |
| Risk & Completeness | Edge Cases & Failures, Performance & Scale, Deployment & Ops, User Experience | 8 raised → 2 HIGH + 4 MEDIUM + 1 LOW fixed; 1 CRITICAL surfaced for user decision (AC-FX-7) | ⚠️ → mostly ✅ |
| Forward-Compatibility | Forward-Compatibility, Test Boundary | 5 raised → 1 CRITICAL + 1 HIGH + 2 MEDIUM fixed; 1 false positive discounted (FX001 OOS items ARE listed in FX002 OOS) | ⚠️ → ✅ |

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| A: plan-6 v2 | Unambiguous tasks w/ specific files & done-when criteria | shape mismatch | ✅ (after fix) | FX002-4 split into FX002-4 (correctness: cache scope + HMR) and FX002-5 (instrumentation: logger + elapsed-ms) so plan-6 can mark progress on each independently |
| B: minih re-review | Testable ACs that map to assertable observations | test boundary | ✅ (after fix) | AC-FX02-4a now specifies extending `FakeServerHandle` with an optional `errorMessage` override; AC-FX02-1 names the new hook test file path; AC-FX02-2 specifies the order-preservation test; AC-FX02-3 verified by reading (not grep) |
| C: FX003 candidate | Honest Out-of-Scope carry-forward | contract drift | ✅ | FX002 OOS lists AC-FX-7 (deferred), mode-mapping type narrowing (FX001 Nit), `__clearFlowspacePool` close-ordering (FX001 Low). All 8 FX001 OOS items either addressed or re-listed |
| D: domain readers | Accurate Source Location after FX002 lands | lifecycle ownership | ✅ (after fix) | AC-FX02-3 now names all 5 FlowSpace files including the NEW `flowspace-log.ts`, with role descriptions per entry |

### Fixes Applied

- **HIGH** — FX002-1 risk justification corrected: hook-side epoch + server-side `getOrSpawn` sync prefix together (not epoch alone) ensure supersedence.
- **HIGH** — FX002-4 split into FX002-4 (correctness: ENOENT scope + HMR pin + test infra extension) and FX002-5 (instrumentation: shared logger + elapsed-ms log).
- **HIGH** — AC-FX02-1 names the new hook test file at `test/unit/web/features/041-file-browser/use-flowspace-search.test.tsx`.
- **CRITICAL** — AC-FX02-4a now specifies the test infrastructure extension required (extend `FakeServerHandle` with optional `errorMessage` override).
- **MEDIUM** — AC-FX02-2 explicitly asserts order preservation + adds a unit test for the deleted-files-in-middle case.
- **MEDIUM** — AC-FX02-3 lists all 5 FlowSpace files by name (replaces the grep-count assertion).
- **MEDIUM** — `flowspace-log.ts` is added to FX002-3's domain doc list and FX002-5's task spec includes the export shape (`named exports: LOG_PREFIX, log`).
- **MEDIUM** — Added new AC-FX02-4b for spawn-time ENOENT detection test (validation Agent 2 found this gap — SDK error wrapping may transform ENOENT messages).
- **LOW** — FX002-3 explicitly defers `_platform/panel-layout/domain.md` to a future fix.

### Open (USER DECISION REQUIRED)

- **AC-FX-7** (mid-search crash → mappable user-friendly error message). Validation Agent 2 raised this as CRITICAL: shipping FX001 deferred this with no telemetry to confirm crashes don't surface raw `MCP error -32000` fragments to users. The structural retry-loop + `transport.onerror` work in FX001 handles the *mechanic*; the user-facing error wording is what's deferred. **Decision needed**: include in FX002 (add as FX002-6) or keep deferred to FX003-if-telemetry-shows-it?

**Outcome alignment**: FX002 advances the OUTCOME ("a working fourth pillar (path / command / name / concept) … unblocks a feature that was already shipped but unusable") by making the fourth pillar responsive (FX002-1 query-drop), performant (FX002-2 parallel filter), and resilient against dev-mode friction (FX002-4 cache scope + HMR pin); FX002-5 (instrumentation) is tangential to the user-facing outcome but cheap and bundled with pure devex polish.

**Standalone?**: No — four downstream consumers named (plan-6, minih re-review, FX003 candidate, domain readers).

**Overall**: ⚠️ VALIDATED WITH FIXES — 8 issues fixed in-dossier; 1 CRITICAL surfaced for your call (AC-FX-7).

---

## Directory Layout

```
docs/plans/084-random-enhancements-3/
  └── fixes/
      ├── FX001-flowspace-mcp-review-fixes.md (Complete)
      ├── FX001-flowspace-mcp-review-fixes.fltplan.md (Landed)
      ├── FX001-flowspace-mcp-review-fixes.log.md
      ├── FX002-flowspace-mcp-polish.md          # this file
      ├── FX002-flowspace-mcp-polish.fltplan.md  # mini flight plan
      └── FX002-flowspace-mcp-polish.log.md      # execution log (empty until plan-6 runs)
```
