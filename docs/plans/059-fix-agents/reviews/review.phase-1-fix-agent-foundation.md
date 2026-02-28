# Code Review: Phase 1: Fix Agent Foundation

**Plan**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md
**Spec**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-spec.md
**Phase**: Phase 1: Fix Agent Foundation
**Date**: 2026-02-28
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

High-severity correctness, domain-compliance, testing-evidence, and doctrine violations remain unmitigated.

**Key failure areas**:
- **Implementation**: Copilot CLI create-path data is dropped server-side, DI wiring is incomplete for tmux Enter behavior, and lifecycle SSE events are not aligned with consumer expectations.
- **Domain compliance**: Domain map currently documents an infrastructure → business dependency and the plan Domain Manifest is incomplete for changed files.
- **Reinvention**: The new work-unit-state scope overlaps existing state and question systems without a documented extension-first strategy.
- **Testing**: No execution log and no targeted regression tests were provided for the claimed acceptance-criteria coverage.
- **Doctrine**: Plan/spec/tasks artifacts conflict with mandatory project rules (TDD, rollback planning, and required merge gates).

## B) Summary

The phase includes meaningful progress on agent type support and routing fixes, but the implementation is not yet review-ready. Core wiring gaps remain around copilot-cli parameter propagation and SSE lifecycle event semantics. Domain artifacts were added, but domain-map directionality and manifest traceability are not fully compliant. Evidence quality is weak for this phase because execution.log.md is missing and no phase-specific regression tests were added. Additional fixes are required before approval.

## C) Checklist

**Testing Approach: Hybrid**

Hybrid (required checks):
- [ ] TDD or test-first evidence present where required by project rules
- [ ] Lightweight/manual verification evidence attached for integration/UI steps
- [ ] Regression tests added for changed wiring paths

