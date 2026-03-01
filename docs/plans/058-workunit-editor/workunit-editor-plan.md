# Work Unit Creator & Editor — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-28
**Spec**: [workunit-editor-spec.md](./workunit-editor-spec.md)
**Status**: COMPLETE (All 5 phases done)
**Mode**: Full
**Complexity**: CS-4 (large)

## Summary

Work units are the building blocks of workflows — reusable template definitions for agent prompts, code scripts, and human input questions. Currently they can only be created via CLI or manual YAML editing. This plan adds a visual editor for creating, editing, and managing work unit templates, extends `IWorkUnitService` with CRUD write operations, and wires up file change notifications so the workflow page alerts users when units are updated.

Graph nodes store only a `unit_slug` reference and always load the latest unit from the global catalog — there are no local copies. This means the sync model is simple: edit the unit in its home location, and all workflows automatically see the changes on next load. A banner notification prompts workflow users to refresh.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| `_platform/positional-graph` | existing | **modify** | Extend IWorkUnitService with CRUD; update FakeWorkUnitService; rename cascade logic |
| `workflow-ui` | existing | **modify** | "Edit Template" button on node properties panel; change notification banner |
| `_platform/viewer` | existing | **modify** | Extract CodeEditor component from file-browser to shared location |
| `_platform/events` | existing | **consume** | File watcher infrastructure for unit catalog changes |
| `_platform/state` | existing | **consume** | Publish/subscribe "unit-catalog-changed" events |
| `_platform/panel-layout` | existing | **consume** | PanelShell for editor page layout |
| `_platform/file-ops` | existing | **consume** | IFileSystem, IPathResolver for unit file I/O |
| `_platform/workspace-url` | existing | **consume** | workspaceHref for navigation |
| `file-browser` | existing | **modify** | Backward-compatible re-export after CodeEditor extraction |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| **Phase 1 — Service Layer** | | | |
| `packages/positional-graph/.../workunit-service.interface.ts` | `_platform/positional-graph` | contract | Extend IWorkUnitService with CRUD. Per ADR-0003: types from Zod. |
| `packages/positional-graph/.../workunit.service.ts` | `_platform/positional-graph` | internal | Implement CRUD methods |
| `packages/positional-graph/.../fake-workunit.service.ts` | `_platform/positional-graph` | internal | Update fake with write ops + assertion helpers |
| `packages/positional-graph/.../workunit-errors.ts` | `_platform/positional-graph` | internal | New error codes (E188-E190) |
| `packages/positional-graph/.../workunit.adapter.ts` | `_platform/positional-graph` | internal | Write helpers. Per ADR-0008: extends WorkspaceDataAdapterBase. |
| `test/contracts/workunit-service.contract.ts` | test | internal | Contract tests for CRUD operations |
| `test/unit/positional-graph/.../workunit.service.test.ts` | test | internal | Unit tests for new methods |
| **Phase 2 — Editor Pages** | | | |
| `apps/web/src/features/_platform/viewer/components/code-editor.tsx` | `_platform/viewer` | contract | Extracted CodeEditor (shared) |
| `apps/web/src/features/041-file-browser/components/code-editor.tsx` | `file-browser` | cross-domain | Re-export from _platform/viewer for backward compat |
| `apps/web/app/actions/workunit-actions.ts` | `058-workunit-editor` | internal | Server actions (DI via useFactory per R-ARCH-003) |
| `apps/web/app/(dashboard)/workspaces/[slug]/work-units/page.tsx` | `058-workunit-editor` | internal | Work unit list page (Server Component) |
| `apps/web/app/(dashboard)/workspaces/[slug]/work-units/[unitSlug]/page.tsx` | `058-workunit-editor` | internal | Work unit editor page (Server Component) |
| `apps/web/src/features/058-workunit-editor/components/unit-list.tsx` | `058-workunit-editor` | internal | Unit catalog list component |
| `apps/web/src/features/058-workunit-editor/components/agent-editor.tsx` | `058-workunit-editor` | internal | Agent prompt editor (CodeMirror markdown) |
| `apps/web/src/features/058-workunit-editor/components/code-unit-editor.tsx` | `058-workunit-editor` | internal | Code script editor (CodeMirror + lang detection) |
| `apps/web/src/features/058-workunit-editor/components/user-input-editor.tsx` | `058-workunit-editor` | internal | User-input form builder |
| `apps/web/src/features/058-workunit-editor/components/unit-creation-modal.tsx` | `058-workunit-editor` | internal | Type picker + naming modal |
| `apps/web/src/features/058-workunit-editor/types.ts` | `058-workunit-editor` | internal | Shared types for editor feature |
| `apps/web/src/lib/navigation-utils.ts` | cross-domain | cross-domain | Add "Work Units" to WORKSPACE_NAV_ITEMS |
| **Phase 3 — Inputs/Outputs** | | | |
| `packages/workflow/src/features/023-central-watcher-notifications/workunit-catalog-watcher.adapter.ts` | `_platform/events` | internal | Work unit catalog file watcher adapter |
| `apps/web/src/features/027-central-notify-events/unit-catalog-domain-event.adapter.ts` | `_platform/events` | internal | SSE event bridge for unit catalog changes |
| `apps/web/src/features/050-workflow-page/components/workunit-updated-banner.tsx` | `workflow-ui` | internal | Dismissible banner for unit catalog changes |
| `apps/web/src/features/058-workunit-editor/hooks/use-workunit-catalog-changes.ts` | `058-workunit-editor` | contract | SSE hook for unit catalog change subscription |
| `apps/web/src/features/058-workunit-editor/components/input-output-card-list.tsx` | `058-workunit-editor` | internal | Expandable card list container with DnD |
| `apps/web/src/features/058-workunit-editor/components/input-output-card.tsx` | `058-workunit-editor` | internal | Individual card with form fields |
| `test/unit/web/features/058-workunit-editor/input-output-card-list.test.ts` | test | internal | Validation + interaction tests |
| **Phase 4 — Notifications & Integration** | | | |
| `packages/workflow/src/features/058-workunit-editor/workunit-catalog-watcher.adapter.ts` | `_platform/events` | internal | File watcher for .chainglass/units/ |
| `apps/web/src/features/058-workunit-editor/components/workunit-updated-banner.tsx` | `058-workunit-editor` | internal | Banner notification component |
| `apps/web/src/features/058-workunit-editor/hooks/use-workunit-catalog-changes.ts` | `058-workunit-editor` | internal | Hook wrapping useGlobalState |
| `apps/web/src/features/050-workflow-page/components/node-properties-panel.tsx` | `workflow-ui` | internal | Add "Edit Template" button |
| `apps/web/src/lib/di-container.ts` | cross-domain | cross-domain | Register WorkUnitCatalogWatcherAdapter |
| **Phase 5 — Polish** | | | |
| `scripts/dope-workflows.ts` | test | internal | Extend with work unit editor scenarios |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Two `IWorkUnitService` interfaces exist (workgraph + positional-graph) with divergent signatures. Workgraph already has `create()` but positional-graph does not. | Extend positional-graph only. Workgraph is deprecated — do not update it. |
| 02 | Critical | File watcher infrastructure watches `.chainglass/data/` only. Units at `.chainglass/units/` are outside the watched path. | Extend CentralWatcherService to also watch `.chainglass/units/` directory. |
| 03 | High | CodeEditor in file-browser is a thin standalone wrapper — minimal coupling. Ready for extraction. | Move to `_platform/viewer`, re-export from file-browser for backward compat. |
| 04 | High | Sidebar navigation defined in `navigation-utils.ts` via `WORKSPACE_NAV_ITEMS` array. Simple to add. | Add "Work Units" entry before "Workflows" with route `/work-units`. |
| 05 | High | Rename cascade must update `unit_slug` in all `node.yaml` files across all graphs AND templates. `state.json` and `graph.yaml` do NOT store unit_slug. | Scan `.chainglass/data/workflows/*/nodes/*/node.yaml` + `.chainglass/templates/workflows/*/nodes/*/node.yaml`. |
| 06 | Medium | `@codemirror/lang-shell` needed for bash syntax highlighting. Must verify peer dependency compatibility with existing `@uiw/react-codemirror@^4.25.4`. | Install and verify during Phase 2 — fallback to plain text if incompatible. |

