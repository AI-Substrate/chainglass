# Chainglass Architecture (C4 Model)

This directory contains [C4 model](https://c4model.com) architecture diagrams for the Chainglass platform. Diagrams decompose the system from high-level context down to individual domain components using Mermaid's native C4 syntax.

## How to Navigate

Start at L1 and zoom in to the level of detail you need:

| Level | Name | What It Shows | Entry Point |
|-------|------|---------------|-------------|
| L1 | System Context | Chainglass + users + external systems | [system-context.md](system-context.md) |
| L2 | Container | Deployable units (web, CLI, packages) | [containers/overview.md](containers/overview.md) |
| L3 | Component | Domain decomposition within containers | [components/](components/) |

## Quick Links

### Containers

- [Web Application](containers/web-app.md) — Next.js 16 frontend
- [CLI Tool](containers/cli.md) — Node.js command-line interface
- [Shared Packages](containers/shared-packages.md) — TypeScript types and utilities

### Infrastructure Domains

- [File Operations](components/_platform/file-ops.md) — IFileSystem, IPathResolver
- [Workspace URL](components/_platform/workspace-url.md) — workspaceHref, paramsCaches
- [Viewer](components/_platform/viewer.md) — FileViewer, MarkdownViewer, DiffViewer
- [Events](components/_platform/events.md) — ICentralEventNotifier, useSSE, toast()
- [Panel Layout](components/_platform/panel-layout.md) — PanelShell, ExplorerPanel, LeftPanel, MainPanel
- [SDK](components/_platform/sdk.md) — IUSDK, ICommandRegistry, IKeybindingService
- [Settings](components/_platform/settings.md) — Settings Page, SettingControl
- [Positional Graph](components/_platform/positional-graph.md) — IPositionalGraphService, IWorkUnitService
- [State](components/_platform/state.md) — IStateService, useGlobalState
- [Dev Tools](components/_platform/dev-tools.md) — StateInspector, useStateChangeLog
- [Themes](components/_platform/themes.md) — resolveFileIcon, resolveFolderIcon, loadManifest

### Business Domains

- [Workspace](components/workspace.md) — Workspace registration, context resolution, worktree discovery
- [File Browser](components/file-browser.md) — Workspace file browsing, editing, diffing
- [File Notes](components/file-notes.md) — Shared note contracts, JSONL persistence, API surface
- [PR View](components/pr-view.md) — Diff aggregation, reviewed state, git branch service
- [Workflow UI](components/workflow-ui.md) — Visual workflow editor with drag-drop
- [Work Unit Editor](components/workunit-editor.md) — CRUD interface for work unit definitions

## Design Principles

See [.github/instructions/c4-authoring.instructions.md](../../.github/instructions/c4-authoring.instructions.md) for C4 authoring guidelines. This file uses the official GitHub Copilot CLI path-specific instructions pattern and is automatically applied when editing files in `docs/c4/`.

## Related

- [Domain Registry](../domains/registry.md) — All domains with status and contracts
- [Domain Map](../domains/domain-map.md) — Mermaid dependency graph (contract wiring view)
