# Domain Map

> Auto-maintained by plan commands. Shows all domains and their contract relationships.
> Domains are first-class components — this diagram is the system architecture at business level.

```mermaid
flowchart LR
    classDef business fill:#E3F2FD,stroke:#2196F3,color:#000
    classDef infra fill:#F3E5F5,stroke:#9C27B0,color:#000
    classDef deprecated fill:#FFEBEE,stroke:#F44336,color:#000

    %% Infrastructure domains
    fileOps["⚙️ _platform/file-ops<br/>IFileSystem · IPathResolver"]:::infra
    wsUrl["🔗 _platform/workspace-url<br/>workspaceHref · paramsCaches"]:::infra
    viewer["🖥️ _platform/viewer<br/>FileViewer · MarkdownViewer<br/>DiffViewer · highlightCode<br/>detectContentType"]:::infra
    events["🔔 _platform/events<br/>ICentralEventNotifier<br/>ISSEBroadcaster · useSSE<br/>FileChangeHub · useFileChanges<br/>toast() · Toaster"]:::infra
    panels["🗂️ _platform/panel-layout<br/>PanelShell · ExplorerPanel<br/>LeftPanel · MainPanel<br/>PanelHeader · BarHandler<br/>AsciiSpinner<br/>FlowSpace types"]:::infra
    sdk["🧩 _platform/sdk<br/>IUSDK · ICommandRegistry<br/>ISDKSettings · IContextKeyService<br/>IKeybindingService<br/>SDKCommand · SDKSetting"]:::infra
    settings["⚙️ _platform/settings<br/>Settings Page<br/>SettingControl · SettingsSearch"]:::infra
    posGraph["📊 _platform/positional-graph<br/>IPositionalGraphService<br/>IOrchestrationService<br/>IEventHandlerService<br/>IWorkUnitService<br/>ITemplateService<br/>IInstanceService"]:::infra
    state["💾 _platform/state<br/>IStateService<br/>useGlobalState<br/>useGlobalStateList<br/>GlobalStateProvider<br/>StateChangeLog"]:::infra
    devTools["🛠️ _platform/dev-tools<br/>StateInspector<br/>useStateInspector<br/>useStateChangeLog"]:::infra

    %% Business domains
    fileBrowser["📁 file-browser<br/>Browser page · FileTree<br/>CodeEditor re-export<br/>FileViewerPanel<br/>WorkspaceContext · Settings"]:::business
    workflowUI["🔀 workflow-ui<br/>Workflow editor · Canvas<br/>Toolbox · Properties<br/>Doping system"]:::business
    workunitEditor["✏️ 058-workunit-editor<br/>Unit list page · Editor page<br/>Agent/Code/Input editors<br/>Creation modal · Auto-save"]:::business
    terminal["🖥️ terminal<br/>TerminalView · TerminalOverlay<br/>TmuxSessionManager · copyTmuxBuffer<br/>Sidecar WS/WSS Server"]:::business

    %% Contract dependencies (consumer → provider)
    fileBrowser -->|"IFileSystem<br/>IPathResolver"| fileOps
    fileBrowser -->|"workspaceHref<br/>fileBrowserParams"| wsUrl
    fileBrowser -->|"FileViewer<br/>MarkdownViewer<br/>DiffViewer<br/>detectContentType"| viewer
    fileBrowser -->|"toast()<br/>useFileChanges<br/>FileChangeProvider"| events
    fileBrowser -->|"PanelShell<br/>ExplorerPanel<br/>LeftPanel · MainPanel<br/>AsciiSpinner"| panels
    panels -->|"panel URL param"| wsUrl
    viewer -->|"IFileSystem (Shiki reads)"| fileOps

    %% SDK consumed by publishing domains
    fileBrowser -->|"IUSDK<br/>(publishes commands)"| sdk
    events -->|"IUSDK<br/>(publishes toast)"| sdk
    panels -->|"ICommandRegistry<br/>(hosts palette)"| sdk
    settings -->|"ISDKSettings<br/>useSDKSetting<br/>useSDK"| sdk

    %% Positional graph dependencies
    posGraph -->|"IFileSystem<br/>IPathResolver"| fileOps

    %% Workflow UI dependencies
    workflowUI -->|"IPositionalGraphService<br/>ITemplateService<br/>IWorkUnitService"| posGraph
    workflowUI -->|"IFileSystem<br/>IPathResolver"| fileOps
    workflowUI -->|"useSSE<br/>SSE infrastructure"| events
    workflowUI -->|"workspaceHref"| wsUrl
    workflowUI -->|"IUSDK"| sdk

    %% State system dependencies
    state -->|"useSSE<br/>SSE transport"| events
    posGraph -->|"IStateService<br/>(publish orchestration)"| state
    workflowUI -->|"useGlobalState<br/>(subscribe execution)"| state
    panels -->|"useGlobalState<br/>(subscribe alerts)"| state
    fileBrowser -->|"useGlobalState<br/>(subscribe worktree)"| state

    %% Dev tools dependencies
    devTools -->|"IStateService<br/>StateChangeLog<br/>useStateSystem"| state

    %% Work Unit Editor dependencies
    workunitEditor -->|"IWorkUnitService<br/>(CRUD)"| posGraph
    workunitEditor -->|"CodeEditor"| viewer
    workunitEditor -->|"workspaceHref"| wsUrl

    %% Terminal dependencies
    terminal -->|"PanelShell<br/>LeftPanel · MainPanel"| panels
    terminal -->|"toast()"| events
    terminal -->|"IUSDK<br/>ICommandRegistry"| sdk
    terminal -->|"workspaceHref"| wsUrl
```

