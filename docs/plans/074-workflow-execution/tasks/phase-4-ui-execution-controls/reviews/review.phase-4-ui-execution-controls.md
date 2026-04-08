# Code Review: Phase 4: UI Execution Controls

**Plan**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md
**Spec**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-spec.md
**Phase**: Phase 4: UI Execution Controls
**Date**: 2026-03-15
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Phase 4 delivers the intended toolbar controls and line-level locking primitives, but three blocking issues remain: execution locking is bypassable through mutation paths outside `WorkflowLine`, the new durable tests violate the project's mandatory Test Doc rule, and the new `apps/web/src/features/074-workflow-execution/` tree is not owned by any declared registered domain.

**Key failure areas**:
- **Implementation**: `WorkflowEditor` still allows Backspace delete and property-edit entry points without execution-aware guards.
- **Domain compliance**: New Phase 4 source files live in an unclaimed `074-workflow-execution` tree outside the documented `workflow-ui` source boundary.
- **Testing**: Coverage stops at pure-function tests; hook/component/browser evidence for hydration, action wiring, and undo/redo blocking is missing.
- **Doctrine**: 28 new durable tests omit the required 5-field Test Doc blocks.

## B) Summary

The phase adds the expected `useWorkflowExecution` hook, button-state utility, toolbar controls, progress display, and line-level execution locking, and the targeted Phase 4 Vitest rerun passed `28/28` tests. However, the new locking is only enforced inside `WorkflowLine`; `WorkflowEditor` still exposes mutation paths that do not consult execution-aware editability, which undermines the phase's core locking acceptance criteria. Domain ownership is also unresolved because the new `apps/web/src/features/074-workflow-execution/` files sit outside every documented registered domain source tree and `workflow-ui/domain.md` was only updated in its History table. Review confidence is further reduced because evidence is limited to pure-function tests and live harness validation was unavailable in a clean worktree due harness boot/build failures.

## C) Checklist

**Testing Approach: Hybrid**

- [x] Core validation tests present
- [ ] Critical hook/UI paths covered
- [ ] Manual/browser verification steps documented with observed outcomes

