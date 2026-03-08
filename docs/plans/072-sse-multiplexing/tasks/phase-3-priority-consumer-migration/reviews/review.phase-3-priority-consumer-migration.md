# Code Review: Phase 3: Priority Consumer Migration

**Plan**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md
**Spec**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-spec.md
**Phase**: Phase 3: Priority Consumer Migration
**Date**: 2026-03-08
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Lightweight (phase-level) within Hybrid plan

## A) Verdict

**APPROVE**

**Key failure areas**:
- **Implementation**: `useSSEConnectionState()` still exports a four-state contract, but the migrated provider now only emits `connected` / `disconnected`.
- **Domain compliance**: Touched domain docs, the domain map, and the plan's Domain Manifest are not fully synchronized with the post-multiplexing architecture.
- **Testing**: AC-30 manual verification evidence is too terse to prove the external-edit -> browser-update path from the review artifacts alone.
- **Doctrine**: QuestionPopperProvider uses a raw channel literal instead of the shared `WorkspaceDomain.EventPopper` registry contract.

## B) Summary

The code migration itself is mechanically sound: direct per-consumer `EventSource` lifecycles were removed, the multiplexed `useChannelCallback` hooks were wired in correctly, and the existing business logic paths were preserved. I did not find any material security, performance, or reinvention issues, and a local targeted Vitest run passed `7` files with `138` tests passing and `3` skipped. The main gaps are artifact drift rather than runtime breakage: `question-popper`, `file-browser`, `_platform/events`, and `docs/domains/domain-map.md` still describe the pre-multiplexed topology in several places, and the plan's Domain Manifest does not account for every touched file. Manual verification coverage is generally credible, but AC-30 should be recorded more concretely before this phase is used as the canonical evidence artifact.

## C) Checklist

**Testing Approach: Lightweight**

- [x] Core validation tests present
- [x] Critical paths covered
- [ ] Key verification points documented

