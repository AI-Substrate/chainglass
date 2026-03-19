# Code Review: Phase 3: Harness Workflow Commands

**Plan**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/harness-workflow-runner-plan.md
**Spec**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/harness-workflow-runner-spec.md
**Phase**: Phase 3: Harness Workflow Commands
**Date**: 2026-03-19
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Phase 3 ships the command group structure, but the review found blocking gaps in failure classification, telemetry surfacing, target-resolution behavior, and verification evidence. The implementation is close, but the phase does not yet prove the success path it claims to deliver.

**Key failure areas**:
- **Implementation**: `workflow.run` classifies every non-zero exit as `timeout`, `workflow.logs` drops captured `stderrLines`, and `workflow run --target container` is not honored by the spawned CLI path.
- **Domain compliance**: permanent harness governance docs were not updated to record the Phase 076 direct-import exception and new workflow commands.
- **Reinvention**: `AutoCompletionRunner` re-ports helper logic that already exists in `dev/test-graphs/shared/helpers.ts` and `scripts/test-advanced-pipeline.ts`.
- **Testing**: no durable workflow-command tests were added, and the only recorded run evidence is degraded/timeout output rather than a successful completion.
- **Doctrine**: the workflow command group diverges from the existing harness option-resolution convention used by `test-data.ts`.

## B) Summary

The Phase 3 code is organized reasonably and the command surface exists, but the review found several material gaps that prevent approval. Domain boundaries are mostly respected — the harness remains external tooling and the direct positional-graph imports use exported package entrypoints — yet the permanent rules/ADR trail was not updated to match the new exception. The anti-reinvention pass found one meaningful overlap: the new auto-completion module duplicates existing helper concepts instead of extending them. Testing and evidence are the weakest areas: there are no durable workflow-command tests, and both the committed execution log and live validation failed to demonstrate a successful workflow run.

## C) Checklist

**Testing Approach: Hybrid**

- [ ] Harness command logic has durable test coverage
- [ ] Real workflow run captured to completion with all assertions passing
- [x] Manual/CLI verification steps were recorded with observed outcomes

