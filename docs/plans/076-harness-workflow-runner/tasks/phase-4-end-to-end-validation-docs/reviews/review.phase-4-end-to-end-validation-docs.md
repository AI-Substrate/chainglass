# Code Review: Phase 4: End-to-End Validation + Docs

**Plan**: `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/harness-workflow-runner-plan.md`
**Spec**: `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/harness-workflow-runner-spec.md`
**Phase**: Phase 4: End-to-End Validation + Docs
**Scope**: Shipped Subtask 001 commit for `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-4-end-to-end-validation-docs/001-subtask-workflow-rest-api-sdk.md` (`b3bd13bd..HEAD`)
**Date**: 2026-03-23
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid (spec); observed evidence aligns only to Lightweight

## A) Verdict

**REQUEST_CHANGES**

The REST API and `WorkflowApiClient` work live when called directly with the correct registered harness worktree, but the shipped harness wrapper does not. `harness workflow run --server` and `harness workflow status --server` currently fail against the live harness because they send the wrong worktree path and default to the wrong server URL, so the core promised integration is not yet working.

**Key failure areas**:
- **Implementation**: `workflow --server` binds the SDK to the host repo path instead of the registered harness worktree and mishandles idempotent already-running responses.
- **Domain compliance**: `workflow-ui` / `_platform/positional-graph` domain docs and the domain map were not updated for the new REST surface and direct `IOrchestrationService`/`auth()` usage.
- **Reinvention**: `/detailed` duplicates the CLI serializer logic and `_resolve-worktree.ts` duplicates existing validation logic, creating contract-drift risk.
- **Testing**: The subtask promised Fake/Real parity and hybrid real-run evidence, but only fake-backed tests were committed and `execution.log.md` is missing.
- **Doctrine**: The harness wrapper bypasses the documented per-worktree port-allocation mechanism by hardcoding `http://localhost:3000`.

## B) Summary

The subtask lands the right building blocks: the Tier 1 REST routes exist, the SDK interface is clear, and direct `WorkflowApiClient` calls against a live harness-backed app succeeded for `run`, `getStatus`, `getDetailed`, and `stop`. The failure is in the last mile integration: the harness `--server` wrapper resolves the wrong worktree path and the wrong default base URL, so the shipped feature cannot be exercised through the intended `harness workflow` entrypoint. Testing and evidence are also below the bar set in the spec and subtask dossier: Fake/Real parity is claimed but not implemented, and no committed execution log proves the live path. Domain artifacts are stale for the new workflow-ui REST surface, so the docs do not yet reflect the shipped architecture.

## C) Checklist

**Testing Approach: Hybrid**

- [x] Unit/contract tests exist for the fake SDK implementation
- [ ] Real workflow integration evidence is committed for the REST/SDK path
- [ ] Fake/Real parity is proven by the same shared contract suite
- [ ] Harness `workflow run --server` is validated end-to-end against a live app

Universal:

