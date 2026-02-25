# Workshop: Instance Unified Storage

**Type**: Storage Design
**Plan**: 048-wf-web
**Spec**: [wf-web-spec.md](../wf-web-spec.md)
**Created**: 2026-02-25
**Status**: Draft

**Related Documents**:
- [Workshop 001: Template/Instance Directory Layout](001-template-instance-directory-layout.md) — partially superseded
- [Workshop 002: Template Creation Flow & Node Identity](002-template-creation-flow-and-node-identity.md)
- [Positional Graph Domain](../../../domains/_platform/positional-graph/domain.md)

**Domain Context**:
- **Primary Domain**: `_platform/positional-graph` (owns graph persistence format)
- **Related Domains**: `_platform/file-ops` (IFileSystem for copy operations)

---

## Purpose

Resolve whether instance runtime data (state.json, node outputs, events) should be Git-tracked alongside instance definitions, or split into a separate gitignored path. This workshop supersedes the dual-path design from Workshops 001/002 and simplifies the instance storage model.

## Key Questions Addressed

- Should instance runtime data (state.json, outputs, events) be Git-tracked?
- Can we eliminate the `.chainglass/data/instances/` path entirely?
- What are the implications for the graph engine's path resolution?
- Does this simplify or complicate the InstanceAdapter and Phase 2/3 tasks?

---

## The Problem: Dual-Path Complexity

Workshops 001 and 002 established a split storage model:

```
WORKSHOP 001/002 DESIGN (BEING REVISITED):

.chainglass/instances/<wf>/<id>/          ← Git-tracked (definitions)
├── instance.yaml
├── graph.yaml
├── nodes/*/node.yaml
└── units/

.chainglass/data/instances/<wf>/<id>/     ← Gitignored (runtime)
├── graph.yaml          ← DUPLICATE of above
├── state.json
└── nodes/
    ├── <id>/node.yaml  ← DUPLICATE of above
    ├── <id>/outputs/
    ├── <id>/data/
    └── <id>/events.json
```

**Problems with this design**:

| Problem | Impact |
|---------|--------|
| Graph definition files duplicated in two locations | Staleness risk — tracked copy can diverge from runtime copy |
| After `git clone`, `data/instances/` doesn't exist | Instances not runnable without a hydration step |
| InstanceAdapter needs two path methods (`getInstanceDir` + `getInstanceDataDir`) | More complex adapter, more complex service code |
| `instantiate()` writes to two directories | Dual-write logic, more error surface |
| Engine reads from gitignored path | Workflow run results lost on clone — contradicts "Git-managed" goal |
| No audit trail of completed runs | Can't review what a workflow produced after the fact |

---

## The Proposal: Unified Instance Storage

**Everything lives under `.chainglass/instances/`. No `data/instances/` path.**

```
PROPOSED DESIGN:

.chainglass/instances/<wf>/<id>/          ← ALL Git-tracked
├── instance.yaml                         ← Metadata (template source, created_at, units)
├── graph.yaml                            ← Topology (from template, never changes)
├── state.json                            ← Runtime state (graph_status, node statuses)
├── nodes/
│   ├── <nodeId>/
│   │   ├── node.yaml                     ← Input wiring (from template)
│   │   ├── outputs/                      ← Agent-produced deliverables
│   │   │   └── main.md                   ← (example: generated spec, code, review)
│   │   ├── data/                         ← Session IDs, input caches
│   │   │   └── session.json
│   │   └── events.json                   ← Node event log
│   └── ...
└── units/                                ← Work unit definitions (from template)
    ├── spec-writer/
    │   ├── unit.yaml
    │   └── prompts/main.md
    └── ...
```

**Key change**: The graph engine reads AND writes directly to `.chainglass/instances/<wf>/<id>/`. No separate runtime path.

---

## Why Track Everything?

### Workflow runs produce valuable artifacts

