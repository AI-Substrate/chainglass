# Work Unit Creator & Editor

**Mode**: Full
📚 This specification incorporates findings from `research-dossier.md` and 5 workshop documents.

---

## Research Context

The research dossier (71 findings from 8 parallel subagents) confirmed:
- **IWorkUnitService is read-only** — only `list()`, `load()`, `validate()` exist. No create/update/delete.
- **Graph nodes store `unit_slug` references only** — they always load the latest unit from the global catalog at runtime. No local copies, no per-node staleness.
- **Three unit types** with distinct editing needs: agent (prompt template), code (script file), user-input (question configuration).
- **Existing CodeMirror 6** editor component in file-browser can be reused.
- **State system** (`_platform/state`) provides simple pub/sub for change notifications.

Workshop decisions incorporated:
- **W001**: Sync = banner notification via state system (no per-node indicators)
- **W002**: Dual-access architecture (standalone page + "Edit Template" from workflow canvas)
- **W003**: Reuse existing CodeMirror 6 `CodeEditor` component, extract to shared location
- **W004**: Extend `IWorkUnitService` in-place with `create()`, `update()`, `delete()`, `rename()`
- **W005**: Expandable card list for inputs/outputs, `@dnd-kit/sortable` for reorder

---

## Summary

Work units are reusable template definitions that serve as building blocks for workflows. They define what a node does (run an agent prompt, execute a code script, or collect human input), what data it needs (inputs), and what it produces (outputs). Users compose workflows by dragging units from a catalog onto workflow lines.

Currently, work units can only be created via CLI (`cg unit create`) or manual YAML editing. There is no visual editor. This feature adds:
1. A **work unit editor** page for creating, editing, and managing work unit templates
2. **CRUD operations** on the `IWorkUnitService` so the editor (and CLI) can create, update, and delete units through a consistent service layer
3. **Change notifications** so the workflow page knows when units have been updated and prompts the user to refresh

---

## Goals

- **Enable visual creation of work units** — users can create new agent, code, and user-input units without writing YAML by hand
- **Enable visual editing of work units** — users can modify unit metadata, template content (prompts/scripts), and input/output definitions
- **Type-specific editing experiences** — agent units get a prompt editor, code units get a script editor, user-input units get a form builder for questions and options
- **Input/output configuration** — users can define, reorder, and remove the inputs and outputs that wire units together in workflows
- **Accessible from workflow context** — when viewing a workflow node, users can click "Edit Template" to navigate to the unit editor and back
- **Live change awareness** — when a unit is modified (by this editor, another window, CLI, or disk), the workflow page shows a notification banner
- **Consistent service layer** — all unit mutations (create, update, delete, rename) go through `IWorkUnitService`, shared by web and CLI

---

## Non-Goals

- **Workflow-scoped unit editing** — units are workspace-level templates, not per-workflow copies. This feature does NOT add local copies of units inside workflow directories.
- **Per-node sync indicators** — since graph nodes always load the latest unit content, there is nothing to "sync" at the node level. A page-level banner is sufficient.
- **Template bundle staleness** — `.chainglass/templates/` bundles with copied units are a separate concern, deferred to a future plan.
- **Unit versioning/publishing** — no version control workflow (draft → published). Units are always live. Deferred.
- **Unit marketplace/sharing** — no cross-workspace unit sharing. Deferred.
- **Undo/redo for structural changes** — browser-native undo for text content. Structural undo (input/output additions/removals) deferred — auto-save + git provides recovery.
- **Cross-page drag-and-drop** — cannot drag from unit editor into workflow canvas. The workflow toolbox remains the drag source.

---

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `_platform/positional-graph` | existing | **modify** | Extend `IWorkUnitService` with CRUD write operations; update `FakeWorkUnitService` |
| `workflow-ui` | existing | **modify** | Add "Edit Template" navigation from node properties panel; add change notification banner |
| `_platform/events` | existing | **consume** | File watcher infrastructure for detecting unit catalog changes |
| `_platform/state` | existing | **consume** | Publish/subscribe "unit-catalog-changed" events for banner notification |
| `_platform/viewer` | existing | **modify** | Extract `CodeEditor` component from file-browser to shared location |
| `_platform/panel-layout` | existing | **consume** | `PanelShell` for editor page layout |
| `_platform/file-ops` | existing | **consume** | `IFileSystem`, `IPathResolver` for unit file I/O |
| `_platform/workspace-url` | existing | **consume** | `workspaceHref` for navigation and URL construction |
| `file-browser` | existing | **modify** | Extract `CodeEditor` out (backward-compatible re-export) |

