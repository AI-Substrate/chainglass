# Flight Plan: Phase 2 — Editor Page

**Plan**: [workunit-editor-plan.md](../../workunit-editor-plan.md)
**Phase**: Phase 2: Editor Page — Routes, Layout, Type-Specific Editors
**Generated**: 2026-02-28
**Status**: Ready for takeoff

---

## Departure → Destination

**Where we are**: Phase 1 delivered `IWorkUnitService` with full CRUD (create/update/delete/rename), 42 contract tests, and the fake. But there's no UI — no pages, no editor, no sidebar entry. Users can only interact with units via CLI or tests.

**Where we're going**: A user opens `/workspaces/[slug]/work-units/` from the sidebar, sees all units grouped by type, creates a new agent unit, and edits its prompt in a CodeMirror editor that auto-saves. They can also edit code scripts (with bash highlighting) and configure user-input questions. The feature is visible and functional.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| `_platform/viewer` | New: Extract CodeEditor from file-browser, add shell language support | `_platform/viewer/components/code-editor.tsx` |
| `file-browser` | Re-export CodeEditor from new location (backward compat) | `041-file-browser/components/code-editor.tsx` |
| `058-workunit-editor` | New: Feature folder with editor components, server actions, pages | `features/058-workunit-editor/`, `actions/workunit-actions.ts`, routes |
| cross-domain | Add "Work Units" to sidebar nav | `navigation-utils.ts` |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| `_platform/positional-graph` | Work unit CRUD | `IWorkUnitService` (Phase 1) |
| `_platform/panel-layout` | Page layout | `PanelShell` |
| `_platform/workspace-url` | URL construction | `workspaceHref()` |

---

## Flight Status

<!-- Updated by /plan-6-v2: pending → active → done. -->

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: CodeEditor extract + shell" as S1
    state "2: Server actions + nav" as S2
    state "3: List page + creation" as S3
    state "4: Editor shell + type editors" as S4
    state "5: Auto-save + metadata" as S5

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S2 --> S4
    S3 --> S5
    S4 --> S5
    S5 --> [*]

    class S1,S2,S3,S4,S5 pending
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

- [ ] **Stage 1: Infrastructure** — Extract CodeEditor, install lang-shell, verify no breakage (`code-editor.tsx`, `package.json`)
- [ ] **Stage 2: Wiring** — Create server actions + sidebar navigation entry (`workunit-actions.ts`, `navigation-utils.ts`)
- [ ] **Stage 3: List page** — Unit catalog page + creation modal (`/work-units/page.tsx`, `unit-list.tsx`, `unit-creation-modal.tsx`)
- [ ] **Stage 4: Editor page** — Editor shell + 3 type-specific editors (`/work-units/[unitSlug]/page.tsx`, `agent-editor.tsx`, `code-unit-editor.tsx`, `user-input-editor.tsx`)
- [ ] **Stage 5: Polish** — Auto-save wiring, metadata panel, save indicators (`metadata-panel.tsx`)

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 2"]
        B_SVC["IWorkUnitService<br/>(CRUD — Phase 1)"]:::existing
        B_CE["CodeEditor<br/>(in file-browser)"]:::existing
        B_NAV["Sidebar<br/>(Browser, Agents, Workflows)"]:::existing
    end

    subgraph After["After Phase 2"]
        A_SVC["IWorkUnitService"]:::existing
        A_CE["CodeEditor<br/>(in _platform/viewer)"]:::changed
        A_NAV["Sidebar<br/>(+ Work Units)"]:::changed
        A_ACT["workunit-actions.ts<br/>(server actions)"]:::new
        A_LIST["List Page<br/>(/work-units/)"]:::new
        A_EDIT["Editor Page<br/>(/work-units/[slug])"]:::new
        A_AGENT["Agent Editor<br/>(markdown)"]:::new
        A_CODE["Code Editor<br/>(bash/py/js)"]:::new
        A_UI["User-Input Editor<br/>(form builder)"]:::new

        A_NAV --> A_LIST
        A_LIST --> A_EDIT
        A_ACT --> A_SVC
        A_EDIT --> A_AGENT
        A_EDIT --> A_CODE
        A_EDIT --> A_UI
        A_AGENT --> A_CE
        A_CODE --> A_CE
    end
```

**Legend**: existing (green, unchanged) | changed (orange, modified) | new (blue, created)

---

## Acceptance Criteria

- [ ] AC-4: New unit appears in catalog without page refresh
- [ ] AC-6: Metadata auto-save to disk
- [ ] AC-7: Agent prompt editing with markdown highlighting
- [ ] AC-8: Code script editing with language detection
- [ ] AC-9: User-input configuration (question type, options)
- [ ] AC-21: Sidebar navigation entry (before Workflows)

## Goals & Non-Goals

**Goals**: Visible, functional editor UI. List + edit + create units. CodeMirror for agent/code. Form builder for user-input. Auto-save. Sidebar nav.

**Non-Goals**: No inputs/outputs UI (Phase 3). No file watcher/notifications (Phase 4). No "Edit Template" button (Phase 4).

---

## Checklist

- [ ] T001: Extract CodeEditor to _platform/viewer
- [ ] T002: Install @codemirror/lang-shell
- [ ] T003: Create server actions (workunit-actions.ts)
- [ ] T004: Add sidebar navigation
- [ ] T005: Create list page
- [ ] T006: Create editor page shell
- [ ] T007: Build agent editor (markdown)
- [ ] T008: Build code editor (language detection)
- [ ] T009: Build user-input editor (form)
- [ ] T010: Unit creation flow (modal)
- [ ] T011: Metadata editing panel