- [x] Only in-scope files changed for the subtask commit
- [ ] Linters/type checks/test claims are reproducible from committed phase evidence
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts:71-77,295-300,508-510` | correctness | `workflow --server` sends the host repo path with `workspaceSlug='harness-test-workspace'`, which fails live with `400 Invalid workspace/worktree`. | Resolve the actual seeded worktree path per target and pass that into `WorkflowApiClient`. |
| F002 | HIGH | `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts:64-77,284-299,503-510` | doctrine | `--server` defaults to `http://localhost:3000` instead of the harness app port from `computePorts()`, so it points at the wrong app for most worktrees. | Derive the default base URL from the computed harness app port and keep `--server-url` as an override only. |
| F003 | HIGH | `/Users/jordanknight/substrate/074-actaul-real-agents/harness/tests/unit/sdk/workflow-api-client.test.ts:2-9,19-23,177-184` | testing | The shared contract suite only runs against `FakeWorkflowApiClient`; promised Fake/Real parity is absent. | Execute the same contract factory against a real `WorkflowApiClient` backed by a live test server. |
| F004 | HIGH | `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-4-end-to-end-validation-docs/execution.log.md` | testing | The spec requires hybrid evidence with a real workflow run, but Phase 4 `execution.log.md` is missing and no committed artifact proves the live REST/SDK/browser path. | Commit real run evidence for `workflow run --server`, `workflow status --server`, REST responses, and observed browser/SSE behavior. |
| F005 | MEDIUM | `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts:96-106` | correctness | Idempotent `409` / `{ ok: false, already: true }` start responses are treated as fatal before `already` handling. | Treat `already:true` as a success path and continue polling/reporting the running execution. |
| F006 | MEDIUM | `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/workflow-ui/domain.md`, `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md`, `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/domain-map.md` | domain | Domain docs/map were not updated for the new workflow-ui REST execution surface and direct `IOrchestrationService` / `auth()` consumption. | Update contracts/composition/history in the domain docs and adjust the domain-map edge labels + health summary. |
| F007 | LOW | `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/app/api/workspaces/[slug]/workflows/[graphSlug]/detailed/route.ts:79-131`, `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/app/api/workspaces/[slug]/workflows/[graphSlug]/execution/_resolve-worktree.ts:14-25` | reinvention | The REST detailed formatter duplicates the CLI `--detailed` serializer and `_resolve-worktree.ts` duplicates existing validation logic from server actions. | Extract shared serializer/validation helpers to reduce drift between CLI, REST, and action paths. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)** — The harness wrapper currently constructs `WorkflowApiClient` with `workspaceSlug = 'harness-test-workspace'` but `worktreePath = resolveProjectRoot()`. Live validation showed the wrapper sending `/Users/jordanknight/substrate/074-actaul-real-agents` into `/api/workspaces/harness-test-workspace/...`, which the app correctly rejected as `400 Invalid workspace/worktree`. The direct SDK path succeeds only when the registered harness worktree (`/app/scratch/harness-test-workspace`) is supplied instead.
- **F005 (MEDIUM)** — The route intentionally uses `409` to signal “already running”, but `runViaServer()` exits on `!runResult.ok` before it checks `runResult.already`. That makes idempotent re-runs look like hard failures even though the API contract exposes an `already` flag for exactly this case.
- No additional correctness/security/performance issues were surfaced by the implementation-quality review pass beyond the wrapper integration problems verified during live validation.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New files are under declared workflow-ui, positional-graph, and external harness source trees. |
| Contract-only imports | ✅ | No cross-domain internal-file import violations were found in shipped code. |
| Dependency direction | ✅ | workflow-ui consumes infrastructure contracts; no infra→business inversion was found. |
| Domain.md updated | ❌ | `workflow-ui/domain.md` and `_platform/positional-graph/domain.md` do not reflect the new REST surface / consumer relationship. |
| Registry current | ✅ | No new domains were added, so `docs/domains/registry.md` remains current. |
| No orphan files | ✅ | Harness files are external tooling and are explicitly declared as such in plan/docs. |
| Map nodes current | ❌ | `workflow-ui` is still modeled as a leaf/editor-only node even though the REST execution surface now exists. |
| Map edges current | ❌ | The map omits `workflowUI -> posGraph` usage of `IOrchestrationService` and API-route `auth()` consumption from `_platform/auth`. |
| No circular business deps | ✅ | No new business-domain cycle was introduced. |
| Concepts documented | ⚠️ | `workflow-ui/domain.md` still has no Concepts section covering execution REST concepts. |

Domain artifact fix needed:

- **F006 (MEDIUM)** — Update the touched domain docs and the domain map for the new workflow-ui execution REST surface, the direct `IOrchestrationService` consumption in `/detailed`, and the API-route `auth()` session checks.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| Workflow detailed status formatter | CLI `--detailed` formatter in `/Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/commands/positional-graph.command.ts:218-272` | `_platform/positional-graph` | ⚠️ Duplicate serializer logic — extract/extend shared formatter |
| Strict worktree validation helper | `resolveValidatedWorktreePath` logic in `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/app/actions/workflow-execution-actions.ts:28-40` | `workflow-ui` | ⚠️ Low duplication — reuse/extract shared helper |

### E.4) Testing & Evidence

**Coverage confidence**: 36%

| AC | Confidence | Evidence |
|----|------------|----------|
| Spec strategy: Hybrid (unit + real integration) | 10 | Spec requires Hybrid/no-mocks/real-run evidence; `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-4-end-to-end-validation-docs/execution.log.md` is missing. |
| `IWorkflowApiClient` contract is well-defined | 85 | `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/sdk/workflow-api-client.interface.ts:15-131` and `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/sdk/workflow-api-client.ts:24-173`. |
| SDK is independently testable with fake client | 90 | `FakeWorkflowApiClient` + 16 passing fake-backed tests in `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/sdk/fake-workflow-api-client.ts` and `/Users/jordanknight/substrate/074-actaul-real-agents/harness/tests/unit/sdk/workflow-api-client.test.ts`. |
| Fake/Real parity is evidenced | 10 | Shared suite is only invoked for the fake implementation. |
| Tier 1 REST endpoints behave as promised | 40 | Route files exist and direct live `WorkflowApiClient` calls succeeded for run/status/detailed/stop when supplied the correct registered worktree. |
| `harness workflow run --server` and `status --server` work via REST | 20 | The wrapper hits the right endpoints, but live runs fail with invalid worktree because the wrapper builds the wrong context. |
| Harness-triggered runs are visible in browser via SSE | 5 | No committed screenshot, SSE capture, or execution-log artifact proves this goal. |
| Engine-level drive lock prevents concurrent corruption | 25 | Code moved the lock into `GraphOrchestration.drive()`, but no committed concurrency proof or lock-specific test transcript was provided. |

