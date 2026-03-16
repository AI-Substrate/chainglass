# Code Review: Phase 6: Harness + CLI Tools

**Plan**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md
**Spec**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-spec.md
**Phase**: Phase 6: Harness + CLI Tools
**Date**: 2026-03-16
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Two source-level blockers remain: container-target execution does not resolve the actual harness container, and the idempotent template-reset path depends on `cg template delete`, which is not implemented in source. The committed phase artifacts also do not record the hybrid verification evidence the spec requires.

**Key failure areas**:
- **Implementation**: `--target container` fails, and template reset depends on an unsupported CLI contract.
- **Domain compliance**: `_platform/positional-graph/domain.md` was not updated to record the new Phase 6 CLI surface.
- **Testing**: `execution.log.md` is effectively empty, `tasks.md` remains unchecked, and no new tests/evidence were committed for the new CLI paths.
- **Doctrine**: `cg unit update` still has unstructured bad-input failure paths, and `deleteIfExists()` is dead code with a misleading contract.

## B) Summary

The local harness test-data flow is close: live validation confirmed that `just test-data create env`, rerun/reset behavior, `cg unit update --patch`, `cg unit delete`, and the `▸` command-visibility requirement all work against the currently built CLI bundle. However, the review found two blocking source issues: container mode is wired to a non-existent default container name, and `environment.ts` depends on `cg template delete` even though the current source CLI and `ITemplateService` do not expose any delete operation. That second issue is currently masked by a stale `apps/cli/dist/cli.cjs` bundle, which means the reviewed source and the manually exercised runtime are out of sync. Domain documentation is mostly current, but `_platform/positional-graph/domain.md` still needs a Phase 6 history entry, and the committed phase artifacts do not provide the hybrid test evidence required by the plan.

## C) Checklist

**Testing Approach: Hybrid**

