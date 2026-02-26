# DYK: Phase 2 — Canvas Core + Layout

**Generated**: 2026-02-26
**Context**: Phase 2 tasks dossier review

---

## Insights

### 1. Standalone Layout — No PanelShell (DECISION)

PanelShell was designed for file-browser's explorer+left+main pattern. The workflow editor needs temp-bar+main+right — fundamentally different. Rather than contorting PanelShell with optional props and risking cross-domain breakage, Phase 2 uses a standalone flexbox layout component inside the feature folder. Zero cross-domain changes to `_platform/panel-layout`.

**Action**: T001 (Extend PanelShell) dropped. T002 builds `workflow-editor-layout.tsx` — simple flexbox, ~20 lines.

### 2. `ready` Status Computed Server-Side Per Node (DECISION)

Of 8 node statuses, `ready` is the only computed one (5 readiness gate checks via `getNodeStatus()`). The `loadWorkflow` server action will call `getNodeStatus()` for every node and return computed status alongside persisted status. N+1 but negligible for expected graph sizes.

**Action**: T003 `loadWorkflow` returns `Record<nodeId, ComputedNodeStatus>` alongside definition and state.

### 3. List Page N+1 Is Acceptable (DECISION)

`IPositionalGraphService.list()` returns only slugs. The list page needs description, line count, node count, status per workflow. Server action does `load()` + `loadGraphState()` per slug. Fine for expected scale. No need for a `listWithSummary()` service method.

**Action**: T003 `listWorkflows` does straightforward N+1 loads.

### 4. AC-01 Spec Stale — Toolbox Is Right Panel (AWARENESS)

AC-01 text says "left panel (work unit toolbox)" but Q13 clarification explicitly overrides to right panel. Plan, dossier, and workshops all correctly use right panel. Spec AC-01 text is pre-clarification and stale. Clarifications section is authoritative.

**Action**: None — dossier already correct. Flag for reviewers.

### 5. List Page Is Dead Simple (AWARENESS)

The workflow list page is just a table/card list with two buttons. No sidebar, no panels, no complex layout. Server component → client list component → done. Don't over-engineer it.

**Action**: T001 stays simple — no layout component, just a full-width page.