### E.5) Doctrine Compliance

- **F002 (HIGH)** — `docs/project-rules/harness.md` documents dynamic per-worktree harness ports, but the shipped `--server` wrapper bypasses that mechanism with a hardcoded `http://localhost:3000`.
- **F003 (HIGH)** — The project rules/constitution expect shared contract tests to prove both fake and real implementations for externally consumed SDK contracts; this subtask claims that pattern but does not actually execute it.
- No other rule violations were strong enough to rise above note level.

### E.6) Harness Live Validation

Harness status: **UNHEALTHY**

| Check | Result | Evidence |
|-------|--------|----------|
| Harness boot and scoped availability | PASS | `just harness stop && just harness dev` brought the app up on `http://127.0.0.1:3101`; `curl -I` returned `200 OK`. |
| `just harness health` | FAIL | Health remained degraded because CDP was down (`cdp.status = down`, `mcp.code = 406`). |
| REST API + direct `WorkflowApiClient` | PASS | Direct SDK calls against `http://127.0.0.1:3101` with `workspaceSlug=harness-test-workspace` and `worktreePath=/app/scratch/harness-test-workspace` successfully exercised `getDetailed`, `run`, `getStatus`, and `stop`. |
| `harness workflow run --server` | FAIL | Returned `E133 Invalid workspace or worktree`; app logs showed `POST /api/workspaces/harness-test-workspace/workflows/test-workflow/execution 400`. |
| `harness workflow status --server` | FAIL | Returned `E100 Invalid worktree`; app logs showed `GET /api/workspaces/harness-test-workspace/workflows/test-workflow/detailed?... 400`. |

Live-validation conclusion:

- The REST API and SDK themselves are viable.
- The harness wrapper is not yet viable because it resolves the wrong runtime context.
- The harness was usable enough to validate the bug, but not healthy enough to count as a clean harness pass.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| ST-G1 | Harness can trigger workflow execution via web server REST API | Live direct `WorkflowApiClient.run()` passed with registered harness worktree; `harness workflow run --server` failed due wrapper context bug | 20 |
| ST-G2 | User sees harness-triggered runs in browser via same SSE path | No committed screenshot/SSE transcript or execution-log artifact | 5 |
| ST-G3 | SDK is independently testable with `FakeWorkflowApiClient` | Fake client and 16 tests shipped | 90 |
| ST-G4 | Contract well-defined via `IWorkflowApiClient` interface | Interface + client implementation shipped and consumed | 85 |
| ST-G5 | Drive lock prevents concurrent CLI + web corruption | Engine-level lock code shipped; no committed concurrency evidence | 25 |
| ST-G6 | Fake/Real parity proven | Shared contract suite only runs fake implementation | 10 |
| ST-G7 | Hybrid testing strategy satisfied | No Phase 4 execution log; no committed real-run proof | 10 |

**Overall coverage confidence**: 36%

## G) Commands Executed

