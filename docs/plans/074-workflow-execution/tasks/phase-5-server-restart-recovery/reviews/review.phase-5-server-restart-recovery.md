# Code Review: Phase 5: Server Restart Recovery

**Plan**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md
**Spec**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-spec.md
**Phase**: Phase 5: Server Restart Recovery
**Date**: 2026-03-16
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Phase 5 introduces the right recovery primitives, but the current implementation and evidence do not yet prove restart recovery is correct end-to-end. The review found a real registry-state bug, a failed-start state inconsistency, a live AC1 failure plus two more blocking acceptance-criteria evidence gaps, and unresolved domain ownership/documentation drift.

**Key failure areas**:
- **Implementation**: `resumeAll()` computes filtered registry sets but persists only the in-memory execution map, so stale-entry cleanup and non-running entry retention are inconsistent.
- **Domain compliance**: The Phase 5 execution-support slice still has no single registered domain owner across the plan, dossier, registry, and domain docs.
- **Reinvention**: Low-risk only — the registry follows existing atomic-registry patterns, but could reuse prior art more explicitly.
- **Testing**: AC1 failed in live harness validation; AC2 and AC3 are not convincingly verified; AC4 passed live but remains only partially covered by unit tests.
- **Doctrine**: The manager now reaches directly to `node:fs` for worktree existence checks instead of an injected contract boundary.

## B) Summary

Phase 5 is close, but not yet review-clean. The core idea — file-backed registry plus `resumeAll()` boot recovery — is sound, and a targeted local test run passed `41/41` tests for the touched Phase 5 files.

However, the main recovery path still has a registry consistency bug, and the happy-path resume test passes even when resume actually fails. Domain ownership is also unresolved: the same feature slice is described as `web-integration`, `074-workflow-execution`, and `workflow-ui` support code, with no single registered owner.

Anti-reinvention risk is low. The new registry code overlaps existing atomic registry/persistence helpers in `_platform/external-events` and `workspace`, but not enough to block the phase by itself.

## C) Checklist

**Testing Approach: Hybrid**

- [x] Registry/read-write behavior has dedicated unit coverage
- [ ] Critical restart-recovery paths are convincingly covered
- [ ] Acceptance criteria are mapped to concrete, reproducible evidence
- [ ] Live validation succeeded through the harness
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.ts:382-417 | correctness | `resumeAll()` computes `toKeep`, but persists only the current in-memory execution map | Write the post-resume registry explicitly from `toKeep` plus resumed/current entries, or remove `toKeep` semantics entirely |
| F002 | HIGH | /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/074-workflow-execution/workflow-execution-manager.test.ts:650-688 | testing | The happy-path resume test accepts `failed`, so AC2 can pass while resume is broken | Configure the resumed manager's orchestration fake and assert a successful resume result |
| F003 | HIGH | /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/074-workflow-execution/workflow-execution-manager.test.ts:637-794; /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md:262-266 | testing | No test proves completed nodes are skipped on resume (AC3) | Add a partially-completed graph-state resume test and assert completed nodes are not re-dispatched |
| F004 | HIGH | /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md:41-46; /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-5-server-restart-recovery/tasks.md:63-70,136-144; /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/registry.md:3-30 | domain | The `074-workflow-execution` slice still has no single registered domain owner | Choose a registered owner or formally create/register a new one, then align all plan and domain artifacts |
| F005 | HIGH | /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.ts:117-137 | error-handling | Pre-drive startup failures persist `starting` but never persist `failed` or clear the handle | Wrap pre-drive setup in deterministic failure handling that persists or removes the handle state |
| F006 | MEDIUM | /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/execution-registry.ts:38-58; /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.ts:371-377 | error-handling | The file-backed adapter returns empty on corrupt/invalid data but does not actually self-heal by deleting the bad file | Delete corrupt files on parse/validation failure or let the adapter surface a read failure that triggers removal |
| F007 | MEDIUM | /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/workflow-ui/domain.md:90-106 | domain | `workflow-ui` history mentions Phase 5, but Source Location / Composition / Concepts remain stale for restart recovery | Update the owning domain doc or move the Phase 5 history row to the actual owner |
| F008 | MEDIUM | /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.ts:14,392-393 | doctrine | `WorkflowExecutionManager` reaches directly to `node:fs` for worktree existence checks | Move the check behind an injected dependency or shift stale-entry filtering into the registry/workspace layer |

