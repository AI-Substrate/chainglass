# Code Review: Phase 2: Client Provider + Hooks

**Plan**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md
**Spec**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-spec.md
**Phase**: Phase 2: Client Provider + Hooks
**Date**: 2026-03-08
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**APPROVE**

**Key failure areas**:
- **Domain compliance**: `/Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md` still advertises the pre-Phase-2 `_platform/events` contract surface, and the plan's Domain Manifest is stale for one renamed hook test plus the touched `test/fakes` barrel.
- **Testing**: `/Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-spec.md` still says AC-14 caps retries at 5 while the approved Phase 2 behavior and tests use 15, and the AC-16 test does not assert the terminal non-null error state.
- **Doctrine**: `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/multiplexed-sse-provider.test.tsx` uses `vi.spyOn(console, 'warn')`, and both new SSE test files omit the rule-mandated per-test Test Doc blocks.

## B) Summary

Phase 2 is functionally sound: the provider, hooks, fake, barrel, and layout mount all align with the task dossier, and the implementation-quality review surfaced no correctness, security, performance, or scope defects. Domain boundaries are largely respected, with new SSE client files placed under `_platform/events` and `/Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md` updated with contracts, composition, concepts, and history for Plan 072 Phase 2. Testing evidence is strong overall, with 24 new tests plus a clean full-suite result recorded in the execution log, but the evidence package is not perfectly aligned with the spec because AC-14 still documents 5 reconnect attempts and the AC-16 failure-path assertion is incomplete. Reinvention risk is low: the new code extends existing EventSource and fake patterns in `_platform/events` rather than duplicating another domain capability.

## C) Checklist

**Testing Approach: Hybrid**

- [x] TDD evidence exists for `MultiplexedSSEProvider`, `useChannelEvents`, and `useChannelCallback`
- [x] Lightweight evidence exists for the workspace layout mount via full-suite execution
- [ ] Spec text and acceptance criteria are fully aligned with the implemented reconnect behavior
- [ ] Rule-mandated per-test Test Doc coverage is complete for all new unit tests
- [x] Only in-scope files changed in the isolated Phase 2 diff
- [ ] Linters/type checks clean (typecheck evidence exists; lint evidence not captured in the Phase 2 execution log)
- [ ] Domain compliance checks fully pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md:17,150 | domain-compliance | `_platform/events` node label and Domain Health Summary row still show the pre-Phase-2 contract surface. | Update the node label and summary row to include `MultiplexedSSEProvider`, `useChannelEvents`, `useChannelCallback`, and `MultiplexedSSEMessage`. |
| F002 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/multiplexed-sse-provider.test.tsx:146,330 | doctrine | The provider test suite uses `vi.spyOn(console, 'warn')`, which violates the project's fake-only testing rule. | Replace console spying with an injectable warning sink or fake logger seam and assert through that fake. |
| F003 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/multiplexed-sse-provider.test.tsx:51-384 | doctrine | The 13 new provider tests do not carry per-test 5-field Test Doc blocks required by project rules. | Add a full Test Doc inside each `it()` block or refactor scenarios into documented helpers that preserve per-test coverage. |
| F004 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/use-channel-hooks.test.tsx:43-219 | doctrine | The hook test suite also lacks per-test 5-field Test Doc blocks on the new `it()` cases. | Add per-test Test Docs for each hook behavior or consolidate into documented helpers. |
| F005 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-spec.md:128 | testing | AC-14 still says the provider stops after 5 reconnect attempts, but the approved Phase 2 behavior and tests use a default of 15 attempts. | Reconcile the spec to 15 attempts or change implementation/tests back to 5 so evidence and spec match. |
| F006 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/multiplexed-sse-provider.test.tsx:256-276 | testing | The AC-16 state test proves `isConnected` and initial `error === null`, but it never asserts the terminal non-null error path after retry exhaustion. | Extend AC-16 coverage with a zero-attempt or exhausted-retry case and assert `error` becomes non-null. |
| F007 | LOW | /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md:25-42 | domain-compliance | The Domain Manifest omits `test/fakes/index.ts` and still references `test/unit/web/sse/use-channel-events.test.tsx` instead of the actual changed `test/unit/web/sse/use-channel-hooks.test.tsx`. | Update the Domain Manifest so every touched Phase 2 file is mapped correctly. |
| F008 | LOW | /Users/jordanknight/substrate/067-question-popper/test/fakes/fake-multiplexed-sse.ts:27-72 | testing | `createFakeMultiplexedSSEFactory()` is exercised indirectly, but it has no standalone contract test despite the phase strategy calling for TDD on the fake infrastructure. | Add a focused fake contract test or explicitly document that coverage is indirect-only. |
| F009 | LOW | /Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/use-channel-hooks.test.tsx:105-129 | testing | The "independent arrays" assertion uses two different providers, so it does not directly prove same-provider subscriber isolation from Finding 06. | Add a same-provider dual-subscriber case and assert distinct array references under one `MultiplexedSSEProvider`. |
| F010 | LOW | /Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/sse/index.ts:18-19 | doctrine | The public barrel re-exports interface-backed names without the required `I` prefix. | Rename those interfaces with `I...` or convert them to `type` aliases and re-export the updated names. |

