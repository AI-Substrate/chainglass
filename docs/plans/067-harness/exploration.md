# Plan 067 — First-Class Agentic Development Harness

## Exploration Research Dossier

> Generated: 2026-03-06 | Branch: 066-wf-real-agents | Status: Research Complete

---

## Executive Summary

Eight parallel research subagents explored the Chainglass monorepo to assess readiness for a "first-class agentic development harness" — a Dockerized, browser-automated, parallel-capable test orchestration system. The codebase has **strong foundations** (DI, fakes, workflow templates, MCP, CLI orchestration) but **critical gaps** (no Docker, no Playwright, 0 browser-based E2E tests, sequential-only test execution).

### Readiness Scorecard

| Capability | Status | Evidence |
|------------|--------|----------|
| Standalone build | ✅ Ready | `next.config.mjs` output: 'standalone', CLI bundles it |
| DI & Fakes | ✅ Ready | 137 Fake implementations, contract-tested |
| MCP integration | ✅ Ready | `/_next/mcp` auto-exposed, `cg mcp --stdio` CLI |
| Workflow templates | ✅ Ready | smoke, simple-serial, advanced-pipeline templates |
| CLI orchestration | ✅ Ready | `cg agent run/compact`, JSON output, session chaining |
| Terminal sidecar | ✅ Ready | WebSocket PTY server on port 4500 |
| Docker containerization | ❌ Missing | No Dockerfile, docker-compose, or .devcontainer |
| Browser automation | ❌ Missing | No Playwright dependency or tests |
| Parallel test execution | ❌ Blocked | `fileParallelism: false` due to process spawning |
| E2E browser tests | ❌ Missing | 0 of 168 components have browser tests |
| Responsive viewport testing | ❌ Missing | No device emulation or viewport tests |

---

## Key Research Findings

### 1. Docker Strategy (IA-01, DC-01, DC-10)

**Current state**: No Docker files exist. However, Next.js standalone output is already configured and the CLI bundles it to `dist/web/standalone/`.

**Recommended approach**: Multi-stage Dockerfile:
- **Builder stage** (~500MB): Node 20.19, pnpm, gcc/python3 (for node-pty native compilation), turbo build
- **Runtime stage** (~100MB): Node 20.19 slim, standalone output only, git ≥2.13

**Critical native dependencies** requiring build tools:
- `node-pty` (C++ compile, needs gcc + python3)
- `vscode-oniguruma` (WASM blob, bundled)
- 8 packages in `serverExternalPackages` must NOT be bundled to client

**Port mapping**: 3000 (Next.js) + 4500 (terminal WebSocket sidecar)

**Dev mode (Plan 1)**: Volume-mount source code, use Turbopack HMR. No rebuild on file changes. Agent kills/restarts dev server as needed.

**CI mode (Plan 2, future)**: Full build at container creation, multiple instances on different ports.

### 2. Browser Automation Architecture (QT-02, QT-09, IA-02)

**Current state**: Zero browser-based tests. 168 React components with 31% unit test coverage, 0% E2E coverage.

**Playwright plan**:
- Headless Chromium inside Docker container (co-located with app)
- CDP (Chrome DevTools Protocol) for programmatic control
- Multiple browser contexts (NOT multiple browsers) for parallel page viewing — Playwright supports this natively via `browser.newContext()`
- Device emulation for responsive testing: `devices['iPhone 14']`, `devices['iPad Pro']`, custom viewports

**Parallel browser isolation**:
- **Same browser, multiple contexts**: Playwright's `browser.newContext()` creates isolated cookie/storage environments. Each subagent gets its own context. This scales to 8-16 concurrent contexts per browser instance.
- **Multiple browser types**: Chromium + Firefox + WebKit available if needed for cross-browser testing
- **Scaling beyond single host**: Future option — headless Chrome in separate Docker containers via CDP remote connection

**Responsive viewport testing**:
- `page.setViewportSize({ width: 375, height: 812 })` — iPhone
- `page.setViewportSize({ width: 768, height: 1024 })` — iPad  
- `page.setViewportSize({ width: 1440, height: 900 })` — Desktop
- Built-in device descriptors: `playwright.devices['iPhone 14']` includes UA, viewport, touch, pixel ratio

**Key browser capabilities for agents**:
- Screenshot capture: `page.screenshot({ path, fullPage: true })`
- Console log capture: `page.on('console', msg => ...)`
- Network interception: `page.route('**/api/**', route => ...)`
- Visual comparison: `expect(page).toHaveScreenshot()`

### 3. Next.js MCP Integration (DE-03, IA-05, IC-05)

**Current state**: Production-ready. Next.js 16 auto-exposes MCP at `/_next/mcp`.

**Available MCP tools**:
- `get_routes` — list all application routes
- `get_errors` — current build/runtime errors
- `get_page_metadata` — page component information  
- `get_project_metadata` — project configuration
- `get_logs` — server logs
- `get_server_action_by_id` — inspect server actions

