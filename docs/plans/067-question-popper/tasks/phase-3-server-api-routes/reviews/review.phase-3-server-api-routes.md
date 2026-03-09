# Code Review: Phase 3: Server API Routes

**Plan**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md
**Spec**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/question-popper-spec.md
**Phase**: Phase 3: Server API Routes
**Date**: 2026-03-07
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**APPROVE**

**Key note areas**:
- **Implementation**: The route handlers work, but the shared `authorizeRequest` / `resolveService` helper promised by T001 was not actually extracted, so wrapper auth + DI logic remains duplicated.
- **Domain compliance**: `question-popper/domain.md`, the plan Domain Manifest, and `domain-map.md` all lag the Phase 3 HTTP surface.
- **Reinvention**: The new request-body schemas re-specify payload contracts that already exist in shared question-popper types/schemas.
- **Testing**: Handler tests are strong, but wrapper-level localhost/auth behavior and RED→GREEN evidence are not preserved.
- **Doctrine**: The new route test cases do not carry the required per-test 5-field Test Doc blocks.

## B) Summary

The Phase 3 implementation is functionally solid: all required API routes exist, targeted review checks passed (`73/73` targeted tests, `just typecheck`, and Biome on the touched code), and no HIGH correctness, security, or performance defects surfaced. The main gaps are traceability and task compliance rather than runtime behavior: T001's shared auth/service-resolution helper is still absent, route-wrapper auth behavior is not directly tested, and there is no preserved `execution.log.md` proving RED→GREEN sequencing. Domain artifacts also remain behind the code: the plan Domain Manifest misses some Phase 3 files, `docs/domains/question-popper/domain.md` still describes a pre-Phase-3 state, and `docs/domains/domain-map.md` does not reflect the new auth/localhost dependencies and API surface. Anti-reinvention review found no blocking duplication, but it did identify the new request-body schemas as a same-domain re-specification of already-existing payload contracts.

## C) Checklist

**Testing Approach: Hybrid**

- [x] Core handler validation tests present
- [ ] Route-wrapper localhost/auth behavior verified
- [ ] Phase evidence log records ordered RED → GREEN → REFACTOR steps

Universal (all approaches):
- [ ] Only in-scope files changed
- [x] Linters/type checks clean (targeted review checks)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/lib/route-helpers.ts:6-16; /Users/jordanknight/substrate/067-question-popper/apps/web/app/api/event-popper/ask-question/route.ts:18-27; /Users/jordanknight/substrate/067-question-popper/apps/web/app/api/event-popper/question/[id]/route.ts:19-36; /Users/jordanknight/substrate/067-question-popper/apps/web/app/api/event-popper/list/route.ts:19-31; /Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/api-routes.test.ts:1-587 | scope | T001 promised shared `authorizeRequest` / `resolveService` helpers and one-line route wrappers, but the wrappers still inline auth + DI and the test suite never exercises those wrapper paths. | Either implement the shared helper contract and reuse it across route files, or update the phase dossier/docs to make the current wrapper-based design explicit and add wrapper-level auth tests. |
| F002 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-3-server-api-routes/execution.log.md (missing); /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-3-server-api-routes/tasks.md:145-156; /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md:152-169 | testing | The phase claims TDD-level route work, but there is no persisted RED→GREEN evidence, the task table is still unchecked, and the plan/tasks artifacts disagree on whether Phase 3 owns AC-01/02 or AC-15/28/29. | Add an execution log with the actual command outputs and outcomes, mark completed tasks, and reconcile the AC mapping before treating the dossier as authoritative evidence. |
| F003 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md:67-100 | domain-compliance | The Domain Manifest does not cover all Phase 3 files: it omits `route-helpers.ts` and uses a single-segment route glob that leaves nested `[id]` handlers orphaned against the manifest. | Add an explicit manifest row for `apps/web/src/features/067-question-popper/lib/route-helpers.ts` and widen the route pattern to `apps/web/app/api/event-popper/**/route.ts` (or enumerate the nested routes). |
| F004 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md:26-115 | domain-compliance | `question-popper/domain.md` still says API routes are not yet implemented and does not record the new route helper, HTTP entrypoints, `_platform/auth` dependency, or Phase 3 history. | Update the domain doc's Boundary, Composition, Concepts, Contracts, Dependencies, Source Location, and History sections to match the delivered API layer. |
| F005 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md:120-166 | domain-compliance | The domain map/health summary still describe the Phase 2 surface only; they omit `question-popper -> _platform/auth`, omit `localhostGuard()` from the external-events edge, and do not reflect the Phase 3 API route/response surface. | Sync the node label, labeled edges, and Domain Health Summary rows so the topology matches the current imports and public HTTP surface. |
| F006 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/api-routes.test.ts:1-587 | doctrine | The new route test suite adds many `it(...)` cases but only provides a file-level comment; project doctrine requires a 5-field Test Doc inside each test case. | Add per-test Test Doc blocks with Why, Contract, Usage Notes, Quality Contribution, and Worked Example. |
| F007 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/lib/route-helpers.ts:49-74 | reinvention | `AskQuestionRequestSchema` and `SendAlertRequestSchema` duplicate shared question-popper payload contracts instead of extending/composing the existing schema/type surface. | Rework the request schema definitions to compose `QuestionPayloadSchema` / `AlertPayloadSchema` and the corresponding `QuestionIn` / `AlertIn` contracts rather than restating the payload shape inline. |

