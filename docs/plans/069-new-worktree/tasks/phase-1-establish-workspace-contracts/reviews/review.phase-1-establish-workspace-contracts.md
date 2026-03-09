# Code Review: Phase 1: Establish Workspace Contracts

**Plan**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md
**Spec**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-spec.md
**Phase**: Phase 1: Establish Workspace Contracts
**Date**: 2026-03-07
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Phase 1 establishes the right workspace-domain boundary, but two core deliverables are not yet stable enough to approve: the preview contract cannot represent expected blocked/error outcomes, and the git-manager contract scaffold does not lock in the documented safety taxonomy that later phases depend on.

**Key failure areas**:
- **Implementation**: `previewCreateWorktree()` exposes only a happy-path payload, so expected preview failures still require throws or a later breaking API change.
- **Domain compliance**: `docs/domains/domain-map.md` and the phase traceability artifacts do not fully reflect the new write-side workspace surface.
- **Testing**: the `IGitWorktreeManager` contract suite only checks for a `status` string and does not exercise the documented dirty/ahead/diverged/conflict taxonomy.
- **Doctrine**: the new workspace C4 component diagram is not yet in sync with the added mutation boundary and still uses generic relationship labels.

## B) Summary

Phase 1 makes solid progress on separating read-only worktree discovery from write-side git mutation, and the anti-reinvention check did not find an existing capability that should have been reused. The highest-risk gap is in the new public contract: `PreviewCreateWorktreeResult` is happy-path only, so later phases will need to throw or break the API to represent expected preview failures. The second blocking gap is test depth: the new git-manager contract scaffold passes, but it does not encode the workshop taxonomy that the fake is supposed to specify for Phase 2. Domain and C4 docs were updated, but the domain map and phase traceability artifacts still lag behind the new write-side surface.

## C) Checklist

**Testing Approach: Hybrid**

- [x] Core validation tests present
- [ ] Critical contract states covered
- [ ] Key verification points documented with concrete outputs

Universal (all approaches):
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/interfaces/workspace-service.interface.ts:75-96,274-276` | implementation | `previewCreateWorktree()` cannot return expected blocked/validation failures as typed domain results. | Redesign the preview contract to return a discriminated result or workspace-style error wrapper before later phases depend on the current signature. |
| F002 | HIGH | `/Users/jordanknight/substrate/069-new-worktree/test/contracts/git-worktree-manager.contract.ts:18-86` | testing | The git-manager contract scaffold only shape-checks `status` and does not lock in the workshop safety/conflict taxonomy. | Expand the shared contract suite so fake/real parity covers the documented blocked, sync, and create outcomes. |
| F003 | MEDIUM | `/Users/jordanknight/substrate/069-new-worktree/docs/domains/domain-map.md:33,152` | domain-compliance | The workspace node and health summary omit the new write-side contracts added in this phase. | Update the workspace node and Domain Health Summary row to include `IGitWorktreeManager` and the preview/create contract surface. |
| F004 | MEDIUM | `/Users/jordanknight/substrate/069-new-worktree/docs/c4/components/workspace.md:13-35` | doctrine | The workspace component diagram does not show the new mutation boundary and still labels edges with generic verbs instead of contracts. | Add the worktree-creation mutation path and relabel edges with concrete contracts/entry points from `docs/domains/workspace/domain.md`. |
| F005 | LOW | `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md:27-59`<br/>`/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-1-establish-workspace-contracts/tasks.md:102-111` | traceability | The phase traceability artifacts do not account for all touched public/doc surfaces (`packages/workflow/src/index.ts`, `docs/domains/registry.md`, `docs/c4/README.md`). | Update the Domain Manifest and phase task dossier so every changed file in the phase diff is represented. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)** — `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/interfaces/workspace-service.interface.ts:75-96,274-276`
  - `PreviewCreateWorktreeResult` is a happy-path payload only, while `IWorkspaceService` documents that expected failures should be returned as typed results instead of thrown exceptions.
  - That leaves no typed way to represent expected preview failures such as unknown workspace, invalid requested name, or main-repo resolution problems.
  - **Fix**: introduce a discriminated preview result (or a `success/errors` wrapper) before Phase 2/3 build on this surface.

No material security or performance issues were identified in the phase diff.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New source files are under the workspace-owned `packages/workflow/src/` tree, and new tests live under `test/contracts/`. |
| Contract-only imports | ✅ | The new workspace contracts/fakes import from local public contract surfaces; no cross-domain internal-file imports were introduced. |
| Dependency direction | ✅ | No infrastructure→business reversal or business→business internal import was introduced by this phase. |
| Domain.md updated | ✅ | `/Users/jordanknight/substrate/069-new-worktree/docs/domains/workspace/domain.md` adds concepts, contracts, composition, and history entries for Phase 1. |
| Registry current | ✅ | `/Users/jordanknight/substrate/069-new-worktree/docs/domains/registry.md` includes `workspace` as an active business domain. |
| No orphan files | ❌ | `packages/workflow/src/index.ts`, `docs/domains/registry.md`, and `docs/c4/README.md` are in the diff but not represented in the Domain Manifest / phase task paths. |
| Map nodes current | ❌ | The workspace node and health summary still advertise only the read-side/public UI surface and omit `IGitWorktreeManager` plus preview/create types. |
| Map edges current | ✅ | No unlabeled or reversed dependency edges were introduced by the phase diff. |
| No circular business deps | ✅ | The reviewed domain-map changes do not introduce a new business-domain cycle. |
| Concepts documented | ✅ | The workspace domain has a `## Concepts` section and includes the new create-worktree and git-mutation entries. |

