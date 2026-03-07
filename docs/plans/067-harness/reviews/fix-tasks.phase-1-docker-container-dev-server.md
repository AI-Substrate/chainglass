# Fix Tasks: Phase 1: Docker Container & Dev Server

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Remove host `.env.local` from container startup
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/harness/entrypoint.sh
- **Issue**: The container starts the terminal sidecar with `--env-file=apps/web/.env.local`, which imports host-local values into the container.
- **Fix**: Remove the env-file flag and pass every required value through `/Users/jordanknight/substrate/066-wf-real-agents/harness/docker-compose.yml` and `/Users/jordanknight/substrate/066-wf-real-agents/harness/Dockerfile`.
- **Patch hint**:
  ```diff
  -  "pnpm tsx watch --env-file=apps/web/.env.local apps/web/src/features/064-terminal/server/terminal-ws.ts"
  +  "pnpm tsx watch apps/web/src/features/064-terminal/server/terminal-ws.ts"
  ```

### FT-002: Put Chromium in the harness image
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/harness/Dockerfile
- **Issue**: The current image never installs Playwright Chromium, so AC-01 is unmet.
- **Fix**: Add a deterministic browser install step during the image build and record the resulting build evidence in the execution log.
- **Patch hint**:
  ```diff
   FROM deps AS dev
  +RUN npx -y playwright@1.52.0 install --with-deps chromium
   ENV NODE_ENV=development
  ```

### FT-003: Add durable verification for AC-08 and AC-09
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-1-docker-container-dev-server/execution.log.md
- **Issue**: HMR and log-access claims are not backed by executable or transcript-backed evidence.
- **Fix**: Add explicit verification steps for host-to-container HMR and container log access, preserve command output, and reference the exact evidence in the execution log. Also capture a concrete `harness stop` run while touching the same area.
- **Patch hint**:
  ```diff
  -### T1.9 — Run integration test (GREEN)
  -**Status**: ✅ done — manually verified: app 200 on :3000, API 200 on /api/workspaces, terminal sidecar on :4500, auth bypassed. Cold start ~3 min, subsequent responses ~30ms.
  +### T1.9 — Run integration test (GREEN)
  +**Status**: ✅ done
  +Commands:
  +- docker compose -f harness/docker-compose.yml logs --tail=20 chainglass-dev
  +- <host-side HMR probe command and observed response within 5s>
  +- docker compose -f harness/docker-compose.yml down
  +Observed output:
  +- <paste concrete output proving AC-08 / AC-09 / AC-03>
  ```

## Medium / Low Fixes

### FT-004: Make the terminal health probe reflect real sidecar health
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/harness/justfile
- **Issue**: `curl -sf` can mark a healthy WebSocket sidecar as DOWN.
- **Fix**: Replace the current terminal probe with a TCP/open-port probe or normalize non-connection HTTP responses as healthy.
- **Patch hint**:
  ```diff
  -    @echo "Terminal: $$(curl -sf -o /dev/null -w '%{http_code}' http://localhost:4500 || echo 'DOWN')"
  +    @echo "Terminal: $$(python - <<'PY'
  +import socket
  +try:
  +    socket.create_connection(('localhost', 4500), 2).close()
  +    print('UP')
  +except OSError:
  +    print('DOWN')
  +PY
  +)"
  ```

### FT-005: Reconcile harness smoke tests with project testing rules
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/docker-boot.test.ts
- **Issue**: The suite omits required Test Doc blocks and currently lives outside the centralized test tree.
- **Fix**: Add per-test Test Doc blocks, then either move the suite to `/Users/jordanknight/substrate/066-wf-real-agents/test/integration/` or update the project rules/architecture docs to explicitly allow self-contained harness tests.
- **Patch hint**:
  ```diff
   it('app responds with 200 on root', async () => {
  +  /*
  +  Test Doc:
  +  - Why: Verify the containerized app serves the main route after boot
  +  - Contract: GET / returns HTTP 200 when harness boot succeeds
  +  - Usage Notes: Requires the harness container to be running locally
  +  - Quality Contribution: Catches broken boot/startup regressions
  +  - Worked Example: fetch('http://localhost:3000').status === 200
  +  */
      const response = await fetch(APP_URL);
  ```

### FT-006: Sync plan/domain docs with delivered Phase 1 behavior
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md, /Users/jordanknight/substrate/066-wf-real-agents/docs/domains/_platform/auth/domain.md
- **Issue**: The Domain Manifest does not match the actual auth/test file paths and the Auth domain docs do not record the new harness-oriented `auth()` behavior.
- **Fix**: Update the manifest to the real file set and add Plan 067 history + Concepts/contract notes for the `DISABLE_AUTH` wrapper.
- **Patch hint**:
  ```diff
  -| `harness/tests/smoke/health.spec.ts` | external | internal | Smoke test suite |
  -| `apps/web/src/lib/auth.ts` | _platform/auth | cross-domain | Fix DISABLE_AUTH for Server Actions (Finding 02) |
  +| `harness/tests/smoke/docker-boot.test.ts` | external | internal | Smoke test suite |
  +| `apps/web/src/auth.ts` | _platform/auth | cross-domain | Fix DISABLE_AUTH for Server Actions (Finding 02) |
  +| `harness/vitest.config.ts` | external | internal | Harness Vitest configuration |
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
