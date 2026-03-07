# First-Class Agentic Development Harness — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-03-07
**Spec**: [harness-spec.md](harness-spec.md)
**ADR**: [ADR-0014](../../adr/adr-0014-first-class-agentic-development-harness.md)
**Status**: DRAFT
**Complexity**: CS-4 (large)

## Summary

AI agents building Chainglass cannot see the running application — 168 components, 0 browser tests. This plan builds the **Agentic Development Harness**: a Docker container running the full Chainglass app with Playwright browser automation, controlled by a rich CLI that returns structured JSON. Four phases: Docker container → Playwright + CDP → CLI SDK → Seed + test suites + responsive viewports. The harness is the primary quality mechanism — harness or bust.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| (all domains) | existing | consume | All domains are test targets via their browser-observable behavior |
| _platform/auth | existing | consume | Auth bypassed via DISABLE_AUTH=true; **fix auth() wrapper** per Finding 02 |

No new domains. Harness is external tooling at `harness/` in repo root.

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | No Docker infrastructure exists — greenfield | Build from scratch in Phase 1; Debian-based image (not Alpine) for node-pty |
| 02 | High | DISABLE_AUTH partial bypass — Server Actions pass args, fake session only works with 0 args | Fix `auth()` wrapper to return fake session for ALL call signatures; add integration test |
| 03 | High | Playwright not in any package.json yet | Add `@playwright/test` to `harness/package.json`; install Chromium in Docker |
| 04 | High | CLI JSON output convention exists — `JsonOutputAdapter` + `ConsoleOutputAdapter` pattern | Mirror pattern in harness CLI: `--json` flag, `{command, status, data?, error?}` envelope |
| 05 | High | pnpm named volume race — host/container node_modules can desync | `harness rebuild` command syncs volumes; health check validates workspace integrity |
| 06 | High | CDP port 9222 not yet configured — must set `--remote-debugging-port=9222` on Chromium | Configure in Playwright launch args; expose in compose; verify in health check |
| 07 | High | Terminal WS port 4500 hardcoded — no fallback | Support `TERMINAL_WS_PORT` env var override in Docker; less critical for single-container mode |
| 08 | High | `.gitignore` needs `harness/results/`; no `.dockerignore` exists | Create both as part of Phase 1 scaffold |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `harness/Dockerfile` | external | internal | Docker image definition |
| `harness/docker-compose.yml` | external | internal | Dev container orchestration |
| `harness/entrypoint.sh` | external | internal | Container startup script |
| `harness/package.json` | external | internal | Harness deps (Playwright, zod) |
| `harness/tsconfig.json` | external | internal | TypeScript config for harness |
| `harness/playwright.config.ts` | external | internal | Browser test configuration |
| `harness/start-chromium.sh` | external | internal | Chromium launcher for internal CDP port |
| `harness/justfile` | external | internal | Harness-specific commands |
| `harness/src/cli/index.ts` | external | internal | CLI entry point (Commander.js) |
| `harness/src/cli/commands/*.ts` | external | internal | CLI commands (build, dev, stop, health, test, screenshot, results, ports) |
| `harness/src/cli/output.ts` | external | internal | Structured JSON output helpers |
| `harness/src/cdp/*.ts` | external | internal | CDP connection and discovery helpers |
| `harness/src/docker/*.ts` | external | internal | Docker lifecycle wrappers for the CLI |
| `harness/src/health/*.ts` | external | internal | Health probes used by CLI commands |
| `harness/src/ports/*.ts` | external | internal | Deterministic port allocator for parallel worktrees |
| `harness/src/viewports/devices.ts` | external | internal | Viewport definitions |
| `harness/bin/harness` | external | internal | Shell wrapper for bin entry point |
| `harness/src/seed/seed-workspace.ts` | external | internal | Workspace seeding via registry write + docker exec |
| `harness/tests/smoke/docker-boot.test.ts` | external | internal | Smoke test suite |
| `harness/tests/fixtures/base-test.ts` | external | internal | Shared CDP-backed Playwright fixture |
| `harness/tests/smoke/browser-smoke.spec.ts` | external | internal | Browser smoke suite across desktop/tablet/mobile |
| `harness/tests/smoke/routes-smoke.spec.ts` | external | internal | Route-level smoke tests (/, /workspaces, /settings, /agents) |
| `harness/tests/smoke/mcp-smoke.test.ts` | external | internal | MCP JSON-RPC endpoint verification (Vitest) |
| `harness/tests/smoke/seed-verification.spec.ts` | external | internal | Seeded workspace UI visibility tests |
| `harness/tests/smoke/cdp-integration.test.ts` | external | internal | Host-to-CDP integration verification |
| `harness/tests/responsive/sidebar-responsive.spec.ts` | external | internal | Responsive sidebar tests (Sheet overlay on mobile) |
| `harness/tests/features/*.spec.ts` | external | internal | Feature test stubs (agents, browser, terminal, workflows) |
| `harness/tests/unit/cli/*.test.ts` | external | internal | Harness CLI unit tests |
| `harness/tests/unit/ports/*.test.ts` | external | internal | Port allocator unit tests |
| `harness/tests/integration/cli/*.test.ts` | external | internal | CLI integration tests (require running container) |
| `harness/vitest.config.ts` | external | internal | Harness Vitest configuration |
| `harness/vitest.integration.config.ts` | external | internal | Integration test configuration |
| `harness/results/.gitkeep` | external | internal | Results output directory |
| `harness/.dockerignore` | external | internal | Docker build exclusions |
| `docs/project-rules/harness.md` | cross-domain | cross-domain | L3 harness governance doc |
| `.gitignore` | _platform | cross-domain | Add `harness/results/` |
| `justfile` | _platform | cross-domain | Add `test-harness` + `just harness` recipes |
| `CLAUDE.md` | _platform | cross-domain | Harness commands in Quick Reference |
| `tsconfig.json` | _platform | cross-domain | Exclude standalone harness from root TS gate |
| `apps/web/src/auth.ts` | _platform/auth | cross-domain | Fix DISABLE_AUTH for Server Actions (Finding 02) |