- **F003 (MEDIUM)** — `/Users/jordanknight/substrate/069-new-worktree/docs/domains/domain-map.md:33,152`
  - The workspace node and health summary still stop at `IWorkspaceService`, `IWorkspaceContextResolver`, `IGitWorktreeResolver`, and `useWorkspaceContext`.
  - This phase added a new write-side contract surface (`IGitWorktreeManager`, preview/create result types), so the map is no longer fully current.
  - **Fix**: extend the workspace node label and the health-summary row to reflect the new public write-side surface.

- **F005 (LOW)** — `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md:27-59` and `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-1-establish-workspace-contracts/tasks.md:102-111`
  - The phase diff includes touched public/doc surfaces that are not listed in the Domain Manifest or task dossier paths.
  - **Fix**: add `packages/workflow/src/index.ts`, `docs/domains/registry.md`, and `docs/c4/README.md` to the relevant traceability artifacts if those files remain part of Phase 1.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `IGitWorktreeManager` | None | workspace | ✅ Proceed |
| `FakeGitWorktreeManager` | None | workspace | ✅ Proceed |
| Preview/create worktree contract additions on `IWorkspaceService` | None | workspace | ✅ Proceed |

The anti-reinvention subagent returned no duplicate-capability findings.

### E.4) Testing & Evidence

**Coverage confidence**: 48%

| AC | Confidence | Evidence |
|----|------------|----------|
| T001 Done When | 72 | `workspace-service.interface.ts` adds the preview/create request/result types and signatures; `workspace.service.ts` contains compile-safe stubs. `npx tsc --noEmit -p packages/workflow/tsconfig.json` completed successfully during review. |
| T004 / T006 Done When | 56 | `fake-git-worktree-manager.ts` adds state setters, call tracking, error injection, and reset; `npx vitest run test/contracts/git-worktree-manager.contract.test.ts` passed 4/4 tests during review. |
| AC3-5 | 38 | The preview contract exposes `normalizedSlug`, `ordinal`, `branchName`, and `worktreePath`, but no automated test exercises preview behavior or naming preservation. |
| AC6 / AC8 / AC9 | 42 | `IGitWorktreeManager` and `FakeGitWorktreeManager` define the clean/dirty/ahead/diverged/conflict taxonomy, but the parity suite does not verify those paths. |
| AC10-12 | 27 | `BootstrapStatus` and the `CreateWorktreeResult` union model hook skipped/succeeded/failed states structurally, but no automated evidence validates the behavior. |

