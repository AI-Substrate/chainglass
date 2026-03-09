# Code Review: Phase 2: Agent Runner Infrastructure

**Plan**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/agent-runner-plan.md
**Spec**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/agent-runner-spec.md
**Phase**: Phase 2: Agent Runner Infrastructure
**Date**: 2026-03-07
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Lightweight

## A) Verdict

**REQUEST_CHANGES**

The phase establishes the intended harness agent-runner scaffolding, but the shipped runner/CLI path is not yet reliable enough to approve: default harness-root resolution is wrong, schema-backed runs have no dependable `report.json` pipeline, timeout/preflight contracts are incomplete, and the new durable tests miss the repository's mandatory Test Doc standard.

**Key failure areas**:
- **Implementation**: Discovery/cwd resolution, output persistence, timeout handling, stderr artifact capture, and harness preflight do not yet satisfy the phase contract.
- **Domain compliance**: `_platform/sdk` domain artifacts remain stale around CopilotClient ownership/concepts.
- **Reinvention**: No blocking duplication was introduced, but the new validator overlaps with an existing schema-validation adapter enough to merit a reuse note.
- **Testing**: AC-07, AC-08, AC-17 through AC-21, and AC-28 lack direct verification evidence.
- **Doctrine**: All new durable harness unit tests omit required 5-field Test Doc blocks.

## B) Summary

This review isolated commit range `699fe8f..dfd69b2` because the working tree also contains unrelated Phase 067 edits outside the phase under review. The phase adds the right module layout and most of the expected CLI surface, but the default execution path is still broken for real-world usage: default discovery resolves to the wrong directory, schema-backed runs have no reliable route to a validated `output/report.json`, timeout termination cannot target the real session, and the required harness health/doctor preflight is missing. Domain compliance is mostly sound for placement/imports, yet `_platform/sdk` documentation remains out of sync with the CopilotClient boundary that this plan/spec consumes. Anti-reinvention risk is low overall; the only notable overlap is the new harness validator versus an existing schema-validation adapter, which is a reuse opportunity rather than a blocker. Testing evidence is mixed: the execution log shows root quality gates passing and the harness unit suite reached `25/25`, but multiple acceptance criteria remain under-evidenced or unimplemented, and the new tests do not follow the repository's durable-test documentation rule.

## C) Checklist

**Testing Approach: Lightweight**