## Phases

### Phase 1: Service Layer — Extend IWorkUnitService with CRUD ✅ COMPLETE

**Objective**: Add create, update, delete, and rename operations to the work unit service with full TDD and contract test coverage.
**Domain**: `_platform/positional-graph`
**Status**: ✅ Complete (2026-02-28)
**Evidence**: 333 test files, 4718 tests passing (+37 from baseline). 40 contract tests (20 per implementation).
**Delivers**:
- Extended `IWorkUnitService` interface with 4 new methods
- Real implementation in `WorkUnitService`
- Updated `FakeWorkUnitService` with call capture
- Contract tests ensuring fake/real parity
- Unit tests for all CRUD operations and edge cases
- Rename cascade logic (update unit_slug in node.yaml files across all workflows)
**Depends on**: None
**Key risks**: Interface extension must be additive to avoid breaking existing consumers. Rename cascade needs thorough audit of unit_slug references.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Extend `IWorkUnitService` interface with `create()`, `update()`, `delete()`, `rename()` signatures | `_platform/positional-graph` | Interface compiles; existing consumers unaffected | Per W004: partial patch for update, hard delete, atomic writes. Per ADR-0003: types derive from Zod schemas. |
| 1.2 | Add new error codes E188 (slug exists), E190 (delete failed) | `_platform/positional-graph` | Error factories tested | E189 reserved for future concurrency |
| 1.3 | Update `FakeWorkUnitService` with write operations, call capture, and assertion helpers | `_platform/positional-graph` | Fake supports create/update/delete/rename; assertCreateCalled(), getCallCount() helpers | Per constitution Principle 2: fake before real |
| 1.4 | Write contract tests for all CRUD operations (RED phase) | test | Tests fail against current service (no write methods yet); pass against fake | Extend `test/contracts/workunit-service.contract.ts`. Per constitution Principle 3: RED first. |
| 1.5 | Add write helpers to `WorkUnitAdapter` (ensureUnitDir, removeUnitDir, renameUnitDir) | `_platform/positional-graph` | Helpers tested with FakeFileSystem | Per ADR-0008: extends WorkspaceDataAdapterBase |
| 1.6 | Implement `create()` — scaffold directory + unit.yaml + boilerplate template files (GREEN phase) | `_platform/positional-graph` | TDD: contract tests pass for create agent/code/user-input units | Per clarification Q6: starter boilerplate per type |
| 1.7 | Implement `update()` — partial patch for metadata, inputs, outputs, type-specific config (GREEN phase) | `_platform/positional-graph` | TDD: contract tests pass for update metadata, add/remove inputs | Per W004: scalars overwrite, arrays replace, Zod re-validate |
| 1.8 | Implement `delete()` — remove unit directory, idempotent (GREEN phase) | `_platform/positional-graph` | TDD: contract tests pass for delete existing + non-existent (idempotent) | Hard delete, no soft delete |
| 1.9 | Implement `rename()` — rename directory + update unit_slug in all node.yaml files (GREEN phase) | `_platform/positional-graph` | TDD: contract tests pass for rename + cascade to node.yaml files | Per clarification Q7: auto-update all references. Per finding 05. |
| 1.10 | Rebuild positional-graph package, verify no downstream breaks | `_platform/positional-graph` | `pnpm build` passes; `pnpm test` passes | Per finding 01: workgraph NOT updated |

