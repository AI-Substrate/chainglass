# WorkGraph UI with Drag-Drop Graph Editor

**Mode**: Full
**File Management**: PlanPak

## Research Context

**Research Status**: Complete (see `research-dossier.md`)

**Key Findings from Research**:
- **Components affected**: WorkGraphService, WorkNodeService, WorkUnitService (existing); React Flow v12.10.0 (existing)
- **Critical dependencies**: SSE notification system (ADR-0007), workspace storage model (ADR-0008), existing data schemas
- **Modification risks**: 
  - Must compute `pending`/`ready` statuses client-side (not stored)
  - Direct output pattern for UserInputUnit (skip `running` state)
  - Graph mutability during execution requires conflict resolution
  - Layout persistence needs data model extension

**Link**: See `research-dossier.md` for full analysis (55+ findings across 7 research threads)

📚 **This specification incorporates findings from research-dossier.md**

---

## Summary

A web-based UI for creating, viewing, and managing WorkGraphs - directed acyclic graphs (DAGs) representing composable AI workflows. Users can drag WorkUnits from a toolbox onto a canvas, connect them with edges, and watch real-time status updates as agents execute nodes. The UI provides question/answer handover UX when agents need human input, persists layout state, and gracefully handles concurrent modifications from CLI or other agents.

**Core value**: Transform WorkGraph creation from a CLI-only workflow into a visual experience, enabling rapid prototyping of complex agent workflows with immediate feedback on structure and execution state.

---

## Goals

1. **Visual graph creation**: Drag WorkUnits from toolbox onto canvas (currently AgentUnit, CodeUnit, UserInputUnit - extensible for future unit types)
2. **Real-time status visibility**: Display node statuses (pending, ready, running, waiting-question, blocked-error, complete) with visual indicators
3. **Question/answer handover**: Render question UI when agents ask questions; submit answers back to agent
4. **Persistent layout**: Save node positions so graphs maintain visual structure across sessions
5. **Auto-save**: Continuously persist graph structure changes to filesystem (existing YAML/JSON format)
6. **External change detection**: Reload graph when modified externally (CLI, agent) via SSE + filesystem polling
7. **Graph lifecycle management**: Create new graphs, delete existing graphs, list available graphs in workspace
8. **Workspace-aware**: All operations scoped to a workspace context (worktree path)

---

## Non-Goals

1. **Graph execution in browser**: Agent system not browser-ready; execution happens via CLI
2. **Agent integration**: Agents are OOS for this plan; UI developed in isolation. Use dev tools to simulate node states (running, waiting-question, complete, etc.)
3. **Advanced layout algorithms**: Simple auto-arrange on structure changes; manual positioning otherwise
4. **Undo/redo**: Not required for MVP; rely on git for versioning
5. **Collaborative editing**: Single-user with conflict detection, not multi-user CRDT
6. **Custom WorkUnit creation**: WorkUnits managed via CLI; UI consumes existing units
7. **~~Edge editing~~**: ~~Edges derived from node input mappings; no direct edge manipulation~~ **CHANGED**: Users DO manually connect edges by dragging from input to output connectors
8. **Inline code editing**: Code/prompt template editing stays in CLI/IDE

---

## Complexity

**Score**: CS-4 (Large)

**Breakdown**:
- **S (Surface Area)**: 2 - New UI package, service layer, React Flow integration, API endpoints, multiple components
- **I (Integration Breadth)**: 2 - React Flow (existing), SSE (ADR-0007), filesystem watching, WorkGraph services (3 services)
- **D (Data & State)**: 1 - Layout persistence extends data model (non-breaking), no migrations, JSON state management
- **N (Novelty & Ambiguity)**: 1 - Some ambiguity in conflict resolution strategy, question UX patterns, layout persistence format
- **F (Non-Functional)**: 1 - Real-time updates performance, SSE connection stability, file watching reliability
- **T (Testing & Rollout)**: 1 - Integration tests with real services, React Flow interactions, SSE event handling

**Total**: 8 points → CS-4 (Large)