- [x] Core validation tests present
- [ ] Critical paths covered
- [ ] Key verification points documented
- [x] Only in-scope files changed
- [x] Linters/type checks clean (per execution log evidence)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/folder.ts:41-43 | correctness | Default harness-root resolution walks up to the repository root, so discovery targets `<repo>/agents` and the derived agent cwd becomes the parent of the repo. | Resolve only to `harness/`, use `fileURLToPath(...)`, and add a regression test for default-root discovery/cwd. |
| F002 | HIGH | /Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/runner.ts:51-60,142-147 | correctness | The runner validates `output/report.json` but never writes `agentResult.output` there or injects the concrete output path into the executed prompt, so schema-backed runs cannot reliably validate successfully. | Persist structured output to `runDir/output/report.json` or inject the run-local output path into the frozen prompt/instructions before launch. |
| F003 | HIGH | /Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/runner.ts:90-126<br/>/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/agent.ts:124-134 | error-handling | Timeout handling does not retain the live session ID and the CLI collapses timeout failures into generic E120, so timed-out runs are neither reliably terminated nor surfaced as E123. | Capture the active session ID from execution events/result, call `terminate(sessionId)` on timeout, and map timeout results to `ErrorCodes.AGENT_TIMEOUT`. |
| F004 | HIGH | /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/agent.ts:56-106 | error-handling | The `agent run` path never performs the required harness health/doctor preflight, so harness-dependent agents can start against an unhealthy runtime and fail later with weaker diagnostics. | Run a health/doctor preflight before creating `CopilotClient`, surface the result in stderr preflight output, and record the outcome in execution evidence. |
| F005 | HIGH | /Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/runner.ts:72-179 | correctness | AC-07 is unimplemented: the run folder never receives a `stderr.log`, so adapter warnings/errors are not preserved for audit or re-validation. | Capture stderr/session-error output alongside NDJSON and write it to `runDir/stderr.log`, with a unit test proving the artifact exists. |
| F006 | HIGH | /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/agent/folder.test.ts:10-145<br/>/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/agent/runner.test.ts:38-156<br/>/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/agent/validator.test.ts:17-98 | doctrine | All new durable harness agent tests omit the mandatory 5-field Test Doc block, violating the repository's durable-test documentation standard. | Add full Test Doc comments to every `it(...)` block and extend the suite for the missing timeout/preflight/stderr cases. |
| F007 | MEDIUM | /Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/folder.ts:111-125 | correctness | Run IDs drop the ISO date separators promised in the phase dossier/spec (`YYYY-MM-DD...`), which breaks the documented run-folder contract. | Emit run IDs as `YYYY-MM-DDTHH-MM-SS-mmmZ-xxxx` and update the folder tests accordingly. |
| F008 | MEDIUM | /Users/jordanknight/substrate/066-wf-real-agents/docs/domains/_platform/sdk/domain.md:19-72<br/>/Users/jordanknight/substrate/066-wf-real-agents/docs/domains/domain-map.md:77-80,139-147 | domain-compliance | The `_platform/sdk` domain artifacts do not document the CopilotClient contract/concepts consumed by this phase, leaving the owning domain doc and domain map out of sync. | Update `_platform/sdk/domain.md` and `docs/domains/domain-map.md` so CopilotClient (or its renamed SDK client contract) is traceable in Contracts, Concepts, Dependencies, and the health summary. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)** — `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/folder.ts:41-43` resolves the default harness root one directory too high. With no explicit `harnessRoot`, `listAgents()` looks under `/Users/jordanknight/substrate/066-wf-real-agents/agents`, and `agent run` derives `cwd` from that incorrect root.
- **F002 (HIGH)** — `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/runner.ts:51-60,142-147` validates `output/report.json` without ever ensuring that file exists. The runner reads the original prompt/instructions, but it neither persists `agentResult.output` nor injects the run-local output path into the prompt it executes.
- **F003 (HIGH)** — `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/runner.ts:90-126` times out with `adapter.terminate('')`, so the real session cannot be reliably stopped; `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/agent.ts:124-134` then returns a generic E120 instead of the dedicated timeout contract E123.
- **F004 (HIGH)** — `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/agent.ts:56-106` never runs the documented harness health/doctor preflight before SDK startup, so AC-28 is not met.
- **F005 (HIGH)** — `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/runner.ts:72-179` writes `events.ndjson` and `completed.json`, but it never materializes `stderr.log`, leaving AC-07 unimplemented.
- **F007 (MEDIUM)** — `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/folder.ts:111-125` generates `YYYYMMDD...` run IDs instead of the documented `YYYY-MM-DD...` form.


### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New files stay under `harness/src/agent`, `harness/src/cli/commands`, `harness/tests/unit/agent`, or the planned cross-domain docs/build files. |
| Contract-only imports | ✅ | Harness code imports `@chainglass/shared` via public barrels and `@github/copilot-sdk`; no cross-domain internal-file imports were introduced. |
| Dependency direction | ✅ | No infrastructure → business or business → business internal import violations were introduced. |
| Domain.md updated | ❌ | `_platform/sdk/domain.md` still does not document the CopilotClient contract/concepts that the plan/spec treat as part of the SDK boundary. |
| Registry current | ✅ | No new domains were added; `docs/domains/registry.md` does not require changes for this phase. |
| No orphan files | ✅ | Every changed file maps cleanly to `external (harness/)`, `_platform`, or phase-plan artifacts in the manifest. |
| Map nodes current | ❌ | `docs/domains/domain-map.md` labels a CopilotClient dependency into `_platform/sdk`, but the `_platform/sdk` node/health summary omit that contract. |
| Map edges current | ✅ | All current domain-map dependencies remain labeled; no unlabeled edges were introduced. |
| No circular business deps | ✅ | No new business-domain cycle is introduced by the reviewed changes. |
| Concepts documented | ⚠️ | `_platform/sdk/domain.md` has contracts but still lacks the required `## Concepts` section documenting its public surfaces. |


