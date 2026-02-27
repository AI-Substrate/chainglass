# Workshop: User-Input Save & Persistence Strategy

**Type**: Integration Pattern / Data Model
**Plan**: 054-unified-human-input
**Spec**: [unified-human-input-spec.md](../unified-human-input-spec.md)
**Created**: 2026-02-27
**Status**: Draft

**Related Documents**:
- [Workshop 006: Unified Human Input Design](./006-unified-human-input-design.md) — data model overview
- [Workshop 007: Human Input UI/UX](./007-human-input-ui-ux.md) — modal layout and interaction flows
- [Output Storage Tests](../../../../test/unit/positional-graph/output-storage.test.ts)
- [Collate Inputs Tests](../../../../test/unit/positional-graph/collate-inputs.test.ts)

**Domain Context**:
- **Primary Domain**: `workflow-ui` (owns server actions that orchestrate the save)
- **Related Domains**: `_platform/positional-graph` (owns `saveOutputData`, `canEnd`, `collateInputs`, lifecycle guards)

---

## Purpose

Define exactly how user-input node data gets saved, persisted, and read by downstream nodes. The plan's critical tension: `saveOutputData()` requires `agent-accepted` status, but multi-output nodes need partial saves before the lifecycle starts. This workshop resolves that tension with concrete code paths, data formats, and sequence diagrams.

## Key Questions Addressed

- What format does `data.json` use, and is it consistent across writers and readers?
- How do partial saves work for multi-output nodes before the lifecycle starts?
- What's the exact server action sequence for single-output vs multi-output submissions?
- Does the orchestration system interfere with user-input nodes in various states?
- Where does freeform notes content go?

---

## Finding: data.json Format Inconsistency

Investigation revealed two different data.json formats in the codebase:

### Format A: Service Writes (`saveOutputData`)

```json
{
  "outputs": {
    "spec": "hello"
  }
}
```

- Written by: `saveOutputData()` (line 1681 of positional-graph.service.ts)
- Read by: `canEnd()` via `data.outputs` ✓
- Read by: `getOutputData()` via `data.outputs[outputName]` ✓

### Format B: Test Fixtures (`collateInputs` tests)

```json
{
  "spec": {
    "type": "data",
    "dataType": "text",
    "value": "The spec content"
  }
}
```

- Written by: test helper `writeNodeData()` in `collate-inputs.test.ts`
- Read by: `collateInputs()` via `data?.[fromOutput]` — returns the rich object ✓

### The Mismatch

`collateInputs()` calls `loadNodeData()` which returns the **raw parsed JSON**, then accesses `data?.[fromOutput]`:

```typescript
// input-resolution.ts line 352
data: data?.[fromOutput],
```

If `saveOutputData()` wrote the file, `data` is `{ outputs: { spec: "hello" } }`, so `data?.["spec"]` returns `undefined`. The actual value lives at `data.outputs["spec"]`.

If the test fixture wrote the file, `data` is `{ spec: { type: "data", value: "The spec content" } }`, so `data?.["spec"]` returns the rich object ✓.

### Impact

**`saveOutputData()` writes are NOT readable by `collateInputs()`**. This is a latent bug — it hasn't surfaced because no real agent execution flow has exercised the full write → read path through production code (only test fixtures with Format B).

### Resolution for Plan 054

Plan 054 must write in **Format B** (flat, test-convention format) for `collateInputs()` to work. This means:

1. **For single-output (full lifecycle)**: Do NOT use `saveOutputData()` — write directly to data.json in Format B via `IFileSystem`
2. **For multi-output (partial saves)**: Same approach — write directly via `IFileSystem`
3. **Separately**: File a bug to reconcile `saveOutputData()` with `collateInputs()` expectations (out of scope for Plan 054)

**Decision**: Write in Format B. This is the format that `collateInputs` actually reads, and it's what the existing test suite validates.

---

## Save Strategies: Three Options Evaluated

### Option 1: Walk Full Lifecycle Per Save ❌

```
Per-field save → startNode → accept → saveOutputData → (leave in agent-accepted)
Final save → endNode
```

**Problems**:
- Node transitions to `agent-accepted` on first field save — visible on canvas as "Running"
- `saveOutputData()` writes Format A — `collateInputs()` can't read it
- Orchestration won't interfere (ONBAS skips agent-accepted + ODS skips user-input — verified), but the status display is misleading
- **If user never completes**, node stuck in `agent-accepted` forever with no recovery path