**Confidence**: 0.75

**Assumptions**:
- React Flow v12.10.0 API remains stable
- SSE infrastructure from ADR-0007 is production-ready
- WorkGraph services have stable interfaces
- Layout data can extend work-graph.yaml without breaking changes
- Question types (text, single, multi, confirm) cover all agent needs
- WorkUnit types are extensible; UI must dynamically discover available units (not hardcode 3 types)

**Dependencies**:
- Existing WorkGraphService, WorkNodeService, WorkUnitService implementations
- SSE notification system (ADR-0007)
- Workspace context resolution (ADR-0008)
- React Flow v12.10.0 library

**Risks**:
- **Concurrent modification conflicts**: UI and CLI/agent editing same graph requires careful reconciliation
- **SSE connection drops**: Must handle reconnection and state synchronization gracefully
- **Layout thrashing**: External structure changes could disrupt manual layout; need smart auto-arrange
- **Performance at scale**: Large graphs (50+ nodes) may challenge React Flow rendering
- **Question polling latency**: Detecting `waiting-question` state relies on SSE or polling interval
- **Browser filesystem API mismatch**: Filesystem watching may behave differently than Node.js environment

**Phases**:
1. **Phase 1 - Headless State Management**: WorkGraphUIService/Instance with computed status, file watching, test infrastructure (no React)
2. **Phase 2 - Visual Graph Display**: React Flow integration, read-only graph rendering, basic node types
3. **Phase 3 - Graph Editing**: Toolbox with drag-drop, node add/remove, auto-save, optimistic updates
4. **Phase 4 - Real-time Updates**: SSE event handling, external change detection, conflict resolution
5. **Phase 5 - Question/Answer UI**: Question detection, type-specific forms, answer submission
6. **Phase 6 - Layout Persistence**: Position storage in YAML/JSON, auto-arrange on structure changes
7. **Phase 7 - Graph Management**: Create/delete graphs, workspace selection, graph listing UI

---

## New Components

### WorkGraphUIService (Singleton)

Factory service for managing WorkGraph UI instances across the application.

```typescript
interface WorkGraphUIService {
  // Get or create an instance for a specific graph
  getInstance(ctx: WorkspaceContext, graphSlug: string): Promise<WorkGraphUIInstance>;
  
  // List all graphs in workspace (for graph picker UI)
  listGraphs(ctx: WorkspaceContext): Promise<GraphSummary[]>;
  
  // Create a new graph and return its instance
  createGraph(ctx: WorkspaceContext, slug: string): Promise<WorkGraphUIInstance>;
  
  // Delete a graph (removes from filesystem)
  deleteGraph(ctx: WorkspaceContext, slug: string): Promise<void>;
  
  // Dispose all instances (cleanup on unmount)
  disposeAll(): void;
}
```

**Rules**:
- Singleton per application; injected via React context or DI container
- Caches instances by `${worktreePath}/${graphSlug}` key
- All graphs in workspace are "hot-loaded" on service init (watching for changes)
- Delegates to existing `IWorkGraphService` for filesystem operations

### WorkGraphUIInstance (Per-Graph)

Stateful instance representing a single WorkGraph's UI state. Implements desired-state pattern for headless testing.

