# Code Review: Phase 3: Smoke Test Agent

**Plan**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/agent-runner-plan.md
**Spec**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/agent-runner-spec.md
**Phase**: Phase 3: Smoke Test Agent
**Date**: 2026-03-08
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Manual

## A) Verdict

**REQUEST_CHANGES**

The phase is close, and the live harness currently behaves well, but the committed validation contract and evidence trail are not yet strong enough to approve.

**Key failure areas**:
- **Implementation**: `output-schema.json` is too permissive, so `validated: true` does not guarantee the smoke-test actually covered console logs, server logs, or all three required screenshots.
- **Domain compliance**: The agents domain docs and plan manifest were not synchronized with the new `AgentRunOptions.timeout` contract surface and several phase-owned artifacts.
- **Testing**: `agent validate smoke-test` succeeds live, but it does not persist the updated validation result into `completed.json`, so run history still reports the latest run as degraded.
- **Doctrine**: The smoke-test prompt/instructions still tell agents to use `npx tsx`, even though the phase retrospective itself identified `pnpm exec tsx` as the correct repo-conformant invocation.

## B) Summary

This phase successfully introduces the `smoke-test` agent definition and the current harness environment is healthy: `just harness health`, `just harness agent list`, and `just harness agent validate smoke-test` all work as expected. However, the phase's validation contract is too weak to prove AC-23/AC-25 on its own: a minimal report with one screenshot and no console/server-log sections still passes the current schema. The acceptance evidence is also inconsistent because the latest persisted `completed.json` remains `degraded`/`validated:false` even after `agent validate smoke-test` now returns `validated:true`, leaving audit history stale. Domain boundaries and imports are otherwise clean, and no genuine reinvention risks were found.

## C) Checklist

**Testing Approach: Manual**

- [x] Manual verification steps documented
- [x] Manual test results recorded with observed outcomes
- [x] Evidence artifacts present