No new domains required. The work unit editor is a new **business feature** (`058-workunit-editor`) that consumes existing infrastructure domains and extends `_platform/positional-graph`.

---

## Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=1, D=1, N=1, F=0, T=2 (Total P=7→CS-3, bumped to CS-4 for UI surface area)
- **Confidence**: 0.80

| Factor | Score | Rationale |
|--------|-------|-----------|
| Surface Area (S) | 2 | New feature folder, new server actions, service extension, component extraction, 2 page routes, multiple UI components |
| Integration (I) | 1 | State system, file watcher, SSE — all existing infrastructure, well-understood |
| Data/State (D) | 1 | Extending existing Zod schemas and service interface; no database or migration |
| Novelty (N) | 1 | Editor UX is new but workshops resolved major design questions; patterns exist in codebase |
| Non-Functional (F) | 0 | Standard performance expectations; no special security beyond existing path validation |
| Testing/Rollout (T) | 2 | Contract tests for extended service, component tests for editor, integration tests for CRUD cycle, doping for development |

**Assumptions**:
- Existing `CodeEditor` component can be extracted without breaking file-browser
- `@codemirror/lang-shell` installs cleanly for bash syntax highlighting
- State system can carry "unit-catalog-changed" events without new SSE channels

**Dependencies**:
- `_platform/positional-graph` package must be rebuilt after service interface changes
- `_platform/state` must be operational (already is)

**Risks**:
- CodeEditor extraction may surface hidden file-browser coupling
- Auto-save + Zod validation round-trips may feel slow for large units

**Phases** (suggested):
1. Service layer — extend IWorkUnitService with CRUD, update fakes, contract tests
2. Editor page — routes, layout, navigation, type-specific editors
3. Inputs/outputs — configuration form with expandable cards, reorder, validation
4. Change notifications — file watcher, state system event, banner component
5. Integration — "Edit Template" button on workflow canvas, end-to-end polish

---

## Acceptance Criteria

### Unit Creation
1. User can create a new work unit by selecting a type (agent, code, or user-input), entering a kebab-case slug, and optionally a description
2. Creation scaffolds the correct directory structure at `.chainglass/units/<slug>/` with `unit.yaml` and type-appropriate template files with starter boilerplate (agent: prompt with instructional header, code: script with shebang + comments, user-input: sensible defaults)
3. Duplicate slug is rejected with a clear error message
4. New unit appears in the editor's catalog list and the workflow toolbox without page refresh

### Unit Editing — Metadata
5. User can edit a unit's description and version fields
6. Changes auto-save to disk (debounced) and are reflected when any consumer next loads the unit

### Unit Editing — Template Content
7. Agent units: user can edit the prompt template file using a code editor with markdown syntax highlighting
8. Code units: user can edit the script file using a code editor with language-appropriate syntax highlighting (bash, python, javascript detected from filename)
9. User-input units: user can configure question type (text, single, multi, confirm), prompt text, and options list (for single/multi types, minimum 2 options)

### Unit Editing — Inputs & Outputs
10. User can add, edit, reorder, and remove input definitions (name, type, data_type, required, description)
11. User can add, edit, reorder, and remove output definitions (same fields)
12. Input names validate against the pattern `/^[a-z][a-z0-9_]*$/` with real-time feedback
13. When type is 'data', data_type is required and shown; when type is 'file', data_type is hidden
14. Reserved input params (`main-prompt`, `main-script`) are shown as read-only and cannot be edited or deleted
15. Every unit must have at least one output (enforced by validation)

### Unit Deletion
16. User can delete a work unit from the catalog
17. Deletion removes the entire `.chainglass/units/<slug>/` directory

### Unit Renaming
18. User can rename a work unit (changes slug and directory name)
19. Renaming automatically updates `unit_slug` references in all `node.yaml` files across all workflows in the workspace
20. Renaming shows a summary of affected workflows before confirming

### Navigation
21. User can access the work unit editor from a dedicated "Work Units" entry in the workspace sidebar, positioned before "Workflows"
22. User can navigate to the work unit editor from a workflow node's properties panel via an "Edit Template" button
23. "Edit Template" navigation preserves return context so the user can navigate back to the workflow