```typescript
interface WorkGraphUIInstance {
  // Identity
  readonly graphSlug: string;
  readonly workspaceCtx: WorkspaceContext;
  
  // Desired State (UI renders from this)
  readonly definition: WorkGraphDefinition;  // From work-graph.yaml
  readonly state: WorkGraphState;            // From state.json
  readonly nodes: Map<string, UINodeState>;  // Enriched node state
  readonly edges: Edge[];                    // React Flow edges
  
  // Computed Properties
  readonly graphStatus: GraphStatus;         // pending | in_progress | complete | failed
  readonly hasQuestions: boolean;            // Any node in waiting-question?
  readonly hasErrors: boolean;               // Any node in blocked-error?
  
  // Subscriptions (SSE + file watching)
  subscribe(callback: (event: GraphEvent) => void): Unsubscribe;
  
  // Mutations (optimistic updates → API call → confirm/rollback)
  addNode(afterNodeId: string, unitSlug: string, inputs?: Record<string, string>): Promise<void>;
  removeNode(nodeId: string, cascade?: boolean): Promise<void>;
  updateNodeLayout(nodeId: string, position: Position): Promise<void>;
  
  // Question Handling
  answerQuestion(nodeId: string, questionId: string, answer: Answer): Promise<void>;
  
  // Refresh (force reload from filesystem)
  refresh(): Promise<void>;
  
  // Cleanup
  dispose(): void;
}

interface UINodeState {
  id: string;
  unitSlug?: string;              // undefined for 'start' node
  unitType?: 'agent' | 'code' | 'user-input';
  status: NodeStatus;             // Computed: pending/ready or Stored: running/waiting-question/etc.
  position: Position;             // For React Flow layout
  question?: Question;            // Present when status === 'waiting-question'
  error?: HandoverError;          // Present when status === 'blocked-error'
  inputs: Record<string, InputMapping>;
  outputsReady: boolean;          // All required outputs saved?
}

type GraphEvent =
  | { type: 'changed' }                      // Graph data changed - re-render from instance state
  | { type: 'error'; message: string };      // Error occurred
```

**Note**: Internal events are simple because we follow the desired-state pattern. When `changed` fires, React re-reads from `instance.nodes`/`instance.edges` which are already updated. No need to encode specific changes in events.

**Rules**:
- One instance per open graph; created by `WorkGraphUIService.getInstance()`
- Hydrates from filesystem on creation (work-graph.yaml + state.json + node configs)
- Computes `pending`/`ready` status from DAG structure (not stored)
- Subscribes to SSE channel for real-time updates
- Polls filesystem as fallback (configurable interval, default 2s)
- Optimistic updates: mutate local state immediately, then API call, rollback on failure
- External changes (CLI/agent) trigger `structure-changed` event → full refresh
- Layout changes debounced (500ms) before persisting to avoid write thrashing
- Disposable: unsubscribes from SSE, stops polling, clears state

### React Flow Integration

```typescript
// Hook to connect WorkGraphUIInstance to React Flow
function useWorkGraphFlow(instance: WorkGraphUIInstance) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  
  // Sync instance state → React Flow state
  useEffect(() => {
    const unsubscribe = instance.subscribe((event) => {
      // Update nodes/edges based on event type
    });
    return unsubscribe;
  }, [instance]);
  
  // Convert UINodeState → React Flow Node
  // Convert definition.edges → React Flow Edge
  
  return { nodes, edges, onNodesChange, onEdgesChange };
}
```

### WorkUnitToolbox

Component for displaying available WorkUnits that can be dragged onto canvas.

```typescript
interface WorkUnitToolboxProps {
  workspaceCtx: WorkspaceContext;
  onDragStart: (unitSlug: string) => void;
}

// Loads units dynamically via WorkUnitService.list()
// Groups by type (agent, code, user-input)
// Shows unit name, description, input/output count
// Drag handle for React Flow drop zone
```

**Rules**:
- Fetches available units from `WorkUnitService.list(ctx)` on mount
- Refreshes when workspace context changes
- Does NOT hardcode unit types; renders whatever units exist
- Provides drag data for React Flow `onDrop` handler

### SSE Architecture (Notification-Fetch Pattern)

Uses existing SSE infrastructure (ADR-0007) with a single `workgraphs` channel for all graphs.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              SERVER SIDE                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────┐      emits       ┌──────────────────────┐     │
│  │ WorkGraphUIInstance  │ ───────────────► │  WorkGraphUIService  │     │
│  │  (per graph)         │  GraphChanged    │     (singleton)      │     │
│  │                      │     event        │                      │     │
│  │  - detects changes   │                  │  - receives events   │     │
│  │  - file watcher      │                  │  - broadcasts SSE    │     │
│  └──────────────────────┘                  └──────────┬───────────┘     │
│                                                       │                  │
│                                                       │ broadcast        │
│                                                       ▼                  │
│                                            ┌──────────────────────┐     │
│                                            │     SSEManager       │     │
│                                            │  (existing global)   │     │
│                                            │                      │     │
│                                            │  channel: 'workgraphs'│     │
│                                            └──────────┬───────────┘     │
│                                                       │                  │
└───────────────────────────────────────────────────────┼──────────────────┘
                                                        │
                                              SSE stream │
                                                        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                              CLIENT SIDE                                   │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌─────────────────────┐                    ┌─────────────────────┐       │