## E) Detailed Findings

### E.1) Implementation Quality

**Material issues found**:

- **F001 — Registry cleanup semantics are wrong**: `resumeAll()` splits the registry into `toResume` and `toKeep`, but the final write path uses `persistRegistry()`, which serializes only `this.executions`. That means the code never actually writes the filtered `toKeep` set it computed.
- **F005 — Failed starts leave stale state**: `start()` persists the new handle as `starting` before workspace resolution and orchestration handle acquisition. If setup fails before `drive()` begins, the code broadcasts `failed` but never persists that terminal state or removes the handle.
- **F006 — Production self-healing is incomplete**: The manager only deletes corrupt registries when `registry.read()` throws. The file-backed adapter does not throw on corrupt JSON or schema failure — it logs and returns an empty registry instead — so the corrupt file remains on disk.

**What looked good**:

- No material security issues were identified in the Phase 5 diff.
- The registry adapter uses sync temp-file + rename writes, which is a sensible choice for a small local config file.
- The Phase 5 code stayed within the intended feature surface; there was no meaningful scope creep.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ❌ | Files live under `apps/web/src/features/074-workflow-execution/`, but the owner is unresolved across plan artifacts and registered domains |
| Contract-only imports | ✅ | No cross-domain internal imports were found in the changed Phase 5 code |
| Dependency direction | ✅ | No new business-to-business or infrastructure-to-business import violation was introduced in the commit range |
| Domain.md updated | ❌ | `workflow-ui/domain.md` got only a History row; Source Location / Composition stayed stale, and `_platform/positional-graph/domain.md` stops at `074-P3` |
| Registry current | ✅ | No new domain row was required if the slice remains under an existing registered owner |
| No orphan files | ❌ | `web-integration` and `074-workflow-execution` are used as owners in plan artifacts but neither is a registered domain |
| Map nodes current | ❌ | The domain map cannot represent the actual owner of the Phase 5 execution-support slice while ownership remains ambiguous |
| Map edges current | ✅ | No new public cross-domain contract edge was introduced in this commit range |
| No circular business deps | ✅ | No new business-domain cycle was introduced |
| Concepts documented | ⚠️ | The apparent owner doc still has no Concepts coverage for the execution registry / debounced persistence / resume-on-bootstrap flow |

**Primary domain findings**:

- **F004 — Canonical owner is unresolved**: The plan manifest assigns this slice to `web-integration`, the Phase 5 dossier assigns it to `074-workflow-execution`, and the registered domain set contains neither. `workflow-ui/domain.md` informally references the path as support code, but does not fully own/document it.
- **F007 — Owner docs are stale**: If `workflow-ui` owns the slice, its Source Location and Composition sections are missing the new registry layer. If it does not own the slice, the Phase 5 history row is misplaced.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| File-backed execution registry persistence | `packages/shared/src/event-popper/port-discovery.ts` (sync temp+rename registry I/O); `packages/workflow/src/adapters/workspace-registry.adapter.ts` (global config registry pattern) | `_platform/external-events`; `workspace` | Low overlap — extend/reuse patterns where possible; no blocking duplication |
| Resume-on-bootstrap execution recovery | None found | — | Proceed |

The reinvention check did not find a blocking duplicate. The main note is that the phase could have reused prior atomic-registry patterns more explicitly.

### E.4) Testing & Evidence