- **F002 (HIGH)** — `/Users/jordanknight/substrate/069-new-worktree/test/contracts/git-worktree-manager.contract.ts:18-86`
  - The contract scaffold only asserts that each method returns an object with a string `status`, plus one conditional happy-path field check.
  - It does not encode the workshop taxonomy (dirty, ahead, diverged, lock-held, no-main-branch, fetch-failed, fast-forward failure, branch/path conflicts) or the fake behaviors that Phase 1 explicitly frames as the executable spec for Phase 2.
  - **Fix**: promote the scaffold into a scenario-driven contract suite that proves blocked states, sync states, create-conflict states, and error propagation/call-recording behavior.

The execution log's summary claims are directionally consistent with the targeted reruns above, but the log itself does not capture the concrete pass lines for every claimed command.

### E.5) Doctrine Compliance

- **F004 (MEDIUM)** — `/Users/jordanknight/substrate/069-new-worktree/docs/c4/components/workspace.md:13-35`
  - The new component diagram still stops at `GitWorktreeResolver` and does not show the write-side `IGitWorktreeManager` / create-worktree path that this phase introduced.
  - The relationships are labeled with generic verbs (`Invokes`, `Composes`, `Loads and saves with`) instead of concrete contracts or entry points, which conflicts with the C4 authoring instructions for this repo.
  - **Fix**: add the mutation-side component(s) and relabel edges with contract names such as `IWorkspaceService`, `IWorkspaceContextResolver`, `IGitWorktreeResolver`, and `IGitWorktreeManager`.

The documented plan deviation keeping workspace contracts in `packages/workflow/src/interfaces/` is explicit in `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md:74-78`, so this review does **not** record a placement violation for the new interface/fake files.

### E.6) Harness Live Validation

N/A — no harness configured at `/Users/jordanknight/substrate/069-new-worktree/docs/project-rules/harness.md`.

## F) Coverage Map

Phase 1 is foundational. UI/navigation outcomes in AC1, AC2, AC7, AC13, and AC14 are future-phase work and are excluded from this phase-confidence score.

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC3 | The creation page shows workspace context and a preview before creation starts. | `IWorkspaceService.previewCreateWorktree()` plus preview types exist, but only as structural contracts. No behavioral preview tests exist yet. | 38 |
| AC4 | Plain feature names are converted into the ordinal-based final worktree name. | `PreviewCreateWorktreeResult` exposes `normalizedSlug`, `ordinal`, and `branchName`, but no test validates allocator behavior. | 38 |
| AC5 | Valid `NNN-name` input preserves the user's naming intent. | The request/result contracts can carry the relevant data, but no automated test proves the preservation rule. | 38 |
| AC6 | Safe canonical main creates from refreshed main state and proceeds to creation. | `IGitWorktreeManager` models preflight/sync/create stages, but the contract suite does not verify the safe-path workflow. | 42 |
| AC8 | Unsafe canonical main states block before creation. | The interface/fake define dirty, ahead, diverged, lock-held, and no-main-branch states, but parity tests do not cover them. | 42 |
| AC9 | Naming/path conflicts preserve input and return refreshed preview guidance. | `CreateWorktreeResult` includes `refreshedPreview`, and `CreateWorktreeGitResult` has `branch-exists` / `path-exists`, but the behavior is untested. | 42 |
| AC10 | Bootstrap uses the repository-defined script from canonical main when present. | `BootstrapStatus` exists as a structural contract only; there is no test or live evidence yet. | 27 |
| AC11 | Missing bootstrap script still creates and opens the worktree without warning. | The contract models `bootstrapStatus.outcome = 'skipped'`, but no test exercises the path. | 27 |
| AC12 | Bootstrap failure is surfaced as warning while still allowing open-worktree behavior. | The `CreateWorktreeResult` union models `status: 'created'` plus informational bootstrap failure, but no test validates the flow. | 27 |

