# Workshop: Node Connection System

**Type**: Integration Pattern  
**Plan**: 022-workgraph-ui  
**Spec**: [workgraph-ui-spec.md](../workgraph-ui-spec.md)  
**Created**: 2026-01-29  
**Status**: Draft

**Related Documents**:
- [Research Dossier](../research-dossier.md) - DYK#3 name-based matching
- [ADR-0008 Workspace Split Storage](../../../adr/adr-0008-workspace-split-storage-data-model.md)

---

## Purpose

This workshop details the complete data flow for connecting two nodes in the WorkGraph UI, from user drag gesture through React Flow, client hook, REST API, backend service, and filesystem persistence. It clarifies the **current bug** where the UI sends empty handle names but the API validates specific port names.

## Key Questions Addressed

- How does a user connection gesture flow through the system?
- Where does validation happen and what data does each layer expect?
- What is the difference between `canConnect()` and `connectNodes()`?
- Why does the current implementation fail when connecting nodes?

---

## Overview

The node connection system spans 5 layers:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Layer 1: React Flow Canvas                                              │
│   User drags from source node handle to target node handle              │
│   Emits: Connection { source, sourceHandle, target, targetHandle }      │
└───────────────────────────────────────┬─────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Layer 2: Client Component (workgraph-detail-client.tsx)                 │
│   handleConnect() extracts connection params                            │
│   Calls instance.connectNodes()                                         │
└───────────────────────────────────────┬─────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Layer 3: API Hook (use-workgraph-api.ts)                                │
│   connectNodes() POSTs to /api/.../edges                                │
│   Body: { source, sourceHandle, target, targetHandle }                  │
└───────────────────────────────────────┬─────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Layer 4: API Route (edges/route.ts)                                     │
│   POST handler validates, calls workgraphService.connectNodes()         │
│   ⚠️  BUG: Also calls canConnect() with empty handles first             │
└───────────────────────────────────────┬─────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Layer 5: Backend Service (workgraph.service.ts)                         │
│   connectNodes() takes only node IDs, auto-matches outputs→inputs       │
│   canConnect() takes specific port names for validation                 │
│   Persists to: work-graph.yaml (edge), node.yaml (wirings), state.json  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: React Flow Canvas

### Node Handle Configuration

Each WorkGraphNode renders two unnamed handles:

```tsx
// workgraph-node.tsx:114-134
<Handle type="target" position={Position.Top} />    // Input handle (top)
<Handle type="source" position={Position.Bottom} /> // Output handle (bottom)
```

**Key Point**: Handles have no `id` prop, so React Flow reports `null` or empty string for handle names.

### Connection Event

When user drags from source handle to target handle, React Flow calls `onConnect`:

```typescript
interface Connection {
  source: string;        // Source node ID (e.g., "sample-coder-123")
  sourceHandle: string | null;  // Always null (no handle IDs)
  target: string;        // Target node ID (e.g., "sample-tester-456")
  targetHandle: string | null;  // Always null (no handle IDs)
}
```

### Example Connection Data

```json
{
  "source": "sample-input-5ad",
  "sourceHandle": null,
  "target": "sample-coder-0dd",
  "targetHandle": null
}
```

---

## Layer 2: Client Component

**File**: `apps/web/app/(dashboard)/workspaces/[slug]/workgraphs/[graphSlug]/workgraph-detail-client.tsx`

### handleConnect Callback

```tsx
// Lines 51-70
const handleConnect = useCallback(
  async (connection: Connection) => {
    if (!connection.source || !connection.target) {
      handleError('Invalid connection: source and target required');
      return;
    }

    const result = await instance.connectNodes(
      connection.source,
      connection.sourceHandle ?? '',  // ← Converts null to empty string
      connection.target,
      connection.targetHandle ?? ''   // ← Converts null to empty string
    );

    if (!result.success && result.errors.length > 0) {
      handleError(result.errors[0].message);
    }
  },
  [instance, handleError]
);
```