**Custom MCP server** (`cg mcp --stdio`):
- `check_health` — system health
- `wf_compose` — create workflow from template
- `phase_prepare/validate/finalize` — workflow phase lifecycle

**Agent loop**: Start container → MCP health check → browse pages → capture errors → fix → verify via MCP.

### 4. Parallel Testing Architecture (DB-06, PL-06, QT-10)

**Domain-based parallelism boundaries**:

| Group | Domains | Safe Parallelism |
|-------|---------|-----------------|
| Independent | file-ops, workspace-url, viewer, settings | 8+ parallel |
| Platform | state, events, sdk | 4x parallel |
| Orchestration | positional-graph, agents, work-unit-state | Sequential (2x max) |
| UI Layer | workflow-ui, terminal, file-browser, workunit-editor | 4x parallel |

**Key constraint**: Orchestration tests share `.chainglass/instances/` on disk — need workspace isolation per parallel runner. Each runner gets its own seeded workspace.

**Playwright parallelism**: Use `--workers 4 --shard N/M` for distributing across containers (Plan 2). Within a single container, use multiple browser contexts.

### 5. Test Orchestration via Chainglass Workflows (DB-07, DE-07, IC-11)

**Strategy**: Test suites ARE Chainglass workflows. Each test group is a workflow template.

**Template structure**:
```
.chainglass/templates/workflows/
├── harness-smoke/           # Quick health check (1 node)
├── harness-agent-serial/    # Agent lifecycle test (3 nodes)
├── harness-ui-parallel/     # Browser tests (4 parallel nodes)
├── harness-responsive/      # Viewport tests (3 parallel nodes)
└── harness-full-suite/      # Orchestrates all above (6+ nodes)
```

**Three programmable entry points** (DB-03):
1. CLI: `cg wf run --graph=harness-smoke`
2. Orchestration API: `IGraphOrchestration.drive()` with event observers
3. Web Actions: `createWorkflow()`, `instantiateTemplate()`

### 6. CLI & Harness Tooling (PS-01, PL-03, IA-06)

**Harness folder structure**:
```
harness/
├── justfile                    # harness-build, harness-dev, harness-test, harness-seed
├── Dockerfile                  # Multi-stage (builder + runtime)
├── docker-compose.yml          # App + Playwright + volume mounts
├── playwright.config.ts        # Browser config, viewports, devices
├── scripts/
│   ├── seed-workspace.ts       # Create test workspace + worktrees
│   ├── seed-workflows.ts       # Instantiate test workflow templates
│   └── run-harness.ts          # Orchestrate full test suite
├── test/
│   ├── smoke.spec.ts           # Health + route verification
│   ├── agents.spec.ts          # Agent lifecycle browser tests
│   ├── workflows.spec.ts       # Workflow execution browser tests
│   ├── responsive.spec.ts      # Viewport/device tests
│   └── terminal.spec.ts        # Terminal WebSocket tests
└── results/                    # JSON output (gitignored)
    └── run-YYYY-MM-DD-NNN.json
```

**CLI for agents** (structured JSON output):
```bash
harness build          # Build Docker image
harness dev            # Start dev container (volume-mounted)
harness seed           # Seed workspace + workflows
harness test           # Run full Playwright suite
harness test --group agents   # Run specific test group
harness results        # Show latest results JSON
harness screenshot     # Capture current state
```

### 7. Agent Adapter Extension (DB-04, PS-05)

**Existing pattern**: `IAgentAdapter` with 3 implementations (ClaudeCode, SdkCopilot, CopilotCLI).

**Harness can add**: `TestHarnessAdapter` for deterministic, fast test scenarios:
```typescript
class TestHarnessAdapter implements IAgentAdapter {
  async run(prompt, onEvent) {
    // Return predetermined responses from scenario registry
    // Instant, reproducible, no API calls
  }
}
```

**DI swap**: Test container registers `TestHarnessAdapter` instead of real adapters. Same code paths, deterministic results.

### 8. Prior Learnings & Gotchas (PL-01 through PL-15)

**Critical rules for harness**:
- **PL-01**: Harness tests MUST NOT run in `just fft` — separate `just test-harness` command
- **PL-02**: Use `describe.skip` (hardcoded), not env detection, for slow tests
- **PL-06**: Parallel agents via `Promise.all()` — each gets unique sessionId
- **PL-08**: Set `describe.timeout(120000)` per test — no built-in timeout
- **PL-10**: Harness is opt-in validation, not regression gate
- **PL-13**: Hybrid model — in-process setup + CLI subprocess + in-process verify
- **PL-14**: Manual harness discovers real bugs (template schema violations, etc.)
- **PL-15**: MCP test client needs Zod schemas + negative tests

### 9. Interface Surface for Harness (IC-01 through IC-14)

**API routes the harness can call**:
- `GET /api/workspaces?include=worktrees` — list workspaces
- `GET /api/health` — health check
- `POST /api/agents` — create agent session
- `GET /api/agents/events` — SSE agent events
- `GET /api/events/[channel]` — generic SSE channel
- `GET /api/terminal` — tmux session list
- `GET /api/activity-log` — activity entries

