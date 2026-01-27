# ADR Index

Architecture Decision Records (ADRs) document significant architectural decisions made in the Chainglass project.

## Index

| ADR | Title | Date | Status | Supersedes | Superseded By |
|-----|-------|------|--------|------------|---------------|
| 0001 | [MCP Tool Design Patterns](./adr-0001-mcp-tool-design-patterns.md) | 2026-01-19 | Accepted | - | - |
| 0002 | [Exemplar-Driven Development](./adr-0002-exemplar-driven-development.md) | 2026-01-21 | Accepted | - | - |
| 0003 | [Configuration System Architecture](./adr-0003-configuration-system.md) | 2026-01-22 | Accepted | - | - | Includes Developer Reference Guide |
| 0004 | [Dependency Injection Container Architecture](./adr-0004-dependency-injection-container-architecture.md) | 2026-01-23 | Accepted | - | - |
| 0005 | [Next.js MCP Developer Experience Loop](./adr-0005-nextjs-mcp-developer-experience-loop.md) | 2026-01-25 | Accepted | - | - |
| 0006 | [CLI-Based Workflow Agent Orchestration Pattern](./adr-0006-cli-based-workflow-agent-orchestration.md) | 2026-01-26 | Accepted | - | - | **Exemplar for web system** |
| 0007 | [SSE Single-Channel Event Routing Pattern](./adr-0007-sse-single-channel-routing.md) | 2026-01-26 | Accepted | - | - | **Exemplar for multi-session SSE** |
| 0008 | [Workspace Split Storage Data Model](./adr-0008-workspace-split-storage-data-model.md) | 2026-01-27 | Accepted | - | - | Git-native per-worktree data architecture |

## ADR Format

Each ADR follows a standard structure:
- **Status**: Proposed → Accepted → (Deprecated/Superseded)
- **Context**: Problem statement and constraints
- **Decision**: Chosen solution and rationale
- **Consequences**: Positive and negative outcomes (coded POS-XXX, NEG-XXX)
- **Alternatives**: Considered options with rejection reasons (coded ALT-XXX)
- **Implementation Notes**: Key considerations (coded IMP-XXX)
- **References**: Links to specs, plans, and external docs (coded REF-XXX)

## Creating New ADRs

Use the `/plan-3a-adr` command to generate new ADRs from feature specifications.