## Harness Strategy

- **Current Maturity**: L3 (auto boot + browser interaction + structured evidence + CLI SDK)
- **Target Maturity**: L3 (auto boot + browser interaction + structured evidence)
- **Boot Command**: `just test-harness` or `harness dev`
- **Health Check**: `harness health` → JSON with app/MCP/CDP/terminal status
- **Interaction Model**: Browser via Playwright/CDP + HTTP API for seeding
- **Evidence Capture**: Screenshots (PNG), test results (JSON), server logs
- **Pre-Phase Validation**: At start of every subsequent plan phase: `harness health` must pass

---

## Phase 1: Docker Container & Dev Server

**Objective**: Get the full Chainglass app running in a Docker container with HMR and all services healthy.
**Domain**: External tooling (harness/)
**Delivers**:
- Multi-stage Dockerfile (Debian bookworm-slim, node-pty compiles, pnpm monorepo)
- docker-compose.yml with volume mounts, port mappings, named volumes
- Entrypoint script that starts Next.js dev server + terminal sidecar
- `.dockerignore`, `.gitignore` updates
- `harness build` and `harness dev` commands (shell scripts, not full CLI yet)
- `just test-harness` recipe in root justfile
- Fix `DISABLE_AUTH` for Server Actions (Finding 02)
- Integration test: container starts, app responds on 3000, sidecar on 4500

**Depends on**: None
**Key risks**: node-pty compilation (use Debian, not Alpine); Turbopack HMR over bind mounts (fallback to `WATCHPACK_POLLING=true`)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Scaffold harness/ folder structure | external | `harness/` dir with Dockerfile, compose, package.json, tsconfig, justfile | Per Workshop 001; include biome config (inherit from root) |
| 1.2 | Write integration test: Docker boot (RED) | external | `describe.skip` test asserting: container starts, GET / returns 200, port 4500 open | TDD: write test first, drive implementation |
| 1.3 | Write multi-stage Dockerfile | external | `docker build harness/` succeeds; image < 1.5GB | Debian bookworm-slim, node-pty builds, pnpm install |
| 1.4 | Write docker-compose.yml | external | `docker compose up` starts container | Bind mount source, named volume for node_modules, ports 3000/4500 |
| 1.5 | Write entrypoint.sh | external | Dev server + terminal sidecar start on container boot | Concurrent: turbopack + terminal-ws |
| 1.6 | Fix DISABLE_AUTH for Server Actions | _platform/auth | Server Actions succeed with DISABLE_AUTH=true | Per Finding 02 — extend auth() wrapper |
| 1.7 | Create .dockerignore + update .gitignore | external | `harness/results/` ignored by git; node_modules excluded from Docker context | Per Finding 08 |
| 1.8 | Add `just test-harness` to root justfile | external | `just test-harness` runs harness integration tests | After existing test-e2e recipe |
| 1.9 | Run integration test (GREEN) | external | Unskip test from 1.2 — container boots, health passes | Validates full Phase 1 |

### Acceptance Criteria
- AC-01, AC-02, AC-03, AC-08, AC-09, AC-20, AC-21

---

## Phase 2: Playwright & CDP Integration