│  │  useWorkGraphSSE    │  notification      │ WorkGraphUIInstance │       │
│  │      hook           │ ─────────────────► │    (client)         │       │
│  │                     │  {graphSlug: X}    │                     │       │
│  │  - subscribes to    │                    │  - receives notify  │       │
│  │    'workgraphs'     │                    │  - calls refresh()  │       │
│  │  - routes by slug   │                    │  - fetches via API  │       │
│  └─────────────────────┘                    └─────────────────────┘       │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

**SSE Event Types** (notification only - no payloads):

```typescript
// Single channel: /api/events/workgraphs
type WorkGraphSSEEvent = {
  type: 'graph-updated';
  graphSlug: string;
};

// That's it. SSE is just a notification mechanism.
// Client receives notification → calls API to fetch latest state.
```

**Server-side emission flow**:

```typescript
// WorkGraphUIInstance detects change (file watcher, API mutation, etc.)
instance.onFileChanged(() => {
  this.emit('changed'); // Internal event to service
});

// WorkGraphUIService receives and broadcasts
service.onInstanceChanged((graphSlug) => {
  sseManager.broadcast('workgraphs', 'graph-updated', { graphSlug });
});
```

**Client-side handling**:

```typescript
// Hook listens to SSE channel
function useWorkGraphSSE(activeGraphSlug: string, instance: WorkGraphUIInstance) {
  useSSE('/api/events/workgraphs', {
    onMessage: (event: WorkGraphSSEEvent) => {
      if (event.type === 'graph-updated' && event.graphSlug === activeGraphSlug) {
        // Notification received - fetch fresh data
        instance.refresh();
      }
    }
  });
}
```

**Rules**:
- Single `workgraphs` channel for all graphs (not per-graph channels)
- SSE carries only notification: `{ type: 'graph-updated', graphSlug: string }`
- No state/diff in SSE payload - client fetches via REST after notification
- Server-side `WorkGraphUIInstance` watches filesystem, emits to `WorkGraphUIService`
- `WorkGraphUIService` broadcasts via existing `sseManager.broadcast()`
- Client filters notifications by `graphSlug` to update only relevant instance
- Pattern aligns with ADR-0007 (single-channel routing) and notification-fetch pattern

---

## Acceptance Criteria

1. **AC-1 (Graph Creation)**: User can create a new graph by entering a slug; graph appears in list; work-graph.yaml created at `<worktree>/.chainglass/data/work-graphs/<slug>/`
2. **AC-2 (Node Addition)**: User can drag a WorkUnit from toolbox onto canvas (unconnected initially); node appears with auto-generated ID (`<unit-slug>-<hex3>`); user then drags edge from node input to upstream node output to connect; inputs validated on connection
3. **AC-3 (Node Removal)**: User can delete a node; only that node removed (no cascade); edges to/from node cleaned up; downstream nodes become disconnected and recompute to pending status; work-graph.yaml reflects changes
4. **AC-4 (Auto-save)**: Graph structure changes (add/remove node) save to filesystem within 500ms; no explicit "Save" button required
5. **AC-5 (Status Visualization)**: Nodes display correct visual indicator for status: pending (gray), ready (blue), running (yellow spinner), waiting-question (purple question mark), blocked-error (red X), complete (green checkmark)
6. **AC-6 (Question Rendering)**: When node enters `waiting-question` state, node shows visual indicator (question icon); clicking node opens modal with type-specific UI: text input for `text`, radio buttons for `single`, checkboxes for `multi`, yes/no buttons for `confirm`
7. **AC-7 (Question Answer)**: User can submit answer via question panel; answer saved to node data; node returns to `running` state; agent continues execution
8. **AC-8 (External Change Reload)**: When graph structure modified externally (CLI `wg node add-after`), UI detects change within 2s; graph re-renders with new structure; layout auto-adjusts only for structural changes
9. **AC-9 (Layout Persistence)**: User can drag node to new position; position saved to work-graph.yaml `layout` section; position restored on next load
10. **AC-10 (Graph Deletion)**: User can delete a graph from list; confirmation prompt appears; graph directory removed from filesystem; graph no longer appears in list
11. **AC-11 (Workspace Scoping)**: All operations use workspace context; switching workspaces shows different set of graphs
12. **AC-12 (Computed Status)**: `pending` and `ready` statuses computed from DAG structure (upstream dependencies); match CLI `wg status` output exactly