- **F008 (MEDIUM)** — `_platform/sdk` documentation still lacks the CopilotClient contract/concept traceability that the plan/spec rely on. This does not block the harness code from compiling, but it does leave the owning domain artifacts stale.

### E.3) Anti-Reinvention


| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| Agent output validator | `packages/workflow/src/adapters/schema-validator.adapter.ts` | unmapped / legacy package | Potential overlap — **extend/reuse** if schema validation needs to become a shared capability; not blocking for this phase. |
| Declarative agent run orchestrator | `packages/shared/src/features/019-agent-manager-refactor/agent-instance.ts` | agents | Adjacent pattern only — **proceed**; this phase does not appear to duplicate the existing agent-instance orchestration surface. |


No blocking reinvention was found. The validator overlap is worth tracking only if harness/schema validation broadens beyond this phase's narrow agent-output use case.

### E.4) Testing & Evidence

**Coverage confidence**: **55%**

- High-risk evidence gaps remain around AC-07 (`stderr.log`), AC-08 (timeout semantics), and AC-28 (health/doctor preflight).
- Human-facing CLI behavior (AC-17 through AC-21) is mostly justified by static code inspection rather than captured runtime evidence.
- Execution-log evidence is useful, but it does not replace direct phase-local proof for the missing contracts above.


| AC | Confidence | Evidence |
|----|------------|----------|
| AC-07 | 0% | No `stderr.log` implementation found in `runner.ts` or `agent.ts`; live validation and static review both failed this contract. |
| AC-08 | 15% | `Promise.race` exists, but timeout uses `terminate('')` and the CLI currently reports generic E120 rather than E123. |
| AC-10 | 88% | `runner.ts` appends each event with `appendFileSync(...)`, and the unit suite confirms `events.ndjson` exists. |
| AC-14 | 92% | `runner.test.ts` explicitly verifies degraded status when schema validation fails. |
| AC-17/18/19 | 40-45% | Display helpers exist, but there is no captured stderr transcript or focused CLI test proving the human-facing stream/summary contract. |
| AC-20/21 | 40-42% | Commands are registered, but there were no committed phase fixtures/runs to exercise history/validate end-to-end. |
| AC-28 | 0% | No `health`/`doctor --wait` invocation exists in the `agent run` path, and live validation confirmed the preflight is missing. |


### E.5) Doctrine Compliance

- **F006 (HIGH)** — the new durable tests in:
  - `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/agent/folder.test.ts`
  - `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/agent/runner.test.ts`
  - `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/agent/validator.test.ts`
  omit the required 5-field Test Doc block (`Why`, `Contract`, `Usage Notes`, `Quality Contribution`, `Worked Example`) before each `it(...)` block.
- The `client as any` cast in `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/agent.ts:103-105` was **not** escalated because the phase plan/execution log already records this as accepted Phase 1 debt pending interface alignment.


### E.6) Harness Live Validation

- **Harness status**: `UNHEALTHY`
- **Checks performed**:
  - `AC-02` PASS — `agent list` returned an `ok` envelope with `agents: []` / `count: 0`
  - `AC-03` PASS — invalid slugs returned E108 for `run`, `history`, and `validate`
  - `AC-04` FAIL — run-folder ID format does not match the documented `YYYY-MM-DD...` contract
  - `AC-07` FAIL — no `stderr.log` artifact is written
  - `AC-10` PASS — verbose unit tests plus code inspection confirmed incremental NDJSON writes
  - `AC-14` PASS — verbose unit tests confirmed degraded validation behavior
  - `AC-20` SKIP / `AC-21` SKIP — commands are present, but there were no committed agent definitions or run-history fixtures to exercise end-to-end
  - `AC-26` PASS — missing agent slug returned E121 with an agent-not-found message
  - `AC-27` PASS — missing `GH_TOKEN` returned E122 with the documented fix command
  - `AC-28` FAIL — no health/doctor preflight occurs before launch