**Data Transformation**:
- `sourceHandle: null` → `''` (empty string)
- `targetHandle: null` → `''` (empty string)

---

## Layer 3: API Hook

**File**: `apps/web/src/features/022-workgraph-ui/use-workgraph-api.ts`

### connectNodes Method

```typescript
// Lines 187-230
const connectNodes = useCallback(
  async (
    sourceNodeId: string,
    sourceHandle: string,
    targetNodeId: string,
    targetHandle: string
  ): Promise<MutationResult> => {
    const url = buildApiUrl(workspaceSlug, graphSlug, '/edges', worktreePath);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: sourceNodeId,
        sourceHandle,        // ← Sends empty string ''
        target: targetNodeId,
        targetHandle,        // ← Sends empty string ''
      }),
    });
    // ...
  },
  [workspaceSlug, graphSlug, worktreePath, onMutation]
);
```

### HTTP Request

```http
POST /api/workspaces/demo/workgraphs/my-graph/edges
Content-Type: application/json

{
  "source": "sample-input-5ad",
  "sourceHandle": "",
  "target": "sample-coder-0dd",
  "targetHandle": ""
}
```

---

## Layer 4: API Route

**File**: `apps/web/app/api/workspaces/[slug]/workgraphs/[graphSlug]/edges/route.ts`

### POST Handler Flow

```
Request → Parse Body → Resolve Workspace Context → Validate via canConnect() → Check Existing → Create via connectNodes()
```

### Current Code (with bug)

```typescript
// Lines 67-113
const body = await request.json();
const { source, sourceHandle, target, targetHandle } = body;

// Default handles to empty string if not provided
const srcHandle = sourceHandle ?? '';
const tgtHandle = targetHandle ?? '';

// ⚠️ BUG: canConnect() expects specific port names, not empty strings
const canConnectResult = await workgraphService.canConnect(
  context,
  graphSlug,
  source,
  srcHandle,   // '' ← FAILS: "Source node does not have output ''"
  target,
  tgtHandle    // ''
);

if (!canConnectResult.valid) {
  return Response.json({ connected: false, errors: canConnectResult.errors }, { status: 400 });
}

// This would work if we got here (takes only node IDs)
const connectResult = await workgraphService.connectNodes(context, graphSlug, source, target);
```

### Error Produced

```json
{
  "connected": false,
  "errors": [{
    "code": "E103",
    "message": "Source node 'sample-coder-846' does not have output ''",
    "action": "Available outputs: language, script"
  }]
}
```

---

## Layer 5: Backend Service

**File**: `packages/workgraph/src/services/workgraph.service.ts`

### Two Methods for Connection

| Method | Purpose | Parameters | When to Use |
|--------|---------|------------|-------------|
| `canConnect()` | Validate specific port-to-port connection | nodeIds + port names | CLI/programmatic with known ports |
| `connectNodes()` | Create edge with auto-matching | nodeIds only | UI drag-drop (auto-wire matching names) |

### canConnect() - Strict Validation

```typescript
// Lines 892-996
async canConnect(
  ctx: WorkspaceContext,
  graphSlug: string,
  sourceNodeId: string,
  sourceOutput: string,     // ← Requires specific output name
  targetNodeId: string,
  targetInput: string       // ← Requires specific input name
): Promise<CanConnectResult> {
  // 1. Load graph
  // 2. Check nodes exist
  // 3. Validate source has output named `sourceOutput`
  const sourceOutputs = await this.getNodeOutputs(ctx, graphSlug, sourceNodeId);
  if (!sourceOutputs.has(sourceOutput)) {
    return {
      valid: false,
      errors: [{
        code: 'E103',
        message: `Source node '${sourceNodeId}' does not have output '${sourceOutput}'`,
        action: `Available outputs: ${[...sourceOutputs].join(', ') || 'none'}`,
      }],
    };
  }
  // 4. Validate target accepts input named `targetInput`
  // 5. Strict name matching: sourceOutput === targetInput
  // 6. Check for cycles
}
```

### connectNodes() - Auto-Matching

