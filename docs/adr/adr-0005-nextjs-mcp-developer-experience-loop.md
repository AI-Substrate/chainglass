---
title: "ADR-0005: Next.js MCP Developer Experience Loop"
status: "Accepted"
date: "2026-01-25"
authors: "Development Team"
tags: ["architecture", "decision", "mcp", "developer-experience", "ai-agents", "nextjs", "tooling"]
supersedes: ""
superseded_by: ""
---

# ADR-0005: Next.js MCP Developer Experience Loop

## Status

Accepted

## Context

The Chainglass project relies heavily on AI coding agents (Claude Code, GitHub Copilot CLI) for development acceleration. Prior to Next.js 16, AI-assisted development suffered from **context starvation**:

1. Developers manually copied error messages from terminal to agent chat
2. Project structure required repeated explanation each session
3. Agents generated generic code that didn't match project patterns
4. No way for agents to verify their own changes worked
5. Route discovery, build status, and runtime errors were invisible to agents

This created friction across five dimensions: error discovery, documentation access, project understanding, pattern matching, and verification. Research showed AI accuracy dropped from 85% to 42% when agents lacked structured access to live application state.

Next.js 16 introduces built-in MCP (Model Context Protocol) support at `/_next/mcp`, exposing real-time application state to AI agents. This architectural decision documents how we leverage MCP to transform AI coding from "stateless question-answering" to "contextual pair programming."

**Constraints from project doctrine:**
- MCP tools must follow ADR-0001 patterns (STDIO protocol discipline, tool annotations)
- Fakes over mocks principle applies to testing agent workflows
- Fast feedback loops (<2 seconds) must be preserved
- Multi-tool support required (Claude Code, Copilot CLI)

## Decision

We adopt a **multi-layered MCP integration strategy** for developer experience:

### Layer 1: Next.js MCP Endpoint (`/_next/mcp`)

The Next.js dev server automatically exposes MCP at `/_next/mcp` providing:
- `get_routes` - Live application route discovery
- `get_errors` - Current build and runtime errors with source-mapped stack traces
- `get_page_metadata` - Component composition for current browser page
- `get_project_metadata` - Project configuration and environment
- `get_logs` - Development log file access
- `get_server_action_by_id` - Server Action location by ID

### Layer 2: MCP Server Configuration (`.mcp.json`)

Project-scoped MCP configuration enables consistent tooling:
```json
{
  "mcpServers": {
    "next-devtools": {
      "command": "npx",
      "args": ["-y", "next-devtools-mcp@latest"]
    }
  }
}
```

### Layer 3: Project Rules (`CLAUDE.md`)

Comprehensive project context for AI agents covering:
- Framework conventions (Server Components default, when to use client)
- Routing patterns (async params, App Router only)
- Testing approach (Vitest, lightweight, fakes over mocks)
- Critical patterns (Shiki server-side isolation, error handling)
- Architecture constraints (dependency injection, clean architecture)

### Layer 4: Interactive Demo (`/demo/mcp`)

Human-readable interface for exploring MCP capabilities:
- Interactive tool buttons for all MCP endpoints
- JSON response visualization
- CLI examples for manual testing
- Documentation on how AI agents use MCP

### Layer 5: Workflow Documentation

Documented core workflows in `docs/how/nextjs-mcp-llm-agent-guide.md`:
- Error Diagnosis Workflow: Agent queries `get_errors`, understands context, suggests fix
- Route Validation Workflow: Agent queries `get_routes` to verify changes
- Page Composition Analysis: Agent queries `get_page_metadata` to understand component hierarchy

## Consequences

### Positive

- **POS-001**: Real-time visibility into application state eliminates manual context gathering. Agents can query routes, errors, and metadata without developer mediation.

- **POS-002**: Pattern-aware code generation improves quality. Agents read project conventions from CLAUDE.md and generate code matching existing patterns rather than generic solutions.

- **POS-003**: Autonomous change validation enables agents to verify their own work. After adding a route, agent can call `get_routes` to confirm it exists. After fixing an error, agent calls `get_errors` to verify resolution.

- **POS-004**: Session-level context persistence transforms workflow from repeated explanation to continuous collaboration. Agents maintain understanding across multiple interactions.

- **POS-005**: Multi-tool compatibility via standard MCP protocol. Both Claude Code and Copilot CLI work with same configuration, enabling team member choice without fragmentation.

- **POS-006**: Fast feedback loops preserved. MCP queries complete in milliseconds, no impact on <2 second test target.