The outputs of a workflow run — generated specs, code, reviews, decisions — are the actual **work product**. They belong in the repo alongside the code they inform.

```
Example: A "feature-planning" workflow instance produces:

  nodes/spec-writer-c3d/outputs/main.md     ← The feature spec
  nodes/programmer-a-e5f/outputs/main.md    ← Generated code
  nodes/reviewer-29b/outputs/main.md        ← Code review feedback
  nodes/summariser-3dc/outputs/main.md      ← Summary document

These ARE the deliverables. Gitignoring them loses the trail.
```

### State.json is meaningful, not noise

```json
{
  "graph_status": "complete",
  "updated_at": "2026-02-25T10:30:00Z",
  "nodes": {
    "spec-writer-c3d": {
      "status": "complete",
      "started_at": "2026-02-25T10:00:00Z",
      "completed_at": "2026-02-25T10:05:00Z"
    },
    "programmer-a-e5f": {
      "status": "complete",
      "started_at": "2026-02-25T10:05:00Z",
      "completed_at": "2026-02-25T10:15:00Z"
    }
  }
}
```

This is an audit record: which nodes ran, when, in what order, what succeeded/failed. It's small (a few KB) and changes only during active runs — not continuous churn.

### Git clone just works

```
BEFORE (dual-path):
  $ git clone repo && cd repo
  $ cg template instances my-pipeline
    sprint-42: ⚠️  NOT RUNNABLE — run `cg template hydrate` first

AFTER (unified):
  $ git clone repo && cd repo
  $ cg template instances my-pipeline
    sprint-42: complete (6/6 nodes, 2026-02-25)
    sprint-43: in_progress (3/6 nodes)
```

No hydration step. No missing data. Instances are immediately inspectable.

---

## What Changes

### Eliminated

| Concept | Status | Why |
|---------|--------|-----|
| `.chainglass/data/instances/` path | **ELIMINATED** | Everything under `instances/` |
| `InstanceAdapter.getInstanceDataDir()` | **ELIMINATED** | Single path: `getInstanceDir()` |
| Dual-write in `instantiate()` | **ELIMINATED** | Write once to `instances/<wf>/<id>/` |
| Hydration command (`cg template hydrate`) | **ELIMINATED** | Not needed — all data tracked |
| `.gitignore` entry for `data/instances/` | **NOT NEEDED** | Path doesn't exist |

### Simplified

| Component | Before (dual-path) | After (unified) |
|-----------|-------------------|-----------------|
| `InstanceAdapter` | `getInstanceDir()` + `getInstanceDataDir()` | `getInstanceDir()` only |
| `instantiate()` | Copy to instance dir + copy to data dir + create state.json in data | Copy to instance dir + create state.json in same dir |
| Instance-aware graph adapter (Phase 3) | Route to `data/instances/<wf>/<id>/` | Route to `instances/<wf>/<id>/` |
| `getStatus()` | Read state.json from data path | Read state.json from instance path |

### Unchanged

| Component | Notes |
|-----------|-------|
| Templates at `.chainglass/templates/workflows/<slug>/` | No change — templates have no runtime state |
| Standalone graphs at `.chainglass/data/workflows/<slug>/` | No change — these are the "working" graphs before save-as-template |
| `saveFrom()` flow | Still reads from `data/workflows/`, still strips runtime state |
| Unit refresh | Still overwrites `instances/<wf>/<id>/units/` from template |

---

## Instantiation Flow (Revised)

