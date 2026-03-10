# Code Review: Phase 1: File Notes Data Layer

**Plan**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md
**Spec**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-spec.md
**Phase**: Phase 1: File Notes Data Layer
**Date**: 2026-03-08
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid — TDD for data layer, Lightweight for UI

## A) Verdict

**REQUEST_CHANGES**

The phase establishes useful scaffolding and its writer/reader unit tests pass, but it does not yet meet several explicit Phase 1 commitments: the core `targetMeta` contract is not typed per `linkType`, the required contract/API-route test coverage is missing, and `docs/domains/domain-map.md` was not updated for the new domain.

**Key failure areas**:
- **Implementation**: `targetMeta` is not constrained by `linkType`, and the reader/route still allow invalid or hidden states.
- **Domain compliance**: `domain-map.md` omits the new `file-notes` domain and the phase manifest/docs drift from the actual file set.
- **Reinvention**: No blocking duplication was found, but the writer reimplements atomic-write behavior that already exists elsewhere.
- **Testing**: Contract tests and API route tests are missing, and Test Doc coverage is overstated by the phase artifacts.
- **Doctrine**: Per-test Test Doc blocks are missing, and the new domain was not reflected in C4 artifacts.

## B) Summary

Phase 1 delivers the basic file-notes scaffolding, persistence helpers, API surface, and 22 passing writer/reader unit tests, so the implementation is not empty. The most material gap is architectural: `packages/shared/src/file-notes/types.ts` does not enforce link-type-specific `targetMeta`, which directly misses T001 / AC-36 and weakens the public contract. Testing evidence is incomplete for a TDD-scoped phase: there is no `INoteService` contract suite, no API route coverage, and the current unit tests do not contain the per-test Test Doc blocks required by project rules. Domain traceability is also incomplete because `docs/domains/domain-map.md` was not updated for `file-notes`, the plan manifest no longer matches the implemented file set, and the C4 docs were not extended for the new domain.

## C) Checklist

**Testing Approach: Hybrid — TDD for data layer and API routes**