**Overall coverage confidence**: 48%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -10
git --no-pager status --short
git --no-pager ls-files --others --exclude-standard
git --no-pager diff --name-status
python <<'PY'
# assembled tracked and untracked changes into:
# /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-1-establish-workspace-contracts/reviews/_computed.diff
PY
npx tsc --noEmit -p packages/workflow/tsconfig.json
npx vitest run test/contracts/git-worktree-manager.contract.test.ts
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md
**Spec**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-spec.md
**Phase**: Phase 1: Establish Workspace Contracts
**Tasks dossier**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-1-establish-workspace-contracts/tasks.md
**Execution log**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-1-establish-workspace-contracts/execution.log.md
**Review file**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-1-establish-workspace-contracts/reviews/review.phase-1-establish-workspace-contracts.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/069-new-worktree/docs/c4/README.md | Modified | workspace docs | Sync traceability artifacts if this change stays in Phase 1 |
| /Users/jordanknight/substrate/069-new-worktree/docs/c4/components/workspace.md | Created | workspace docs | Update |
| /Users/jordanknight/substrate/069-new-worktree/docs/domains/domain-map.md | Modified | workspace docs | Update |
| /Users/jordanknight/substrate/069-new-worktree/docs/domains/registry.md | Modified | workspace docs | Sync traceability artifacts if this change stays in Phase 1 |
| /Users/jordanknight/substrate/069-new-worktree/docs/domains/workspace/domain.md | Created | workspace | None |
| /Users/jordanknight/substrate/069-new-worktree/packages/shared/src/di-tokens.ts | Modified | workspace (cross-domain) | None |
| /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/fakes/index.ts | Modified | workspace | None |
| /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/fakes/fake-git-worktree-manager.ts | Created | workspace | None |
| /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/index.ts | Modified | workspace public API | Sync traceability artifacts; update if contract types change |
| /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/interfaces/index.ts | Modified | workspace public API | Update if preview contract types change |
| /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/interfaces/git-worktree-manager.interface.ts | Created | workspace | None |
| /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/interfaces/workspace-service.interface.ts | Modified | workspace | Update |
| /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/services/workspace.service.ts | Modified | workspace | Update if preview contract/stub behavior changes |
| /Users/jordanknight/substrate/069-new-worktree/test/contracts/git-worktree-manager.contract.test.ts | Created | workspace | Update |
| /Users/jordanknight/substrate/069-new-worktree/test/contracts/git-worktree-manager.contract.ts | Created | workspace | Update |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/interfaces/workspace-service.interface.ts | Redesign `previewCreateWorktree()` so expected preview failures are returned as typed results instead of requiring throws. | The current contract is happy-path only and is the blocking design gap in this phase. |
| 2 | /Users/jordanknight/substrate/069-new-worktree/test/contracts/git-worktree-manager.contract.ts<br/>/Users/jordanknight/substrate/069-new-worktree/test/contracts/git-worktree-manager.contract.test.ts | Expand the contract scaffold to encode the documented main-state, sync, create-conflict, and error-propagation taxonomy. | Later phases depend on this suite as the fake/real parity guardrail. |
| 3 | /Users/jordanknight/substrate/069-new-worktree/docs/domains/domain-map.md | Add the new write-side workspace contract surface to the workspace node and health summary. | The phase changed the public domain surface, but the map still documents the older read-side-only view. |
| 4 | /Users/jordanknight/substrate/069-new-worktree/docs/c4/components/workspace.md | Add the mutation boundary and relabel edges with concrete contracts / entry points. | The component diagram is out of sync with the newly introduced `IGitWorktreeManager` path. |
| 5 | /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md<br/>/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-1-establish-workspace-contracts/tasks.md | Sync the Domain Manifest and phase task paths with all touched public/doc files in this phase. | The `no orphan files` domain-compliance check currently fails. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/069-new-worktree/docs/domains/domain-map.md | Updated workspace node / health-summary contract inventory |
| /Users/jordanknight/substrate/069-new-worktree/docs/c4/components/workspace.md | Mutation-side component(s) and contract-labeled edges |
| /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md | Domain Manifest entries for `packages/workflow/src/index.ts`, `docs/domains/registry.md`, and `docs/c4/README.md` if those files remain part of Phase 1 |
| /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-1-establish-workspace-contracts/tasks.md | Phase task-path traceability for the touched public/doc surfaces |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md --phase 'Phase 1: Establish Workspace Contracts'