```
$ cg template instantiate my-pipeline-template --id sprint-42

┌──────────────────────────────────────────────────────────────┐
│ STEP 1: Copy template → instance (SINGLE destination)        │
│   Source: .chainglass/templates/workflows/my-pipeline-template/│
│   Target: .chainglass/instances/my-pipeline-template/sprint-42/│
│                                                              │
│   • Copy graph.yaml                                          │
│   • Copy nodes/*/node.yaml                                   │
│   • Copy units/                                              │
│   • Write instance.yaml (metadata)                           │
│   • Create state.json { graph_status: "pending", nodes: {} } │
│   • chmod +x all .sh files                                   │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ OUTPUT                                                       │
│                                                              │
│   ✓ Instance created: my-pipeline-template/sprint-42         │
│   ✓ Graph ready with 4 lines, 6 nodes                       │
│   ✓ 6 units copied locally                                  │
│   ✓ Fresh state.json initialized                             │
│   ✓ All files Git-tracked                                    │
└──────────────────────────────────────────────────────────────┘
```

**One copy operation. One destination. Done.**

---

## Graph Engine Path Resolution

### Current System (standalone graphs)

```
PositionalGraphAdapter:
  domain = 'workflows'
  getGraphDir(ctx, slug) → ctx.worktreePath/.chainglass/data/workflows/<slug>/
```

### Instance System (Phase 3 adapter)

```
InstanceGraphAdapter:
  getGraphDir(ctx, wfSlug, instanceId) → ctx.worktreePath/.chainglass/instances/<wfSlug>/<instanceId>/
```

The engine reads graph.yaml, state.json, and node configs from the **same directory** — just as it does for standalone graphs. The only difference is the root path.

```
Standalone graph:  .chainglass/data/workflows/my-graph/graph.yaml
                   .chainglass/data/workflows/my-graph/state.json
                   .chainglass/data/workflows/my-graph/nodes/<id>/node.yaml

Instance graph:    .chainglass/instances/my-template/sprint-42/graph.yaml
                   .chainglass/instances/my-template/sprint-42/state.json
                   .chainglass/instances/my-template/sprint-42/nodes/<id>/node.yaml
```

**Same structure, different root.** The adapter swap is clean.

---

## Gitignore Implications

### Current `.gitignore` (relevant lines)

```gitignore
.chainglass/data/                    ← Already gitignored (standalone graph runtime)
```

### No new gitignore entries needed

`.chainglass/instances/` is NOT under `.chainglass/data/`, so it's tracked by default. No gitignore changes required.

### What if someone wants to ignore specific output types?

Users can add selective ignores if needed:

```gitignore
# Optional: ignore large binary outputs from instances
.chainglass/instances/**/nodes/*/outputs/*.bin
.chainglass/instances/**/nodes/*/outputs/*.zip
```

But the **default is track everything** — outputs are work product.

---

## Edge Cases

### EC-1: Large outputs

**Concern**: What if a node produces very large outputs (multi-MB files)?

**Resolution**: This is rare in the current system — outputs are typically markdown text (specs, code, reviews). If a future node produces large binaries, users can selectively gitignore those patterns. The default "track everything" is correct for the common case.

### EC-2: Merge conflicts on state.json

**Concern**: Two people run the same instance on different branches — state.json will conflict.

**Resolution**: This is unlikely in practice. Instances are typically:
- Created per-task (e.g., `sprint-42`, `sprint-43`) — different IDs, no conflict
- Run to completion on one branch before merge

If it does happen, state.json is a simple JSON file — easy to resolve manually. The graph_status and node statuses are the only fields, and the "later" run is the correct state.

### EC-3: In-progress instance on clone

**Concern**: If an instance has `graph_status: "in_progress"` when cloned, can the clone continue the run?

**Resolution**: The clone has the full state (graph.yaml, state.json, units, all node outputs produced so far). Whether it can continue depends on agent session state (which is external to the graph). But the graph STATE is fully preserved — a new orchestration run could pick up from where the state.json left off.

### EC-4: Standalone graphs vs instance graphs

**Concern**: Standalone working graphs (in `.chainglass/data/workflows/`) are gitignored. Instance graphs are tracked. Is this inconsistent?

**Resolution**: This is intentional. Standalone graphs are **scratch work** — the place where you iterate and experiment. Once you're happy with a graph, you save it as a template (`save-from`). Templates and instances are **production artifacts** — they belong in the repo. The scratch → template → instance progression mirrors code development: local experiments → committed code → deployed release.