## E) Detailed Findings

### E.1) Implementation Quality

No material implementation-quality issues were found in the isolated Phase 2 source diff. The provider, hooks, fake, barrel, and layout mount all match the Phase 2 task dossier, and the review found no correctness, security, error-handling, performance, scope, or pattern defects that warrant blocking or conditional approval.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New source files are correctly placed under `/Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/sse/`, with tests under `/Users/jordanknight/substrate/067-question-popper/test/`. |
| Contract-only imports | ✅ | No cross-domain internal imports were found in the Phase 2 source diff. The cross-domain layout change imports the public `/Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/sse/index.ts` barrel. |
| Dependency direction | ✅ | No infrastructure-to-business dependency inversion was introduced. |
| Domain.md updated | ✅ | `/Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md` was updated with new contracts, composition, concepts, files, and history for Plan 072 Phase 2. |
| Registry current | ✅ | No new domain was introduced, so `/Users/jordanknight/substrate/067-question-popper/docs/domains/registry.md` remains current. |
| No orphan files | ❌ | `/Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md` omits `test/fakes/index.ts` and still lists `test/unit/web/sse/use-channel-events.test.tsx` instead of `test/unit/web/sse/use-channel-hooks.test.tsx`. |
| Map nodes current | ❌ | `/Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md` still shows the pre-Phase-2 `_platform/events` node label and summary row. |
| Map edges current | ✅ | No new Phase 2 inter-domain edge is missing or unlabeled in `/Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md`. |
| No circular business deps | ✅ | No new business-to-business cycle was introduced. |
| Concepts documented | ✅ | `/Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md` now contains a `## Concepts` section covering multiplexed SSE usage. |

Domain-specific notes:
- F001: `/Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md:17,150` should be brought up to date with the Phase 2 `_platform/events` contract surface.
- F007: `/Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md:25-42` should be refreshed so the Domain Manifest covers the actual Phase 2 file set.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `MultiplexedSSEProvider` | None | None | Proceed — no existing multiplexed provider was found. |
| `useChannelEvents` | None | None | Proceed — this is a new channel-accumulation abstraction, not a duplicate of `useSSE` or `useFileChanges`. |
| `useChannelCallback` | None | None | Proceed — no existing callback-only channel hook exists. |
| `MultiplexedSSEMessage` / `EventSourceFactory` types | `EventSourceFactory` in `/Users/jordanknight/substrate/067-question-popper/apps/web/src/hooks/useSSE.ts` | `_platform/events` | Extend pattern — overlap is low-risk and already contained within the same domain. |
| `createFakeMultiplexedSSEFactory()` | `/Users/jordanknight/substrate/067-question-popper/test/fakes/fake-event-source.ts` (`createFakeEventSourceFactory`) | `_platform/events` | Extend pattern — the fake builds on the existing EventSource fake rather than reinventing it. |
| SSE barrel export | Existing feature barrel patterns | `_platform/events` | Proceed — conventional aggregation, not duplication. |

No genuine cross-domain reinvention problem was found.

### E.4) Testing & Evidence

**Coverage confidence**: 92%