**Verdict**: Rejected — format mismatch + misleading status.

### Option 2: Write Directly via IFileSystem ✅ (Recommended)

```
Per-field save → write to data.json via IFileSystem (Format B)
Complete → startNode → accept → endNode (canEnd validates outputs exist)
```

**Benefits**:
- Writes in Format B — `collateInputs()` reads it correctly
- Node stays `pending` until Complete — accurate status display
- Partial state persisted to filesystem — survives browser crash/reload
- `canEnd()` reads `data.outputs` (Format A) BUT we need to handle this...

**Wait — canEnd format issue**: `canEnd()` reads `data.outputs` (wrapped), but we're writing Format B (flat). We need to reconcile this.

Actually, looking at `canEnd()` more carefully:

```typescript
const data = JSON.parse(content) as { outputs: Record<string, unknown> };
savedOutputs = Object.keys(data.outputs ?? {});
```

If we write Format B (`{ spec: { type: "data", value: "hello" } }`), then `data.outputs` is `undefined`, and `Object.keys(undefined ?? {})` returns `[]`. So `canEnd()` would say "no outputs saved" and block `endNode()`.

**Fix**: We need to write in a format that BOTH `collateInputs` and `canEnd` can read. Two sub-options:

#### Option 2a: Write dual-compatible format ✅✅ (Best)

```json
{
  "outputs": {
    "spec": "The spec content"
  },
  "spec": {
    "type": "data",
    "dataType": "text",
    "value": "The spec content"
  }
}
```

Both `canEnd()` (reads `data.outputs`) and `collateInputs()` (reads `data[name]`) find what they need.

**BUT** — this is a hack. Duplicate data, two schemas.

#### Option 2b: Fix collateInputs to read wrapped format ✅✅✅ (Best)

```typescript
// input-resolution.ts line 352 — BEFORE
data: data?.[fromOutput],

// AFTER
data: data?.outputs?.[fromOutput] ?? data?.[fromOutput],
```

One-line fix. Reads wrapped format (Format A) first, falls back to flat (Format B) for backward compat. Then we write Format A everywhere.

**This is the correct fix.** It aligns `collateInputs` with `saveOutputData` and `canEnd`, and the fallback maintains backward compat with any test fixtures using Format B.

### Option 3: Keep Partial State in React Only ❌

```
Per-field save → React state / localStorage only
Complete → startNode → accept → saveOutputData per field → endNode
```

**Problems**:
- Partial state lost on browser crash/tab close
- Can't resume from another browser/device
- User said "Re-opening shows previously saved values" — requires persistence

**Verdict**: Rejected — doesn't meet persistence requirement.

---

## Recommended Strategy: Option 2b

### Fix collateInputs + Write Format A Everywhere

**Step 1** (Phase 1 of Plan 054): Fix `collateInputs` to read wrapped format:

```typescript
// input-resolution.ts — loadNodeData output reading in collateInputs
// BEFORE:
data: data?.[fromOutput],

// AFTER:
const outputData = data?.outputs ?? data; // prefer wrapped, fallback to flat
// ...
data: outputData?.[fromOutput],
```

**Step 2**: All Plan 054 writes use Format A (`{ outputs: { name: value } }`):
- Partial saves write via `IFileSystem` using Format A
- Single-output complete writes via `IFileSystem` using Format A
- `canEnd()` validates ✓
- `collateInputs()` validates ✓ (after the fix)
- `getOutputData()` validates ✓

### Why Write via IFileSystem Instead of saveOutputData?

Even though we're using Format A, we still bypass `saveOutputData()` for partial saves because:
1. `saveOutputData()` guards on `canNodeDoWork(status)` — node is `pending` during partial saves
2. We don't want to start the lifecycle until all required outputs are saved
3. Direct filesystem write is simpler — one `atomicWriteFile` call

The server action has access to `IFileSystem` (workflow-ui consumes `_platform/file-ops`). This is architecturally acceptable — the server action writes to a well-known path in the positional-graph data directory.

---

## Sequence Diagrams

### Single-Output User-Input Node (Happy Path)

