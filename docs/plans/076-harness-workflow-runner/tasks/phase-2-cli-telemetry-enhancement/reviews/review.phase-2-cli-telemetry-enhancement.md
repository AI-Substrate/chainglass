# Code Review: Phase 2: CLI Telemetry Enhancement

**Plan**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/harness-workflow-runner-plan.md
**Spec**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/harness-workflow-runner-spec.md
**Phase**: Phase 2: CLI Telemetry Enhancement
**Date**: 2026-03-17
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Phase 2 is not ready to approve because the shipped `cg wf show --detailed` output is malformed at runtime and the required Full Mode verification artifacts for hybrid evidence are missing.

**Key failure areas**:
- **Implementation**: `cg wf show --detailed` reads the wrong status field names (`line.id`, `node.id`, `node.type`, `readyDetail.reasons`), so runtime JSON omits line/node identifiers and never populates `blockedBy`.
- **Domain compliance**: CLI command code imports orchestration internals (`features/030-orchestration`) and constructs `PodManager`/`NodeFileSystemAdapter` directly instead of using the sanctioned read-only orchestration contract.
- **Testing**: Phase 2 `tasks.md` and `execution.log.md` are missing, so the plan's required Hybrid evidence for AC-3, AC-4, and AC-14 is unauditable.

## B) Summary

This review was scoped to the committed Phase 2 diff `e04a9bf8^..e04a9bf8`, which modified only `/Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/commands/positional-graph.command.ts` and `/Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/features/036-cli-orchestration-driver/cli-drive-handler.ts`.

Live validation confirmed that `cg wf run --json-events` does expose ONBAS decision data and ODS dispatch results in iteration payloads, and the GH token pre-flight guard behaved correctly when both `GH_TOKEN` and `GITHUB_TOKEN` were unset. However, `cg wf show --detailed` still does not satisfy AC-14: direct runtime probes and the harness live validator both showed malformed or incomplete node-level output.

Domain documentation is mostly current, but `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md` was not updated for 076-P2. More importantly, the Full Mode dossier and execution evidence required by the spec's Hybrid testing strategy are missing, so the phase still lacks its own durable proof even though review-time live validation now confirms AC-3 and AC-4. AC-14 still fails and lacks a correct, phase-owned verification log.

## C) Checklist

**Testing Approach: Hybrid**

For Hybrid:
- [ ] Command-level automated checks for `--detailed`, `--json-events`, and GH token pre-flight are present
- [ ] Real workflow execution evidence is recorded in `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-2-cli-telemetry-enhancement/execution.log.md`
- [ ] Acceptance criteria AC-3, AC-4, and AC-14 are backed by raw command output

Universal (all approaches):
- [x] Only in-scope Phase 2 source files were reviewed (`e04a9bf8^..e04a9bf8`)
- [ ] Linters/type checks are clean and traceable for this phase
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/commands/positional-graph.command.ts:260-285 | correctness | `cg wf show --detailed` maps nonexistent GraphStatusResult fields, so runtime output omits `lineId`, `nodeId`, `unitType`, and never populates `blockedBy`. | Map the real status contract (`lineId`, `nodeId`, `unitType`, `readyDetail.reason`) or build the response from `IGraphOrchestration.getReality()` so AC-14 is satisfied. |
| F002 | HIGH | /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-2-cli-telemetry-enhancement/execution.log.md | testing | Required Hybrid execution evidence for AC-3, AC-4, and AC-14 is missing. | Add raw command transcripts for GH token pre-flight, `wf run --json-events`, and `wf show --detailed --json`, with observed outcomes. |
| F003 | MEDIUM | /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-2-cli-telemetry-enhancement/tasks.md | testing | Full Mode phase dossier is missing, so there is no task-level record of scope completion or verification steps. | Create `tasks.md` with the completed task table, Problem Context reference, and explicit verification mapping. |
| F004 | MEDIUM | /Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/commands/positional-graph.command.ts:220-246 | domain | CLI command glue imports orchestration internals and constructs `PodManager` directly instead of using the public read-only orchestration handle. | Move detailed-status composition behind a sanctioned positional-graph contract and keep CLI code to DI resolution plus formatting. |
| F005 | LOW | /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md:150-170 | domain | The positional-graph domain history table omits the 076-P2 telemetry enhancement. | Add a 076-P2 history row documenting `--detailed`, `--json-events`, and the token pre-flight change. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)** — `/Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/commands/positional-graph.command.ts:260-285`
  - The new mapper treats `statusResult.lines` as though it exposes `line.id` and `node.id`/`node.type`, but the actual contract exposes `lineId`, `nodeId`, and `unitType` (`/Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/interfaces/positional-graph-service.interface.ts:272-402`).
  - It also reads `nodeReality?.readyDetail?.reasons`, but the readiness contract only exposes `readyDetail.reason` (`/Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/reality.types.ts:31-39`).
  - Direct runtime probe evidence:
    - Baseline `wf status --json` returned `lineId`, `nodeId`, `unitType`, and `readyDetail.reason`.
    - `wf show --detailed --json` returned node objects with keys only `unitSlug`, `status`, `startedAt`, `completedAt`, `error`, `sessionId`, `blockedBy`; `id` and `type` were absent entirely.
