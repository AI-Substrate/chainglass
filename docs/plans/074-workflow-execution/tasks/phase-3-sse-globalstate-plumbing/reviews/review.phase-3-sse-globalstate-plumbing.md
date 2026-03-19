# Code Review: Phase 3: SSE + GlobalState Plumbing

**Plan**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md
**Spec**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-spec.md
**Phase**: Phase 3: SSE + GlobalState Plumbing
**Date**: 2026-03-15
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid (phase applied: Lightweight)

## A) Verdict

**REQUEST_CHANGES**

Phase 3 is close, but it is not review-safe yet: the new workflow-execution SSE→GlobalState bridge cannot publish valid state paths with the current execution key, and the new server actions still trust raw client-supplied worktree paths.

**Key failure areas**:
- **Implementation**: `workflow-execution` state updates are emitted with an instance key that violates GlobalState path rules, so reactive `useGlobalState` subscriptions never receive the published values.
- **Domain compliance**: the phase uses an unregistered `web-integration` owner and crosses into `_platform/events` internals instead of consuming a published contract.
- **Testing**: manager/route unit tests landed, but there is still no direct proof for server action return shapes or a mounted SSE→GlobalState flow.
- **Doctrine**: the new manager tests use `vi.fn()` and timer sleeps, which conflicts with the repo's fakes-over-mocks and no-timers test rules.

## B) Summary

The phase reuses existing route-descriptor and workflow-action patterns well, and the anti-reinvention pass found no genuine duplication. However, the review found two blocking defects.

First, `workflowExecutionRoute` uses the raw `ExecutionKey` (`<worktreePath>:<graphSlug>`) as the GlobalState instance ID. That produces a state path such as `workflow-execution:/tmp/wt:graph:status`, which `parsePath()` rejects because it has four segments instead of the required `domain:instanceId:property` form.

Second, the new server actions hand a client-supplied `worktreePath` directly to the execution manager, while `WorkspaceService.resolveContextFromParams()` preserves unknown paths instead of clamping them to registered worktrees. Domain docs and boundary contracts also need follow-through, and live harness validation remained limited because CDP never came up on `:9223` even though the app, terminal sidecar, MCP endpoint, `workflow-execution` SSE endpoints, and live domain registration were all observed successfully.

## C) Checklist

**Testing Approach: Hybrid (phase applied: Lightweight)**