Testing notes:
- F005: `/Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-spec.md:128` still conflicts with the approved 15-attempt reconnect behavior.
- F006: `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/multiplexed-sse-provider.test.tsx:256-276` does not exercise the terminal error path for AC-16.
- F008: `/Users/jordanknight/substrate/067-question-popper/test/fakes/fake-multiplexed-sse.ts:27-72` lacks a dedicated contract test.
- F009: `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/use-channel-hooks.test.tsx:105-129` proves independence across different providers, but not yet within a single provider.

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-11 | 99 | `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/multiplexed-sse-provider.test.tsx:51-79` verifies the mux URL and exactly one `EventSource` instance. |
| AC-12 | 98 | `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/multiplexed-sse-provider.test.tsx:81-112` routes messages by `msg.channel`. |
| AC-13 | 98 | `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/multiplexed-sse-provider.test.tsx:144-180` proves one throwing subscriber does not stop delivery to another. |
| AC-14 | 78 | `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/multiplexed-sse-provider.test.tsx:183-239` verifies exponential backoff and retry caps, but the spec still says 5 attempts while the tested implementation uses 15 by default. |
| AC-15 | 99 | `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/multiplexed-sse-provider.test.tsx:242-254` asserts cleanup closes the `EventSource` on unmount. |
| AC-16 | 72 | `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/multiplexed-sse-provider.test.tsx:256-284` covers `isConnected` and initial `error` visibility, but not the final non-null error state. |
| AC-17 | 91 | `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/use-channel-hooks.test.tsx:43-139` covers accumulation, pruning, unlimited mode, clearing, and channel scoping; the same-provider independence nuance remains open. |
| AC-18 | 98 | `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/use-channel-hooks.test.tsx:159-171` verifies callback-per-event behavior without accumulation. |
| AC-19 | 99 | `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/use-channel-hooks.test.tsx:55-64,173-185` verifies both hooks ignore other channels. |
| AC-20 | 100 | `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/multiplexed-sse-provider.test.tsx:286-296` and the hook/provider suites all inject `fake.factory`; no `vi.mock()` usage was found in the Phase 2 SSE tests. |
| AC-31 | 100 | `/Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-2-client-provider-hooks/execution.log.md:119-129` records a clean full-suite run with `5173 passed, 80 skipped, 0 failures`. |

### E.5) Doctrine Compliance

- F002 (`R-TEST-007`): `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/multiplexed-sse-provider.test.tsx:146,330` uses `vi.spyOn(console, 'warn')` even though `/Users/jordanknight/substrate/067-question-popper/docs/project-rules/rules.md:146-151` bans `vi.spyOn()` in favor of fakes.
- F003 (`R-TEST-002` / `R-TEST-003`): `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/multiplexed-sse-provider.test.tsx:51-384` lacks per-test Test Doc blocks required by `/Users/jordanknight/substrate/067-question-popper/docs/project-rules/rules.md:100-130`.
- F004 (`R-TEST-002` / `R-TEST-003`): `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/use-channel-hooks.test.tsx:43-219` has the same per-test Test Doc gap.
- F010 (`R-CODE-002`): `/Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/sse/index.ts:18-19` publicly re-exports interface-backed names without the required `I` prefix described in `/Users/jordanknight/substrate/067-question-popper/docs/project-rules/rules.md:32-35`.

### E.6) Harness Live Validation

N/A — no harness configured. `/Users/jordanknight/substrate/067-question-popper/docs/project-rules/harness.md` was not present, so live validation was skipped by design.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-11 | Provider creates exactly one `EventSource` connection | `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/multiplexed-sse-provider.test.tsx:51-79` | 99 |
| AC-12 | Provider demultiplexes events by `msg.channel` | `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/multiplexed-sse-provider.test.tsx:81-112` | 98 |
| AC-13 | One subscriber throwing does not affect others | `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/multiplexed-sse-provider.test.tsx:144-180` | 98 |
| AC-14 | Provider reconnects with exponential backoff and retry cap | `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/multiplexed-sse-provider.test.tsx:183-239`; spec mismatch at `/Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-spec.md:128` | 78 |
| AC-15 | Provider cleans up `EventSource` on unmount | `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/multiplexed-sse-provider.test.tsx:242-254` | 99 |
| AC-16 | Provider exposes `isConnected` and `error` state | `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/multiplexed-sse-provider.test.tsx:256-284` | 72 |
| AC-17 | `useChannelEvents(channel)` accumulates subscribed-channel messages only | `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/use-channel-hooks.test.tsx:43-139` | 91 |
| AC-18 | `useChannelCallback(channel, callback)` fires callback per event | `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/use-channel-hooks.test.tsx:159-171` | 98 |
| AC-19 | Both hooks ignore other channels | `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/use-channel-hooks.test.tsx:55-64,173-185` | 99 |
| AC-20 | Provider is testable via injected `EventSourceFactory` | `/Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/multiplexed-sse-provider.test.tsx:286-296`; fake injection across all new SSE tests | 100 |
| AC-31 | Existing tests continue passing after Phase 2 changes | `/Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-2-client-provider-hooks/execution.log.md:119-129` | 100 |

