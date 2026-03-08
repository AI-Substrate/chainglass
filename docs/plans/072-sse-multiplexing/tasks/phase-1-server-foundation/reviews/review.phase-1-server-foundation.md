# Code Review: Phase 1: Server Foundation

**Plan**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md
**Spec**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-spec.md
**Phase**: Phase 1: Server Foundation
**Date**: 2026-03-08
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

The new mux "route contract" tests never invoke the real `/api/events/mux` handler, so AC-02 through AC-08 are not directly verified against the shipped route behavior.

**Key failure areas**:
- **Implementation**: The route code is plausible, but the delivered test suite only exercises duplicated helper logic and raw `SSEManager`, not the actual handler contract.
- **Domain compliance**: Phase metadata and touched domain docs do not fully record the `_platform/state` change or the new mux contract.
- **Testing**: AC-06 and AC-07 have no direct verification evidence, and AC-02 through AC-05/AC-08 are only indirectly covered.
- **Doctrine**: The new "route contract" suite avoids the real route seam, which diverges from the project’s TDD/fake-based testing expectations.

## B) Summary

Static review did not uncover an obvious correctness or security defect in `sse-manager.ts` or `app/api/events/mux/route.ts`; the server-side implementation generally follows the existing single-channel SSE pattern and extends existing infrastructure rather than reinventing it. However, the new `test/unit/web/api/events-mux-route.test.ts` suite never imports or executes `app/api/events/mux/route.ts`, so the phase’s highest-risk behaviors—auth gating, actual response semantics, heartbeats, and abort cleanup—remain unproven despite the passing test count. Domain compliance is also incomplete: the plan manifest does not account for the `_platform/state` file touched in this phase, and the `_platform/events`/`_platform/state` domain docs were not fully updated to reflect the new public surface. Anti-reinvention review was clean: the multiplexed route, multi-channel cleanup, and channel tagging all extend `_platform/events` rather than duplicating another domain’s capability.

## C) Checklist

**Testing Approach: Hybrid**

- [x] TDD-style unit coverage exists for `SSEManager` channel tagging and multi-channel cleanup
- [ ] TDD-style coverage exercises the real `/api/events/mux` route contract
- [ ] Acceptance criteria AC-02 through AC-08 have direct verification evidence
- [ ] Verification logs include concrete command output and RED/GREEN evidence for TDD tasks

Universal (all approaches):
- [ ] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jordanknight/substrate/067-question-popper/test/unit/web/api/events-mux-route.test.ts:1-248` | testing | The mux route suite never imports or executes `app/api/events/mux/route.ts`, leaving auth, heartbeat, response, and abort-cleanup behavior unverified. | Replace helper-level checks with real route-handler tests that invoke `GET()` and assert the actual contract. |
| F002 | MEDIUM | `/Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md:25-53` | domain-manifest | The plan Domain Manifest omits `apps/web/src/lib/state/server-event-router.ts`, so the phase’s actual `_platform/state` footprint is undocumented. | Add the file to the manifest and align T003 metadata to `_platform/state`. |
| F003 | MEDIUM | `/Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md:58-75,97-124,145-178` | domain-docs | `_platform/events/domain.md` adds mux to Composition/History only; it still omits the new public mux route from Contracts/Source Location, omits `_platform/auth` from Dependencies, and claims the `_platform/state` `ServerEvent` change as events-domain work. | Update Contracts, Source Location, Dependencies, and narrow the Plan 072 history entry to events-owned changes. |
| F004 | MEDIUM | `/Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/state/domain.md:46-67,87-107,152-163` | domain-docs | `_platform/state/domain.md` is not updated for the new optional `ServerEvent.channel` metadata added in this phase. | Add a Plan 072 Phase 1 history entry and document `channel?: string` in the relevant contract/source sections. |
| F005 | MEDIUM | `/Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-1-server-foundation/execution.log.md:10-47` | evidence | The execution log reports passing counts but does not include concrete command output or RED→GREEN evidence for the TDD tasks promised by the phase. | Record the exact verification commands and captured outcomes for the mux route and SSEManager tasks. |
| F006 | LOW | `/Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md:17-25,48-60,142-166` | domain-map | The domain map and health summary do not reflect the `_platform/events -> _platform/auth` session-check dependency implicated by the SSE routes. | Add a labeled auth dependency edge and refresh the affected health-summary rows. |
| F007 | LOW | `/Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md:1-178` | concepts-docs | `_platform/events` still has no `## Concepts` section, so the new mux contract is undocumented at concept level. | Add a Concepts table that includes the single-channel route, mux route, and channel-tagged SSE delivery flow. |
| F008 | LOW | `/Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/state/domain.md:1-163` | concepts-docs | `_platform/state` still has no `## Concepts` section, leaving the `ServerEvent` bridge and optional channel metadata undocumented at concept level. | Add a Concepts table covering `ServerEventRoute`, `ServerEventRouteDescriptor`, and `ServerEvent.channel`. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)** — `test/unit/web/api/events-mux-route.test.ts` does not exercise the real route at all. The suite reimplements query parsing in a local helper and drives `SSEManager` directly, so the most important route-level behaviors are still only statically inferred.
- No separate correctness, security, or performance defect was identified in `apps/web/src/lib/sse-manager.ts`, `apps/web/src/lib/state/server-event-router.ts`, or `apps/web/app/api/events/mux/route.ts` during static review.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New source files (`app/api/events/mux/route.ts`, `test/unit/web/api/events-mux-route.test.ts`) live under the expected `_platform/events` source and test trees. |
| Contract-only imports | ✅ | No business-domain internals are imported; route code uses same-domain internals and the public auth surface. |
| Dependency direction | ✅ | No infrastructure→business violation or new business→business cycle was introduced. |
| Domain.md updated | ❌ | `_platform/events/domain.md` is only partially updated, and `_platform/state/domain.md` is not updated for `ServerEvent.channel`. |
| Registry current | ✅ | No new domains were added, so `docs/domains/registry.md` remains current. |
| No orphan files | ❌ | `apps/web/src/lib/state/server-event-router.ts` is not represented in the plan Domain Manifest, and `apps/web/next-env.d.ts` also sits outside the declared phase scope. |
| Map nodes current | ❌ | The `_platform/events` node/health summary do not reflect the phase’s documented surface and dependencies. |
| Map edges current | ❌ | The auth/session-check dependency used by the SSE routes is still not represented as a labeled edge. |
| No circular business deps | ✅ | No new business-domain cycle was introduced by this phase. |
| Concepts documented | ⚠️ | The touched `_platform/events` and `_platform/state` domain docs do not contain `## Concepts` sections. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| Multiplexed SSE route | Existing single-channel SSE route (`app/api/events/[channel]/route.ts`) plus prior documentation pointing toward multiplexing | `_platform/events` | Extend existing infrastructure — no duplication concern |
| `removeControllerFromAllChannels()` | Existing `removeConnection(channelId, controller)` on `SSEManager` | `_platform/events` | Legitimate extension of the same service |
| Channel-tagged SSE payloads | None | `_platform/events` | New capability justified by demultiplexing requirement |

