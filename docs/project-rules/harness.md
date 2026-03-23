# Agentic Development Harness

**Maturity**: L3 — Boot + Browser Interaction + Structured Evidence + CLI SDK
**Plan**: [067-harness](../plans/067-harness/harness-plan.md)
**ADR**: [ADR-0014](../adr/adr-0014-first-class-agentic-development-harness.md)

## Overview

The harness is a Docker-containerized dev environment with Playwright/CDP browser automation, controlled by a typed CLI that returns structured JSON. Agents boot the app, browse it at any viewport, capture screenshots, run tests, and seed test data.

The harness is **external tooling** rooted at `harness/` — it is not a registered domain, not part of `apps/cli`. It is included in `pnpm-workspace.yaml` (per [ADR-0014 amendment](../plans/070-harness-agent-runner/agent-runner-plan.md#adr-0014-amendment-workspace-managed-tooling)) so it can import `@chainglass/shared` for typed SDK adapter integration. This is a build-system concern, not an architectural promotion to domain status.

**ADR-0014 Import Exceptions**: The harness may import from `@chainglass/shared` (general SDK, types) and `@chainglass/positional-graph` (workflow auto-completion in Plan 076). These are sanctioned exceptions — the harness needs direct access to workflow engine types for auto-completion runner and workflow contract tests.

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
| `just harness screenshot-all <name>` | Capture screenshots at all viewports (or `--viewports` subset) |
| `just harness console-logs` | Capture browser console messages via CDP (`--filter`, `--url`, `--wait`) |
| `just harness results` | Read latest test results |
| `just harness seed` | Create test workspace + worktrees |
| `just harness ports` | Show port allocation |
| `just harness agent run <slug>` | Execute an agent definition (Plan 070) |
| `just harness agent list` | List available agent definitions |
| `just harness agent history <slug>` | Show past runs for an agent |
| `just harness agent validate <slug>` | Re-validate most recent run output |
| `just harness-cg <args>` | Run any `cg` CLI command inside the container (auto-adds `--json` + `--workspace-path` + `--server-url`) |
| `just harness workflow run [--server]` | Run workflow with assertions + envelope (automated testing) |
| `just harness workflow status [--server]` | Node-level workflow status |
| `just harness workflow reset` | Clean + recreate test workflow data |
| `just harness workflow logs [--errors]` | Show cached event timeline |

> **`harness-cg` vs `harness workflow`**: Use `just harness-cg wf ...` for ad-hoc exploration (raw CLI output). Use `just harness workflow run` for automated testing (structured assertions + HarnessEnvelope).

#### Container CG Workflow Recipe

```bash
# Full end-to-end inside the container:
just harness seed                                    # 1. Seed test workspace
just harness-cg wf create my-test                    # 2. Create workflow
just harness-cg wf node add my-test <lineId> test-agent  # 3. Add nodes
just harness-cg wf run my-test --server              # 4. Start (returns immediately)
just harness-cg wf show my-test --detailed --server  # 5. Check progress
just harness-cg wf stop my-test                      # 6. Stop it
just harness screenshot workflow-result              # 7. Visual proof
```

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
| E126 | Console log capture failed |

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
- **pnpm workspace**: Run scripts within harness using `cd harness && pnpm exec tsx <script.ts>` (not `npx tsx` — `npx` resolves from repo root in pnpm workspaces)

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
| Plan 070 P3 | Smoke-test agent: first agent definition, validated end-to-end run, retrospective feedback loop | 2026-03-08 |
| Plan 070 FX002 | Console-logs + screenshot-all CLI commands, pnpm workspace docs — from smoke-test retrospective | 2026-03-08 |
| Plan 076 P1-P3 | Workflow execution: ODS error queue, SSE fix, CLI telemetry (--detailed, --json-events), harness workflow commands (reset/run/status/logs), auto-completion runner | 2026-03-20 |
| Plan 076 P4 | REST API + SDK at @chainglass/shared/sdk/workflow, CG CLI --server mode (fire-and-forget run), harness-cg recipe, container CG commands, localToken auth, drive lock in engine | 2026-03-23 |

## Prompt Templates

Reusable agent task templates live in `harness/prompts/`. These are the agent-facing API for the harness — versioned, discoverable, iterable.

| Prompt | Description |
|--------|-------------|
| `harness/prompts/screenshot-audit.md` | Boot harness, screenshot at 3 viewports, report findings |

When creating a new harness task for an agent, write a prompt template and commit it to `harness/prompts/`.

## Agent Definitions

Agent definitions live at `harness/agents/<slug>/`. Each agent is a versioned folder with a prompt, output schema, and optional instructions.

### Reference Agent: smoke-test

The smoke-test agent validates the harness end-to-end and provides a retrospective on the developer experience.

```
harness/agents/smoke-test/
├── prompt.md              # Mission brief: health check, screenshots, console logs, report, retrospective
├── output-schema.json     # JSON Schema for report validation (draft 2020-12)
├── instructions.md        # Agent rules: output paths, CLI quick reference, CDP access, error handling
└── runs/                  # Auto-created per execution (gitignored)
    └── <timestamp>/
        ├── events.ndjson     # All agent events (tool calls, thinking, messages)
        ├── completed.json    # Run metadata (session ID, timing, validation)
        ├── output/report.json # Validated structured report
        ├── prompt.md         # Frozen copy at run time
        └── instructions.md   # Frozen copy at run time
```

**Running the smoke-test**:
```bash
# Set GitHub token (required for Copilot SDK)
export GH_TOKEN=$(gh auth token)

# Boot harness if not running
just harness dev

# Execute the agent
just harness agent run smoke-test

# Re-validate after schema changes
just harness agent validate smoke-test

# View run history
just harness agent history smoke-test
```

**What the smoke-test does**: Health check → 3-viewport screenshots → console error check via CDP → server log review → structured report → honest retrospective (UX audit of the harness).

**The retrospective is the most valuable output** — it captures unfiltered feedback from an autonomous agent about what CLI commands are intuitive, what's confusing, and what improvements would help. This feedback loop drives harness evolution.

#### The Feedback Loop in Practice

Every agent retrospective is a potential fix task. The workflow:

1. Agent runs and writes retrospective with `magicWand` suggestion
2. Developer reads retrospective, creates FX task quoting the agent's exact words
3. FX is implemented and verified using the harness (dogfooding the dogfood)
4. Same agent runs again — confirms the issue is resolved
5. FX recorded in plan with "Source: [agent] retrospective"

This is not aspirational. FX002 (`console-logs` + `screenshot-all`) shipped within hours of the smoke-test agent's first retrospective. Every harness agent MUST include a retrospective section with `magicWand` as a required field.

#### Creating New Agents — Mandatory Retrospective

All harness agents MUST include:
- `prompt.md`: Retrospective section asking what worked, what was confusing, magic wand
- `output-schema.json`: `retrospective.magicWand` as a required field
- `instructions.md`: "This is dogfooding" framing with good/bad feedback examples

See `harness/agents/smoke-test/` as the reference implementation.

### Creating New Agents

1. Create `harness/agents/<slug>/prompt.md` (required)
2. Optionally add `output-schema.json` (JSON Schema for validation)
3. Optionally add `instructions.md` (agent-specific rules)
4. Run with `just harness agent run <slug>`
