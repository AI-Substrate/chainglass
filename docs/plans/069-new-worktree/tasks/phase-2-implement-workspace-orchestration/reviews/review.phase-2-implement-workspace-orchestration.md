# Code Review: Phase 2: Implement Workspace Orchestration

**Plan**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md
**Spec**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-spec.md
**Phase**: Phase 2: Implement Workspace Orchestration
**Date**: 2026-03-08
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Phase 2 has the right architectural direction, but the shipped diff is not yet safe to approve: runtime DI wiring is incomplete, create-time conflict recovery is incomplete, bootstrap path validation is bypassable, and the planned Phase 2 safety-critical tests did not land.

**Key failure areas**:
- **Implementation**: Runtime containers still construct `WorkspaceService` with the old signature, bootstrap hook presence is hard-coded false in preview, and git conflict parsing loses stderr.
- **Domain compliance**: The plan's Domain Manifest omits several touched Phase 2 files, and workspace architecture docs are not fully synchronized with the Phase 2 surface.
- **Testing**: Safety-critical preview/create, git-manager, and bootstrap behavior remain largely untested; contract coverage is still fake-only.
- **Doctrine**: Production code uses an `any`-based post-construction setter hack instead of typed DI for bootstrap execution.

## B) Summary

Phase 2 gets the core shape mostly right: the naming allocator is pure, git mutation lives behind `IGitWorktreeManager`, and the anti-reinvention pass found no existing domain that should have owned these concepts instead. However, the implementation is not production-ready because the runtime web/CLI containers still do not wire the new worktree-creation dependencies, bootstrap hook detection/execution is only partially integrated, and create-time conflicts do not return a refreshed preview for the caller. Domain artifacts were updated enough to introduce the `workspace` domain, but the Domain Manifest and workspace domain/C4/domain-map documents are not fully synchronized with the Phase 2 surface. Testing evidence is the largest gap: the review verified only targeted naming/legacy-workspace/contract smoke tests plus package type-checking, while the planned manager/bootstrap/orchestration coverage is still missing.

## C) Checklist

**Testing Approach: Hybrid**

