# Workshop: Sync Model & Change Notification

**Type**: Integration Pattern
**Plan**: 058-workunit-editor
**Spec**: (pending — pre-spec workshop from research dossier)
**Created**: 2026-02-28
**Status**: Draft

**Related Documents**:
- [Research Dossier](../research-dossier.md) — Critical Finding 02 (Resync), Finding 03 (No catalog eventing)
- [Events Domain](../../../domains/_platform/events/domain.md) — SSE + FileChangeHub patterns
- [Workflow UI Domain](../../../domains/workflow-ui/domain.md) — Canvas indicators, SSE subscription

**Domain Context**:
- **Primary Domain**: `_platform/positional-graph` (owns IWorkUnitService)
- **Related Domains**: `_platform/events` (SSE transport, file change hub), `_platform/state` (global state system), `workflow-ui` (canvas consumer)

---

## Purpose

Define how the workflow UI learns that work unit templates have changed and notifies the user. This workshop was dramatically simplified after confirming the actual data model: graph nodes store only a `unit_slug` reference and always load the latest unit content from the global catalog at runtime — there are no local copies to get stale.

## Key Questions Addressed

1. What does "out of sync" actually mean in this system?
2. How does the workflow page learn that units have changed?
3. What does the user see and what do they do about it?

---

## 1. The Data Model Reality

### Confirmed Storage Layout

```
.chainglass/units/<slug>/              ← Global catalog (canonical source)
  unit.yaml
  prompts/main.md                      ← Agent prompt template
  scripts/main.sh                      ← Code script

.chainglass/data/workflows/<slug>/     ← Working graphs
  graph.yaml                           ← Lines + node references
  state.json                           ← Execution state
  nodes/<nodeId>/
    node.yaml                          ← Stores unit_slug ONLY (no copy)
    data/data.json                     ← Runtime output data (created by orchestration)
```

### Key Insight: No Local Copies Exist

When `addNode()` drops a work unit onto a workflow, it writes **only** a `node.yaml` with a `unit_slug` reference:

```yaml
# node.yaml — reference only, no content
id: sample-coder-a66
unit_slug: sample-coder
created_at: 2026-02-28T...
```

At execution time, `IWorkUnitLoader.load(ctx, unitSlug)` resolves from the global catalog. The node always sees the current version. **There is nothing to "sync" at the node level.**

### What This Eliminates

- ~~Per-node staleness detection~~ — not needed
- ~~Content hashing (SHA-256)~~ — not needed
- ~~Per-node sync badges on canvas~~ — not needed
- ~~Individual/bulk sync operations~~ — not needed
- ~~Sync state machine (synced/stale/missing)~~ — not needed

---

## 2. Change Notification Design

### Problem

A user has the workflow editor open. In another window (or via CLI, or disk edit), someone modifies a work unit template. The workflow page should tell the user that the units powering their workflow may have changed.

### Solution: Banner Notification via State System

```
File change detected                    State system event                  UI banner
.chainglass/units/**  ───────►  "unit-catalog-changed"  ───────►  "Work units updated, refresh"
(watcher)                       (IStateService.set)               (useGlobalState subscription)
```

#### Step 1: File Watcher for Unit Catalog

Follow the existing `WorkflowWatcherAdapter` pattern. Create a `WorkUnitCatalogWatcherAdapter` that watches `.chainglass/units/` for changes (create, modify, delete of `unit.yaml` and template files).

**Debounce**: 200ms (same as workflow watcher) to batch rapid saves.

**Watch path**: `.chainglass/units/**/*.yaml` + `.chainglass/units/**/*.md` + `.chainglass/units/**/*.sh` (or just watch the whole `units/` tree).

#### Step 2: Publish to State System

On change detection, publish a state event via `IStateService`:

```typescript
stateService.set('unit-catalog', 'changed', {
  timestamp: Date.now(),
  slug: changedUnitSlug,  // which unit changed, if detectable
});
```

**Why state system over raw SSE?** The state system (`_platform/state`) is already wired into the web app with `useGlobalState()`. It handles SSE transport, reconnection, and provides a simple subscribe API. The workflow page already uses it for execution state updates.

#### Step 3: Banner Component on Workflow Page