## E) Detailed Findings

### E.1) Implementation Quality
- **F001 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/lib/route-helpers.ts:6-16`; `/Users/jordanknight/substrate/067-question-popper/apps/web/app/api/event-popper/ask-question/route.ts:18-27`; `/Users/jordanknight/substrate/067-question-popper/apps/web/app/api/event-popper/question/[id]/route.ts:19-36`; `/Users/jordanknight/substrate/067-question-popper/apps/web/app/api/event-popper/list/route.ts:19-31`; `/Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/api-routes.test.ts:1-587`  
  The code works, but the implementation does not match the Phase 3 dossier's planned abstraction. `route-helpers.ts` documents `authorizeRequest(request, mode)` and `resolveService(request, mode)`, yet those helpers are not implemented and each `route.ts` repeats auth + DI setup inline. Because the tests only import `route-helpers`, the duplicated wrapper logic is never directly verified.

- No HIGH implementation defects were confirmed. The material runtime paths reviewed here passed targeted tests, type checking, and formatting/lint checks.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New route files live under `apps/web/app/api/event-popper/`, and the shared helper lives under `apps/web/src/features/067-question-popper/lib/`. |
| Contract-only imports | ✅ | No cross-domain internal-file imports were found in the Phase 3 route layer. |
| Dependency direction | ✅ | `question-popper` consumes `_platform/external-events` and `_platform/auth`; no infrastructure→business inversion was introduced. |
| Domain.md updated | ❌ | `docs/domains/question-popper/domain.md` still describes API routes as not yet implemented and lacks Phase 3 updates. |
| Registry current | ✅ | `docs/domains/registry.md` already contains rows for `_platform/external-events` and `question-popper`. |
| No orphan files | ❌ | The plan Domain Manifest misses `route-helpers.ts` and does not fully cover nested `[id]` route handlers. |
| Map nodes current | ❌ | The `question-popper` node and Domain Health Summary row still reflect the pre-API Phase 2 surface. |
| Map edges current | ❌ | The map omits the `questionPopper -->|auth()| auth` edge and does not list `localhostGuard()` on the external-events dependency. |
| No circular business deps | ✅ | No new business-domain cycle was introduced. |
| Concepts documented | ⚠️ | Service-level concepts exist, but the new HTTP entrypoints and `QuestionOut` / `AlertOut` route-facing concepts are not documented. |

- **F003 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md:67-100`  
  The Domain Manifest is incomplete for the Phase 3 diff.  
  **Fix**: Add `route-helpers.ts` explicitly and cover nested route handlers with `**/route.ts` or explicit rows.