---

## Risks & Assumptions

**Risks**:
- **R-1 (Conflict Resolution)**: UI auto-saves but CLI/agent may overwrite unsaved changes; need clear conflict strategy (last-write-wins with notification?)
- **R-2 (SSE Reliability)**: Production SSE may drop connections; must handle reconnection without losing graph state
- **R-3 (Question Latency)**: Polling for `waiting-question` state may introduce 1-2s delay before showing question UI
- **R-4 (Layout Data Migration)**: Adding `layout` field to work-graph.yaml requires backward compatibility; old graphs should render with auto-layout
- **R-5 (React Flow Performance)**: 50+ node graphs may cause re-render performance issues; may need virtualization or pagination
- **R-6 (Direct Output Pattern)**: UserInputUnit nodes skip `running` state (PENDING → COMPLETE); UI must handle this flow gracefully

**Assumptions**:
- **A-1**: React Flow v12.10.0 supports all required node/edge customizations
- **A-2**: SSE notification system (ADR-0007) delivers events reliably for graph changes
- **A-3**: WorkGraph services return Results with errors[] (no exceptions for expected failures)
- **A-4**: Layout data can be optional; missing layout triggers auto-arrange
- **A-5**: Question types (text, single, multi, confirm) sufficient for all agent handovers
- **A-6**: WorkUnit types are extensible - UI discovers available units dynamically via WorkUnitService.list(); not limited to current 3 types
- **A-7**: Browser filesystem APIs not needed; all operations go through backend API
- **A-8**: Single workspace per browser tab; no cross-tab synchronization required

---

## Open Questions

1. **Q-1 (Conflict Strategy)**: When CLI/agent modifies graph while UI has unsaved changes, should UI: (a) overwrite with external changes + notify user, (b) show merge conflict UI, or (c) block external changes until UI saves?
   - **RESOLVED**: Last-write-wins + toast notification. External changes overwrite; show "Graph updated externally" toast. Conflicts rare due to instant auto-save (500ms).

2. **Q-2 (Layout Storage Format)**: Should layout data live in: (a) work-graph.yaml `layout:` section, (b) separate `layout.json` file, or (c) browser localStorage (non-portable)?
   - **RESOLVED**: Separate `layout.json` file in same directory as work-graph.yaml. Clean separation, smaller git diffs on position changes.

3. **Q-3 (Auto-arrange Trigger)**: Should UI auto-arrange layout: (a) only on structural changes from external sources, (b) on any add/remove node, or (c) never (user manually positions)?
   - **RESOLVED**: Auto-arrange only for NEW nodes (added externally or via UI); preserve existing node positions. New nodes get auto-positioned relative to their predecessor.

4. **Q-4 (Question Polling)**: Should UI detect questions via: (a) SSE events only, (b) polling state.json every 1s, or (c) SSE with polling fallback?
   - **RESOLVED**: SSE notification triggers refresh which loads latest state including questions. No separate question polling needed - follows notification-fetch pattern.

5. **Q-5 (Multi-workspace UX)**: Should workspace selection be: (a) dropdown in header (global), (b) per-graph page route (`/workspace/<slug>/graphs`), or (c) browser localStorage preference?
   - **RESOLVED**: URL query param for now (`/workgraphs?workspace=<slug>`). Workspace UI being developed in separate branch; will integrate later.

