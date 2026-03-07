# Code Review: Phase 1: Service Layer & Server Actions

**Plan**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/add-files-plan.md
**Spec**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/add-files-spec.md
**Phase**: Phase 1: Service Layer & Server Actions
**Date**: 2026-03-07
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

The phase is well-scoped and heavily tested at the service level, but two security-critical gaps remain: the new server actions trust a client-supplied worktree root, and `createFolderService()` can create through a symlinked ancestor when recursive mkdir is used against a missing parent chain.

**Key failure areas**:
- **Implementation**: `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/services/file-mutation-actions.ts` uses recursive mkdir after an insufficient ancestor validation path, which can escape the workspace through a symlinked ancestor.
- **Reinvention**: `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/services/file-mutation-actions.ts` introduces a new path-security helper instead of extending the existing same-domain security utility pattern.
- **Testing**: `/Users/jordanknight/substrate/068-add-files/apps/web/app/actions/file-actions.ts` has no lightweight wiring tests for auth/DI/trusted-root behavior, so the root-trust regression landed untested.

## B) Summary

Phase 1 stays inside the intended `file-browser` boundary, updates the matching domain documentation, and provides solid TDD evidence for the new validation and mutation services (`38/38` targeted tests passing). Domain placement, dependency direction, registry/map currency, and doctrine/rules compliance are all in good shape. Approval is blocked by two security issues: the new server actions use a caller-controlled `worktreePath` as the trust boundary, and `createFolderService()` uses `mkdir(..., { recursive: true })` after only checking the immediate parent path, which allows a symlinked ancestor to redirect creation outside the workspace. The remaining non-blocking concerns are missing lightweight server-action tests and a low-priority duplication of path-security logic inside the same domain.

## C) Checklist

**Testing Approach: Hybrid**

- [x] TDD evidence recorded for the service layer
- [ ] Lightweight server-action wiring checks present
- [x] Phase-relevant acceptance criteria mapped to concrete evidence

Universal (all approaches):
- [x] Only in-scope files changed
- [x] Linters/type checks clean (execution log records `just fft` PASS)
- [x] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/068-add-files/apps/web/app/actions/file-actions.ts:232-301 | security | The new CRUD server actions accept a client-supplied `worktreePath` and pass it directly into path validation, so an authenticated caller can choose the root that `IPathResolver` treats as trusted. | Resolve a `trustedRoot` from `slug` via `IWorkspaceService.getInfo()` (as `fileExists()`/`pathExists()` already do) and pass that trusted root into the mutation services. |
| F002 | HIGH | /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/services/file-mutation-actions.ts:156-170 | security | `createFolderService()` uses `mkdir(..., { recursive: true })` after `resolveAndValidatePath()` skips `realpath()` whenever the immediate parent path does not already exist; a symlinked ancestor can therefore redirect creation outside the worktree. | Validate the actual parent directory separately and create only the final folder segment (non-recursive), or walk the nearest existing ancestor and `realpath()`-check it before any recursive creation. |
| F003 | MEDIUM | /Users/jordanknight/substrate/068-add-files/apps/web/app/actions/file-actions.ts:232-301 | testing | Phase 1 promised lightweight server-action wiring tests, but none were added for auth, DI delegation, trusted-root resolution, or malicious `worktreePath` inputs. | Add focused server-action tests covering `requireAuth()`, DI resolution, trusted-root derivation, and rejection/remapping of hostile roots. |
| F004 | LOW | /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/services/file-mutation-actions.ts:81-119 | reinvention | The new `resolveAndValidatePath()` helper duplicates same-domain path-security logic that already exists in `file-actions.ts` and `upload-file.ts`, increasing drift risk. | Consolidate file-browser path-security checks into a single reusable helper after the blocking fixes land. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)** — `/Users/jordanknight/substrate/068-add-files/apps/web/app/actions/file-actions.ts:232-301`
  - The four new server actions (`createFile`, `createFolder`, `deleteItem`, `renameItem`) call their services with the caller-provided `worktreePath` unchanged.
  - In the same file, `/Users/jordanknight/substrate/068-add-files/apps/web/app/actions/file-actions.ts:159-219` already shows the safer pattern: resolve `trustedRoot` from `slug` with `IWorkspaceService`, then apply `resolvePath()`/`realpath()` against that trusted root.
  - As written, `requireAuth()` authenticates the user, but it does not stop an authenticated caller from choosing an arbitrary filesystem root as the base for mutation operations.