**Universal**
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts:291-301` | correctness | `workflow.run` reports every non-zero exit as `timeout`, masking real workflow/auth/runtime failures. | Track whether the spawn timeout actually fired and emit `error` vs `timeout` accordingly. |
| F002 | HIGH | `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts:274-286,389-395` | error-handling | `workflow.logs` caches `stderrLines` during `workflow.run` but never returns them, so server-side orchestration errors are lost to callers. | Persist and expose `stderrLines` in `workflow.logs`, and include them in `--errors` output. |
| F003 | HIGH | `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts:62-66,128-167`; `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/test-data/cg-spawner.ts:44-66` | pattern | The workflow command group diverges from the existing harness target/workspace resolution pattern; `spawnCg()` ignores `target === container`. | Mirror `test-data.ts` option resolution, pass `workspacePath`/`containerName`, and branch the spawner for container execution. |
| F004 | HIGH | `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/harness-workflow-runner-spec.md:157-163`; `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-3-harness-workflow-commands/execution.log.md:61-136` | testing | The promised Hybrid strategy was not implemented as durable verification: no workflow-command tests or red/green evidence were added. | Add unit/integration coverage under `harness/tests` and record the failing/passing runs that drove the implementation. |
| F005 | HIGH | `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-3-harness-workflow-commands/execution.log.md:61-136,124-136` | testing | The required dogfooding proof is missing; the only recorded `workflow run` timed out/degraded and the log explicitly says full completion was not tested. | Capture a successful `reset -> run -> status -> logs` session with auto-complete enabled and real credentials. |
| F006 | MEDIUM | `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts:242-271` | scope | Built-in assertions are too coarse to prove node completion, Q&A handling, or session-chain correctness. | Add completion-oriented assertions and surface them in the run envelope/evidence. |
| F007 | MEDIUM | `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts:323-338` | scope | `workflow.status` returns node states but not the explicit active-pod / iteration detail promised by AC-6. | Extend the status payload or narrow AC-6 and align docs/evidence. |
| F008 | MEDIUM | `/Users/jordanknight/substrate/074-actaul-real-agents/docs/project-rules/harness.md:11,81,192`; `/Users/jordanknight/substrate/074-actaul-real-agents/docs/adr/adr-0014-first-class-agentic-development-harness.md:62` | domain-docs | The permanent harness rules/ADR do not record the Phase 076 direct-import exception or the new workflow commands. | Update `harness.md` and ADR-0014 (or a linked amendment) in the same fix set. |
| F009 | MEDIUM | `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/test-data/auto-completion.ts:52-109,171-279` | reinvention | `AutoCompletionRunner` re-ports disk-loader and Q&A helper logic that already exists elsewhere in the repo. | Extract or reuse the existing helper concepts so the logic does not diverge. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 — failure cause is mislabeled**: `workflow.run` sets `exitReason` to `timeout` for every non-zero exit (`/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts:293-301`). That means auth failures, CLI argument failures, and real workflow errors all look identical to agents.
- **F002 — forensic stderr is captured then discarded**: the run path caches `stderrLines` (`/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts:274-286`) but the logs path returns only cached events (`/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts:389-395`). This prevents `workflow logs` from surfacing the very server-side failures the phase was supposed to help debug.
- **F003 — option-resolution drift**: the workflow commands expose `--target`, but unlike `test-data.ts` they do not compute `workspacePath` or `containerName`, and `spawnCg()` always uses the local node path (`/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/test-data/cg-spawner.ts:63-66`). The live review confirmed local mode works, but container mode is not actually honored.
- **F006 — shallow assertions**: the run path validates only four coarse conditions (`workflow-started`, `drive-iterated`, `no-crash-errors`, `clean-exit`) and does not assert end-state semantics such as node completion, question answering, or session wiring.
- **F007 — status payload is thinner than promised**: `workflow.status` wraps `cg wf show --detailed`, which returns node states and blockers, but the observed payload does not include explicit iteration or active-pod information even though AC-6 promises both.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New source files live under `harness/src/` and plan artifacts live under the phase dossier directory. |
| Contract-only imports | ✅ | The direct positional-graph imports use exported package entrypoints (`./adapter`, `./interfaces`, `./features/030-orchestration`) rather than repo-internal file paths. |
| Dependency direction | ✅ | The harness remains an external consumer of infrastructure packages; no infrastructure-to-business reversal was introduced. |
| Domain.md updated | ❌ | `docs/project-rules/harness.md` and ADR-0014 were not updated to record the new workflow commands and Phase 076 direct-import exception. |
| Registry current | ✅ | No new registered domain was introduced, so `docs/domains/registry.md` does not need a new row. |
| No orphan files | ✅ | All changed files map cleanly to harness external tooling, project-root support files, or plan artifacts for this phase. |
| Map nodes current | ✅ | No new registered domain nodes were introduced. |
| Map edges current | ✅ | No registered domain dependency edges changed in a way that required a domain-map update. |
| No circular business deps | ✅ | The phase did not introduce any new business-domain cycles. |
| Concepts documented | N/A | No registered domain contract surface changed in this phase. |

**Domain notes**:
- The harness staying outside `docs/domains/` is correct for this phase.
- The review issue is not file placement; it is that the permanent governance docs still describe the harness as a pure web/public-API consumer while the code now contains an explicit direct-import exception.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| AutoCompletionRunner support helpers (disk work-unit loader, user-input completion, pending-question answering) | `/Users/jordanknight/substrate/074-actaul-real-agents/dev/test-graphs/shared/helpers.ts` and `/Users/jordanknight/substrate/074-actaul-real-agents/scripts/test-advanced-pipeline.ts` | `_platform/positional-graph`, `workflow-events` | Overlap found — prefer extending/extracting shared helper concepts |

### E.4) Testing & Evidence

**Coverage confidence**: 56%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-1 | 30% | Live `workflow.run` returned structured telemetry, but both the committed evidence and live validation ended degraded (`exitCode: 1`, `iterations: 0` or otherwise non-passing) rather than demonstrating a successful pass/fail workflow proof. |
| AC-6 | 25% | `workflow.status` returned node states, blockers, and session IDs, but the observed payload did not expose explicit active-pod data or iteration count. |
| AC-7 | 95% | Live validation ran `workflow reset` twice and both invocations returned identical successful envelopes. |
| AC-9 | 95% | `workflow reset`, `workflow run`, `workflow status`, `workflow logs`, `workflow logs --errors`, and `workflow logs --node ...` all returned parseable HarnessEnvelope JSON. |
| AC-10 | 40% | The loop is usable for investigation (`reset -> run -> status -> logs -> reset`), but there is no captured fix-and-rerun proof showing the phase’s full intended iteration contract. |
| AC-11 | 10% | `workflow.logs` returns a timeline, but server-side stderr captured during `workflow.run` is omitted from the log payload. |
| AC-12 | 70% | The commands ran in default local mode (no `docker exec` path), but the live health check was degraded and the successful workflow path was not proven. |
| AC-15 | 80% | The four disclosure levels were exercised live via `workflow.run`, `workflow.status`, `workflow.logs`, and `workflow.logs --node ...`. |

### E.5) Doctrine Compliance

Project rules are present, and the meaningful doctrine issues are all substantive rather than stylistic:

- **Target/workspace resolution convention drift**: the new workflow command group does not reuse the existing `test-data.ts` resolution pattern, which is why `target`/workspace behavior now differs between adjacent harness command groups.
- **Durable-test gap**: the phase adds a new CLI command group plus two new support modules, yet there are no corresponding `harness/tests` updates even though the spec chose a Hybrid strategy.
- **Telemetry contract gap**: the envelopes do not expose the complete timeline/error data that the phase dossier says agents should be able to read directly.

### E.6) Harness Live Validation

Harness status: **UNHEALTHY**

- The live validator reported a degraded health check (`app.down code 0`, `mcp.up 406`, `terminal.up`, `cdp.down`).
- Despite that, the local workflow commands were executable and returned valid envelopes.
- `workflow reset` passed live and was repeatable.
- `workflow run` failed live to produce a passing workflow execution (`exitCode: 1`, degraded status, no successful end-state proof).
- `workflow status` returned node states but not the richer pod/iteration detail promised by AC-6.
- `workflow logs` and `workflow logs --node ...` returned usable timeline views, but `workflow.logs` still hid cached stderr.

If harness was available:
- Harness status: UNHEALTHY
- Checks performed: AC-1, AC-6, AC-7, AC-9, AC-10, AC-11, AC-12, AC-15
- Evidence: live `reset/run/status/logs` command envelopes; degraded health summary; repeated reset success; node stuck/partial progress after run

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-1 | `harness workflow run` creates test data, executes, collects telemetry, reports pass/fail | Command exists and emits telemetry, but no passing workflow run was demonstrated in committed or live evidence. | 30% |
| AC-6 | `harness workflow status` returns node-level status, pods, sessions, iterations | Live output showed node states/blockers/sessions, but no explicit active-pod or iteration fields. | 25% |
| AC-7 | `harness workflow reset` cleans + recreates (idempotent) | Two live resets returned identical successful envelopes and recreated the test workflow. | 95% |
| AC-9 | All commands return HarnessEnvelope JSON | All exercised subcommands returned parseable HarnessEnvelope JSON. | 95% |
| AC-10 | Agent can iterate using reset→run→read→fix→repeat cycle | Investigative loop works, but no fix→rerun success proof was captured. | 40% |
| AC-11 | `harness workflow logs` captures execution timeline + server errors | Timeline exists, but server stderr/error output is still omitted from the logs envelope. | 10% |
| AC-12 | Works against local dev server | Commands executed in local mode; runtime health was degraded and success path remained unproven. | 70% |
| AC-15 | Progressive disclosure (4 levels) | Levels 1-4 were exercised live via run/status/logs/logs --node. | 80% |

**Overall coverage confidence**: 56%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -10
git --no-pager diff 8b4197a9..9f426d0b --stat
git --no-pager diff --name-status 8b4197a9..9f426d0b
git --no-pager diff 8b4197a9..9f426d0b > /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-3-harness-workflow-commands/reviews/_computed.diff
cd /Users/jordanknight/substrate/074-actaul-real-agents/harness && pnpm exec node -e "console.log(process.cwd())"
cd /Users/jordanknight/substrate/074-actaul-real-agents/harness && pnpm exec tsx src/cli/index.ts workflow reset
cd /Users/jordanknight/substrate/074-actaul-real-agents/harness && pnpm exec tsx src/cli/index.ts workflow run --timeout 3 --no-auto-complete
cd /Users/jordanknight/substrate/074-actaul-real-agents/harness && pnpm exec tsx src/cli/index.ts workflow status
cd /Users/jordanknight/substrate/074-actaul-real-agents/harness && pnpm exec tsx src/cli/index.ts workflow logs
just harness workflow reset
just harness workflow run --timeout 60
just harness workflow status
just harness workflow logs
just harness workflow logs --errors
just harness workflow logs --node test-user-input-941
just harness health
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/harness-workflow-runner-plan.md
**Spec**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/harness-workflow-runner-spec.md
**Phase**: Phase 3: Harness Workflow Commands
**Tasks dossier**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-3-harness-workflow-commands/tasks.md
**Execution log**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-3-harness-workflow-commands/execution.log.md
**Review file**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-3-harness-workflow-commands/reviews/review.phase-3-harness-workflow-commands.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/074-actaul-real-agents/.gitignore | Modified | project root | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-3-harness-workflow-commands/execution.log.md | Created | plan artifact | Update after rerun |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-3-harness-workflow-commands/tasks.fltplan.md | Created | plan artifact | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-3-harness-workflow-commands/tasks.md | Created | plan artifact | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/harness/package.json | Modified | harness external tooling | Only if dependency strategy changes |
| /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts | Created | harness external tooling | Yes |
| /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/index.ts | Modified | harness external tooling | Likely tests only |
| /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/test-data/auto-completion.ts | Created | harness external tooling | Medium |
| /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/test-data/cg-runner.ts | Modified | harness external tooling | Potential shared option-resolution extraction |
| /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/test-data/cg-spawner.ts | Created | harness external tooling | Yes |
| /Users/jordanknight/substrate/074-actaul-real-agents/justfile | Modified | project root | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/pnpm-lock.yaml | Modified | project root | Regenerate if dependency set changes |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts; /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/test-data/cg-spawner.ts | Distinguish real timeouts from generic non-zero exits; preserve `error` failures accurately | Agents currently receive incorrect failure causes. |
| 2 | /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts | Expose cached `stderrLines`/server errors through `workflow.logs` and `--errors` | AC-11 currently cannot be met from the command outputs alone. |
| 3 | /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts; /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/test-data/cg-spawner.ts | Reuse the existing target/workspace resolution convention and honor `--target container` in the spawn path | The command surface currently promises target selection that the implementation does not actually honor. |
| 4 | /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-3-harness-workflow-commands/execution.log.md; /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts; /Users/jordanknight/substrate/074-actaul-real-agents/harness/tests/unit/cli/index.test.ts | Add durable tests and capture a successful end-to-end dogfooding session | The phase selected a Hybrid strategy but ships without durable workflow-command coverage or a successful completion proof. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/project-rules/harness.md | New workflow commands, Phase 076 history entry, and the permanent statement of the direct-import exception |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/adr/adr-0014-first-class-agentic-development-harness.md | Amendment or linked follow-on note explaining the Phase 076 harness exception to the "public API only" rule |

### Next Step

`/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/harness-workflow-runner-plan.md --phase 'Phase 3: Harness Workflow Commands'`
