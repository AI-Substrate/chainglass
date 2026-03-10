# Domain Map

> Auto-maintained by plan commands. Shows all domains and their contract relationships.
> Domains are first-class components — this diagram is the system architecture at business level.

```mermaid
flowchart LR
    classDef business fill:#E3F2FD,stroke:#2196F3,color:#000
    classDef infra fill:#F3E5F5,stroke:#9C27B0,color:#000
    classDef deprecated fill:#FFEBEE,stroke:#F44336,color:#000
    classDef new fill:#FFF3E0,stroke:#FF9800,color:#000

    %% Infrastructure domains
    fileOps["⚙️ _platform/file-ops<br/>IFileSystem · IPathResolver"]:::infra
    wsUrl["🔗 _platform/workspace-url<br/>workspaceHref · paramsCaches"]:::infra
    viewer["🖥️ _platform/viewer<br/>FileViewer · MarkdownViewer<br/>DiffViewer · highlightCode<br/>detectContentType"]:::infra
    events["🔔 _platform/events<br/>ICentralEventNotifier<br/>ISSEBroadcaster · useSSE<br/>FileChangeHub · useFileChanges<br/>toast() · Toaster"]:::infra
    panels["🗂️ _platform/panel-layout<br/>PanelShell · ExplorerPanel<br/>LeftPanel · MainPanel<br/>PanelHeader · BarHandler<br/>AsciiSpinner<br/>FlowSpace types"]:::infra
    sdk["🧩 _platform/sdk<br/>IUSDK · ICommandRegistry<br/>ISDKSettings · IContextKeyService<br/>IKeybindingService<br/>SDKCommand · SDKSetting"]:::infra
    settings["⚙️ _platform/settings<br/>Settings Page<br/>SettingControl · SettingsSearch"]:::infra
    posGraph["📊 _platform/positional-graph<br/>IPositionalGraphService<br/>IOrchestrationService<br/>IEventHandlerService<br/>IWorkUnitService<br/>ITemplateService<br/>IInstanceService"]:::infra
    state["💾 _platform/state<br/>IStateService<br/>useGlobalState<br/>useGlobalStateList<br/>GlobalStateProvider<br/>StateChangeLog<br/>ServerEventRoute"]:::infra
    devTools["🛠️ _platform/dev-tools<br/>StateInspector<br/>useStateInspector<br/>useStateChangeLog"]:::infra
    auth["🔐 _platform/auth<br/>auth() · signIn() · signOut()<br/>requireAuth() · useAuth()<br/>middleware protection<br/>isUserAllowed()<br/>SessionProvider"]:::infra

    %% Business domains
    fileBrowser["📁 file-browser<br/>Browser page · FileTree<br/>CodeEditor re-export<br/>FileViewerPanel<br/>WorkspaceContext · Settings"]:::business
    workflowUI["🔀 workflow-ui<br/>Workflow editor · Canvas<br/>Toolbox · Properties<br/>Doping system"]:::business
    workunitEditor["✏️ 058-workunit-editor<br/>Unit list page · Editor page<br/>Agent/Code/Input editors<br/>Creation modal · Auto-save"]:::business
    terminal["🖥️ terminal<br/>TerminalView · TerminalOverlay<br/>TmuxSessionManager · copyTmuxBuffer<br/>Sidecar WS/WSS Server"]:::business

    %% NEW business domains (Plan 059)
    agents["🤖 agents<br/>IAgentManagerService<br/>IAgentAdapter · IAgentInstance<br/>useAgentManager · useAgentInstance<br/>useAgentOverlay · useRecentAgents<br/>AgentChipBar · AgentOverlayPanel<br/>AgentWorkUnitBridge"]:::new
    workUnitState["📋 work-unit-state<br/>IWorkUnitStateService<br/>WorkUnitEntry · WorkUnitEvent<br/>FakeWorkUnitStateService<br/>workUnitStateRoute"]:::new

    %% NEW business domains (Plan 061)
    wfEvents["📡 workflow-events<br/>IWorkflowEvents<br/>WorkflowEventType<br/>WorkflowEventError<br/>FakeWorkflowEventsService"]:::new

    %% NEW business domains (Plan 065)
    activityLog["📋 activity-log<br/>ActivityLogEntry<br/>appendActivityLogEntry<br/>readActivityLog<br/>shouldIgnorePaneTitle<br/>useActivityLogOverlay<br/>GET /api/activity-log"]:::new

    %% NEW business domains (Plan 071)
    fileNotes["📝 file-notes<br/>INoteService · NoteLinkType<br/>NoteFilter · FakeNoteService<br/>JsonlNoteService · registerNotesCommands<br/>NotesOverlayPanel · NoteModal<br/>NoteIndicatorDot · useNotes<br/>GET/POST/PATCH/DELETE<br/>/api/file-notes"]:::new
    prView["🔍 pr-view<br/>PRViewFile · PRViewData<br/>ComparisonMode · PRViewFileState<br/>PRViewOverlayProvider · usePRViewOverlay<br/>usePRViewData · registerPRViewSDK<br/>aggregatePRViewData · getAllDiffs<br/>GET/POST/DELETE<br/>/api/pr-view"]:::new

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

    %% NEW: Agents domain dependencies
    agents -->|"ISSEBroadcaster<br/>useSSE · toast()"| events
    agents -->|"CopilotClient"| sdk
    agents -->|"IStateService<br/>useGlobalState"| state
    agents -->|"IWorkUnitStateService<br/>(publish status)"| workUnitState
    agents -->|"DashboardShell<br/>(top bar slot)"| panels
    posGraph -->|"IAgentManagerService<br/>IAgentInstance<br/>(orchestration)"| agents

    %% NEW: Work Unit State dependencies
    workUnitState -->|"ICentralEventNotifier<br/>(emit SSE events)"| events
    workUnitState -->|"ServerEventRouteDescriptor<br/>(state path bridge)"| state

    %% NEW: Workflow UI → agents (overlay integration)
    workflowUI -->|"useAgentOverlay<br/>(onAgentClick)"| agents

    %% NEW: Workflow Events dependencies (Plan 061)
    wfEvents -->|"IPositionalGraphService<br/>raiseNodeEvent"| posGraph
    wfEvents -->|"ICentralEventNotifier<br/>SSE broadcast<br/>(Phase 3)"| events
    agents -->|"IWorkflowEvents<br/>onQuestionAsked<br/>onQuestionAnswered"| wfEvents
    workflowUI -->|"IWorkflowEvents<br/>answerQuestion"| wfEvents
    posGraph -->|"IWorkflowEvents<br/>CLI ask/answer/get-answer"| wfEvents

    %% Work Unit Editor dependencies
    workunitEditor -->|"IWorkUnitService<br/>(CRUD)"| posGraph
    workunitEditor -->|"CodeEditor"| viewer
    workunitEditor -->|"workspaceHref"| wsUrl

    %% Terminal dependencies
    terminal -->|"PanelShell<br/>LeftPanel · MainPanel"| panels
    terminal -->|"toast()"| events
    terminal -->|"IUSDK<br/>ICommandRegistry"| sdk
    terminal -->|"workspaceHref"| wsUrl

    %% Activity Log dependencies (consumer → provider)
    activityLog -->|"PanelShell<br/>overlay anchor"| panels
    terminal -->|"appendActivityLogEntry()<br/>shouldIgnorePaneTitle()"| activityLog

    %% Auth dependencies (consumer → provider: business domains consume auth protection)
    fileBrowser -->|"middleware protection"| auth
    workflowUI -->|"middleware protection"| auth
    workunitEditor -->|"middleware protection"| auth
    fileNotes -->|"requireAuth()<br/>auth()"| auth
    fileNotes -->|"overlay anchor"| panels
    fileNotes -->|"workspaceHref()"| wsUrl
    fileNotes -->|"toast()"| events
    fileNotes -->|"registerFileNotesSDK()"| sdk
    prView -->|"getWorkingChanges()"| fileBrowser
    prView -->|"requireAuth()<br/>auth()"| auth
    prView -->|"DiffViewer"| viewer
    prView -->|"overlay anchor"| panels
    prView -->|"registerPRViewSDK()"| sdk
    prView -->|"FileChangeProvider<br/>useFileChanges"| events

    %% Cross-domain: file-notes consumed by file-browser and pr-view (Phase 7)
    fileBrowser -->|"NoteIndicatorDot<br/>fetchFilesWithNotes<br/>useNotesOverlay"| fileNotes
    prView -->|"NoteIndicatorDot<br/>fetchFilesWithNotes"| fileNotes
```

