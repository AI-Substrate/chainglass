# Level 2 Detail: Web Application

> This diagram zooms INTO the Web Application container to show its domain components.
> For the container-level overview, see [overview.md](overview.md).

```mermaid
C4Component
    title Component diagram — Web Application (apps/web)

    Container_Boundary(web, "Web Application") {

        Boundary(infra, "Infrastructure Domains (_platform/)") {
            Component(fileOps, "File Operations", "IFileSystem, IPathResolver", "Filesystem abstraction layer")
            Component(wsUrl, "Workspace URL", "workspaceHref, paramsCaches", "URL state management")
            Component(viewer, "Viewer", "FileViewer, MarkdownViewer,<br/>DiffViewer, CodeBlock", "Rendering primitives for<br/>code, markdown, diffs")
            Component(events, "Events", "ICentralEventNotifier,<br/>useSSE, toast()", "Server-sent events +<br/>notification infrastructure")
            Component(panels, "Panel Layout", "PanelShell, ExplorerPanel,<br/>LeftPanel, MainPanel", "Three-panel UI compositor")
            Component(sdk, "SDK", "IUSDK, ICommandRegistry,<br/>IKeybindingService", "Command + keybinding<br/>registration framework")
            Component(settings, "Settings", "Settings Page,<br/>SettingControl", "User preference management")
            Component(posGraph, "Positional Graph", "IPositionalGraphService,<br/>IWorkUnitService", "Workflow graph engine +<br/>orchestration")
            Component(state, "State", "IStateService,<br/>useGlobalState", "Global state pub/sub<br/>via SSE transport")
            Component(devTools, "Dev Tools", "StateInspector", "State debugging panel")
            Component(themes, "Themes", "resolveFileIcon,<br/>resolveFolderIcon", "Manifest-driven icon<br/>theme resolution")
        }

        Boundary(biz, "Business Domains") {
            Component(fileBrowser, "File Browser", "Browser page, FileTree,<br/>FileViewerPanel", "Workspace file browsing,<br/>editing, diffing")
            Component(workflowUI, "Workflow UI", "Workflow editor, Canvas,<br/>Toolbox", "Visual workflow editor<br/>with drag-drop")
            Component(wuEditor, "Work Unit Editor", "Unit list, Editor page,<br/>Agent/Code editors", "CRUD interface for<br/>work unit definitions")
        }
    }

    Rel(fileBrowser, fileOps, "Reads files via")
    Rel(fileBrowser, viewer, "Renders with")
    Rel(fileBrowser, panels, "Lays out in")
    Rel(fileBrowser, events, "Subscribes to file changes")
    Rel(fileBrowser, wsUrl, "Builds URLs with")
    Rel(fileBrowser, sdk, "Registers commands")
    Rel(fileBrowser, state, "Subscribes worktree state")

    Rel(workflowUI, posGraph, "Reads graph from")
    Rel(workflowUI, fileOps, "Reads templates")
    Rel(workflowUI, events, "Subscribes SSE")
    Rel(workflowUI, state, "Subscribes execution state")
    Rel(workflowUI, sdk, "Registers commands")

    Rel(wuEditor, posGraph, "CRUD via")
    Rel(wuEditor, viewer, "Edits with CodeEditor")
    Rel(wuEditor, wsUrl, "Links via")

    Rel(viewer, fileOps, "Shiki reads files")
    Rel(panels, wsUrl, "Panel URL params")
    Rel(state, events, "SSE transport")
    Rel(posGraph, fileOps, "Reads definitions")
    Rel(posGraph, state, "Publishes orchestration")
    Rel(devTools, state, "Inspects state")
    Rel(settings, sdk, "Reads SDK settings")
    Rel(fileBrowser, themes, "resolveFileIcon,<br/>resolveFolderIcon")
```

## Domain Index

### Infrastructure Domains

| Domain | Key Contracts | Component Diagram |
|--------|--------------|-------------------|
| File Operations | IFileSystem, IPathResolver | [file-ops.md](../components/_platform/file-ops.md) |
| Workspace URL | workspaceHref, paramsCaches | [workspace-url.md](../components/_platform/workspace-url.md) |
| Viewer | FileViewer, MarkdownViewer, DiffViewer | [viewer.md](../components/_platform/viewer.md) |
| Events | ICentralEventNotifier, useSSE, toast() | [events.md](../components/_platform/events.md) |
| Panel Layout | PanelShell, ExplorerPanel, LeftPanel, MainPanel | [panel-layout.md](../components/_platform/panel-layout.md) |
| SDK | IUSDK, ICommandRegistry, IKeybindingService | [sdk.md](../components/_platform/sdk.md) |
| Settings | Settings Page, SettingControl | [settings.md](../components/_platform/settings.md) |
| Positional Graph | IPositionalGraphService, IWorkUnitService | [positional-graph.md](../components/_platform/positional-graph.md) |
| State | IStateService, useGlobalState | [state.md](../components/_platform/state.md) |
| Dev Tools | StateInspector, useStateChangeLog | [dev-tools.md](../components/_platform/dev-tools.md) |
| Themes | resolveFileIcon, resolveFolderIcon | [themes.md](../components/_platform/themes.md) |

### Business Domains

| Domain | Key Contracts | Component Diagram |
|--------|--------------|-------------------|
| File Browser | Browser page, FileTree, FileViewerPanel | [file-browser.md](../components/file-browser.md) |
| Workflow UI | Workflow editor, Canvas, Toolbox | [workflow-ui.md](../components/workflow-ui.md) |
| Work Unit Editor | Unit list, Editor page, Agent/Code editors | [workunit-editor.md](../components/workunit-editor.md) |

---

## Navigation

- **Zoom Out**: [Container Overview](overview.md) | [System Context](../system-context.md)
- **Zoom In**: Select a domain from the tables above to see its L3 component diagram
- **Hub**: [C4 Overview](../README.md)