**Coverage confidence**: 31%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC1 | 25 | `/Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/074-workflow-execution/workflow-execution-manager.test.ts:578-593` verifies that `start()` writes a running registry entry, and a targeted local run of `pnpm exec vitest run ...execution-registry.test.ts ...workflow-execution-manager.test.ts` passed `41/41`. But late harness validation contradicted that unit evidence: a browser-triggered run started work (wrote `phase5-fast.log`, updated `pod-sessions.json`) yet no `execution-registry.json` was created anywhere in the container. |
| AC2 | 15 | `/Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/074-workflow-execution/workflow-execution-manager.test.ts:650-688` is intended to cover resume, but it never configures the resumed manager's fake orchestration service and still accepts `failed`. The local test run emitted `Failed to resume my-pipeline...` on stderr while the test still passed. |
| AC3 | 5 | No changed test or execution-log artifact proves that completed nodes are skipped after resume. The phase dossier explains why that should happen, but the phase evidence does not verify it. |
| AC4 | 80 | `/Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/074-workflow-execution/workflow-execution-manager.test.ts:694-724` proves missing worktrees are skipped without throwing. Live harness validation then seeded `/root/.config/chainglass/execution-registry.json` with a deleted-worktree entry, restarted the container, and confirmed the registry was rewritten empty and logs emitted `Skipping resume ... worktree ... no longer exists`. |

**Evidence quality notes**:

- The execution log is summary-only evidence: it reports totals like `53/53` and `5567 passing`, but does not preserve the exact commands or output snippets needed to reproduce those claims.
- The production file-backed registry module is not exercised directly in a way that proves the real self-healing behavior claimed in the dossier/history.
- The late harness run materially changed confidence: AC1 now has contradictory unit vs live evidence, while AC4 gained strong live confirmation.

### E.5) Doctrine Compliance

**Primary doctrine finding**:

- **F008 — Direct Node FS dependency in manager**: `WorkflowExecutionManager` now imports `node:fs` and calls `fs.existsSync()` inside `resumeAll()`. That bypasses the interface-first/service-boundary model documented in `rules.md` / `architecture.md`.

**Secondary doctrine drift (not elevated beyond medium)**:

- The new `IExecutionRegistry` contract has no named fake/contract-test pair; current coverage relies on ad hoc object-literal fakes.
- The Phase 5 tests use wall-clock `setTimeout()` waits in the new resume/persistence coverage, which is less deterministic than the fake orchestration control points already available.
- `execution-registry.test.ts` uses abbreviated one-line `Test Doc:` comments rather than the full 5-field documentation standard.

### E.6) Harness Live Validation

Harness status: **UNHEALTHY**

| AC | Method | Result | Evidence |
|----|--------|--------|----------|
| AC1 | Seeded the harness workspace, created a two-node workflow, clicked Run in the browser, then inspected registry files, graph status, logs, and runtime markers | FAIL | The Run button was enabled and clicking it appended `fast-start 2026-03-16T01:40:23Z` to `.chainglass/phase5-fast.log`; `wf status phase5-livefix --workspace-path /app/scratch/harness-test-workspace --json` then showed the first node stuck in `starting`, `pod-sessions.json` updated, but `find / -path '*/execution-registry.json'` found no registry file anywhere. Earlier live run also surfaced `ENOENT ... pod-sessions.json.tmp`. |
| AC2 | Tried to establish a running execution via the browser-driven harness path, then planned to restart and observe automatic resume | SKIP | The live execution path never produced a trustworthy persisted running registry entry, so an end-to-end restart/resume check could not be exercised without masking the blocker from AC1. |
| AC3 | Tried to use a fast first node plus slow second node so one node would complete before restart, then compare runtime markers after resume | SKIP | This depended on AC2’s live resume path. In practice the fast node never reached `complete` in the live run, so non-re-execution after resume could not be observed. |
| AC4 | Seeded a stale `running` entry into `/root/.config/chainglass/execution-registry.json`, restarted the harness container, then inspected logs and the rewritten registry | PASS | After `docker restart chainglass-074-actaul-real-agents`, the registry was rewritten to `{\"version\":1,\"updatedAt\":\"2026-03-16T01:41:30.208Z\",\"executions\":[]}`, and logs contained `Skipping resume for missing-graph: worktree /app/scratch/deleted-phase5-worktree no longer exists`. |

