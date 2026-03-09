# Fix Tasks: Phase 2: Playwright & CDP Integration

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Repair `harness health` and satisfy AC-04
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/harness/justfile, /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-2-playwright-cdp-integration/execution.log.md
- **Issue**: The new `health` recipe prints PID-literal text instead of evaluated probe results and still does not return the structured JSON required by AC-04.
- **Fix**: Replace the current shell-echo recipe with a working JSON-producing probe for app/MCP/CDP/terminal status, then capture one passing sample output in the execution log.
- **Patch hint**:
  ```diff
  -health:
  -    @echo "App:      $$(curl -sf -o /dev/null -w '%{http_code}' http://localhost:3000 || echo 'DOWN')"
  -    @echo "Terminal: $$(python3 -c \"import socket; s=socket.create_connection(('localhost',4500),2); s.close(); print('UP')\" 2>/dev/null || echo 'DOWN')"
  -    @echo "CDP:      $$(curl -sf http://localhost:9222/json/version | python3 -c 'import sys,json; print(json.load(sys.stdin).get(\"Browser\",\"UP\"))' 2>/dev/null || echo 'DOWN')"
  +health:
  +    @python3 - <<'PY'
  +import json, socket, urllib.request
  +def tcp_up(host, port):
  +    try:
  +        socket.create_connection((host, port), 2).close()
  +        return True
  +    except OSError:
  +        return False
  +def http_status(url):
  +    try:
  +        with urllib.request.urlopen(url, timeout=2) as response:
  +            return response.status
  +    except Exception:
  +        return None
  +print(json.dumps({
  +    'app': http_status('http://localhost:3000'),
  +    'terminal': tcp_up('localhost', 4500),
  +    'cdp': http_status('http://localhost:9222/json/version'),
  +    'mcp': http_status('http://localhost:3000/_next/mcp'),
  +}))
  +PY
  ```

### FT-002: Finish the GREEN loop for Phase 2
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/cdp-integration.test.ts, /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-2-playwright-cdp-integration/tasks.md, /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-2-playwright-cdp-integration/tasks.fltplan.md, /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-2-playwright-cdp-integration/execution.log.md
- **Issue**: `T009` is still open, `describe.skip` still disables the core CDP integration suite, and the execution log has no durable GREEN evidence for AC-05/06/07/10.
- **Fix**: Unskip the suite, run it against the harness, preserve the exact command/output and screenshot path, then update the task artifacts only after the suite passes.
- **Patch hint**:
  ```diff
  -describe.skip('Harness: CDP Integration', () => {
  +describe('Harness: CDP Integration', () => {
  ```

### FT-003: Restore real typecheck coverage for the new harness code
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/tsconfig.json, /Users/jordanknight/substrate/066-wf-real-agents/harness/justfile
- **Issue**: The repo root now excludes `harness/` from `pnpm tsc --noEmit`, but the phase does not replace that with a documented harness-local install + typecheck gate.
- **Fix**: Either remove the root exclusion once the harness package typechecks, or add a harness-local recipe/script that installs the harness dependencies and runs `tsc --noEmit`, then record the passing result in the phase evidence.
- **Patch hint**:
  ```diff
   "exclude": [
     "node_modules",
     "dist",
     ".next",
     ".turbo",
     "test",
     "apps",
     "scripts",
  -  "docs",
  -  "harness"
  +  "docs"
   ]
  ```

## Medium / Low Fixes

### FT-004: Sync the Domain Manifest with the delivered Phase 2 file set
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md
- **Issue**: The plan manifest omits multiple delivered Phase 2 files, including `start-chromium.sh`, `tests/fixtures/base-test.ts`, both Phase 2 smoke/integration suites, and the repo-root `tsconfig.json` adjustment.
- **Fix**: Add explicit rows or globs for the delivered file set, or keep the phase constrained to already-declared paths so the manifest remains authoritative.
- **Patch hint**:
  ```diff
   | `harness/playwright.config.ts` | external | internal | Browser test configuration |
  +| `harness/start-chromium.sh` | external | internal | Chromium launcher for CDP |
  +| `harness/tests/fixtures/base-test.ts` | external | internal | Shared CDP Playwright fixture |
  +| `harness/tests/smoke/browser-smoke.spec.ts` | external | internal | Browser smoke suite |
  +| `harness/tests/smoke/cdp-integration.test.ts` | external | internal | CDP integration verification |
  +| `tsconfig.json` | _platform | cross-domain | Temporary repo-level typecheck policy for harness |
  ```

### FT-005: Strengthen the smoke assertions to match the phase goals
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/browser-smoke.spec.ts
- **Issue**: The title check only asserts a truthy title, and the retained screenshot evidence does not cover the tablet viewport promised by AC-06.
- **Fix**: Assert a stable expected title string (or substring) and add a tablet screenshot/viewport assertion if Phase 2 continues to own tablet verification.
- **Patch hint**:
  ```diff
   test('page title is set', async ({ cdpPage, baseURL }) => {
     await cdpPage.goto(baseURL!, { waitUntil: 'domcontentloaded' });
     const title = await cdpPage.title();
  -  expect(title).toBeTruthy();
  +  expect(title).toContain('Chainglass');
   });
  ```

### FT-006: Bring the harness tests into compliance with the published test rules
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/browser-smoke.spec.ts, /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/cdp-integration.test.ts
- **Issue**: The new harness tests omit required Test Doc blocks and rely on `waitForTimeout(...)`, which conflicts with the documented test standards.
- **Fix**: Add the five-field Test Doc block to each durable test case and replace timer-based waits with event-driven waits (`waitForEvent('console')`, `expect.poll`, or equivalent).
- **Patch hint**:
  ```diff
   test('captures console.log messages via CDP', async ({ cdpPage, baseURL }) => {
  +  /*
  +  Test Doc:
  +  - Why: Verify the harness can observe browser console output over CDP.
  +  - Contract: A console.log emitted in-page is surfaced to the test harness.
  +  - Usage Notes: Wait on the console event instead of sleeping for a fixed duration.
  +  - Quality Contribution: Catches regressions in CDP attachment and console forwarding.
  +  - Worked Example: console.log('harness-test-marker') is observed as a `log` message.
  +  */
  +  const marker = cdpPage.waitForEvent('console', { predicate: (msg) => msg.text() === 'harness-test-marker' });
      await cdpPage.goto(baseURL!, { waitUntil: 'domcontentloaded' });
      await cdpPage.evaluate(() => {
        console.log('harness-test-marker');
      });
  -  await cdpPage.waitForTimeout(500);
  +  await marker;
   });
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