- **POS-007**: Future-proof architecture. MCP is an open standard with growing ecosystem support. Additional MCP servers (database, GitHub, etc.) can be composed.

### Negative

- **NEG-001**: Tool dependency introduced. Effective AI-assisted development now requires running dev server with MCP support. Agents have degraded capability without live server.

- **NEG-002**: Learning curve for contributors. New team members must understand MCP concepts, tool configuration, and workflow patterns before achieving optimal productivity.

- **NEG-003**: Maintenance overhead for documentation. CLAUDE.md and workflow guide require updates when project conventions change significantly.

- **NEG-004**: Node.js 20.19+ hard requirement. Next.js 16 MCP support mandates modern Node.js, potentially blocking developers on older systems.

- **NEG-005**: Browser session dependency for page metadata. `get_page_metadata` only returns data when browser is connected and viewing a page. Headless workflows miss this context.

- **NEG-006**: MCP protocol versioning. Future MCP specification changes could require configuration updates across all AI tools.

## Alternatives Considered

### Traditional Console Logging + Manual File Watching

- **ALT-001**: **Description**: Developers copy terminal output and paste to agents. No automated state access. File changes require manual rebuild notification.
- **ALT-002**: **Rejection Reason**: Creates massive context-gathering friction (50-70% of agent time on context, not problem-solving). No verification capability. Error messages become stale. Violates project principle of fast feedback loops.

### Custom Dev Server Endpoints (Non-MCP)

- **ALT-003**: **Description**: Implement custom REST endpoints (`GET /_dev/errors`, `GET /_dev/routes`) without MCP protocol. Agents query via HTTP.
- **ALT-004**: **Rejection Reason**: Not standardized across tools (each AI client needs custom integration). No tool discovery. Every request requires manual approval. Fragile endpoint contracts. Violates ADR-0001 principle of codified patterns preventing divergence.

### IDE-Integrated Debugging Only

- **ALT-005**: **Description**: Rely on VS Code debugger and Chrome DevTools. Developer inspects state and describes findings to agent.
- **ALT-006**: **Rejection Reason**: Requires constant human interpretation. Agents cannot trigger inspections. Asynchronous feedback loops slow iteration. Information loss in human-to-agent translation. Doesn't scale for rapid development.

### External Monitoring Tools (Sentry, LogRocket)

- **ALT-007**: **Description**: Integrate third-party error tracking via MCP server. Agents query Sentry API for errors, session replays.
- **ALT-008**: **Rejection Reason**: Designed for production post-mortem, not development-time feedback. Adds cost, privacy concerns, infrastructure overhead. Cannot inspect uncommitted code or live routes. Latency unacceptable for fast feedback loops.

### Static Analysis Only (No Runtime Feedback)

- **ALT-009**: **Description**: Pure TypeScript/ESLint analysis. Infer routes from file structure. No running dev server required.
- **ALT-010**: **Rejection Reason**: Cannot detect runtime errors (hydration, state, event handlers). Misses dynamic behavior. Cannot answer "What errors exist now?" or "Does my component render?" Useless for debugging runtime failures.

## Implementation Notes

- **IMP-001**: MCP endpoint is available automatically when dev server runs (`pnpm dev`). No configuration required beyond Next.js 16 upgrade.

- **IMP-002**: CLAUDE.md serves as single source of truth for project conventions. Update when adding new patterns or changing architectural decisions.

- **IMP-003**: `/demo/mcp` page provides human-readable MCP exploration. Use for debugging agent connectivity or demonstrating capabilities to new team members.

- **IMP-004**: Workflow guide documents principles, not just commands. When tools evolve, examples may change but principles remain stable.

- **IMP-005**: Success criteria: Agents can diagnose errors, validate routes, and generate pattern-compliant code without human explanation of project structure.

## References

- **REF-001**: [Spec](../plans/009-nextjs-upgrade/nextjs-upgrade-spec.md)
- **REF-002**: [Plan](../plans/009-nextjs-upgrade/nextjs-upgrade-plan.md)
- **REF-003**: [ADR-0001: MCP Tool Design Patterns](./adr-0001-mcp-tool-design-patterns.md)
- **REF-004**: [Next.js MCP LLM Agent Guide](../how/nextjs-mcp-llm-agent-guide.md)
- **REF-005**: [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- **REF-006**: [Next.js 16 Release Notes](https://nextjs.org/blog/next-16)
