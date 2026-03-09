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
| `just harness screenshot <name>` | Capture screenshot via CDP |
| `just harness screenshot-all <name>` | Screenshots at all viewports |
| `just harness console-logs` | Capture browser console logs |
| `just harness results` | List captured results |
| `just harness agent run <slug>` | Execute an agent definition |
| `just harness agent run <slug> --model gpt-5.4` | With model selection |
| `just harness agent list` | List available agents |
| `just harness agent history <slug>` | Show past runs |
| `just harness agent validate <slug>` | Re-validate most recent output |
| `just harness agent tail <slug>` | Follow running agent's event stream |

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
3. Add `instructions.md` — agent identity, guidelines, CLI quick reference
4. Add `output-schema.json` — JSON Schema (Draft 2020-12) for the expected output
5. Run: `just harness agent run <your-slug>`

The runner validates output against the schema and stores everything in a timestamped `runs/` folder for auditability.

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