- **F004 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md:26-115`  
  The domain doc is stale after Phase 3.  
  **Fix**: Document the route helper, `/api/event-popper/*` handlers, `_platform/auth` dependency, response surface, and a new Phase 3 history entry.

- **F005 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md:120-166`  
  The domain map and health summary do not reflect the delivered Phase 3 topology.  
  **Fix**: Add the missing auth edge, extend the external-events edge label with `localhostGuard()`, and update the `question-popper` node/health summary to include the API route surface and `AlertOut`.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `AskQuestionRequestSchema` | `QuestionPayloadSchema` + `QuestionIn` | `question-popper` | Note — extend/combine rather than re-specify |
| `SendAlertRequestSchema` | `AlertPayloadSchema` + `AlertIn` | `question-popper` | Note — extend/combine rather than re-specify |
| `parseJsonBody()` / `eventPopperErrorResponse()` | Similar ad hoc logic exists in `/Users/jordanknight/substrate/067-question-popper/apps/web/app/api/agents/[id]/run/route.ts` and `/Users/jordanknight/substrate/067-question-popper/apps/web/app/api/activity-log/route.ts`, but no reusable helper existed | `agents`, `activity-log` | Proceed |
| Question/alert route surface | Similar question semantics exist in `workflow-events`, but no reusable HTTP route layer was found | `workflow-events` | Proceed |

- **F007 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/lib/route-helpers.ts:49-74`  
  The new request-body schemas duplicate same-domain contracts already defined in shared payload schemas/types.  
  **Fix**: Compose the existing schemas/types rather than maintaining parallel definitions.

### E.4) Testing & Evidence

**Coverage confidence**: 52%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-01 | 64% | `pnpm vitest run test/unit/question-popper/api-routes.test.ts test/unit/event-popper/infrastructure.test.ts` passed `73/73` tests, including `handleAskQuestion` happy/invalid paths and `handleGetQuestion` retrieval. SSE/state publication is still inferred from Phase 2 service behavior rather than directly observed here. |
| AC-02 | 60% | The same run verified `handleAnswerQuestion` success, not-found, and already-resolved branches. Polling-after-answer and live UI propagation remain indirectly evidenced only. |
| AC-15 | 15% | No direct Phase 3 evidence for toast/desktop notification behavior; `tasks.md` explicitly positions this work in Phase 5, which conflicts with `plan.md`. |
| AC-28 | 20% | No direct Phase 3 proof for live UI/state updates. Route tests validate response behavior only; they do not observe SSE/state consumers. |
| AC-29 | 10% | No direct evidence for overlay-open/closed real-time behavior or indicator updates; this appears to be later UI work despite the plan-level AC summary. |

- **F002 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-3-server-api-routes/execution.log.md (missing)`; `/Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/api-routes.test.ts:1-587`  
  Evidence quality is partly post-hoc rather than phase-authored. The strongest proof is the current local test run, not persisted phase artifacts, and the wrapper auth cases the dossier calls out are still untested.  
  **Fix**: Record the actual commands/results in `execution.log.md`, reconcile the AC mapping, and add route-wrapper auth coverage.

### E.5) Doctrine Compliance
- **F006 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/api-routes.test.ts:1-587`  
  The route tests follow the fake-based testing philosophy and avoid `vi.mock()`/`vi.spyOn()`, but they do not satisfy the repository's per-test Test Doc requirement.  
  **Fix**: Add the 5-field Test Doc block inside each `it(...)` case.

### E.6) Harness Live Validation
N/A — no harness configured (`/Users/jordanknight/substrate/067-question-popper/docs/project-rules/harness.md` does not exist).

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | CLI/API ask flow stores a question, returns `{ questionId }`, and supports retrieval via `GET /api/event-popper/question/{id}`. | Targeted local run passed `73/73`; handler tests cover create + retrieve behavior through `FakeQuestionPopperService`. | 64% |
| AC-02 | UI/API answer flow stores an answer and makes it retrievable on subsequent reads. | Targeted local run passed `handleAnswerQuestion` success/404/409 cases with `QuestionOut` mapping. | 60% |
| AC-15 | New questions/alerts trigger SSE + toast/desktop notification behavior. | No direct Phase 3 proof; tasks dossier places this in Phase 5. | 15% |
| AC-28 | Answer/acknowledge operations propagate in real time without refresh. | No direct Phase 3 proof; route tests do not observe SSE/state consumers. | 20% |
| AC-29 | Overlay/indicator update in real time when new items arrive. | No direct Phase 3 proof; behavior appears UI-phase. | 10% |

**Overall coverage confidence**: 52%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager log --oneline -10
mkdir -p docs/plans/067-question-popper/tasks/phase-3-server-api-routes/reviews && git --no-pager diff 0943b8a..HEAD -- > docs/plans/067-question-popper/tasks/phase-3-server-api-routes/reviews/_computed.diff
git --no-pager diff --name-status 0943b8a..HEAD
git --no-pager diff --numstat 0943b8a..HEAD
pnpm vitest run test/unit/question-popper/api-routes.test.ts test/unit/event-popper/infrastructure.test.ts
just typecheck
pnpm exec biome check apps/web/app/api/event-popper apps/web/src/features/067-question-popper/lib/route-helpers.ts test/unit/question-popper/api-routes.test.ts apps/web/src/lib/localhost-guard.ts apps/web/src/lib/di-container.ts packages/shared/src/event-popper/guid.ts packages/shared/src/event-popper/port-discovery.ts test/unit/event-popper/infrastructure.test.ts
node -e "process.env.TEST_X='abc'; process.env.TEST_X=undefined; console.log('value:', JSON.stringify(process.env.TEST_X), 'hasOwn:', Object.prototype.hasOwnProperty.call(process.env,'TEST_X')); delete process.env.TEST_X; console.log('after delete:', JSON.stringify(process.env.TEST_X), 'hasOwn:', Object.prototype.hasOwnProperty.call(process.env,'TEST_X'));"
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: APPROVE

**Plan**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md
**Spec**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/question-popper-spec.md
**Phase**: Phase 3: Server API Routes
**Tasks dossier**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-3-server-api-routes/tasks.md
**Execution log**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-3-server-api-routes/execution.log.md
**Review file**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-3-server-api-routes/reviews/review.phase-3-server-api-routes.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md | Context | plan-artifact | F002, F003 |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/question-popper-spec.md | Context | spec-artifact | None |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-3-server-api-routes/tasks.md | Added | plan-artifact | F002 |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-3-server-api-routes/execution.log.md | Missing | plan-artifact | F002 |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/lib/route-helpers.ts | Added | question-popper | F001, F007 |
| /Users/jordanknight/substrate/067-question-popper/apps/web/app/api/event-popper/ask-question/route.ts | Added | question-popper | F001 |
| /Users/jordanknight/substrate/067-question-popper/apps/web/app/api/event-popper/question/[id]/route.ts | Added | question-popper | F001 |
| /Users/jordanknight/substrate/067-question-popper/apps/web/app/api/event-popper/answer-question/[id]/route.ts | Added | question-popper | F001 |
| /Users/jordanknight/substrate/067-question-popper/apps/web/app/api/event-popper/send-alert/route.ts | Added | question-popper | F001 |
| /Users/jordanknight/substrate/067-question-popper/apps/web/app/api/event-popper/list/route.ts | Added | question-popper | F001 |
| /Users/jordanknight/substrate/067-question-popper/apps/web/app/api/event-popper/dismiss/[id]/route.ts | Added | question-popper | F001 |
| /Users/jordanknight/substrate/067-question-popper/apps/web/app/api/event-popper/clarify/[id]/route.ts | Added | question-popper | F001 |
| /Users/jordanknight/substrate/067-question-popper/apps/web/app/api/event-popper/acknowledge/[id]/route.ts | Added | question-popper | F001 |
| /Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/api-routes.test.ts | Added | question-popper | F001, F002, F006 |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/localhost-guard.ts | Modified | _platform/external-events | F005 context |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/di-container.ts | Modified | question-popper | None |
| /Users/jordanknight/substrate/067-question-popper/apps/web/instrumentation.ts | Modified | _platform/external-events | None |
| /Users/jordanknight/substrate/067-question-popper/apps/web/proxy.ts | Modified | _platform/external-events | None |
| /Users/jordanknight/substrate/067-question-popper/packages/shared/src/event-popper/guid.ts | Modified | _platform/external-events | None |
| /Users/jordanknight/substrate/067-question-popper/packages/shared/src/event-popper/port-discovery.ts | Modified | _platform/external-events | None |
| /Users/jordanknight/substrate/067-question-popper/test/unit/event-popper/infrastructure.test.ts | Modified | _platform/external-events | None |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md | Context | question-popper-doc | F004 |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md | Context | topology-artifact | F005 |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md | Domain Manifest coverage for `route-helpers.ts` and nested `[id]` route handlers |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md | Phase 3 route/helper composition, auth dependency, HTTP concepts/contracts, Phase 3 history |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md | `question-popper -> auth` edge, `localhostGuard()` on external-events edge, and Phase 3 API surface/health summary |

### Next Step

/plan-5-v2-phase-tasks-and-brief --phase 'Phase 4: CLI Commands' --plan /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md