### Change Notifications
24. When a work unit file changes on disk (edited by another window, CLI, or external tool), the workflow page shows a banner: "Work unit templates have been updated. Refresh to load the latest versions."
25. The banner is dismissible and re-appears on subsequent changes
26. Refreshing the page picks up all unit changes (toolbox catalog, node metadata, canvas rendering)

### Service Layer
27. All unit mutations (create, update, delete, rename) are performed through `IWorkUnitService` methods, not direct filesystem writes
28. `FakeWorkUnitService` is updated to support write operations for testing
29. Contract tests verify both real and fake implementations behave identically for all CRUD operations

---

## Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| CodeEditor extraction breaks file-browser | Low | Medium | Backward-compatible re-export from file-browser; test both consumers |
| Auto-save causes data loss on rapid edits | Low | High | Debounce (500ms for content, immediate for structural changes); atomic writes |
| Unit rename breaks workflow references silently | Low | Medium | Auto-update all `node.yaml` files; show affected workflows summary before confirming |
| State system event storms from file watchers | Low | Low | 200ms debounce on watcher (same as workflow watcher) |

**Assumptions**:
- Units are small (< 500 lines of prompt/script content) — no need for virtual scrolling in the editor
- The number of units in a workspace is manageable (< 100) — no need for pagination in the catalog list
- Users understand that editing a unit affects all workflows that reference it (since there are no local copies)

---

## Open Questions

All resolved — see Clarifications below.

---

## Testing Strategy

- **Approach**: Full TDD
- **Mock Policy**: No mocks — fakes only. Use `FakeWorkUnitService`, `FakeFileSystem`, `FakeYamlParser` etc.
- **Rationale**: Complex service layer with discriminated types and filesystem interactions. TDD ensures correctness for CRUD operations, schema validation, and edge cases. Fakes maintain contract parity with real implementations.
- **Focus Areas**:
  - Contract tests for extended `IWorkUnitService` (create, update, delete, rename) — both real and fake
  - Unit tests for Zod schema validation edge cases
  - Component tests for editor UI (type-specific forms, input/output card list)
  - Integration tests for CRUD round-trips (create → load → update → load → delete)
  - Doping script extension for work unit editor development
- **Excluded**: No e2e browser tests for this plan. Manual verification via doped scenarios.

## Documentation Strategy

- **Approach**: No new documentation
- **Rationale**: Internal feature — domain.md and code comments are sufficient. No new docs/how/ guides.

---

## Clarifications

### Session 2026-02-28

**Q1: Workflow Mode** → **Full** (CS-4 feature, multiple phases, all gates required)

**Q2: Testing Strategy** → **Full TDD** with fakes only, no mocks

**Q3: Mock Usage** → **Fakes only** — use existing `FakeWorkUnitService`, `FakeFileSystem`, etc. No jest.mock or similar.

**Q4: Documentation Strategy** → **No new documentation** — internal feature, code is self-documenting

**Q5: Domain Review** → **Approved as-is** — CodeEditor extraction to `_platform/viewer` confirmed. No domain boundary changes.

**Q6: Unit creation boilerplate** → **Boilerplate** — scaffold with starter content for each type. Agent units get a starter prompt template, code units get a shebang + comments, user-input units get sensible defaults.

**Q7: Rename cascade** → **Auto-update** — rename finds and rewrites `unit_slug` in all `node.yaml` files across all workflows in the workspace. No manual cleanup needed.

**Q8: Sidebar placement** → **Before Workflows** — "Work Units" appears before "Workflows" in the workspace sidebar (more prominent, since units are the building blocks).

---

## Workshop Opportunities

All major design topics have been workshopped. No additional workshops recommended at this time.

| Topic | Status | Workshop |
|-------|--------|----------|
| Sync model & change notification | ✅ Resolved | `workshops/001-sync-model-and-out-of-sync-indicators.md` |
| Editor UX flow & navigation | ✅ Resolved | `workshops/002-editor-ux-flow-navigation.md` |
| Code/prompt editor component | ✅ Resolved | `workshops/003-code-prompt-editor-component-selection.md` |
| IWorkUnitService write extension | ✅ Resolved | `workshops/004-iworkunitservice-write-extension-design.md` |
| Inputs/outputs configuration UX | ✅ Resolved | `workshops/005-inputs-outputs-configuration-ux.md` |