- **F002 (HIGH)** — `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/services/file-mutation-actions.ts:156-170`
  - `resolveAndValidatePath()` only calls `realpath()` on `dirname(absolutePath)` when that exact path already exists (`:102-117`).
  - `createFolderService()` then calls `fileSystem.mkdir(resolved.absolutePath, { recursive: true })`, which will happily create through any symlinked ancestor even if the immediate parent path did not exist at validation time.
  - A local reproduction with Node's `fs.mkdir(target, { recursive: true })` confirmed that creating `worktree/link/nested/created` materializes `outside/nested/created` when `worktree/link` is a symlink to `outside`.

Targeted service suites still pass:
- `pnpm vitest run test/unit/web/features/041-file-browser/validate-filename.test.ts test/unit/web/features/041-file-browser/file-mutation-actions.test.ts` → `38/38` tests passing.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New code lives under `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/` and `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/`; `/Users/jordanknight/substrate/068-add-files/apps/web/app/actions/file-actions.ts` is the planned Next.js server-action exception. |
| Contract-only imports | ✅ | New services import only `IFileSystem`, `IPathResolver`, and `PathSecurityError` from `@chainglass/shared`, plus local file-browser code. |
| Dependency direction | ✅ | All new dependencies remain business → infrastructure (`file-browser` → `_platform/file-ops`, `_platform/auth`). |
| Domain.md updated | ✅ | `/Users/jordanknight/substrate/068-add-files/docs/domains/file-browser/domain.md` updates boundary, composition, source locations, and history for Plan 068 Phase 1. |
| Registry current | ✅ | `/Users/jordanknight/substrate/068-add-files/docs/domains/registry.md` needs no change because this phase introduced no new domains. |
| No orphan files | ✅ | All phase files in the diff align with the plan manifest and expected phase artifacts. |
| Map nodes current | ✅ | `/Users/jordanknight/substrate/068-add-files/docs/domains/domain-map.md` still represents `file-browser` accurately; no new domain nodes were needed. |
| Map edges current | ✅ | No new cross-domain contract edges were introduced; existing labels remain explicit. |
| No circular business deps | ✅ | The phase introduces no new business-to-business dependency edges. |
| Concepts documented | N/A | This phase changed internal composition, not the public `file-browser` contract surface. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `validateFileName()` | None | file-browser | Proceed |
| `createFileService()` | None | file-browser | Proceed |
| `createFolderService()` | None | file-browser | Proceed |
| `deleteItemService()` | None | file-browser | Proceed |
| `renameItemService()` | None | file-browser | Proceed |
| `resolveAndValidatePath()` | `readFileAction()` path-security block in `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/services/file-actions.ts` and path validation in `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/services/upload-file.ts` | file-browser | LOW — extend existing helper pattern in a follow-up |

### E.4) Testing & Evidence

**Coverage confidence**: 78%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-08 | 55% | Traversal is covered by service tests in `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/file-mutation-actions.test.ts`, but trusted-root enforcement is untested in the server actions and the symlinked-ancestor recursive-create case is missing. |
| AC-09 | 95% | Duplicate-name cases are covered for create and rename flows in `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/file-mutation-actions.test.ts`. |
| AC-13 | 70% | `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/validate-filename.test.ts` covers 20 validation cases, but client-side invocation of the shared validator is deferred to later phases. |
| P1-T005–T008 | 95% | The targeted Phase 1 service suites pass (`38/38`), and `/Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-1-service-layer-server-actions/execution.log.md` records RED→GREEN→REFACTOR completion. |
| P1-T009 | 60% | `/Users/jordanknight/substrate/068-add-files/apps/web/app/actions/file-actions.ts` contains the new exports and `/Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-1-service-layer-server-actions/execution.log.md` records the wiring, but there are no dedicated action tests. |

Testing violations:
- **F003 (MEDIUM)** — Lightweight server-action tests promised by the plan were not implemented.

### E.5) Doctrine Compliance

No doctrine violations were found.

- Services depend on interfaces, not concrete adapters.
- Tests use `FakeFileSystem` and `FakePathResolver` instead of mocks/spies.
- New test files follow centralized placement and include full 5-field Test Docs.

