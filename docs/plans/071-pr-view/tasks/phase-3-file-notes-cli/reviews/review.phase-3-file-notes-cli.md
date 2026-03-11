# Code Review: Phase 3: File Notes CLI

**Plan**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md
**Spec**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-spec.md
**Phase**: Phase 3: File Notes CLI
**Date**: 2026-03-09
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid (CLI commands expected to follow TDD)

## A) Verdict

**REQUEST_CHANGES**

Shared file-listing logic currently treats every open note target as a file target, so `cg notes files` is not reliable once workflow or agent-run notes exist.

**Key failure areas**:
- **Implementation**: Shared `listFilesWithNotes()` logic does not constrain results to file-linked notes, so `cg notes files` can return non-file targets and wrong counts.
- **Domain compliance**: The file-notes domain map health summary still marks CLI as a future consumer, and the C4 component diagram has not caught up with the Phase 3 shared-adapter/CLI additions.
- **Testing**: The documented `just test-feature 071` evidence misses the new CLI/contract suites, and no mixed-link-type test covers the AC-30 failure mode.
- **Doctrine**: The CLI bypasses the planned DI seam and the new CLI tests use module/spying mocks despite the project’s fake-only policy.

## B) Summary

Phase 3 ships the core `cg notes` command group and the targeted CLI/contract tests I ran are green, but I am requesting changes because the shared file-listing path does not constrain results to file-linked notes. In a mixed dataset, `cg notes files` and the shared file-listing APIs can report workflow or agent-run targets as if they were files, which makes AC-30 unreliable. Domain placement and cross-domain imports are otherwise sound, and the file-notes domain doc is current, but the domain map health summary and C4 component view lag the shipped CLI integration. The phase also deviates from the planned DI/testing seam: the command constructs `JsonlNoteService` directly, and the new CLI tests rely on `vi.mock()` / `vi.spyOn()` even though the project rules call for fake-based tests.

## C) Checklist

**Testing Approach: Hybrid (CLI commands expected to follow TDD)**

- [x] CLI and contract validation tests exist for the command surface
- [ ] Mixed link-type file-listing behavior is covered and passing
- [ ] CLI tests preserve the project’s fake-only policy (no `vi.mock()` / `vi.spyOn()`)
- [ ] The documented phase verification command actually covers the CLI/contract test surface
- [x] Only phase-scoped files were reviewed against the phase dossier
- [ ] Linters/type checks are clean for the full phase surface
- [ ] Domain compliance checks fully pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/note-reader.ts:57-68 | correctness | `listFilesWithNotes()` returns every open target, so `cg notes files` can surface workflow/agent-run targets instead of only file paths. | Filter file-listing logic to `linkType: 'file'`, update the CLI count query to match, and add mixed-link-type tests for both real and fake services. |
| F002 | MEDIUM | /Users/jordanknight/substrate/071-pr-view/apps/cli/src/commands/notes.command.ts:84-94 | pattern | The CLI bypasses the declared NOTE_SERVICE seam and constructs `JsonlNoteService` directly, which leaves the token unused and forced the new CLI tests into module mocking. | Introduce a worktree-bound note-service factory/provider in the CLI container, resolve through that seam in `notes.command.ts`, and rewrite the CLI tests to use fakes instead of `vi.mock()` / `vi.spyOn()`. |
| F003 | MEDIUM | /Users/jordanknight/substrate/071-pr-view/justfile:93-95 | testing | The documented verification command `just test-feature 071` does not cover the new CLI/contract tests because it only selects test paths containing `071`. | Record and use an explicit test command for the CLI/contract suite (or rename/move the tests so the plan-scoped command actually includes them) and update the phase evidence accordingly. |
| F004 | LOW | /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md:160 | domain | The file-notes health summary still labels CLI as a future consumer even though Phase 3 ships `registerNotesCommands`. | Update the domain map (and corresponding C4 component diagram) so the file-notes documentation reflects the active Phase 3 CLI consumer and shared adapter/command components. |

## E) Detailed Findings

### E.1) Implementation Quality

#### F001 — `listFilesWithNotes()` returns every open target, so `cg notes files` can surface workflow/agent-run targets instead of only file paths.

- **File**: /Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/note-reader.ts:57-68
- **Severity**: HIGH
- **Recommendation**: Filter file-listing logic to `linkType: 'file'`, update the CLI count query to match, and add mixed-link-type tests for both real and fake services.

