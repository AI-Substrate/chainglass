# WorkGraph UI Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-01-29
**Spec**: [./workgraph-ui-spec.md](./workgraph-ui-spec.md)
**Research**: [./research-dossier.md](./research-dossier.md)
**Status**: DRAFT

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [ADR Ledger](#adr-ledger)
4. [Critical Research Findings](#critical-research-findings)
5. [Testing Philosophy](#testing-philosophy)
6. [File Placement Manifest (PlanPak)](#file-placement-manifest-planpak)
7. [Implementation Phases](#implementation-phases)
   - [Phase 1: Headless State Management](#phase-1-headless-state-management)
   - [Phase 2: Visual Graph Display](#phase-2-visual-graph-display)
   - [Phase 3: Graph Editing](#phase-3-graph-editing)
   - [Phase 4: Real-time Updates](#phase-4-real-time-updates)
   - [Phase 5: Question/Answer UI](#phase-5-questionanswer-ui)
   - [Phase 6: Layout Persistence](#phase-6-layout-persistence)
   - [Phase 7: Graph Management](#phase-7-graph-management)
8. [Cross-Cutting Concerns](#cross-cutting-concerns)
9. [Complexity Tracking](#complexity-tracking)
10. [Progress Tracking](#progress-tracking)
11. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: WorkGraph creation and management is currently CLI-only, requiring users to understand complex command structures and manually track graph state. Users cannot visualize workflow structure or see real-time execution status.

**Solution Approach**:
- Build a desired-state UI architecture with headless `WorkGraphUIService`/`WorkGraphUIInstance` that can be tested independently of React
- Integrate React Flow for visual graph rendering with custom node types for WorkUnit visualization
- Implement SSE notification-fetch pattern for real-time updates when CLI/agents modify graphs
- Provide drag-drop toolbox for adding WorkUnits and manual edge connection for input wiring
- Persist layout separately from graph structure for clean git diffs

**Expected Outcomes**:
- Visual graph creation with drag-drop workflow
- Real-time status updates during agent execution
- Question/answer handover UI for agent interactions
- Persistent layouts that survive page reloads

**Success Metrics**:
- All 12 acceptance criteria from spec verified
- Headless tests cover 100% of state management logic
- <2s latency for external change detection via SSE
- React Flow renders graphs up to 50 nodes smoothly

---

## Technical Context

### Current System State

| Component | Status | Location |
|-----------|--------|----------|
| WorkGraphService | ✅ Implemented | `packages/workgraph/src/services/workgraph.service.ts` |
| WorkNodeService | ✅ Implemented | `packages/workgraph/src/services/worknode.service.ts` |
| WorkUnitService | ✅ Implemented | `packages/workgraph/src/services/workunit.service.ts` |
| SSEManager | ✅ Implemented | `apps/web/src/lib/sse-manager.ts` |
| useSSE hook | ✅ Implemented | `apps/web/src/hooks/useSSE.ts` |
| React Flow | ✅ v12.10.0 | `@xyflow/react` in apps/web |
| Fake implementations | ✅ Implemented | `packages/workgraph/src/fakes/*` |

### Integration Requirements

1. **Workspace Context**: All operations scoped to workspace via URL query param (`?workspace=<slug>`)
2. **File Storage**: Read/write to `<worktree>/.chainglass/data/work-graphs/<slug>/`
3. **SSE Channel**: Use existing `/api/events/workgraphs` endpoint with `sseManager.broadcast()`
4. **Service Layer**: Consume existing WorkGraph services through web API layer

### Constraints and Limitations

- **No agent execution in browser** - Agents run via CLI; UI only displays status
- **Filesystem access via API** - No direct filesystem access; all operations through REST endpoints
- **Single workspace per tab** - No cross-tab synchronization
- **Layout separate from structure** - `layout.json` distinct from `work-graph.yaml`

### Assumptions

- React Flow v12.10.0 API stable for required customizations
- SSE infrastructure reliable per ADR-0007
- WorkGraph services return Result types with errors[]
- Question types (text, single, multi, confirm) sufficient for all agent needs
- WorkUnits are extensible; UI discovers dynamically via `WorkUnitService.list()`

---

## ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0007 | Active | 1, 4 | SSE single-channel routing; use `workgraphs` channel |
| ADR-0008 | Active | 1, 6, 7 | Workspace split storage; graph files at `<worktree>/.chainglass/data/work-graphs/` |
| ADR-0004 | Active | 1, 2 | DI container architecture; use `useFactory` pattern |
| ADR-0009 | Active | 1 | Module registration function pattern for service registration |

---

## Critical Research Findings

### 🚨 Critical Discovery 01: Computed vs Stored Status
**Impact**: Critical
**Sources**: Research dossier § Critical Findings
**Problem**: `pending` and `ready` statuses are **computed** from DAG structure, not stored in state.json
**Solution**: Implement status computation in `WorkGraphUIInstance` that traverses edges to determine upstream completion
**Example**:
```typescript
// ❌ WRONG - Reading status from stored state
const status = state.nodes[nodeId].status; // Only has running/waiting/complete

// ✅ CORRECT - Computing status from DAG
function computeNodeStatus(nodeId: string, definition: WorkGraphDefinition, state: WorkGraphState): NodeStatus {
  const storedStatus = state.nodes[nodeId]?.status;
  if (storedStatus) return storedStatus; // Explicit states override
  
  const upstreamNodes = getUpstreamNodes(nodeId, definition.edges);
  const allUpstreamComplete = upstreamNodes.every(n => 
    state.nodes[n]?.status === 'complete'
  );
  return allUpstreamComplete ? 'ready' : 'pending';
}
```
**Action Required**: Phase 1 must implement status computation matching CLI behavior exactly
**Affects Phases**: 1, 2, 5

### 🚨 Critical Discovery 02: Direct Output Pattern for UserInputUnit
**Impact**: Critical
**Sources**: Research dossier § PL-02
**Problem**: UserInputUnit nodes skip `running` state entirely (PENDING → COMPLETE)
**Solution**: Special handling in UI for user-input type nodes - show direct input form, not "running" spinner
**Example**:
```typescript
// ❌ WRONG - Showing running state for user input nodes
if (node.status === 'ready' && node.unitType === 'user-input') {
  startNode(nodeId); // Sets status to 'running'
  showRunningSpinner();
}

// ✅ CORRECT - Direct input collection
if (node.status === 'ready' && node.unitType === 'user-input') {
  showInputForm(); // Collect input directly
  // On submit: saveOutputData() → end() → status becomes 'complete'
}
```
**Action Required**: Phase 5 must handle user-input nodes distinctly from agent nodes
**Affects Phases**: 2, 5

### 🚨 Critical Discovery 03: Question/Answer Handover
**Impact**: Critical
**Sources**: Research dossier § Question/Answer System
**Problem**: When agent asks question, node enters `waiting-question` state with handover data
**Solution**: Detect handover in state.json, render question modal, submit answer via API
**Example**:
```typescript
// Node data at nodes/<nodeId>/data/data.json when question pending
{
  "handover": {
    "reason": "question",
    "question": {
      "type": "single",
      "prompt": "Which language?",
      "options": [
        { "key": "A", "label": "TypeScript" },
        { "key": "B", "label": "Python" }
      ]
    }
  }
}
```
**Action Required**: Phase 5 must implement question detection and type-specific form rendering
**Affects Phases**: 1, 5

### 🚨 Critical Discovery 04: Manual Edge Connection Model
**Impact**: High
**Sources**: Spec clarification Q9
**Problem**: Original design had auto-wiring; now users manually connect edges
**Solution**: React Flow edge handles on inputs/outputs; validation on connection attempt
**Example**:
```typescript
// React Flow onConnect handler
const onConnect = useCallback((params: Connection) => {
  const sourceNode = nodes.find(n => n.id === params.source);
  const targetNode = nodes.find(n => n.id === params.target);
  
  // Validate output→input type compatibility
  const sourceOutput = getOutputDeclaration(sourceNode, params.sourceHandle);
  const targetInput = getInputDeclaration(targetNode, params.targetHandle);
  
  if (!isCompatible(sourceOutput, targetInput)) {
    showErrorModal(`Incompatible: ${sourceOutput.data_type} cannot connect to ${targetInput.data_type}`);
    return;
  }
  
  // Update node.yaml inputs mapping
  await instance.connectNodes(params.source, params.sourceHandle, params.target, params.targetHandle);
}, [nodes, instance]);
```
**Action Required**: Phase 3 must implement edge drag-connect with type validation
**Affects Phases**: 3

### 🚨 Critical Discovery 05: SSE Notification-Fetch Pattern
**Impact**: High
**Sources**: Spec § SSE Architecture, ADR-0007
**Problem**: SSE carries notification only, not actual data
**Solution**: On SSE event `{type: 'graph-updated', graphSlug}`, call `instance.refresh()` to fetch via API
**Example**:
```typescript
// Client hook
function useWorkGraphSSE(graphSlug: string, instance: WorkGraphUIInstance) {
  useSSE('/api/events/workgraphs', {
    onMessage: (event: { type: string; graphSlug: string }) => {
      if (event.type === 'graph-updated' && event.graphSlug === graphSlug) {
        instance.refresh(); // Fetches latest state via REST
      }
    }
  });
}

// Server emission
sseManager.broadcast('workgraphs', 'graph-updated', { graphSlug: 'my-graph' });
```
**Action Required**: Phase 4 implements SSE subscription with refresh-on-notify
**Affects Phases**: 1, 4

### High Impact Discovery 06: Layout Persistence in Separate File
**Impact**: High
**Sources**: Spec clarification Q5
**Problem**: Layout data doesn't exist in current schema
**Solution**: Store layout in `layout.json` separate from `work-graph.yaml`
**Example**:
```json
// <worktree>/.chainglass/data/work-graphs/<slug>/layout.json
{
  "version": "1.0.0",
  "nodes": {
    "start": { "x": 100, "y": 50 },
    "sample-input-a7f": { "x": 100, "y": 200 },
    "sample-coder-b2c": { "x": 100, "y": 350 }
  }
}
```
**Action Required**: Phase 6 implements layout.json read/write
**Affects Phases**: 1, 6

### High Impact Discovery 07: Optimistic Updates with Rollback
**Impact**: High
**Sources**: Spec § WorkGraphUIInstance
**Problem**: UI must feel responsive while persisting to filesystem
**Solution**: Update local state immediately, API call async, rollback on failure
**Example**:
```typescript
async addNode(afterNodeId: string, unitSlug: string): Promise<void> {
  const tempNodeId = `${unitSlug}-${generateHex3()}`;
  
  // Optimistic update
  this.nodes.set(tempNodeId, { id: tempNodeId, unitSlug, status: 'pending', position: autoPosition() });
  this.emit('changed');
  
  try {
    const result = await this.api.addNode(this.graphSlug, afterNodeId, unitSlug);
    // Update with real node ID if different
    if (result.nodeId !== tempNodeId) {
      this.nodes.delete(tempNodeId);
      this.nodes.set(result.nodeId, { ...result, status: 'pending' });
      this.emit('changed');
    }
  } catch (error) {
    // Rollback
    this.nodes.delete(tempNodeId);
    this.emit('changed');
    throw error;
  }
}
```
**Action Required**: All mutations in Phase 3 use optimistic pattern
**Affects Phases**: 3, 6

### High Impact Discovery 08: Atomic File Writes
**Impact**: High
**Sources**: Research dossier § PL-01
**Problem**: Concurrent writes can corrupt state files
**Solution**: Use existing `atomicWriteFile()` pattern in API layer
**Action Required**: Ensure API endpoints use atomic writes for all state mutations
**Affects Phases**: 3, 4, 6

### Medium Impact Discovery 09: WorkUnit Discovery
**Impact**: Medium
**Sources**: Spec clarification
**Problem**: UI must not hardcode the 3 current WorkUnit types
**Solution**: Fetch available units via `WorkUnitService.list()` on toolbox mount
**Action Required**: Phase 3 toolbox fetches units dynamically
**Affects Phases**: 3

### Medium Impact Discovery 10: Result Pattern Compliance
**Impact**: Medium
**Sources**: Research dossier § Design Patterns
**Problem**: All service methods return `BaseResult` with errors[]
**Solution**: API layer unwraps Results, returns HTTP errors for failures
**Action Required**: API routes handle Result pattern consistently
**Affects Phases**: 1, 3, 7

---

## Testing Philosophy

### Testing Approach
**Selected Approach**: Full TDD
**Rationale**: CS-4 complex feature with multiple interacting components benefits from comprehensive test coverage
**Focus Areas**: 
- WorkGraphUIService/Instance state management (headless)
- Status computation logic
- SSE notification handling
- Optimistic updates with rollback
- React Flow integration hooks

### Test-Driven Development
- **RED**: Write test first, verify it fails
- **GREEN**: Implement minimal code to pass test
- **REFACTOR**: Improve quality while keeping tests green

### Test Documentation
Every test must include:
```typescript
/**
 * Purpose: [what truth this test proves]
 * Quality Contribution: [how this prevents bugs]
 * Acceptance Criteria: [measurable assertions]
 */
```

### Fake Usage (Constitution Principle 4)
**Per Constitution § 4 "Fakes Over Mocks"**: Use full Fake implementations instead of mocking libraries.

- ✅ Use `FakeEventSource` implementing EventSource interface (with `emitMessage()` helper)
- ✅ Use `FakeFilesystem` for service tests (not vi.mock('fs'))
- ✅ Use `FakeWorkGraphService`, `FakeWorkNodeService`, `FakeWorkUnitService` (existing)
- ✅ Use `FakeQuestionHandler` with `assertSubmittedWith()` for callback testing
- ✅ Use `FakeModalService` with `getLastErrorMessage()` for modal assertions
- ❌ **NO** `vi.fn()`, `vi.mock()`, `jest.mock()`, or Sinon stubs
- ❌ **NO** mocking of internal components

**Fake Pattern** (required for all test doubles):
```typescript
// ❌ WRONG - Constitution violation
const onSubmit = vi.fn();
expect(onSubmit).toHaveBeenCalledWith({ selection: 'A' });

// ✅ CORRECT - Fake with assertion helper
const handler = new FakeQuestionHandler();
// ... render component with handler.submit ...
expect(handler.wasSubmittedWith({ selection: 'A' })).toBe(true);
```

### Non-Happy-Path Coverage
Each phase must test:
- [ ] Null/undefined inputs handled
- [ ] Concurrent access scenarios
- [ ] Error propagation verified
- [ ] SSE disconnection/reconnection
- [ ] Filesystem errors (permission, disk full)

---

## File Placement Manifest (PlanPak)

**PlanPak Rule**: Feature folders are **flat** — all files directly in the folder, no internal subdirectories like `fakes/`, `hooks/`, `components/`. Use descriptive filenames instead.

| File | Classification | Location | Rationale |
|------|---------------|----------|-----------|
| `workgraph-ui.service.ts` | plan-scoped | `apps/web/src/features/022-workgraph-ui/` | Core service for this plan |
| `workgraph-ui.instance.ts` | plan-scoped | `apps/web/src/features/022-workgraph-ui/` | Per-graph state manager |
| `workgraph-ui.types.ts` | plan-scoped | `apps/web/src/features/022-workgraph-ui/` | TypeScript interfaces |
| `use-workgraph-flow.ts` | plan-scoped | `apps/web/src/features/022-workgraph-ui/` | React Flow integration hook |
| `use-workgraph-sse.ts` | plan-scoped | `apps/web/src/features/022-workgraph-ui/` | SSE subscription hook |
| `workgraph-node.tsx` | plan-scoped | `apps/web/src/features/022-workgraph-ui/` | Custom React Flow node |
| `workunit-toolbox.tsx` | plan-scoped | `apps/web/src/features/022-workgraph-ui/` | Drag-drop toolbox |
| `question-modal.tsx` | plan-scoped | `apps/web/src/features/022-workgraph-ui/` | Question answer UI |
| `workgraph-canvas.tsx` | plan-scoped | `apps/web/src/features/022-workgraph-ui/` | Main graph canvas |
| `page.tsx` | plan-scoped | `apps/web/src/app/workgraphs/` | Next.js route page |
| `[slug]/page.tsx` | plan-scoped | `apps/web/src/app/workgraphs/` | Graph detail page |
| `route.ts` (graphs API) | plan-scoped | `apps/web/src/app/api/workgraphs/` | REST endpoints |
| `route.ts` (layout API) | plan-scoped | `apps/web/src/app/api/workgraphs/[slug]/layout/` | Layout persistence |
| `fake-workgraph-ui-service.ts` | plan-scoped | `apps/web/src/features/022-workgraph-ui/` | Test double for service |
| `fake-workgraph-ui-instance.ts` | plan-scoped | `apps/web/src/features/022-workgraph-ui/` | Test double for instance |
| `fake-event-source.ts` | plan-scoped | `apps/web/src/features/022-workgraph-ui/` | Test double for SSE |
| `fake-question-handler.ts` | plan-scoped | `apps/web/src/features/022-workgraph-ui/` | Test double for question callbacks |
| `fake-modal-service.ts` | plan-scoped | `apps/web/src/features/022-workgraph-ui/` | Test double for modal service |
| `fake-dialog-handler.ts` | plan-scoped | `apps/web/src/features/022-workgraph-ui/` | Test double for dialog callbacks |
| `workgraph-ui.service.test.ts` | plan-scoped | `test/unit/web/features/022-workgraph-ui/` | Unit tests |
| `workgraph-ui.instance.test.ts` | plan-scoped | `test/unit/web/features/022-workgraph-ui/` | Instance tests |
| `status-computation.test.ts` | plan-scoped | `test/unit/web/features/022-workgraph-ui/` | Status logic tests |
| `di-container.ts` | cross-cutting | `apps/web/src/lib/` | Add service registration |
| `layout.schema.ts` | cross-cutting | `packages/workgraph/src/schemas/` | Layout Zod schema |

**Decision tree applied**:
- All new UI components → `plan-scoped` (feature folder, flat)
- All Fake implementations → `plan-scoped` (feature folder, flat, `fake-` prefix)
- DI registration → `cross-cutting` (existing di-container.ts)
- Schema extensions → `cross-cutting` (shared package)

---

## Implementation Phases

### Phase 1: Headless State Management

**Objective**: Create WorkGraphUIService and WorkGraphUIInstance with full state management, testable without React.

**Deliverables**:
- `WorkGraphUIService` singleton with graph instance factory
- `WorkGraphUIInstance` class with desired-state pattern
- Status computation logic (pending/ready from DAG)
- Refresh mechanism from filesystem
- Event emitter for state changes
- Fake implementation for testing

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Status computation mismatch with CLI | Medium | High | Contract tests against CLI output |
| Service lifecycle complexity | Low | Medium | Clear dispose pattern |

### Tasks (Full TDD)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 1.1 | [x] | Write interface tests for WorkGraphUIService | 2 | Tests define: getInstance, listGraphs, createGraph, deleteGraph, disposeAll | [📋](tasks/phase-1-headless-state-management/execution.log.md) | Interface-first per constitution |
| 1.2 | [x] | Write interface tests for WorkGraphUIInstance | 3 | Tests define: graphSlug, definition, state, nodes, edges, subscribe, refresh, dispose | [📋](tasks/phase-1-headless-state-management/execution.log.md) | Include computed properties |
| 1.3 | [x] | Write tests for status computation logic | 3 | Tests cover: pending (upstream incomplete), ready (all upstream complete), stored statuses override | [📋](tasks/phase-1-headless-state-management/execution.log.md) | Critical algorithm |
| 1.4 | [x] | Create TypeScript interfaces in workgraph-ui.types.ts | 2 | Interfaces compile, export cleanly | [📋](tasks/phase-1-headless-state-management/execution.log.md) | |
| 1.5 | [x] | Implement FakeWorkGraphUIService | 2 | Fake passes interface tests | [📋](tasks/phase-1-headless-state-management/execution.log.md) | Test double with assertion helpers |
| 1.6 | [x] | Implement FakeWorkGraphUIInstance | 2 | Fake passes interface tests | [📋](tasks/phase-1-headless-state-management/execution.log.md) | |
| 1.7 | [x] | Write tests for WorkGraphUIService real implementation | 2 | Tests use FakeWorkGraphService for backend | [📋](tasks/phase-1-headless-state-management/execution.log.md) | |
| 1.8 | [x] | Implement WorkGraphUIService | 3 | All tests pass, instance caching works | [📋](tasks/phase-1-headless-state-management/execution.log.md) | Singleton pattern |
| 1.9 | [x] | Write tests for WorkGraphUIInstance real implementation | 3 | Tests cover: hydration, computed status, event emission | [📋](tasks/phase-1-headless-state-management/execution.log.md) | |
| 1.10 | [x] | Implement WorkGraphUIInstance | 4 | All tests pass, status computation correct | [📋](tasks/phase-1-headless-state-management/execution.log.md) | Core state management |
| 1.11 | [x] | Write contract tests comparing computed status to CLI | 2 | Status matches `wg status` output for test graphs | [📋](tasks/phase-1-headless-state-management/execution.log.md) | Parity verification |
| 1.12 | [x] | Register services in DI container | 1 | Services injectable via useFactory | [📋](tasks/phase-1-headless-state-management/execution.log.md) | Cross-cutting: di-container.ts |
| 1.13 | [x] | Create layout.schema.ts in workgraph package | 1 | Zod schema for layout.json structure | [📋](tasks/phase-1-headless-state-management/execution.log.md) | Cross-cutting: shared schema |

### Test Examples (Write First!)

```typescript
describe('WorkGraphUIInstance', () => {
  test('should compute pending status when upstream incomplete', () => {
    /**
     * Purpose: Proves pending status computed from DAG structure
     * Quality Contribution: Ensures status matches CLI behavior
     * Acceptance Criteria:
     * - Node with incomplete upstream shows 'pending'
     * - Matches CLI `wg status` output
     */
    
    // Arrange - graph with start → nodeA → nodeB
    const definition = createTestGraphDefinition({
      nodes: ['start', 'nodeA', 'nodeB'],
      edges: [
        { from: 'start', to: 'nodeA' },
        { from: 'nodeA', to: 'nodeB' }
      ]
    });
    const state = createTestState({
      'start': { status: 'complete' },
      'nodeA': { status: 'running' }
      // nodeB has no stored status
    });
    
    // Act
    const instance = new WorkGraphUIInstance(fakeService, 'test-graph', definition, state);
    
    // Assert
    expect(instance.nodes.get('nodeB')?.status).toBe('pending');
  });

  test('should compute ready status when all upstream complete', () => {
    /**
     * Purpose: Proves ready status triggered by upstream completion
     * Quality Contribution: Enables correct "can start" UI indication
     * Acceptance Criteria: Node with all complete upstream shows 'ready'
     */
    
    const definition = createTestGraphDefinition({
      nodes: ['start', 'nodeA'],
      edges: [{ from: 'start', to: 'nodeA' }]
    });
    const state = createTestState({
      'start': { status: 'complete' }
    });
    
    const instance = new WorkGraphUIInstance(fakeService, 'test-graph', definition, state);
    
    expect(instance.nodes.get('nodeA')?.status).toBe('ready');
  });

  test('should preserve stored status over computed', () => {
    /**
     * Purpose: Proves stored statuses (running, waiting-question) take precedence
     * Quality Contribution: Prevents incorrect status override
     * Acceptance Criteria: Stored 'running' status not overwritten
     */
    
    const definition = createTestGraphDefinition({
      nodes: ['start', 'nodeA'],
      edges: [{ from: 'start', to: 'nodeA' }]
    });
    const state = createTestState({
      'start': { status: 'complete' },
      'nodeA': { status: 'running' }
    });
    
    const instance = new WorkGraphUIInstance(fakeService, 'test-graph', definition, state);
    
    expect(instance.nodes.get('nodeA')?.status).toBe('running');
  });
});

describe('WorkGraphUIService', () => {
  test('should cache instances by graph slug', () => {
    /**
     * Purpose: Proves singleton instance per graph
     * Quality Contribution: Prevents duplicate state management
     * Acceptance Criteria: Same instance returned for same slug
     */
    
    const service = new WorkGraphUIService(fakeBackend);
    
    const instance1 = await service.getInstance(ctx, 'my-graph');
    const instance2 = await service.getInstance(ctx, 'my-graph');
    
    expect(instance1).toBe(instance2);
  });
});
```

### Non-Happy-Path Coverage
- [ ] getInstance with non-existent graph returns error
- [ ] Corrupt work-graph.yaml handled gracefully
- [ ] Missing state.json defaults to initial state
- [ ] Service dispose cleans all instances

### Acceptance Criteria
- [ ] All 13 tasks complete
- [ ] Status computation matches CLI `wg status` exactly
- [ ] 100% test coverage for state management
- [ ] Services registered in DI container
- [ ] Layout schema defined

### Commands to Run
```bash
# Run Phase 1 tests
pnpm test -- --testPathPattern="022-workgraph-ui" --testPathPattern="(service|instance|status)"

# Type check
just typecheck

# Lint
just lint

# Verify build
just build
```

---

### Phase 2: Visual Graph Display

**Objective**: Integrate React Flow to render WorkGraph as interactive visual graph with custom node types.

**Deliverables**:
- Custom React Flow node component for WorkGraph nodes
- Status visualization (colors, icons for each status)
- useWorkGraphFlow hook connecting instance to React Flow
- Read-only graph display (no editing yet)
- Basic page routes (/workgraphs, /workgraphs/[slug])

**Dependencies**: Phase 1 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| React Flow API mismatch | Low | Medium | Use existing v12.10.0 patterns in codebase |
| Re-render performance | Medium | Medium | Memoize node components |

### Tasks (Full TDD)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 2.1 | [x] | Write tests for useWorkGraphFlow hook | 2 | Tests cover: sync instance→RF state, node/edge transformation | [📋](tasks/phase-2-visual-graph-display/execution.log.md) | |
| 2.2 | [x] | Implement useWorkGraphFlow hook | 3 | Hook transforms UINodeState to React Flow Node format | [📋](tasks/phase-2-visual-graph-display/execution.log.md) | |
| 2.3 | [x] | Write tests for WorkGraphNode component | 2 | Tests cover: status colors, icons, unit type display | [📋](tasks/phase-2-visual-graph-display/execution.log.md) | |
| 2.4 | [x] | Implement WorkGraphNode custom node | 3 | Node displays: id, unit type, status indicator | [📋](tasks/phase-2-visual-graph-display/execution.log.md) | React Flow custom node |
| 2.5 | [x] | Write tests for status indicator rendering | 2 | Tests cover: 6 statuses with correct visual treatment | [📋](tasks/phase-2-visual-graph-display/execution.log.md) | |
| 2.6 | [x] | Implement status indicator component | 2 | Visual indicators: pending(gray), ready(blue), running(yellow+spinner), waiting-question(purple+?), blocked-error(red+X), complete(green+✓) | [📋](tasks/phase-2-visual-graph-display/execution.log.md) | |
| 2.7 | [x] | Create WorkGraphCanvas component | 2 | Canvas wraps ReactFlow with proper config | [📋](tasks/phase-2-visual-graph-display/execution.log.md) | |
| 2.8 | [x] | Create /workgraphs page route | 2 | Lists available graphs in workspace | [📋](tasks/phase-2-visual-graph-display/execution.log.md) | Server component |
| 2.9 | [x] | Create /workgraphs/[slug] page route | 2 | Displays single graph with WorkGraphCanvas | [📋](tasks/phase-2-visual-graph-display/execution.log.md) | Client component wrapper |
| 2.10 | [x] | Add workspace context from URL param | 1 | Reads `?workspace=slug` and passes to service | [📋](tasks/phase-2-visual-graph-display/execution.log.md) | |
| 2.11 | [x] | Create API route for listing graphs | 2 | GET /api/workgraphs returns GraphSummary[] | [📋](tasks/phase-2-visual-graph-display/execution.log.md) | |
| 2.12 | [x] | Create API route for loading single graph | 2 | GET /api/workgraphs/[slug] returns full graph data | [📋](tasks/phase-2-visual-graph-display/execution.log.md) | |

### Test Examples (Write First!)

```typescript
describe('useWorkGraphFlow', () => {
  test('should transform UINodeState to React Flow Node', () => {
    /**
     * Purpose: Proves correct mapping from instance state to RF format
     * Quality Contribution: Ensures graph renders correctly
     * Acceptance Criteria: RF nodes have correct id, position, data
     */
    
    // Use FakeWorkGraphUIInstance per Constitution Principle 4
    const fakeInstance = FakeWorkGraphUIInstance.withNodes([
      { id: 'start', status: 'complete', position: { x: 100, y: 50 } },
      { id: 'nodeA', unitSlug: 'sample-input', status: 'ready', position: { x: 100, y: 200 } }
    ]);
    
    const { result } = renderHook(() => useWorkGraphFlow(fakeInstance));
    
    expect(result.current.nodes).toHaveLength(2);
    expect(result.current.nodes[0]).toMatchObject({
      id: 'start',
      position: { x: 100, y: 50 },
      data: { status: 'complete' }
    });
  });
});

describe('WorkGraphNode', () => {
  test('should render running status with spinner', () => {
    /**
     * Purpose: Proves running state has correct visual treatment
     * Quality Contribution: Users can see active processing
     * Acceptance Criteria: Yellow background, spinner icon visible
     */
    
    render(<WorkGraphNode data={{ id: 'nodeA', status: 'running', unitSlug: 'sample-coder' }} />);
    
    expect(screen.getByTestId('status-indicator')).toHaveClass('bg-yellow-500');
    expect(screen.getByTestId('spinner-icon')).toBeInTheDocument();
  });
});
```

### Acceptance Criteria
- [ ] All 12 tasks complete
- [ ] Graph renders with correct visual layout
- [ ] All 6 statuses have distinct visual treatment (AC-5)
- [ ] Page routes work with workspace query param
- [ ] API routes return correct data format

### Commands to Run
```bash
# Run Phase 2 tests
pnpm test -- --testPathPattern="022-workgraph-ui" --testPathPattern="(flow|node|canvas|page)"

# Type check
just typecheck

# Lint
just lint

# Dev server verification
pnpm dev  # Navigate to http://localhost:3000/workgraphs?workspace=test
```

---

### Phase 3: Graph Editing

**Objective**: Enable drag-drop node addition from toolbox and manual edge connection with validation.

**Deliverables**:
- WorkUnitToolbox component with drag handles
- Drag-drop onto canvas to add unconnected node
- Manual edge connection from input to output
- Input/output type validation on connection
- Node deletion (single node only; downstream nodes become disconnected/pending)
- Auto-save to filesystem within 500ms

**Dependencies**: Phase 2 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Type validation complexity | Medium | Medium | Start with simple type matching |
| Optimistic update race conditions | Medium | High | Implement proper rollback |

### Tasks (Full TDD)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 3.1 | [x] | Write tests for WorkUnitToolbox component | 2 | Tests cover: unit listing, drag data, grouping by type | [📋](tasks/phase-3-graph-editing/execution.log.md#task-t001) | [^1] |
| 3.2 | [x] | Create API route for listing WorkUnits | 2 | GET /api/units returns available units | [📋](tasks/phase-3-graph-editing/execution.log.md#task-t002) | [^2] |
| 3.3 | [x] | Implement WorkUnitToolbox component | 3 | Fetches units via API, renders with drag handles | [📋](tasks/phase-3-graph-editing/execution.log.md#task-t003) | [^3] |
| 3.4 | [x] | Write tests for drop-to-add-node flow | 3 | Tests cover: onDrop handler, optimistic add, API call | [📋](tasks/phase-3-graph-editing/execution.log.md#task-t004) | [^4] |
| 3.5 | [x] | Implement onDrop handler in WorkGraphCanvas | 3 | Dropping unit creates unconnected node | [📋](tasks/phase-3-graph-editing/execution.log.md#task-t005) | [^5] |
| 3.6 | [x] | Write tests for manual edge connection | 3 | Tests cover: onConnect, type validation, input mapping | [📋](tasks/phase-3-graph-editing/execution.log.md#task-t006) | [^6] |
| 3.7 | [x] | Implement edge connection with validation | 4 | Dragging from output to input validates types, updates inputs mapping | [📋](tasks/phase-3-graph-editing/execution.log.md#task-t014a) | Critical: AC-2 [^7] |
| 3.8 | [x] | Write tests for node deletion | 2 | Tests cover: single node delete, edge cleanup, downstream nodes become pending | [📋](tasks/phase-3-graph-editing/execution.log.md#tasks-t007-t008-t009) | [^8] |
| 3.9 | [x] | Implement node deletion | 3 | Delete removes single node, cleans up edges, downstream nodes recompute to pending | [📋](tasks/phase-3-graph-editing/execution.log.md#tasks-t007-t008-t009) | [^8] |
| 3.10 | [x] | Write tests for auto-save debounce | 2 | Tests cover: 500ms debounce, save on structure change | [📋](tasks/phase-3-graph-editing/execution.log.md#task-t010) | [^9] |
| 3.11 | [x] | Implement auto-save mechanism | 2 | Changes saved within 500ms of last edit | [📋](tasks/phase-3-graph-editing/execution.log.md#task-t010) | AC-4 [^9] |
| 3.12 | [x] | Create API route for adding node | 2 | POST /api/workgraphs/[slug]/nodes | [📋](tasks/phase-3-graph-editing/execution.log.md#task-t012) | [^10] |
| 3.13 | [x] | Create API route for deleting node | 2 | DELETE /api/workgraphs/[slug]/nodes/[nodeId] | [📋](tasks/phase-3-graph-editing/execution.log.md#task-t013) | [^10] |
| 3.14 | [x] | Create API route for connecting nodes | 2 | POST /api/workgraphs/[slug]/edges | [📋](tasks/phase-3-graph-editing/execution.log.md#task-t014) | [^11] |
| 3.15 | [x] | Write tests for optimistic update rollback | 2 | Tests cover: API failure triggers rollback, UI state restored | [📋](tasks/phase-3-graph-editing/execution.log.md#task-t015) | [^12] |

### Test Examples (Write First!)

```typescript
describe('WorkUnitToolbox', () => {
  test('should fetch and display available units', async () => {
    /**
     * Purpose: Proves toolbox discovers units dynamically
     * Quality Contribution: UI not hardcoded to 3 unit types
     * Acceptance Criteria: All units from API displayed
     */
    
    server.use(
      rest.get('/api/units', (req, res, ctx) => {
        return res(ctx.json([
          { slug: 'sample-input', type: 'user-input', name: 'Sample Input' },
          { slug: 'sample-coder', type: 'agent', name: 'Sample Coder' }
        ]));
      })
    );
    
    render(<WorkUnitToolbox workspaceCtx={ctx} />);
    
    await waitFor(() => {
      expect(screen.getByText('Sample Input')).toBeInTheDocument();
      expect(screen.getByText('Sample Coder')).toBeInTheDocument();
    });
  });
});

describe('Edge Connection Validation', () => {
  test('should reject incompatible output→input connection', () => {
    /**
     * Purpose: Proves type validation prevents invalid connections
     * Quality Contribution: Prevents runtime errors from type mismatches
     * Acceptance Criteria: Error modal shown, edge not created
     */
    
    // Use Fake implementations per Constitution Principle 4
    const fakeInstance = new FakeWorkGraphUIInstance('test-graph');
    const fakeModalService = new FakeModalService();
    
    const { result } = renderHook(() => useWorkGraphFlow(fakeInstance), {
      wrapper: ({ children }) => (
        <ModalServiceProvider value={fakeModalService}>{children}</ModalServiceProvider>
      )
    });
    
    // Try connecting file output to data input
    act(() => {
      result.current.onConnect({
        source: 'coder-node',
        sourceHandle: 'script-file',  // file type
        target: 'validator-node',
        targetHandle: 'input-text'    // data/text type
      });
    });
    
    expect(fakeModalService.getLastErrorMessage()).toContain('Incompatible');
    expect(result.current.edges).not.toContainEqual(
      expect.objectContaining({ source: 'coder-node', target: 'validator-node' })
    );
  });
});
```

### Acceptance Criteria
- [ ] All 15 tasks complete
- [ ] Drag-drop adds unconnected node (AC-2)
- [ ] Manual edge connection with type validation (AC-2)
- [ ] Node deletion removes single node; downstream nodes become pending (AC-3)
- [ ] Auto-save within 500ms (AC-4)
- [ ] Optimistic updates rollback on failure

### Commands to Run
```bash
# Run Phase 3 tests
pnpm test -- --testPathPattern="022-workgraph-ui" --testPathPattern="(toolbox|edge|delete|save)"

# Type check
just typecheck

# Lint
just lint

# Integration test with dev server
pnpm dev  # Test drag-drop manually in browser
```

---

### Phase 4: Real-time Updates

**Objective**: Implement SSE subscription for external change detection and automatic UI refresh.

**Deliverables**:
- useWorkGraphSSE hook for SSE subscription
- Server-side SSE emission on graph changes
- File watcher in WorkGraphUIInstance (polling)
- Automatic refresh on external change detection
- Conflict notification toast

**Dependencies**: Phase 3 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SSE connection drops | Medium | Medium | Auto-reconnect via useSSE hook |
| Polling overhead | Low | Low | 2s interval, debounced |

### Tasks (Full TDD)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Write tests for useWorkGraphSSE hook | 2 | Tests cover: subscription, message filtering by slug, refresh trigger | - | |
| 4.2 | [ ] | Implement useWorkGraphSSE hook | 2 | Subscribes to 'workgraphs' channel, filters by activeGraphSlug | - | |
| 4.3 | [ ] | Write tests for server-side SSE emission | 2 | Tests cover: WorkGraphUIService broadcasts on change | - | |
| 4.4 | [ ] | Implement server-side emission in WorkGraphUIService | 2 | Service calls sseManager.broadcast('workgraphs', 'graph-updated', {graphSlug}) | - | |
| 4.5 | [x] | Write tests for file watching (polling) | 2 | Tests cover: detect file change, emit event | [📋](tasks/phase-4-real-time-updates/001-subtask-file-watching-for-cli-changes.execution.log.md#st003-5) | Subtask 001 [^16] |
| 4.6 | [x] | Implement file watcher in WorkGraphUIInstance | 3 | WorkspaceChangeNotifierService watches state.json, emits GraphChangedEvent | [📋](tasks/phase-4-real-time-updates/001-subtask-file-watching-for-cli-changes.execution.log.md#st004-2) | Subtask 001 [^16] |
| 4.7 | [ ] | Write tests for refresh-on-notify flow | 2 | Tests cover: SSE event → refresh() → state updated | - | |
| 4.8 | [ ] | Wire up SSE hook in graph page | 1 | Page uses useWorkGraphSSE, instance refreshes on notify | - | |
| 4.9 | [ ] | Write tests for conflict toast notification | 1 | Tests cover: external change shows toast | - | |
| 4.10 | [ ] | Implement conflict toast notification | 1 | Toast: "Graph updated externally" on refresh from SSE | - | |
| 4.11 | [ ] | Create SSE route for workgraphs channel | 1 | GET /api/events/workgraphs returns SSE stream | - | May exist already |

### Test Examples (Write First!)

```typescript
describe('useWorkGraphSSE', () => {
  test('should trigger refresh when SSE event matches graph slug', async () => {
    /**
     * Purpose: Proves SSE notification triggers instance refresh
     * Quality Contribution: External changes detected within 2s
     * Acceptance Criteria: instance.refresh() called on matching event
     */
    
    // Use Fake implementations per Constitution Principle 4
    const fakeInstance = new FakeWorkGraphUIInstance('my-graph');
    const fakeSSE = new FakeEventSource();
    
    renderHook(() => useWorkGraphSSE('my-graph', fakeInstance), {
      wrapper: ({ children }) => (
        <EventSourceProvider value={fakeSSE}>{children}</EventSourceProvider>
      )
    });
    
    // Simulate SSE event
    act(() => {
      fakeSSE.emitMessage({ type: 'graph-updated', graphSlug: 'my-graph' });
    });
    
    expect(fakeInstance.wasRefreshCalled()).toBe(true);
  });

  test('should ignore SSE events for other graphs', async () => {
    /**
     * Purpose: Proves event filtering by graphSlug
     * Quality Contribution: Only relevant graphs refresh
     * Acceptance Criteria: No refresh for non-matching slug
     */
    
    const fakeInstance = new FakeWorkGraphUIInstance('my-graph');
    const fakeSSE = new FakeEventSource();
    
    renderHook(() => useWorkGraphSSE('my-graph', fakeInstance), {
      wrapper: ({ children }) => (
        <EventSourceProvider value={fakeSSE}>{children}</EventSourceProvider>
      )
    });
    
    act(() => {
      fakeSSE.emitMessage({ type: 'graph-updated', graphSlug: 'other-graph' });
    });
    
    expect(fakeInstance.wasRefreshCalled()).toBe(false);
  });
});
```

### Acceptance Criteria
- [ ] All 11 tasks complete
- [ ] External changes detected within 2s (AC-8)
- [ ] SSE notification triggers refresh
- [ ] Conflict toast shows on external change
- [ ] File polling as fallback works

### Commands to Run
```bash
# Run Phase 4 tests
pnpm test -- --testPathPattern="022-workgraph-ui" --testPathPattern="(sse|watch|refresh|toast)"

# Type check
just typecheck

# Lint
just lint

# Manual SSE verification
# Terminal 1: pnpm dev
# Terminal 2: curl http://localhost:3000/api/events/workgraphs  # Verify SSE stream
```

---

### Phase 5: Question/Answer UI

**Objective**: Implement question detection and type-specific answer forms for agent handover.

**Deliverables**:
- Question detection in node state
- QuestionModal component with type-specific forms
- Text input, single-choice, multi-choice, confirm UI
- Answer submission via API
- Special handling for UserInputUnit direct input

**Dependencies**: Phase 4 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Question type edge cases | Low | Medium | Test all 4 types thoroughly |
| UserInputUnit flow confusion | Medium | Medium | Clear visual distinction |

### Tasks (Full TDD)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Write tests for question detection in UINodeState | 2 | Tests cover: detect waiting-question status, extract question from handover | - | |
| 5.2 | [ ] | Implement question detection in WorkGraphUIInstance | 2 | Node with waiting-question has question property populated | - | |
| 5.3 | [ ] | Write tests for QuestionModal component | 3 | Tests cover: all 4 question types render correctly | - | |
| 5.4 | [ ] | Implement QuestionModal base component | 2 | Modal opens on node click when hasQuestion | - | |
| 5.5 | [ ] | Implement text question form | 2 | Textarea input, submit button | - | |
| 5.6 | [ ] | Implement single-choice question form | 2 | Radio buttons from options | - | |
| 5.7 | [ ] | Implement multi-choice question form | 2 | Checkboxes from options | - | |
| 5.8 | [ ] | Implement confirm question form | 1 | Yes/No buttons | - | |
| 5.9 | [ ] | Write tests for answer submission | 2 | Tests cover: API call, status update, modal close | - | |
| 5.10 | [ ] | Create API route for answering question | 2 | POST /api/workgraphs/[slug]/nodes/[nodeId]/answer | - | |
| 5.11 | [ ] | Implement answer submission flow | 2 | Submit → API → node status updates → modal closes | - | |
| 5.12 | [ ] | Write tests for UserInputUnit direct input | 2 | Tests cover: user-input node shows input form, skips running state | - | |
| 5.13 | [ ] | Implement UserInputUnit special handling | 3 | Ready user-input node shows input form, direct complete | - | Discovery 02 |
| 5.14 | [ ] | Create API route for direct node output | 2 | POST /api/workgraphs/[slug]/nodes/[nodeId]/output | - | |
| 5.15 | [ ] | Wire question indicator to node click | 1 | Clicking node with question opens QuestionModal | - | |

### Test Examples (Write First!)

```typescript
describe('QuestionModal', () => {
  test('should render single-choice options as radio buttons', () => {
    /**
     * Purpose: Proves single-choice questions render correctly
     * Quality Contribution: Users can select from predefined options
     * Acceptance Criteria: Radio buttons for each option, labels match
     */
    
    const question = {
      type: 'single',
      prompt: 'Which language?',
      options: [
        { key: 'A', label: 'TypeScript' },
        { key: 'B', label: 'Python' }
      ]
    };
    
    // Use FakeQuestionHandler per Constitution Principle 4
    const handler = new FakeQuestionHandler();
    render(<QuestionModal question={question} onSubmit={handler.submit} />);
    
    expect(screen.getByText('Which language?')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'TypeScript' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Python' })).toBeInTheDocument();
  });

  test('should submit answer with correct format', async () => {
    /**
     * Purpose: Proves answer submission matches expected format
     * Quality Contribution: Answer compatible with CLI answer command
     * Acceptance Criteria: onSubmit called with { selection: 'A' }
     */
    
    // Use FakeQuestionHandler with assertion helpers
    const handler = new FakeQuestionHandler();
    render(<QuestionModal question={singleChoiceQuestion} onSubmit={handler.submit} />);
    
    await userEvent.click(screen.getByRole('radio', { name: 'TypeScript' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    
    expect(handler.wasSubmittedWith({ selection: 'A' })).toBe(true);
  });
});

describe('UserInputUnit Direct Input', () => {
  test('should show input form instead of running state for ready user-input node', () => {
    /**
     * Purpose: Proves UserInputUnit skips running state
     * Quality Contribution: Direct user input without agent involvement
     * Acceptance Criteria: No spinner, input form visible
     */
    
    // Use FakeWorkGraphUIInstance per Constitution Principle 4
    const fakeInstance = FakeWorkGraphUIInstance.withNodes([
      { 
        id: 'input-node', 
        unitType: 'user-input',
        status: 'ready',
        unitConfig: { user_input: { question_type: 'text', prompt: 'Enter spec' } }
      }
    ]);
    
    render(<WorkGraphCanvas instance={fakeInstance} />);
    
    expect(screen.queryByTestId('spinner-icon')).not.toBeInTheDocument();
    expect(screen.getByText('Enter spec')).toBeInTheDocument();
  });
});
```

### Acceptance Criteria
- [ ] All 15 tasks complete
- [ ] Question indicator visible on waiting-question nodes (AC-6)
- [ ] All 4 question types render correctly (AC-6)
- [ ] Answer submission returns node to running (AC-7)
- [ ] UserInputUnit direct input works (Discovery 02)

### Commands to Run
```bash
# Run Phase 5 tests
pnpm test -- --testPathPattern="022-workgraph-ui" --testPathPattern="(question|modal|answer|userinput)"

# Type check
just typecheck

# Lint
just lint

# Manual question flow verification
# Use CLI: wg node ask <graph> <node> --type single --text "Test?" --options A:Yes B:No
# Verify modal appears in UI
```

---

### Phase 6: Layout Persistence

**Objective**: Persist node positions to layout.json and implement auto-arrange for new nodes.

**Deliverables**:
- Layout.json read/write
- Position updates on node drag
- Debounced layout save (500ms)
- Auto-arrange algorithm for new nodes only
- Backward compatibility for graphs without layout

**Dependencies**: Phase 3 complete (can run in parallel with 4, 5)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Layout file conflicts | Low | Low | Last-write-wins |
| Auto-arrange visual quality | Medium | Low | Simple vertical cascade |

### Tasks (Full TDD)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 6.1 | [ ] | Write tests for layout.json read | 2 | Tests cover: load existing, handle missing, validate schema | - | |
| 6.2 | [ ] | Implement layout loading in WorkGraphUIInstance | 2 | Load layout.json, merge with nodes, fallback to auto | - | |
| 6.3 | [ ] | Write tests for layout.json write | 2 | Tests cover: save positions, debounce, atomic write | - | |
| 6.4 | [ ] | Create API route for layout persistence | 2 | PUT /api/workgraphs/[slug]/layout | - | |
| 6.5 | [ ] | Implement layout save with debounce | 2 | Node drag triggers save after 500ms idle | - | |
| 6.6 | [ ] | Write tests for auto-arrange algorithm | 2 | Tests cover: new node gets position below predecessor | - | |
| 6.7 | [ ] | Implement auto-arrange for new nodes | 2 | New nodes auto-positioned, existing nodes unchanged | - | AC-3 clarification |
| 6.8 | [ ] | Write tests for position update on drag | 2 | Tests cover: onNodeDragStop updates position | - | |
| 6.9 | [ ] | Implement position update in useWorkGraphFlow | 2 | Dragging node updates instance state | - | |
| 6.10 | [ ] | Write tests for backward compatibility | 1 | Tests cover: old graph without layout.json renders | - | |
| 6.11 | [ ] | Implement fallback auto-arrange | 1 | Missing layout triggers full auto-arrange | - | |

### Test Examples (Write First!)

```typescript
describe('Layout Persistence', () => {
  test('should load positions from layout.json', async () => {
    /**
     * Purpose: Proves layout file correctly hydrates node positions
     * Quality Contribution: User positions persist across sessions
     * Acceptance Criteria: Node positions match layout.json values
     */
    
    const mockLayout = {
      version: '1.0.0',
      nodes: {
        'start': { x: 100, y: 50 },
        'nodeA': { x: 100, y: 200 }
      }
    };
    
    fakeService.setLayout('my-graph', mockLayout);
    const instance = await service.getInstance(ctx, 'my-graph');
    
    expect(instance.nodes.get('start')?.position).toEqual({ x: 100, y: 50 });
    expect(instance.nodes.get('nodeA')?.position).toEqual({ x: 100, y: 200 });
  });

  test('should auto-arrange only new nodes', async () => {
    /**
     * Purpose: Proves existing positions preserved when adding node
     * Quality Contribution: User layout not disrupted by new nodes
     * Acceptance Criteria: Existing node unchanged, new node auto-positioned
     */
    
    const instance = await service.getInstance(ctx, 'my-graph');
    const existingPosition = instance.nodes.get('nodeA')?.position;
    
    await instance.addNode('nodeA', 'sample-coder');
    
    // Existing node unchanged
    expect(instance.nodes.get('nodeA')?.position).toEqual(existingPosition);
    
    // New node auto-positioned below predecessor
    const newNode = [...instance.nodes.values()].find(n => n.unitSlug === 'sample-coder');
    expect(newNode?.position.y).toBeGreaterThan(existingPosition.y);
  });
});
```

### Acceptance Criteria
- [ ] All 11 tasks complete
- [ ] Positions saved to layout.json (AC-9)
- [ ] Positions restored on load (AC-9)
- [ ] Auto-arrange only for new nodes (Clarification Q3)
- [ ] Backward compatible with old graphs

### Commands to Run
```bash
# Run Phase 6 tests
pnpm test -- --testPathPattern="022-workgraph-ui" --testPathPattern="(layout|position|arrange)"

# Type check
just typecheck

# Lint
just lint

# Verify layout file creation
# Drag node in UI, then check: cat <worktree>/.chainglass/data/work-graphs/<slug>/layout.json
```

---

### Phase 7: Graph Management

**Objective**: Implement graph lifecycle operations - create, delete, list with workspace scoping.

**Deliverables**:
- Graph listing page with workspace filter
- Create graph dialog with slug input
- Delete graph with confirmation
- Workspace context handling from URL

**Dependencies**: Phase 2 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Accidental deletion | Low | High | Confirmation dialog required |
| Workspace context lost | Low | Medium | URL param persists across navigation |

### Tasks (Full TDD)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 7.1 | [ ] | Write tests for graph listing with workspace filter | 2 | Tests cover: filter by workspace, empty state | - | |
| 7.2 | [ ] | Implement graph list component | 2 | Displays graphs from API, links to detail page | - | |
| 7.3 | [ ] | Write tests for create graph dialog | 2 | Tests cover: slug validation, API call, redirect | - | |
| 7.4 | [ ] | Implement CreateGraphDialog component | 2 | Slug input, create button, validation | - | |
| 7.5 | [ ] | Create API route for creating graph | 2 | POST /api/workgraphs creates graph directory | - | AC-1 |
| 7.6 | [ ] | Write tests for delete graph with confirmation | 2 | Tests cover: confirmation required, API call, removal from list | - | |
| 7.7 | [ ] | Implement DeleteGraphDialog component | 2 | Confirmation prompt, delete button | - | |
| 7.8 | [ ] | Create API route for deleting graph | 2 | DELETE /api/workgraphs/[slug] removes directory | - | AC-10 |
| 7.9 | [ ] | Write tests for workspace context from URL | 1 | Tests cover: read param, pass to service | - | |
| 7.10 | [ ] | Implement workspace context hook | 1 | useWorkspaceContext reads from URL searchParams | - | |
| 7.11 | [ ] | Wire up /workgraphs page with full functionality | 2 | List, create, delete all working | - | |
| 7.12 | [ ] | Add navigation between list and detail | 1 | Links work, workspace param preserved | - | |

### Test Examples (Write First!)

```typescript
describe('CreateGraphDialog', () => {
  test('should validate slug format', async () => {
    /**
     * Purpose: Proves slug validation prevents invalid names
     * Quality Contribution: Graph directories created with valid names
     * Acceptance Criteria: Invalid slugs show error, valid slugs accepted
     */
    
    // Use FakeDialogHandler per Constitution Principle 4
    const handler = new FakeDialogHandler();
    render(<CreateGraphDialog onClose={handler.close} />);
    
    const input = screen.getByLabelText('Graph Slug');
    await userEvent.type(input, 'Invalid Slug!');
    
    expect(screen.getByText('Slug must be lowercase with hyphens')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });
});

describe('DeleteGraphDialog', () => {
  test('should require confirmation before delete', async () => {
    /**
     * Purpose: Proves accidental deletion prevented
     * Quality Contribution: User must confirm destructive action
     * Acceptance Criteria: Type graph name to enable delete button
     */
    
    // Use FakeDialogHandler per Constitution Principle 4
    const handler = new FakeDialogHandler();
    render(<DeleteGraphDialog graphSlug="my-graph" onConfirm={handler.confirm} />);
    
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    
    await userEvent.type(screen.getByLabelText('Type graph name to confirm'), 'my-graph');
    
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });
});
```

### Acceptance Criteria
- [ ] All 12 tasks complete
- [ ] Graph creation works (AC-1)
- [ ] Graph deletion with confirmation (AC-10)
- [ ] Workspace scoping works (AC-11)
- [ ] Navigation preserves workspace context

### Commands to Run
```bash
# Run Phase 7 tests
pnpm test -- --testPathPattern="022-workgraph-ui" --testPathPattern="(create|delete|list|workspace)"

# Type check
just typecheck

# Lint
just lint

# Full feature verification
just check  # Runs all lint, typecheck, test
```

---

## Cross-Cutting Concerns

### Security Considerations

- **Input Validation**: All user inputs (slug, answers) validated before API calls
- **Path Traversal**: Workspace context validated to prevent directory escape
- **CSRF**: API routes use standard Next.js protections
- **XSS**: React escaping handles user-provided content

### Observability

- **Logging**: Use existing PinoLoggerAdapter for service layer logging
- **Errors**: All API errors return structured format with error codes
- **Metrics**: Consider adding timing for SSE event latency (future)

### Documentation

**Location**: Hybrid (README + docs/how/)

**Content**:
- **README.md**: Brief section with screenshot, basic usage
- **docs/how/workgraph-ui/1-overview.md**: Architecture, components
- **docs/how/workgraph-ui/2-usage.md**: User guide with examples
- **docs/how/workgraph-ui/3-development.md**: Developer guide, testing

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| WorkGraphUIInstance | 4 | Large | S=2,I=1,D=1,N=1,F=1,T=2 | Core state management with computed status, SSE integration | Comprehensive headless tests |
| Edge Connection Validation | 3 | Medium | S=1,I=1,D=0,N=1,F=0,T=2 | Type compatibility checking requires understanding IODeclaration | Start with simple types, expand |
| SSE Integration | 3 | Medium | S=1,I=2,D=0,N=1,F=1,T=1 | Using existing SSEManager but new channel routing | Use proven notification-fetch pattern |
| Question/Answer Flow | 3 | Medium | S=2,I=1,D=0,N=1,F=0,T=2 | 4 question types with different UI | Test each type in isolation |

---

## Progress Tracking

### Phase Completion Checklist
- [x] Phase 1: Headless State Management - COMPLETE
- [x] Phase 2: Visual Graph Display - COMPLETE
- [x] Phase 3: Graph Editing - COMPLETE
- [ ] Phase 4: Real-time Updates - NOT STARTED
- [ ] Phase 5: Question/Answer UI - NOT STARTED
- [ ] Phase 6: Layout Persistence - NOT STARTED
- [ ] Phase 7: Graph Management - NOT STARTED

### STOP Rule
**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Change Footnotes Ledger

**NOTE**: This section tracks file changes during implementation by phase.

**Footnote Numbering Authority**: plan-6a-update-progress is the **single source of truth** for footnote numbering across the entire plan.

### Phase 1 Footnotes

(Phase 1 changes predated formal footnote tracking)

### Phase 2 Footnotes

(Phase 2 changes predated formal footnote tracking)

### Phase 3 Footnotes

[^1]: Task 3.1 - WorkUnitToolbox tests
  - `file:test/unit/web/features/022-workgraph-ui/workunit-toolbox.test.tsx`

[^2]: Task 3.2 - Units API route
  - `file:apps/web/app/api/workspaces/[slug]/units/route.ts`

[^3]: Task 3.3 - WorkUnitToolbox component
  - `file:apps/web/src/features/022-workgraph-ui/workunit-toolbox.tsx`

[^4]: Task 3.4 - Drop handler tests
  - `file:test/unit/web/features/022-workgraph-ui/drop-handler.test.ts`

[^5]: Task 3.5 - Drop handler implementation
  - `file:apps/web/src/features/022-workgraph-ui/drop-handler.ts`

[^6]: Task 3.6 - Edge connection tests
  - `file:test/unit/web/features/022-workgraph-ui/edge-connection.test.ts`

[^7]: Task 3.7/T014a - canConnect() implementation and edge validation
  - `method:packages/workgraph/src/services/workgraph.service.ts:WorkGraphService.canConnect`
  - `method:packages/workgraph/src/services/workgraph.service.ts:WorkGraphService.connectNodes`
  - `file:packages/workgraph/src/interfaces/workgraph-service.interface.ts`
  - `file:packages/workgraph/src/fakes/fake-workgraph-service.ts`
  - `file:apps/web/app/api/workspaces/[slug]/workgraphs/[graphSlug]/edges/route.ts`

[^8]: Tasks 3.8-3.9/T008-T009 - Node deletion (already implemented in T016)
  - `method:apps/web/src/features/022-workgraph-ui/workgraph-ui.instance.ts:WorkGraphUIInstance.removeNode`
  - `method:apps/web/src/features/022-workgraph-ui/fake-workgraph-ui-instance.ts:FakeWorkGraphUIInstance.removeNode`

[^9]: Tasks 3.10-3.11/T010-T011 - Auto-save tests and debounce
  - `file:test/unit/web/features/022-workgraph-ui/auto-save.test.ts`

[^10]: Tasks 3.12-3.13/T012-T013 - Nodes API routes
  - `file:apps/web/app/api/workspaces/[slug]/workgraphs/[graphSlug]/nodes/route.ts`

[^11]: Task 3.14/T014 - Edges API route
  - `file:apps/web/app/api/workspaces/[slug]/workgraphs/[graphSlug]/edges/route.ts`

[^12]: Task 3.15/T015 - Optimistic rollback tests
  - `file:test/unit/web/features/022-workgraph-ui/optimistic-rollback.test.ts`

[^13]: Task T016 - Extend IWorkGraphUIInstance with mutation methods
  - `file:apps/web/src/features/022-workgraph-ui/workgraph-ui.types.ts`
  - `method:apps/web/src/features/022-workgraph-ui/workgraph-ui.instance.ts:WorkGraphUIInstance.addUnconnectedNode`
  - `method:apps/web/src/features/022-workgraph-ui/workgraph-ui.instance.ts:WorkGraphUIInstance.addNodeAfter`
  - `method:apps/web/src/features/022-workgraph-ui/workgraph-ui.instance.ts:WorkGraphUIInstance.connectNodes`
  - `method:apps/web/src/features/022-workgraph-ui/workgraph-ui.instance.ts:WorkGraphUIInstance.disconnectNode`
  - `method:apps/web/src/features/022-workgraph-ui/workgraph-ui.instance.ts:WorkGraphUIInstance.updateNodeLayout`
  - `file:apps/web/src/features/022-workgraph-ui/fake-workgraph-ui-instance.ts`

[^14]: Task T017 - Canvas editing mode
  - `file:apps/web/src/features/022-workgraph-ui/workgraph-canvas.tsx`

[^15]: Task T018 - PlanPak symlinks (if created)
  - `file:docs/plans/022-workgraph-ui/files/`

### Phase 4 Footnotes

[^16]: Subtask 001 (Tasks 4.5-4.6) - WorkspaceChangeNotifierService file watching
  - `interface:packages/workflow/src/interfaces/file-watcher.interface.ts:IFileWatcher`
  - `interface:packages/workflow/src/interfaces/file-watcher.interface.ts:IFileWatcherFactory`
  - `interface:packages/workflow/src/interfaces/workspace-change-notifier.interface.ts:IWorkspaceChangeNotifierService`
  - `interface:packages/workflow/src/interfaces/workspace-change-notifier.interface.ts:GraphChangedEvent`
  - `class:packages/workflow/src/adapters/chokidar-file-watcher.adapter.ts:ChokidarFileWatcherAdapter`
  - `class:packages/workflow/src/adapters/chokidar-file-watcher.adapter.ts:ChokidarFileWatcherFactory`
  - `class:packages/workflow/src/services/workspace-change-notifier.service.ts:WorkspaceChangeNotifierService`
  - `class:packages/workflow/src/fakes/fake-file-watcher.ts:FakeFileWatcher`
  - `class:packages/workflow/src/fakes/fake-file-watcher.ts:FakeFileWatcherFactory`
  - `class:packages/workflow/src/fakes/fake-workspace-change-notifier.service.ts:FakeWorkspaceChangeNotifierService`
  - `file:test/unit/workflow/workspace-change-notifier.service.test.ts`
  - `file:test/integration/workflow/workspace-change-notifier.integration.test.ts`

---

**Next steps:**
- Run `/plan-4-complete-the-plan` to validate readiness
- After validation: `/plan-5-phase-tasks-and-brief --phase 1` to generate Phase 1 task dossier

---

## Subtasks Registry

Mid-implementation detours requiring structured tracking.

| ID | Created | Phase | Parent Task | Reason | Status | Dossier |
|----|---------|-------|-------------|--------|--------|---------|
| 001-subtask-file-watching-for-cli-changes | 2026-01-29 | Phase 4: Real-time Updates | T006, T012 | Spec requires file watching (line 160, 267, 316) but only SSE was implemented; CLI changes don't trigger UI refresh | [x] Complete | [Link](tasks/phase-4-real-time-updates/001-subtask-file-watching-for-cli-changes.md) |
| 003-subtask-workgraph-node-actions-context | 2026-01-30 | Phase 4: Real-time Updates | T008, T010 | React Flow nodeTypes don't forward props; need extensible context for delete buttons and future node actions | [ ] Pending | [Link](tasks/phase-4-real-time-updates/003-subtask-workgraph-node-actions-context.md) |