#### Acceptance Criteria (Phase 1)
- [x] AC-1: Create unit with type/slug/description
- [x] AC-2: Scaffold with boilerplate content
- [x] AC-3: Duplicate slug rejected
- [x] AC-5: Edit description and version
- [x] AC-10: Add/edit/reorder/remove inputs (service layer)
- [x] AC-11: Add/edit/reorder/remove outputs (service layer)
- [x] AC-12: Input name validation (service layer)
- [x] AC-13: data_type conditional (service layer)
- [x] AC-14: Reserved params handling (service layer)
- [x] AC-15: At least one output enforced (service layer)
- [x] AC-16: Delete unit
- [x] AC-17: Deletion removes directory
- [x] AC-18: Rename unit
- [x] AC-19: Rename auto-updates node.yaml references
- [x] AC-20: Rename shows affected workflows summary
- [x] AC-27: All mutations through IWorkUnitService
- [x] AC-28: FakeWorkUnitService updated
- [x] AC-29: Contract tests pass

---

### Phase 2: Editor Page — Routes, Layout, Type-Specific Editors ✅ COMPLETE

**Objective**: Build the work unit editor UI with list page, editor page, and type-specific editing experiences.
**Domain**: `058-workunit-editor` (new feature folder) + `_platform/viewer` + `file-browser`
**Status**: ✅ Complete (2026-02-28)
**Evidence**: 334 test files, 4727 tests passing (+9 from Phase 1). 7 useAutoSave hook tests. Code review fixes applied.
**Delivers**:
- Work unit list page at `/workspaces/[slug]/work-units/`
- Work unit editor page at `/workspaces/[slug]/work-units/[unitSlug]/`
- CodeEditor extracted to `_platform/viewer` (shared, backward-compat re-export)
- Type-specific editors: prompt (agent), script (code), form builder (user-input)
- Server actions for CRUD (unified saveUnitContent routing)
- Sidebar navigation entry ("Work Units" before Workflows)
- `@codemirror/legacy-modes` for bash syntax highlighting (lang-shell doesn't exist in npm)
- Reusable `useAutoSave` hook in `_platform/hooks`
- `SaveIndicator` component (persistent inline error banner)
- Domain registered: `058-workunit-editor` in registry, domain.md, domain-map
**Depends on**: Phase 1
**Key risks**: CodeEditor extraction (finding 03) — resolved; lang-shell compatibility (finding 06) — fallback to legacy-modes.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Extract `CodeEditor` from `041-file-browser` to `_platform/viewer/components/code-editor.tsx` | `_platform/viewer` | File-browser still works (re-export); CodeEditor importable from viewer | Per finding 03: thin wrapper, minimal coupling |
| 2.2 | Install `@codemirror/lang-shell`, add bash language support to CodeEditor | `_platform/viewer` | Bash files get syntax highlighting; no peer dep conflicts | Per finding 06: fallback to plain text if needed |
| 2.3 | Create server actions in `apps/web/app/actions/workunit-actions.ts` | `058-workunit-editor` | Actions: createUnit, updateUnit, deleteUnit, renameUnit, loadUnitContent, saveUnitContent | Follow workflow-actions.ts DI pattern (useFactory per R-ARCH-003) |
| 2.4 | Add "Work Units" to sidebar navigation | cross-domain | Entry appears before "Workflows" in workspace sidebar | Per clarification Q8 + finding 04 |
| 2.5 | Create list page: `/workspaces/[slug]/work-units/page.tsx` | `058-workunit-editor` | Shows all units grouped by type, create button, delete/rename actions | Server Component loading data |
| 2.6 | Create editor page: `/workspaces/[slug]/work-units/[unitSlug]/page.tsx` | `058-workunit-editor` | 3-panel layout: left catalog, main type-specific editor, right config | Per W002: PanelShell layout |
| 2.7 | Build agent editor — prompt template editing with CodeMirror (markdown) | `058-workunit-editor` | Edit prompt, auto-save (500ms debounce), markdown highlighting | Per W003: reuse CodeEditor |
| 2.8 | Build code editor — script editing with language detection | `058-workunit-editor` | Edit script, auto-save, language detected from filename | Bash, Python, JS supported |
| 2.9 | Build user-input editor — question config form | `058-workunit-editor` | Configure question_type, prompt, options (min 2 for single/multi) | Per W002: form controls, not code editor |
| 2.10 | Unit creation flow — type picker + naming modal + scaffold | `058-workunit-editor` | Create new unit from list or editor page; kebab-case validation | Per W002 + clarification Q6 |
| 2.11 | Metadata editing — description, version fields with auto-save | `058-workunit-editor` | Fields save on change; reflected in list page | |

#### Acceptance Criteria (Phase 2)
- [x] AC-4: New unit appears in catalog without page refresh
- [x] AC-6: Metadata auto-save to disk
- [x] AC-7: Agent prompt editing with markdown highlighting
- [x] AC-8: Code script editing with language detection
- [x] AC-9: User-input configuration (question type, options)
- [x] AC-21: Sidebar navigation entry (before Workflows)

---

### Phase 3: Inputs/Outputs Configuration

**Objective**: Build the input/output configuration form with expandable cards, reorder, validation.
**Domain**: `058-workunit-editor`
**Delivers**:
- Expandable card list for inputs and outputs
- Add, edit, reorder (dnd-kit), delete operations
- Real-time Zod validation with inline error feedback
- Reserved params shown as locked cards
- Type-conditional fields (data_type shown/hidden based on type)
**Depends on**: Phase 2
**Key risks**: None — self-contained UI work. dnd-kit already installed.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Build `InputOutputCardList` component — expandable cards with collapsed/expanded states | `058-workunit-editor` | Cards show summary when collapsed, full form when expanded | Per W005: expandable card list pattern |
| 3.2 | Build `InputOutputCard` component — form fields for name, type, data_type, required, description | `058-workunit-editor` | All fields editable; data_type conditional on type='data' | Per W005 |
| 3.3 | Add reorder with `@dnd-kit/sortable` — drag handles on cards | `058-workunit-editor` | Drag to reorder inputs/outputs; order persists to unit.yaml | Per W005 |
| 3.4 | Add/delete operations — append card, hover-reveal delete with confirmation | `058-workunit-editor` | Add appends card with defaults; delete requires confirmation; last output cannot be deleted | Per W005 |
| 3.5 | Reserved params — show `main-prompt`/`main-script` as locked, non-editable cards | `058-workunit-editor` | Reserved params visible but not editable, not deletable, not draggable | Per W005 |
| 3.6 | Validation — inline Zod errors, name regex, required field enforcement | `058-workunit-editor` | Invalid names show red border + message; submit blocked until valid | Per W005: two-tier validation |
| 3.7 | Auto-save structural changes — immediate save on add/remove/reorder | `058-workunit-editor` | Changes persist via updateUnit() server action | Per W005: immediate, not debounced |

#### Acceptance Criteria (Phase 3)
- [x] AC-10: Add, edit, reorder, remove inputs
- [x] AC-11: Add, edit, reorder, remove outputs
- [x] AC-12: Name validation with real-time feedback
- [x] AC-13: data_type conditional on type
- [x] AC-14: Reserved params read-only
- [x] AC-15: At least one output enforced

---

### Phase 4: Change Notifications & Workflow Integration

**Objective**: Wire up file change detection for the unit catalog and integrate the editor with the workflow page.
**Domain**: `_platform/events` + `_platform/state` + `workflow-ui`
**Delivers**:
- `WorkUnitCatalogWatcherAdapter` watching `.chainglass/units/`
- State system event on unit changes
- Banner notification on workflow page
- "Edit Template" button on workflow node properties panel
- Return navigation from editor back to workflow
**Depends on**: Phase 2
**Key risks**: File watcher path scope (finding 02) — CentralWatcherService may need extension to watch units directory.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | Extend CentralWatcherService to watch `.chainglass/units/` directory | `_platform/events` | File changes in units/ trigger watcher callbacks | Per finding 02: currently only watches data/ |
| 4.2 | Create `WorkUnitCatalogWatcherAdapter` — filter unit.yaml + template file changes, 200ms debounce | `_platform/events` | Adapter fires on unit create/modify/delete events | Follow WorkflowWatcherAdapter pattern |
| 4.3 | Publish state system event on unit catalog changes | `_platform/state` | `useGlobalState('unit-catalog', 'changed')` receives events | Per W001 |
| 4.4 | Build `WorkUnitUpdatedBanner` component on workflow page | `workflow-ui` | Banner appears when units change; dismissible; "Refresh" button calls router.refresh() | Per W001 |
| 4.5 | Add "Edit Template" button on `NodePropertiesPanel` | `workflow-ui` | Button navigates to `/work-units/[unitSlug]?from=workflow&graph=[graphSlug]` | Per W002: preserves return context |
| 4.6 | Return navigation — breadcrumb/back button from editor to workflow | `058-workunit-editor` | Editor shows "Back to Workflow" when `from=workflow` query param present | Per AC-23 |
| 4.7 | Register watcher adapter in DI container and start-central-notifications | cross-domain | Watcher active when dev server runs | |

#### Acceptance Criteria (Phase 4)
- [x] AC-22: "Edit Template" on workflow node properties panel
- [x] AC-23: Return context preserved (back to workflow)
- [x] AC-24: Banner appears on unit file change
- [x] AC-25: Banner dismissible, re-appears on next change
- [x] AC-26: Refresh picks up all unit changes

---

### Phase 5: Polish & End-to-End Verification ✅ COMPLETE

**Objective**: End-to-end verification, doping extension, and final polish.
**Domain**: All
**Delivers**:
- Doping script extended with sample work unit scenarios
- Full TDD cycle verification (all ACs pass)
- Cross-browser spot check
- Cleanup and code review readiness
**Depends on**: Phases 1-4
**Key risks**: None — verification and polish only.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 5.1 | Extend doping script with work unit editor scenarios | test | `just dope` creates sample units covering all 3 types | Enables rapid UI development |
| 5.2 | End-to-end walkthrough: create → edit → use in workflow → rename → delete | all | Full lifecycle works without errors | Manual verification |
| 5.3 | Verify `just fft` passes (lint, format, typecheck, test) | all | Zero failures | Gate before commit |
| 5.4 | Verify file-browser still works after CodeEditor extraction | `file-browser` | Browser page renders code with syntax highlighting | Regression check |

#### Acceptance Criteria (Phase 5)
- [x] All 29 acceptance criteria from spec verified
- [x] `just fft` passes
- [x] File-browser regression check passes

---

## Acceptance Criteria (Full List)

- [x] AC-1: Create unit with type/slug/description _(Phase 1)_
- [x] AC-2: Scaffold with boilerplate content _(Phase 1)_
- [x] AC-3: Duplicate slug rejected _(Phase 1)_
- [x] AC-4: New unit appears in catalog without refresh _(Phase 2)_
- [x] AC-5: Edit description and version _(Phase 1)_
- [x] AC-6: Auto-save to disk (debounced) _(Phase 2)_
- [x] AC-7: Agent prompt editing (markdown highlighting) _(Phase 2)_
- [x] AC-8: Code script editing (language detection) _(Phase 2)_
- [x] AC-9: User-input configuration _(Phase 2)_
- [x] AC-10: Add/edit/reorder/remove inputs _(Phase 1 — service layer)_
- [x] AC-11: Add/edit/reorder/remove outputs _(Phase 1 — service layer)_
- [x] AC-12: Input name validation _(Phase 1 — service layer)_
- [x] AC-13: data_type conditional on type _(Phase 1 — service layer)_
- [x] AC-14: Reserved params read-only _(Phase 1 — service layer)_
- [x] AC-15: At least one output enforced _(Phase 1 — service layer)_
- [x] AC-16: Delete unit _(Phase 1)_
- [x] AC-17: Deletion removes directory _(Phase 1)_
- [x] AC-18: Rename unit _(Phase 1)_
- [x] AC-19: Rename auto-updates node.yaml references _(Phase 1)_
- [x] AC-20: Rename shows affected workflows summary _(Phase 1)_
- [x] AC-21: Sidebar navigation (before Workflows) _(Phase 2)_
- [x] AC-22: "Edit Template" from workflow node
- [x] AC-23: Return context preserved
- [x] AC-24: Banner on unit file change
- [x] AC-25: Banner dismissible, re-appears
- [x] AC-26: Refresh picks up changes
- [x] AC-27: All mutations through IWorkUnitService _(Phase 1)_
- [x] AC-28: FakeWorkUnitService updated _(Phase 1)_
- [x] AC-29: Contract tests pass _(Phase 1)_

## Risks

| Risk | Likelihood | Impact | Mitigation | Phase |
|------|-----------|--------|------------|-------|
| Dual IWorkUnitService interfaces (workgraph + positional-graph) | Confirmed | High | Extend positional-graph only; workgraph is deprecated | 1 |
| File watcher doesn't cover .chainglass/units/ | Confirmed | High | Extend CentralWatcherService watch path | 4 |
| CodeEditor extraction breaks file-browser | Low | Medium | Backward-compatible re-export; regression test | 2 |
| Rename cascade misses unit_slug references | Medium | Medium | Audit all files storing unit_slug before implementing | 1 |
| @codemirror/lang-shell peer dep conflict | Low | Low | Verify at install; fallback to plain text | 2 |
| Auto-save race with concurrent reads | Low | Medium | atomicWriteFile + 500ms debounce | 2 |

## Progress

| Phase | Status | Date | Tests | Notes |
|-------|--------|------|-------|-------|
| Phase 1: Service Layer | ✅ Complete | 2026-02-28 | +37 tests (4718 total) | 10/10 tasks done. Interface extended, fake updated, contract tests passing, all CRUD implemented. |
| Phase 2: Editor Page | ✅ Complete | 2026-02-28 | +9 tests (4727 total) | 11/11 tasks done. Pages, editors, server actions, useAutoSave, domain registered. Code review fixes applied. |
| Phase 3: Inputs/Outputs | ✅ Complete | 2026-03-01 | +12 tests (4739 total) | 7/7 tasks done. InputOutputCard, InputOutputCardList, drag reorder, reserved params, validation, wired into editor, auto-save + tests. Browser-verified on all 3 unit types. |
| Phase 4: Notifications | ✅ Complete | 2026-03-01 | +0 tests (4744 total) | 7/7 tasks done. WorkUnitCatalogWatcherAdapter, SSE-based banner, Edit Template button, return navigation. |
| Phase 5: Polish | ✅ Complete | 2026-03-01 | 0 new (4749 total) | Doping script extended, all 29 ACs verified, FFT clean, file-browser regression clear. |

### Domain Changes Log

| Date | Phase | Domain | Change Type | Details |
|------|-------|--------|-------------|---------|
| 2026-02-28 | Phase 1 | `_platform/positional-graph` | contract | Extended `IWorkUnitService` with `create()`, `update()`, `delete()`, `rename()` + 6 result/spec types + E188/E190 error codes |
| 2026-02-28 | Phase 1 | `_platform/positional-graph` | internal | Updated `FakeWorkUnitService` with write ops, call tracking, assertion helpers |
| 2026-02-28 | Phase 1 | `_platform/positional-graph` | internal | Added `WorkUnitAdapter` write helpers: `ensureUnitDir`, `removeUnitDir`, `renameUnitDir` |
| 2026-02-28 | Phase 1 | test | internal | Rewrote contract tests from workgraph→positional-graph (fixed E120→E180 drift) |
| 2026-02-28 | Phase 2 | `_platform/viewer` | contract | Extracted CodeEditor from file-browser; barrel export at `_platform/viewer/index.ts` |
| 2026-02-28 | Phase 2 | `_platform/viewer` | internal | Added bash/shell/sh language support via `@codemirror/legacy-modes` + `StreamLanguage` |
| 2026-02-28 | Phase 2 | `_platform/hooks` | contract | Created `useAutoSave` hook (debounce, status tracking, error handling, flush) |
| 2026-02-28 | Phase 2 | `058-workunit-editor` | new domain | Created domain: server actions, list page, editor page, type-specific editors, creation modal |
| 2026-02-28 | Phase 2 | `058-workunit-editor` | internal | Unified `saveUnitContent` routing: agent→setPrompt, code→setScript, user-input→update(type_config) |
| 2026-02-28 | Phase 2 | `file-browser` | internal | CodeEditor replaced with re-export from `_platform/viewer` (backward compat) |
| 2026-02-28 | Phase 2 | cross-domain | internal | Added "Work Units" to `WORKSPACE_NAV_ITEMS` before Workflows (Puzzle icon) |

### Deviation Notes

- **T009 (rename cascade)**: Implemented inline in WorkUnitService rather than delegated to IPositionalGraphService (DYK #1 recommended delegation). Current impl works correctly; delegation can be refactored later if the graph service interface needs extension for other reasons.
- **DYK #2 (atomicWriteFile)**: Was flagged as missing from positional-graph, but actually already existed at `src/services/atomic-file.ts`. No copy needed.