```bash
git --no-pager status --short
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -12
git --no-pager diff --name-status b3bd13bd..HEAD
git --no-pager diff --binary b3bd13bd..HEAD > /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-4-end-to-end-validation-docs/reviews/_computed.diff
git --no-pager show --stat --summary --format=fuller HEAD
git --no-pager show --format= --unified=80 HEAD -- apps/cli/src/commands/positional-graph.command.ts apps/web/app/api/workspaces/[slug]/workflows/[graphSlug]/detailed/route.ts apps/web/app/api/workspaces/[slug]/workflows/[graphSlug]/execution/_resolve-worktree.ts apps/web/app/api/workspaces/[slug]/workflows/[graphSlug]/execution/restart/route.ts apps/web/app/api/workspaces/[slug]/workflows/[graphSlug]/execution/route.ts harness/src/cli/commands/workflow.ts harness/src/sdk/fake-workflow-api-client.ts harness/src/sdk/workflow-api-client.interface.ts harness/src/sdk/workflow-api-client.ts harness/tests/unit/sdk/workflow-api-client.test.ts packages/positional-graph/src/features/030-orchestration/graph-orchestration.ts > /Users/jordanknight/.copilot/session-state/5668e8f2-3cfd-4bae-b235-12ad85b5ca97/files/076_p4_st001_diff_context.patch
just harness stop
just harness dev
just harness health
just harness seed
curl -I http://127.0.0.1:3101/
cd harness && pnpm exec tsx src/cli/index.ts workflow run --server --server-url http://127.0.0.1:3101 --timeout 10
cd harness && pnpm exec tsx src/cli/index.ts workflow status --server --server-url http://127.0.0.1:3101
docker logs --since 2m chainglass-074-actaul-real-agents
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/harness-workflow-runner-plan.md`
**Spec**: `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/harness-workflow-runner-spec.md`
**Phase**: Phase 4: End-to-End Validation + Docs
**Tasks dossier**: `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-4-end-to-end-validation-docs/tasks.md`
**Subtask dossier**: `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-4-end-to-end-validation-docs/001-subtask-workflow-rest-api-sdk.md`
**Execution log**: `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-4-end-to-end-validation-docs/execution.log.md` _(missing)_
**Review file**: `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-4-end-to-end-validation-docs/reviews/review.phase-4-end-to-end-validation-docs.md`
**Computed diff**: `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-4-end-to-end-validation-docs/reviews/_computed.diff`

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| `/Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/commands/positional-graph.command.ts` | Modified | _platform/positional-graph | None from this review |
| `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/app/api/workspaces/[slug]/workflows/[graphSlug]/execution/route.ts` | Added | workflow-ui | None; wrapper failures are in harness client wiring |
| `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/app/api/workspaces/[slug]/workflows/[graphSlug]/execution/restart/route.ts` | Added | workflow-ui | None |
| `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/app/api/workspaces/[slug]/workflows/[graphSlug]/execution/_resolve-worktree.ts` | Added | workflow-ui | Optional deduplication with existing server-action helper |
| `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/app/api/workspaces/[slug]/workflows/[graphSlug]/detailed/route.ts` | Added | workflow-ui | Optional serializer extraction |
| `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts` | Modified | _(harness)_ | **Fix required** |
| `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/sdk/workflow-api-client.interface.ts` | Added | _(harness)_ | No direct fix; keep interface as source of truth |
| `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/sdk/workflow-api-client.ts` | Added | _(harness)_ | No direct fix found; direct live calls worked |
| `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/sdk/fake-workflow-api-client.ts` | Added | _(harness)_ | Consider parity cleanup only if needed |
| `/Users/jordanknight/substrate/074-actaul-real-agents/harness/tests/unit/sdk/workflow-api-client.test.ts` | Added | _(harness)_ | **Fix required** |
| `/Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/graph-orchestration.ts` | Modified | _platform/positional-graph | None blocking; add proof if lock behavior is kept |
| `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/workflow-ui/domain.md` | Unchanged | workflow-ui | **Update required** |
| `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md` | Unchanged | _platform/positional-graph | **Update required** |
| `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/domain-map.md` | Unchanged | docs | **Update required** |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts` | Resolve the actual seeded worktree path and default app URL for `--server` mode instead of using `resolveProjectRoot()` and `localhost:3000`. | Live harness validation proved `run --server` and `status --server` fail with `Invalid workspace/worktree`. |
| 2 | `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts` | Treat `{ ok: false, already: true }` / `409` as idempotent success. | Re-running against an already active workflow should not hard-fail. |
| 3 | `/Users/jordanknight/substrate/074-actaul-real-agents/harness/tests/unit/sdk/workflow-api-client.test.ts` | Run the shared contract suite against a real `WorkflowApiClient`, not just the fake. | The claimed Fake/Real parity is currently unproven. |
| 4 | `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-4-end-to-end-validation-docs/execution.log.md` | Add concrete real-run evidence for the REST/SDK/harness path. | The spec requires hybrid testing evidence and the subtask claims live behavior that is not currently documented. |
| 5 | `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/workflow-ui/domain.md`, `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md`, `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/domain-map.md` | Update domain docs/map for the new workflow-ui REST execution surface and dependencies. | Domain artifacts are stale for the shipped change. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/workflow-ui/domain.md` | REST execution API in composition/source/dependencies/history; Concepts section for execution REST surface |
| `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md` | `workflow-ui` as current `IOrchestrationService` consumer; Plan 076 Subtask 001 history note if retained |
| `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/domain-map.md` | `workflowUI -> posGraph` edge label including `IOrchestrationService`; `workflowUI -> auth` edge label including `auth()`; node/health-summary text for REST surface |

### Next Step

`/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/harness-workflow-runner-plan.md --phase 'Phase 4: End-to-End Validation + Docs'`
