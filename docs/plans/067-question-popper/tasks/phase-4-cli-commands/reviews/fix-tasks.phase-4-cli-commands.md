# Fix Tasks: Phase 4: CLI Commands

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Restore the pending `cg question get` contract
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/apps/cli/src/commands/question.command.ts; /Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/cli-commands.test.ts
- **Issue**: `handleQuestionGet()` always prints the full `QuestionOut`, so unresolved lookups violate AC-08 / T004 instead of returning `{ questionId, status: "pending" }`.
- **Fix**: Add an explicit pending branch in `handleQuestionGet()`, emit the compact payload, and add a unit test that proves the pending path.
- **Patch hint**:
  ```diff
   export async function handleQuestionGet(client: IEventPopperClient, id: string): Promise<void> {
     try {
       const question = await client.getQuestion(id);
  -    console.log(JSON.stringify(question));
  +    if (question.status === 'pending') {
  +      console.log(JSON.stringify({ questionId: question.questionId, status: 'pending' }));
  +      return;
  +    }
  +    console.log(JSON.stringify(question));
     } catch (error) {
  ```

## Medium / Low Fixes

### FT-002: Replace placeholder integration coverage with real subprocess checks
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/test/integration/question-popper/cli-blocking.test.ts; /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-4-cli-commands/execution.log.md
- **Issue**: The integration suite is `describe.skip` placeholder code with `expect(true)`, and `execution.log.md` never records a completed quality-gate or help-output run.
- **Fix**: Implement the intended subprocess assertions for answer/timeout/immediate-return, keep them skipped if the harness/server dependency is unavoidable, and append actual command outputs/results to the execution log.
- **Patch hint**:
  ```diff
  - it('cg question ask blocks and returns on answer', async () => {
  -   expect(true).toBe(true); // Placeholder
  - });
  + it('cg question ask blocks and returns on answer', async () => {
  +   // spawn `cg question ask ...`, answer via `cg question answer ...`,
  +   // assert stdout JSON and exit code deterministically
  + });
  ```

### FT-003: Bring the unit suite back into doctrine compliance
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/cli-commands.test.ts
- **Issue**: The unit suite uses forbidden `vi.spyOn`, omits per-test Test Docs, and waits on a real 2-second poll sleep.
- **Fix**: Inject fake output/sleeper seams into the handlers, assert via fakes instead of spies, and add the required 5-field Test Doc inside each `it(...)` case.
- **Patch hint**:
  ```diff
  - logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  - errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  + const output = new FakeCliOutput();
  + const sleeper = new FakeSleeper();
  + // pass output/sleeper into handler helpers and assert on the fake state
  ```

### FT-004: Make group help fully self-documenting for agents
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/apps/cli/src/commands/question.command.ts; /Users/jordanknight/substrate/067-question-popper/apps/cli/src/commands/alert.command.ts
- **Issue**: `cg question --help` and `cg alert --help` explain the concepts but do not enumerate the important shipped option surface in one place.
- **Fix**: Expand the custom help prose/formatter so the group-level help lists the key subcommand flags, arguments, and representative invocations.
- **Patch hint**:
  ```diff
   SUBCOMMANDS:
     ask      Post a question and wait for an answer (blocks by default)
  +
  +IMPORTANT FLAGS:
  +  ask --type <text|single|multi|confirm>
  +  ask --text <question>
  +  ask --timeout <seconds>
  +  ask --previous-question-id <id>
  +  answer <id> --answer <value> [--text <freeform>]
  +  list [--status <filter>] [--limit <n>] [--json]
  ```

### FT-005: Sync the domain and plan artifacts with the shipped CLI layer
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md; /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md; /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md; /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-4-cli-commands/tasks.md
- **Issue**: The domain doc still says CLI/API are unimplemented, the domain map omits the Phase 4 external-events contracts, and the plan Domain Manifest misses Phase 4 composition/test files.
- **Fix**: Update the domain doc, map, and Domain Manifest to reflect the CLI layer; while touching the phase dossier, reconcile AC-33 ownership if it remains deferred to Phase 7.
- **Patch hint**:
  ```diff
  - - CLI commands (Phase 4 — not yet implemented)
  - - API routes (Phase 3 — not yet implemented)
  + - CLI commands (`cg question`, `cg alert`, blocking poll loop, help surface)
  + - API routes (`/api/event-popper/*` HTTP surface consumed by the CLI)
  ```

### FT-006: Clean up phase scope noise
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-3-server-api-routes/reviews/_computed.diff; /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-3-server-api-routes/reviews/review.phase-3-server-api-routes.md
- **Issue**: The Phase 4 commit range pulled in prior Phase 3 review artifacts.
- **Fix**: Move them into the originating phase review flow or document the rationale for carrying them in the Phase 4 commit.
- **Patch hint**:
  ```diff
  - Phase 4 commit includes Phase 3 review artifacts
  + Phase 3 review artifacts committed with their originating phase, or explicitly noted as carry-over
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
