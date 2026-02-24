# Domain Map

> Auto-maintained by plan commands. Shows all domains and their contract relationships.
> Domains are first-class components — this diagram is the system architecture at business level.

```mermaid
flowchart LR
    classDef business fill:#E3F2FD,stroke:#2196F3,color:#000
    classDef infra fill:#F3E5F5,stroke:#9C27B0,color:#000

    %% Infrastructure domains
    fileOps["⚙️ _platform/file-ops\nIFileSystem · IPathResolver"]:::infra
    wsUrl["🔗 _platform/workspace-url\nworkspaceHref · paramsCaches"]:::infra
    viewer["🖥️ _platform/viewer\nFileViewer · MarkdownViewer\nDiffViewer · highlightCode"]:::infra

    %% Business domains
    fileBrowser["📁 file-browser\nBrowser page · FileTree\nCodeEditor · FileViewerPanel"]:::business

    %% Contract dependencies (consumer → provider)
    fileBrowser -->|"IFileSystem\nIPathResolver"| fileOps
    fileBrowser -->|"workspaceHref\nfileBrowserParams"| wsUrl
    fileBrowser -->|"FileViewer\nMarkdownViewer\nDiffViewer"| viewer
    viewer -->|"IFileSystem (Shiki reads)"| fileOps
```

## Legend

- **Blue**: Business domains (user-facing capabilities)
- **Purple**: Infrastructure domains (cross-cutting technical capabilities)
- **Solid arrows** (→): Contract dependency (A consumes B's contract)
- **Labels on arrows**: Contract name being consumed
