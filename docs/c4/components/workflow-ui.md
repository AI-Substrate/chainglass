# Component: Workflow UI (`workflow-ui`)

> **Domain Definition**: [workflow-ui/domain.md](../../../domains/workflow-ui/domain.md)
> **Source**: `apps/web/src/features/050-workflow-page/`
> **Registry**: [registry.md](../../../domains/registry.md) — Row: Workflow UI

Visual workflow editor for the positional graph system. Provides a drag-drop canvas for building workflows, a toolbox for adding work units, a properties panel for node configuration, Q&A modals for agent interaction, and SSE-based live updates during execution. Includes an undo/redo system and context flow visualization.

```mermaid
C4Component
    title Component diagram — Workflow UI (workflow-ui)

    Container_Boundary(workflowUI, "Workflow UI") {
        Component(editorPage, "Workflow Editor Page", "Server + Client Component", "Route: /workflows/[graph]<br/>Orchestrates canvas + toolbox +<br/>properties + SSE subscription")
        Component(listPage, "Workflow List Page", "Server Component", "Lists available workflows<br/>with status indicators")
        Component(canvas, "WorkflowCanvas", "Client Component", "Line/node rendering with<br/>drop zones, grid background,<br/>transition gates between lines")
        Component(line, "WorkflowLine", "Client Component", "Renders a single workflow line<br/>with positioned node cards<br/>and connection indicators")
        Component(nodeCard, "WorkflowNodeCard", "Client Component", "Individual node display:<br/>status, type icon, name,<br/>click to select")
        Component(toolbox, "WorkUnitToolbox", "Client Component", "Right sidebar: work unit<br/>catalog with drag-to-add,<br/>grouped by category")
        Component(properties, "NodePropertiesPanel", "Client Component", "Right panel: node detail,<br/>I/O wiring, available sources,<br/>related nodes computation")
        Component(qaModal, "QAModal", "Client Component", "4 question types + freeform:<br/>text, select, confirm, file<br/>with answer submission")
        Component(undoRedo, "UndoRedoManager", "Client Module", "Snapshot-based undo/redo<br/>50-item stack via<br/>structuredClone")
        Component(sse, "useWorkflowSSE", "Hook", "Real-time graph updates<br/>via WorkflowWatcherAdapter →<br/>SSE subscription")
        Component(mutationLock, "Mutation Lock", "Client Module", "Prevents concurrent edits<br/>during SSE-driven updates")
        Component(contextFlow, "Context Flow Indicators", "Client Components", "PCB trace visualization +<br/>badges showing data flow<br/>between nodes")
        Component(doping, "Doping System", "Utility", "Demo workflow generation<br/>for testing and showcasing<br/>workflow capabilities")
    }

    Rel(editorPage, canvas, "Renders main area with")
    Rel(editorPage, toolbox, "Renders right sidebar with")
    Rel(editorPage, properties, "Renders detail panel with")
    Rel(editorPage, sse, "Subscribes to updates via")
    Rel(editorPage, undoRedo, "Tracks changes with")
    Rel(canvas, line, "Renders lines with")
    Rel(line, nodeCard, "Renders nodes with")
    Rel(nodeCard, contextFlow, "Shows data flow via")
    Rel(editorPage, qaModal, "Opens for agent questions")
    Rel(sse, mutationLock, "Acquires lock during updates")
```

## Components

| Component | Type | Description |
|-----------|------|-------------|
| Workflow Editor Page | Server + Client Component | Main editor orchestrating canvas + toolbox + properties + SSE |
| Workflow List Page | Server Component | Lists workflows with status indicators |
| WorkflowCanvas | Client Component | Line/node rendering with drop zones and grid |
| WorkflowLine | Client Component | Single line with positioned node cards |
| WorkflowNodeCard | Client Component | Individual node: status, type, name |
| WorkUnitToolbox | Client Component | Right sidebar work unit catalog with drag-to-add |
| NodePropertiesPanel | Client Component | Node detail, I/O wiring, available sources |
| QAModal | Client Component | 4 question types + freeform with answer submission |
| UndoRedoManager | Client Module | Snapshot undo/redo (50-item structuredClone stack) |
| useWorkflowSSE | Hook | Real-time updates via SSE subscription |
| Mutation Lock | Client Module | Prevents concurrent edits during SSE updates |
| Context Flow Indicators | Client Components | PCB trace + badges showing data flow |
| Doping System | Utility | Demo workflow generation for testing |

## External Dependencies

Depends on: _platform/positional-graph (IPositionalGraphService, IWorkUnitService, ITemplateService), _platform/events (useSSE), _platform/workspace-url (workspaceHref), _platform/sdk (IUSDK), _platform/state (useGlobalState).
Consumed by: (leaf consumer — no downstream dependents).

---

## Navigation

- **Zoom Out**: [Web App Container](../containers/web-app.md) | [Container Overview](../containers/overview.md)
- **Domain**: [workflow-ui/domain.md](../../../domains/workflow-ui/domain.md)
- **Hub**: [C4 Overview](../README.md)
