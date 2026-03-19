# Fix Tasks: Phase 3: Harness Workflow Commands

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Distinguish timeout failures from generic workflow failures
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts, /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/test-data/cg-spawner.ts
- **Issue**: `workflow.run` currently reports every non-zero exit as `timeout`, even when the CLI failed for another reason.
- **Fix**: Return an explicit `timedOut` flag from `spawnCg()` and use it to derive `exitReason` (`complete` / `timeout` / `error`). Preserve the original non-timeout failure path so agents can react correctly.
- **Patch hint**:
  ```diff
  - exitReason: result.exitCode === 0 ? 'complete' : 'timeout',
  + exitReason: result.timedOut
  +   ? 'timeout'
  +   : result.exitCode === 0
  +     ? 'complete'
  +     : 'error',
  ```

### FT-002: Honor target/workspace resolution in the workflow command group
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts, /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/test-data/cg-spawner.ts
- **Issue**: The workflow commands do not reuse the existing `test-data.ts` option-resolution pattern. `spawnCg()` ignores `target === 'container'`, and the command group never computes `containerName` / explicit `workspacePath`.
- **Fix**: Mirror `resolveOptions()` from `harness/src/cli/commands/test-data.ts`: add `--workspace-path`, default it to `process.cwd()`, compute `containerName` from `computePorts()`, and branch the spawn path to `docker exec ... /app/apps/cli/dist/cli.cjs` when running in container mode.
- **Patch hint**:
  ```diff
  - function buildExecOptions(opts: { target?: string }): CgExecOptions {
  -   return { target: (opts.target as 'local' | 'container') ?? 'local' };
  - }
  + function buildExecOptions(opts: { target?: string; workspacePath?: string }): CgExecOptions {
  +   const target = (opts.target as 'local' | 'container') ?? 'local';
  +   const ports = target === 'container' ? computePorts() : null;
  +   return {
  +     target,
  +     workspacePath: opts.workspacePath ?? process.cwd(),
  +     containerName: ports ? `chainglass-${ports.worktree}` : undefined,
  +   };
  + }
  ```

### FT-003: Surface captured stderr/server errors through `workflow logs`
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts
- **Issue**: `workflow.run` caches `stderrLines`, but `workflow.logs` returns only cached NDJSON events. That hides the server-side orchestration errors the phase was supposed to expose.
- **Fix**: Include cached `stderrLines` in the log payload, and make `--errors` filter both NDJSON error events and captured stderr lines so AC-11 is satisfied by the command output itself.
- **Patch hint**:
  ```diff
    exitWithEnvelope(
      formatSuccess('workflow.logs', {
        totalEvents: cached.events?.length ?? 0,
        filteredEvents: events.length,
        filters,
  -     events,
  +     events,
  +     stderrLines: cached.stderrLines ?? [],
      }),
    );
  ```

### FT-004: Add durable workflow-command tests and capture a successful dogfooding run
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/harness/tests/unit/cli/index.test.ts, /Users/jordanknight/substrate/074-actaul-real-agents/harness/tests/unit/cli/workflow.test.ts, /Users/jordanknight/substrate/074-actaul-real-agents/harness/tests/integration/cli/workflow.test.ts, /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-3-harness-workflow-commands/execution.log.md
- **Issue**: The phase selected a Hybrid strategy but shipped without durable tests for the new command group/spawner/auto-completion path, and the recorded evidence stops at a degraded timeout run.
- **Fix**: Add unit coverage for command registration and envelope formatting, add integration coverage for reset/run/status/logs behavior, then rerun the dogfooding sequence with real credentials so the execution log contains a passing `reset -> run -> status -> logs` proof.
- **Patch hint**:
  ```diff
  + // harness/tests/unit/cli/workflow.test.ts
  + it('returns a HarnessEnvelope for workflow logs when cached run data exists', async () => {
  +   /* Test Doc:
  +   - Why: ...
  +   - Contract: ...
  +   - Usage Notes: ...
  +   - Quality Contribution: ...
  +   - Worked Example: ...
  +   */
  + });
  ```

## Medium / Low Fixes

### FT-005: Strengthen assertions and the status payload to match Phase 3 claims
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts
- **Issue**: The run path validates only four coarse assertions, and the status payload does not expose the richer pod/iteration detail promised by AC-6.
- **Fix**: Add completion-oriented assertions (all nodes complete, questions answered, sessions populated, final graph status) and include explicit iteration / active-pod fields in the status envelope or narrow the acceptance criteria/docs to match what the code actually returns.
- **Patch hint**:
  ```diff
  - assertions.push({ name: 'clean-exit', passed: result.exitCode === 0, ... });
  + assertions.push({ name: 'all-nodes-complete', passed: finalNodeStatuses.every(...), ... });
  + assertions.push({ name: 'questions-answered', passed: pendingQuestions.length === 0, ... });
  + assertions.push({ name: 'sessions-populated', passed: Object.keys(sessions).length > 0, ... });
  ```

### FT-006: Update the permanent harness rules and ADR trail
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/project-rules/harness.md, /Users/jordanknight/substrate/074-actaul-real-agents/docs/adr/adr-0014-first-class-agentic-development-harness.md
- **Issue**: The persistent documentation still says the harness only consumes `@chainglass/shared` / public web APIs, while Phase 076 added direct positional-graph/workflow imports and a new workflow command group.
- **Fix**: Update `harness.md` with the workflow commands, a Phase 076 history entry, and the sanctioned import exception; amend ADR-0014 or add a linked follow-on note that scopes the exception.
- **Patch hint**:
  ```diff
  - It is included in `pnpm-workspace.yaml` ... so it can import `@chainglass/shared` ...
  + It is included in `pnpm-workspace.yaml` ... so it can import `@chainglass/shared`.
  + Phase 076 adds a narrow workflow-runner exception permitting harness-side imports from
  + `@chainglass/positional-graph` and `@chainglass/workflow` for workflow auto-completion.
  ```

### FT-007: Reduce helper duplication in auto-completion support code
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/test-data/auto-completion.ts
- **Issue**: The disk-loader and Q&A helper concepts were copied from existing repo helpers instead of being extracted or deliberately wrapped.
- **Fix**: Consolidate the shared helper behavior behind one source of truth (new shared harness helper, exported package helper, or carefully documented local wrapper) so future changes do not fork the logic further.
- **Patch hint**:
  ```diff
  - function buildDiskWorkUnitLoader(workspacePath: string): IWorkUnitLoader { ... }
  + import { buildDiskWorkUnitLoader } from '<shared helper module>';
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
