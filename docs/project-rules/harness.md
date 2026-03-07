# Agentic Development Harness

**Maturity**: L3 — Boot + Browser Interaction + Structured Evidence + CLI SDK
**Plan**: [067-harness](../plans/067-harness/harness-plan.md)
**ADR**: [ADR-0014](../adr/adr-0014-first-class-agentic-development-harness.md)

## Overview

The harness is a Docker-containerized dev environment with Playwright/CDP browser automation, controlled by a typed CLI that returns structured JSON. Agents boot the app, browse it at any viewport, capture screenshots, run tests, and seed test data.

The harness is **external tooling** rooted at `harness/` — it is not a registered domain, not part of `apps/cli`. It is included in `pnpm-workspace.yaml` (per [ADR-0014 amendment](../plans/070-harness-agent-runner/agent-runner-plan.md#adr-0014-amendment-workspace-managed-tooling)) so it can import `@chainglass/shared` for typed SDK adapter integration. This is a build-system concern, not an architectural promotion to domain status.

## Boot

### Dynamic Port Allocation

Each worktree gets unique, deterministic ports derived from its directory name:

```bash
# Show ports for this worktree
just harness ports

# Ports are in ranges: app 3100-3199, terminal 4600-4699, cdp 9222-9321
# Override with env vars: HARNESS_APP_PORT, HARNESS_TERMINAL_PORT, HARNESS_CDP_PORT
```

### Start / Stop

```bash
# Install standalone harness deps (first time only)
just harness-install

# Start the harness container (auto-computes ports)
just harness dev

# Stop the harness container
just harness stop

# Rebuild Docker image after Dockerfile changes
just harness build
```

### Health Check

```bash
just harness health
# Returns: {"command":"health","status":"ok","data":{"status":"ok","app":{"status":"up",...},...}}
```

### Doctor (Diagnostics)

Like `flutter doctor` — runs layered checks and tells you exactly what's wrong and how to fix it.

```bash
just harness doctor              # One-shot diagnostic
just harness doctor --wait       # Wait for harness to become healthy (up to 5 min)
just harness doctor --wait 60    # Custom timeout in seconds
```

**Always start here** when something isn't working. Doctor checks Docker → Ports → Container → App → Services in order.

**Cold boot**: First boot takes ~2-3 min (installs deps + builds). Use `--wait` to let it finish automatically.

### `.env` Port Cache

Every CLI command auto-generates `harness/.env` with the computed ports. This means `docker compose` commands also use the correct ports, even when run directly. The `.env` is gitignored and regenerated on every CLI call.

## Interact

### Endpoints (dynamic per worktree)

| Service | URL Pattern | Notes |
|---------|-------------|-------|
| App | `http://127.0.0.1:{app_port}` | Next.js dev server with HMR |
| Terminal | `ws://127.0.0.1:{terminal_port}` | WebSocket sidecar |
| CDP | `http://127.0.0.1:{cdp_port}` | Chrome DevTools Protocol |
| MCP | `POST http://127.0.0.1:{app_port}/_next/mcp` | JSON-RPC 2.0 |

Run `just harness ports` to see your worktree's actual ports.

### CLI Commands

All commands return `{command, status, data?, error?}` JSON to stdout.

| Command | Description |
|---------|-------------|
| `just harness doctor` | Run diagnostic checks with actionable fixes |
| `just harness doctor --wait` | Wait for harness to become healthy (up to 5 min) |
| `just harness health` | Quick status probe (JSON) |
| `just harness test --suite smoke` | Run Playwright smoke tests |
| `just harness test --viewport mobile` | Run tests at mobile viewport |
| `just harness screenshot <name>` | Capture screenshot via CDP |
| `just harness results` | Read latest test results |
| `just harness seed` | Create test workspace + worktrees |
| `just harness ports` | Show port allocation |
| `just harness agent run <slug>` | Execute an agent definition (Plan 070) |
| `just harness agent list` | List available agent definitions |
| `just harness agent history <slug>` | Show past runs for an agent |
| `just harness agent validate <slug>` | Re-validate most recent run output |

### Error Codes

| Code | Meaning |
|------|---------|
| E100 | Unknown error |
| E101 | Container not running |
| E102 | Build failed |
| E103 | Health check failed |
| E104 | CDP unavailable |
| E105 | Test failed |
| E106 | Screenshot failed |
| E107 | Results not found |
| E108 | Invalid arguments |
| E109 | Timeout |
| E110 | Docker unavailable |
| E120 | Agent execution failed |
| E121 | Agent not found |
| E122 | Agent auth missing (GH_TOKEN) |
| E123 | Agent timeout |
| E124 | Agent validation failed |
| E125 | Agent run folder creation failed |

## Observe

### Evidence Paths

| Artifact | Location |
|----------|----------|
| Test results JSON | `harness/results/test-results.json` |
| Screenshots | `harness/results/{name}-{viewport}.png` |
| Test output | `harness/results/test-output/` |

### Running Tests Directly

```bash
# Vitest (unit + integration, from host)
cd harness && pnpm exec vitest run

# Playwright (browser tests, from host against container)
cd harness && pnpm exec playwright test --config=playwright.config.ts
```

## Architecture

### Container Topology

- App runs inside Docker on the allocated port
- Terminal WebSocket sidecar on allocated port
- Chromium headless on internal `:9223` (loopback-only)
- `socat` proxy exposes CDP on allocated external port
- Source bind-mounted from host for HMR
- Named volumes per worktree for `node_modules` and `.next`

### Auth Bypass

The container runs with `DISABLE_AUTH=true`. All API routes and Server Actions skip authentication. This is dev-only — never use in production.

### Seed Data

`harness seed` creates a workspace directory at `scratch/harness-test-workspace/` (git-initialized) and registers it in the container's workspace registry at `/root/.config/chainglass/workspaces.json`. The seeded workspace is visible via `GET /api/workspaces`.

## Responsive Testing

The harness tests three viewport tiers:

| Viewport | Size | Playwright Project |
|----------|------|-------------------|
| desktop-lg | 1440×900 | desktop |
| tablet | 768×1024 | tablet |
| mobile | 375×812 | mobile |

**Sidebar behavior** (for mobile UI refactor reference):
- Desktop (≥768px): Sidebar visible in layout flow, `hidden md:block`
- Mobile (<768px): Sidebar is a Radix `<Sheet>` overlay, controlled by `openMobile` state
- Sheet uses `data-state="open"/"closed"` attribute
- `useSidebar()` hook manages state; `toggleSidebar()` dispatches
- `SIDEBAR_WIDTH_MOBILE = '18rem'`; state persisted in `sidebar_state` cookie

## Conventions

- All CLI commands return the `HarnessEnvelope` JSON schema
- Exit 0 for ok/degraded, exit 1 for command failures only
- Harness tests run via `just test-harness` (separate from `just fft`)
- All durable tests require 5-field Test Doc blocks
- Use event-driven assertions, not fixed sleeps
- SDK helpers are composable building blocks (`src/cdp/`, `src/health/`, `src/ports/`, `src/docker/`)

## History

| Phase | What Changed | Date |
|-------|-------------|------|
| Phase 1 | Docker container + dev server + auth bypass | 2026-03-07 |
| Phase 2 | Playwright + CDP integration + browser smoke tests | 2026-03-07 |
| Phase 3 | CLI SDK with 9 commands + SDK helpers + dynamic ports | 2026-03-07 |
| Phase 4 | Seed scripts + route/MCP/responsive tests + this doc | 2026-03-07 |
| FX001 | Doctor command + .env port cache + prompt templates | 2026-03-07 |
| Plan 070 P1 | SdkCopilotAdapter: model/reasoning/listModels/setModel | 2026-03-07 |
| Plan 070 P2 | Agent runner: folder mgmt, runner, validator, display, CLI, error codes | 2026-03-07 |

## Prompt Templates

Reusable agent task templates live in `harness/prompts/`. These are the agent-facing API for the harness — versioned, discoverable, iterable.

| Prompt | Description |
|--------|-------------|
| `harness/prompts/screenshot-audit.md` | Boot harness, screenshot at 3 viewports, report findings |

When creating a new harness task for an agent, write a prompt template and commit it to `harness/prompts/`.
