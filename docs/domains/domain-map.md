# Domain Map

> Auto-maintained by plan commands. Shows all domains and their contract relationships.
> Domains are first-class components — this diagram is the system architecture at business level.

```mermaid
flowchart LR
    classDef business fill:#E3F2FD,stroke:#2196F3,color:#000
    classDef infra fill:#F3E5F5,stroke:#9C27B0,color:#000

    %% Infrastructure domains
    fileOps["⚙️ _platform/file-ops<br/>IFileSystem · IPathResolver"]:::infra
    wsUrl["🔗 _platform/workspace-url<br/>workspaceHref · paramsCaches"]:::infra
    viewer["🖥️ _platform/viewer<br/>FileViewer · MarkdownViewer<br/>DiffViewer · highlightCode"]:::infra
    events["🔔 _platform/events<br/>ICentralEventNotifier<br/>ISSEBroadcaster · useSSE<br/>FileChangeHub · useFileChanges<br/>toast() · Toaster"]:::infra
    panels["🗂️ _platform/panel-layout<br/>PanelShell · ExplorerPanel<br/>LeftPanel · MainPanel<br/>PanelHeader · BarHandler"]:::infra

    %% Business domains
    fileBrowser["📁 file-browser<br/>Browser page · FileTree<br/>CodeEditor · FileViewerPanel"]:::business

    %% Contract dependencies (consumer → provider)
    fileBrowser -->|"IFileSystem<br/>IPathResolver"| fileOps
    fileBrowser -->|"workspaceHref<br/>fileBrowserParams"| wsUrl
    fileBrowser -->|"FileViewer<br/>MarkdownViewer<br/>DiffViewer"| viewer
    fileBrowser -->|"toast()<br/>useFileChanges<br/>FileChangeProvider"| events
    fileBrowser -->|"PanelShell<br/>ExplorerPanel<br/>LeftPanel · MainPanel"| panels
    panels -->|"panel URL param"| wsUrl
    viewer -->|"IFileSystem (Shiki reads)"| fileOps
```

## Legend

- **Blue**: Business domains (user-facing capabilities)
- **Purple**: Infrastructure domains (cross-cutting technical capabilities)
- **Solid arrows** (→): Contract dependency (A consumes B's contract)
- **Labels on arrows**: Contract name being consumed

## Domain Health Summary

| Domain | Contracts Out | Consumers | Contracts In | Providers | Status |
|--------|--------------|-----------|-------------|-----------|--------|
| _platform/file-ops | IFileSystem, IPathResolver | file-browser, viewer | — | — | ✅ |
| _platform/workspace-url | workspaceHref, paramsCaches | file-browser, panel-layout | — | — | ✅ |
| _platform/viewer | FileViewer, MarkdownViewer, DiffViewer, highlightCode | file-browser | IFileSystem | file-ops | ✅ |
| _platform/events | ICentralEventNotifier, ISSEBroadcaster, useSSE, FileChangeHub, useFileChanges, FileChangeProvider, toast() | file-browser, workgraph-ui*, agent-ui* | — | — | ✅ |
| _platform/panel-layout | PanelShell, ExplorerPanel, LeftPanel, MainPanel, PanelHeader, BarHandler | file-browser, future workspace pages | panel URL param | workspace-url | ✅ |
| file-browser | Browser page, FileTree, FileViewerPanel | — | IFileSystem, workspaceHref, viewers, toast, events, panels | file-ops, workspace-url, viewer, events, panel-layout | ✅ |

*workgraph-ui and agent-ui are not yet formalized as domains but are known consumers