---

## Impact on Phase 2 Tasks

| Task | Change |
|------|--------|
| T002 (InstanceAdapter) | **Simplified** — remove `getInstanceDataDir()`. Single `getInstanceDir()` method. |
| T007 (instantiate tests) | **Simplified** — verify ONE directory created, not two. State.json in same dir. |
| T008 (instantiate impl) | **Simplified** — single copy + state.json creation. No dual-write. |
| T009 (refresh tests) | No change — refresh still operates on `instances/<wf>/<id>/units/`. |
| T019 (script path test) | **Simplified** — scripts resolve from instance dir, no data-dir indirection. |

### Phase 3 Impact

| Task | Change |
|------|--------|
| 3.1 (Instance-aware adapter) | **Simplified** — adapter routes to `instances/<wf>/<id>/`, same structure as standalone graphs. No split-path routing. |

---

## Quick Reference

```
BEFORE (Workshops 001/002 design):
  .chainglass/instances/<wf>/<id>/        ← Git-tracked definitions
  .chainglass/data/instances/<wf>/<id>/   ← Gitignored runtime
  Two paths. Dual writes. Hydration needed after clone.

AFTER (This workshop):
  .chainglass/instances/<wf>/<id>/        ← Everything Git-tracked
  One path. Single write. Clone just works.

Templates (unchanged):
  .chainglass/templates/workflows/<slug>/ ← Git-tracked, no runtime state

Standalone graphs (unchanged):
  .chainglass/data/workflows/<slug>/      ← Gitignored, scratch work
```

---

## Adapter Path Resolution Pattern

The `WorkspaceDataAdapterBase` defaults to `.chainglass/data/<domain>/` (gitignored/ephemeral). Adapters that need Git-tracked storage override `getDomainPath()` to skip the `data/` segment.

**Existing precedent**: `WorkUnitAdapter` already does this:

```typescript
// WorkUnitAdapter — tracked storage, overrides getDomainPath()
class WorkUnitAdapter extends WorkspaceDataAdapterBase {
  readonly domain = 'units';
  protected override getDomainPath(ctx: WorkspaceContext): string {
    return this.pathResolver.join(ctx.worktreePath, '.chainglass', 'units');
    // → .chainglass/units/ (TRACKED) instead of .chainglass/data/units/ (ephemeral)
  }
}
```

**TemplateAdapter and InstanceAdapter follow the same pattern**:

```typescript
// TemplateAdapter — tracked
class TemplateAdapter extends WorkspaceDataAdapterBase {
  readonly domain = 'templates';
  protected override getDomainPath(ctx: WorkspaceContext): string {
    return this.pathResolver.join(ctx.worktreePath, '.chainglass', 'templates', 'workflows');
    // → .chainglass/templates/workflows/
  }
}

// InstanceAdapter — tracked
class InstanceAdapter extends WorkspaceDataAdapterBase {
  readonly domain = 'instances';
  protected override getDomainPath(ctx: WorkspaceContext): string {
    return this.pathResolver.join(ctx.worktreePath, '.chainglass', 'instances');
    // → .chainglass/instances/
  }
}
```

**Convention**: `.chainglass/data/` = ephemeral (gitignored). `.chainglass/<domain>/` = tracked. No SDK changes needed — override `getDomainPath()` is the established pattern.

---

## Open Questions

### Q1: Should we add `cg template status` to show instance run history?

**RECOMMENDATION**: Defer to a future plan. `cg template instances <slug>` already shows instance status. Git log on the instance directory shows run history. A dedicated status command can be added later if needed.

### Q2: Should completed instances be archivable?

**RECOMMENDATION**: Defer. Users can `git rm` completed instances or move them to an `archives/` directory manually. No built-in archive mechanism needed for Plan 048.
