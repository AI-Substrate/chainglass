# Code Review: Phase 4: CLI Commands

**Plan**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md
**Spec**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/question-popper-spec.md
**Phase**: Phase 4: CLI Commands
**Date**: 2026-03-07
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

`cg question get` does not honor the required pending-response contract from AC-08, so the phase is not yet safe to approve.

**Key failure areas**:
- **Implementation**: `cg question get` returns the full pending `QuestionOut` object instead of `{ "questionId": "...", "status": "pending" }`.
- **Domain compliance**: `question-popper/domain.md`, `domain-map.md`, and the plan Domain Manifest do not reflect the shipped CLI layer.
- **Testing**: Blocking integration coverage is still placeholder-only, and `execution.log.md` preserves no final `just fft` / help-output evidence.
- **Doctrine**: The unit suite relies on `vi.spyOn`, omits per-test Test Docs, and uses wall-clock timeout waiting in a unit test.

## B) Summary

The Phase 4 CLI surface is mostly present: the new command groups register correctly, the targeted unit suite passes, and no cross-domain reinvention was found. The material blocker is the unresolved `cg question get` pending-path contract mismatch: source inspection shows the handler always serializes the full `QuestionOut`, which conflicts with both the spec and the phase dossier for AC-08. Review confidence is also reduced by placeholder subprocess tests, an unfinished execution log, and stale domain artifacts that still describe the pre-CLI domain shape. The feature is close, but it needs one behavior fix and a round of artifact/test hardening before approval.

## C) Checklist

**Testing Approach: Hybrid**

- [x] Core handler validation tests present
- [ ] Blocking/timeout subprocess validation implemented
- [ ] Pending-state response contract covered
- [ ] Help-output evidence preserved in phase artifacts

Universal (all approaches):
- [ ] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/067-question-popper/apps/cli/src/commands/question.command.ts:102-105 | correctness | `handleQuestionGet()` always prints the full `QuestionOut`, so pending lookups violate AC-08/T004's required `{ questionId, status: "pending" }` contract. | Emit the compact pending object for unresolved questions and add a dedicated pending-state unit test. |
| F002 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/test/integration/question-popper/cli-blocking.test.ts:18-43; /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-4-cli-commands/execution.log.md:37-46 | testing | The blocking/timeout integration suite is three skipped placeholders, and the execution log never records a completed quality-gate run or preserved help-output evidence. | Replace placeholders with real subprocess assertions and append concrete command results to `execution.log.md`. |
| F003 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/cli-commands.test.ts:15-16; /Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/cli-commands.test.ts:68-75; /Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/cli-commands.test.ts:88-401 | doctrine | The unit suite uses forbidden `vi.spyOn`, omits per-test 5-field Test Docs, and drives timeout behavior with a real 2-second sleep. | Introduce fake output/sleeper seams, remove spy-based assertions, and add the required Test Doc block to each surviving `it(...)` case. |
| F004 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/apps/cli/src/commands/question.command.ts:295-347; /Users/jordanknight/substrate/067-question-popper/apps/cli/src/commands/alert.command.ts:44-67 | documentation | `cg question --help` / `cg alert --help` explain the concepts, but they do not enumerate the subcommand option surface that T002/T007 require for self-documenting agent help. | Expand the group help text (or help formatter) to include the relevant subcommand flags and examples in one place. |
| F005 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md:26-35; /Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md:111-114 | domain-compliance | `question-popper/domain.md` still says CLI/API are not implemented and has no Phase 3/4 history, composition, or dependency updates. | Refresh the Boundary, Composition, Concepts, Source Location, Dependencies, and History sections for the shipped API + CLI layers. |
| F006 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md:67-100; /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md:42-46; /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md:123-166 | domain-compliance | The plan Domain Manifest and `domain-map.md` do not fully cover Phase 4 CLI composition files or the `_platform/external-events` contracts now consumed by the CLI layer. | Add the missing CLI/test files to the Domain Manifest and update the map node/edge labels plus health summary for `question-popper` and `_platform/external-events`. |
| F007 | LOW | /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-3-server-api-routes/reviews/_computed.diff:1; /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-3-server-api-routes/reviews/review.phase-3-server-api-routes.md:1-120 | scope | The Phase 4 commit range also adds prior Phase 3 review artifacts, which are outside the Phase 4 task dossier and make the diff noisier than necessary. | Move those review artifacts into the originating phase commit/review flow, or explicitly document why they must travel with Phase 4. |

## E) Detailed Findings

