# Fix Tasks: Phase 3: Harness CLI SDK

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Publish a working `harness` binary
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/harness/package.json, /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/index.ts
- **Issue**: `bin.harness` points at a TypeScript entrypoint that plain `node` cannot execute, so the installed CLI is broken.
- **Fix**: Publish a JavaScript entrypoint that plain `node` can run, and point `bin.harness` at that runtime-valid file.
- **Patch hint**:
  ```diff
   "bin": {
-    "harness": "./src/cli/index.ts"
+    "harness": "./dist/cli/index.js"
   },
+  "scripts": {
+    "build:cli": "tsc -p tsconfig.cli.json",
+    "harness": "node dist/cli/index.js"
+  }
  ```

### FT-002: Make terminal health checks real
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/harness/src/health/probe.ts
- **Issue**: `probeTerminal()` swallows connection failures and still returns `{ status: 'up' }`.
- **Fix**: Replace the fetch-based approach with a real TCP connection probe that only reports `up` on a successful socket connect.
- **Patch hint**:
  ```diff
- export async function probeTerminal(host = '127.0.0.1', port = 4500): Promise<TerminalStatus> {
-   try {
-     const controller = new AbortController();
-     const timeout = setTimeout(() => controller.abort(), 2000);
-     await fetch('http://' + host + ':' + port, { signal: controller.signal }).catch(() => {});
-     clearTimeout(timeout);
-     return { status: 'up' };
-   } catch {
-     return { status: 'down' };
-   }
- }
+ export async function probeTerminal(host = '127.0.0.1', port = 4500): Promise<TerminalStatus> {
+   return new Promise((resolve) => {
+     const socket = net.connect({ host, port });
+     socket.once('connect', () => { socket.destroy(); resolve({ status: 'up' }); });
+     socket.once('error', () => resolve({ status: 'down' }));
+     socket.setTimeout(2000, () => { socket.destroy(); resolve({ status: 'down' }); });
+   });
+ }
  ```

### FT-003: Constrain screenshot output to `harness/results/`
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/screenshot.ts
- **Issue**: User-controlled screenshot names can escape `RESULTS_DIR` via `..` and path separators.
- **Fix**: Sanitize the name, reject path traversal, resolve the final path, and assert that it stays under `RESULTS_DIR` before writing.
- **Patch hint**:
  ```diff
- const filename = name + '-' + viewportName + '.png';
- const filePath = path.join(RESULTS_DIR, filename);
+ const safeName = name.replace(/[^a-zA-Z0-9._-]+/g, '-');
+ if (safeName.includes('..') || safeName !== name.replace(/\\/g, '/').split('/').pop()) {
+   throw new Error('Invalid screenshot name');
+ }
+ const filePath = path.resolve(RESULTS_DIR, safeName + '-' + viewportName + '.png');
+ if (!filePath.startsWith(path.resolve(RESULTS_DIR) + path.sep)) {
+   throw new Error('Invalid screenshot path');
+ }
  ```

### FT-004: Make `harness test` truthful
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/test.ts, /Users/jordanknight/substrate/066-wf-real-agents/harness/playwright.config.ts
- **Issue**: `--suite` is ignored, `desktop-lg` and `desktop-md` do not match real Playwright projects, and stale results files can be reused after Playwright failures.
- **Fix**: Add explicit suite and viewport-to-project maps, reject unsupported values, delete or timestamp-guard the results file before each invocation, and fail if no fresh artifact is produced.
- **Patch hint**:
  ```diff
- const suiteGlob = 'tests/smoke/**/*.spec.ts';
+ const suiteGlobs = { smoke: 'tests/smoke/**/*.spec.ts' } as const;
+ const projectMap = { 'desktop-lg': 'desktop', 'desktop-md': 'desktop', tablet: 'tablet', mobile: 'mobile' } as const;
+ const suiteGlob = suiteGlobs[opts.suite as keyof typeof suiteGlobs];
+ const projectName = projectMap[viewportName];
+ if (!suiteGlob || !projectName) {
+   exitWithEnvelope(formatError('test', ErrorCodes.INVALID_ARGS, 'Unsupported suite or viewport'));
+ }
+ rmSync(RESULTS_FILE, { force: true });
  ...
- '--project=' + viewportName,
+ '--project=' + projectName,
  ...
+ const stat = statSync(RESULTS_FILE);
+ if (stat.mtimeMs < commandStartMs) {
+   exitWithEnvelope(formatError('test', ErrorCodes.TEST_FAILED, 'Stale test results file detected'));
+ }
  ```

### FT-005: Restore the promised CLI integration gate and TDD evidence
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/harness/package.json, /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-3-harness-cli-sdk/execution.log.md, /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-3-harness-cli-sdk/tasks.md
- **Issue**: `test:integration` points to missing `vitest.integration.config.ts`, the expected `harness/tests/integration/cli/*.test.ts` files do not exist, and T004-T010 lack RED→GREEN evidence.
- **Fix**: Add the integration config and CLI integration tests, wire them into `test:integration`, and update the execution log only after the suite goes RED then GREEN.
- **Patch hint**:
  ```diff
   "scripts": {
     "harness": "tsx src/cli/index.ts",
     "test": "vitest run",
     "test:integration": "vitest run --config vitest.integration.config.ts"
   }
+
+// add:
+// - /Users/jordanknight/substrate/066-wf-real-agents/harness/vitest.integration.config.ts
+// - /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/integration/cli/build.test.ts
+// - /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/integration/cli/dev.test.ts
+// - /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/integration/cli/stop.test.ts
+// - /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/integration/cli/health.test.ts
+// - /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/integration/cli/test-command.test.ts
+// - /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/integration/cli/screenshot.test.ts
+// - /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/integration/cli/results.test.ts
  ```

## Medium / Low Fixes

### FT-006: Add per-test Test Doc blocks to the new unit tests
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/cli/output.test.ts, /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/cli/index.test.ts
- **Issue**: The tests use a file-level `@test-doc` header instead of the required inline five-field Test Doc format for each `it(...)` case.
- **Fix**: Add inline Test Doc blocks to every unit test.
- **Patch hint**:
  ```diff
   it('creates a CLI program with the correct name', () => {
+    /*
+    Test Doc:
+    - Why: Verify the published CLI entrypoint exposes the expected command surface.
+    - Contract: createCli() returns a Commander program named `harness`.
+    - Usage Notes: Import createCli() directly; do not shell out for registration-only checks.
+    - Quality Contribution: Catches accidental command-surface regressions early.
+    - Worked Example: createCli().name() -> 'harness'.
+    */
     const program = createCli();
     expect(program.name()).toBe('harness');
   });
  ```

### FT-007: Sync the Domain Manifest with the delivered helper/test files
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md
- **Issue**: The Domain Manifest does not include the new helper modules or unit CLI tests that shipped in Phase 3.
- **Fix**: Add explicit rows or globs for the helper directories and unit test paths.
- **Patch hint**:
  ```diff
   | `harness/src/cli/index.ts` | external | internal | CLI entry point (Commander.js) |
   | `harness/src/cli/commands/*.ts` | external | internal | CLI commands (build, dev, stop, health, test, screenshot, seed, results) |
   | `harness/src/cli/output.ts` | external | internal | Structured JSON output helpers |
+  | `harness/src/cdp/*.ts` | external | internal | CDP connection and discovery helpers |
+  | `harness/src/docker/*.ts` | external | internal | Docker lifecycle wrappers for the CLI |
+  | `harness/src/health/*.ts` | external | internal | Health probes used by CLI commands |
+  | `harness/tests/unit/cli/*.test.ts` | external | internal | Harness CLI unit tests |
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