- **Evidence**: `pnpm --dir harness exec tsx src/cli/index.ts health` timed out during live validation; direct probes still showed MCP/terminal/CDP partially responding. The review therefore treats harness boot as non-blocking for this phase, but the missing preflight remains a real contract gap.


## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | Discover agent definitions from `harness/agents/<slug>/prompt.md` | `listAgents()` + folder tests | 88% |
| AC-02 | `agent list` shows slugs and schema presence | `agent list` returned `{agents: [], count: 0}`; non-empty listing was not exercised | 85% |
| AC-03 | Slug validation blocks traversal | Folder tests plus runtime E108 checks for `run/history/validate` | 95% |
| AC-04 | Create documented ISO-dated run folder with frozen copies and SDK execution | `createRunFolder()` exists, but the run-ID format drops `YYYY-MM-DD` separators and default root resolution blocks end-to-end confidence | 35% |
| AC-05 | Use SDK run path with auto-approved tools and streamed events | `runner.ts` forwards `onEvent`; Phase 1 adapter work provides `approveAll` | 70% |
| AC-06 | Agent working directory is the repository root | CLI sets cwd from `resolveHarnessRoot()`, but the current root bug resolves to the parent of the repo | 10% |
| AC-07 | Persist adapter warnings/errors to `stderr.log` | No implementation found | 0% |
| AC-08 | Timeout kills the run, writes timeout metadata, returns E123 | `Promise.race` exists, but timeout termination and E123 reporting are incomplete | 15% |
| AC-09 | `agent run` returns structured `HarnessEnvelope` JSON | Success/error envelope code exists; no successful real agent run was captured in phase evidence | 65% |
| AC-10 | Write every agent event to `events.ndjson` incrementally | `appendFileSync(...)` plus unit-test evidence | 88% |
| AC-11 | Use unified `AgentEvent` mapping | `AgentEvent` objects are persisted directly, but event-shape coverage is limited | 55% |
| AC-12 | `completed.json` records required metadata | Code writes slug/runId/timestamps/session/result/validation/event counts; unit tests confirm artifact creation | 82% |
| AC-13 | Validate `output/report.json` against `output-schema.json` | Validation hook exists, but the runner never reliably supplies the output file | 25% |
| AC-14 | Validation failure is `degraded`, not `error` | `runner.test.ts` covers degraded validation | 92% |
| AC-15 | Expose validation errors in `completed.json` and the JSON envelope | Metadata wiring exists, but there is no successful schema-backed end-to-end proof | 50% |
| AC-16 | Skip validation cleanly when no schema exists | Null-validation path exists; direct assertion coverage is limited | 72% |
| AC-17 | TTY header/preflight/event streaming to stderr | Display helpers exist; no captured stderr transcript | 40% |
| AC-18 | Show tool-call/result previews with truncation | Display helpers exist; no runtime verification | 40% |
| AC-19 | Show completion summary with status/timing/session/validation/artifacts | Display helpers exist; no runtime verification | 45% |
| AC-20 | `agent history <slug>` lists past runs most-recent-first | Command registered; no committed run fixtures to exercise output ordering | 40% |
| AC-21 | `agent validate <slug>` re-validates the latest run | Command registered; no committed phase fixture exercised latest-run behavior | 42% |
| AC-26 | Missing agent slug returns E121 with available agents | Runtime CLI check with dummy token | 93% |
| AC-27 | Missing `GH_TOKEN` returns E122 with fix command | Runtime CLI check without `GH_TOKEN` | 95% |
| AC-28 | Run harness health/doctor preflight before launch | Not implemented; live validation confirmed the gap | 0% |

**Overall coverage confidence**: **55%**

## G) Commands Executed