## Legend

- **Blue**: Business domains (user-facing capabilities)
- **Purple**: Infrastructure domains (cross-cutting technical capabilities)
- **Red**: Deprecated domains (pending removal)
- **Solid arrows** (→): Contract dependency (A consumes B's contract)
- **Labels on arrows**: Contract name being consumed

## Domain Health Summary

| Domain | Contracts Out | Consumers | Contracts In | Providers | Status |
|--------|--------------|-----------|-------------|-----------|--------|
| _platform/file-ops | IFileSystem, IPathResolver | file-browser, viewer, workflow-ui | — | — | ✅ |
| _platform/workspace-url | workspaceHref, paramsCaches | file-browser, panel-layout | — | — | ✅ |
| _platform/viewer | FileViewer, MarkdownViewer, DiffViewer, highlightCode, detectContentType, isBinaryExtension | file-browser | IFileSystem | file-ops | ✅ |
| _platform/events | ICentralEventNotifier, ISSEBroadcaster, useSSE, FileChangeHub, useFileChanges, FileChangeProvider, toast() | file-browser, workflow-ui, agent-ui*, state | — | — | ✅ |
| _platform/panel-layout | PanelShell, ExplorerPanel, LeftPanel, MainPanel, PanelHeader, BarHandler, AsciiSpinner, FlowSpaceSearchResult, FlowSpaceAvailability, FlowSpaceSearchMode | file-browser, future workspace pages | panel URL param | workspace-url | ✅ |
| file-browser | Browser page, FileTree, FileViewerPanel, WorkspaceContext, EmojiPicker, ColorPicker, Settings | — | IFileSystem, workspaceHref, viewers, toast, events, panels | file-ops, workspace-url, viewer, events, panel-layout | ✅ |
| _platform/sdk | IUSDK, ICommandRegistry, ISDKSettings, IContextKeyService, IKeybindingService, SDKCommand, SDKSetting, FakeUSDK | file-browser, workflow-ui, events, panel-layout, settings | — | — | ✅ |
| _platform/settings | Settings Page, sdk.openSettings | — | ISDKSettings, useSDKSetting, useSDK | sdk | ✅ |
| _platform/positional-graph | IPositionalGraphService, IOrchestrationService, IEventHandlerService, IWorkUnitService, ITemplateService, IInstanceService | CLI (`cg wf`, `cg template`), workflow-ui, dev/test-graphs | IFileSystem, IPathResolver, IStateService | file-ops, state | ✅ |
| _platform/workgraph | IWorkGraphService, IWorkNodeService, IWorkUnitService | CLI (`cg wg`, `cg unit`) | IFileSystem, IPathResolver | file-ops | ❌ Removed from web (Plan 050 Phase 7) |
| _platform/state | IStateService, useGlobalState, useGlobalStateList, GlobalStateProvider, StateChangeLog, FakeGlobalStateSystem | positional-graph (publish), workflow-ui, panel-layout, file-browser (subscribe), dev-tools | useSSE | events | ✅ |
| workflow-ui | _(none — leaf consumer)_ | — | IPositionalGraphService, ITemplateService, IWorkUnitService, IFileSystem, IPathResolver, useSSE, workspaceHref, IUSDK, useGlobalState | positional-graph, file-ops, events, workspace-url, sdk, state | ✅ |
| _platform/dev-tools | StateInspector, useStateChangeLog, useStateInspector | — | IStateService, StateChangeLog, useStateSystem | state | ✅ |
| 058-workunit-editor | _(none — leaf consumer)_ | — | IWorkUnitService, CodeEditor, workspaceHref | positional-graph, viewer, workspace-url | ✅ |
| terminal | _(none — leaf consumer)_ | — | PanelShell, LeftPanel, MainPanel, toast(), IUSDK, ICommandRegistry, workspaceHref | panel-layout, events, sdk, workspace-url | ✅ |