### E.1) Implementation Quality
- **F001 (HIGH)** — `/Users/jordanknight/substrate/067-question-popper/apps/cli/src/commands/question.command.ts:102-105`  
  The pending branch for `cg question get` is incorrect. T004 in `/Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-4-cli-commands/tasks.md:163` and AC-08 in `/Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/question-popper-spec.md:161-165` both require unresolved lookups to print only `{ questionId, status: "pending" }`, but the implementation unconditionally prints `JSON.stringify(question)`. The current unit suite never exercises that path, so the mismatch escaped.

- **F007 (LOW)** — `/Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-3-server-api-routes/reviews/_computed.diff:1`; `/Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-3-server-api-routes/reviews/review.phase-3-server-api-routes.md:1-120`  
  The reviewed commit range includes Phase 3 review artifacts that are not part of the Phase 4 task table. This does not change runtime behavior, but it weakens scope hygiene and complicates future phase diffs.

- No additional HIGH security or performance defects were confirmed in the Phase 4 CLI code.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New source files live under `apps/cli/src/commands/`, CLI composition changes stay in `apps/cli/src/bin/` / `apps/cli/src/commands/`, and tests live under `test/unit/` + `test/integration/`. |
| Contract-only imports | ✅ | The CLI layer imports `_platform/external-events` and shared question-popper contracts via package exports; no cross-domain internal file import violation was found. |
| Dependency direction | ✅ | `question-popper` consumes `_platform/external-events` infrastructure from the CLI layer; no infrastructure→business inversion or business→business internal import was introduced. |
| Domain.md updated | ❌ | `/Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md` still describes a pre-Phase-3/4 state. |
| Registry current | ✅ | `/Users/jordanknight/substrate/067-question-popper/docs/domains/registry.md` already contains rows for `_platform/external-events` and `question-popper`. |
| No orphan files | ❌ | The plan Domain Manifest does not map `apps/cli/src/bin/cg.ts`, `apps/cli/src/commands/index.ts`, or the two Phase 4 test files. |
| Map nodes current | ❌ | The `question-popper` / `_platform/external-events` node summaries and health summary rows lag the shipped CLI surface. |
| Map edges current | ❌ | The `questionPopper --> externalEvents` edge still reflects the earlier service-only dependency and omits `readServerInfo()` / `getTmuxMeta()`. |
| No circular business deps | ✅ | No new business-domain cycle was introduced by the CLI layer. |
| Concepts documented | ⚠️ | Concepts sections exist, but `question-popper/domain.md` still does not explain the delivered CLI entrypoints or their role in the domain. |

- **F005 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md:26-35`; `/Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md:111-114`  
  The domain document is stale after Phase 4. It still says CLI commands and API routes are not implemented, and its history stops at Phase 2.  
  **Fix**: Update the Boundary, Composition, Concepts, Contracts (if exposing CLI-facing contracts), Dependencies, Source Location, and History sections for Phase 3 + 4.

- **F006 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md:67-100`; `/Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md:42-46`; `/Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md:123-166`  
  The planning/domain topology artifacts lag the code. The Domain Manifest misses Phase 4 composition/test files, and the domain map/health summary do not describe the CLI layer's `readServerInfo()` / `getTmuxMeta()` dependency surface.  
  **Fix**: Sync the manifest rows, node labels, edge labels, and health summary entries to match the current Phase 4 imports and ownership.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `IEventPopperClient` / `createEventPopperClient` / `FakeEventPopperClient` | None | None | Proceed |
| `cg question` command group | Legacy `cg wf node ask|answer|get-answer` style flows | `workflow-events` | Proceed |
| Blocking poll loop for `cg question ask` | Timer-based polling in `CopilotCliAdapter.tailUntilIdle()` / `tailUntilEvent()` | `agents` | Proceed |
| `cg alert` command group | None | None | Proceed |

No genuine cross-domain duplication was confirmed. The Phase 4 CLI layer is a new concept surface, and the closest analogues are only conceptual precedents rather than reusable implementations.

### E.4) Testing & Evidence