```
User clicks "Submit" in modal
    │
    ├── Client: onSubmit({ structured: "Build a REST API", freeform: "Use JWT" })
    │
    ├── Server Action: submitUserInput(workspaceSlug, graphSlug, nodeId, answer)
    │   │
    │   ├── 1. Write output to data.json via IFileSystem
    │   │      Path: nodes/{nodeId}/data/data.json
    │   │      Content: { "outputs": { "spec": "Build a REST API" } }
    │   │      (also writes freeform to metadata key)
    │   │
    │   ├── 2. startNode(ctx, graphSlug, nodeId)
    │   │      pending → starting
    │   │
    │   ├── 3. raiseNodeEvent(ctx, graphSlug, nodeId, 'node:accepted', {}, 'human')
    │   │      starting → agent-accepted
    │   │
    │   ├── 4. endNode(ctx, graphSlug, nodeId)
    │   │      canEnd() checks data.outputs → finds "spec" ✓
    │   │      agent-accepted → complete
    │   │
    │   └── 5. reloadStatus(ctx, graphSlug) → return GraphStatusResult
    │
    ├── Client: setGraphStatus(result.graphStatus)
    │   Node card: ✓ Complete (green)
    │
    └── Downstream nodes: collateInputs reads data.outputs.spec ✓
```