- [x] Core validation unit tests exist for `note-writer.ts` and `note-reader.ts`
- [ ] Contract tests exist for `INoteService` fake/real parity
- [ ] API route tests cover auth, worktree validation, CRUD flows, and `linkType` filtering
- [ ] Per-test Test Doc blocks are present for every `it()` case
- [ ] Only declared/in-scope files are reflected in the phase manifest and artifacts
- [ ] Linters/type checks are clean (shared build passed, but repo-wide `just typecheck` is currently failing in unrelated baseline areas)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/types.ts:27-31,45-53,88-91` | correctness | `targetMeta` is detached from `linkType`, so invalid combinations compile and can be persisted. | Model `Note` / `CreateNoteInput` as a discriminated union or generic keyed by `linkType`; remove the catch-all `Record<string, unknown>`. |
| F002 | HIGH | `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/interfaces/note-service.interface.ts:25-49`; `/Users/jordanknight/substrate/071-pr-view/test/contracts/note-service.contract.ts` (missing); `/Users/jordanknight/substrate/071-pr-view/test/contracts/note-service.contract.test.ts` (missing) | testing | `INoteService` shipped without the required fake-vs-real contract suite, so T006 and R-TEST-008 are not satisfied. | Add a JSONL-backed `INoteService` implementation/factory and run a shared contract suite against it and `FakeNoteService`. |
| F003 | HIGH | `/Users/jordanknight/substrate/071-pr-view/apps/web/app/api/file-notes/route.ts:1-158` | testing | The API route has no TDD coverage for auth, worktree validation, CRUD paths, or `linkType` filtering even though the plan requires TDD for the data/API layers. | Add GET/POST/PATCH/DELETE route/integration tests and capture the green output in `execution.log.md`. |
| F004 | HIGH | `/Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md:1-151` | domain compliance | `domain-map.md` was not updated for the new `file-notes` domain, so the node, health summary row, and `_platform/auth` dependency edge are missing. | Add the `file-notes` node, labeled auth dependency edge(s), and a Domain Health Summary row. |
| F005 | MEDIUM | `/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/lib/note-reader.ts:25-50` | error-handling | `readNotes()` converts any outer read failure into `[]`, masking permission and I/O problems as “no notes”. | Only special-case ENOENT and malformed lines; rethrow or surface other filesystem errors. |
| F006 | MEDIUM | `/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/lib/note-reader.ts:56-58`; `/Users/jordanknight/substrate/071-pr-view/docs/domains/file-notes/domain.md:41-43,53-54` | correctness | `listFilesWithNotes()` hardcodes open-note semantics, which conflicts with the broader “files that have notes” public-contract / AC-30 wording. | Rename/scope the helper to open-note targets only, or add an all-notes/status-aware variant and align the docs. |
| F007 | MEDIUM | `/Users/jordanknight/substrate/071-pr-view/apps/web/app/api/file-notes/route.ts:59-64,84-89,111-119` | correctness | The route accepts unchecked enum/action values, so invalid `linkType`, `author`, `to`, `completedBy`, or unknown PATCH actions can be persisted or silently misrouted. | Validate query/body enums and action variants at runtime and reject malformed requests with `400`. |
| F008 | MEDIUM | `/Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-file-notes/note-reader.test.ts:37-131`; `/Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-file-notes/note-writer.test.ts:45-204` | doctrine | The unit tests only have file-level headers; they do not include the required 5-field Test Doc block inside each `it()` case. | Add case-specific Test Doc blocks (Why, Contract, Usage Notes, Quality Contribution, Worked Example) inside every test. |
| F009 | MEDIUM | `/Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md:30-77`; `/Users/jordanknight/substrate/071-pr-view/docs/domains/file-notes/domain.md:45-54` | domain compliance | The phase manifest and Concepts table lag the actual implementation: shared file-notes types, shared barrel/package-export changes, and key contract concepts are not fully reflected. | Update the Domain Manifest and Concepts table to match the implemented file set and contract surface. |
| F010 | LOW | `/Users/jordanknight/substrate/071-pr-view/docs/c4/README.md:23-49`; `/Users/jordanknight/substrate/071-pr-view/docs/c4/components/file-notes.md` (missing) | doctrine | The new domain was not added to the C4 component documentation or README quick links, despite repo guidance to keep C4 docs in sync with domain additions. | Add a `docs/c4/components/file-notes.md` L3 component diagram and link it from `docs/c4/README.md`. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 — High**: `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/types.ts:27-31,45-53,88-91` uses a permissive `NoteTargetMeta` union plus `Record<string, unknown>`, so the type system cannot prevent mismatched metadata such as `{ nodeId }` on a file note. This misses T001 and AC-36.
- **F005 — Medium**: `/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/lib/note-reader.ts:25-50` swallows non-ENOENT read failures and returns an empty array, making storage failures indistinguishable from “no notes exist”.
- **F006 — Medium**: `/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/lib/note-reader.ts:56-58` hardcodes open-only semantics into a generic helper whose public name and documentation imply “all files with notes”.
- **F007 — Medium**: `/Users/jordanknight/substrate/071-pr-view/apps/web/app/api/file-notes/route.ts:59-64,84-89,111-119` does not validate enum/action values at runtime, so malformed authenticated requests can persist invalid note shapes or fall through to the wrong PATCH branch.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New files live in appropriate `file-notes`, `shared`, `test`, and `docs/domains` trees. |
| Contract-only imports | ✅ | No blocking cross-domain import violation was found beyond the established auth/requireAuth pattern already used elsewhere in the app. |
| Dependency direction | ✅ | `file-notes` depends on shared contracts and `_platform/auth`; no infrastructure-to-business inversion or business-cycle code path was introduced. |
| Domain.md updated | ✅ | `/Users/jordanknight/substrate/071-pr-view/docs/domains/file-notes/domain.md` exists and includes Purpose, Boundary, Contracts, Composition, Dependencies, and History. |
| Registry current | ✅ | `/Users/jordanknight/substrate/071-pr-view/docs/domains/registry.md` contains the `File Notes` row. |
| No orphan files | ❌ | The plan manifest omits several changed files, and the required contract-test files from T006 are still missing. |
| Map nodes current | ❌ | `/Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md` has no `file-notes` node or health-summary row. |
| Map edges current | ❌ | The new domain’s dependency on `_platform/auth` is not labeled on the map. |
| No circular business deps | ✅ | No new business-domain cycle was introduced. |
| Concepts documented | ⚠️ | A Concepts section exists, but it does not explicitly document all new contract entry points such as `INoteService` and the shared file-notes type surface. |

Additional domain-compliance notes:
- **F004 — High**: `domain-map.md` is stale for Plan 071 Phase 1 and must be updated in the same change set as the new domain.
- **F009 — Medium**: `pr-view-plan.md` still treats `apps/web/src/features/071-file-notes/types.ts` as the canonical type location and omits the shared file-notes barrels/package exports/tests that actually changed.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| File Notes shared types | None | — | Proceed |
| `INoteService` | None | — | Proceed |
| `FakeNoteService` | None | — | Proceed |
| Note writer | `atomicWriteFile()` in `packages/workgraph/src/services/atomic-file.ts` | `_platform/file-ops` | Review — consider reuse/extension if the helper can be consumed cleanly |
| Note reader | None | — | Proceed |
| File Notes API route | Activity-log route worktree/auth/validation pattern | `activity-log` | Proceed — pattern reuse is appropriate |
| File Notes server actions | None | — | Proceed |

Overall anti-reinvention assessment: **no blocking duplication found**. The only notable reuse opportunity is the existing atomic-write helper, but that is a medium follow-up rather than a release blocker for this phase.

### E.4) Testing & Evidence

**Coverage confidence**: 44%

Evidence observed during review:
- `XDG_CONFIG_HOME=~/.config just test-feature 071` passed **22 tests** across `note-writer.test.ts` and `note-reader.test.ts`.
- `pnpm --filter @chainglass/shared build` completed successfully.
- `XDG_CONFIG_HOME=~/.config just typecheck` failed, but the failures are in unrelated pre-existing areas (`dev/test-graphs`, `packages/mcp-server`, `packages/positional-graph`) rather than the new file-notes files.

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-25 | 35% | Underlying `readNotes()` filter support exists for `status`, `to`, and `linkType`, and unit tests exercise those filters. The overlay behavior is out-of-phase and there are no API route tests. |
| AC-34 | 70% | `NOTES_DIR` / `NOTES_FILE` target `.chainglass/data/notes.jsonl`, and writer/reader tests verify creation plus JSONL persistence behavior. The “committed to git” portion is not separately evidenced. |
| AC-35 | 58% | `NoteLinkType` declares `file`, `workflow`, and `agent-run`; unit tests exercise `file` and `workflow`. There is no dedicated `agent-run` coverage or contract parity suite. |
| AC-36 | 25% | The type model does not actually bind `targetMeta` to `linkType`, and the tests only demonstrate example payloads rather than enforcing discriminated shapes. |
| AC-37 | 45% | The JSONL model is schemaless and generic, suggesting new link types can be added without migration, but there is no dedicated extensibility/contract test proving that claim. |
| AC-38 | 30% | `GET /api/file-notes` accepts `linkType` and `readNotes()` filters by `linkType`; however, there are no API route tests and no CLI coverage in this phase. |

Testing-specific violations:
- **F002 — High**: Missing `INoteService` contract suite / runner.
- **F003 — High**: Missing API route TDD coverage.
- **F008 — Medium**: Missing per-test Test Doc blocks.
- **Evidence mismatch — Medium**: `tasks.md` / `execution.log.md` describe contract tests and complete Test Doc coverage that are not present in the repository state.

### E.5) Doctrine Compliance

- **R-TEST-008 — High**: `/Users/jordanknight/substrate/071-pr-view/packages/shared/src/interfaces/note-service.interface.ts` added a new interface without the required contract-suite factory/runner (`/Users/jordanknight/substrate/071-pr-view/test/contracts/note-service.contract.ts` and `.test.ts` are missing).
- **R-TEST-002 / R-TEST-003 — Medium**: `/Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-file-notes/note-reader.test.ts` and `note-writer.test.ts` do not include per-`it()` Test Doc blocks.
- **Repository C4 guidance — Low**: The new domain does not yet have an accompanying L3 C4 component file or README quick link (`/Users/jordanknight/substrate/071-pr-view/docs/c4/components/file-notes.md` is missing).

### E.6) Harness Live Validation

N/A — no harness configured. `docs/project-rules/harness.md` does not exist, and the phase artifacts explicitly state that no harness is configured for this work.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-25 | Notes overlay supports filtering by status, addressee, and link type | `readNotes()` implements the underlying filters and unit tests cover data-level filtering; no UI/API proof yet | 35% |
| AC-34 | All note data persists in `.chainglass/data/notes.jsonl` and is committed to git | Constants + writer/reader tests verify the JSONL location and persistence behavior; no git-commit proof in evidence | 70% |
| AC-35 | `linkType` supports `file`, `workflow`, and `agent-run` | `NoteLinkType` defines all three values; tests cover `file` and `workflow` only | 58% |
| AC-36 | Each link type has its own `targetMeta` shape | Current type model is permissive and not discriminated by `linkType`; no enforcement evidence | 25% |
| AC-37 | New link types require no schema migration | Schemaless JSONL storage suggests this, but no contract/extensibility test proves it | 45% |
| AC-38 | CLI and API routes support filtering by link type | `readNotes()` + GET route support `linkType`; no route tests and no CLI implementation/evidence in this phase | 30% |

**Overall coverage confidence**: 44%

## G) Commands Executed

```bash
git --no-pager diff --stat && printf '
---STAGED---
' && git --no-pager diff --staged --stat && printf '
---LOG---
' && git --no-pager log --oneline -10
git --no-pager status --short
set -euo pipefail; cd /Users/jordanknight/substrate/071-pr-view; mkdir -p /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-1-file-notes-data-layer/reviews; : > /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-1-file-notes-data-layer/reviews/_computed.diff; for f in <phase file list>; do git --no-pager diff -- "$f" || git --no-pager diff --no-index -- /dev/null "$f"; done >> /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-1-file-notes-data-layer/reviews/_computed.diff
XDG_CONFIG_HOME=~/.config just test-feature 071
cd /Users/jordanknight/substrate/071-pr-view && pnpm --filter @chainglass/shared build && XDG_CONFIG_HOME=~/.config just typecheck
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md
**Spec**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-spec.md
**Phase**: Phase 1: File Notes Data Layer
**Tasks dossier**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-1-file-notes-data-layer/tasks.md
**Execution log**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-1-file-notes-data-layer/execution.log.md
**Review file**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-1-file-notes-data-layer/reviews/review.phase-1-file-notes-data-layer.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/types.ts | Concern | file-notes/shared | Enforce `linkType` → `targetMeta` typing |
| /Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/index.ts | Reviewed | file-notes/shared | None once type model is fixed |
| /Users/jordanknight/substrate/071-pr-view/packages/shared/src/interfaces/note-service.interface.ts | Concern | file-notes/shared | Add real parity coverage for `INoteService` |
| /Users/jordanknight/substrate/071-pr-view/packages/shared/src/interfaces/index.ts | Reviewed | shared | Keep export after contract suite lands |
| /Users/jordanknight/substrate/071-pr-view/packages/shared/src/fakes/fake-note-service.ts | Reviewed | file-notes/shared | Re-run against future contract suite |
| /Users/jordanknight/substrate/071-pr-view/packages/shared/src/fakes/index.ts | Reviewed | shared | None |
| /Users/jordanknight/substrate/071-pr-view/packages/shared/package.json | Reviewed | shared | Export path is fine |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/types.ts | Reviewed | file-notes | Keep in sync with shared type changes |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/index.ts | Reviewed | file-notes | None |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/lib/note-writer.ts | Reviewed | file-notes | Optional atomic-write reuse follow-up |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/lib/note-reader.ts | Concern | file-notes | Surface non-ENOENT read failures; clarify file-list semantics |
| /Users/jordanknight/substrate/071-pr-view/apps/web/app/api/file-notes/route.ts | Concern | file-notes | Add runtime validation and route tests |
| /Users/jordanknight/substrate/071-pr-view/apps/web/app/actions/notes-actions.ts | Reviewed | file-notes | Re-test after storage/error-model changes |
| /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-file-notes/note-writer.test.ts | Concern | test | Add per-test Test Doc blocks |
| /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-file-notes/note-reader.test.ts | Concern | test | Add per-test Test Doc blocks |
| /Users/jordanknight/substrate/071-pr-view/test/contracts/note-service.contract.ts | Missing expected | test/contracts | Create contract factory |
| /Users/jordanknight/substrate/071-pr-view/test/contracts/note-service.contract.test.ts | Missing expected | test/contracts | Create contract runner |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/file-notes/domain.md | Concern | docs/domains | Add missing concept entries / align helper semantics |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/registry.md | Reviewed | docs/domains | Row present |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md | Concern | docs/domains | Add `file-notes` node, edge labels, and summary row |
| /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md | Concern | plan/docs | Update Domain Manifest to match actual Phase 1 file set |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/types.ts | Make `targetMeta` depend on `linkType` via a discriminated union or equivalent typed model. | Current contract misses AC-36 / T001 and permits invalid metadata combinations. |
| 2 | /Users/jordanknight/substrate/071-pr-view/packages/shared/src/interfaces/note-service.interface.ts; /Users/jordanknight/substrate/071-pr-view/test/contracts/note-service.contract.ts; /Users/jordanknight/substrate/071-pr-view/test/contracts/note-service.contract.test.ts | Add the real-vs-fake `INoteService` contract suite and parity runner. | Phase 1 currently lacks the required contract-test evidence for a new shared interface. |
| 3 | /Users/jordanknight/substrate/071-pr-view/apps/web/app/api/file-notes/route.ts and new route tests under `/Users/jordanknight/substrate/071-pr-view/test/` | Add runtime payload validation and TDD coverage for auth, validation, CRUD, and filtering. | The API surface is untested and currently accepts malformed enum/action values. |
| 4 | /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md | Add the `file-notes` node, labeled `_platform/auth` dependency, and Domain Health Summary row. | Domain-map validation is mandatory and currently stale for the new domain. |
| 5 | /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/lib/note-reader.ts; /Users/jordanknight/substrate/071-pr-view/docs/domains/file-notes/domain.md | Surface non-ENOENT read failures and make file-list semantics explicit (`open` only vs `all notes`). | Current behavior can hide storage failures and conflicts with broader contract wording. |
| 6 | /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-file-notes/note-reader.test.ts; /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-file-notes/note-writer.test.ts | Add per-test 5-field Test Doc blocks and align task/execution artifacts with what is actually implemented. | R-TEST-002/003 are not satisfied and the current artifacts overstate coverage. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md | `file-notes` node, auth edge labels, Domain Health Summary row |
| /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md | Domain Manifest entries for shared file-notes types, shared-barrel/package-export changes, and Phase 1 test files |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/file-notes/domain.md | Additional concept rows for `INoteService` and the shared file-notes type surface; clarified file-list semantics |
| /Users/jordanknight/substrate/071-pr-view/docs/c4/components/file-notes.md | New L3 C4 component diagram for the domain |
| /Users/jordanknight/substrate/071-pr-view/docs/c4/README.md | Quick-link entry for the new `file-notes` C4 component doc |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md --phase 'Phase 1: File Notes Data Layer'