Universal (all approaches):
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (no full clean evidence captured during review; targeted Vitest rerun passed)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx:272-294,307-331,377-397` | correctness | Execution locking only gates `WorkflowLine`; keyboard delete and property-edit entry points can still mutate locked nodes during execution. | Derive selected-node editability from the selected line + execution status and reuse it across delete/edit entry points. |
| F002 | HIGH | `/Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/074-workflow-execution/execution-button-state.test.ts:13-113`; `/Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/050-workflow-page/workflow-line-locking.test.ts:43-117` | doctrine | 28 new durable tests omit the mandatory 5-field Test Doc blocks required by project rules and the constitution. | Add a full Test Doc block to every new `it(...)` case before keeping these tests in `test/unit/`. |
| F003 | HIGH | `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/hooks/use-workflow-execution.ts:1-194`; `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/execution-button-state.ts:1-117`; `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/workflow-ui/domain.md:28-34,70-105,138-151` | domain | New `apps/web/src/features/074-workflow-execution/` files are outside any declared registered domain source location and are only partially documented. | Either move them under `workflow-ui`'s owned tree or explicitly claim/register/map the 074 tree and update plan/domain artifacts consistently. |
| F004 | MEDIUM | `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/hooks/use-workflow-execution.ts:74-194`; `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx:132-146,309-331`; `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/050-workflow-page/components/workflow-temp-bar.tsx:175-227`; `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-4-ui-execution-controls/execution.log.md:12-13,101-104` | testing | Hybrid evidence is below the phase bar: only pure-function tests exist, and the execution log is summary-only. | Add hook/component/browser evidence for run/stop/restart wiring, hydration, progress display, and undo/redo blocking. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: `WorkflowEditor` derives execution-aware locking at the `WorkflowLine` level, but other mutation entry points bypass that gate:
  - `handleDeleteNode()` and the Backspace handler delete `selectedNodeId` without checking execution-aware editability (`workflow-editor.tsx:272-294`).
  - The properties panel remains wired with `onEditProperties={() => setEditModalNodeId(selectedNodeId)}` regardless of whether the selected node's line is currently locked (`workflow-editor.tsx:377-397`).
  - The underlying server actions used by those paths (`workflow-actions.ts:232-245`, `511-566`) do not add a compensating execution-state guard, so this is a real behavior hole, not just a UI affordance mismatch.
  - Recommendation: derive `selectedNodeEditable` from the selected node's containing line via `isLineEditable(line, execution.status)` and use that boolean to gate keyboard delete and the edit-properties entry point.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ❌ | New files under `apps/web/src/features/074-workflow-execution/` are outside the source tree currently claimed by `workflow-ui/domain.md` (`apps/web/src/features/050-workflow-page/`). |
| Contract-only imports | ✅ | No material cross-domain internal import violations were found in the changed Phase 4 code. |
| Dependency direction | ✅ | No business→infrastructure inversion or circular dependency was introduced by the changed files. |
| Domain.md updated | ❌ | `workflow-ui/domain.md` received only a History row. Boundary, Composition, Source Location, and developer guidance still omit the execution hook/utility slice and `workflow-execution-actions.ts` usage. |
| Registry current | ❌ | No registered domain currently claims `apps/web/src/features/074-workflow-execution/`; there is no `074-workflow-execution` or `web-integration` registry entry. |
| No orphan files | ❌ | The new 074 execution-support tree cannot be traced to a canonical registered owner under the current domain docs. |
| Map nodes current | ❌ | If the 074 tree is meant to be separate, `domain-map.md` has no owner node for it; if it belongs to `workflow-ui`, the domain documentation still does not claim that placement. |
| Map edges current | ✅ | No new external contract edges were introduced beyond workflow-ui's existing state/positional-graph usage. |
| No circular business deps | ✅ | No new business-domain cycle was introduced. |
| Concepts documented | N/A | `workflow-ui` is a leaf consumer domain with no public contracts. |

- **F003 (HIGH)**: The new Phase 4 hook/utility files live under `apps/web/src/features/074-workflow-execution/`, but the only documented owner remains `workflow-ui` with source rooted in `apps/web/src/features/050-workflow-page/`. The registry has no `074-workflow-execution` or `web-integration` domain, so the new tree is currently orphaned. Either fold it into `workflow-ui`'s declared tree or formalize/register the new owner and update the registry/map accordingly.

### E.3) Anti-Reinvention

No genuine cross-domain duplication was found.

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `useWorkflowExecution` hook | None found | workflow-ui | Proceed |
| `deriveButtonState()` utility | None found | workflow-ui | Proceed |
| Browser-safe execution key generation | `makeExecutionKey()` in `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.types.ts` | workflow-ui / 074-workflow-execution | Low-risk overlap — keep algorithms aligned or extract a shared helper if reused again |

### E.4) Testing & Evidence

**Coverage confidence**: 42%

| AC | Confidence | Evidence |
|----|------------|----------|
| Phase4-1 | 68 | `test/unit/web/features/074-workflow-execution/execution-button-state.test.ts` covers Run visibility state-machine cases; targeted Vitest rerun passed `28/28`. |
| Phase4-2 | 68 | The same test file covers Stop visibility for `running`/`stopping`; `workflow-temp-bar.tsx` renders the matching Stop button states. |
| Phase4-3 | 68 | The same test file covers Restart visibility for `stopped`/`completed`/`failed`; render-level proof is still missing. |
| Phase4-4 | 24 | Static wiring exists in `use-workflow-execution.ts`, `workflow-editor.tsx`, and `workflow-temp-bar.tsx`, but there is no hook/component/browser proof that clicking Run actually yields a Running UI. |
| Phase4-5 | 26 | `workflow-line-locking.test.ts` verifies `isLineEditable()` behavior, but there is no rendered interaction test and `workflow-editor.tsx:287-292` exposes an unguarded Backspace delete path. |
| Phase4-6 | 55 | Future-line editability is partially supported by `workflow-line-locking.test.ts`, but there is no drag/drop or DOM-level interaction evidence. |

- **F004 (MEDIUM)**: The phase is documented as Hybrid, but actual verification is limited to 28 pure-function tests. There is no direct hook coverage for mount hydration / GlobalState merge / server-action failure handling, and no component/browser evidence for toolbar rendering, button callbacks, progress display, or undo/redo disablement.
- Additional observation: `pnpm vitest --run ...` passed, but emitted a pre-existing `tsconfig-paths` parse warning from `apps/cli/dist/web/standalone/apps/web/tsconfig.json`. The Phase 4 test run itself still completed successfully.

### E.5) Doctrine Compliance

- **F002 (HIGH)**: Both new Phase 4 test files violate `docs/project-rules/rules.md` §§ `R-TEST-002` and `R-TEST-003` and `docs/project-rules/constitution.md` §3.2 by omitting the required 5-field Test Doc block in every durable unit test.
  - `/Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/074-workflow-execution/execution-button-state.test.ts`
  - `/Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/050-workflow-page/workflow-line-locking.test.ts`
- No other material doctrine violations were surfaced by the changed Phase 4 code.

### E.6) Harness Live Validation

Harness was configured but **live validation was unavailable**.

- **Harness status**: `UNAVAILABLE`
- **Checks performed**:
  - `just harness health`
  - `just harness dev`
  - `just harness doctor --wait 180`
  - `curl http://127.0.0.1:3185/`
- **Evidence**:
  - A clean temp worktree at commit `91bca8b9` never reached a healthy harness state.
  - `just harness health` / `just harness doctor --wait 180` reported the app/MCP/CDP endpoints unhealthy.
  - The clean-worktree boot surfaced build failures outside the Phase 4 diff in earlier workflow-execution files (not counted as blocking Phase 4 findings per harness-review rules): missing resolution for `./workflow-execution-manager.types.js` in `workflow-execution-manager.ts:23` and missing `getContainer` export in `create-execution-manager.ts:17`.
  - Per command rules, this is treated as `HARNESS_UNAVAILABLE` and lowers confidence, but does not independently block the review.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| Phase4-1 | Run button visible when idle/stopped/failed, hidden when running | `execution-button-state.test.ts` covers idle/stopped/failed/running state machine cases; targeted Vitest rerun passed `28/28`. | 68 |
