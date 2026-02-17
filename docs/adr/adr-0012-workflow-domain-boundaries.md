---
title: "ADR-0012: Workflow System Domain Boundaries"
status: "Accepted"
date: "2026-02-17"
authors: "Jordan Knight (Architect)"
tags: ["architecture", "decision", "orchestration", "workflow", "domain-boundaries", "cohesion"]
supersedes: ""
superseded_by: ""
---

# ADR-0012: Workflow System Domain Boundaries

## Status

Accepted

## Context

The workflow/orchestration system spans six feature areas built across Plans 026-036: graph structure, node events, orchestration logic, agent execution, pod containers, and CLI/web consumers. As the system grew, several near-misses occurred where concepts from one domain leaked into another:

- The `drive()` loop almost forwarded agent events (agent domain leaking into orchestration domain)
- The graph status view almost exposed question lifecycle details (event domain leaking into graph domain)
- `OrchestrationRequest` still contains `question-pending` and `resume-node` variants that were superseded by the event system (orchestration domain that should have been event domain)
- Execution tracking was nearly added to the outer loop, giving it knowledge of pods and agents

Each violation was caught and corrected, but the boundaries were never formally documented. Without explicit rules, future plans will repeat the same mistakes — especially as LLM agents contribute code that pattern-matches on nearby concerns without understanding domain intent.

The system's strength is that each component has one job and communicates only through well-defined contracts. Events on disk are the sole interface between the workflow engine and the outside world. This architectural property must be preserved.

## Decision

We establish six formal domains within the workflow system, each with defined ownership, allowed dependencies, and forbidden cross-references. The boundaries are documented in `docs/rules/workflow-domain-boundaries.md` (the authoritative reference) and enforced through import direction rules and the five-question litmus test.

The six domains are:

1. **Graph Domain** — structure, state, readiness gates, persistence. Records facts. Does not act.
2. **Event Domain** — raise, handle, stamp events. The nervous system and extension point. Carries signals between the workflow engine and the outside world. Higher-order features (Q&A, approvals) are expressed through events without modifying the engine.
3. **Orchestration Domain** — Reality snapshots, ONBAS (pure decisions), ODS (fire-and-forget launch), `run()` (single pass), `drive()` (persistent loop). The conductor.
4. **Agent Domain** — `IAgentInstance`, `IAgentManagerService`, adapters. Completely independent of workflows. One of several work unit types (alongside code and user-input).
5. **Pod Domain** — `AgentPod`, `CodePod`, `PodManager`, sessions, prompts. Execution containers that wrap workers.
6. **Consumer Domain** — CLI commands, web server, terminal output, SSE. Thin wrappers that translate system events for humans and scripts.

Key architectural properties enforced:
- **Agent events ≠ node events ≠ drive events ≠ domain events** — four separate event systems, never conflated
- **ONBAS is pure** — snapshot in, request out, zero side effects
- **ODS is fire-and-forget** — launch and return, never wait or monitor
- **`drive()` is agent-agnostic** — calls `run()`, checks result, delays, repeats
- **Events are the extension point** — new features plug in as event types + handlers, zero changes to orchestration code

## Consequences

**Positive**

- **POS-001**: Future plans have clear guidance on where new code belongs, reducing design ambiguity and review cycles
- **POS-002**: LLM agents working on the codebase can reference the domain map to avoid cross-boundary imports
- **POS-003**: The event extension point enables arbitrarily complex features (approvals, escalations, external integrations) without modifying ONBAS, ODS, or `drive()`
- **POS-004**: Each domain can be tested in isolation with fakes — high cohesion means focused test suites
- **POS-005**: The import direction rule makes boundary violations visible at compile time (wrong import → wrong direction)

**Negative**

- **NEG-001**: Developers must learn six domains before contributing — steeper onboarding curve
- **NEG-002**: Some features that span domains (e.g. agent event wiring for terminal output) require explicit coordination patterns rather than simple function calls
- **NEG-003**: The dead `resume-node` and `question-pending` OR variants remain as historical scars — removing them is a separate cleanup task
- **NEG-004**: Strict boundaries may feel over-engineered for small features, but the cost of boundary violations compounds as the system grows

## Alternatives Considered

### Monolithic Orchestration Service

- **ALT-001**: **Description**: A single `OrchestrationService` class that owns everything — events, decisions, execution, terminal output, session management. Simpler initial design.
- **ALT-002**: **Rejection Reason**: Violated single responsibility. Changes to event handling would require changes to orchestration logic. Terminal output concerns would leak into the decision engine. Already proven problematic in Workshop 08's original ODS design (blocking, 5-way post-execute switch).

### Event-Driven Architecture Throughout

- **ALT-003**: **Description**: All communication between components via events, including ONBAS→ODS and ODS→PodManager. Maximally decoupled.
- **ALT-004**: **Rejection Reason**: Over-engineered for single-process execution. ONBAS→ODS is a synchronous function call within one loop iteration — adding event indirection adds latency and complexity for zero benefit. Events are the right boundary for external communication (agents, humans); function calls are the right boundary for internal composition.

### Shared Context Object

- **ALT-005**: **Description**: A mutable context object passed through all components, accumulating state as it flows. Each component reads and writes what it needs.
- **ALT-006**: **Rejection Reason**: Destroys testability. Components become coupled to context shape. Impossible to fake one component without faking the context it mutates. The immutable reality snapshot is the correct alternative — built once, read by all, written by none.

## Implementation Notes

- **IMP-001**: The authoritative reference is `docs/rules/workflow-domain-boundaries.md` (symlinked from `docs/plans/036-cli-orchestration-driver/workshops/02-workflow-domain-boundaries.md`). This document contains the full domain map, dependency rules, violation examples, and litmus test.
- **IMP-002**: Enforcement is through code review and import direction analysis. No automated linting rule exists today — a future plan could add an ESLint rule that flags cross-boundary imports.
- **IMP-003**: Success is measured by zero boundary violations in future plans. Each plan's research phase should reference this ADR and the domain map during architecture.

## References

- **REF-001**: [Workflow Domain Boundaries Rules](../rules/workflow-domain-boundaries.md) — authoritative domain map, dependency rules, violation examples, litmus test
- **REF-002**: [Spec B: Prompts, CLI Driver, Execution Tracking](../plans/033-real-agent-pods/spec-b-prompts-and-cli-driver.md) — the spec that surfaced the boundary violations
- **REF-003**: [Plan 030: Positional Orchestrator](../plans/030-positional-orchestrator/positional-orchestrator-plan.md) — established ONBAS, ODS, Pods, Reality
- **REF-004**: [Plan 032: Node Event System](../plans/032-node-event-system/node-event-system-plan.md) — established event domain, Settle→Decide→Act
- **REF-005**: [ADR-0011: First-Class Domain Concepts](./adr-0011-first-class-domain-concepts.md) — related decision on when concepts deserve their own service
- **REF-006**: [Workshop 12: ODS Design](../plans/030-positional-orchestrator/workshops/12-ods-design.md) — fire-and-forget pattern, Workshop 08 mistakes documented