```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -10
git --no-pager diff --name-status 699fe8f..dfd69b2
git --no-pager diff 699fe8f..dfd69b2 > /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-2-agent-runner-infrastructure/reviews/_computed.diff
pnpm --dir harness exec tsx src/cli/index.ts health
pnpm --dir harness exec tsx src/cli/index.ts agent list
pnpm --dir harness exec tsx src/cli/index.ts agent run ../bad
pnpm --dir harness exec tsx src/cli/index.ts agent history ../bad
pnpm --dir harness exec tsx src/cli/index.ts agent validate ../bad
GH_TOKEN=dummy pnpm --dir harness exec tsx src/cli/index.ts agent run demo-agent
env -u GH_TOKEN pnpm --dir harness exec tsx src/cli/index.ts agent run demo-agent
pnpm --dir harness exec vitest run tests/unit/agent --reporter=verbose
```


## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/agent-runner-plan.md
**Spec**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/agent-runner-spec.md
**Phase**: Phase 2: Agent Runner Infrastructure
**Tasks dossier**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-2-agent-runner-infrastructure/tasks.md
**Execution log**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-2-agent-runner-infrastructure/execution.log.md
**Review file**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-2-agent-runner-infrastructure/reviews/review.phase-2-agent-runner-infrastructure.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/066-wf-real-agents/.gitignore | Reviewed | _platform | None |
| /Users/jordanknight/substrate/066-wf-real-agents/CLAUDE.md | Reviewed | _platform | None |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-2-agent-runner-infrastructure/execution.log.md | Reviewed | plan-artifact | None |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-2-agent-runner-infrastructure/tasks.fltplan.md | Reviewed | plan-artifact | None |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-2-agent-runner-infrastructure/tasks.md | Reviewed | plan-artifact | None |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/project-rules/harness.md | Reviewed | _platform | None |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/package.json | Reviewed | external | None |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/display.ts | Reviewed | external | None |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/folder.ts | Reviewed | external | Fix |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/runner.ts | Reviewed | external | Fix |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/types.ts | Reviewed | external | None |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/validator.ts | Reviewed | external | None |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/agent.ts | Reviewed | external | Fix |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/index.ts | Reviewed | external | None |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/output.ts | Reviewed | external | None |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/agent/folder.test.ts | Reviewed | external | Fix |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/agent/runner.test.ts | Reviewed | external | Fix |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/agent/validator.test.ts | Reviewed | external | Fix |
| /Users/jordanknight/substrate/066-wf-real-agents/pnpm-lock.yaml | Reviewed | _platform | None |
| /Users/jordanknight/substrate/066-wf-real-agents/pnpm-workspace.yaml | Reviewed | _platform | None |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/folder.ts | Fix default harness-root resolution so discovery points at `harness/agents` and derived cwd lands on the repo root. | Phase 3 agents will not be discoverable from the default path otherwise. |
| 2 | /Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/runner.ts | Make successful runs produce deterministic `output/report.json` and `stderr.log` artifacts before validation. | Schema validation and audit artifacts are core phase contracts. |
| 3 | /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/agent.ts | Add harness health/doctor preflight and map timeout failures to E123. | AC-28 is missing, and timeout failures are currently indistinguishable from generic execution errors. |
| 4 | /Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/runner.ts | Capture the real session ID and terminate that session on timeout. | The current `terminate('')` call cannot reliably stop a live SDK session. |
| 5 | /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/agent/folder.test.ts | Add required Test Doc blocks and regression coverage for default-root/run-ID behavior. | Durable tests must meet repo doctrine and protect against root-resolution regressions. |
| 6 | /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/agent/runner.test.ts | Add required Test Doc blocks plus coverage for timeout, preflight, stderr, and successful schema-backed runs. | Critical runner contracts are currently under-evidenced. |
| 7 | /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/agent/validator.test.ts | Add required Test Doc blocks. | The file is durable coverage and must comply with the test-documentation rule. |

### Domain Artifacts to Update (if any)


| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/066-wf-real-agents/docs/domains/_platform/sdk/domain.md | Add CopilotClient traceability in Contracts/Dependencies and a `## Concepts` section. |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/domains/domain-map.md | Add CopilotClient to the `_platform/sdk` node/health summary (or rename the edge label) so the map matches the owning domain doc. |


### Next Step

`/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/agent-runner-plan.md --phase 'Phase 2: Agent Runner Infrastructure'`