Universal (all approaches):
- [x] Only in-scope files reviewed
- [ ] Linters/type checks clean (not re-run in this review)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/045-live-file-events/file-change-provider.tsx:21-24,70-82 | correctness | `useSSEConnectionState()` still advertises `connecting | connected | reconnecting | disconnected`, but the provider now collapses the value to `connected` / `disconnected`. | Either restore the richer state through the multiplexed layer or explicitly narrow the exported contract so the observable behavior matches the type/API documentation. |
| F002 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/domains/file-browser/domain.md:41-145 | domain-md | The File Browser domain doc records the migration in history/dependencies but still omits `045-live-file-events` composition/source details and has no `## Concepts` section despite exposing public contracts. | Update Composition, Source Location, and add a `## Concepts` table that covers the live file-change surface and its multiplexed transport dependency. |
| F003 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md:36-42,75-81,103-104,152-164 | domain-md | The Events domain doc still describes `FileChangeProvider` in the pre-multiplexing model (`EventSource` ownership/lifecycle) even though Phase 3 moved the provider to `useChannelCallback` consumption. | Reconcile ownership/lifecycle text and source/composition notes with the post-multiplexed implementation. |
| F004 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md:25-53 | orphan | The plan's Domain Manifest does not list the changed file-change tests or the changed `question-popper` / `file-browser` domain docs, so not every touched artifact is traceable to an approved domain row. | Add manifest rows for each touched test/doc artifact or remove unintended phase edits. |
| F005 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md:17,52,125,150 | map-currency | `docs/domains/domain-map.md` still advertises the legacy `_platform/events` contract surface and omits the multiplexed SSE edge labels now used by `question-popper` and `file-browser`. | Refresh the `_platform/events` node, the `question-popper` / `file-browser` edge labels, and the health summary row to match Phase 3. |
| F006 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-3-priority-consumer-migration/execution.log.md:75-77 | testing | AC-30 evidence only says that a UI notification appeared through multiplexed SSE; it does not record an external file edit and the resulting browser tree/activity outcome required by the task dossier. | Re-run the manual file-change verification and record the exact file edited plus the observed browser update. |
| F007 | LOW | /Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md:45,65,95,164 | domain-md | The Question Popper domain history is current, but `useQuestionPopper` is still documented as `EventSource`-driven rather than multiplexed via `useChannelCallback`. | Update the Composition/Contracts wording so the hook description matches the current transport model. |
| F008 | LOW | /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/hooks/use-question-popper.tsx:29,143-151 | pattern | `QuestionPopperProvider` subscribes with the raw string `'event-popper'` instead of the shared `WorkspaceDomain.EventPopper` contract already documented in `_platform/events`. | Import and use `WorkspaceDomain.EventPopper` to avoid channel-name drift. |
| F009 | LOW | /Users/jordanknight/substrate/067-question-popper/test/unit/web/features/045-live-file-events/use-file-changes.test.tsx:21-22; /Users/jordanknight/substrate/067-question-popper/test/unit/web/features/045-live-file-events/use-tree-directory-changes.test.tsx:12-13 | contract-imports | The file-change tests import `MultiplexedSSEProvider` from an internal module path instead of the public `apps/web/src/lib/sse` barrel. | Switch the tests to the public SSE barrel so cross-domain test usage follows the same contract boundary as runtime code. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/apps/web/src/features/045-live-file-events/file-change-provider.tsx:21-24,70-82`
  - `useSSEConnectionState()` still promises a four-state surface, but Phase 3 intentionally reduced the emitted values to `connected` / `disconnected` only.
  - This is not currently breaking production code (the phase dossier records zero production consumers), but it is still an observable contract narrowing on an exported hook.
- No material security, performance, or scope-creep issues were found in the migration logic itself. `fetchItems()`, worktree filtering, and hub dispatch behavior were preserved.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | Changed source files still live under the domains declared by the phase dossier (`question-popper`, `file-browser`, `_platform/events`). |
| Contract-only imports | ❌ | `F009`: file-change tests deep-import `MultiplexedSSEProvider` from an internal `_platform/events` module path instead of the public `sse` barrel. |
| Dependency direction | ✅ | Runtime code stays within allowed business -> infrastructure dependencies (`question-popper` / `file-browser` consume `_platform/events`). |
| Domain.md updated | ❌ | `F002`, `F003`, `F007`: touched domain docs were partially updated (history/dependencies) but still contain pre-mux descriptions. |
| Registry current | ✅ | No new domains were introduced; `docs/domains/registry.md` does not require a phase-specific change. |
| No orphan files | ❌ | `F004`: several touched test/doc artifacts are absent from the plan's Domain Manifest. |
| Map nodes current | ❌ | `F005`: `_platform/events` node and health summary still reflect the legacy SSE surface. |
| Map edges current | ❌ | `F005`: `question-popper` and `file-browser` event edges are not labeled with the new multiplexed contracts. |
| No circular business deps | ✅ | No new business-to-business cycle was introduced or documented by this phase. |
| Concepts documented | ⚠️ | `F002`: `file-browser` has a Contracts section but still lacks a `## Concepts` section. |

Additional notes:
- **F002 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/docs/domains/file-browser/domain.md:41-145`
  - History/dependency rows mention the migration, but Composition and Source Location still omit the `045-live-file-events` pieces changed in this phase.
  - `file-browser` also lacks a `## Concepts` section entirely.
- **F003 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md:36-42,75-81,103-104,152-164`
  - `_platform/events` still documents `FileChangeProvider` as if it owns the direct `EventSource` lifecycle.
- **F004 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md:25-53`
  - The Domain Manifest did not anticipate every touched test/doc artifact in this phase.