- [ ] Safety-critical orchestration, git-safety, and bootstrap paths have focused automated coverage
- [ ] Deferred/manual verification is recorded with concrete observed outcomes
- [ ] Acceptance criteria are mapped to concrete evidence
- [x] Only in-scope files changed
- [x] Targeted type checks and targeted Phase 2 tests passed
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/services/workspace.service.ts:55-77,380-389,487-496`<br/>`/Users/jordanknight/substrate/069-new-worktree/apps/web/src/lib/di-container.ts:368-375,732-739`<br/>`/Users/jordanknight/substrate/069-new-worktree/apps/cli/src/lib/container.ts:412-419,553-560` | correctness | Bootstrap integration is incomplete: the service relies on an `any`-based setter hack, preview hard-codes `hasBootstrapHook = false`, and the runtime containers still construct `WorkspaceService` with the pre-Phase-2 signature. | Inject a typed bootstrap-runner dependency through DI, wire `IGitWorktreeManager` and the runner through web/CLI containers, and use the runner (or a shared helper) for hook detection. |
| F002 | HIGH | `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/adapters/git-worktree-manager.adapter.ts:211-219,266-287` | error-handling | `GitWorktreeManagerAdapter` discards stderr, so `git worktree add` branch/path conflicts collapse into generic `git-failure` responses instead of the structured error taxonomy expected by the phase. | Preserve stderr/combined output when waiting on the git subprocess and classify `branch-exists` / `path-exists` from that buffered output. |
| F003 | HIGH | `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/services/workspace.service.ts:446-459,476-482` | correctness | Create-time conflicts return generic blocked errors without `refreshedPreview`, so the caller cannot preserve the user's input and present an updated suggestion after a branch/path collision. | Re-fetch ordinal sources on create conflicts and return `status: 'blocked'` with both a conflict-specific error and `refreshedPreview`. |
| F004 | HIGH | `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/services/worktree-bootstrap-runner.ts:57-63` | security | The bootstrap hook containment check uses `startsWith()` against the `.chainglass` realpath, which can be bypassed by sibling paths such as `.chainglass-evil/...`. | Replace the prefix check with a real path-boundary check based on `path.relative()` (or equivalent) before executing the hook. |
| F005 | HIGH | `/Users/jordanknight/substrate/069-new-worktree/test/unit/workflow/workspace-service.test.ts:1-496`<br/>`/Users/jordanknight/substrate/069-new-worktree/test/contracts/git-worktree-manager.contract.test.ts:1-8`<br/>`/Users/jordanknight/substrate/069-new-worktree/test/contracts/git-worktree-manager.contract.ts:18-85`<br/>`/Users/jordanknight/substrate/069-new-worktree/test/unit/workflow/git-worktree-manager.test.ts` *(missing)*<br/>`/Users/jordanknight/substrate/069-new-worktree/test/unit/workflow/worktree-bootstrap-runner.test.ts` *(missing)* | testing | The planned Phase 2 coverage did not land: no preview/create orchestration assertions exist, the contract suite still runs fake-only and only checks shape-level behavior, and the manager/bootstrap unit-test files are missing. | Add the missing service/manager/bootstrap tests, extend the contract suite to cover the new methods and blocked outcomes, and run it against the real adapter as well as the fake. |
| F006 | HIGH | `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md:27-58` | domain-compliance | The Phase 2 Domain Manifest does not list several touched files (`docs/c4/README.md`, `docs/domains/registry.md`, `packages/workflow/src/adapters/index.ts`, `packages/workflow/src/container.ts`, `packages/workflow/src/index.ts`, `test/unit/workflow/worktree-name.test.ts`). | Update the Domain Manifest so every touched Phase 2 file has an explicit domain/classification mapping. |
| F007 | MEDIUM | `/Users/jordanknight/substrate/069-new-worktree/docs/domains/workspace/domain.md:350-417`<br/>`/Users/jordanknight/substrate/069-new-worktree/docs/domains/domain-map.md:21-38,95-103`<br/>`/Users/jordanknight/substrate/069-new-worktree/docs/c4/components/workspace.md:13-50` | documentation | Workspace architecture docs are only partially synced: Phase 2 internals (`IGitWorktreeManager`, `worktree-name`, `WorktreeBootstrapRunner`) and the updated service responsibilities are still missing from domain.md/domain-map/C4. | Update the workspace domain history/composition/source-location sections, add the create-worktree surface to the domain map, and expand the workspace C4 component diagram to show the new internals. |
| F008 | MEDIUM | `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-2-implement-workspace-orchestration/execution.log.md:54-113` | evidence | The execution log claims broader coverage (`356` files / `5014` tests and manual validation), but the concrete evidence verified during this review is only the targeted 62-test Vitest run plus package type-checking. | Attach exact transcripts/CI references for the broader checks or narrow the log to the evidence that is actually available. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)** — The web and CLI containers are still instantiating `WorkspaceService` with only `(registryAdapter, contextResolver, gitResolver)`, while the new service implementation expects Phase 2 worktree-creation dependencies. In the same codepath, `previewCreateWorktree()` explicitly hard-codes `hasBootstrapHook = false`, and the only bootstrap integration path is a post-construction setter that is never called by any runtime container.
- **F002 (HIGH)** — `GitWorktreeManagerAdapter.createWorktree()` tries to classify `branch-exists` and `path-exists`, but `execGit()` returns `stderr: ''` for every subprocess. In normal git failure cases, the useful error text is on stderr, so the Phase 2 error taxonomy degrades to generic git failures.
- **F003 (HIGH)** — The create path silently retries one ordinal when a branch conflict is detected in-memory, but if the retried name also conflicts — or if `git worktree add` reports `branch-exists` / `path-exists` — the service returns only a generic `WorkspaceErrors.gitError(...)` with no `refreshedPreview`. That violates the documented conflict-recovery contract for the caller.
- **F004 (HIGH)** — The bootstrap runner validates containment with a string-prefix check instead of a path-boundary check. A sibling directory whose name shares the `.chainglass` prefix can bypass the current guard and be executed as a hook.
- **No reinvention issues** were found in the implementation surface itself; the main issues are integration, error modeling, and validation gaps.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New Phase 2 source files live under `packages/workflow/src/{interfaces,adapters,services,fakes}` and `docs/domains/workspace/`, matching the declared `workspace` domain tree. |
| Contract-only imports | ✅ | No cross-domain internal import violations were identified in the reviewed Phase 2 source files. |
| Dependency direction | ✅ | New workspace behavior depends on shared/platform contracts; no infrastructure→business inversion was found in the changed code. |
| Domain.md updated | ❌ | `/Users/jordanknight/substrate/069-new-worktree/docs/domains/workspace/domain.md` stops at Phase 1 history and omits Phase 2 internals from Composition and Source Location. |
| Registry current | ✅ | `/Users/jordanknight/substrate/069-new-worktree/docs/domains/registry.md` includes the new `Workspace` domain row. |
| No orphan files | ❌ | The Phase 2 Domain Manifest in the plan omits multiple touched files (see F006). |
| Map nodes current | ❌ | `/Users/jordanknight/substrate/069-new-worktree/docs/domains/domain-map.md` does not yet advertise `IGitWorktreeManager` or the create-worktree surface in the workspace node/summary. |
| Map edges current | ✅ | The added workspace edges remain labeled; no unlabeled dependency arrows were introduced in the reviewed diff. |
| No circular business deps | ✅ | No new circular business-domain dependency was evident in the updated map. |
| Concepts documented | ✅ | `workspace/domain.md` has a Concepts section and includes the new create-worktree / `IGitWorktreeManager` concepts. |

**Domain compliance findings**:
- **F006 (HIGH)** — The Phase 2 Domain Manifest is incomplete, so not every touched file is explicitly mapped back to the `workspace` domain plan.
- **F007 (MEDIUM)** — The workspace domain definition, domain map, and C4 component diagram lag the implemented Phase 2 contract surface and internals.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `worktree-name` allocator | None | N/A | Proceed |
| `GitWorktreeManagerAdapter` | None | N/A | Proceed |
| `WorktreeBootstrapRunner` | None | N/A | Proceed |
| `FakeGitWorktreeManager` | None | N/A | Proceed |

The concept-search pass did not find a pre-existing domain component that should have been reused instead of these new workspace-domain implementations.

### E.4) Testing & Evidence

**Coverage confidence**: 16%

**Observed evidence profile**: the spec says **Hybrid**, but the concrete evidence attached to this review is effectively **Lightweight** — targeted helper/legacy-workspace tests plus package type-checking.

| AC | Confidence | Evidence |
|----|------------|----------|
| AC1 | 32% | `test/unit/workflow/worktree-name.test.ts` covers normalization/allocation logic, and the targeted review run passed. No service/adaptor tests prove preview/create orchestration from refreshed local `main`. |
| AC2 | 8% | No observed test or manual transcript proves dirty/ahead/diverged/lock states block creation before side effects. `test/unit/workflow/git-worktree-manager.test.ts` is missing. |
| AC3 | 6% | `worktree-bootstrap-runner.ts` exists, but `test/unit/workflow/worktree-bootstrap-runner.test.ts` is missing and there are no orchestration assertions for skipped/succeeded/failed/no-rollback outcomes. |

**Testing findings**:
- **F005 (HIGH)** — Planned Phase 2 tests are missing or too shallow.
- **F008 (MEDIUM)** — The execution log overstates the concrete evidence verified during review.

### E.5) Doctrine Compliance

Checked against:
- `/Users/jordanknight/substrate/069-new-worktree/docs/project-rules/rules.md`
- `/Users/jordanknight/substrate/069-new-worktree/docs/project-rules/idioms.md`
- `/Users/jordanknight/substrate/069-new-worktree/docs/project-rules/architecture.md`
- `/Users/jordanknight/substrate/069-new-worktree/docs/project-rules/constitution.md`

Key doctrine issues:
- **F001 (HIGH)** — `WorkspaceService` uses `null as unknown as WorktreeBootstrapRunner` plus `(this as any).bootstrapRunner = runner`, which violates `R-CODE-001`'s no-`any` production-code rule and bypasses the typed DI pattern required by `R-ARCH-002`.
- **F005 (HIGH)** — `R-TEST-008` is not satisfied because the `IGitWorktreeManager` contract suite still runs only against the fake and does not cover the newly added read methods.
- **F007 (MEDIUM)** — The workspace C4 component diagram is not kept in sync with the new internal Phase 2 components, which conflicts with the project's C4 synchronization rules.

No major naming, directory, or cross-package import-convention violations were found beyond the DI/testing issues above.

### E.6) Harness Live Validation

N/A — no harness configured. `/Users/jordanknight/substrate/069-new-worktree/docs/project-rules/harness.md` was not present, so live validation was skipped.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC1 | The workspace domain can preview and create new worktrees from refreshed local `main` using the agreed ordinal naming convention. | Verified naming helpers via `test/unit/workflow/worktree-name.test.ts`; no observed orchestration or adapter proof for preview/create from refreshed `main`. | 32% |
| AC2 | Blocking git safety failures stop creation before any branch or worktree is created. | No observed manager/service tests or manual transcript proving dirty/ahead/diverged/lock-blocking behavior before side effects. | 8% |
| AC3 | Hook execution is sourced from `<mainRepoPath>/.chainglass/new-worktree.sh`, runs with structured environment variables, and reports skipped/succeeded/failed without rolling back a created worktree. | Runner exists in code, but no dedicated runner tests or preview/create orchestration evidence verifies the contract end-to-end. | 6% |

**Overall coverage confidence**: 16%

## G) Commands Executed

```bash
git --no-pager status --short
git --no-pager diff --stat
git --no-pager diff --staged --stat