```typescript
// Lines 1130-1267
async connectNodes(
  ctx: WorkspaceContext,
  graphSlug: string,
  sourceNodeId: string,     // ← Only node ID
  targetNodeId: string      // ← Only node ID
): Promise<ConnectNodesResult> {
  // 1. Validate graph, check nodes exist, check edge doesn't exist

  // 2. Get ALL source outputs
  const sourceOutputs = await this.getNodeOutputs(ctx, graphSlug, sourceNodeId);

  // 3. For each output, check if target has matching input
  for (const outputName of sourceOutputs) {
    if (await this.targetAcceptsInput(ctx, targetNodeId, outputName)) {
      // Wire this output to this input
      targetInputs[outputName] = {
        from_node: sourceNodeId,
        from_output: outputName,
      };
    }
  }

  // 4. Add edge to graph
  graph.edges.push({ from: sourceNodeId, to: targetNodeId });

  // 5. Persist changes
  // 6. Update state (disconnected → pending)
}
```

### Helper Methods

```typescript
// Lines 710-731
private async getNodeOutputs(ctx, graphSlug, nodeId): Promise<Set<string>> {
  if (nodeId === 'start') return new Set();  // Start has no outputs
  const unitSlug = this.extractUnitSlug(nodeId);
  const unit = await this.workUnitService.load(ctx, unitSlug);
  return new Set(unit.outputs.map(o => o.name));
}

// Lines 1269-1282
private async targetAcceptsInput(ctx, targetNodeId, inputName): Promise<boolean> {
  const unitSlug = this.extractUnitSlug(targetNodeId);
  const unit = await this.workUnitService.load(ctx, unitSlug);
  return unit.inputs.some(i => i.name === inputName);
}
```

---

## Data Model Reference

### Node ID Format

```
{unit-slug}-{random-hex}
```

Examples:
- `sample-coder-abc`
- `sample-tester-123`
- `sample-input-5ad`

### Unit Slug Extraction

```typescript
private extractUnitSlug(nodeId: string): string {
  // "sample-coder-abc" → "sample-coder"
  const parts = nodeId.split('-');
  parts.pop();  // Remove random suffix
  return parts.join('-');
}
```

### Unit Definition (Inputs/Outputs)

```yaml
# .chainglass/work-units/sample-coder/unit.yaml
slug: sample-coder
type: agent
inputs:
  - name: spec
    type: file
    required: true
outputs:
  - name: language
    type: text
  - name: script
    type: file
```

### Edge Persistence

```yaml
# .chainglass/data/work-graphs/{graph}/work-graph.yaml
slug: my-graph
version: "1.0.0"
nodes:
  - start
  - sample-input-5ad
  - sample-coder-0dd
edges:
  - from: start
    to: sample-input-5ad
  - from: sample-input-5ad
    to: sample-coder-0dd  # ← New edge added
```

### Input Wiring Persistence

```yaml
# .chainglass/data/work-graphs/{graph}/nodes/sample-coder-0dd/node.yaml
id: sample-coder-0dd
unit_slug: sample-coder
inputs:
  spec:                         # ← Input name
    from_node: sample-input-5ad # ← Wired from this node
    from_output: spec           # ← Matching output name
```

---

## The Fix (IMPLEMENTED)

### Root Cause

The API route calls `canConnect()` with empty handle names. The original `canConnect()` required specific port names and failed with "does not have output ''".

### Solution: Auto-Match Mode in canConnect()

Modified `canConnect()` to support **two modes**:

1. **Auto-match mode** (sourceOutput='' AND targetInput=''):
   - Gets all outputs from source node
   - Gets all inputs from target node
   - Valid if ANY output name matches ANY input name
   - Shows helpful error listing available ports if no match

2. **Strict mode** (specific port names provided):
   - Validates exact port exists on source/target
   - Validates names match
   - Used by CLI/programmatic access