**Coverage confidence**: 37%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-05 | 45% | `pnpm vitest run test/unit/question-popper/cli-commands.test.ts test/integration/question-popper/cli-blocking.test.ts` passed the handler happy-path test, but the subprocess blocking test is still skipped placeholder code. |
| AC-06 | 55% | The unit suite has a timeout-path assertion, but it waits on the real 2-second poll loop and there is no executed subprocess timeout proof. |
| AC-07 | 60% | `--timeout 0` is covered by a passing unit test. Immediate-return behavior is not validated via a spawned CLI process. |
| AC-08 | 5% | No pending-state unit test exists, and source inspection shows the pending path is currently wrong. |
| AC-09 | 30% | Table-mode list output is exercised, but the test only checks call count rather than rendered columns/content. |
| AC-10 | 70% | Success, confirm coercion, multi coercion, and conflict handling are covered by unit tests. |
| AC-11 | 60% | `handleAlertSend()` has a direct unit test proving it prints `{ alertId }`. |
| AC-12 | 20% | The list fixture includes both question and alert records, but no assertion checks that alerts are clearly distinguished in rendered output. |
| AC-13 | 20% | Tests only verify `meta` exists; they do not prove session/window/pane extraction. |
| AC-14 | 5% | No test proves that `meta.tmux` is absent outside tmux. |
| AC-33 | 0% | The phase AC list includes AC-33, but the phase dossier also calls the `CLAUDE.md` fragment a Phase 7 non-goal, so there is no implementation or evidence here. |
| AC-34 | 45% | `pnpm exec tsx apps/cli/src/bin/cg.ts question --help` shows purpose, statuses, chaining, and examples, but it omits a complete subcommand option catalog. |
| AC-35 | 65% | `pnpm exec tsx apps/cli/src/bin/cg.ts alert --help` covers alert semantics and examples, but it likewise omits the detailed send-option surface. |

- **F002 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/test/integration/question-popper/cli-blocking.test.ts:18-43`; `/Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-4-cli-commands/execution.log.md:37-46`  
  The phase still lacks durable end-to-end evidence. All three integration tests are `describe.skip` placeholders with `expect(true)`, and `execution.log.md` stops at "`just fft` running — awaiting results" without recording a completed quality-gate outcome or preserved help-output evidence.  
  **Fix**: Implement real subprocess checks for blocking/timeout/immediate-return and append the actual command outputs/results to the execution log.

### E.5) Doctrine Compliance
- **F003 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/cli-commands.test.ts:15-16`; `/Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/cli-commands.test.ts:68-75`; `/Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/cli-commands.test.ts:88-401`  
  The unit suite conflicts with the documented test doctrine in multiple ways: it uses `vi.spyOn(console, ...)`, omits the required 5-field Test Doc from each test case, and verifies timeout behavior via a real 2-second delay instead of an injected or mocked clock.  
  **Fix**: Inject fake output/sleeper seams, rewrite assertions against fakes instead of spies, and add the required Test Doc block inside each test case.