- `cg wf run --json-events` emitted NDJSON lines correctly in manual probes, and the GH token pre-flight printed the expected error message with exit code 1 when `GH_TOKEN` and `GITHUB_TOKEN` were unset.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ❌ | Phase 2 placed telemetry composition logic inside `/Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/commands/positional-graph.command.ts`, even though `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md:39-40` says CLI presentation is not owned by the positional-graph domain. |
| Contract-only imports | ❌ | `/Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/commands/positional-graph.command.ts:220-223` deep-imports `@chainglass/positional-graph/features/030-orchestration` and constructs `PodManager`/`NodeFileSystemAdapter` directly instead of using a public contract. |
| Dependency direction | ✅ | No new infrastructure → business or business → business violations were introduced in the reviewed diff. |
| Domain.md updated | ❌ | `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md:150-170` has no 076-P2 history entry. |
| Registry current | ✅ | No new domains were added; `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/registry.md` remains current for this phase. |
| No orphan files | ✅ | Both changed files appear in the plan's Domain Manifest. |
| Map nodes current | ✅ | No new domain nodes or health summary updates were required for this diff. |
| Map edges current | ✅ | No new cross-domain dependency edges were introduced. |
| No circular business deps | ✅ | No business-domain cycle was introduced by the reviewed changes. |
| Concepts documented | ✅ | `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md` already has a Concepts section; this diff did not add a new positional-graph contract. |

Additional notes:
- `/Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/orchestration-service.types.ts:66-87` already exposes `IGraphOrchestration.getReality()` as a sanctioned read-only orchestration surface. The CLI bypassed that existing contract.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| Detailed workflow status view (`cg wf show --detailed`) | Existing building blocks in `IPositionalGraphService.getStatus()` + `loadGraphState()` and `IGraphOrchestration.getReality()` | `_platform/positional-graph` | Proceed, but reuse the sanctioned public handle instead of re-composing internals in CLI glue |
| NDJSON DriveEvent emission (`cg wf run --json-events`) | `cg agent run --stream` NDJSON event streaming | `agents` | Extend |
| GH token pre-flight validation | Existing token-init guard in `/Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/lib/container.ts` | CLI infrastructure | Reuse opportunity, non-blocking |

No blocking reinvention was found. The only material reuse concern is that the GH token pre-flight duplicates an existing validation responsibility instead of centralizing it.

### E.4) Testing & Evidence

**Coverage confidence**: 58%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-3 | 80 | Live harness validation exercised the local built CLI on an isolated one-node workflow and observed iteration payload data including `actions[0].request.type=\"start-node\"`, `stopReason=\"graph-failed\"`, and `finalReality.settings.agentType=\"claude-code\"`. The phase execution log is still missing, so this evidence exists only in the review artifact. |
| AC-4 | 80 | Live harness validation observed ODS dispatch results in `--json-events` iteration data: a success path with `result:{ok:true,newStatus:\"starting\"}` and a failure path with `result:{ok:false,error:{code:\"POD_CREATION_FAILED\",...}}`. The phase execution log is still missing, so this evidence exists only in the review artifact. |
| AC-14 | 45 | Direct implementation exists in `/Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/commands/positional-graph.command.ts`, and both manual probes and live validation exercised the command, but the output was malformed/incomplete and there is no phase execution log capturing a correct result because the command still fails the acceptance criterion. |

### E.5) Doctrine Compliance

No separate doctrine/rules violations were identified from `/Users/jordanknight/substrate/074-actaul-real-agents/docs/project-rules/rules.md`, `/Users/jordanknight/substrate/074-actaul-real-agents/docs/project-rules/idioms.md`, `/Users/jordanknight/substrate/074-actaul-real-agents/docs/project-rules/architecture.md`, or `/Users/jordanknight/substrate/074-actaul-real-agents/docs/project-rules/constitution.md` beyond the implementation, domain, and testing issues already captured above.

### E.6) Harness Live Validation

Harness status: **UNHEALTHY**

| AC | Method | Result | Evidence |
|----|--------|--------|----------|
| AC-3 | `just harness doctor --wait 120`, followed by live `node apps/cli/dist/cli.cjs wf run ... --json-events` against an isolated one-node workflow | PASS | The iteration event exposed ONBAS decision data: `actions[0].request.type=\"start-node\"`, `stopReason=\"graph-failed\"`, and `finalReality.settings.agentType=\"claude-code\"` were present in stdout. |
| AC-4 | Live `node apps/cli/dist/cli.cjs wf run ... --json-events` executions against claude-code and copilot-backed isolated workflows | PASS | Iteration payloads exposed ODS dispatch results. The claude workflow showed `result:{ok:true,newStatus:\"starting\"}`; the copilot workflow showed `result:{ok:false,error:{code:\"POD_CREATION_FAILED\",message:\"CopilotClient not initialized. Set GH_TOKEN and call initCopilotClient() first.\"}}`. |
| AC-14 | `node apps/cli/dist/cli.cjs wf show p2-claude-wf --detailed --json --workspace-path <temp>` compared to the workflow state files from the same run | FAIL | `wf show --detailed` returned node data like `{status:\"blocked-error\",startedAt:null,completedAt:null,error:null,sessionId:null}` while the underlying state contained a real `started_at` timestamp and `error` payload. Node-level timing/error data existed on disk but was not surfaced by `--detailed`. |