```typescript
// Auto-match mode (UI drag-drop)
canConnect(ctx, graphSlug, 'nodeA', '', 'nodeB', '')
// → Checks: do ANY of nodeA's outputs match ANY of nodeB's inputs?

// Strict mode (CLI)  
canConnect(ctx, graphSlug, 'nodeA', 'script', 'nodeB', 'script')
// → Checks: does nodeA have output 'script' AND nodeB have input 'script'?
```

### Error Messages

**Auto-match failure:**
```json
{
  "code": "E103",
  "message": "No compatible connection between 'sample-coder-abc' and 'sample-tester-xyz'",
  "action": "Source outputs: [language, script]. Target inputs: [code, test_file]. Names must match."
}
```

**Structural connections allowed:**
If either node has no ports (e.g., start node), connection is allowed for graph structure.

---

## Validation Decision Tree (Updated)

```
User drags edge from Node A to Node B
           │
           ▼
┌──────────────────────────────────┐
│ Q1: Do both nodes exist?         │
│     (checked by connectNodes)    │
└──────────────────┬───────────────┘
                   │
         ┌─────────┴─────────┐
         │ No                │ Yes
         ▼                   ▼
   E107: Node not found   ┌──────────────────────────────────┐
                          │ Q2: Does edge already exist?     │
                          │     (checked by connectNodes)    │
                          └──────────────────┬───────────────┘
                                             │
                                   ┌─────────┴─────────┐
                                   │ Yes               │ No
                                   ▼                   ▼
                             E105: Edge exists   ┌──────────────────────────────────┐
                                                 │ Q3: Any matching output→input?   │
                                                 │     (auto-matched by connectNodes)│
                                                 └──────────────────┬───────────────┘
                                                                    │
                                                          ┌─────────┴─────────┐
                                                          │ No                │ Yes
                                                          ▼                   ▼
                                                    0 wirings made      Edge created
                                                    (edge still added)   Wirings persisted
```

**Note**: Even if no wirings match, the edge is still created. This allows connecting nodes for structural organization even without data flow.

---

## Quick Reference

### API Endpoint

```
POST /api/workspaces/{slug}/workgraphs/{graphSlug}/edges
```

### Request Body (Current)

```json
{
  "source": "nodeIdA",
  "sourceHandle": "",
  "target": "nodeIdB",
  "targetHandle": ""
}
```

### Request Body (Simplified)

```json
{
  "source": "nodeIdA",
  "target": "nodeIdB"
}
```

### Success Response

```json
{
  "connected": true,
  "edgeId": "edge-2",
  "errors": []
}
```

### Error Responses

| Code | HTTP | Meaning |
|------|------|---------|
| E400 | 400 | Missing source/target |
| E404 | 404 | Workspace or graph not found |
| E105 | 409 | Edge already exists |
| E107 | 404 | Node not found |
| E103 | 400 | Type mismatch (only from canConnect) |
| E108 | 400 | Would create cycle |

---

## Testing Commands

### Create Edge via curl

```bash
# Working (node IDs only matter)
curl -X POST http://localhost:3001/api/workspaces/demo/workgraphs/my-graph/edges \
  -H "Content-Type: application/json" \
  -d '{"source": "sample-input-5ad", "target": "sample-coder-0dd"}'

# Expected response
{"connected":true,"edgeId":"edge-3","errors":[]}
```

### Verify Edge Created

```bash
cat .chainglass/data/work-graphs/my-graph/work-graph.yaml | grep -A5 edges
```

---

## Open Questions

### Q1: Should we keep sourceHandle/targetHandle in API?

**RESOLVED**: Keep params - they enable auto-match mode (empty='') vs strict mode (specific names). This supports both UI (auto-match) and future CLI commands (strict).

### Q2: Should connectNodes() fail if no wirings match?

**RESOLVED**: No. Per current implementation, edges represent structural connections. Data flow wirings are a bonus but not required. This allows connecting a start node (which has no outputs) to other nodes.

### Q3: Should canConnect() be used anywhere?

**RESOLVED**: Yes, used by API route for pre-validation. Now supports two modes:
- Auto-match mode (UI): pass empty strings for ports
- Strict mode (CLI): pass specific port names
