# Code Review: Phase 1: SdkCopilotAdapter Improvements

**Plan**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/agent-runner-plan.md
**Spec**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/agent-runner-spec.md
**Phase**: Phase 1: SdkCopilotAdapter Improvements
**Date**: 2026-03-07
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Lightweight

## A) Verdict

**APPROVE**

**Key failure areas**:
- **Implementation**: `FakeCopilotClient.getLastSessionConfig()` is documented as covering both create and resume paths, but the resume path leaves it stale.
- **Domain compliance**: `/Users/jordanknight/substrate/066-wf-real-agents/docs/domains/agents/domain.md` was not updated for the new Copilot-facing contracts introduced in this phase.
- **Testing**: The new tests prove the options are accepted, but they do not directly assert that `SdkCopilotAdapter` forwards `model` / `reasoningEffort` into `createSession()` / `resumeSession()`; the POC acceptance claim also lacks captured runtime evidence.

## B) Summary

The source changes are additive, type-safe, and aligned with the phase goal of exposing model selection and reasoning effort through the shared agent contracts. I did not find any HIGH or CRITICAL correctness, security, or dependency-direction issues, and the phase diff stays inside the intended `agents` surface plus its contract test. Domain placement and import direction are clean, but the agents domain documentation was not updated to reflect the new public Copilot contracts and concepts. Test evidence is good for compile-time safety and option acceptance, but it is still indirect for adapter forwarding and the POC runtime acceptance criterion; live harness validation was skipped because the harness was unhealthy and this phase is library-only.

## C) Checklist

**Testing Approach: Lightweight**

- [x] Core validation tests present
- [ ] Critical paths covered
- [ ] Key verification points documented
- [x] Only in-scope files changed
- [x] Linters/type checks clean (per execution log and review-run `npm test`)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | MEDIUM | /Users/jordanknight/substrate/066-wf-real-agents/docs/domains/agents/domain.md:13-24,143-167,248-267 | domain-compliance | Agents domain docs were not updated for the new public Copilot contracts, concepts, or Plan 070 Phase 1 history. | Update the Concepts, Contracts, and History sections to include `ICopilotClient`, `ICopilotSession`, `CopilotModelInfo`, and `CopilotReasoningEffort`. |
| F002 | MEDIUM | /Users/jordanknight/substrate/066-wf-real-agents/test/contracts/agent-adapter.contract.ts:204-240 | testing | The new tests only prove that adapters accept the new options; they do not prove that `SdkCopilotAdapter` forwards them to `createSession()` / `resumeSession()`. | Add unit coverage in `/Users/jordanknight/substrate/066-wf-real-agents/test/unit/shared/sdk-copilot-adapter.test.ts` using `FakeCopilotClient.getLastSessionConfig()` / `getLastResumeConfig()`. |
| F003 | MEDIUM | /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-1-sdk-copilot-adapter-improvements/execution.log.md:59-70 | testing | The execution log claims the Phase 1 POC acceptance criterion is satisfied, but it records lint/typecheck results rather than a captured runtime invocation of the POC script. | Either capture the actual POC command/output in the execution log or downgrade the acceptance claim to “compile-ready but not runtime-verified.” |
| F004 | LOW | /Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/fakes/fake-copilot-client.ts:141-142,216-224 | correctness | `getLastSessionConfig()` is documented as returning the most recent create-or-resume config, but `resumeSession()` only updates `_lastResumeConfig`. | Update `resumeSession()` to also assign `_lastSessionConfig = config`, or narrow the helper documentation to create-only behavior. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F004 (LOW)** — `/Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/fakes/fake-copilot-client.ts:141-142,216-224`
  - **Issue**: The fake helper contract and the implementation drift apart. `getLastSessionConfig()` claims to return the most recent config passed to either `createSession()` or `resumeSession()`, but the resume path only stores `_lastResumeConfig`.
  - **Why it matters**: The helper was added specifically to support future adapter wiring assertions. As written, resume-path assertions would read stale or missing data.
  - **Recommendation**: Keep `_lastSessionConfig` in sync for both create and resume operations, or narrow the helper documentation and callers to create-only use.

