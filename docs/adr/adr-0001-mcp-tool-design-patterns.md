---
title: "ADR-0001: MCP Tool Design Patterns"
status: "Accepted"
date: "2026-01-19"
authors: "Chainglass Team"
tags: ["architecture", "decision", "mcp", "tools", "agents"]
supersedes: ""
superseded_by: ""
---

# ADR-0001: MCP Tool Design Patterns

## Status

**Accepted**

## Context

Chainglass exposes functionality through MCP (Model Context Protocol) tools consumed by AI coding agents. Traditional API design principles optimized for human developers fail when the primary consumer is an AI agent, creating friction in three critical dimensions: tool selection (will the agent choose correctly?), invocation (will the agent call it correctly?), and utilization (will the agent interpret results correctly?).

Key research findings drive the need for explicit design patterns:

- Agent accuracy drops from 85% to 42% when tool count increases from 25 to 48 (tool overload problem)
- Descriptions of 3-4 sentences significantly outperform 1-sentence descriptions
- Explicit JSON Schema constraints outperform natural language descriptions of constraints
- Semantic response fields dramatically improve downstream agent reasoning
- STDIO transport requires strict protocol compliance: stdout is reserved exclusively for JSON-RPC messages

Without codified patterns, tool implementations will diverge, creating inconsistent agent experiences and increasing integration friction.

## Decision

We adopt a comprehensive MCP tool design standard that mandates:

1. **STDIO Protocol Compliance**: All logging redirected to stderr before any imports; stdout reserved exclusively for JSON-RPC
2. **Naming Convention**: `verb_object` format using snake_case with standard action verbs (get, list, search, create, update, delete, check, validate, analyze)
3. **Description Structure**: 3-4 sentences covering action, context/scope, return values, and alternatives
4. **Parameter Design**: Strong JSON Schema typing with explicit constraints (`enum`, `minimum`/`maximum`, `pattern`) rather than natural language descriptions
5. **Response Design**: Semantic fields over technical IDs, mandatory `summary` field, structured envelope pattern for collections
6. **Error Handling**: Translated errors with actionable `action` field for agent remediation
7. **Annotations**: Complete MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`)
8. **Testing**: Three-level strategy (Unit → Integration → E2E with subprocess/STDIO)

All Chainglass MCP tools MUST follow the `check_health` exemplar pattern.

## Consequences

### Positive

- **POS-001**: Consistent tool interface improves agent accuracy by providing predictable patterns for selection, invocation, and utilization
- **POS-002**: Explicit JSON Schema constraints reduce invocation errors compared to natural language descriptions
- **POS-003**: Semantic response fields with summaries enable agents to reason about results without complex parsing
- **POS-004**: Actionable error responses with `action` field enable autonomous agent recovery without human intervention
- **POS-005**: STDIO compliance ensures reliable agent integration without protocol corruption
- **POS-006**: Three-level testing strategy catches issues at appropriate abstraction levels before production

### Negative

- **NEG-001**: Higher implementation overhead per tool compared to raw API exposure (estimated 2x initial development time)
- **NEG-002**: Deviation from familiar REST/RPC patterns requires developer education and onboarding
- **NEG-003**: Semantic response design may require denormalization of data that's normalized in underlying systems
- **NEG-004**: Enforcing STDIO compliance requires discipline at entry point initialization before any imports
- **NEG-005**: Tool curation pressure may conflict with feature requests to expose additional functionality

## Alternatives Considered

### Alternative 1: Direct API-to-MCP Translation

- **ALT-001**: **Description**: Expose existing REST/GraphQL endpoints directly as MCP tools with minimal transformation
- **ALT-002**: **Rejection Reason**: Human-optimized APIs fail as agent tools; multi-step workflows require coordination that agents perform poorly; technical responses lack semantic context for reasoning

### Alternative 2: camelCase Naming Convention

- **ALT-003**: **Description**: Use JavaScript/TypeScript idiomatic camelCase (`checkHealth`, `searchTickets`)
- **ALT-004**: **Rejection Reason**: MCP specification examples and ecosystem tools predominantly use snake_case; consistency with ecosystem reduces cognitive load for agents trained on MCP examples

### Alternative 3: Flat Response Objects Without Envelopes

- **ALT-005**: **Description**: Return results directly without metadata wrapper (`{"results": [...]}` only)
- **ALT-006**: **Rejection Reason**: Agents cannot determine if more results exist for pagination; lack of metadata prevents intelligent result handling; envelope pattern with `meta.total` and `meta.showing` enables autonomous pagination decisions

### Alternative 4: Natural Language Constraints in Descriptions

- **ALT-007**: **Description**: Document parameter constraints in description text rather than JSON Schema
- **ALT-008**: **Rejection Reason**: Research shows explicit JSON Schema constraints outperform natural language; schema-level validation prevents invalid invocations; agents process structured constraints more reliably than prose

### Alternative 5: Raw Exception Propagation

- **ALT-009**: **Description**: Allow domain exceptions to bubble up as-is to agent consumers
- **ALT-010**: **Rejection Reason**: Technical error codes (`ENOENT`, stack traces) provide no remediation guidance; agents cannot recover without actionable `action` field; error boundary translation is essential for autonomous operation

## Implementation Notes

- **IMP-001**: STDIO compliance must be configured BEFORE any imports in the entry point (`cg mcp` command); redirecting console methods after import allows module-level side effects to pollute stdout
- **IMP-002**: The `check_health` tool serves as the exemplar implementation; all new tools should reference its pattern and this ADR before implementation
- **IMP-003**: Tool PRs must include evidence of all three test levels (unit, integration, E2E) to be approved
- **IMP-004**: Monitor agent success rates per tool using MCP server logging; tools with <80% success rate require design review
- **IMP-005**: Tool count should remain under 25 total; above this threshold, implement tool search/filtering mechanisms

## References

- **REF-001**: [Spec](../plans/001-project-setup/project-setup-spec.md)
- **REF-002**: [Plan](../plans/001-project-setup/project-setup-plan.md)
- **REF-003**: [Anthropic: Writing Tools for Agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- **REF-004**: [Anthropic: Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use)
- **REF-005**: [MCP Specification: Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- **REF-006**: [Why Human APIs Fail as MCP Tools](https://tessl.io/blog/why-human-apis-fail-as-mcp-tools-and-how-to-fix-them/)
- **REF-007**: [Solving the MCP Tool Overload Problem](https://redis.io/blog/from-reasoning-to-retrieval-solving-the-mcp-tool-overload-problem/)
