# Fix Tasks: Phase 3: Smoke Test Agent

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Tighten the smoke-test output schema
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/harness/agents/smoke-test/output-schema.json
- **Issue**: The current schema validates reports that omit `consoleErrors`, `serverLogSummary`, several health services, and two of the three required screenshots.
- **Fix**: Require the full smoke-test contract: `consoleErrors`, `serverLogSummary`, `health.services.app`, `health.services.mcp`, `health.services.terminal`, `health.services.cdp`, and exactly the expected viewport set (`desktop-lg`, `tablet`, `mobile`). Add or update tests so incomplete reports fail validation.
- **Patch hint**:
  ```diff
   {
-    "required": ["health", "screenshots", "verdict", "retrospective"],
+    "required": ["health", "screenshots", "consoleErrors", "serverLogSummary", "verdict", "retrospective"],
       "properties": {
         "health": {
           "properties": {
             "services": {
-              "additionalProperties": { "type": "string" }
+              "required": ["app", "mcp", "terminal", "cdp"],
+              "properties": {
+                "app": { "type": "string" },
+                "mcp": { "type": "string" },
+                "terminal": { "type": "string" },
+                "cdp": { "type": "string" }
+              }
             }
           }
         },
         "screenshots": {
-          "minItems": 1,
+          "minItems": 3,
           "items": {
             "properties": {
-              "viewport": { "type": "string" }
+              "viewport": { "enum": ["desktop-lg", "tablet", "mobile"] }
             }
           }
         }
       }
   }
  ```

### FT-002: Persist revalidation results into run metadata
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/agent.ts
- **Issue**: `just harness agent validate smoke-test` returns `validated:true`, but `completed.json` and `agent history smoke-test` still show the latest run as degraded/validated false.
- **Fix**: After a successful `agent validate`, rewrite the latest run's `completed.json` to reflect the current validation state (and, if desired, upgrade `result` from `degraded` to `completed` when validation is now clean). Then refresh the execution log/history evidence with the reconciled metadata.
- **Patch hint**:
  ```diff
    const latestRun = entries[0].name;
    const outputPath = path.join(runsDir, latestRun, 'output', 'report.json');
    const result = validateOutput(definition.schemaPath, outputPath);
+   const completedPath = path.join(runsDir, latestRun, 'completed.json');
+   if (fs.existsSync(completedPath)) {
+     const completed = JSON.parse(fs.readFileSync(completedPath, 'utf-8'));
+     completed.validated = result.valid;
+     completed.validationErrors = result.errors;
+     if (result.valid && completed.result === 'degraded') {
+       completed.result = 'completed';
+     }
+     fs.writeFileSync(completedPath, JSON.stringify(completed, null, 2));
+   }
    exitWithEnvelope(formatSuccess('agent validate', {
      runId: latestRun,
      validated: result.valid,
      errors: result.errors,
    }, result.valid ? 'ok' : 'degraded'));
  ```

## Medium / Low Fixes

### FT-003: Align shared timeout semantics
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/interfaces/agent-types.ts, /Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/adapters/sdk-copilot-adapter.ts
- **Issue**: The shared `timeout` contract reads like a hard execution timeout, but the adapter currently only forwards it to `sendAndWait()`, while the harness runner separately terminates on timeout.
- **Fix**: Make the contract explicit and consistent. Either keep hard timeout enforcement exclusively in callers like the harness runner, or teach the adapter to surface a distinct timeout outcome and terminate the session deliberately.
- **Patch hint**:
  ```diff
-  /** Timeout in milliseconds for the agent session to complete. */
+  /** Timeout in milliseconds for how long the caller will wait for the session result. */
   timeout?: number;
  ```
  ```diff
-  await session.sendAndWait({ prompt: prompt.trim() }, options.timeout);
+  // Either document this as a wait timeout only,
+  // or convert SDK wait timeouts into a distinct timeout result.
+  await session.sendAndWait({ prompt: prompt.trim() }, options.timeout);
  ```

### FT-004: Fix the Playwright helper invocation in the smoke-test definition
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/harness/agents/smoke-test/instructions.md, /Users/jordanknight/substrate/066-wf-real-agents/harness/agents/smoke-test/prompt.md
- **Issue**: The committed instructions still recommend `npx tsx`, but the phase retrospective shows `pnpm exec tsx` is the correct invocation in this pnpm workspace.
- **Fix**: Replace `npx tsx` with `pnpm exec tsx` anywhere the agent is told to run a Playwright helper script.
- **Patch hint**:
  ```diff
- // Run with: cd harness && npx tsx <script.ts>
+ // Run with: cd harness && pnpm exec tsx <script.ts>
  ```
  ```diff
- Playwright is installed in the harness workspace (`harness/node_modules/`). Run scripts with `cd harness && npx tsx <your-script.ts>`.
+ Playwright is installed in the harness workspace (`harness/node_modules/`). Run scripts with `cd harness && pnpm exec tsx <your-script.ts>`.
  ```

### FT-005: Synchronize domain and phase documentation
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/docs/domains/agents/domain.md, /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/agent-runner-plan.md, /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/070-harness-agent-runner/tasks/phase-3-smoke-test-agent/tasks.md
- **Issue**: The agents domain docs do not record the Plan 070 timeout/session-option contract changes, the plan manifest does not list every touched file, and the tasks dossier still says `Ready for implementation`.
- **Fix**: Add a Plan 070 history/concepts update to the agents domain, extend the manifest to cover every touched phase file, and mark the phase dossier as landed/complete.
- **Patch hint**:
  ```diff
   | Plan 059 FX006 | Copilot SDK permissions ... | 2026-03-05 |
+  | Plan 070 Phase 3 | `AgentRunOptions.timeout` exposed for harness smoke-test execution; SdkCopilotAdapter forwards wait timeout | 2026-03-08 |
  ```
  ```diff
   | `harness/tests/unit/agent/runner.test.ts` | external | internal | Runner unit tests (with fake adapter) |
+  | `harness/tests/unit/cli/output.test.ts` | external | internal | Output/error-code tests updated during smoke-test rollout |
+  | `docs/plans/070-harness-agent-runner/tasks/phase-3-smoke-test-agent/tasks.md` | external | documentation | Phase 3 task dossier |
+  | `docs/plans/070-harness-agent-runner/tasks/phase-3-smoke-test-agent/tasks.fltplan.md` | external | documentation | Phase 3 flight plan |
+  | `docs/plans/070-harness-agent-runner/tasks/phase-3-smoke-test-agent/execution.log.md` | external | documentation | Phase 3 execution evidence |
  ```
  ```diff
- **Status**: Ready for implementation
+ **Status**: Landed
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