No other material correctness, security, error-handling, performance, or scope issues were confirmed in the changed source.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | All changed source files stay within `/Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/` and the contract test remains in `/Users/jordanknight/substrate/066-wf-real-agents/test/contracts/`, matching the plan manifest. |
| Contract-only imports | ✅ | The diff imports local interfaces or shared package exports; no cross-domain internal imports were introduced. |
| Dependency direction | ✅ | The `agents` domain continues to consume `_platform/sdk` only through the existing Copilot client abstraction; no infrastructure → business violation was introduced. |
| Domain.md updated | ❌ | `/Users/jordanknight/substrate/066-wf-real-agents/docs/domains/agents/domain.md` does not reflect the new Copilot contracts or Phase 070 history. |
| Registry current | ✅ | `/Users/jordanknight/substrate/066-wf-real-agents/docs/domains/registry.md` needs no change because this phase did not add or rename a domain. |
| No orphan files | ✅ | Every changed file maps back to the `agents` domain manifest for Phase 1. |
| Map nodes current | ✅ | No new domain node was introduced in this phase. |
| Map edges current | ✅ | No new inter-domain dependency edge was introduced by the Phase 1 diff. |
| No circular business deps | ✅ | The phase does not add any new business-to-business dependency path. |
| Concepts documented | ⚠️ | The Concepts section exists, but it was not expanded to describe the new Copilot-facing public concepts introduced in this phase. |

**Domain finding**

- **F001 (MEDIUM)** — `/Users/jordanknight/substrate/066-wf-real-agents/docs/domains/agents/domain.md:13-24,143-167,248-267`
  - **Issue**: The domain documentation is stale relative to the public API exported from `/Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/index.ts` and `/Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/interfaces/index.ts`.
  - **Fix**: Add Concepts/Contracts entries for `ICopilotClient`, `ICopilotSession`, `CopilotModelInfo`, and `CopilotReasoningEffort`, and add a Plan 070 Phase 1 History row.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `AgentRunOptions.model` / `reasoningEffort` pass-through | None | agents | proceed |
| `ICopilotClient.listModels()` | Upstream Copilot SDK capability mirrored intentionally, not duplicated | _platform/sdk | proceed |
| `ICopilotSession.setModel()` | Upstream Copilot SDK capability mirrored intentionally, not duplicated | _platform/sdk | proceed |
| Fake Copilot config/model helper methods | None | agents | proceed |

No genuine concept reinvention was found. The new surface mirrors upstream Copilot SDK behavior or extends existing `agents` abstractions rather than duplicating another domain’s contract.

### E.4) Testing & Evidence

**Coverage confidence**: 72%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-05 (revised): Adapter accepts `model` and `reasoningEffort` in run options | 75% | `/Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/interfaces/agent-types.ts:73-87` adds the fields; `/Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/adapters/sdk-copilot-adapter.ts:106-117` forwards them; `/Users/jordanknight/substrate/066-wf-real-agents/test/contracts/agent-adapter.contract.ts:204-240` verifies the options do not break adapters. Direct forwarding assertions are still missing (F002). |
| Existing `just fft` passes (no regressions) | 85% | `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-1-sdk-copilot-adapter-improvements/execution.log.md:66-70` records `just fft`, typecheck, and lint as green. During review, `npm test` also passed, though it emitted pre-existing tsconfig-path warnings from generated standalone artifacts. |
| POC script works without `as any` cast for model/reasoning | 35% | `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-1-sdk-copilot-adapter-improvements/execution.log.md:59-62` only records lint-oriented cleanup of the scratch POC file; it does not capture a runtime invocation of the POC (F003). |

**Testing findings**

- **F002 (MEDIUM)** — `/Users/jordanknight/substrate/066-wf-real-agents/test/contracts/agent-adapter.contract.ts:204-240`
  - **Issue**: The new contract tests stop at “accepted without error.” They do not validate that `SdkCopilotAdapter` actually forwards the values into `ICopilotClient.createSession()` / `resumeSession()`.
  - **Fix**: Add targeted unit tests in `/Users/jordanknight/substrate/066-wf-real-agents/test/unit/shared/sdk-copilot-adapter.test.ts` that inspect `FakeCopilotClient.getLastSessionConfig()` and `getLastResumeConfig()` after runs with `model` / `reasoningEffort`.
- **F003 (MEDIUM)** — `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-1-sdk-copilot-adapter-improvements/execution.log.md:59-70`
  - **Issue**: The POC acceptance criterion is asserted, but no runtime evidence is logged.
  - **Fix**: Capture the actual POC command and outcome in the execution log, or narrow the claim to static verification only.

### E.5) Doctrine Compliance

No material project-rules, idiom, architecture, or constitution violations were confirmed in the changed code.

### E.6) Harness Live Validation

Harness status: **UNHEALTHY**

| AC | Method | Result | Evidence |
|----|--------|--------|----------|
| AC-05 | Read the phase ACs, then attempt harness validation via `just harness health`, `just harness doctor`, `just harness ports`, HTTP probes, and Docker health checks. | SKIP | The harness validator reported `just harness health` / `just harness doctor` hanging, `just harness ports` resolving app port 3159, direct HTTP probes timing out, and the container reporting `unhealthy` with repeated Next.js `build-manifest.json` ENOENT errors. |
| Phase 1 live verification | Compare the library-only phase scope against what is observable through the running harness/app. | SKIP | Phase 1 changes are in `packages/shared/` and tests; they are not directly exposed as a live harness behavior. The phase dossier and execution log also state harness validation is not needed for this phase. |

