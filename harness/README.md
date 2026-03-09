# Chainglass Harness

An agentic development harness for the Chainglass monorepo. Docker-containerized dev environment with browser automation, structured CLI, and declarative agent execution.

## Quick Start

```bash
# Install harness dependencies (first time only)
just harness-install

# Start the container (~2 min cold boot)
just harness dev

# Verify everything is healthy
just harness doctor --wait

# Run the smoke-test agent
export GH_TOKEN=$(gh auth token)
just harness agent run smoke-test

# Tail agent output in another terminal
just harness agent tail smoke-test
```

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Docker Container (Debian bookworm-slim)          │
│                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │ Next.js  │  │ Terminal  │  │   Chromium    │    │
│  │ App      │  │ Sidecar   │  │  (headless)   │    │
│  │ :3100+   │  │ :4600+    │  │  CDP :9222+   │    │
│  └──────────┘  └──────────┘  └──────────────┘    │
└──────────────────────────────────────────────────┘
         ▲              ▲              ▲
         │              │              │
┌──────────────────────────────────────────────────┐
│  Harness CLI (host)                               │
│  just harness <command>                           │
│                                                    │
│  • health / doctor    — probe services            │
│  • screenshot / test  — browser automation        │
│  • agent run / tail   — execute AI agents         │
│  • seed               — create test workspaces    │
└──────────────────────────────────────────────────┘
```

Ports are dynamically allocated per worktree (derived from name hash), so multiple worktrees can run harness containers simultaneously. Use `just harness ports` to see your allocation.

## Philosophy: Agents Improving the Product

The harness exists to create a **virtuous feedback loop** where agents don't just test the product — they actively improve it.

Every agent writes a structured retrospective answering:
- **What worked well?** — Which commands were intuitive? What was pleasant?
- **What was confusing?** — What required trial-and-error? What error messages were unhelpful?
- **Magic wand** — If you could change one thing, what would it be? Be concrete.
- **Improvement suggestions** — 1-3 specific, actionable changes

These retrospectives are the most valuable output of any agent run. They capture friction that humans stop noticing — and they become real fix tasks that ship in the same sprint.

### Proof It Works

| Retrospective Finding | Fix | Result |
|-----------------------|-----|--------|
| "No `console-logs` command — had to write Playwright from scratch" | FX002: Added `console-logs` + `screenshot-all` commands | Committed `d144c6a` |
| Screenshot command timed out on SSE pages | FX003: Added `--wait-until` flag, changed default to `domcontentloaded` | In progress |

### The Loop

```
Agent runs → Retrospective → Fix task → Implementation → Better next run
```

This is dogfooding at the infrastructure level. The harness tests the product, and the product improves the harness.

## CLI Commands

All commands return structured JSON: `{command, status, data?, error?}`

| Command | Purpose |
|---------|---------|
| `just harness dev` | Start container (auto-computes ports) |
| `just harness stop` | Stop container |
| `just harness build` | Rebuild Docker image |
| `just harness health` | Quick health probe |
| `just harness doctor` | Layered diagnostics (Docker → container → app → MCP → terminal → CDP) |
| `just harness doctor --wait` | Wait for harness to become healthy (cold boot ~2-3 min) |
| `just harness ports` | Show port allocation for this worktree |
| `just harness seed` | Create test workspace + worktrees |
| `just harness test` | Run Playwright test suite |
| `just harness test --suite smoke` | Run smoke tests only |
| `just harness test --viewport mobile` | Test at mobile viewport |
| `just harness screenshot <name>` | Capture screenshot via CDP. Options: `--viewport`, `--url`, `--wait-until`, `--timeout`, `--delay` |
| `just harness screenshot-all <name>` | Screenshots at all viewports. Options: `--viewports`, `--url`, `--wait-until`, `--timeout`, `--delay` |
| `just harness console-logs` | Capture browser console logs. Options: `--filter`, `--url`, `--wait`, `--wait-until`, `--timeout` |
| `just harness results` | List captured results |
| `just harness agent run <slug>` | Execute an agent definition |
| `just harness agent run <slug> --model gpt-5.4` | With model selection |
| `just harness agent list` | List available agents |
| `just harness agent history <slug>` | Show past runs |
| `just harness agent validate <slug>` | Re-validate most recent output |
| `just harness agent tail <slug>` | Follow running agent's event stream |

### Page Navigation

All commands that navigate to pages (`screenshot`, `screenshot-all`, `console-logs`) accept these options:

| Option | Default | Values | Purpose |
|--------|---------|--------|---------|
| `--wait-until` | `domcontentloaded` | `commit`, `domcontentloaded`, `load`, `networkidle` | When to consider page "loaded" |
| `--timeout` | `30000` | milliseconds | How long to wait before timing out |
| `--delay` | `2000` (screenshots) / `0` (console-logs) | milliseconds | Post-navigation delay for React hydration |

**Which strategy to use:**

- **`domcontentloaded`** (default) — DOM is parsed and ready. Works on all pages including SSE-enabled workspace pages.
- **`networkidle`** — No network requests for 500ms. Only works on fully static pages with no SSE, WebSocket, or polling.
- **`load`** — All resources (images, CSS) finished loading. Use when visual completeness matters.
- **`commit`** — Server responded. Fastest, but page content may not be rendered yet.

**Why `--delay`?** Next.js with React 19 renders via client-side hydration. The `load` event fires when scripts are loaded, but React still needs ~1-2s to hydrate and render components. The `--delay` flag waits after navigation so screenshots capture the fully rendered page.

```bash
# Default — works on SSE pages, 2s hydration delay
just harness screenshot agents --url http://127.0.0.1:3159/workspaces/ws/agents

