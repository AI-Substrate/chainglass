# First-Class Agentic Development Harness

**Mode**: Full

📚 This specification incorporates findings from [research-dossier.md](exploration.md), [Workshop 001](workshops/001-docker-container-setup.md), [Workshop 002](workshops/002-harness-folder-and-agentic-prompts.md), and [ADR-0014](../../adr/adr-0014-first-class-agentic-development-harness.md).

## Research Context

Eight parallel subagents explored the codebase. Key findings:
- **Strong foundations**: DI (137 fakes), MCP endpoint, workflow templates, CLI orchestration all production-ready
- **Critical gaps**: No Docker, no Playwright, 0 browser E2E tests, sequential-only test execution, no responsive testing
- **168 React components** with 31% unit coverage and 0% browser coverage
- Next.js standalone output already configured; terminal WebSocket sidecar on port 4500
- Auth bypass (`DISABLE_AUTH=true`) already exists for testing
- Prior learnings: harness tests MUST NOT run in `just fft` (PL-01), use `describe.skip` for slow tests (PL-02)

## Summary

The AI agents building Chainglass cannot see the running application. They make changes, run text-based tests, and hope the UI is correct. The **Agentic Development Harness** closes this gap: a Docker-containerized dev environment with Playwright browser automation, exposed via a rich SDK/CLI that returns structured JSON. The agent boots the app, browses it at any viewport, captures screenshots, runs tests — and iterates. **Harness-first development**: every feature ships with harness verification. The harness is the primary quality mechanism.

## Goals

- **Agent can see the site**: Boot a Docker container with the full Chainglass app, connect via CDP, browse pages, capture screenshots at any viewport
- **Rich SDK control plane**: All operations via typed CLI commands returning validated JSON — `harness dev`, `harness health`, `harness test`, `harness screenshot`. Agents parse structured output, not raw text
- **Responsive testing**: Verify layouts at desktop (1440px), tablet (768px), and mobile (375px) viewports
- **Fast iteration loop**: Volume-mounted source code with HMR — agent edits code on host, sees changes in container instantly without rebuild
- **Reproducible environment**: Same Docker image, same seed data, same results every time
- **Harness-first culture**: Every new feature considers harness coverage. Feature reviews ask "how does the harness test this?"
- **Server and browser observability**: Agent can read server logs, browser console, MCP errors, and Next.js diagnostics from the running container

## Non-Goals

- **Sub-agent orchestration / parallel dispatch**: Prompt templates, orchestrator patterns, and multi-agent coordination are out of scope. Will be discovered through usage and implemented as Chainglass work units / workflow nodes later
- **CI/CD Docker builds**: A separate future plan (distinct plan ID) will address CI-optimized containers, image caching, and GitHub Actions integration
- **Multiple parallel container instances**: Plan 2 ("Parallel CI Mode") will address spinning up N containers on different ports. This plan focuses on one container for one agent
- **Visual regression baselines**: Pixel-diff screenshot comparison (e.g., `toHaveScreenshot()`) is a future enhancement. Start with capture-only
- **Production deployment**: The harness container is dev-only — not a deployment artifact
- **Workflow template integration for tests**: Test suites as workflow nodes is a future pattern

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| (all domains) | existing | **consume** | All domains are test targets — harness verifies their browser-observable behavior |
| _platform/auth | existing | **consume** | Auth bypassed via DISABLE_AUTH=true in harness container |
| _platform/positional-graph | existing | **consume** | Future: workflow templates for test orchestration (OOS this plan) |

No new domains created. The harness is external tooling in `harness/` at repository root.

## Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=2, D=0, N=1, F=1, T=2 (Total P=8)
- **Confidence**: 0.75

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Surface Area (S) | 2 | Cross-cutting: new `harness/` folder, Dockerfile, compose, CLI, Playwright config, test suites, justfile integration |
| Integration (I) | 2 | Docker, Playwright/Chromium, CDP protocol, Next.js MCP, terminal WebSocket — multiple external integration points |
| Data/State (D) | 0 | No schema/migration — ephemeral container state, JSON result files |
| Novelty (N) | 1 | Docker + Playwright is well-understood, but integrating with this specific monorepo (node-pty, pnpm, turbopack) has unknowns |
| Non-Functional (F) | 1 | Container startup speed matters; Playwright memory usage; volume mount HMR performance |
| Testing (T) | 2 | The harness IS the testing system — meta-testing required (does the harness itself work?) |

**Assumptions**:
- OrbStack (Docker-compatible runtime) available on developer machines — 2-way bind mounts, native macOS virtualization, ~2s startup
- node-pty compiles in Debian-based Docker images (not Alpine)
- OrbStack bind mounts support native filesystem events — Turbopack HMR should work without polling
- Single Playwright Chromium instance handles 4-8 concurrent contexts

**Dependencies**:
- Docker Engine / Docker Desktop
- Playwright (new dependency — `@playwright/test`)
- Chromium browser binaries (installed by Playwright)

**Risks**:
- node-pty native compilation in Docker may require specific base image tuning
- Turbopack HMR over Docker bind mounts may need `WATCHPACK_POLLING=true`
- Container image size could bloat with Chromium (~400MB) — mitigate with multi-stage build

**Phases** (suggested):
1. Docker container (Dockerfile + compose + dev server running)
2. Playwright integration + CDP exposure + smoke tests
3. Harness CLI (structured JSON commands)
4. Seed scripts + feature test suites + responsive viewports

## Testing Strategy