Live validation was skipped rather than failed because the harness was unhealthy and this phase’s acceptance criteria are primarily static/library concerns.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-05 | Adapter accepts `model` and `reasoningEffort` in run options | Interface additions in `/Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/interfaces/agent-types.ts`, adapter forwarding in `/Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/adapters/sdk-copilot-adapter.ts`, option-acceptance tests in `/Users/jordanknight/substrate/066-wf-real-agents/test/contracts/agent-adapter.contract.ts` | 75% |
| AC-FFT | Existing `just fft` passes (no regressions) | `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-1-sdk-copilot-adapter-improvements/execution.log.md:66-70`; review-run `npm test` passed | 85% |
| AC-POC | POC script works without `as any` cast for model/reasoning | `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-1-sdk-copilot-adapter-improvements/execution.log.md:59-62` documents static cleanup only | 35% |

**Overall coverage confidence**: 72%

## G) Commands Executed

```bash
git --no-pager status --short --untracked-files=no
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -10

git --no-pager diff -- packages/shared/src/interfaces/agent-types.ts \
  packages/shared/src/adapters/claude-code.adapter.ts \
  packages/shared/src/interfaces/copilot-sdk.interface.ts \
  packages/shared/src/adapters/sdk-copilot-adapter.ts \
  packages/shared/src/fakes/fake-copilot-client.ts \
  packages/shared/src/fakes/fake-copilot-session.ts \
  packages/shared/src/interfaces/index.ts \
  packages/shared/src/index.ts \
  test/contracts/agent-adapter.contract.ts > \
  /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-1-sdk-copilot-adapter-improvements/reviews/_computed.diff

git --no-pager diff --staged -- packages/shared/src/interfaces/agent-types.ts \
  packages/shared/src/adapters/claude-code.adapter.ts \
  packages/shared/src/interfaces/copilot-sdk.interface.ts \
  packages/shared/src/adapters/sdk-copilot-adapter.ts \
  packages/shared/src/fakes/fake-copilot-client.ts \
  packages/shared/src/fakes/fake-copilot-session.ts \
  packages/shared/src/interfaces/index.ts \
  packages/shared/src/index.ts \
  test/contracts/agent-adapter.contract.ts >> \
  /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-1-sdk-copilot-adapter-improvements/reviews/_computed.diff

npm test

# Harness live-validation subagent
just harness health
just harness doctor
just harness ports
curl http://127.0.0.1:3159/
curl http://127.0.0.1:3159/api/workspaces
docker ps
docker inspect chainglass-066-wf-real-agents
docker logs chainglass-066-wf-real-agents
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: APPROVE

**Plan**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/agent-runner-plan.md
**Spec**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/agent-runner-spec.md
**Phase**: Phase 1: SdkCopilotAdapter Improvements
**Tasks dossier**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-1-sdk-copilot-adapter-improvements/tasks.md
**Execution log**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-1-sdk-copilot-adapter-improvements/execution.log.md
**Review file**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-1-sdk-copilot-adapter-improvements/reviews/review.phase-1-sdk-copilot-adapter-improvements.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/interfaces/agent-types.ts | Modified | agents | None |
| /Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/adapters/claude-code.adapter.ts | Modified | agents | None |
| /Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/interfaces/copilot-sdk.interface.ts | Modified | agents | None |
| /Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/adapters/sdk-copilot-adapter.ts | Modified | agents | Add direct forwarding assertions in tests before relying on coverage claims |
| /Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/fakes/fake-copilot-client.ts | Modified | agents | Sync `getLastSessionConfig()` behavior with resume-session path |
| /Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/fakes/fake-copilot-session.ts | Modified | agents | None |
| /Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/interfaces/index.ts | Modified | agents | None |
| /Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/index.ts | Modified | agents | None |
| /Users/jordanknight/substrate/066-wf-real-agents/test/contracts/agent-adapter.contract.ts | Modified | agents | Expand from option-acceptance to forwarding assertions |

### Required Fixes (if REQUEST_CHANGES)

Not required — this phase is approved, with medium/low follow-ups documented above.

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/066-wf-real-agents/docs/domains/agents/domain.md | Add Plan 070 Phase 1 History row; add Concepts/Contracts entries for `ICopilotClient`, `ICopilotSession`, `CopilotModelInfo`, and `CopilotReasoningEffort` |

### Next Step

/plan-5-v2-phase-tasks-and-brief --phase "Phase 2: Agent Runner Infrastructure" --plan /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/agent-runner-plan.md