# Built /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-2-implement-workspace-orchestration/reviews/_computed.diff
# from git status + git diff + git diff --no-index for new files via a Python wrapper.

git --no-pager diff --name-status
git --no-pager diff -- /path/to/modified-file
git --no-pager diff --no-index -- /dev/null /path/to/new-file

npx vitest run test/unit/workflow/workspace-service.test.ts test/unit/workflow/worktree-name.test.ts test/contracts/git-worktree-manager.contract.test.ts
npx tsc --noEmit -p packages/workflow/tsconfig.json
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md
**Spec**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-spec.md
**Phase**: Phase 2: Implement Workspace Orchestration
**Tasks dossier**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-2-implement-workspace-orchestration/tasks.md
**Execution log**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-2-implement-workspace-orchestration/execution.log.md
**Review file**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-2-implement-workspace-orchestration/reviews/review.phase-2-implement-workspace-orchestration.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/069-new-worktree/docs/c4/README.md | modified | workspace docs | No |
| /Users/jordanknight/substrate/069-new-worktree/docs/c4/components/workspace.md | created | workspace docs | Yes |
| /Users/jordanknight/substrate/069-new-worktree/docs/domains/domain-map.md | modified | workspace docs | Yes |
| /Users/jordanknight/substrate/069-new-worktree/docs/domains/registry.md | modified | workspace docs | No |
| /Users/jordanknight/substrate/069-new-worktree/docs/domains/workspace/domain.md | created | workspace docs | Yes |
| /Users/jordanknight/substrate/069-new-worktree/packages/shared/src/di-tokens.ts | modified | shared | No |
| /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/adapters/git-worktree-manager.adapter.ts | created | workspace | Yes |
| /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/adapters/index.ts | modified | workspace | No |
| /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/container.ts | modified | workspace | No |
| /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/fakes/fake-git-worktree-manager.ts | created | workspace | No |
| /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/fakes/index.ts | modified | workspace | No |
| /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/index.ts | modified | workspace | No |
| /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/interfaces/git-worktree-manager.interface.ts | created | workspace contract | No |
| /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/interfaces/index.ts | modified | workspace contract | No |
| /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/interfaces/workspace-service.interface.ts | modified | workspace contract | No |
| /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/services/workspace.service.ts | modified | workspace | Yes |
| /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/services/worktree-bootstrap-runner.ts | created | workspace | Yes |
| /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/services/worktree-name.ts | created | workspace | No |
| /Users/jordanknight/substrate/069-new-worktree/test/contracts/git-worktree-manager.contract.test.ts | created | workspace tests | Yes |
| /Users/jordanknight/substrate/069-new-worktree/test/contracts/git-worktree-manager.contract.ts | created | workspace tests | Yes |
| /Users/jordanknight/substrate/069-new-worktree/test/unit/workflow/workspace-service.test.ts | modified | workspace tests | Yes |
| /Users/jordanknight/substrate/069-new-worktree/test/unit/workflow/worktree-name.test.ts | created | workspace tests | No |
| /Users/jordanknight/substrate/069-new-worktree/apps/web/src/lib/di-container.ts | unchanged | workspace integration | Yes |
| /Users/jordanknight/substrate/069-new-worktree/apps/cli/src/lib/container.ts | unchanged | workspace integration | Yes |
| /Users/jordanknight/substrate/069-new-worktree/test/unit/workflow/git-worktree-manager.test.ts | missing | workspace tests | Yes |
| /Users/jordanknight/substrate/069-new-worktree/test/unit/workflow/worktree-bootstrap-runner.test.ts | missing | workspace tests | Yes |
| /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md | existing | phase plan | Yes |
| /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-2-implement-workspace-orchestration/execution.log.md | existing | phase evidence | Yes |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/services/workspace.service.ts<br/>/Users/jordanknight/substrate/069-new-worktree/apps/web/src/lib/di-container.ts<br/>/Users/jordanknight/substrate/069-new-worktree/apps/cli/src/lib/container.ts | Replace the bootstrap setter hack with typed DI, wire `IGitWorktreeManager` and the bootstrap runner into runtime containers, and stop hard-coding `hasBootstrapHook = false`. | Phase 2 preview/create is not actually integrated into runtime paths today. |
| 2 | /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/adapters/git-worktree-manager.adapter.ts | Preserve stderr/combined git output and use it for structured `branch-exists` / `path-exists` parsing. | Git conflict taxonomy currently degrades to generic failures. |
| 3 | /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/services/workspace.service.ts | Return `refreshedPreview` for branch/path conflicts encountered during create-time allocation or `git worktree add`. | The caller cannot preserve user input or present updated suggestions after conflicts. |
| 4 | /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/services/worktree-bootstrap-runner.ts | Replace the prefix-based containment guard with a true path-boundary check. | The current hook validation can be bypassed by sibling `.chainglass-*` paths. |
| 5 | /Users/jordanknight/substrate/069-new-worktree/test/unit/workflow/workspace-service.test.ts<br/>/Users/jordanknight/substrate/069-new-worktree/test/contracts/git-worktree-manager.contract.ts<br/>/Users/jordanknight/substrate/069-new-worktree/test/contracts/git-worktree-manager.contract.test.ts<br/>/Users/jordanknight/substrate/069-new-worktree/test/unit/workflow/git-worktree-manager.test.ts<br/>/Users/jordanknight/substrate/069-new-worktree/test/unit/workflow/worktree-bootstrap-runner.test.ts | Add the missing service/manager/bootstrap tests and run the contract suite against the real adapter with behavioral assertions for new methods/outcomes. | Phase 2's highest-risk behavior is largely unproven. |
| 6 | /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md | Update the Domain Manifest to include every touched Phase 2 file. | Domain compliance currently has orphan touched files. |
| 7 | /Users/jordanknight/substrate/069-new-worktree/docs/domains/workspace/domain.md<br/>/Users/jordanknight/substrate/069-new-worktree/docs/domains/domain-map.md<br/>/Users/jordanknight/substrate/069-new-worktree/docs/c4/components/workspace.md | Sync workspace history/composition/source location, domain-map surface, and C4 internals with the implemented Phase 2 code. | The documentation lags the current contract surface and internals. |
| 8 | /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-2-implement-workspace-orchestration/execution.log.md | Attach exact command output/CI references for the broader coverage claims or narrow the evidence section. | The current execution log claims more verification than this review could confirm. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md | Add all touched Phase 2 files to `## Domain Manifest`. |
| /Users/jordanknight/substrate/069-new-worktree/docs/domains/workspace/domain.md | Add a Plan 069 Phase 2 history row and include `worktree-name.ts`, `worktree-bootstrap-runner.ts`, and the updated create-worktree surface in Composition/Source Location. |
| /Users/jordanknight/substrate/069-new-worktree/docs/domains/domain-map.md | Add `IGitWorktreeManager` / create-worktree contract surface to the workspace node and health-summary row. |
| /Users/jordanknight/substrate/069-new-worktree/docs/c4/components/workspace.md | Show `GitWorktreeManagerAdapter`, `WorktreeBootstrapRunner`, and the naming allocator inside the workspace boundary. |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md --phase "Phase 2: Implement Workspace Orchestration"