- **Approach**: Full TDD
- **Rationale**: Everything the harness does is testable — Docker booting is an assertion, Playwright attaching is an assertion, screenshot capture producing a file is an assertion. Slow tests are fine for harness (they run outside `just fft`).
- **CLI/SDK**: TDD — JSON output schemas, error codes, health check parsing, seed script logic
- **Docker**: TDD — container starts, health endpoint responds, ports are open, dev server returns 200
- **Playwright/CDP**: TDD — browser connects via CDP, page loads, screenshot file is produced, viewport changes apply
- **Mock Usage**: No mocks. Real Docker, real Playwright, real browser. That's the whole point.
- **Gating**: Harness tests run via `just test-harness` (separate from `just fft`). Docker/Playwright tests use `describe.skip` — skippable integration tests, not CI blockers. Unskip locally to verify.

## Acceptance Criteria

### Boot & Lifecycle
- **AC-01**: `harness build` creates a Docker image containing Node 20.19, pnpm, git ≥2.13, and Playwright Chromium
- **AC-02**: `harness dev` starts the container, runs the Next.js dev server on port 3000 and terminal sidecar on port 4500, and waits for health check to pass
- **AC-03**: `harness stop` stops and removes the container cleanly
- **AC-04**: `harness health` returns structured JSON with status of app (3000), MCP endpoint, CDP (9222), and terminal sidecar (4500)

### Browser Automation
- **AC-05**: Agent can connect to `http://localhost:9222` (CDP) from outside the container and open pages
- **AC-06**: Agent can capture screenshots at desktop (1440x900), tablet (768x1024), and mobile (375x812) viewports via harness CLI
- **AC-07**: Multiple Playwright browser contexts can browse the site simultaneously within one Chromium instance

### HMR & Dev Loop
- **AC-08**: Source code changes on the host are reflected in the container within 5 seconds via HMR (no container rebuild)
- **AC-09**: Agent can read Next.js server logs from the container
- **AC-10**: Agent can read browser console output via CDP

### SDK / CLI
- **AC-11**: All harness CLI commands return structured JSON to stdout with consistent schema
- **AC-12**: Error conditions return JSON with error code (E100-E110 range) and human-readable message
- **AC-13**: `harness test --suite smoke` runs a minimal Playwright test suite and returns pass/fail JSON
- **AC-14**: `harness screenshot <name>` captures and saves a screenshot to `harness/results/`

### Seed & Test Data
- **AC-15**: `harness seed` creates a test workspace with at least one worktree, accessible in the running app
- **AC-16**: Seeded data is visible when browsing the app (workspace appears in sidebar, worktrees listed)

### Responsive Testing
- **AC-17**: `harness test --viewport mobile` runs tests at 375x812 viewport
- **AC-18**: `harness test --viewport tablet` runs tests at 768x1024 viewport
- **AC-19**: Responsive tests verify sidebar behavior changes between desktop and mobile viewports

### Isolation
- **AC-20**: `just fft` is unaffected by the harness — harness tests do not run as part of the standard quality gate
- **AC-21**: Harness container uses `DISABLE_AUTH=true` to bypass authentication

## Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| node-pty fails to compile in Docker | Medium | High | Use Debian-based image with build-essential; test early in Phase 1 |
| Turbopack HMR doesn't work over bind mounts | Low | Medium | OrbStack 2-way mounts support native fs events; add `WATCHPACK_POLLING=true` only if needed |
| Chromium bloats container image | Low | Medium | Multi-stage build; Chromium in runtime stage only |
| CDP port conflict with other tools | Low | Low | Make port configurable via env var |
| Playwright version drift breaks tests | Low | Medium | Pin Playwright version in harness/package.json |

**Assumptions**:
- Developer has OrbStack installed and running (Docker-compatible, preferred over Docker Desktop for macOS)
- Host machine has sufficient RAM for container + Chromium (~2GB)
- pnpm workspace symlinks resolve correctly inside Docker bind mount
- Auth bypass is sufficient for all test scenarios (no auth-specific tests needed in Plan 1)

## Open Questions

All resolved:

- **OQ-01**: ~~CLI placement~~ → **Standalone script in `harness/src/cli/`**. Decoupled from `apps/cli`, no DI dependency, runs without building the main CLI.
- **OQ-02**: ~~Seed script approach~~ → **HTTP API calls**. Portable — works from host or inside container, no package build dependency. Calls `POST /api/workspaces`, etc.
- **OQ-03**: ~~node_modules strategy~~ → **Named volume**. Docker manages `node_modules`; `pnpm install` runs inside container. Fast I/O, no cross-OS symlink issues. Agent runs `harness exec pnpm install` when deps change.

## Documentation Strategy

- **ADR-0014** already accepted — captures the "harness or bust" principle
- Update `CLAUDE.md` custom instructions with harness commands (`just test-harness`, `harness dev`, etc.)
- Add harness section to `scripts/scripts.md` index
- Update `justfile` with harness commands
- Generate `docs/project-rules/harness.md` (via `/harness-v2 --create`) after Docker is working — documents Boot/Interact/Observe capabilities

## Workshop Opportunities

All workshops already completed:

| Topic | Type | Status | Document |
|-------|------|--------|----------|
| Docker Container Setup | Integration Pattern | ✅ Complete | [001-docker-container-setup.md](workshops/001-docker-container-setup.md) |
| Harness Folder & CLI | Storage Design + CLI Flow | ✅ Complete | [002-harness-folder-and-agentic-prompts.md](workshops/002-harness-folder-and-agentic-prompts.md) |

No additional workshops needed before architecture.