No genuine capability duplication was found.

### E.4) Testing & Evidence

**Coverage confidence**: 62%

Targeted validation run during review:
- `pnpm vitest --run test/unit/web/services/sse-manager.test.ts test/unit/web/api/events-mux-route.test.ts`
- Result: **29/29 tests passed**
- Note: Vitest startup emitted `tsconfck` warnings from existing `.next/standalone` and `apps/cli/dist/web/standalone` artifacts, but the targeted tests still completed successfully.

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-01 | 96% | `apps/web/src/lib/sse-manager.ts` adds `channel` to both payload branches; `test/unit/web/services/sse-manager.test.ts` covers object payloads, primitive payloads, overwrite behavior, and legacy formatting. |
| AC-02 | 58% | The route reads `?channels=a,b,c`, but the new mux test file only validates duplicated parser logic instead of calling `GET()`. |
| AC-03 | 55% | The route registers one controller across channels, and `SSEManager` tests prove the underlying mechanism; the route path itself is not exercised. |
| AC-04 | 58% | Regex validation exists in the route, but tests only cover copied parsing logic rather than real 400 responses. |
| AC-05 | 58% | Dedupe/max-count logic exists in code and is approximated in the helper tests, not verified through the route contract. |
| AC-06 | 35% | `auth()` gating exists in the route, but no test or manual artifact demonstrates an actual 401 response. |
| AC-07 | 42% | The route defines a 15s heartbeat and writes an initial heartbeat frame, but no timer-based or stream-based proof exists. |
| AC-08 | 58% | The route calls `removeControllerFromAllChannels()` on abort/heartbeat failure, and that helper is well-tested, but the route lifecycle is not directly driven. |
| AC-09 | 68% | The legacy `[channel]` route is unchanged in the diff, but there is no captured regression check for it. |
| AC-10 | 90% | Because the legacy route still relies on `SSEManager.broadcast()`, the new `channel` field now flows into existing per-channel payloads automatically. |

### E.5) Doctrine Compliance

- **F001 (HIGH)** also violates the project’s TDD/testing doctrine: the phase promised TDD for the mux route, but the delivered suite avoids the real route seam entirely.
- `test/unit/web/services/sse-manager.test.ts` aligns well with the project’s fake-only and Test Doc idioms.
- No additional material doctrine violation was found beyond the route-test gap and the weak evidence capture in `execution.log.md`.

### E.6) Harness Live Validation