# No delay (page is pre-rendered / static)
just harness screenshot login --delay 0

# Explicit networkidle for a known-static page
just harness screenshot login --wait-until networkidle --delay 0
```

## Agent Definitions

Agents live in `agents/<slug>/` with a declarative structure:

```
agents/smoke-test/
├── prompt.md             # System prompt (injected before user input)
├── instructions.md       # Agent guidelines + CLI quick reference
├── output-schema.json    # JSON Schema for validated output
└── runs/                 # Timestamped run history
    └── 2026-03-09T12-56-54Z-6882/
        ├── events.ndjson       # Full event stream
        ├── instructions.md     # Snapshot of instructions used
        ├── prompt.md           # Snapshot of prompt used
        ├── output-schema.json  # Snapshot of schema used
        └── output/
            └── report.json     # Agent output (schema-validated)
```

### Available Agents

| Agent | Purpose |
|-------|---------|
| `smoke-test` | Health check → 3-viewport screenshots → console log audit → server log review → retrospective |
| `mobile-ux-audit` | Mobile UX quality assessment across viewports |

### Creating a New Agent

1. Create `agents/<your-slug>/`
2. Add `prompt.md` — the system prompt that frames the agent's task
   - **MUST** include a Retrospective section (see `agents/smoke-test/prompt.md` for the template)
   - Ask: what worked, what was confusing, magic wand, improvement suggestions
3. Add `instructions.md` — agent identity, guidelines, CLI quick reference
   - **MUST** include: "This is dogfooding — your experience improves the harness for everyone"
   - Include good vs bad retrospective examples
4. Add `output-schema.json` — JSON Schema (Draft 2020-12) for the expected output
   - **MUST** include `retrospective` object with `magicWand` as a **required** field
   - Copy the retrospective schema from `agents/smoke-test/output-schema.json`
5. Run: `just harness agent run <your-slug>`

The retrospective is not optional. It's the mechanism that makes the harness better over time. See "From Retrospective to Fix" below.

The runner validates output against the schema and stores everything in a timestamped `runs/` folder for auditability.

## From Retrospective to Fix

When an agent's retrospective surfaces an improvement, here's how to close the loop:

1. **Read the retrospective** in `agents/<slug>/runs/<timestamp>/output/report.json`
2. **Create a fix task** using `/plan-5-v2-phase-tasks-and-brief` — quote the agent's exact words as the source
3. **Implement the fix** — use the harness itself to verify (dogfooding the dogfood)
4. **Run the same agent again** — confirm the retrospective no longer mentions the issue
5. **Update the plan** — record the FX with "Source: [agent] retrospective" in the Fixes table

The fix task should quote the agent's feedback directly. This creates traceability: every harness improvement traces back to the agent run that suggested it.

## Docker Details

- **Base**: Node 20.19 on Debian bookworm-slim (glibc required for node-pty)
- **Volumes**: Bind-mount source code (HMR), named volumes for `node_modules` and `.next` (avoids macOS↔Linux binary conflicts)
- **Auth**: `DISABLE_AUTH=true` in container for automated testing
- **Chromium**: Headless Chrome with CDP exposed — Playwright connects via `connectOverCDP()`, not `launch()`

## Error Codes

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

## Project Structure

```
harness/
├── src/
│   ├── agent/          # Agent runner, validator, folder discovery
│   ├── cdp/            # Chrome DevTools Protocol connection
│   ├── cli/
│   │   ├── commands/   # 13 CLI subcommands
│   │   ├── index.ts    # Commander.js entry point
│   │   └── output.ts   # JSON envelope formatting
│   ├── docker/         # Container lifecycle management
│   ├── doctor/         # Layered health diagnostics
│   ├── health/         # Service health probes
│   ├── ports/          # Dynamic port allocation
│   ├── seed/           # Test workspace seeding
│   └── viewports/      # Responsive viewport definitions
├── agents/             # Declarative agent definitions
├── tests/
│   ├── smoke/          # Docker boot, MCP, CDP, routes
│   ├── unit/           # Agent, CLI, ports, doctor
│   ├── integration/    # CLI command tests
│   ├── features/       # E2E: agents, browser, terminal
│   └── responsive/     # Sidebar responsive design
├── results/            # Captured screenshots and logs
├── Dockerfile          # Multi-stage container build
├── docker-compose.yml  # Service config with dynamic ports
└── playwright.config.ts
```

## Testing

```bash
# Run all harness tests (unit + smoke)
just test-harness

# Run Playwright tests against running container
just harness test

# Run specific test suite
just harness test --suite smoke
just harness test --suite responsive

# Type-check harness source
just harness-typecheck
```

## Related Documentation

- [ADR-0014: First-Class Agentic Development Harness](../docs/adr/adr-0014-first-class-agentic-development-harness.md)
- [Project Rules: Harness](../docs/project-rules/harness.md) — L3 maturity governance
- [Plan 067: Harness](../docs/plans/067-harness/) — Docker + Playwright + CLI SDK
- [Plan 070: Agent Runner](../docs/plans/070-harness-agent-runner/) — Copilot SDK + declarative agents