Universal (all approaches):
- [ ] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jordanknight/substrate/066-wf-real-agents/harness/agents/smoke-test/output-schema.json:6-117` | correctness | The smoke-test schema accepts incomplete reports, so `validated:true` does not prove AC-23/AC-25. | Require console/server-log sections, all health services, and the three expected screenshot viewports. |
| F002 | HIGH | `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/agent.ts:213-257` | testing | `agent validate` re-validates the latest report but never writes the result back to `completed.json`, so `agent history` stays stale after schema fixes. | Persist revalidation results (or rerun and record a fresh validated run) so audit history matches the documented workflow. |
| F003 | MEDIUM | `/Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/interfaces/agent-types.ts:88-94`<br/>`/Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/adapters/sdk-copilot-adapter.ts:160-204` | error-handling | The new shared-adapter timeout option has weaker semantics than the harness runner timeout, so the same field now means different things in different callers. | Align timeout behavior and documentation so a timeout is surfaced consistently everywhere. |
| F004 | MEDIUM | `/Users/jordanknight/substrate/066-wf-real-agents/docs/domains/agents/domain.md:248-266`<br/>`/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/agent-runner-plan.md:22-52` | domain | The public agents contract changed (`AgentRunOptions.timeout`), but the agents domain history/concepts and plan manifest were not updated to match. | Sync the agents domain docs and add missing manifest rows for all phase-owned files. |
| F005 | MEDIUM | `/Users/jordanknight/substrate/066-wf-real-agents/harness/agents/smoke-test/instructions.md:20-43`<br/>`/Users/jordanknight/substrate/066-wf-real-agents/harness/agents/smoke-test/prompt.md:37-41` | doctrine | The smoke-test agent still instructs `npx tsx`, which conflicts with repo conventions and with the phase's own retrospective evidence. | Replace `npx tsx` with `pnpm exec tsx` in both the prompt and instructions. |
| F006 | LOW | `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-3-smoke-test-agent/tasks.md:1-8` | doctrine | The dossier header still says `Status: Ready for implementation` even though the phase is complete. | Update the dossier status and scope wording to reflect the landed state. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)** — `/Users/jordanknight/substrate/066-wf-real-agents/harness/agents/smoke-test/output-schema.json:6-117`
  - The schema only requires `health`, `screenshots`, `verdict`, and `retrospective`.
  - `consoleErrors` and `serverLogSummary` are optional, `screenshots` only requires `minItems: 1`, and `health.services` accepts any arbitrary keys.
  - Direct probe: a temporary report containing only one screenshot plus retrospective text validated successfully via `validateOutput()`.
  - Impact: future runs can report `validated:true` while still missing required smoke-test coverage.

- **F003 (MEDIUM)** — `/Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/interfaces/agent-types.ts:88-94` and `/Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/adapters/sdk-copilot-adapter.ts:160-204`
  - `AgentRunOptions.timeout` is documented as a completion timeout, but `SdkCopilotAdapter.run()` only forwards it to `session.sendAndWait()`.
  - The harness runner separately enforces its own timer/terminate path, so the same option now has different semantics depending on the caller.
  - Impact: direct shared-adapter users can receive a generic `failed` result rather than a true timeout outcome, while harness callers expect a termination classification.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New smoke-test files live under `harness/agents/smoke-test/`; shared contract changes remain under `packages/shared/`. |
| Contract-only imports | ✅ | No new cross-domain internal imports were introduced; harness still consumes public `@chainglass/shared` exports only. |
| Dependency direction | ✅ | No infrastructure→business inversion or business→business internal import violations were introduced. |
| Domain.md updated | ❌ | `docs/domains/agents/domain.md` stops at Plan 059 and does not capture the Plan 070 timeout/session-option change. |
| Registry current | ✅ | No new registered domains were added, so `docs/domains/registry.md` remains current. |
| No orphan files | ❌ | The plan manifest omits at least `harness/tests/unit/cli/output.test.ts` and the phase dossier artifacts under `docs/plans/070-harness-agent-runner/tasks/phase-3-smoke-test-agent/`. |
| Map nodes current | ✅ | No new registered domain nodes are required; harness remains external tooling. |
| Map edges current | ✅ | No new registered-domain dependency edges were introduced. |
| No circular business deps | ✅ | No new business-domain cycles were introduced. |
| Concepts documented | ⚠️ | The agents domain has a Concepts section, but it does not expose the new `model`/`reasoningEffort`/`timeout` run-option surface clearly enough. |

- **F004 (MEDIUM)** — the phase changed a public agents-domain contract without synchronizing the domain history/concepts, and the plan manifest no longer covers every touched file in the phase diff.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `harness/agents/smoke-test/` definition set | None requiring reuse | external | Proceed |

No genuine duplication findings surfaced. The smoke-test agent is a legitimate specialization rather than a reinvention of an existing committed agent definition.

### E.4) Testing & Evidence

**Coverage confidence**: 67%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-22 | 100 | `harness/agents/smoke-test/{prompt.md,output-schema.json,instructions.md}` exist, and `just harness agent list` reports `smoke-test` with `hasSchema:true` and `hasInstructions:true`. |
| AC-23 | 65 | The prompt and the observed `output/report.json` cover health, 3 screenshots, console errors, and server-log summary, but the schema does not enforce those sections strongly enough for future validation confidence. |
| AC-24 | 90 | The schema requires `retrospective.workedWell`, `confusing`, and `magicWand`; the prompt/instructions ask for those plus `cliDiscoverability` and `improvementSuggestions`, and the observed report contains them. |
| AC-25 | 55 | `just harness agent validate smoke-test` currently returns `validated:true`, but the latest persisted `completed.json` still shows `result:"degraded"` and `validated:false`, so the run-history evidence remains inconsistent. |

- **F002 (HIGH)** — `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/agent.ts:213-257`
  - `agent validate` re-validates the latest run output and prints the result, but it does not rewrite `completed.json`.
  - Directly observed mismatch:
    - `/Users/jordanknight/substrate/066-wf-real-agents/harness/agents/smoke-test/runs/2026-03-08T10-42-28-675Z-9dce/completed.json` still records `result: "degraded"` and `validated: false`.
    - `just harness agent validate smoke-test` now returns `{"validated":true,"errors":[]}` for that same run.
  - Impact: the documented recovery flow in `docs/project-rules/harness.md` leaves `agent history smoke-test` stale, which weakens the phase's audit trail.

### E.5) Doctrine Compliance

- **F005 (MEDIUM)** — `/Users/jordanknight/substrate/066-wf-real-agents/harness/agents/smoke-test/instructions.md:20-43` and `/Users/jordanknight/substrate/066-wf-real-agents/harness/agents/smoke-test/prompt.md:37-41`
  - The agent definition tells users/agents to run `cd harness && npx tsx <script.ts>`.
  - Project tooling rules are pnpm-first, and the phase's own retrospective in `execution.log.md` explicitly calls out `npx tsx` vs `pnpm exec tsx` as a gotcha.
  - Impact: the committed instructions preserve a workflow the phase already learned was misleading.

- **F006 (LOW)** — `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-3-smoke-test-agent/tasks.md:1-8`
  - The dossier header still says `Status: Ready for implementation` while the task table is fully checked and the paired flight plan is already marked `Landed`.
  - Impact: the phase packet is out of sync and harder for future agents to trust.

### E.6) Harness Live Validation

Harness status: **HEALTHY**

Checks performed:
- **AC-22** — `just harness agent list` returned `smoke-test` with `hasSchema:true` and `hasInstructions:true`.
- **AC-23** — `/Users/jordanknight/substrate/066-wf-real-agents/harness/agents/smoke-test/runs/2026-03-08T10-42-28-675Z-9dce/output/report.json` contains health data for app/mcp/terminal/cdp, three screenshot entries, a `consoleErrors` array, and `serverLogSummary`.
- **AC-24** — the observed report includes `workedWell`, `confusing`, `magicWand`, `cliDiscoverability`, and `improvementSuggestions`.
- **AC-25** — `just harness health` returned status `ok`; `just harness agent validate smoke-test` returned `validated:true`; however `completed.json`/`agent history` still retain the pre-fix degraded metadata.

Evidence observed:
- `/Users/jordanknight/substrate/066-wf-real-agents/harness/agents/smoke-test/runs/2026-03-08T10-42-28-675Z-9dce/completed.json`
- `/Users/jordanknight/substrate/066-wf-real-agents/harness/agents/smoke-test/runs/2026-03-08T10-42-28-675Z-9dce/output/report.json`
- `just harness health`
- `just harness agent list`
- `just harness agent history smoke-test`
- `just harness agent validate smoke-test`

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-22 | A `smoke-test` agent definition exists with prompt, schema, and instructions | Agent files exist in diff; `just harness agent list` discovers `smoke-test` with schema/instructions | 100 |
| AC-23 | Smoke-test performs health, 3 screenshots, console check, server log check, and writes structured report | Prompt/report cover all behaviors, but schema does not require them strongly enough | 65 |
| AC-24 | Report includes retrospective with `workedWell`, `confusing`, and `magicWand` | Schema + prompt + observed report all include those fields | 90 |
| AC-25 | Smoke-test run produces a validated report | Live `agent validate` passes, but persisted run metadata/history remain degraded after revalidation | 55 |

**Overall coverage confidence**: 67%

## G) Commands Executed

```bash
git --no-pager status --short && printf '\n---UNSTAGED---\n' && git --no-pager diff --stat && printf '\n---STAGED---\n' && git --no-pager diff --staged --stat && printf '\n---LOG---\n' && git --no-pager log --oneline -12
git --no-pager diff --name-status 970c30a..176b17d && printf '\n---STAT---\n' && git --no-pager diff --stat 970c30a..176b17d && printf '\n---DIFF---\n' && git --no-pager diff --find-renames --find-copies 970c30a..176b17d
git --no-pager show --stat --summary --format=fuller 176b17d
git --no-pager diff 970c30a..176b17d -- harness/src/agent/runner.ts harness/src/agent/validator.ts harness/tests/unit/agent/runner.test.ts harness/tests/unit/cli/output.test.ts packages/shared/src/adapters/sdk-copilot-adapter.ts packages/shared/src/interfaces/agent-types.ts
git --no-pager diff 970c30a..176b17d -- docs/project-rules/harness.md harness/agents/smoke-test/prompt.md harness/agents/smoke-test/output-schema.json harness/agents/smoke-test/instructions.md
just harness health && printf '\n---AGENT-LIST---\n' && just harness agent list && printf '\n---AGENT-HISTORY---\n' && just harness agent history smoke-test && printf '\n---AGENT-VALIDATE---\n' && just harness agent validate smoke-test
tmpdir=$(mktemp -d) && cat > "$tmpdir/min-report.json" <<'JSON'
{"health":{"status":"ok","services":{"app":"up"}},"screenshots":[{"name":"one","viewport":"desktop-lg","path":"/tmp/one.png"}],"verdict":"pass","retrospective":{"workedWell":"x","confusing":"y","magicWand":"z"}}
JSON
cd harness && pnpm exec tsx -e "import { validateOutput } from './src/agent/validator.ts'; const result = validateOutput('../harness/agents/smoke-test/output-schema.json', '$tmpdir/min-report.json'); console.log(JSON.stringify(result));"
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/agent-runner-plan.md
**Spec**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/agent-runner-spec.md
**Phase**: Phase 3: Smoke Test Agent
**Tasks dossier**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-3-smoke-test-agent/tasks.md
**Execution log**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-3-smoke-test-agent/execution.log.md
**Review file**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-3-smoke-test-agent/reviews/review.phase-3-smoke-test-agent.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-3-smoke-test-agent/execution.log.md | Added | phase-docs | Refresh final evidence wording if a new validated run is captured |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-3-smoke-test-agent/tasks.fltplan.md | Added | phase-docs | None |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-3-smoke-test-agent/tasks.md | Added | phase-docs | Update status/scope wording |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/project-rules/harness.md | Modified | _platform | Keep revalidation docs aligned with persisted validation behavior |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/agents/smoke-test/instructions.md | Added | external | Switch to `pnpm exec tsx` |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/agents/smoke-test/output-schema.json | Added | external | Tighten the report contract |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/agents/smoke-test/prompt.md | Added | external | Mirror `pnpm exec tsx` guidance |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/runner.ts | Modified | external | Re-check timeout integration after fixes |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/validator.ts | Modified | external | None |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/agent/runner.test.ts | Modified | external | Add fallback/non-overwrite coverage if you touch persistence logic |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/cli/output.test.ts | Modified | external | Extend if revalidation persistence/output behavior changes |
| /Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/adapters/sdk-copilot-adapter.ts | Modified | agents | Clarify/align timeout semantics |
| /Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/interfaces/agent-types.ts | Modified | agents | Clarify timeout contract |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/domains/agents/domain.md | Existing | agents | Add Plan 070 history/concepts update |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/agent.ts | Existing | external | Persist validation results or adjust workflow |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/agents/smoke-test/runs/2026-03-08T10-42-28-675Z-9dce/completed.json | Evidence | external | Refresh via rerun or persisted revalidate |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/agents/smoke-test/runs/2026-03-08T10-42-28-675Z-9dce/output/report.json | Evidence | external | None |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/066-wf-real-agents/harness/agents/smoke-test/output-schema.json | Require the full smoke-test contract (console errors, server log summary, complete health services, and the three required screenshot viewports) | `validated:true` currently overstates coverage |
| 2 | /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/agent.ts | Persist revalidation results into `completed.json` (or capture a fresh validated run and update durable evidence) | `agent history` remains stale after `agent validate` |
| 3 | /Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/interfaces/agent-types.ts | Clarify the timeout contract | The shared public API now documents stronger semantics than the adapter actually guarantees |
| 4 | /Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/adapters/sdk-copilot-adapter.ts | Align timeout handling with the clarified contract | Timeout behavior currently differs between direct adapter use and harness runner use |
| 5 | /Users/jordanknight/substrate/066-wf-real-agents/harness/agents/smoke-test/instructions.md | Replace `npx tsx` with `pnpm exec tsx` | Current instructions preserve a known workflow issue |
| 6 | /Users/jordanknight/substrate/066-wf-real-agents/harness/agents/smoke-test/prompt.md | Replace `npx tsx` with `pnpm exec tsx` | Prompt and instructions should agree on the correct command |
| 7 | /Users/jordanknight/substrate/066-wf-real-agents/docs/domains/agents/domain.md | Add Plan 070 history/concepts coverage for the timeout/session-option contract | Domain docs are stale for the changed public surface |
| 8 | /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/agent-runner-plan.md | Add missing manifest rows for all touched phase files | Domain manifest currently leaves phase-owned files orphaned |
| 9 | /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-3-smoke-test-agent/tasks.md | Update dossier status from `Ready for implementation` to landed/complete | Phase packet is out of sync with execution state |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/066-wf-real-agents/docs/domains/agents/domain.md | Plan 070 history entry plus Concepts/contract guidance for `model`, `reasoningEffort`, and `timeout` |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/agent-runner-plan.md | Manifest entries for every touched file in the phase diff |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-3-smoke-test-agent/tasks.md | Accurate landed status and scope wording |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/agent-runner-plan.md --phase 'Phase 3: Smoke Test Agent'