N/A — no harness configured. `docs/project-rules/harness.md` is absent, and the phase dossier explicitly marks harness usage as not applicable.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | SSEManager.broadcast() includes `channel` field | `sse-manager.ts` payload update + SSEManager tests | 96% |
| AC-02 | Mux route accepts `?channels=a,b,c` | Static route review only; helper-level parser tests | 58% |
| AC-03 | Route registers one controller on each requested channel | Static route review + `SSEManager` multi-channel tests | 55% |
| AC-04 | Route validates channel names | Static route review + helper-level validation tests | 58% |
| AC-05 | Route deduplicates and caps channels at 20 | Static route review + helper-level dedupe/max tests | 58% |
| AC-06 | Route requires authentication | Static route review only (`auth()` branch present) | 35% |
| AC-07 | Route sends heartbeat every 15 seconds | Static route review only (`HEARTBEAT_INTERVAL = 15_000`) | 42% |
| AC-08 | Disconnect cleans up controller from all channels | Static route review + `removeControllerFromAllChannels()` tests | 58% |
| AC-09 | Legacy `/api/events/[channel]` route remains working | Unchanged diff only; no regression artifact captured | 68% |
| AC-10 | Legacy per-channel payloads now include `channel` | `SSEManager.broadcast()` update + SSEManager tests | 90% |

**Overall coverage confidence**: **62%**

## G) Commands Executed

```bash
git --no-pager status --short
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -10
phase_dir='/Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-1-server-foundation'; review_dir="$phase_dir/reviews"; mkdir -p "$review_dir"; : > "$review_dir/_computed.diff"; for f in apps/web/next-env.d.ts apps/web/src/lib/sse-manager.ts apps/web/src/lib/state/server-event-router.ts apps/web/app/api/events/mux/route.ts docs/domains/_platform/events/domain.md test/unit/web/services/sse-manager.test.ts test/unit/web/api/events-mux-route.test.ts; do ...; done
git --no-pager diff -- apps/web/next-env.d.ts
git --no-pager diff -- docs/domains/_platform/events/domain.md
pnpm vitest --run test/unit/web/services/sse-manager.test.ts test/unit/web/api/events-mux-route.test.ts
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md
**Spec**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-spec.md
**Phase**: Phase 1: Server Foundation
**Tasks dossier**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-1-server-foundation/tasks.md
**Execution log**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-1-server-foundation/execution.log.md
**Review file**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-1-server-foundation/reviews/review.phase-1-server-foundation.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/067-question-popper/apps/web/next-env.d.ts | modified | generated / cross-domain | Remove from phase diff if incidental, or justify separately |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/sse-manager.ts | modified | `_platform/events` | None identified |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/state/server-event-router.ts | modified | `_platform/state` | Reflect in plan/domain artifacts |
| /Users/jordanknight/substrate/067-question-popper/apps/web/app/api/events/mux/route.ts | created | `_platform/events` | Keep implementation; add real route-level tests |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md | modified | `_platform/events` | Expand contract/source/dependency/history/concepts coverage |
| /Users/jordanknight/substrate/067-question-popper/test/unit/web/services/sse-manager.test.ts | modified | `_platform/events` | None identified |
| /Users/jordanknight/substrate/067-question-popper/test/unit/web/api/events-mux-route.test.ts | created | `_platform/events` | Rewrite to exercise the real route contract |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/067-question-popper/test/unit/web/api/events-mux-route.test.ts | Replace helper-level parser/SSEManager checks with tests that call the real `GET()` handler and assert auth, headers, heartbeat behavior, dedupe/max validation, and abort cleanup. | Current suite can pass while the shipped route breaks AC-02 through AC-08. |
| 2 | /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md | Add `apps/web/src/lib/state/server-event-router.ts` to `## Domain Manifest` and align T003 metadata to `_platform/state`. | The phase’s real domain footprint is currently undocumented. |
| 3 | /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md | Document `/api/events/mux` in Contracts/Source Location, add `_platform/auth` dependency, narrow the Plan 072 history entry, and add Concepts coverage. | The events domain doc only partially reflects Phase 1. |
| 4 | /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/state/domain.md | Record the `ServerEvent.channel?: string` change in History/Contracts/Source and add Concepts coverage. | `_platform/state` owns the `ServerEvent` shape touched by this phase. |
| 5 | /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md | Add the `_platform/events -> _platform/auth` dependency and refresh the relevant health-summary rows. | The map remains stale for a dependency implicated by this phase. |
| 6 | /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-1-server-foundation/execution.log.md | Capture exact verification commands and concrete outputs for the TDD tasks. | Current evidence is claims-only, which weakens reviewability. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md | `server-event-router.ts` missing from Domain Manifest; T003 domain mapping needs correction |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md | Contracts/Source Location/Dependencies/History/Concepts are incomplete for Phase 1 |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/state/domain.md | No Plan 072 history or contract note for `ServerEvent.channel` and no Concepts section |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md | Missing `_platform/events -> _platform/auth` edge and stale health-summary data |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md --phase 'Phase 1: Server Foundation'