The harness remained **degraded** (`app`, `MCP`, and terminal up; `CDP` down), but the agent still gathered meaningful live evidence. That evidence strengthened the review: AC1 failed in a real browser-driven run, AC4 passed via a seeded stale-entry restart, and AC2/AC3 remain unverified because the live execution path never reached a trustworthy resumable state.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC1 | Starting a workflow creates a registry entry | `workflow-execution-manager.test.ts:578-593` plus contradictory live harness evidence: browser-triggered execution started work but produced no `execution-registry.json` anywhere in the container | 25 |
| AC2 | Restarting the dev server resumes previously-running workflows | Intended test at `workflow-execution-manager.test.ts:650-688`, but it accepts `failed` and emitted failed-resume stderr in local execution | 15 |
| AC3 | Completed nodes are not re-executed after resume | No direct automated or live evidence found | 5 |
| AC4 | Registry entries for deleted worktrees are cleaned up | Missing-worktree skip unit test plus live harness restart with a seeded stale entry that was rewritten out of `/root/.config/chainglass/execution-registry.json` | 80 |

**Overall coverage confidence**: 31%

## G) Commands Executed

```bash
git --no-pager status --short && printf '\n---UNSTAGED---\n' && git --no-pager diff --stat && printf '\n---STAGED---\n' && git --no-pager diff --staged --stat

git --no-pager log --oneline --decorate -20

git --no-pager diff --binary --find-renames 5f5fa0b8..9722e7fe > docs/plans/074-workflow-execution/tasks/phase-5-server-restart-recovery/reviews/_computed.diff

git --no-pager diff --name-status 5f5fa0b8..9722e7fe

pnpm exec vitest run test/unit/web/features/074-workflow-execution/execution-registry.test.ts test/unit/web/features/074-workflow-execution/workflow-execution-manager.test.ts

cd harness && pnpm exec tsx src/cli/index.ts dev

cd harness && pnpm exec tsx src/cli/index.ts doctor --wait 180
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md
**Spec**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-spec.md
**Phase**: Phase 5: Server Restart Recovery
**Tasks dossier**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-5-server-restart-recovery/tasks.md
**Execution log**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-5-server-restart-recovery/execution.log.md
**Review file**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-5-server-restart-recovery/reviews/review.phase-5-server-restart-recovery.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.ts | Needs changes | ambiguous owner (`workflow-ui` support vs unregistered `074-workflow-execution`) | Fix F001, F005, F006, F008 |
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/execution-registry.ts | Needs changes | ambiguous owner (`workflow-ui` support vs unregistered `074-workflow-execution`) | Fix F006 |
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.test.ts | Needs changes | test | Fix F002, F003 |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md | Needs changes | plan artifact | Fix F004 |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-5-server-restart-recovery/tasks.md | Needs changes | phase artifact | Fix F004 |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/workflow-ui/domain.md | Needs changes | workflow-ui | Fix F007 or remove misplaced ownership/history |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/registry.md | Needs review | domain registry | Update if a new canonical owner is chosen |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/domain-map.md | Needs review | domain map | Update if a new canonical owner is chosen |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.ts | Make `resumeAll()` persist the intended post-filter registry state | Current code computes `toKeep` but never writes it |
| 2 | /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.ts | Make pre-drive failures persist a terminal state (or remove the handle) | Registry can retain stale `starting` entries when setup fails |
| 3 | /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/074-workflow-execution/workflow-execution-manager.test.ts | Replace false-positive resume coverage and prove AC2/AC3/AC4 | Current tests allow failed resume and never verify completed-node skip or cleanup write |
| 4 | /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md; /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-5-server-restart-recovery/tasks.md; /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/registry.md; /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/domain-map.md | Align canonical domain ownership for the `074-workflow-execution` slice | The same files are currently assigned to unregistered owners in different artifacts |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/workflow-ui/domain.md | Source Location / Composition / Concepts for registry + restart-recovery surface, if `workflow-ui` is the owner |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md | Phase 5 history/composition update if this domain is declared the owner instead |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/registry.md | Canonical owner row if a new domain is formalized |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/domain-map.md | Node/label updates if the owning domain set changes |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md --phase 'Phase 5: Server Restart Recovery'
