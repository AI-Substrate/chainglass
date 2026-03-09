# Phase 2: Playwright & CDP Integration — Execution Log

**Plan**: [harness-plan.md](../../harness-plan.md)
**Phase**: Phase 2: Playwright & CDP Integration
**Started**: 2026-03-07

---

## Pre-Phase Validation

| Check | Status | Duration | Notes |
|-------|--------|----------|-------|
| Boot | ⏭ skipped | — | Container not running; will boot for integration tests |
| Interact | ⏭ skipped | — | CDP not yet configured (this phase adds it) |
| Observe | ⏭ skipped | — | No harness.md exists yet |

**Verdict**: Phase 2 adds browser capability — pre-phase browser validation N/A.

---

## Task Log

### T001: Write CDP integration test (RED)
- **Status**: ✅ Done
- **Files**: `harness/tests/smoke/cdp-integration.test.ts` (new)
- **Evidence**: 4 test cases — CDP version endpoint, target listing, Playwright `connectOverCDP`, screenshot capture to results/
- **Notes**: Fetches wsEndpoint from `/json/version` per Perplexity research. Test was written skipped first, then unskipped in T009 for GREEN verification.

### T002: Create Chromium startup script
- **Status**: ✅ Done
- **Files**: `harness/start-chromium.sh` (new), `harness/Dockerfile` (modified — COPY start-chromium.sh)
- **Evidence**: Script auto-discovers Playwright Chromium binary, launches with `--headless --no-sandbox --disable-gpu --disable-dev-shm-usage --remote-debugging-port=9223 --remote-debugging-address=127.0.0.1`, restart loop on crash.

### T003: Update entrypoint.sh to launch Chromium
- **Status**: ✅ Done
- **Files**: `harness/entrypoint.sh` (modified)
- **Evidence**: Chromium added as a concurrent process plus host-facing CDP proxy via concurrently: `next,terminal,chromium,cdp-proxy`.

### T004: Create playwright.config.ts
- **Status**: ✅ Done
- **Files**: `harness/playwright.config.ts` (new), `harness/tests/fixtures/base-test.ts` (new)
- **Evidence**: Config defines 3 viewport projects (desktop/tablet/mobile), custom CDP fixture (`base-test.ts`) connects via `connectOverCDP` fetching wsEndpoint from `/json/version`. Config does NOT use `connectOptions` (which is for Playwright Server, not CDP).
- **Discovery**: Playwright config `connectOptions.wsEndpoint` is for Playwright Server, NOT CDP. Custom fixture required per Perplexity research.

### T005: Create viewport definitions
- **Status**: ✅ Done
- **Files**: `harness/src/viewports/devices.ts` (new)
- **Evidence**: Exports `HARNESS_VIEWPORTS` with 4 viewports: desktop-lg (1440x900), desktop-md (1280x800), tablet (768x1024), mobile (375x812). Type-safe with `satisfies Record<string, HarnessViewport>`.

### T006: Write smoke Playwright test
- **Status**: ✅ Done
- **Files**: `harness/tests/smoke/browser-smoke.spec.ts` (new)
- **Evidence**: 5 test cases: page load 200, HTML structure, page title set, no console errors, screenshot capture to results/.

### T007: Verify multi-context browsing
- **Status**: ✅ Done
- **Files**: `harness/tests/smoke/browser-smoke.spec.ts` (same file)
- **Evidence**: Test opens desktop (1440x900) + mobile (375x812) contexts simultaneously, navigates both in parallel, verifies viewportSize, captures screenshots at both viewports.

### T008: Verify browser console access
- **Status**: ✅ Done
- **Files**: `harness/tests/smoke/browser-smoke.spec.ts` (same file)
- **Evidence**: 2 test cases: captures injected console.log via `page.on('console')`, and separately captures console.warn + console.error with correct type discrimination.

### T009: Run integration test (GREEN)
- **Status**: ✅ Done
- **Files**: `harness/tests/smoke/cdp-integration.test.ts` (modified — unskipped), `harness/justfile` (modified — JSON health output), `harness/Dockerfile`, `harness/start-chromium.sh`, `harness/entrypoint.sh`
- **Evidence**:
  - `pnpm exec vitest run tests/smoke/cdp-integration.test.ts` → **4/4 passed** in 1.47s
  - `pnpm exec playwright test tests/smoke/browser-smoke.spec.ts --config=playwright.config.ts` → **24/24 passed** in 25.4s
  - `just health` → `{"status":"ok","app":{"status":"up","code":"200"},"mcp":{"status":"up","code":"406"},"terminal":{"status":"up"},"cdp":{"status":"up","browser":"Chrome/136.0.7103.25"}}`
  - Artifacts generated in `harness/results/`: `cdp-integration-test.png`, `smoke-homepage-desktop.png`, `smoke-homepage-tablet.png`, `smoke-homepage-mobile.png`, `multi-desktop.png`, `multi-mobile.png`, `test-results.json`
- **Discovery**: Chromium 136 remote debugging stayed loopback-only inside Docker. Host CDP became reachable only after introducing an internal `:9223` Chromium port with `socat` proxy on published `:9222`.

### Post-Review Real-Issue Cleanup
- **Status**: ✅ Done
- **Files**: `harness/justfile`, `justfile`, `harness/tests/smoke/browser-smoke.spec.ts`, `harness/tests/smoke/cdp-integration.test.ts`, `docs/plans/067-harness/harness-plan.md`
- **Evidence**:
  - `pnpm --dir harness exec tsc --noEmit` → **passed**
  - `pnpm --dir harness exec playwright test --config=playwright.config.ts --list` → **24 tests listed successfully**
  - `pnpm --dir harness exec node --input-type=module ... page.title()` → **"Chainglass"**
  - `harness/justfile` now includes standalone `install` and `typecheck` recipes; root `justfile` now exposes `harness-install` and `harness-typecheck`
- **Notes**:
  - Strengthened the title assertion to `Chainglass`
  - Replaced fixed sleeps with event-driven console waits / load-state waits
  - Added per-test Test Doc blocks to the new durable harness tests
  - Viewport screenshots now persist separately as `smoke-homepage-desktop.png`, `smoke-homepage-tablet.png`, and `smoke-homepage-mobile.png`