Additional harness evidence:
- `just harness health` returned `degraded` with app/MCP/terminal up and CDP down.
- `just harness doctor --wait 60` and the later live-validator `just harness doctor --wait 120` both ended with degraded/unhealthy harness status because CDP stayed unavailable on port `9223`, so browser/CDP validation could not be completed during review.
- `env -u GH_TOKEN -u GITHUB_TOKEN node apps/cli/dist/cli.cjs wf run test-workflow --json-events --workspace-path /Users/jordanknight/substrate/074-actaul-real-agents` produced the expected pre-flight message and exited with code 1.
- Despite the unhealthy CDP/browser layer, CLI-based live validation still succeeded for AC-3 and AC-4 using isolated workflows.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-3 | What ONBAS decided visible at each iteration | Live CLI validation on an isolated workflow exposed iteration payload fields including `request.type=\"start-node\"`, `stopReason`, and `finalReality.settings.agentType`, proving ONBAS decision data is present in `--json-events`. | 80 |
| AC-4 | What ODS dispatched visible at each iteration | Live CLI validation captured both successful and failed ODS dispatch results in iteration payloads, including `newStatus:\"starting\"` and a `POD_CREATION_FAILED` error object. | 80 |
| AC-14 | `cg wf show --detailed` returns node-level status with per-node state, timing, and pod session info | Live validation compared `--detailed` output to the workflow state files and showed that timing/error data existed on disk but was not surfaced correctly by `--detailed`. | 45 |

**Overall coverage confidence**: 58%

## G) Commands Executed

```bash
git --no-pager status --short
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -12
git --no-pager show --stat --name-status --format=fuller e04a9bf8
git --no-pager diff e04a9bf8^ e04a9bf8 > /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-2-cli-telemetry-enhancement/reviews/_computed.diff
node apps/cli/dist/cli.cjs wf show test-workflow --json --workspace-path /Users/jordanknight/substrate/074-actaul-real-agents
node apps/cli/dist/cli.cjs wf status test-workflow --json --workspace-path /Users/jordanknight/substrate/074-actaul-real-agents
node apps/cli/dist/cli.cjs wf show test-workflow --detailed --json --workspace-path /Users/jordanknight/substrate/074-actaul-real-agents
env -u GH_TOKEN -u GITHUB_TOKEN node apps/cli/dist/cli.cjs wf run test-workflow --json-events --workspace-path /Users/jordanknight/substrate/074-actaul-real-agents
just harness health
just harness doctor --wait 60
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/harness-workflow-runner-plan.md
**Spec**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/harness-workflow-runner-spec.md
**Phase**: Phase 2: CLI Telemetry Enhancement
**Tasks dossier**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-2-cli-telemetry-enhancement/tasks.md (missing)
**Execution log**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-2-cli-telemetry-enhancement/execution.log.md (missing)
**Review file**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-2-cli-telemetry-enhancement/reviews/review.phase-2-cli-telemetry-enhancement.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/commands/positional-graph.command.ts | Modified | _platform/positional-graph | Fix the `--detailed` mapper and stop reaching into orchestration internals from CLI glue |
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/features/036-cli-orchestration-driver/cli-drive-handler.ts | Modified | _platform/positional-graph | Keep NDJSON path, but add evidence/tests if touched again |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-2-cli-telemetry-enhancement/tasks.md | Missing | plan artifact | Create Full Mode dossier with completed task table and verification mapping |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-2-cli-telemetry-enhancement/execution.log.md | Missing | plan artifact | Add raw Phase 2 verification evidence |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md | Stale | _platform/positional-graph | Add 076-P2 history entry |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/commands/positional-graph.command.ts | Rebuild `wf show --detailed` from the real status/reality contract so line/node IDs, unit types, timing, sessions, and blockers are correct | AC-14 currently fails at runtime |
| 2 | /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-2-cli-telemetry-enhancement/tasks.md | Create the missing Full Mode tasks dossier | Review cannot audit scope completion without it |
| 3 | /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-2-cli-telemetry-enhancement/execution.log.md | Add raw verification evidence for GH token pre-flight, `wf run --json-events`, and `wf show --detailed --json` | Hybrid testing evidence is currently missing |
| 4 | /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md | Add a 076-P2 history row | Domain documentation is stale for this phase |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md | 076-P2 history entry documenting CLI telemetry enhancement |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/harness-workflow-runner-plan.md --phase 'Phase 2: CLI Telemetry Enhancement'