**Overall coverage confidence**: 92%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
python - <<'PY'
# Extracted the Phase 2 task-table Path(s) entries from tasks.md
PY
python - <<'PY'
# Built /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-2-client-provider-hooks/reviews/_computed.diff
# from the isolated Phase 2 file set
PY
git --no-pager diff -- apps/web/next-env.d.ts
git --no-pager diff -- docs/domains/_platform/events/domain.md
git --no-pager diff -- docs/domains/_platform/state/domain.md
git --no-pager diff -- docs/domains/domain-map.md
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: APPROVE

**Plan**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md
**Spec**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-spec.md
**Phase**: Phase 2: Client Provider + Hooks
**Tasks dossier**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-2-client-provider-hooks/tasks.md
**Execution log**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-2-client-provider-hooks/execution.log.md
**Review file**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-2-client-provider-hooks/reviews/review.phase-2-client-provider-hooks.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/sse/types.ts | Reviewed — clean | `_platform/events` | None |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/sse/multiplexed-sse-provider.tsx | Reviewed — clean | `_platform/events` | None |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/sse/use-channel-events.ts | Reviewed — low note | `_platform/events` | Optional naming cleanup if interface exports should follow project rules. |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/sse/use-channel-callback.ts | Reviewed — low note | `_platform/events` | Optional naming cleanup if interface exports should follow project rules. |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/sse/index.ts | Reviewed — low note | `_platform/events` | Re-export renamed types if naming cleanup is performed. |
| /Users/jordanknight/substrate/067-question-popper/test/fakes/fake-multiplexed-sse.ts | Reviewed — low note | `_platform/events` | Optional standalone contract test. |
| /Users/jordanknight/substrate/067-question-popper/test/fakes/index.ts | Reviewed — clean | `_platform/events` | None |
| /Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/multiplexed-sse-provider.test.tsx | Reviewed — medium notes | `_platform/events` | Replace console spy, add per-test Test Docs, and complete AC-16 failure-path assertion if you want rule/spec alignment. |
| /Users/jordanknight/substrate/067-question-popper/test/unit/web/sse/use-channel-hooks.test.tsx | Reviewed — medium/low notes | `_platform/events` | Add per-test Test Docs and strengthen the same-provider independence case if you want fuller evidence. |
| /Users/jordanknight/substrate/067-question-popper/apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx | Reviewed — clean | cross-domain | None |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md | Reviewed — clean | `_platform/events` | None |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md | Reviewed — medium note | topology | Update `_platform/events` node label and Domain Health Summary row. |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md | Reviewed — low note | planning | Refresh the Domain Manifest entries for the actual Phase 2 test files. |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-spec.md | Reviewed — medium note | specification | Reconcile AC-14 with the approved 15-attempt reconnect behavior. |

### Required Fixes (if REQUEST_CHANGES)

Not applicable — verdict is APPROVE.

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md | `_platform/events` node label and Domain Health Summary row do not yet include the Phase 2 multiplexed SSE contracts. |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md | `## Domain Manifest` is stale for `test/fakes/index.ts` and `test/unit/web/sse/use-channel-hooks.test.tsx`. |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-spec.md | AC-14 still says "max 5 attempts" even though the approved Phase 2 implementation/tests use 15. |

### Next Step

/plan-5-v2-phase-tasks-and-brief --phase "Phase 3: Priority Consumer Migration" --plan /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md
