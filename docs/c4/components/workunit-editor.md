# Component: Work Unit Editor (`058-workunit-editor`)

> **Domain Definition**: [058-workunit-editor/domain.md](../../domains/058-workunit-editor/domain.md)
> **Source**: `apps/web/src/features/058-workunit-editor/`
> **Registry**: [registry.md](../../domains/registry.md) — Row: Work Unit Editor

Visual editor for creating and editing work unit templates — the building blocks of workflows. Supports three unit types (agent prompts, code scripts, human input questions) with type-specific editors, I/O configuration, and auto-save. Provides a list view for browsing units and a creation modal for new units.

```mermaid
C4Component
    title Component diagram — Work Unit Editor (058-workunit-editor)

    Container_Boundary(wuEditor, "Work Unit Editor") {
        Component(listPage, "Unit List Page", "Server + Client Component", "Lists all work units<br/>with type badges, search,<br/>and create button")
        Component(editorPage, "Unit Editor Page", "Client Component", "Type-aware editor layout:<br/>header + type editor +<br/>I/O configuration panels")
        Component(agentEditor, "Agent Editor", "Client Component", "Agent prompt editing:<br/>system prompt, model selection,<br/>tool configuration")
        Component(codeEditor, "Code Editor", "Client Component", "Code script editing:<br/>CodeMirror with language<br/>detection and syntax highlighting")
        Component(inputEditor, "User Input Editor", "Client Component", "Human input questions:<br/>question text, input type,<br/>validation rules")
        Component(ioCard, "InputOutputCard", "Client Component", "I/O port configuration:<br/>name, type, description,<br/>add/remove ports")
        Component(createModal, "Creation Modal", "Client Component", "New unit creation:<br/>name, type selection,<br/>template starting point")
        Component(autoSave, "Auto-Save", "Hook", "Debounced auto-save on<br/>content change, status<br/>indicator in header")
        Component(actions, "workunit-actions", "Server Actions", "CRUD server actions:<br/>list, get, create, update,<br/>delete work units")
    }

    Rel(listPage, actions, "Fetches units via")
    Rel(listPage, createModal, "Opens for new unit")
    Rel(editorPage, agentEditor, "Renders for agent type")
    Rel(editorPage, codeEditor, "Renders for code type")
    Rel(editorPage, inputEditor, "Renders for input type")
    Rel(editorPage, ioCard, "Renders I/O config with")
    Rel(editorPage, autoSave, "Saves changes via")
    Rel(autoSave, actions, "Persists via server action")
    Rel(createModal, actions, "Creates unit via")
```

## Components

| Component | Type | Description |
|-----------|------|-------------|
| Unit List Page | Server + Client Component | Lists units with type badges, search, create button |
| Unit Editor Page | Client Component | Type-aware editor: header + type editor + I/O panels |
| Agent Editor | Client Component | Agent prompt, model selection, tool configuration |
| Code Editor | Client Component | CodeMirror with language detection |
| User Input Editor | Client Component | Question text, input type, validation rules |
| InputOutputCard | Client Component | I/O port configuration: name, type, description |
| Creation Modal | Client Component | New unit: name, type selection, template |
| Auto-Save | Hook | Debounced auto-save with status indicator |
| workunit-actions | Server Actions | CRUD: list, get, create, update, delete |

## External Dependencies

Depends on: _platform/positional-graph (IWorkUnitService), _platform/viewer (code display via viewer contracts), _platform/workspace-url (workspaceHref).
Consumed by: (leaf consumer — no downstream dependents).

---

## Navigation

- **Zoom Out**: [Web App Container](../containers/web-app.md) | [Container Overview](../containers/overview.md)
- **Domain**: [058-workunit-editor/domain.md](../../domains/058-workunit-editor/domain.md)
- **Hub**: [C4 Overview](../README.md)