Universal (all approaches):
- [ ] Only in-scope files changed
- [ ] Linters/type checks/build clean (`just lint`, `just typecheck`, `just build`, `just test`)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/agents/route.ts:131-135 | correctness | POST create path drops `sessionId`/`tmuxWindow`/`tmuxPane` for `copilot-cli` agents. | Extend shared create params and forward copilot-cli fields end-to-end. |
| F002 | HIGH | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/di-container.ts:253-259,418-423 | correctness | CopilotCLIAdapter wiring omits explicit `sendEnter` and tmux target/session configuration. | Match CLI container pattern: provide `sendEnter` and deterministic tmux target/session handling. |
| F003 | HIGH | /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/agents/route.ts:137-142; /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/agents/[id]/route.ts:124-132; /Users/jordanknight/substrate/059-fix-agents/apps/web/src/features/019-agent-manager-refactor/useAgentManager.ts:186 | correctness | Lifecycle event contract mismatch: code listens for `agent_created`/`agent_terminated` but creation/deletion routes do not emit them. | Emit explicit created/terminated events (or align all contracts/docs/hooks to one status-event model). |
| F004 | HIGH | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-1-fix-agent-foundation/execution.log.md | testing | Required execution evidence artifact is missing. | Create execution.log.md with command outputs and manual verification observations per AC. |
| F005 | HIGH | /Users/jordanknight/substrate/059-fix-agents/test/unit/web/agents/*.test.ts (missing) | testing | Required targeted regression tests (T008) are absent from this phase diff. | Add and run API serialization, SSE broadcast, and DI factory tests. |
| F006 | HIGH | /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md:74 | dependency-direction | Domain map documents `_platform/positional-graph` → `agents` (infrastructure → business). | Refactor contract boundary or map classification to remove infra→business dependency direction. |
| F007 | HIGH | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md:88-92 | doctrine | Plan declares a TDD deviation that conflicts with mandatory TDD rules. | Remove deviation and define test-first execution for implementation tasks. |
| F008 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md:25-61 | orphan | Domain Manifest does not account for all changed files (e.g., next config/types and planning artifacts). | Complete file→domain mapping or explicitly scope out non-domain artifacts. |
| F009 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-spec.md | doctrine | CS-4 spec lacks rollback plan documentation. | Add rollback triggers and per-phase rollback steps. |
| F010 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-1-fix-agent-foundation/tasks.md:124,208-214 | doctrine | Quality gate text references `pnpm test` only, omitting required `just` checks. | Update task gates to require `just test`, `just typecheck`, `just lint`, `just build`. |
| F011 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/domains/work-unit-state/domain.md:85-118 | reinvention | New registry capabilities overlap with `_platform/state` responsibilities. | Prefer extension/bridge of existing state contracts and clarify non-duplication boundary. |
| F012 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/domains/work-unit-state/domain.md:85-118 | reinvention | Question lifecycle overlaps positional-graph/message question handling concepts. | Reuse or explicitly bridge existing question flow contracts instead of parallel semantics. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: `/apps/web/app/api/agents/route.ts:131-135` only forwards `{name,type,workspace}` to `createAgent()`, dropping copilot-cli parameters posted by the form.
- **F002 (HIGH)**: `/apps/web/src/lib/di-container.ts` registers `CopilotCLIAdapter` with `sendKeys` only; adapter default `sendEnter` uses `sendKeys('Enter')`, which is not equivalent to tmux Enter key handling used by CLI container.
- **F003 (HIGH)**: SSE lifecycle events are inconsistent with hook contract: `useAgentManager` subscribes to `agent_created` and `agent_terminated`, but create/delete routes do not emit those event types.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New files are placed in expected docs/domain/code locations. |
| Contract-only imports | ✅ | No new cross-domain internal import violations found in code changes. |
| Dependency direction | ❌ | `/docs/domains/domain-map.md` documents `_platform/positional-graph` (infra) consuming `agents` (business). |
| Domain.md updated | ✅ | `/docs/domains/agents/domain.md` and `/docs/domains/work-unit-state/domain.md` include required core sections. |
| Registry current | ✅ | `/docs/domains/registry.md` contains `agents` and `work-unit-state` entries. |
| No orphan files | ❌ | Plan Domain Manifest does not map all files present in this phase diff. |
| Map nodes current | ✅ | Domain map includes new domain nodes and health summary entries. |
| Map edges current | ✅ | New dependencies shown with labeled contracts. |
| No circular business deps | ✅ | No business→business cycle found in documented edges. |
| Concepts documented | ✅ | Both new domain docs include Concepts tables. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `IWorkUnitStateService` centralized state registry | `GlobalStateSystem` / `IStateService` in `/apps/web/src/lib/state/global-state-system.ts` and `/packages/shared/src/interfaces/state.interface.ts` | _platform/state | ⚠️ Overlap — extend/bridge preferred |
| First-class question lifecycle (`askQuestion`/`answerQuestion`) | Positional graph and message question flows in `/packages/positional-graph/src/services/positional-graph.service.ts` and `/packages/workflow/src/services/message.service.ts` | _platform/positional-graph | ⚠️ Overlap — extend/bridge preferred |

### E.4) Testing & Evidence

**Coverage confidence**: 27%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-01 | 55 | GET response shape in `/apps/web/app/api/agents/route.ts` matches hook fields; no recorded runtime/list-page proof. |
| AC-02 | 45 | POST validation + form defaults/types updated; no execution evidence for successful create flow. |
| AC-03 | 15 | Form sends copilot-cli fields, but route/create path does not forward/persist them. |
| AC-04 | 70 | DI factory includes all 3 agent types in `/apps/web/src/lib/di-container.ts`; no regression test evidence. |
| AC-05 | 20 | `broadcastStatus` used on create; explicit `agent_created`/`agent_terminated` evidence absent. |
| AC-06 | 20 | Detail page/hook wiring exists; no manual/test evidence of history + streaming behavior for this phase. |
| AC-07 | 30 | 409 guard exists in run route; no phase evidence proving SSE + NDJSON end-to-end. |
| AC-08 | 10 | Persistence paths exist conceptually; no restart verification evidence and no execution log. |

### E.5) Doctrine Compliance

- **F007 (HIGH)**: `/docs/plans/059-fix-agents/fix-agents-plan.md` declares a TDD deviation despite mandatory TDD in project rules.
- **F009 (MEDIUM)**: `/docs/plans/059-fix-agents/fix-agents-spec.md` is CS-4 without rollback plan.
- **F010 (MEDIUM)**: `/docs/plans/059-fix-agents/tasks/phase-1-fix-agent-foundation/tasks.md` quality gate omits required `just typecheck`, `just lint`, and `just build` checks.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | GET returns shape usable by `useAgentManager` | GET serialization includes expected fields in route handler | 55 |
| AC-02 | POST supports defaults + all 3 types | POST type validation + form defaults updated | 45 |
| AC-03 | copilot-cli accepts session/tmux fields | Form captures fields but route drops them | 15 |
| AC-04 | DI factory handles 3 agent types | Added `copilot-cli` branches in DI factories | 70 |
| AC-05 | SSE emits created/status/terminated lifecycle | Only status broadcast seen on create; terminated/create lifecycle events missing | 20 |
| AC-06 | Detail page shows history + streaming | No execution evidence in this phase | 20 |
| AC-07 | Run route 409 + SSE + NDJSON | 409 guard present; no complete evidence set | 30 |
| AC-08 | Sessions persist restart | No restart verification evidence recorded | 10 |

**Overall coverage confidence**: 27%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --porcelain
git --no-pager log --oneline -15
test -f docs/plans/059-fix-agents/tasks/phase-1-fix-agent-foundation/execution.log.md

git --no-pager diff -- . ':(exclude)docs/plans/059-fix-agents/reviews/*'
git --no-pager diff --staged -- . ':(exclude)docs/plans/059-fix-agents/reviews/*'
git ls-files --others --exclude-standard
git --no-pager diff --no-index -- /dev/null <untracked-file>

rg "new CopilotCLIAdapter\\(" .
rg "agent_created|agent_terminated" apps/web
rg "TDD|RED-GREEN|deviation|rollback|just test|just typecheck|just lint|just build" docs/project-rules
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md
**Spec**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-spec.md
**Phase**: Phase 1: Fix Agent Foundation
**Tasks dossier**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-1-fix-agent-foundation/tasks.md
**Execution log**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-1-fix-agent-foundation/execution.log.md (missing)
**Review file**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/reviews/review.phase-1-fix-agent-foundation.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/agents/route.ts | modified | agents | Yes (F001, F003) |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/next-env.d.ts | modified | generated | Optional cleanup (if unintended) |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/next.config.mjs | modified | cross-domain config | No |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/agents/create-session-form.tsx | modified | agents | No (already sends copilot-cli fields) |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/di-container.ts | modified | agents/cross-domain | Yes (F002) |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/agents/domain.md | created | agents | Optional clarifications only |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md | modified | cross-domain | Yes (F006) |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/registry.md | modified | cross-domain | No |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/work-unit-state/domain.md | created | work-unit-state | Yes (F011, F012 docs alignment) |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md | created | plan artifact | Yes (F007, F008) |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-spec.md | created | plan artifact | Yes (F009) |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-1-fix-agent-foundation/tasks.fltplan.md | created | plan artifact | No |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-1-fix-agent-foundation/tasks.md | created | plan artifact | Yes (F010) |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/workshops/001-top-bar-agent-ux.md | modified | plan artifact | No |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/workshops/003-work-unit-state-system.md | created | plan artifact | No |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/workshops/004-agent-creation-failure-root-cause.md | created | plan artifact | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/features/019-agent-manager-refactor/agent-instance.interface.ts | modified | agents | No |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/agents/route.ts; /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/features/019-agent-manager-refactor/agent-manager.interface.ts | Forward copilot-cli fields (`sessionId`, `tmuxWindow`, `tmuxPane`) through create path and validate required `sessionId` for `copilot-cli`. | AC-03 currently not met. |
| 2 | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/di-container.ts | Add explicit `sendEnter` and deterministic tmux target/session config for CopilotCLIAdapter. | Current wiring can send literal "Enter" text instead of Enter key. |
| 3 | /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/agents/route.ts; /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/agents/[id]/route.ts; /Users/jordanknight/substrate/059-fix-agents/apps/web/src/features/019-agent-manager-refactor/useAgentManager.ts | Align lifecycle SSE events (`agent_created`, `agent_terminated`) with emitted events and hook subscriptions. | AC-05/event contract mismatch. |
| 4 | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-1-fix-agent-foundation/execution.log.md | Add execution evidence with command output and manual verification notes. | Review evidence gate failed. |
| 5 | /Users/jordanknight/substrate/059-fix-agents/test/unit/web/agents/api-serialization.test.ts; /Users/jordanknight/substrate/059-fix-agents/test/unit/web/agents/sse-broadcast.test.ts; /Users/jordanknight/substrate/059-fix-agents/test/unit/web/agents/di-factory.test.ts | Add targeted regression tests and include pass output in execution log. | T008 not implemented. |
| 6 | /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md | Remove/replace infra→business edge (`_platform/positional-graph` → `agents`) or formalize compliant contract direction. | Domain compliance failure. |
| 7 | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md; /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-spec.md; /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-1-fix-agent-foundation/tasks.md | Resolve doctrine/rules mismatches (TDD requirement, rollback plan, mandatory just checks). | Required by project rules. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md | Dependency direction violates business/infra rule; update edge direction/contract strategy. |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md | Domain Manifest does not map all changed files in this phase diff. |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/work-unit-state/domain.md | Clarify non-duplication/extension strategy vs existing state/question systems. |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md --phase 'Phase 1: Fix Agent Foundation'