### E.6) Harness Live Validation

N/A — no harness configured. `docs/project-rules/harness.md` is absent, so live validation was not run.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-08 | Path traversal and symlink escape are rejected | Service tests cover traversal rejections; helper uses `resolvePath()` + `realpath()`; review found missing trusted-root enforcement in server actions and a recursive-create symlink-ancestor escape. | 55% |
| AC-09 | Duplicate names are rejected without overwrite | Duplicate create/rename tests in `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/file-mutation-actions.test.ts`; service code checks `exists()` before mutation. | 95% |
| AC-13 | Invalid names are rejected before write | `validate-filename.test.ts` covers empty/reserved/invalid-char cases; services reject invalid names before filesystem I/O. | 70% |
| P1-D1 | Service-layer CRUD foundation is delivered with TDD | Execution log plus `38/38` targeted tests passing for validation + mutation services. | 95% |
| P1-D2 | Authenticated server actions are wired to the services | New exports exist in `/Users/jordanknight/substrate/068-add-files/apps/web/app/actions/file-actions.ts`; execution log records completion, but no dedicated wiring tests exist. | 60% |

**Overall coverage confidence**: 78%

## G) Commands Executed

```bash
git --no-pager diff --stat && printf '\n---STAGED---\n' && git --no-pager diff --staged --stat && printf '\n---STATUS---\n' && git --no-pager status --short && printf '\n---LOG---\n' && git --no-pager log --oneline -12
mkdir -p docs/plans/068-add-files/reviews && git --no-pager diff --find-renames 7fb7e98..HEAD > docs/plans/068-add-files/reviews/_computed.diff
pnpm vitest run test/unit/web/features/041-file-browser/validate-filename.test.ts test/unit/web/features/041-file-browser/file-mutation-actions.test.ts
node - <<'NODE'
  // reproduced that fs.mkdir(target, { recursive: true }) follows a symlinked ancestor
NODE
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/add-files-plan.md
**Spec**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/add-files-spec.md
**Phase**: Phase 1: Service Layer & Server Actions
**Tasks dossier**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-1-service-layer-server-actions/tasks.md
**Execution log**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-1-service-layer-server-actions/execution.log.md
**Review file**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/reviews/review.phase-1-service-layer-server-actions.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/068-add-files/apps/web/app/actions/file-actions.ts | modified | file-browser | Fix F001, add wiring tests (F003) |
| /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/lib/validate-filename.ts | created | file-browser | None |
| /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/services/file-mutation-actions.ts | created | file-browser | Fix F002; follow up on F004 |
| /Users/jordanknight/substrate/068-add-files/docs/domains/file-browser/domain.md | modified | file-browser | None |
| /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/add-files-plan.md | created | plan-artifact | None |
| /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/add-files-spec.md | created | plan-artifact | None |
| /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/exploration.md | created | plan-artifact | None |
| /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-1-service-layer-server-actions/execution.log.md | created | plan-artifact | None |
| /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-1-service-layer-server-actions/tasks.fltplan.md | created | plan-artifact | None |
| /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-1-service-layer-server-actions/tasks.md | created | plan-artifact | None |
| /Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/file-mutation-actions.test.ts | created | file-browser | Add regression coverage for F002 |
| /Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/validate-filename.test.ts | created | file-browser | None |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/068-add-files/apps/web/app/actions/file-actions.ts | Resolve a trusted worktree root from `slug` before calling `createFileService`, `createFolderService`, `deleteItemService`, and `renameItemService`. | The current actions trust a client-controlled base path, so workspace containment is not actually enforced at the server-action boundary. |
| 2 | /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/services/file-mutation-actions.ts | Rework folder creation so ancestor validation cannot be bypassed by `mkdir(..., { recursive: true })` when an existing ancestor is a symlink. | Recursive mkdir can create outside the worktree through a symlinked ancestor even though the immediate parent path was missing during validation. |
| 3 | /Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/file-mutation-actions.test.ts | Add a regression case for `createFolderService()` with a symlinked ancestor and a missing leaf parent; add server-action wiring tests under a new Phase 1 action test file. | The current evidence does not cover either blocking scenario, which is why both issues landed undetected. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| — | None. Domain docs are current for Phase 1. |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/add-files-plan.md --phase 'Phase 1: Service Layer & Server Actions'