| Phase4-2 | Stop button visible when running, hidden otherwise | `execution-button-state.test.ts` covers running/stopping Stop visibility and enabled/disabled behavior. | 68 |
| Phase4-3 | Restart button visible when stopped/completed/failed | `execution-button-state.test.ts` covers stopped/completed/failed Restart visibility. | 68 |
| Phase4-4 | Clicking Run starts the workflow, UI shows “Running” | Static wiring only in `use-workflow-execution.ts`, `workflow-editor.tsx`, and `workflow-temp-bar.tsx`; no direct interaction evidence. | 24 |
| Phase4-5 | Completed and running nodes cannot be dragged or removed | `workflow-line-locking.test.ts` covers `isLineEditable()` but not rendered drag/remove behavior; Backspace delete remains unguarded. | 26 |
| Phase4-6 | Future nodes CAN be edited while workflow is running | `workflow-line-locking.test.ts` keeps pending/empty lines editable while running, but no DOM-level interaction test exists. | 55 |

**Overall coverage confidence**: 42%

## G) Commands Executed

```bash
git --no-pager diff --stat && printf '\n---STAGED---\n' && git --no-pager diff --staged --stat && printf '\n---STATUS---\n' && git --no-pager status --short
git --no-pager log --oneline --decorate -40 --all --grep='074\|Phase 4\|workflow execution\|execution controls'
git --no-pager show --stat --name-status --format=fuller --summary 91bca8b9 --
git --no-pager diff 91bca8b9^ 91bca8b9 > docs/plans/074-workflow-execution/tasks/phase-4-ui-execution-controls/reviews/_computed.diff
pnpm vitest --run test/unit/web/features/074-workflow-execution/execution-button-state.test.ts test/unit/web/features/050-workflow-page/workflow-line-locking.test.ts
just harness health
just harness dev
just harness doctor --wait 180
curl http://127.0.0.1:3185/
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md
**Spec**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-spec.md
**Phase**: Phase 4: UI Execution Controls
**Tasks dossier**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-4-ui-execution-controls/tasks.md
**Execution log**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-4-ui-execution-controls/execution.log.md
**Review file**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-4-ui-execution-controls/reviews/review.phase-4-ui-execution-controls.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/050-workflow-page/components/workflow-canvas.tsx | Modified | workflow-ui | None from review |
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx | Modified | workflow-ui | F001, F004 |
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/050-workflow-page/components/workflow-line.tsx | Modified | workflow-ui | Support F001 regression coverage if helper reuse changes |
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/050-workflow-page/components/workflow-temp-bar.tsx | Modified | workflow-ui | F004 |
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/execution-button-state.ts | Added | workflow-ui (unclaimed 074 tree) | F003 |
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/hooks/use-workflow-execution.ts | Added | workflow-ui (unclaimed 074 tree) | F003, F004 |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/workflow-ui/domain.md | Modified | docs / workflow-ui | F003 |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-4-ui-execution-controls/execution.log.md | Added | plan artifact | F004 |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-4-ui-execution-controls/tasks.fltplan.md | Added | plan artifact | None from review |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-4-ui-execution-controls/tasks.md | Added | plan artifact | None from review |
| /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/050-workflow-page/workflow-line-locking.test.ts | Added | test | F002 |
| /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/074-workflow-execution/execution-button-state.test.ts | Added | test | F002 |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx | Gate Backspace delete and property-edit entry points on execution-aware editability for the selected node/line. | Current UI can still mutate nodes that Phase 4 intended to lock. |
| 2 | /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/074-workflow-execution/execution-button-state.test.ts; /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/050-workflow-page/workflow-line-locking.test.ts | Add required 5-field Test Doc blocks to every new durable test case. | Project rules and constitution mark this as mandatory. |
| 3 | /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/; /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/workflow-ui/domain.md; /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md | Resolve ownership of the 074 execution-support tree and make the domain docs / manifest consistent. | The new files are currently outside any declared registered domain source location. |
| 4 | /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/hooks/use-workflow-execution.ts; /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/050-workflow-page/components/workflow-temp-bar.tsx; /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx; /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-4-ui-execution-controls/execution.log.md | Add direct hook/component/browser evidence for run/stop/restart wiring, hydration, progress rendering, and undo/redo blocking; record exact evidence in the execution log. | Current evidence is below the phase's stated Hybrid bar. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/workflow-ui/domain.md | Boundary, Composition, Source Location, and developer guidance for execution controls / 074 tree ownership |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md | Canonical Domain Manifest entries for the new Phase 4 files under the chosen owner |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/registry.md | Only needed if the 074 tree becomes a real separate domain |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/domain-map.md | Only needed if the 074 tree becomes a real separate domain or changes external domain topology |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md --phase 'Phase 4: UI Execution Controls'