```typescript
// In the workflow editor page
const unitCatalogState = useGlobalState('unit-catalog', 'changed');

// When state changes, show banner
if (unitCatalogState && unitCatalogState.timestamp > pageLoadTime) {
  return <WorkUnitUpdatedBanner onRefresh={() => router.refresh()} />;
}
```

**Banner behavior**:
- Appears at the top of the workflow editor page
- Message: "Work unit templates have been updated. Refresh to load the latest versions."
- Single action: "Refresh" button (calls `router.refresh()` to re-fetch server components)
- Dismissible (user can ignore if mid-edit)
- Re-appears if another change is detected after dismissal

### Why This Is Sufficient

Since graph nodes always load the latest unit via `IWorkUnitLoader.load()`, a page refresh causes:
1. Server components re-render
2. `listWorkUnits()` returns updated catalog for the toolbox
3. `loadWorkflow()` → `getStatus()` re-resolves all node unit references
4. Canvas re-renders with latest unit metadata (descriptions, types, inputs/outputs)
5. User sees current state — zero manual sync needed

---

## 3. Edge Cases

### Unit Deleted from Catalog

If a unit referenced by `unit_slug` in a graph node is deleted:
- `IWorkUnitLoader.load()` returns E180 (not found)
- `getStatus()` should surface this as a node-level error/warning
- The canvas shows the node in an error state (existing pattern for blocked nodes)
- User must remove the node or re-create the unit

### Unit Renamed

Renaming a unit changes its slug. Since nodes store `unit_slug`:
- Old slug → E180 (not found), same as deletion
- User must remove old node and add the new unit
- This is inherent to the slug-reference model

### Change During Active Execution

If a unit is edited while a workflow is running:
- Running nodes already loaded their unit config at startup — no effect on in-progress execution
- Nodes that haven't started yet will pick up the new version when they start
- This is correct behavior — no guard needed

### Multiple Editors Open

If two browser tabs have the workflow editor open:
- Both subscribe to state system
- Both see the banner when units change
- Each refreshes independently
- No conflicts — read-only consumption of the catalog

---

## 4. Implementation Sketch

### New Files

| File | Purpose |
|------|---------|
| `packages/workflow/src/features/058-workunit-editor/workunit-catalog-watcher.adapter.ts` | File watcher for `.chainglass/units/` changes |
| `apps/web/src/features/058-workunit-editor/components/workunit-updated-banner.tsx` | Banner component |
| `apps/web/src/features/058-workunit-editor/hooks/use-workunit-catalog-changes.ts` | Hook wrapping `useGlobalState('unit-catalog', 'changed')` |

### Modified Files

| File | Change |
|------|--------|
| `apps/web/src/lib/di-container.ts` | Register `WorkUnitCatalogWatcherAdapter` |
| Workflow editor page | Add banner component |

### Approximate Scope

~100-150 lines of new code. This is a small, well-bounded feature that follows existing patterns exactly.

---

## 5. Open Questions

| # | Question | Recommendation |
|---|----------|---------------|
| Q1 | Should the banner say WHICH unit changed? | Nice-to-have. Start with generic "units updated" message. Add specifics later if the watcher can identify the slug. |
| Q2 | Should the work unit editor page itself also show this banner? | Yes — if you're editing unit A and someone else edits unit B, you'd want to know. Same subscription. |
| Q3 | Should we also show this on the work unit list page? | Yes — same hook, same banner. Minimal effort. |

---

## 6. Relationship to Templates

**Deferred**: The `.chainglass/templates/` system (which DOES bundle unit copies) is a separate concern. If/when template staleness detection is needed, it can be addressed in a future plan. This workshop focuses only on the working graph → global catalog relationship, which is the primary user flow.

---

## Decision Log

| Decision | Resolution | Rationale |
|----------|-----------|-----------|
| Per-node sync indicators | **Rejected** | Graph nodes always load latest — nothing to sync |
| Content hashing | **Rejected** | No local copies to compare against |
| State system vs raw SSE | **State system** | Already wired, simple subscribe API, handles reconnection |
| Banner vs toast | **Banner** | Persistent, user-dismissible, clear action button. Toast is too transient for this. |
| Auto-refresh vs manual | **Manual** | User clicks "Refresh". Auto-refresh could disrupt mid-edit workflow canvas state. |