- [ ] Targeted CLI/harness validation is captured in committed artifacts
- [ ] End-to-end `create env` / `run` / `stop` evidence is recorded with observed outcomes
- [ ] `just fft` (or equivalent lint/type/test evidence) is logged for the phase
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (not evidenced in phase artifacts)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/test-data.ts:28-32`; `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/test-data/cg-runner.ts:80-97` | correctness | `--target container` does not resolve the real harness container and fails live validation for AC-4. | Resolve the container name via `computePorts()`, plumb it through `resolveOptions()`, and make container-target arguments container-safe before revalidating. |
| F002 | HIGH | `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/test-data/environment.ts:66-67,204`; `/Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/commands/template.command.ts:235-308`; `/Users/jordanknight/substrate/074-actaul-real-agents/packages/workflow/src/interfaces/template-service.interface.ts:56-93` | correctness | Harness idempotent reset depends on `cg template delete`, but the reviewed source CLI and template service contract do not implement any template delete operation. | Add first-class template delete support (contract + service + CLI + tests) or stop calling an unsupported command from `environment.ts`. |
| F003 | HIGH | `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-6-harness-cli-tools/execution.log.md:1-19`; `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-6-harness-cli-tools/tasks.md:136-154` | testing | The committed phase artifacts record almost no verification evidence: the execution log is empty, all task checkboxes remain unchecked, and the hybrid testing strategy is not reflected in committed tests or logs. | Run the required validation (`just fft`, targeted CLI checks, harness flows), capture concrete output in `execution.log.md`, and update `tasks.md` to reflect completed work. |
| F004 | MEDIUM | `/Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/commands/unit.command.ts:260-272,353-380` | error-handling | `cg unit update` still throws or silently no-ops on bad `--patch`, malformed JSON, or failed `service.load()` calls for `--add-input/--add-output`. | Convert these cases to structured adapter errors and fail fast instead of crashing or silently skipping the requested change. |
| F005 | MEDIUM | `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md:150-169` | domain-md | `_platform/positional-graph/domain.md` does not record the new Phase 6 CLI surface for `cg unit update` / `cg unit delete`. | Add a `074-P6` history row describing the new CLI wrappers around `IWorkUnitService.update()` / `delete()`. |
| F006 | LOW | `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/test-data/cg-runner.ts:137-150` | doctrine | `deleteIfExists()` is dead code with misleading JSDoc and a hardcoded success result. | Remove it or return the real `runCg()` result once a caller exists. |

## E) Detailed Findings

### E.1) Implementation Quality

**F001 — container target is broken.** Live validation (`just harness test-data status --target container`) failed because `resolveOptions()` never computes a container name and `runCg()` falls back to `chainglass-wt`, while the actual harness naming convention is `chainglass-${computePorts().worktree}`. The container-mode acceptance criterion is therefore not met.

**F002 — template reset depends on a contract that does not exist in source.** `environment.ts` calls `cg template delete` in both `createTemplate()` and `cleanTestData()`, but `apps/cli/src/commands/template.command.ts` exposes only `save-from`, `list`, `show`, `instantiate`, `refresh`, and `instances`, and `ITemplateService` likewise has no delete method. The currently built `dist/cli.cjs` bundle masked this during manual validation, so the source under review is not self-consistent.

**F004 — bad-input error handling is still incomplete.** `loadPatchFile()` reads files synchronously without a structured error path, `JSON.parse()` is unguarded for `--inputs-json`/`--outputs-json`, and `--add-input` / `--add-output` silently skip user intent when the unit load fails. These are user-facing CLI paths and should fail predictably.

Additional note: `harness/test-data/patches/test-code.yaml` references `scripts/test-transform.sh`, and no such file exists in the repository. That leaves `just test-data run` unverified and should be checked when fixing the test evidence gap.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New harness files live under `harness/src/test-data` and `harness/src/cli/commands`; docs remain under `docs/`. |
| Contract-only imports | ✅ | Cross-domain imports stay on public package surfaces such as `@chainglass/positional-graph` and `@chainglass/shared`. |
| Dependency direction | ✅ | No new infra→business violations or business→business internal imports were introduced. |
| Domain.md updated | ❌ | `_platform/positional-graph/domain.md` lacks a `074-P6` history entry for the new CLI wrappers. |
| Registry current | ✅ | No new domains were introduced; `docs/domains/registry.md` remains accurate. |
| No orphan files | ✅ | Reviewed code files map to `_platform/positional-graph`, harness, or docs; the remaining phase docs are plan artifacts. |
| Map nodes current | ✅ | No new domain nodes were required by the committed changes. |
| Map edges current | ✅ | No new cross-domain contract edges were introduced beyond existing public package consumption. |
| No circular business deps | ✅ | No new business-domain cycles were introduced. |
| Concepts documented | ✅ | `_platform/positional-graph/domain.md` already has a Concepts table and no new public contract table entry was required beyond the missing history note. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `harness/src/test-data/cg-runner.ts` | None | None | Proceed |
| `harness/src/test-data/environment.ts` | None | None | Proceed |
| `harness/src/test-data/constants.ts` | None | None | Proceed |
| `harness/src/cli/commands/test-data.ts` | None | None | Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 45%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC10 | 80 | Live validator ran `just test-data create env` twice and observed successful create/reset behavior with 3 units, template, and workflow instance. |
| AC11 | 10 | Code path exists for `run`/`stop`, but no committed evidence was recorded and the flow was not exercised in the phase artifacts; `test-code.yaml` also points at a missing `scripts/test-transform.sh`. |
| AC12 | 95 | Live validation and manual spot-checks both observed every `cg` invocation printed to stderr with the `▸` prefix. |
| AC13 | 0 | Live validation failed `--target container`: the harness CLI targeted `chainglass-wt` instead of `chainglass-074-actaul-real-agents`. |
| AC-P6-5 (`cg unit update --patch`) | 90 | Direct CLI validation succeeded with `node apps/cli/dist/cli.cjs unit update test-agent --patch harness/test-data/patches/test-agent.yaml --workspace-path harness --json`. |
| AC-P6-6 (`cg unit delete` idempotent) | 95 | Direct CLI validation succeeded twice; the second delete still returned success without error. |

The committed execution artifacts remain the weakest part of this phase. `execution.log.md` contains no post-implementation task entries, `tasks.md` remains unchecked, and no new tests were committed for the new CLI surface.

### E.5) Doctrine Compliance

Project rules are present and the phase mostly follows the expected directory conventions, but two doctrine issues remain:

- `unit.command.ts` violates the project's explicit-error-handling rule by allowing malformed JSON, missing patch files, and failed unit loads to escape as uncaught exceptions or silent no-ops (see F004).
- `cg-runner.ts` exports unused helper `deleteIfExists()` with misleading JSDoc and a hardcoded success result (see F006). That is low severity, but it is not aligned with the project's preference for precise, truthful contracts.

### E.6) Harness Live Validation

Harness status: **HEALTHY**

| AC | Method | Result | Evidence |
|----|--------|--------|----------|
| AC-1 | `just test-data create env` | PASS | Created test-agent, test-code, test-user-input, saved template `test-workflow-tpl`, and instantiated workflow `test-workflow`; exit 0. |
| AC-2 | `just test-data create env` again | PASS | Repeated delete/create/update cycle and rebuilt template/workflow successfully; reset behavior confirmed. |
| AC-3 | Inspect stderr output | PASS | Every `cg` subcommand printed with `▸`, e.g. `▸ cg unit delete ...`, `▸ cg template save-from ...`. |
| AC-4 | `just harness test-data status --target container` + code inspection | FAIL | `runCg()` defaulted to `chainglass-wt`; no such container exists for this worktree. |
| AC-5 | Direct `cg unit update --patch` | PASS | `{"success":true,"command":"unit.update","data":{"slug":"test-agent"}}` exit 0. |
| AC-6 | Direct double-delete of `test-agent` | PASS | Delete remained idempotent on second invocation; exit 0 both times. |

Live validation skipped browser/CDP work because this phase is CLI/harness tooling. The harness app/container itself was healthy enough to exercise the CLI-facing acceptance criteria.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC10 | `just test-data create env` creates deterministic units/template/workflow and reruns from a clean state | Live validation ran `create env` twice successfully with reset semantics | 80 |
| AC11 | `just test-data run` / `just test-data stop` execute and halt the test workflow | Code path exists, but no committed evidence was recorded and runtime execution was not validated in this review pass | 10 |
| AC12 | Every harness-invoked `cg` command is visible with `▸` prefix | Observed in live validation and manual spot-checks | 95 |
| AC13 | `--target container` creates/inspects test data inside Docker | Live validation failed because the harness CLI targeted the wrong container | 0 |
| Phase 6 AC5 | `cg unit update test-agent --patch patch.yaml` applies the patch | Direct CLI validation passed | 90 |
| Phase 6 AC6 | `cg unit delete test-agent` is idempotent | Direct CLI validation passed twice | 95 |

**Overall coverage confidence**: 45%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -10
git --no-pager show --name-status --format=fuller 61952e3b
git --no-pager diff 9b912f29..61952e3b
just test-data create units
just test-data create template
just test-data clean
git --no-pager status --short
just harness health
just test-data create env
just test-data create env
just harness test-data status --target container
node apps/cli/dist/cli.cjs unit update test-agent --patch harness/test-data/patches/test-agent.yaml --workspace-path harness --json
node apps/cli/dist/cli.cjs unit delete test-agent --workspace-path harness --json
node apps/cli/dist/cli.cjs unit delete test-agent --workspace-path harness --json
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md
**Spec**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-spec.md
**Phase**: Phase 6: Harness + CLI Tools
**Tasks dossier**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-6-harness-cli-tools/tasks.md
**Execution log**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-6-harness-cli-tools/execution.log.md
**Review file**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-6-harness-cli-tools/reviews/review.phase-6-harness-cli-tools.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/commands/unit.command.ts | modified | `_platform/positional-graph` | Yes — F004 |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/how/workflow-execution.md | new | docs | Revalidate after F001/F002/F003 |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-6-harness-cli-tools/execution.log.md | new | plan-artifact | Yes — F003 |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-6-harness-cli-tools/tasks.fltplan.md | new | plan-artifact | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-6-harness-cli-tools/tasks.md | new | plan-artifact | Yes — F003 |
| /Users/jordanknight/substrate/074-actaul-real-agents/harness/README.md | modified | harness | Revalidate after F001/F003 |
| /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/test-data.ts | new | harness | Yes — F001 |
| /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/index.ts | modified | harness | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/test-data/cg-runner.ts | new | harness | Yes — F001, F006 |
| /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/test-data/constants.ts | new | harness | Review alongside F001 |
| /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/test-data/environment.ts | new | harness | Yes — F002 |
| /Users/jordanknight/substrate/074-actaul-real-agents/harness/test-data/patches/test-agent.yaml | new | harness | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/harness/test-data/patches/test-code.yaml | new | harness | Verify during AC11 revalidation |
| /Users/jordanknight/substrate/074-actaul-real-agents/harness/test-data/patches/test-user-input.yaml | new | harness | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/justfile | modified | root | No |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/test-data.ts; /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/test-data/cg-runner.ts | Make `--target container` resolve the real harness container and pass container-safe arguments | AC-4 failed in live validation; current code defaults to `chainglass-wt` and never computes the actual worktree container |
| 2 | /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/test-data/environment.ts; /Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/commands/template.command.ts; /Users/jordanknight/substrate/074-actaul-real-agents/packages/workflow/src/interfaces/template-service.interface.ts | Stop depending on unsupported `cg template delete`, or implement delete end-to-end in source | The reviewed source does not expose template delete, so idempotent cleanup/reset is not source-correct |
| 3 | /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-6-harness-cli-tools/execution.log.md; /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-6-harness-cli-tools/tasks.md | Add real hybrid verification evidence and update task completion state | The phase artifacts do not document the validation required by the spec |
| 4 | /Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/commands/unit.command.ts | Convert bad-input/update-load failure cases to structured CLI errors | Current behavior crashes or silently skips requested input/output changes |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md | Add a `074-P6` history entry for `cg unit update` / `cg unit delete` |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md --phase 'Phase 6: Harness + CLI Tools'
