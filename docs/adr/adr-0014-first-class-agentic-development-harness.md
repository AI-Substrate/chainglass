---
title: "ADR-0014: First-Class Agentic Development Harness"
status: "Accepted"
date: "2026-03-07"
authors: "Jordan Knight (Lead), AI Agent (Copilot CLI)"
tags: ["architecture", "testing", "docker", "playwright", "harness", "agentic"]
domains: ["none"]
supersedes: ""
superseded_by: ""
---

# ADR-0014: First-Class Agentic Development Harness

## Status

Accepted

## Context

Chainglass has 4984 unit/integration tests but zero browser-based end-to-end tests. 168 React components have 31% unit test coverage and 0% browser coverage. The AI agents building this application (via Copilot CLI) cannot see the running site, cannot verify their visual changes, and cannot catch UI regressions.

Current development relies on the agent making changes, running `just fft` (lint + test), and hoping the UI is correct. This is flying blind — the agent can verify logic but not experience. A human must manually check every visual change.

The harness is not optional infrastructure — it is the **primary quality mechanism** for agentic development. Without it, AI agents are limited to text-based reasoning about visual systems. With it, agents can iterate on UI the same way they iterate on logic: change → observe → fix → verify.

Constraints:
- Must work from the existing Copilot CLI agent (no special tooling)
- Must produce structured, validated output (agents can't be trusted with freeform formats)
- Must support responsive testing (mobile, tablet, desktop viewports)
- Must not slow down `just fft` — harness tests are separate, opt-in
- Must support volume-mounted source code for HMR (dev mode, not CI rebuild)
- Future: must not preclude parallel container instances (Plan 2)

## Decision

Establish the **Agentic Development Harness** as a first-class, permanent subsystem of the Chainglass project. The harness lives at `harness/` in the repository root and provides a rich SDK/CLI that agents use to boot, observe, and test the running application inside a Docker container with Playwright browser automation.

**Core principles**:

1. **Harness-first development**: Every new feature, every UI change, every domain addition MUST consider harness impact. If functionality cannot be verified by the harness, it is incomplete. The harness is not an afterthought — it ships with the feature.

2. **SDK-first control plane**: All harness operations go through a typed CLI that returns validated JSON. Agents call `harness health`, `harness test`, `harness screenshot` — not raw docker/curl/playwright commands. The SDK makes operations repeatable, parseable, and error-coded.

3. **Single container, single browser**: One Docker container runs the full app (Next.js dev server + terminal sidecar). One Playwright Chromium instance with multiple browser contexts provides isolated parallel page sessions. CDP port 9222 exposed for host-side agent connection.

4. **External tooling, not a domain**: The harness consumes domain contracts but exports none. It is test infrastructure, not business capability. Lives in `harness/`, not in `packages/` or `apps/`.

5. **Feature completeness includes harness coverage**: A feature is not "done" until the harness can verify it. Plan reviews should ask: "How does the harness test this?"

## Domain Impact

### Affected Domains

| Domain | Relationship | Impact Summary |
|--------|-------------|----------------|
| (all domains) | consume | Harness tests all domains through their browser-observable behavior |
| _platform/auth | consume | Auth bypassed via DISABLE_AUTH=true in harness container |
| _platform/positional-graph | consume | Workflow templates used for test orchestration (future) |

### Contract Changes

No contract changes — the harness is a pure consumer of existing domain contracts. It interacts through the web UI and public API routes, never through internal service interfaces.

### Topology Changes

No topology changes — the harness sits outside the domain map as external tooling. No new domain-to-domain edges are created.

### Domain Map Update Required

**No**. The harness is external infrastructure. If it later grows into a domain (`_platform/harness`), a new ADR and domain extraction would be needed.

## Consequences

**Positive**

- **POS-001**: Agents can see and verify their UI changes — closing the observe gap in the agentic development loop (Boot → Interact → **Observe**)
- **POS-002**: Responsive testing catches layout breakage across mobile/tablet/desktop before humans ever see it
- **POS-003**: Structured JSON results make test outcomes machine-parseable — agents can programmatically reason about failures and fix them
- **POS-004**: Docker containerization makes the dev environment reproducible — no more "works on my machine"
- **POS-005**: CDP exposure enables ad-hoc agent browsing during development, not just structured test runs
- **POS-006**: Cultural shift — "harness or bust" means quality is built in, not bolted on

**Negative**

- **NEG-001**: Docker adds complexity — image builds, volume mount gotchas, native compilation (node-pty) in containers
- **NEG-002**: Playwright browser tests are inherently slower than unit tests — harness runs measured in minutes, not seconds
- **NEG-003**: Maintenance burden — harness tests must evolve with the UI; stale tests become false negatives
- **NEG-004**: Docker Desktop required on developer machines — additional system dependency
- **NEG-005**: Risk of harness tests becoming a bottleneck if not kept fast and focused

## Alternatives Considered

### Alternative 1: Browser automation without Docker

- **ALT-001**: **Description**: Run Playwright directly against `pnpm dev` on the host machine, no containerization. Agent starts dev server, runs Playwright tests locally.
- **ALT-002**: **Rejection Reason**: Not reproducible across environments. Host-specific Node versions, OS differences, port conflicts. Cannot support parallel instances (Plan 2). Volume mount strategy not needed but also loses isolation benefits.
- **ALT-003**: **Domain Impact**: Same — pure consumer. But without Docker, seeding and teardown are harder (no ephemeral filesystem).

### Alternative 2: Screenshot diffing service (external)

- **ALT-004**: **Description**: Use an external visual regression service (Percy, Chromatic) to capture and diff screenshots. No local Docker or Playwright.
- **ALT-005**: **Rejection Reason**: External dependency, cost, latency. Agent can't iterate in real-time — must push, wait for CI, read results. Breaks the fast feedback loop. Doesn't support ad-hoc agent browsing.
- **ALT-006**: **Domain Impact**: None — purely external. But loses the "agent can see the site" capability.

### Alternative 3: Extend existing vitest with jsdom browser simulation

- **ALT-007**: **Description**: Use vitest + jsdom (already configured) to render components and assert DOM state. No real browser.
- **ALT-008**: **Rejection Reason**: jsdom cannot render CSS, execute Tailwind, show responsive layouts, or capture screenshots. It tests component logic, not visual experience. The agent needs to *see* the page, not just assert DOM nodes exist.
- **ALT-009**: **Domain Impact**: None — stays within existing test infrastructure.

## Implementation Notes

- **IMP-001**: Harness infrastructure lives in `harness/` at repo root — Dockerfile, docker-compose.yml, justfile, playwright.config.ts, CLI source, test suites
- **IMP-002**: All harness CLI commands return structured JSON to stdout, human messages to stderr. Error codes E100-E110 reserved for harness
- **IMP-003**: `just fft` is unaffected — harness tests run via `just test-harness` or `harness test` (separate, opt-in)
- **IMP-004**: Feature planning template should include "Harness Coverage" section asking: what harness tests verify this feature? At what viewports?
- **IMP-005**: Plan reviews (code review phase) should verify harness coverage for UI-visible changes
- **IMP-006**: Workshop documents in `docs/plans/067-harness/workshops/` detail Docker setup (001) and folder/CLI design (002)

## References

- **REF-001**: [Exploration Dossier](../plans/067-harness/exploration.md) — 8-subagent research synthesis
- **REF-002**: [Workshop 001: Docker Container Setup](../plans/067-harness/workshops/001-docker-container-setup.md)
- **REF-003**: [Workshop 002: Harness Folder & CLI](../plans/067-harness/workshops/002-harness-folder-and-agentic-prompts.md)
- **REF-004**: [ADR-0005: Next.js MCP Developer Experience Loop](./adr-0005-nextjs-mcp-developer-experience-loop.md) — MCP integration the harness consumes
- **REF-005**: [ADR-0006: CLI-Based Workflow Agent Orchestration](./adr-0006-cli-based-workflow-agent-orchestration.md) — Agent orchestration patterns
- **REF-006**: [ADR-0002: Exemplar-Driven Development](./adr-0002-exemplar-driven-development.md) — Testing philosophy the harness extends