The shared file-listing helper currently reads all open notes and turns their `target` fields into the returned list without constraining `linkType`.
That means any future or pre-seeded workflow / agent-run note will be reported as a "file" by `cg notes files`, `fetchFilesWithNotes()`, and `GET /api/file-notes?mode=files`.
The same assumption is duplicated in `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/fakes/fake-note-service.ts:98-103`, and the current contract/unit tests only exercise file-note fixtures, so the bug is not caught today.

No additional material security, error-handling, or performance regressions stood out in the reviewed Phase 3 surface.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | All created files sit under the declared file-notes shared/CLI/web trees or the expected central test/doc locations. |
| Contract-only imports | ✅ | No app-to-app imports were introduced; CLI and web consume `@chainglass/shared` and infrastructure contracts only. |
| Dependency direction | ✅ | file-notes remains a business domain consuming only infrastructure providers (`auth`, `panel-layout`, `workspace-url`, `events`, `sdk`). |
| Domain.md updated | ✅ | `/Users/jordanknight/substrate/071-pr-view/docs/domains/file-notes/domain.md` records Phase 3 history, composition, contracts, and CLI concepts. |
| Registry current | ✅ | `/Users/jordanknight/substrate/071-pr-view/docs/domains/registry.md` includes the active `file-notes` entry. |
| No orphan files | ✅ | Every file in the computed manifest maps back to the phase dossier / domain manifest. |
| Map nodes current | ❌ | `/Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md:160` still labels CLI as a future consumer, so the health summary lags Phase 3. |
| Map edges current | ✅ | All file-notes edges remain labeled and point only to infrastructure domains. |
| No circular business deps | ✅ | No new business-to-business cycle is introduced by this phase. |
| Concepts documented | ✅ | The `§ Concepts` table covers the new CLI list/files/add/complete workflows. |

- **LOW** — The file-notes health summary still labels CLI as a future consumer even though Phase 3 ships `registerNotesCommands`. (/Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md:160)

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| Commander note command group | None | None | Proceed |
| JsonlNoteService shared adapter | None | None | Proceed |
| Shared note reader | None | None | Proceed |
| Shared note writer | None | None | Proceed |
| .chainglass-aware context error helper | None | None | Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 78%

**Violations / caveats**:
- **HIGH** — `listFilesWithNotes()` returns every open target, so `cg notes files` can surface workflow/agent-run targets instead of only file paths. (/Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/note-reader.ts:57-68)
- **MEDIUM** — The documented verification command `just test-feature 071` does not cover the new CLI/contract tests because it only selects test paths containing `071`. (/Users/jordanknight/substrate/071-pr-view/justfile:93-95)
- **MEDIUM** — CLI/contract validation had to be run explicitly during review with `pnpm vitest run test/unit/cli/notes-command.test.ts test/unit/cli/command-helpers.test.ts test/contracts/note-service.contract.test.ts`.

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-28 | 90% | `/Users/jordanknight/substrate/071-pr-view/test/unit/cli/notes-command.test.ts:104-142` plus review run `pnpm vitest run test/unit/cli/notes-command.test.ts test/unit/cli/command-helpers.test.ts test/contracts/note-service.contract.test.ts` (41 tests passed). |
| AC-29 | 90% | `/Users/jordanknight/substrate/071-pr-view/test/unit/cli/notes-command.test.ts:151-173` verifies the file filter path end-to-end. |
| AC-30 | 45% | `/Users/jordanknight/substrate/071-pr-view/test/unit/cli/notes-command.test.ts:246-317` only covers file-note fixtures; `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/note-reader.ts:61-68` currently leaks non-file targets. |
| AC-31 | 88% | `/Users/jordanknight/substrate/071-pr-view/test/unit/cli/notes-command.test.ts:328-439` covers default author, line metadata, addressee, and JSON output. |
| AC-32 | 90% | `/Users/jordanknight/substrate/071-pr-view/test/unit/cli/notes-command.test.ts:450-512` covers success, not-found, and JSON completion output. |
| AC-33 | 90% | `/Users/jordanknight/substrate/071-pr-view/test/unit/cli/notes-command.test.ts:182-202` verifies the list JSON envelope (`errors`, `notes`, `count`). |
| AC-38 | 55% | `/Users/jordanknight/substrate/071-pr-view/apps/cli/src/commands/notes.command.ts:119-131` implements `--link-type`, and `/Users/jordanknight/substrate/071-pr-view/test/contracts/note-service.contract.ts:128-153` covers service-level filtering, but there is no CLI-level mixed-link-type coverage. |

### E.5) Doctrine Compliance

#### F002 — The CLI bypasses the declared NOTE_SERVICE seam and constructs `JsonlNoteService` directly, which leaves the token unused and forced the new CLI tests into module mocking.