6. **Q-6 (Node Validation)**: Should UI prevent invalid node additions (e.g., adding node that expects file input after node with data output) or allow and show error state?
   - **RESOLVED**: WorkUnits can be dropped onto canvas **unconnected**. User then manually drags edge from node's input connector to upstream node's output connector. Validation happens at connection time - if inputs/outputs incompatible, show error state on node + modal explaining issue (e.g., "Required input 'script' (file) not available on connected node").

7. **Q-7 (Session Management)**: For agent nodes in `running` state, should UI display session ID and provide resume/cancel controls?
   - **RESOLVED**: No session controls for now (OOS). Agent runs via CLI; UI just shows running status indicator. Session management deferred to future iteration.

8. **Q-8 (Error Details)**: When node in `blocked-error` state, should UI show error message inline, in modal, or in side panel?
   - **RESOLVED**: Same pattern as questions - node shows error indicator; clicking opens modal with error details and actionable guidance.

---

## ADR Seeds (Optional)

### Decision Drivers
- **Real-time constraint**: Users expect <2s latency for status updates during agent execution
- **Concurrent modification**: CLI and agents can modify graph while UI open; need conflict resolution
- **Layout portability**: Layout should work across machines (rules out browser localStorage)
- **Testability**: UI state management must be testable without React (headless tests)
- **Performance**: Large graphs (50+ nodes) must render smoothly; avoid unnecessary re-renders

### Candidate Alternatives
- **State Management**: (A) Redux, (B) Zustand, (C) Custom WorkGraphUIInstance class with event emitter, (D) React Context + reducers
- **Layout Storage**: (A) work-graph.yaml `layout:` field, (B) separate layout.json, (C) browser localStorage, (D) server-side layout service
- **Real-time Updates**: (A) SSE only, (B) Polling only, (C) WebSocket, (D) SSE + polling fallback
- **Conflict Resolution**: (A) Last-write-wins + notification, (B) Merge conflict UI, (C) Operational Transform, (D) Lock-based editing

### Stakeholders
- **Primary**: Frontend developers implementing graph UI
- **Secondary**: Backend developers maintaining WorkGraph services
- **End Users**: Workflow creators using visual graph editor

---

## Workshop Opportunities

Areas that benefit from detailed design exploration BEFORE architecture:

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| State Synchronization Model | Integration Pattern | Multiple sources of truth (filesystem, SSE, optimistic UI updates) need clear reconciliation rules | 1. How to merge external changes with local edits? 2. When to invalidate optimistic updates? 3. How to handle SSE reconnection state? 4. What's the canonical source of truth? |
| Question UX Flow | CLI Flow | Four question types each need distinct UX; answers flow back through API to agent | 1. ~~Should questions appear inline on node, modal, or side panel?~~ **RESOLVED: Modal on node click** 2. How to handle multiple nodes waiting for answers simultaneously? 3. What validation rules for each question type? 4. Should answered questions remain visible or hide? |
| Layout Persistence Strategy | Storage Design | Layout data doesn't exist in current schema; needs extension without breaking changes | 1. YAML vs JSON vs separate file? 2. How to handle missing layout data (old graphs)? 3. Should auto-arrange positions be saved or computed? 4. How granular (per-node, per-graph, global)? |
| Workspace Context Management | State Machine | Every operation requires workspace context; unclear how to persist/route in web app | 1. URL param, localStorage, or session storage? 2. How to handle workspace not found? 3. Should UI support switching workspaces without refresh? 4. What happens if workspace deleted while viewing? |
| Graph Editor Interaction Model | CLI Flow | Drag-drop, node selection, edge visualization, toolbox organization need cohesive design | 1. How to prevent invalid connections (type mismatches)? 2. Should edges be draggable or derived from inputs? 3. How to organize 10+ WorkUnits in toolbox? 4. What keyboard shortcuts for power users? |