## Legend

- **Blue**: Business domains (user-facing capabilities)
- **Purple**: Infrastructure domains (cross-cutting technical capabilities)
- **Orange**: Newly added domains (Plan 059 — change to blue after first implementation)
- **Red**: Deprecated domains (pending removal)
- **Solid arrows** (→): Contract dependency (A consumes B's contract)
- **Labels on arrows**: Contract name being consumed

## Domain Health Summary

| Domain | Contracts Out | Consumers | Contracts In | Providers | Status |
|--------|--------------|-----------|-------------|-----------|--------|
| _platform/file-ops | IFileSystem, IPathResolver | file-browser, viewer, workflow-ui | — | — | ✅ |
| _platform/workspace-url | workspaceHref, paramsCaches | file-browser, panel-layout | — | — | ✅ |
| _platform/viewer | FileViewer, MarkdownViewer, DiffViewer, highlightCode, detectContentType, isBinaryExtension | file-browser | IFileSystem | file-ops | ✅ |
| _platform/events | ICentralEventNotifier, ISSEBroadcaster, useSSE, FileChangeHub, useFileChanges, FileChangeProvider, toast() | file-browser, workflow-ui, agents, state | — | — | ✅ |
| _platform/panel-layout | PanelShell, ExplorerPanel, LeftPanel, MainPanel, PanelHeader, BarHandler, AsciiSpinner, FlowSpaceSearchResult, FlowSpaceAvailability, FlowSpaceSearchMode | file-browser, future workspace pages | panel URL param | workspace-url | ✅ |
| file-browser | Browser page, FileTree, FileViewerPanel, WorkspaceContext, EmojiPicker, ColorPicker, Settings | — | IFileSystem, workspaceHref, viewers, toast, events, panels, NoteIndicatorDot, fetchFilesWithNotes, useNotesOverlay | file-ops, workspace-url, viewer, events, panel-layout, file-notes | ✅ |
| _platform/sdk | IUSDK, ICommandRegistry, ISDKSettings, IContextKeyService, IKeybindingService, SDKCommand, SDKSetting, FakeUSDK | file-browser, workflow-ui, events, panel-layout, settings | — | — | ✅ |
| _platform/settings | Settings Page, sdk.openSettings | — | ISDKSettings, useSDKSetting, useSDK | sdk | ✅ |
| _platform/positional-graph | IPositionalGraphService, IOrchestrationService, IEventHandlerService, IWorkUnitService, ITemplateService, IInstanceService | CLI (`cg wf`, `cg template`), workflow-ui, dev/test-graphs | IFileSystem, IPathResolver, IStateService | file-ops, state | ✅ |
| _platform/workgraph | IWorkGraphService, IWorkNodeService, IWorkUnitService | CLI (`cg wg`, `cg unit`) | IFileSystem, IPathResolver | file-ops | ❌ Removed from web (Plan 050 Phase 7) |
| _platform/state | IStateService, useGlobalState, useGlobalStateList, GlobalStateProvider, StateChangeLog, ServerEventRoute, FakeGlobalStateSystem | positional-graph (publish), workflow-ui, panel-layout, file-browser, agents, work-unit-state (subscribe), dev-tools | useSSE | events | ✅ |
| workflow-ui | _(none — leaf consumer)_ | — | IPositionalGraphService, ITemplateService, IWorkUnitService, IFileSystem, IPathResolver, useSSE, workspaceHref, IUSDK, useGlobalState, useAgentOverlay (future) | positional-graph, file-ops, events, workspace-url, sdk, state, agents (future) | ✅ |
| _platform/dev-tools | StateInspector, useStateChangeLog, useStateInspector | — | IStateService, StateChangeLog, useStateSystem | state | ✅ |
| 058-workunit-editor | _(none — leaf consumer)_ | — | IWorkUnitService, CodeEditor, workspaceHref | positional-graph, viewer, workspace-url | ✅ |
| agents | IAgentManagerService, IAgentAdapter, IAgentInstance, IAgentNotifierService, useAgentManager, useAgentInstance, useAgentOverlay, useRecentAgents, useWorktreeActivity, AgentChipBar, AgentOverlayPanel, AgentWorkUnitBridge | positional-graph (orchestration), workflow-ui (overlay), panel-layout (badge data via composition) | ISSEBroadcaster, useSSE, toast(), CopilotClient, IStateService, IWorkUnitStateService, IWorkflowEvents, DashboardShell | events, sdk, state, work-unit-state, workflow-events, panel-layout | 🟠 New |
| work-unit-state | IWorkUnitStateService, WorkUnitEntry, WorkUnitEvent, FakeWorkUnitStateService, workUnitStateRoute | agents (AgentWorkUnitBridge), workflow-ui (future) | ICentralEventNotifier, ServerEventRouteDescriptor | events, state | 🟠 New |
| workflow-events | IWorkflowEvents, WorkflowEventType, WorkflowEventError, FakeWorkflowEventsService | agents (observer hooks), workflow-ui (answerQuestion), CLI (ask/answer/get-answer) | IPositionalGraphService, ICentralEventNotifier | positional-graph, events | 🟠 New |
| terminal | _(none — leaf consumer)_ | — | PanelShell, LeftPanel, MainPanel, toast(), IUSDK, ICommandRegistry, workspaceHref | panel-layout, events, sdk, workspace-url | ✅ |
| _platform/auth | auth(), signIn(), signOut(), requireAuth(), useAuth(), middleware protection, isUserAllowed(), SessionProvider | file-browser, workflow-ui, workunit-editor (via middleware), server actions (via requireAuth), file-notes | — | — | ✅ |
| file-notes | INoteService, NoteLinkType, NoteFilter, FakeNoteService, JsonlNoteService, NotesOverlayPanel, NoteModal, NoteIndicatorDot, BulkDeleteDialog, useNotes, useNotesOverlay, registerFileNotesSDK, registerNotesCommands, GET/POST/PATCH/DELETE /api/file-notes | file-browser, CLI, pr-view | requireAuth(), auth(), overlay anchor, workspaceHref(), toast(), registerFileNotesSDK | auth, panel-layout, workspace-url, events, sdk | 🟠 New |
| pr-view | PRViewFile, PRViewData, ComparisonMode, PRViewFileState, PRViewOverlayProvider, usePRViewOverlay, usePRViewData, registerPRViewSDK, aggregatePRViewData, getAllDiffs, GET/POST/DELETE /api/pr-view | file-browser (future) | getWorkingChanges(), requireAuth(), auth(), DiffViewer, overlay anchor, registerPRViewSDK, FileChangeProvider, useFileChanges, NoteIndicatorDot, fetchFilesWithNotes | file-browser, auth, viewer, panel-layout, sdk, events, file-notes | 🟠 New |