**Error recovery**: If `endNode` fails (shouldn't — we just wrote the output), node is in `agent-accepted`. User sees "Running" status. Can retry or undo.

### Multi-Output User-Input Node (Partial Saves)

```
User opens modal for multi-output node (3 outputs: requirements*, language*, notes)
    │
    ├── Client: loads existing data.json (if any) to pre-populate fields
    │   GET action: loadUserInputState(workspaceSlug, graphSlug, nodeId)
    │   Returns: { savedOutputs: {}, savedCount: 0, requiredCount: 2 }
    │
    ├── User fills "requirements" field, clicks [Save ❶]
    │   │
    │   ├── Server Action: saveUserInputField(wsSlug, graphSlug, nodeId, "requirements", value)
    │   │   ├── Read existing data.json (or create empty { outputs: {} })
    │   │   ├── Merge: data.outputs["requirements"] = value
    │   │   ├── Write atomically via IFileSystem
    │   │   └── Return: { savedCount: 1, requiredCount: 2 }
    │   │
    │   ├── Node stays in `pending` status — NO lifecycle change
    │   └── Badge updates: "? 1/2 filled" (violet)
    │
    ├── User closes modal (Cancel or ✕)
    │   ├── Data persisted in data.json
    │   └── Node card: "? 1/2 filled"
    │
    ├── Later: user re-opens modal
    │   ├── loadUserInputState returns: { savedOutputs: { requirements: "..." }, savedCount: 1 }
    │   ├── Field ❶ pre-populated with saved value
    │   └── Field ❷ empty
    │
    ├── User fills "language", clicks [Save ❷]
    │   ├── Server action writes to data.json
    │   ├── Return: { savedCount: 2, requiredCount: 2 }
    │   └── [Complete ✓] button now ENABLED
    │
    ├── User clicks [Complete ✓]
    │   │
    │   ├── Server Action: completeUserInput(wsSlug, graphSlug, nodeId)
    │   │   ├── 1. (outputs already in data.json from partial saves)
    │   │   ├── 2. startNode(ctx, graphSlug, nodeId)
    │   │   │      pending → starting
    │   │   ├── 3. raiseNodeEvent('node:accepted', {}, 'human')
    │   │   │      starting → agent-accepted
    │   │   ├── 4. endNode(ctx, graphSlug, nodeId)
    │   │   │      canEnd() checks data.outputs → requirements ✓, language ✓
    │   │   │      agent-accepted → complete
    │   │   └── 5. reloadStatus → return GraphStatusResult
    │   │
    │   ├── Node card: ✓ Complete (green)
    │   └── Downstream nodes unblocked
    │
    └── Done
```

---

## data.json Canonical Format (Format A)

All writers (including Plan 054 server actions) use this format:

```json
{
  "outputs": {
    "requirements": "Build a REST API for user management",
    "language": "TypeScript"
  },
  "_metadata": {
    "submitted_at": "2026-02-27T05:30:00.000Z",
    "submitted_by": "human",
    "freeform_notes": "Should support pagination and filtering"
  }
}
```

### Field Descriptions

| Field | Purpose | Written By |
|-------|---------|-----------|
| `outputs.{name}` | Output values mapped by declared output name | `saveUserInputField` / `submitUserInput` |
| `_metadata.submitted_at` | ISO timestamp of final submission | `completeUserInput` |
| `_metadata.submitted_by` | Always `"human"` for user-input nodes | `completeUserInput` |
| `_metadata.freeform_notes` | Always-on freeform textarea content | `submitUserInput` (single) or `completeUserInput` (multi) |

### Readers

| Reader | Access Pattern | Works? |
|--------|---------------|--------|
| `canEnd()` | `data.outputs` → `Object.keys()` | ✅ Yes — reads wrapped format |
| `getOutputData()` | `data.outputs[outputName]` | ✅ Yes — reads wrapped format |
| `collateInputs()` | `data?.outputs?.[fromOutput] ?? data?.[fromOutput]` | ✅ Yes — after one-line fix |
| `loadUserInputState()` | `data.outputs` + count vs unit required outputs | ✅ Yes — new action reads wrapped |

### Why `_metadata` (underscore prefix)?

Output names come from unit.yaml `outputs[].name` which must match `^[a-z][a-z0-9_]*$` (InputNameSchema). Names starting with `_` are impossible via schema validation, so `_metadata` is a safe namespace that can never collide with a declared output name.

---

## Server Actions — Complete API

### 1. `saveUserInputField` (partial save)

```typescript
// workflow-actions.ts

export async function saveUserInputField(
  workspaceSlug: string,
  graphSlug: string,
  nodeId: string,
  outputName: string,
  value: unknown,
  worktreePath?: string
): Promise<{ savedCount: number; requiredCount: number; errors: ResultError[] }> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  const svc = resolveGraphService();
  const fsService = resolveFileSystem(); // IFileSystem from DI

  // Read node config to get unit_slug
  // Read unit.yaml to get required output count
  // Read/create data.json, merge output, write atomically
  // Return counts
}
```

**Writes to**: `nodes/{nodeId}/data/data.json` via `IFileSystem`
**Does NOT call**: `startNode`, `saveOutputData`, or any lifecycle method
**Node status after**: unchanged (`pending`)

### 2. `submitUserInput` (single-output, atomic)

```typescript
export async function submitUserInput(
  workspaceSlug: string,
  graphSlug: string,
  nodeId: string,
  answer: { structured: unknown; freeform: string },
  worktreePath?: string
): Promise<MutationResult> {
  // 1. Write output + metadata to data.json via IFileSystem
  // 2. startNode()
  // 3. raiseNodeEvent('node:accepted')
  // 4. endNode()
  // 5. reloadStatus()
}
```

### 3. `completeUserInput` (multi-output, lifecycle only)

```typescript
export async function completeUserInput(
  workspaceSlug: string,
  graphSlug: string,
  nodeId: string,
  freeformNotes?: string,
  worktreePath?: string
): Promise<MutationResult> {
  // 1. Optionally write freeform notes to _metadata
  // 2. startNode() — outputs already in data.json from partial saves
  // 3. raiseNodeEvent('node:accepted')
  // 4. endNode() — canEnd validates outputs present
  // 5. reloadStatus()
}
```

### 4. `loadUserInputState` (read saved state)

```typescript
export async function loadUserInputState(
  workspaceSlug: string,
  graphSlug: string,
  nodeId: string,
  worktreePath?: string
): Promise<{
  savedOutputs: Record<string, unknown>;
  savedCount: number;
  requiredCount: number;
  freeformNotes?: string;
  errors: ResultError[];
}> {
  // Read data.json, read unit.yaml, compare
}
```

---

## Orchestration Safety

Verified via code inspection:

| Scenario | ONBAS | ODS | Safe? |
|----------|-------|-----|-------|
| User-input node `pending` + `ready` | Returns `null` (skips user-input type) | N/A | ✅ |
| User-input node `agent-accepted` (during lifecycle walkthrough) | Returns `null` (skips agent-accepted) | Returns `ok: true` no-op (skips user-input type) | ✅ |
| `cg wf drive` running when user submits | No race — startNode atomic transition from `pending` | No pod created for user-input | ✅ |

**Defense-in-depth**: 4 layers prevent orchestration interference:
1. ONBAS skips `agent-accepted` status (line 84)
2. ONBAS skips `user-input` unit type even in `ready` (line 95)
3. ODS skips `user-input` type on dispatch (line 80)
4. PodManager has no `user-input` pod type (would crash if reached)

All four layers have explicit test coverage.

---

## Edge Cases

### E1: Browser crash during multi-output partial save

**Scenario**: User saves field 1, browser crashes before saving field 2.
**Behaviour**: data.json has field 1 persisted. User reopens modal, field 1 pre-populated, field 2 empty.
**No data loss** — atomic write ensures partial data is consistent.

### E2: Two browser tabs editing same node

**Scenario**: Tab A and Tab B both open the Human Input modal for the same node.
**Behaviour**: Last writer wins. Both tabs write to same data.json. No corruption (atomic writes), but Tab A's save may be overwritten by Tab B.
**Acceptable for v1** — concurrent editing is an edge case. SSE would show the other tab's changes, but we don't refresh the modal on SSE events.

### E3: User clicks Complete but endNode fails

**Scenario**: `canEnd()` returns false (should be impossible if we just wrote the outputs, but disk error or race).
**Behaviour**: Node stuck in `starting` or `agent-accepted`. Server action returns error. Client shows toast.
**Recovery**: Undo (Ctrl+Z) restores pre-lifecycle state. Or user can retry Complete.

### E4: data.json exists from a previous run (re-run scenario)

**Scenario**: User-input node was previously completed, undo restored it to `pending`, data.json still exists with old outputs.
**Behaviour**: Modal opens with old values pre-populated. User can edit and re-submit.
**This is correct** — undo restores topology but doesn't delete data files. The pre-populated values are a helpful convenience.

### E5: Unit.yaml changes after partial save (template refresh)

**Scenario**: User saves field "requirements", then admin runs `cg template refresh` which adds a new required output "deadline".
**Behaviour**: `canEnd()` will block completion because "deadline" is missing. Modal shows the new field as unsaved.
**This is correct** — refresh changes the unit definition, node needs new data.

---

## Implementation Checklist

### Phase 1 (Plan 054 Phase 1)
- [ ] Fix `collateInputs` to read wrapped format: `data?.outputs?.[fromOutput] ?? data?.[fromOutput]`
- [ ] Update `collate-inputs.test.ts` fixtures to use Format A (wrapped) — verify backward compat via fallback
- [ ] Extend `NodeStatusResult` with `savedOutputCount` + `requiredOutputCount`
- [ ] Populate from data.json + unit.yaml in `getNodeStatus()`

### Phase 3 (Plan 054 Phase 3)
- [ ] `submitUserInput` server action: write Format A → startNode → accept → endNode
- [ ] `loadUserInputState` server action: read data.json + compare to unit required outputs

### Phase 4 (Plan 054 Phase 4)
- [ ] `saveUserInputField` server action: partial write Format A via IFileSystem
- [ ] `completeUserInput` server action: startNode → accept → endNode (outputs already saved)

---

## Open Questions

### Q1: Should we update existing collate-inputs test fixtures to Format A?

**RESOLVED**: Yes, update test fixtures to Format A (wrapped). The `data?.outputs?.[fromOutput] ?? data?.[fromOutput]` fallback ensures backward compat during transition. New tests use Format A exclusively.

### Q2: Should freeform notes be a separate output or metadata?

**RESOLVED**: `_metadata.freeform_notes` — not a declared output. The freeform notes are supplementary context, not a data pipeline value. Using `_metadata` prefix (which is schema-impossible as an output name) avoids collision.

### Q3: What about the `saveOutputData` / `collateInputs` format bug?

**RESOLVED**: Fix `collateInputs` with the one-line fallback. File this as a bug fix task in Phase 1. The fix is backward compatible and aligns the codebase around Format A.

---

## Summary

The save strategy for user-input nodes:

1. **Fix `collateInputs`** to read wrapped format (one-line change, backward compatible)
2. **Write Format A** (`{ outputs: { name: value } }`) everywhere — consistent with `saveOutputData`, `canEnd`, `getOutputData`
3. **Partial saves** write directly to `data.json` via `IFileSystem` — node stays `pending`, no lifecycle change
4. **Complete** walks full lifecycle: `startNode` → `accept` → `endNode` — `canEnd` validates outputs already on disk
5. **Single-output** is atomic: write + lifecycle in one server action
6. **Orchestration is safe**: 4 layers of defense verified, all tested
7. **Freeform notes** go to `_metadata.freeform_notes` — safe namespace collision-free