**Objective**: Add Playwright Chromium to the container with CDP exposed, enabling browser automation from host.
**Domain**: External tooling (harness/)
**Delivers**:
- Playwright installed in Docker image with Chromium + system deps
- CDP port 9222 exposed in docker-compose.yml
- playwright.config.ts with viewport definitions
- `harness health` checks CDP availability
- Agent can connect from host via `chromium.connectOverCDP('http://localhost:9222')`
- Smoke Playwright test: page loads, title correct
- Integration test: CDP connection works, screenshot captured

**Depends on**: Phase 1
**Key risks**: Chromium system deps in Docker; shared memory for headless Chrome (--shm-size)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Write integration test: CDP + screenshot (RED) | external | `describe.skip` test asserting: CDP connects on 9222, screenshot file produced | TDD: write test first |
| 2.2 | Add `@playwright/test` to harness/package.json | external | `pnpm install` succeeds in harness/ | Pin version |
| 2.3 | Install Chromium + system deps in Dockerfile | external | `npx playwright install chromium --with-deps` in Docker build | Per Finding 03 |
| 2.4 | Configure CDP port 9222 in Playwright launch | external | Chromium starts with `--remote-debugging-port=9222` | Per Finding 06 |
| 2.5 | Expose CDP in docker-compose.yml | external | Port 9222 mapped to host | Add --shm-size=1gb |
| 2.6 | Create playwright.config.ts | external | Config with baseURL, viewport projects, timeouts | 3 projects: desktop, tablet, mobile |
| 2.7 | Create viewport definitions (devices.ts) | external | desktop-lg/md, tablet, mobile viewports exported | Per Workshop 002 |
| 2.8 | Write smoke Playwright test | external | `npx playwright test smoke/` passes — page loads at localhost:3000 | First real browser test |
| 2.9 | Run integration test (GREEN) | external | Unskip test from 2.1 — CDP connects, screenshot captured | Validates full Phase 2 |

### Acceptance Criteria
- AC-04, AC-05, AC-06, AC-07, AC-10

---

## Phase 3: Harness CLI SDK

**Objective**: Build the typed CLI that agents use — structured JSON output, error codes, composable commands.
**Domain**: External tooling (harness/)
**Delivers**:
- Commander.js CLI at `harness/src/cli/`
- Commands: init, build, dev, stop, health, test, screenshot, results
- All commands return `{command, status, data?, error?}` JSON envelope to stdout
- Error codes E100-E110
- `harness test --suite smoke --viewport desktop-lg` runs Playwright and returns JSON
- `harness screenshot <name>` captures via CDP and saves to results/
- `harness health` probes all endpoints and returns structured status

**Depends on**: Phase 2
**Key risks**: None significant — straightforward CLI development

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | TDD: CLI output schema unit tests (RED) | external | Unit tests for JSON envelope, error codes, command parsing | Runs in `just fft` — pure logic, no Docker |
| 3.2 | Implement output.ts (JSON envelope) (GREEN) | external | `formatSuccess()`, `formatError()` produce validated JSON | Zod schema for envelope |
| 3.3 | Scaffold CLI with Commander.js | external | `npx tsx harness/src/cli/index.ts --help` shows commands | Per Finding 04 — JSON adapter pattern |
| 3.4 | Implement `harness build` command | external | Runs `docker compose build`, returns JSON status | Wraps docker compose |
| 3.5 | Implement `harness dev` command | external | Starts container, waits for health, returns JSON | Polls health endpoint |
| 3.6 | Implement `harness stop` command | external | Stops container, returns JSON confirmation | Wraps docker compose down |
| 3.7 | Implement `harness health` command | external | Probes 3000, 9222, 4500, MCP; returns JSON per-check status | Per AC-04 |
| 3.8 | Implement `harness test` command | external | Runs Playwright with `--suite` and `--viewport` flags; returns JSON results | Wraps npx playwright test |
| 3.9 | Implement `harness screenshot` command | external | Captures screenshot via CDP, saves to results/, returns path in JSON | Per AC-14 |
| 3.10 | Implement `harness results` command | external | Reads latest results JSON, outputs to stdout | Simple file reader |

### Acceptance Criteria
- AC-11, AC-12, AC-13, AC-14

---

## Phase 4: Seed Scripts, Feature Tests & Responsive Viewports

**Objective**: Create test data and write Playwright tests that verify real app behavior across viewports.
**Domain**: External tooling (harness/)
**Delivers**:
- `harness seed` creates test workspace + worktree via HTTP API
- Smoke test suite: health, routes, MCP
- Responsive test suite: sidebar behavior at mobile/tablet/desktop
- Feature test stubs: agents, browser, terminal, workflows (placeholder specs)
- `harness test --viewport mobile` works end-to-end
- Documentation updates: CLAUDE.md, justfile, harness.md governance doc

