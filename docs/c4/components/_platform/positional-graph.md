# Component: Positional Graph (`_platform/positional-graph`)

> **Domain Definition**: [_platform/positional-graph/domain.md](../../../../domains/_platform/positional-graph/domain.md)
> **Source**: `packages/positional-graph/src/` + `packages/workflow/src/`
> **Registry**: [registry.md](../../../../domains/registry.md) — Row: Positional Graph

Core graph engine for the line-based workflow execution system. Owns graph structure (nodes, lines, positions), state persistence, node execution state machine, and the full orchestration stack. The orchestration flow runs: Reality (external events) → ONBAS (decision engine) → ODS (dispatch engine) → PodManager (execution). This is the most complex infrastructure domain.

```mermaid
C4Component
    title Component diagram — Positional Graph (_platform/positional-graph)

    Container_Boundary(posGraph, "Positional Graph") {
        Component(graphService, "PositionalGraphService", "Core Service", "Graph CRUD: create nodes,<br/>wire I/O, manage lines,<br/>persist state to filesystem")
        Component(iGraph, "IPositionalGraphService", "Interface", "Public contract: status,<br/>state, node/line ops,<br/>I/O wiring, Q&A protocol")
        Component(orchService, "OrchestrationService", "Factory Service", "Creates per-graph<br/>IGraphOrchestration handles<br/>for execution lifecycle")
        Component(iOrch, "IOrchestrationService", "Interface", "Factory contract:<br/>getOrchestration(graphId)")
        Component(graphOrch, "GraphOrchestration", "Engine", "Per-graph orchestration:<br/>settle → decide → act loop<br/>drives node state machine")
        Component(ods, "ODS", "Dispatch Engine", "Operational Dispatch System:<br/>routes decisions to actions,<br/>manages execution queue")
        Component(onbas, "ONBAS", "Decision Engine", "Operational Node-Based<br/>Autonomic System:<br/>evaluates node readiness")
        Component(podMgr, "PodManager", "Lifecycle Manager", "Pod lifecycle management:<br/>AgentPod, CodePod creation,<br/>monitoring, teardown")
        Component(eventHandler, "EventHandlerService", "Service", "Event routing +<br/>settle-phase processing,<br/>triggers orchestration cycle")
        Component(iEventHandler, "IEventHandlerService", "Interface", "Event routing contract:<br/>handle(event)")
        Component(templateService, "TemplateService", "Service", "Template CRUD: saveFrom,<br/>listWorkflows, instantiate,<br/>manages template registry")
        Component(iTemplate, "ITemplateService", "Interface", "Template contract:<br/>save, list, instantiate")
        Component(instanceService, "InstanceService", "Service", "Instance status queries:<br/>getStatus for running<br/>workflow instances")
        Component(iInstance, "IInstanceService", "Interface", "Instance contract:<br/>getStatus(instanceId)")
        Component(workUnitService, "WorkUnitService", "Service", "Work unit CRUD:<br/>create, read, update, delete<br/>unit definitions")
        Component(iWorkUnit, "IWorkUnitService", "Interface", "Work unit contract:<br/>CRUD operations")
    }

    Rel(graphService, iGraph, "Implements")
    Rel(orchService, iOrch, "Implements")
    Rel(orchService, graphOrch, "Creates instances of")
    Rel(graphOrch, onbas, "Decides readiness via")
    Rel(graphOrch, ods, "Dispatches actions via")
    Rel(ods, podMgr, "Executes via pods from")
    Rel(eventHandler, iEventHandler, "Implements")
    Rel(eventHandler, graphOrch, "Triggers orchestration cycle in")
    Rel(templateService, iTemplate, "Implements")
    Rel(templateService, graphService, "Creates graphs via")
    Rel(instanceService, iInstance, "Implements")
    Rel(instanceService, graphService, "Queries status from")
    Rel(workUnitService, iWorkUnit, "Implements")
```

## Components

| Component | Type | Description |
|-----------|------|-------------|
| IPositionalGraphService | Interface | Graph CRUD, status, state, node/line operations, I/O wiring, Q&A |
| PositionalGraphService | Core Service | Graph engine: create nodes, wire I/O, manage lines, persist state |
| IOrchestrationService | Interface | Factory for per-graph orchestration handles |
| OrchestrationService | Factory Service | Creates IGraphOrchestration instances per graph |
| GraphOrchestration | Engine | Per-graph settle→decide→act loop driving the node state machine |
| ONBAS | Decision Engine | Operational Node-Based Autonomic System — evaluates node readiness |
| ODS | Dispatch Engine | Operational Dispatch System — routes decisions to execution actions |
| PodManager | Lifecycle Manager | Pod lifecycle: AgentPod/CodePod creation, monitoring, teardown |
| IEventHandlerService | Interface | Event routing and settle-phase processing |
| EventHandlerService | Service | Routes events, triggers orchestration cycles |
| ITemplateService | Interface | Template CRUD: save, list, instantiate |
| TemplateService | Service | Template registry and instantiation from graph definitions |
| IInstanceService | Interface | Instance status queries |
| InstanceService | Service | Running workflow instance status |
| IWorkUnitService | Interface | Work unit CRUD operations |
| WorkUnitService | Service | Work unit definition management |

## Orchestration Flow

```
External Event → EventHandlerService → GraphOrchestration
                                            │
                                    ┌───────┴───────┐
                                    │   SETTLE      │ (wait for quiescence)
                                    │   DECIDE      │ (ONBAS evaluates readiness)
                                    │   ACT         │ (ODS dispatches to PodManager)
                                    └───────────────┘
```

## External Dependencies

Depends on: _platform/file-ops (IFileSystem, IPathResolver), _platform/state (publishes orchestration state), @chainglass/shared.
Consumed by: CLI (`cg wf`, `cg template`), workflow-ui, workunit-editor.

---

## Navigation

- **Zoom Out**: [Web App Container](../../containers/web-app.md) | [Container Overview](../../containers/overview.md)
- **Domain**: [_platform/positional-graph/domain.md](../../../../domains/_platform/positional-graph/domain.md)
- **Hub**: [C4 Overview](../../README.md)