- [x] Targeted unit tests exist for route mapping and manager broadcast transitions
- [ ] Direct action-level verification exists for `runWorkflow` / `stopWorkflow` / `restartWorkflow` / `getWorkflowExecutionStatus`
- [ ] Mounted-provider evidence exists for `workflow-execution` SSE → `ServerEventRoute` → `useGlobalState`
- [x] Key verification points are documented in `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-3-sse-globalstate-plumbing/execution.log.md`
- [x] Only in-scope files changed
- [x] Linters/type checks clean (per execution log evidence)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/lib/state/workflow-execution-route.ts:30-45`; `/Users/jordanknight/substrate/074-actaul-real-agents/packages/shared/src/state/path-parser.ts:33-57` | correctness | The route uses the raw execution key as the GlobalState instance ID, producing invalid four-segment state paths such as `workflow-execution:/tmp/wt:graph:status`. `parsePath()` rejects those updates, so live workflow-execution state never reaches `useGlobalState`. | Make the public execution key/state instance ID path-safe, or introduce a dedicated state-safe ID and use it consistently across SSE payloads, state routing, and UI subscriptions. |
| F002 | HIGH | `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/app/actions/workflow-execution-actions.ts:33-88`; `/Users/jordanknight/substrate/074-actaul-real-agents/packages/workflow/src/services/workspace.service.ts:172-208` | security | The server actions accept client-supplied `worktreePath` values and pass them into manager operations. `resolveContextFromParams()` preserves unmatched paths, so reset/load/persist calls can target an unvalidated filesystem location. | Validate/clamp worktree paths against the workspace before invoking the manager, and pass a trusted workspace slug/context into stop/restart/status flows as well. |
| F003 | MEDIUM | `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/registry.md:1-30`; `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/domain-map.md:13-208`; `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/workflow-ui/domain.md:24-150` | domain | Phase artifacts classify `apps/web/src/features/074-workflow-execution/*` as `web-integration`, but that owner is not registered or mapped, and `workflow-ui/domain.md` was not updated for the new server-actions file. | Formalize the owner or reclassify the files under an existing domain, then update the registry, domain map, and domain docs consistently. |
| F004 | MEDIUM | `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/create-execution-manager.ts:16-32`; `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/app/actions/workflow-execution-actions.ts:15-17` | pattern | Cross-domain internals are imported directly (`../../lib/sse-manager`, `../../src/features/074-workflow-execution/get-manager`) instead of going through published contracts/facades. | Inject `ISSEBroadcaster` (or another public events contract) and expose a public execution-manager facade rather than binding another domain's internal files. |
| F005 | MEDIUM | `/Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/074-workflow-execution/workflow-execution-manager.test.ts:34-50,352-466` | testing | The new broadcast tests use `vi.fn()`, `mock.calls`, `mockClear()`, and real timer sleeps, and they still do not prove the server actions or mounted bridge behavior. | Replace mocks with a fake broadcaster, use deterministic drive controls, and add focused action/connector coverage. |

## E) Detailed Findings

### E.1) Implementation Quality

**F001 — invalid GlobalState path construction (HIGH)**

`workflowExecutionRoute.mapEvent()` uses `event.key` directly as `instanceId`. In this phase, that key is the execution key built as `<worktreePath>:<graphSlug>`, so the published path becomes `workflow-execution:<worktreePath>:<graphSlug>:status`.

That shape is incompatible with the state system. `parsePath()` accepts only 2 segments (`domain:property`) or 3 segments (`domain:instanceId:property`). I verified the failure directly with a read-only probe:

```bash
pnpm exec tsx -e "import { parsePath } from './packages/shared/src/state/path-parser.ts'; try { console.log(parsePath('workflow-execution:/tmp/wt:graph:status')); } catch (error) { console.error(String(error)); process.exit(1); }"
```

The command returned:

```text
Error: Invalid state path "workflow-execution:/tmp/wt:graph:status": expected 2 segments (domain:property) or 3 segments (domain:instanceId:property), got 4
```

So AC2 is not just under-tested; it is currently broken by construction.

**F002 — unvalidated worktree path input (HIGH)**

The new server actions do not resolve a trusted workspace context before calling the execution manager. They forward `worktreePath` directly, and the manager later passes that value into graph-state load/reset/persist calls.

The underlying resolver does not protect this boundary. `WorkspaceService.resolveContextFromParams()` returns `worktreePath: targetWorktree?.path ?? worktreePath ?? info.path`, so an unmatched path survives into the returned context instead of being rejected. Because restart/stop/status flows act on that path later, an authenticated caller can steer those operations at an arbitrary filesystem location that looks like a worktree root.

**Additional implementation note**

`getWorkflowExecutionStatus()` catches every exception and returns `null`, which makes an unexpected execution-manager failure indistinguishable from "no running execution". That did not make the top findings table because F001/F002 are the urgent blockers, but it should be revisited while touching the action surface.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | All changed files live under the source trees declared in the phase task dossier. |
| Contract-only imports | ❌ | `create-execution-manager.ts` imports the internal `_platform/events` implementation file `../../lib/sse-manager`, and `workflow-execution-actions.ts` imports `../../src/features/074-workflow-execution/get-manager` rather than a public contract/facade. |
| Dependency direction | ❌ | `workflow-ui` reaches into another owner via an internal file, and the execution-manager owner itself is unresolved. |
| Domain.md updated | ❌ | `_platform/state` and `_platform/events` history rows were updated, but source/composition/contracts remain partial; `workflow-ui/domain.md` was not updated at all; `docs/domains/web-integration/domain.md` does not exist. |
| Registry current | ❌ | `docs/domains/registry.md` has no `web-integration` entry even though the plan/tasks assign files to that owner. |
| No orphan files | ✅ | Every changed file is represented somewhere in the phase manifest/tasks, even though the selected owner is inconsistent. |
| Map nodes current | ❌ | `docs/domains/domain-map.md` has no `web-integration` node or health-summary row. |
| Map edges current | ❌ | The map does not show the Phase 3 workflow-ui → execution-manager → events dependency chain with labeled contracts. |
| No circular business deps | ✅ | No new business-domain cycle was identified in the Phase 3 code or map. |
| Concepts documented | ⚠️ | No owning domain doc explains the new `SerializableExecutionStatus` / execution-manager facade concepts if `web-integration` remains the owner. |

**F003 — owner/artifact drift (MEDIUM)**

The phase dossier uses `web-integration` for `workflow-execution-manager.ts`, `workflow-execution-manager.types.ts`, and `create-execution-manager.ts`, but that domain is not registered or mapped. At the same time, `workflow-ui/domain.md` still only documents `workflow-actions.ts`, not the new `workflow-execution-actions.ts` file.

**F004 — boundary bypass via internals (MEDIUM)**

The code reaches into `_platform/events` internals through `sseManager`, even though a shared `ISSEBroadcaster` contract and fake/adapter pair already exist. The new server actions also reach through an internal `get-manager` file rather than a public execution-manager contract. Those choices make the domain boundary fuzzier than it needs to be and directly contributed to the mock-heavy tests.

### E.3) Anti-Reinvention

No genuine duplication was found. The new source files follow existing patterns instead of reinventing capability that already exists elsewhere.

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `workflowExecutionRoute` | `work-unit-state-route.ts` | `_platform/state` | ✅ Pattern reuse — proceed |
| `workflow-execution-actions.ts` | `workflow-actions.ts` | `workflow-ui` | ✅ Pattern reuse — proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 36%

**Phase-applied approach**: Lightweight (inside the plan's overall Hybrid strategy)

**Violations**:
- **MEDIUM**: The spec calls for lightweight verification of server action return shapes, but there is no direct test or manual invocation evidence for `runWorkflow`, `stopWorkflow`, `restartWorkflow`, or `getWorkflowExecutionStatus`.
- **MEDIUM**: Live validation proved channel wiring and domain registration, but there is still no end-to-end proof that a concrete `execution-update` event becomes a populated `workflow-execution:{key}:status` entry.
- **MEDIUM**: Live harness/browser validation was skipped because CDP was unavailable, so the review could not observe the running UI path.

| AC | Confidence | Evidence |
|----|------------|----------|
| AC1 | 45% | `workflow-execution-manager.test.ts` verifies start-time broadcasts, `workflow-execution-route.test.ts` verifies event mapping, and the action file exists, but there is no direct action-level assertion and F002 leaves the input boundary unsafe. |
| AC2 | 0% | `workflow-execution-route.ts` uses the raw execution key as `instanceId`, and `parsePath()` rejects the resulting four-segment state path. |
| AC3 | 60% | Manager stop/broadcast semantics are unit-tested, but `stopWorkflow` itself is not exercised directly and no live/harness run observed the full action flow. |
| AC4 | 55% | Manager restart/reset/broadcast semantics are unit-tested, but `restartWorkflow` itself is not exercised directly and no live/harness run observed the full action flow. |

### E.5) Doctrine Compliance

**F005 — test doubles and determinism drift (MEDIUM)**

The Phase 3 broadcast tests add `vi.fn()`, `mockClear()`, `mock.calls`, and `setTimeout(10/50)` sleeps. That conflicts with the repo's documented testing rules:

- `docs/project-rules/rules.md:133-152` — no mock APIs; use full fakes
- `docs/project-rules/rules.md:133-138` — no timer sleeps in unit tests

The tests are still useful, but they are not aligned with the project's own doctrine and they stop short of the more important missing coverage: action-level return shapes and a mounted route/provider flow.

**Low-severity note**

`test/unit/web/state/workflow-execution-route.test.ts` also omits the repo's 5-field Test Doc blocks. That is not a verdict driver on its own, but it is worth correcting when the test suite is revisited.

### E.6) Harness Live Validation

Harness was available but not healthy enough for full browser/CDP validation.

- **Harness status**: `UNHEALTHY`
- **Summary**: The live app was up on `:3101`, the terminal sidecar was up on `:4601`, the MCP endpoint was reachable, `/api/events/workflow-execution` and `/api/events/mux?channels=workflow-execution,workflows` both returned `200 text/event-stream` heartbeats, and the State Inspector showed the `workflow-execution` domain registered. CDP still failed on `:9223`, and the Phase 3 workflow editor exposed only a disabled placeholder Run control, so full end-to-end execution validation remained unavailable.

| AC | Method | Result | Evidence |
|----|--------|--------|----------|
| AC1 | Live SSE/route probe | SKIP | The workflow page serialized `workflow-execution` in the channel list, direct + mux SSE endpoints returned `200` heartbeats, and server logs recorded `workflow-execution` subscribers, but there was no live Run control to invoke the server action itself in this phase. |
| AC2 | Live State Inspector probe | SKIP | The State Inspector listed `workflow-execution` as a registered domain, but no execution could be started live and F001 shows actual value publication is currently invalid. |
| AC3 | Live workflow editor probe | SKIP | The editor exposed only a disabled placeholder `▶ Run` button and no Stop control, so stop behavior could not be exercised live. |
| AC4 | Live workflow editor probe | SKIP | The editor exposed no Restart control in this phase, so restart behavior could not be exercised live. |

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC1 | Calling `runWorkflow` server action starts the workflow and broadcasts to `'workflow-execution'` SSE channel | Manager broadcast tests plus route-mapping tests provide indirect evidence; there is no direct action invocation, and the action input boundary is unsafe (F002). | 45% |
| AC2 | `useGlobalState('workflow-execution:{key}:status')` updates reactively as workflow progresses | The current key format produces invalid state paths. Direct parser probe failed with `got 4` segments. | 0% |
| AC3 | `stopWorkflow` server action halts execution within one iteration | Manager stop lifecycle and `'stopping'` broadcast tests exist, but there is no direct action test or live run. | 60% |
| AC4 | `restartWorkflow` clears state and starts fresh | Manager restart/reset/evict and `'execution-removed'` broadcast tests exist, but there is no direct action test or live run. | 55% |

**Overall coverage confidence**: 36%

## G) Commands Executed

```bash
git --no-pager status --short
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -12
git --no-pager diff --find-renames 734e0dc55874d2e27421c8e0bdff60eed744f44b 194b0ec6 > /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-3-sse-globalstate-plumbing/reviews/_computed.diff
git --no-pager diff --name-status 734e0dc55874d2e27421c8e0bdff60eed744f44b 194b0ec6
git --no-pager diff --unified=20 734e0dc55874d2e27421c8e0bdff60eed744f44b 194b0ec6 -- apps/web/app/actions/workflow-execution-actions.ts
git --no-pager diff --unified=20 734e0dc55874d2e27421c8e0bdff60eed744f44b 194b0ec6 -- test/unit/web/features/074-workflow-execution/workflow-execution-manager.test.ts
pnpm exec tsx -e "import { parsePath } from './packages/shared/src/state/path-parser.ts'; try { console.log(parsePath('workflow-execution:/tmp/wt:graph:status')); } catch (error) { console.error(String(error)); process.exit(1); }"
just harness doctor
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md
**Spec**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-spec.md
**Phase**: Phase 3: SSE + GlobalState Plumbing
**Tasks dossier**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-3-sse-globalstate-plumbing/tasks.md
**Execution log**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-3-sse-globalstate-plumbing/execution.log.md
**Review file**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-3-sse-globalstate-plumbing/reviews/review.phase-3-sse-globalstate-plumbing.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx | Modified | events | Re-verify after F001, but no direct code fix required right now |
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/app/actions/workflow-execution-actions.ts | Created | workflow-ui | Fix F002 and update boundary/facade usage per F004 |
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/create-execution-manager.ts | Modified | web-integration (unregistered) | Fix F004; reconcile owner and use events contract rather than `sseManager` internals |
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.ts | Modified | web-integration (unregistered) | Re-verify once F001/F002 are fixed; keep raw filesystem fields separate from public/state IDs |
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.types.ts | Modified | web-integration (unregistered) | Fix F001/F004; make public key/state ID safe and replace raw broadcast function dependency |
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/lib/state/state-connector.tsx | Modified | _platform/state | Re-verify after F001; no direct fix required unless route/owner changes |
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/lib/state/workflow-execution-route.ts | Created | _platform/state | Fix F001 |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/events/domain.md | Modified | docs | Update contract description / ownership notes after F003/F004 |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md | Modified | docs | Remove or realign Phase 3 ownership notes if manager/server actions do not belong here |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/state/domain.md | Modified | docs | Add `workflowExecutionRoute` to source/composition/concepts if retained |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-3-sse-globalstate-plumbing/execution.log.md | Created | plan-artifact | Update after fixes with concrete verification evidence |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-3-sse-globalstate-plumbing/tasks.fltplan.md | Created | plan-artifact | No direct fix required |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-3-sse-globalstate-plumbing/tasks.md | Created | plan-artifact | Update if domain ownership/classification changes |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/shared/src/features/027-central-notify-events/workspace-domain.ts | Modified | _platform/events | No direct code fix required unless contract naming changes |
| /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/074-workflow-execution/workflow-execution-manager.test.ts | Modified | test | Fix F005; replace mocks/timers and strengthen coverage |
| /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/state/workflow-execution-route.test.ts | Created | test | Add integration-oriented bridge evidence / Test Doc improvements as part of F005 |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/lib/state/workflow-execution-route.ts; /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.types.ts | Make the public execution/state key path-safe and use it consistently in SSE payloads, state routing, and UI subscriptions | Current raw key produces invalid GlobalState paths, so AC2 is broken |
| 2 | /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/app/actions/workflow-execution-actions.ts | Resolve a trusted workspace/worktree before calling the manager; do not trust raw client paths | Current action surface allows unvalidated worktree paths to flow into graph-state operations |
| 3 | /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/create-execution-manager.ts; /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/registry.md; /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/domain-map.md | Formalize the owning domain/facade and stop importing cross-domain internals directly | Domain ownership and contract boundaries are inconsistent |
| 4 | /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/074-workflow-execution/workflow-execution-manager.test.ts; /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/state/workflow-execution-route.test.ts | Replace `vi.fn()`/timer sleeps with fakes + deterministic controls, and add missing action/connector evidence | Current test suite violates repo rules and leaves key behavior only indirectly covered |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/registry.md | Add `web-integration` or remove the pseudo-domain from the plan/tasks/docs |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/domain-map.md | Add/remap the execution-manager owner node and its labeled edges |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/workflow-ui/domain.md | Add `workflow-execution-actions.ts` to source/composition/history if workflow-ui remains the owner |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/state/domain.md | Add `workflowExecutionRoute` to source/composition/concepts |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/events/domain.md | Update `WorkspaceDomain` contract description to include `WorkflowExecution` |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md | Remove or reassign the Phase 3 manager/server-action note if that surface is not positional-graph-owned |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/web-integration/domain.md | Create this file if `web-integration` remains the chosen owner |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md --phase 'Phase 3: SSE + GlobalState Plumbing'