- **File**: /Users/jordanknight/substrate/071-pr-view/apps/cli/src/commands/notes.command.ts:84-94
- **Severity**: MEDIUM
- **Recommendation**: Introduce a worktree-bound note-service factory/provider in the CLI container, resolve through that seam in `notes.command.ts`, and rewrite the CLI tests to use fakes instead of `vi.mock()` / `vi.spyOn()`.

`/Users/jordanknight/substrate/071-pr-view/packages/shared/src/di-tokens.ts:33-35` declares `NOTE_SERVICE`, and the task dossier expects DI registration,
but `/Users/jordanknight/substrate/071-pr-view/apps/cli/src/lib/container.ts:427-429` explicitly documents that the service is not registered and `/Users/jordanknight/substrate/071-pr-view/apps/cli/src/commands/notes.command.ts:91` does `new JsonlNoteService(context.worktreePath)`.
The fallout is visible in `/Users/jordanknight/substrate/071-pr-view/test/unit/cli/notes-command.test.ts:21-42,50-55,81-87,523-524` and `/Users/jordanknight/substrate/071-pr-view/test/unit/cli/command-helpers.test.ts:73-106`, which rely on `vi.mock()` / `vi.spyOn()` even though the project rules require fake-based tests.

### E.6) Harness Live Validation

N/A — no harness configured (`docs/project-rules/harness.md` is absent in this repository state).

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-28 | `cg notes list` shows all notes | `/Users/jordanknight/substrate/071-pr-view/test/unit/cli/notes-command.test.ts:104-142` plus review run `pnpm vitest run test/unit/cli/notes-command.test.ts test/unit/cli/command-helpers.test.ts test/contracts/note-service.contract.test.ts` (41 tests passed). | 90% |
| AC-29 | `cg notes list --file <path>` filters to a specific file | `/Users/jordanknight/substrate/071-pr-view/test/unit/cli/notes-command.test.ts:151-173` verifies the file filter path end-to-end. | 90% |
| AC-30 | `cg notes files` lists files with notes | `/Users/jordanknight/substrate/071-pr-view/test/unit/cli/notes-command.test.ts:246-317` only covers file-note fixtures; `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/note-reader.ts:61-68` currently leaks non-file targets. | 45% |
| AC-31 | `cg notes add` creates a note | `/Users/jordanknight/substrate/071-pr-view/test/unit/cli/notes-command.test.ts:328-439` covers default author, line metadata, addressee, and JSON output. | 88% |
| AC-32 | `cg notes complete <id>` marks complete | `/Users/jordanknight/substrate/071-pr-view/test/unit/cli/notes-command.test.ts:450-512` covers success, not-found, and JSON completion output. | 90% |
| AC-33 | `cg notes list --json` outputs machine-readable JSON | `/Users/jordanknight/substrate/071-pr-view/test/unit/cli/notes-command.test.ts:182-202` verifies the list JSON envelope (`errors`, `notes`, `count`). | 90% |
| AC-38 | CLI/API support link-type filtering | `/Users/jordanknight/substrate/071-pr-view/apps/cli/src/commands/notes.command.ts:119-131` implements `--link-type`, and `/Users/jordanknight/substrate/071-pr-view/test/contracts/note-service.contract.ts:128-153` covers service-level filtering, but there is no CLI-level mixed-link-type coverage. | 55% |

**Overall coverage confidence**: 78%

## G) Commands Executed