- **F005 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md:17,52,125,150`
  - The map still shows the legacy `_platform/events` surface (`useSSE`, `FileChangeHub`, `useFileChanges`, `FileChangeProvider`) without the multiplexed Phase 3 relationships.
- **F007 (LOW)** — `/Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md:45,65,95,164`
  - `useQuestionPopper` is still described as EventSource-driven even though the migration is recorded in history.
- **F009 (LOW)** — `/Users/jordanknight/substrate/067-question-popper/test/unit/web/features/045-live-file-events/use-file-changes.test.tsx:21-22`; `/Users/jordanknight/substrate/067-question-popper/test/unit/web/features/045-live-file-events/use-tree-directory-changes.test.tsx:12-13`
  - Tests use an internal module path for `MultiplexedSSEProvider` instead of the public barrel.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| No new major component introduced in phase scope | None | N/A | proceed |

No genuine duplication was found. This phase is a transport swap onto already-existing `_platform/events` contracts.

### E.4) Testing & Evidence

**Coverage confidence**: 82%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-21 | 93 | `/Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-3-priority-consumer-migration/reviews/_computed.diff:205-329` removes direct `EventSource('/api/events/event-popper')` lifecycle code from `use-question-popper.tsx` and replaces it with `useChannelCallback('event-popper', ...)`; `/Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-3-priority-consumer-migration/execution.log.md:21-29` records the migration plus `86/86` question-popper tests passing. |
| AC-22 | 95 | `/Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-3-priority-consumer-migration/reviews/_computed.diff:1-204` swaps `FileChangeProvider` from direct `EventSource` management to `useChannelCallback(WorkspaceDomain.FileChanges, ...)`; `/Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-3-priority-consumer-migration/execution.log.md:37-45` records `35/35` file-change tests passing. |
| AC-23 | 87 | `/Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-3-priority-consumer-migration/reviews/_computed.diff:377-785` keeps file-change behavioral assertions while swapping the transport/test wrapper; the local targeted test run passed `138` tests with `3` skipped across the reviewed suites. |
| AC-27 | 72 | `/Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-3-priority-consumer-migration/execution.log.md:77` records connection count dropping from `3 -> 1` per tab, but the review artifacts do not include a screenshot or network capture. |
| AC-29 | 84 | `/Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-3-priority-consumer-migration/execution.log.md:75` records `cg question ask --text "Quick confirm - SSE mux working?" --type confirm` -> UI notification -> answer -> CLI response in `3s`. |
| AC-30 | 46 | `/Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-3-priority-consumer-migration/execution.log.md:76` only says the UI notification was verified through multiplexed SSE; it does not document an external file edit and the resulting browser tree/activity-log update. |
| AC-31 | 98 | `/Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-3-priority-consumer-migration/execution.log.md:67` records `pnpm test` with `5173 passed, 80 skipped, 0 failures`; a local targeted run also passed `7` files and `138` tests (`3` skipped) in `4.05s`, with unrelated `tsconfig-paths` parse warnings from standalone build artifacts. |

### E.5) Doctrine Compliance

- Project rules were present and reviewed: `/Users/jordanknight/substrate/067-question-popper/docs/project-rules/rules.md`, `/Users/jordanknight/substrate/067-question-popper/docs/project-rules/idioms.md`, `/Users/jordanknight/substrate/067-question-popper/docs/project-rules/architecture.md`, and `/Users/jordanknight/substrate/067-question-popper/docs/project-rules/constitution.md`.
- No major layer-boundary or architecture violations were found in the runtime code.
- **F008 (LOW)** — `/Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/hooks/use-question-popper.tsx:29,143-151`
  - The hook uses the raw `'event-popper'` literal rather than the shared `WorkspaceDomain.EventPopper` contract even though the channel registry already exists in `@chainglass/shared`.

### E.6) Harness Live Validation

N/A — no harness configured (`/Users/jordanknight/substrate/067-question-popper/docs/project-rules/harness.md` is absent).

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-21 | QuestionPopperProvider uses multiplexed channel instead of direct EventSource | `_computed.diff` shows `useChannelCallback('event-popper', ...)` replacing the old `EventSource('/api/events/event-popper')` lifecycle; execution log records `86/86` related tests passing. | 93 |
| AC-22 | FileChangeProvider uses multiplexed channel instead of direct EventSource | `_computed.diff` shows `useChannelCallback(WorkspaceDomain.FileChanges, ...)` replacing direct connection/reconnect logic; execution log records `35/35` file-change tests passing. | 95 |
| AC-23 | FileChangeHub + useFileChanges API unchanged | Updated tests retain behavioral assertions while only changing wrapper/fake transport wiring; local targeted test run passed. | 87 |
| AC-27 | A workspace tab opens exactly one SSE connection | Execution log records `3 -> 1` connections per tab, but no screenshot/network artifact is attached. | 72 |
| AC-29 | Question popper works end-to-end | Execution log records a full CLI ask -> UI notification -> answer -> CLI receive cycle. | 84 |
| AC-30 | File change events continue working end-to-end | Execution log references multiplexed UI notification only; explicit external-edit -> browser-update evidence is missing. | 46 |
| AC-31 | All existing tests continue passing | Execution log records full `pnpm test` success, and this review re-ran targeted suites successfully. | 98 |

**Overall coverage confidence**: 82%

## G) Commands Executed

```bash
git --no-pager status --short
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -10
git --no-pager diff -- apps/web/src/features/067-question-popper/hooks/use-question-popper.tsx apps/web/src/features/045-live-file-events/file-change-provider.tsx test/unit/web/features/045-live-file-events/use-file-changes.test.tsx test/unit/web/features/045-live-file-events/use-tree-directory-changes.test.tsx docs/domains/question-popper/domain.md docs/domains/file-browser/domain.md docs/domains/_platform/events/domain.md > /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-3-priority-consumer-migration/reviews/_computed.diff
git --no-pager diff --name-status -- apps/web/src/features/067-question-popper/hooks/use-question-popper.tsx apps/web/src/features/045-live-file-events/file-change-provider.tsx test/unit/web/features/045-live-file-events/use-file-changes.test.tsx test/unit/web/features/045-live-file-events/use-tree-directory-changes.test.tsx docs/domains/question-popper/domain.md docs/domains/file-browser/domain.md docs/domains/_platform/events/domain.md
pnpm vitest run --reporter=verbose test/unit/question-popper/api-routes.test.ts test/contracts/question-popper.contract.test.ts test/unit/question-popper/ui-components.test.tsx test/unit/question-popper/chain-resolver.test.tsx test/unit/question-popper/cli-commands.test.ts test/integration/question-popper/cli-blocking.test.ts test/unit/web/features/045-live-file-events/use-file-changes.test.tsx test/unit/web/features/045-live-file-events/use-tree-directory-changes.test.tsx
# Structured inspection also used view/rg plus 5 parallel review subagents.
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: APPROVE

