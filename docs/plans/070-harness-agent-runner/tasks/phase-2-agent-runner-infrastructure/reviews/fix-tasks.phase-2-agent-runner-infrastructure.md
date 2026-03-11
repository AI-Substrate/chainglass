# Fix Tasks: Phase 2: Agent Runner Infrastructure

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Correct harness-root resolution and default cwd derivation
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/folder.ts; /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/agent/folder.test.ts
- **Issue**: `resolveHarnessRoot()` walks up to the repository root instead of `harness/`, so default discovery points at `<repo>/agents` and `agent run` derives the wrong working directory.
- **Fix**: Resolve only to `harness/`, preferably via `fileURLToPath(new URL('.', import.meta.url))`, then add a regression test that exercises default-root discovery/cwd without passing an explicit harness root.
- **Patch hint**:
  ```diff
  - return path.resolve(new URL('.', import.meta.url).pathname, '..', '..', '..');
  + return path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
  ```

### FT-002: Make successful runs produce deterministic report/stderr artifacts
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/runner.ts; /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/agent/runner.test.ts
- **Issue**: The runner validates `output/report.json` but never ensures the file exists, and it never writes `stderr.log` for adapter warnings/errors.
- **Fix**: Either persist `agentResult.output` to `runDir/output/report.json` or inject the concrete run-local output path into the frozen prompt/instructions before execution; also persist stderr/session-error output to `runDir/stderr.log` and add unit coverage for both artifacts.
- **Patch hint**:
  ```diff
  + const outputPath = path.join(runDir, 'output', 'report.json');
  + const stderrPath = path.join(runDir, 'stderr.log');
  - const fullPrompt = instructions ? `${instructions}\n\n---\n\n${prompt}` : prompt;
  + const fullPrompt = [
  +   instructions,
  +   `Write the final JSON report to: ${outputPath}`,
  +   prompt,
  + ].filter(Boolean).join('\n\n---\n\n');
  + if (agentResult.output) fs.writeFileSync(outputPath, agentResult.output);
  + if (stderrLines.length > 0) fs.writeFileSync(stderrPath, stderrLines.join('\n'));
  ```

### FT-003: Enforce timeout and harness-preflight contracts
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/runner.ts; /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/agent.ts; /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/agent/runner.test.ts
- **Issue**: Timeout handling cannot target the live session (`terminate('')`), timeout failures are surfaced as generic E120 instead of E123, and `agent run` never performs the required health/doctor preflight.
- **Fix**: Capture the active session ID during execution, terminate that session on timeout, map timeout failures to `ErrorCodes.AGENT_TIMEOUT`, and run the harness health/doctor preflight before SDK startup with evidence/tests.
- **Patch hint**:
  ```diff
  + let activeSessionId = '';
    const handleEvent = (event: AgentEvent): void => {
  +   if (event.type === 'session_start') activeSessionId = event.sessionId;
        ...
    };
  - await adapter.terminate('');
  + await adapter.terminate(activeSessionId || agentResult.sessionId);
  - formatError('agent run', ErrorCodes.AGENT_EXECUTION_FAILED, result.agentResult.output, ...)
  + const errorCode = result.metadata.result === 'timeout'
  +   ? ErrorCodes.AGENT_TIMEOUT
  +   : ErrorCodes.AGENT_EXECUTION_FAILED;
  + formatError('agent run', errorCode, result.agentResult.output, ...)
  ```

### FT-004: Add required Test Doc blocks and close the missing evidence gaps
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/agent/folder.test.ts; /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/agent/runner.test.ts; /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/agent/validator.test.ts
- **Issue**: All new durable tests omit the mandatory 5-field Test Doc block, and the suite still lacks direct coverage for default-root resolution, successful schema-backed runs, timeout semantics, stderr artifacts, and preflight behavior.
- **Fix**: Add a full Test Doc comment before every `it(...)` block and extend the suite for the missing contracts above.
- **Patch hint**:
  ```diff
    it('should run agent and return completed result', async () => {
  +   /*
  +   Test Doc:
  +   - Why: Protect the happy-path runner contract from regressions.
  +   - Contract: runAgent() creates artifacts and returns completed metadata.
  +   - Usage Notes: Use FakeAgentAdapter and a temp harness fixture.
  +   - Quality Contribution: Catches artifact/regression drift in the runner.
  +   - Worked Example: test-agent -> completed.json + events.ndjson + prompt copy.
  +   */
        ...
    });
  ```

## Medium / Low Fixes

### FT-005: Align run-folder IDs with the documented ISO format
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/harness/src/agent/folder.ts; /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/agent/folder.test.ts
- **Issue**: Run IDs omit the `YYYY-MM-DD` date separators promised by the dossier/spec.
- **Fix**: Emit `YYYY-MM-DDTHH-MM-SS-mmmZ-xxxx` IDs and update the folder tests to lock in the documented format.
- **Patch hint**:
  ```diff
  - const runId = [yyyy, mm, dd, 'T', hh, '-', min, '-', ss, '-', ms, 'Z-', suffix].join('');
  + const runId = `${yyyy}-${mm}-${dd}T${hh}-${min}-${ss}-${ms}Z-${suffix}`;
  ```

### FT-006: Update `_platform/sdk` domain artifacts for CopilotClient traceability
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/docs/domains/_platform/sdk/domain.md; /Users/jordanknight/substrate/066-wf-real-agents/docs/domains/domain-map.md
- **Issue**: The owning SDK domain doc and domain map do not consistently document the CopilotClient contract/concepts consumed by this phase.
- **Fix**: Add CopilotClient (or the renamed SDK client contract) to the SDK domain's Contracts/Dependencies/Concepts sections and keep the domain-map node/health summary aligned.
- **Patch hint**:
  ```diff
  + | `CopilotClient` | class / client boundary | SDK session client used by agents and harness tooling |
  +
  + ## Concepts
  + | Concept | Entry Point | What It Does |
  + |--------|-------------|---------------|
  + | Copilot SDK client lifecycle | `CopilotClient` | Creates/stops SDK-backed agent sessions for consumers. |
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