```bash
git --no-pager status --short
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -10
python - <<'PY'  # computed /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-3-file-notes-cli/reviews/_computed.diff and manifest
...
PY
just test-feature 071 && pnpm --filter @chainglass/shared build
pnpm vitest run test/unit/cli/notes-command.test.ts test/unit/cli/command-helpers.test.ts test/contracts/note-service.contract.test.ts
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md
**Spec**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-spec.md
**Phase**: Phase 3: File Notes CLI
**Tasks dossier**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-3-file-notes-cli/tasks.md
**Execution log**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-3-file-notes-cli/execution.log.md
**Review file**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-3-file-notes-cli/reviews/review.phase-3-file-notes-cli.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/071-pr-view/apps/cli/src/bin/cg.ts | modified | file-notes (CLI) | None |
| /Users/jordanknight/substrate/071-pr-view/apps/cli/src/commands/command-helpers.ts | modified | file-notes (CLI) | Review with FT-002 |
| /Users/jordanknight/substrate/071-pr-view/apps/cli/src/commands/index.ts | modified | file-notes (CLI) | None |
| /Users/jordanknight/substrate/071-pr-view/apps/cli/src/commands/notes.command.ts | created | file-notes (CLI) | FT-001, FT-002 |
| /Users/jordanknight/substrate/071-pr-view/apps/cli/src/lib/container.ts | modified | file-notes (CLI) | FT-002 |
| /Users/jordanknight/substrate/071-pr-view/apps/web/app/actions/notes-actions.ts | created | file-notes (web) | Re-test after FT-001 |
| /Users/jordanknight/substrate/071-pr-view/apps/web/app/api/file-notes/route.ts | created | file-notes (web) | Re-test after FT-001 |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/types.ts | created | file-notes (web) | None |
| /Users/jordanknight/substrate/071-pr-view/packages/shared/package.json | modified | file-notes (shared) | None |
| /Users/jordanknight/substrate/071-pr-view/packages/shared/src/di-tokens.ts | modified | file-notes (shared) | Review with FT-002 |
| /Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/index.ts | created | file-notes (shared) | None |
| /Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/jsonl-note-service.ts | created | file-notes (shared) | Re-test after FT-001 |
| /Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/note-reader.ts | created | file-notes (shared) | FT-001 |
| /Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/note-writer.ts | created | file-notes (shared) | None |
| /Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/types.ts | created | file-notes (shared) | None |
| /Users/jordanknight/substrate/071-pr-view/test/contracts/note-service.contract.ts | created | file-notes (tests) | FT-001 |
| /Users/jordanknight/substrate/071-pr-view/test/contracts/note-service.contract.test.ts | created | file-notes (tests) | Re-run after FT-001 |
| /Users/jordanknight/substrate/071-pr-view/test/unit/cli/command-helpers.test.ts | modified | file-notes (tests) | FT-002 |
| /Users/jordanknight/substrate/071-pr-view/test/unit/cli/notes-command.test.ts | created | file-notes (tests) | FT-001, FT-002 |
| /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-file-notes/note-reader.test.ts | created | file-notes (tests) | FT-001 |
| /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-file-notes/note-writer.test.ts | created | file-notes (tests) | None |
| /Users/jordanknight/substrate/071-pr-view/docs/c4/README.md | modified | file-notes (docs) | Review with FT-004 |
| /Users/jordanknight/substrate/071-pr-view/docs/c4/components/file-notes.md | created | file-notes (docs) | FT-004 |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md | modified | file-notes (docs) | FT-004 |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/file-notes/domain.md | created | file-notes (docs) | None |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/registry.md | modified | file-notes (docs) | None |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| FT-001 | /Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/note-reader.ts; /Users/jordanknight/substrate/071-pr-view/packages/shared/src/fakes/fake-note-service.ts; /Users/jordanknight/substrate/071-pr-view/apps/cli/src/commands/notes.command.ts; /Users/jordanknight/substrate/071-pr-view/test/contracts/note-service.contract.ts; /Users/jordanknight/substrate/071-pr-view/test/unit/cli/notes-command.test.ts; /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-file-notes/note-reader.test.ts | Restrict file-listing behavior to `linkType: 'file'` and add mixed-link-type coverage for both the real and fake implementations. | AC-30 currently fails for mixed datasets because workflow / agent-run note targets are treated as file paths. |
| FT-002 | /Users/jordanknight/substrate/071-pr-view/apps/cli/src/commands/notes.command.ts; /Users/jordanknight/substrate/071-pr-view/apps/cli/src/lib/container.ts; /Users/jordanknight/substrate/071-pr-view/packages/shared/src/di-tokens.ts; /Users/jordanknight/substrate/071-pr-view/test/unit/cli/notes-command.test.ts; /Users/jordanknight/substrate/071-pr-view/test/unit/cli/command-helpers.test.ts | Restore a runtime-resolved note-service seam so commands do not instantiate `JsonlNoteService` directly, then rewrite the CLI tests to use fakes instead of module/spying mocks. | The current implementation bypasses the planned DI pattern and breaks the project’s fake-only testing rule. |
| FT-003 | /Users/jordanknight/substrate/071-pr-view/justfile; /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-3-file-notes-cli/tasks.md; /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-3-file-notes-cli/execution.log.md | Use and record a verification command that explicitly exercises the Phase 3 CLI/contract suites, or rename/move the tests so `just test-feature 071` includes them. | The current evidence command misses the main Phase 3 deliverable and overstates verification quality. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md | Mark CLI as an active file-notes consumer in the health summary row. |
| /Users/jordanknight/substrate/071-pr-view/docs/c4/components/file-notes.md | Add the Phase 3 shared adapter / CLI command components so the L3 diagram matches the current domain composition. |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md --phase 'Phase 3: File Notes CLI'
