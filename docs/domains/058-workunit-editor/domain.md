# Domain: Work Unit Editor

**Slug**: `058-workunit-editor`
**Type**: business
**Created**: Plan 058 — Work Unit Creator & Editor
**Status**: active

## Purpose

Visual editor for creating, editing, and managing work unit templates. Work units are reusable building blocks for workflows — agent prompts, code scripts, and human input questions. This domain provides the UI layer on top of `IWorkUnitService` CRUD operations.

## Boundary

**Owns**:
- Work unit list page (`/workspaces/[slug]/work-units/`)
- Work unit editor page (`/workspaces/[slug]/work-units/[unitSlug]/`)
- Server actions for unit CRUD (`workunit-actions.ts`)
- Type-specific editors (agent, code, user-input)
- Unit creation modal
- Editor page layout (3-panel)

**Does NOT own**:
- `IWorkUnitService` contract (owned by `_platform/positional-graph`)
- CodeEditor component (owned by `_platform/viewer`)
- Sidebar navigation definition (cross-domain, `navigation-utils.ts`)
- Workflow canvas node rendering (owned by `workflow-ui`)

## Contracts

| Name | Type | Entry Point | Consumers |
|------|------|-------------|-----------|
| workunit-actions | server-actions | `app/actions/workunit-actions.ts` | Editor components |

## Composition

| Dependency | What We Consume | Contract |
|-----------|----------------|----------|
| `_platform/positional-graph` | Work unit CRUD | `IWorkUnitService` |
| `_platform/viewer` | Code editor | `CodeEditor` |
| `_platform/hooks` | Auto-save | `useAutoSave` |
| `_platform/panel-layout` | Page layout patterns | `PanelShell` (reference only) |
| `_platform/workspace-url` | URL construction | `workspaceHref` |

## Concepts

| Concept | Description | Entry Point |
|---------|-------------|-------------|
| Unified Save Path | All unit types save through `saveUnitContent` which routes internally by type | `workunit-actions.ts` |
| Type-Dispatched Editor | Editor page renders different UI based on unit type (agent/code/user-input) | `workunit-editor.tsx` |
| Auto-Save | Content changes debounce-save via `useAutoSave` hook with status tracking | `use-auto-save.ts` |
| InputOutputCardList | Expandable card list with DnD reorder for configuring unit inputs/outputs | `input-output-card-list.tsx` |
| InputOutputCard | Individual expandable card with form fields, ARIA, validation, delete confirmation | `input-output-card.tsx` |
| Reserved Params | Virtual inputs (main-prompt, main-script) shown as locked display-only cards, not persisted | `workunit-editor.tsx` |
| Structural vs Field Save | Structural changes (add/remove/reorder) save immediately; field edits debounce 500ms | `workunit-editor.tsx` |

## History

| Date | Phase | Change |
|------|-------|--------|
| 2026-02-28 | Phase 2 | Domain created: pages, server actions, type-specific editors, creation modal |
| 2026-03-01 | Phase 3 | Added inputs/outputs configuration: InputOutputCard, InputOutputCardList, DnD reorder, reserved params, validation, dual auto-save |
| 2026-03-01 | Phase 4 | Added change notifications (SSE hook, watcher adapter), Edit Template button on workflow nodes, Back to Workflow return navigation |