**Depends on**: Phase 3
**Key risks**: Seeding via HTTP API requires app to be running and auth bypassed (verified in Phase 1)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | Implement `harness seed` command | external | Creates workspace via POST /api/workspaces, creates worktree | HTTP API calls, per OQ-02 |
| 4.2 | Write seed-workspace.ts | external | Idempotent: safe to run twice; workspace visible in sidebar | Check if exists first |
| 4.3 | Expand smoke test suite | external | Tests: app loads, all main routes 200, MCP responds, no console errors | 5-8 assertions |
| 4.4 | Write responsive viewport tests | external | Sidebar visible on desktop, collapsed/hidden on mobile; cards stack on mobile | Per AC-17, AC-18, AC-19 |
| 4.5 | Create feature test stubs | external | Placeholder .spec.ts files for agents, browser, terminal, workflows | Empty describe blocks — filled in future plans |
| 4.6 | Verify seeded data visible in browser | external | Playwright navigates to /workspaces, sees test workspace and worktrees | Per AC-15, AC-16 |
| 4.7 | Update CLAUDE.md with harness commands | cross-domain | Harness commands documented in custom instructions | `just test-harness`, `harness dev`, etc. |
| 4.8 | Update justfile with harness recipes | cross-domain | `just harness-dev`, `just harness-stop`, `just test-harness` | After existing test recipes |
| 4.9 | Generate harness.md governance doc | cross-domain | `docs/project-rules/harness.md` documents L3 maturity | Boot/Interact/Observe documented |

### Acceptance Criteria
- AC-15, AC-16, AC-17, AC-18, AC-19

---

## Risks

| Risk | Likelihood | Impact | Mitigation | Phase |
|------|-----------|--------|------------|-------|
| node-pty compilation fails in Docker | Medium | High | Debian bookworm-slim + build-essential; test in 1.2 | 1 |
| Turbopack HMR over bind mounts | Low | Medium | OrbStack 2-way mounts support native fs events; test without polling first; add `WATCHPACK_POLLING=true` only if needed | 1 |
| Chromium OOM in container | Low | High | `--shm-size=1gb` in compose; single browser instance | 2 |
| DISABLE_AUTH doesn't cover all Server Actions | High | High | Fix auth() wrapper in 1.5; integration test | 1 |
| pnpm named volume stale after host dep change | Medium | Medium | `harness rebuild` command; health check validates | 3 |
| Seed API calls fail due to missing routes | Low | Medium | Use existing `/api/workspaces` routes; test in 4.1 | 4 |

## Did You Know (DYK)

- **DYK-01: Cold start accepted** — First `harness dev` takes ~3-5 min (empty named volume → pnpm install → node-pty compile → turbo build). Subsequent boots are fast. entrypoint.sh should detect empty node_modules and install only when needed.
- **DYK-02: OrbStack HMR should work without polling** — OrbStack uses 2-way bind mounts with native macOS virtualization APIs, significantly faster than Docker Desktop. Turbopack HMR likely works out of the box. Default `WATCHPACK_POLLING=false`; only enable if needed.
- **DYK-03: Phase 2 is the minimum viable harness** — After Phase 2, the agent has CDP on port 9222 and can browse, screenshot, and inspect at any viewport. Don't wait for the CLI (Phase 3) to start using the harness for real work.
- **DYK-04: DISABLE_AUTH is a maintenance contract** — The auth() wrapper fix (Finding 02) must be the ONLY way Server Actions check auth. If anyone imports NextAuth's auth() directly, harness mode breaks silently. Add to CLAUDE.md and code review checklist.
- **DYK-05: Harness tests need explicit unit/integration boundary** — `harness/test/unit/` (pure logic, runs in `just fft`, no Docker) vs `harness/test/integration/` (needs Docker, `describe.skip`). Mix them and `just fft` breaks when Docker isn't running.
- **DYK-06: OrbStack gives us container domains for free** — OrbStack auto-assigns `.orb.local` domains and supports automatic HTTPS. Could be useful for multi-container Plan 2 scenarios.
- **DYK-07: OrbStack starts in ~2 seconds** — Near-instant container boot vs Docker Desktop's slow VM spin-up. Agent iteration loop benefits directly.

---

**Next step**: Run `/plan-5-v2-phase-tasks-and-brief` for Phase 1 dossier, then implement.

---

## Fixes

| ID | Created | Summary | Domain(s) | Status | Source |
|----|---------|---------|-----------|--------|--------|
| FX001 | 2026-03-07 | Harness doctor command + port persistence + prompt improvements | external, cross-domain | Proposed | [Test Run #1 retro](workshops/004-test-run-001-retro.md) |