**Plan**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md
**Spec**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-spec.md
**Phase**: Phase 3: Priority Consumer Migration
**Tasks dossier**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-3-priority-consumer-migration/tasks.md
**Execution log**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-3-priority-consumer-migration/execution.log.md
**Review file**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-3-priority-consumer-migration/reviews/review.phase-3-priority-consumer-migration.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/hooks/use-question-popper.tsx | Reviewed | question-popper | Optional: switch to `WorkspaceDomain.EventPopper` |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/045-live-file-events/file-change-provider.tsx | Reviewed | file-browser | Optional: align exported connection-state contract with emitted values |
| /Users/jordanknight/substrate/067-question-popper/test/unit/web/features/045-live-file-events/use-file-changes.test.tsx | Reviewed | file-browser | Optional: import `MultiplexedSSEProvider` via `apps/web/src/lib/sse` barrel |
| /Users/jordanknight/substrate/067-question-popper/test/unit/web/features/045-live-file-events/use-tree-directory-changes.test.tsx | Reviewed | file-browser | Optional: import `MultiplexedSSEProvider` via `apps/web/src/lib/sse` barrel |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md | Reviewed | question-popper | Recommended: update `useQuestionPopper` transport wording |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/file-browser/domain.md | Reviewed | file-browser | Recommended: add live-file-events composition/source coverage and `## Concepts` |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md | Reviewed | _platform/events | Recommended: update post-multiplexing ownership/lifecycle wording |

### Required Fixes (if REQUEST_CHANGES)

None — review approved. Treat the findings above as follow-up notes rather than blockers.

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md | `useQuestionPopper` still reads as EventSource-driven in Composition/Contracts wording. |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/file-browser/domain.md | Missing `045-live-file-events` composition/source coverage and missing `## Concepts` section. |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md | Stale `FileChangeProvider` ownership/lifecycle wording after multiplexed migration. |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md | `_platform/events` node/edge labels and health summary still show legacy event contracts. |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md | Domain Manifest needs rows for touched tests and touched `question-popper` / `file-browser` domain docs. |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-3-priority-consumer-migration/execution.log.md | AC-30 manual verification needs explicit external-edit -> browser-update evidence. |

### Next Step

/plan-5-v2-phase-tasks-and-brief --phase "Phase 4: GlobalState Re-enablement" --plan /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md