- **F004 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/apps/cli/src/commands/question.command.ts:295-347`; `/Users/jordanknight/substrate/067-question-popper/apps/cli/src/commands/alert.command.ts:44-67`  
  The help text is directionally good, but it does not fully satisfy the phase's self-documenting contract for agents because the group help output still omits a comprehensive option catalog for the shipped subcommands.  
  **Fix**: Extend the help prose or formatter so `cg question --help` / `cg alert --help` list the important flags and argument patterns in one place.

### E.6) Harness Live Validation
N/A — no harness configured (`/Users/jordanknight/substrate/067-question-popper/docs/project-rules/harness.md` does not exist).

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-05 | `cg question ask` blocks until answered and prints answer JSON | Passing handler-level poll/answer unit test; no executed subprocess proof | 45% |
| AC-06 | Timeout returns `{ questionId, status: "pending" }` | Passing handler-level timeout unit test using real poll delay; no live CLI evidence | 55% |
| AC-07 | `--timeout 0` returns immediately | Passing handler-level unit test; no subprocess timing proof | 60% |
| AC-08 | `cg question get` returns answer JSON or pending summary | Source inspection shows pending path is currently wrong; no pending-state test | 5% |
| AC-09 | `cg question list` shows type/status/source/text/age | Table-mode test exists but only checks call count, not actual rendered content | 30% |
| AC-10 | `cg question answer` posts coerced answers | Passing unit coverage for success + coercion + conflict paths | 70% |
| AC-11 | `cg alert send` returns `{ alertId }` immediately | Passing handler-level unit test | 60% |
| AC-12 | Alerts appear alongside questions in list output | Indirect fixture coverage only; rendered distinction is not asserted | 20% |
| AC-13 | Tmux session/window/pane metadata auto-included | Tests only prove a `meta` object exists | 20% |
| AC-14 | `meta.tmux` absent outside tmux | No direct absence-path verification | 5% |
| AC-33 | Minimal `CLAUDE.md` fragment exists | No implementation/evidence in this phase; dossier defers it to Phase 7 non-goals | 0% |
| AC-34 | `cg question --help` fully self-documents the system | Direct help-command review confirms concept coverage but not all options | 45% |
| AC-35 | `cg alert --help` self-documents alert semantics | Direct help-command review confirms semantics/examples but not all options | 65% |

**Overall coverage confidence**: 37%

## G) Commands Executed

```bash
git --no-pager diff --stat && printf '\n--STAGED--\n' && git --no-pager diff --staged --stat && printf '\n--STATUS--\n' && git --no-pager status --short && printf '\n--LOG--\n' && git --no-pager log --oneline -15
git --no-pager diff 562633d..57eeaa8 > /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-4-cli-commands/reviews/_computed.diff
git --no-pager diff --name-status 562633d..57eeaa8
git --no-pager diff --stat 562633d..57eeaa8
rg -n "handleQuestionGet|JSON\.stringify\(question\)|vi\.spyOn|describe\.skip|expect\(true\)\.toBe\(true\)" /Users/jordanknight/substrate/067-question-popper/{apps/cli/src/commands/question.command.ts,test/unit/question-popper/cli-commands.test.ts,test/integration/question-popper/cli-blocking.test.ts}
rg -n "CLI commands \(Phase 4 — not yet implemented\)|API routes \(Phase 3 — not yet implemented\)|getTmuxMeta|readServerInfo" /Users/jordanknight/substrate/067-question-popper/docs/domains/*.md
pnpm vitest run test/unit/question-popper/cli-commands.test.ts test/integration/question-popper/cli-blocking.test.ts
pnpm exec tsx apps/cli/src/bin/cg.ts question --help | sed -n '1,120p'
pnpm exec tsx apps/cli/src/bin/cg.ts alert --help | sed -n '1,120p'
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md
**Spec**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/question-popper-spec.md
**Phase**: Phase 4: CLI Commands
**Tasks dossier**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-4-cli-commands/tasks.md
**Execution log**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-4-cli-commands/execution.log.md
**Review file**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-4-cli-commands/reviews/review.phase-4-cli-commands.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/067-question-popper/apps/cli/src/bin/cg.ts | Modified | question-popper | Update Domain Manifest coverage only |
| /Users/jordanknight/substrate/067-question-popper/apps/cli/src/commands/alert.command.ts | Added | question-popper | Expand group help to include option catalog |
| /Users/jordanknight/substrate/067-question-popper/apps/cli/src/commands/event-popper-client.ts | Added | question-popper | No direct runtime defect found |
| /Users/jordanknight/substrate/067-question-popper/apps/cli/src/commands/index.ts | Modified | question-popper | Update Domain Manifest coverage only |
| /Users/jordanknight/substrate/067-question-popper/apps/cli/src/commands/question.command.ts | Added | question-popper | Fix pending `get` output contract and expand help text |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-3-server-api-routes/reviews/_computed.diff | Added | planning artifact | Move to originating phase flow or explicitly justify scope |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-3-server-api-routes/reviews/review.phase-3-server-api-routes.md | Added | planning artifact | Move to originating phase flow or explicitly justify scope |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-4-cli-commands/execution.log.md | Added | question-popper | Append completed command/evidence results |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-4-cli-commands/tasks.fltplan.md | Added | planning artifact | No direct fix required |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-4-cli-commands/tasks.md | Added | planning artifact | Reconcile AC-33 ownership if phase scope is updated |
| /Users/jordanknight/substrate/067-question-popper/test/integration/question-popper/cli-blocking.test.ts | Added | question-popper | Replace placeholder skipped tests with real subprocess assertions |
| /Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/cli-commands.test.ts | Added | question-popper | Add pending-get coverage, remove spies/real-time waits, add Test Docs |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/067-question-popper/apps/cli/src/commands/question.command.ts | Return `{ questionId, status: "pending" }` for unresolved `cg question get` calls | AC-08/T004 contract is currently broken |
| 2 | /Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/cli-commands.test.ts | Add a pending-state `handleQuestionGet` test and replace spy/time-based assertions with fakeable seams | The current suite missed the contract bug and violates project test doctrine |
| 3 | /Users/jordanknight/substrate/067-question-popper/test/integration/question-popper/cli-blocking.test.ts | Implement real skipped subprocess tests for blocking, timeout, and immediate return | Phase 4 lacks durable CLI end-to-end evidence |
| 4 | /Users/jordanknight/substrate/067-question-popper/apps/cli/src/commands/question.command.ts; /Users/jordanknight/substrate/067-question-popper/apps/cli/src/commands/alert.command.ts | Expand agent help so the group help enumerates important subcommand options in one place | AC-34/35 are only partially met today |
| 5 | /Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md; /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md; /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md; /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-4-cli-commands/execution.log.md | Sync domain/planning artifacts and append final evidence | Review docs currently lag the shipped Phase 4 code |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md | Remove stale "not yet implemented" lines; add CLI/API composition, dependencies, concepts, and Phase 3/4 history |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md | Update node labels, edge labels, and health summary for Phase 4 CLI dependencies/contracts |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md | Add Phase 4 CLI composition/test files to the Domain Manifest |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md --phase 'Phase 4: CLI Commands'