**Server actions (13+)**: addWorkspace, createWorkflow, instantiateTemplate, answerQuestion, etc.

**DI tokens (8)**: WORKSPACE_SERVICE, AGENT_SESSION_SERVICE, POSITIONAL_GRAPH_SERVICE, TEMPLATE_SERVICE, ORCHESTRATION_SERVICE, etc.

### 10. Domain Placement (DB-01, DB-08)

**Recommendation**: Harness is **external tooling**, NOT a domain. It consumes domain contracts but exports none. Lives in `harness/` at repo root.

**Future**: If harness grows to 1000+ LOC with 3+ consumers, consider `_platform/harness` infrastructure domain. But today: keep it simple.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                 Agent (Copilot CLI)                   │
│  Orchestrates: build → seed → test → report          │
└──────────────┬──────────────────────┬────────────────┘
               │ docker/justfile      │ playwright
               ▼                      ▼
┌──────────────────────┐  ┌─────────────────────────────┐
│   Docker Container    │  │   Playwright Browser(s)      │
│                       │  │                               │
│  ┌─────────────────┐ │  │  Context 1: Desktop 1440px    │
│  │ Next.js Dev      │ │  │  Context 2: iPad 768px        │
│  │ :3000            │◄├──│  Context 3: iPhone 375px      │
│  │ /_next/mcp       │ │  │  Context 4: Agent test        │
│  └─────────────────┘ │  │  Context 5: Agent test         │
│  ┌─────────────────┐ │  │  ...up to 16 contexts          │
│  │ Terminal Sidecar │ │  └─────────────────────────────┘
│  │ :4500 (WS)      │ │
│  └─────────────────┘ │
│  ┌─────────────────┐ │
│  │ Volume: ./src    │ │  HMR via Turbopack
│  │ (read/write)     │ │
│  └─────────────────┘ │
│  ┌─────────────────┐ │
│  │ Git ≥2.13       │ │  Worktree support
│  │ Node 20.19      │ │
│  └─────────────────┘ │
└──────────────────────┘

Results → harness/results/run-*.json (structured, CLI-validated)
```

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| node-pty native compilation in Docker | High | Multi-stage build with gcc/python3 in builder stage |
| Playwright + Next.js HMR conflicts | Medium | Playwright connects to running server, doesn't manage it |
| Parallel tests corrupt shared state | High | Workspace isolation per runner + unique ports |
| Docker image size bloat | Medium | Standalone output + slim runtime stage (~100MB) |
| Agent timeout in E2E tests | Medium | Per-test `describe.timeout(120000)`, no global timeout |
| SSE connections leak in tests | Low | `afterEach` cleanup, browser context disposal |
| Responsive tests flaky on CI | Medium | Fixed viewports (not device emulation), screenshot baselines |

---

## User-Specified Additional Requirement

**Responsive viewport testing**: The harness MUST test the site at multiple viewport sizes (mobile, tablet, desktop). Playwright natively supports this via `page.setViewportSize()` and device descriptors. Each viewport can be a separate browser context running in parallel.

---

## Recommended Plan Structure

### Plan 1: "Full On Agentic Dev Mode" (This Plan — 067)
1. **Phase 1**: Dockerfile + docker-compose + justfile for dev container
2. **Phase 2**: Playwright integration + seed scripts + smoke tests
3. **Phase 3**: Responsive viewport tests + screenshot capture
4. **Phase 4**: Parallel browser contexts + test grouping
5. **Phase 5**: Structured JSON results + harness CLI
6. **Phase 6**: Workflow template integration (test suites as workflows)

### Plan 2: "Parallel CI Mode" (Future — separate plan ID)
- Proper built containers (not volume-mounted)
- Multiple instances on different ports
- Workflow-driven test orchestration
- Each test gets a work unit for tracking

### Separate Plan: "CI Build Docker" (Future — separate plan ID per user request)
- CI/CD optimized Docker build
- GitHub Actions integration
- Caching strategy for turbo + pnpm

---

## Source Attribution

| Subagent | Focus | Findings |
|----------|-------|----------|
| IA (agent-0) | Implementation archaeology | 10 findings: Docker gaps, standalone build, MCP, templates |
| DC (agent-1) | Dependency mapping | 10 findings: native deps, ports, filesystem, Node version |
| PS (agent-2) | Pattern & convention scout | 10 findings: justfile, sidecar, DI, fakes, SSE, errors |
| QT (agent-3) | Quality & testing | 10 findings: 310 tests, 0 browser E2E, 137 fakes, CI gaps |
| IC (agent-4) | Interface & contract analyst | 14 findings: 16+ API routes, 13+ actions, 150+ methods |
| DE (agent-5) | Documentation & history | 10 findings: exemplar testing, MCP strategy, ADRs |
| PL (agent-6) | Prior learnings scout | 15 findings: E2E isolation, parallel agents, hybrid model |
| DB (agent-7) | Domain & boundary scout | 8 findings: not a domain, 3 test clusters, adapter pattern |