**Complexity guidance**: This is a CS-4 feature; workshops are **recommended** for topics above to reduce ambiguity before architecture phase.

**Note**: Workshops can be created anytime during planning via `/plan-2c-workshop <topic-name>`

---

## Testing Strategy

**Approach**: Full TDD
**Rationale**: CS-4 complex feature with multiple interacting components (state management, SSE, React Flow integration) benefits from comprehensive test coverage to catch regressions and validate behavior.

**Focus Areas**:
- WorkGraphUIService/Instance state management (headless tests)
- Status computation logic (pending/ready from DAG)
- SSE notification handling and refresh flow
- Question/answer UI flow (simulated states via dev tools)
- Optimistic updates with rollback
- React Flow integration hooks
- Manual edge connection and validation

**Excluded**:
- Visual styling (colors, spacing) - manual verification
- React Flow internal behavior - trust library
- Actual agent execution - OOS; simulate states via dev tools or direct file manipulation

**Mock Usage**: Targeted mocks only
- Mock SSE/EventSource for connection tests
- Mock filesystem APIs for service tests
- Use real WorkGraph services via Fakes (existing FakeWorkGraphService, FakeWorkNodeService)
- No mocking of internal components

---

## Documentation Strategy

**Location**: Hybrid (README + docs/how/)
**Rationale**: Feature needs quick-start for users plus detailed architecture docs for developers.

**Content Split**:
- **README.md**: Brief "WorkGraph UI" section with screenshot, basic usage (navigate to /workgraphs, create graph, drag units)
- **docs/how/workgraph-ui/**: Architecture overview, component documentation, SSE integration guide, troubleshooting

**Target Audience**: 
- End users (README quick-start)
- Developers extending/maintaining (docs/how/)

**Maintenance**: Update docs when UI patterns change significantly; keep README minimal.

---

## Clarifications

### Session 2026-01-29

**Q1: Workflow Mode** → **Full**
- Rationale: CS-4 complexity with 7 phases, multiple components, and comprehensive testing needs.

**Q2: Testing Strategy** → **Full TDD**
- Rationale: Complex state management, SSE integration, and React Flow interaction require comprehensive test coverage.

**Q3: File Management** → **PlanPak**
- Rationale: Full traceability for this large feature; files grouped by plan ordinal.

**Q4: Conflict Strategy** → **Last-write-wins + toast notification**
- Rationale: Conflicts rare due to instant auto-save (500ms); simpler than merge UI.

**Q5: Layout Storage** → **Separate layout.json file**
- Rationale: Clean separation from graph structure; smaller git diffs on position changes.

**Q6: Auto-arrange** → **Only for NEW nodes**
- Rationale: Preserve user's manual positioning; auto-position only new nodes relative to predecessor.

**Q7: Question UX** → **Node indicator + modal on click**
- Rationale: Node shows question icon; clicking opens modal with question form. Handles multiple pending questions gracefully.

**Q8: Workspace Selection** → **URL query param (`?workspace=<slug>`)**
- Rationale: Workspace UI in separate branch; URL param is simple integration point for now.

**Q9: Node Validation** → **Manual edge connection with validation**
- Rationale: Users drop nodes unconnected, then manually drag edges. Validation on connection with error modal if incompatible. More flexible than auto-wiring.

**Q10: Agent Session Controls** → **None (OOS)**
- Rationale: Agents are OOS for this plan. UI developed in isolation; states simulated via dev tools or direct file manipulation.

**Q11: Agent Integration** → **OOS - Simulate states**
- Rationale: Build UI in isolation. Use dev tools, CLI commands, or direct file edits to set node states (running, waiting-question, complete) for testing UI behavior.

---

## Next Steps

1. **Recommended**: Run `/plan-2c-workshop` for high-priority topics (State Synchronization, Question UX Flow) to reduce N-score (novelty/ambiguity) before architecture
2. Run `/plan-2-clarify` to resolve ≤8 high-impact open questions (Q-1 through Q-8)
3. After clarification/workshops: Run `/plan-3-architect` to generate phase-based implementation plan
