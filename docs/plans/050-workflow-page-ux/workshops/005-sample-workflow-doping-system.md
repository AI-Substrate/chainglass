# Workshop: Sample Workflow & Doping System

**Type**: CLI Flow / Integration Pattern
**Plan**: 050-workflow-page-ux
**Spec**: (pending — pre-spec workshop)
**Created**: 2026-02-26
**Status**: Draft

**Related Documents**:
- [Workshop 001: Line-Based Canvas UX Design](./001-line-based-canvas-ux-design.md)
- [Plan 048: Template Generation Script](../../../../scripts/generate-templates.ts)
- [Plan 039: Advanced E2E Pipeline](../../039-advanced-e2e-pipeline/)

**Domain Context**:
- **Primary Domain**: `workflow-ui` (consumes demo data for development)
- **Related Domains**: `_platform/positional-graph` (graph creation APIs)

---

## Purpose

Design a repeatable system for populating a development worktree with sample workflows in various states — blank, in-progress, completed, errored, with pending questions. This enables rapid UI development and manual testing without building real graphs each time.

## Key Questions Addressed

- What sample agents do we need? (spec, dev, review — with question-asking)
- How do we create workflows in various states (pending, running, error, question)?
- What justfile command populates the system?
- How do we reuse existing e2e test infrastructure?
- How do we make this fast and repeatable?

---

## Existing Infrastructure (Reusable)

### Committed Work Units (`.chainglass/units/`)

| Unit | Type | Inputs | Outputs | Q&A? |
|------|------|--------|---------|------|
| `sample-input` | user-input | — | text data | No |
| `sample-spec-builder` | agent | — | spec | Yes (asks questions) |
| `sample-coder` | agent | spec | language, code | No |
| `sample-spec-reviewer` | agent | — | review | No |
| `sample-tester` | agent | — | test_results | No |
| `sample-pr-creator` | code | — | pr_url | No |

### Existing Template Generation

`scripts/generate-templates.ts` already builds graphs imperatively and saves as templates. Pattern:

```typescript
// 1. Create graph via PositionalGraphService
const { lineId } = await service.create(ctx, slug);

// 2. Add nodes to lines
const node1 = await service.addNode(ctx, slug, lineId, 'sample-input');
const node2 = await service.addNode(ctx, slug, lineId, 'sample-coder');

// 3. Wire inputs
await service.setInput(ctx, slug, node2.nodeId, 'spec', {
  from_node: node1.nodeId, from_output: 'spec'
});

// 4. Save as template
await templateService.saveFrom(ctx, slug, templateSlug);
```

### Test Graph Helpers

| Helper | Location | Purpose |
|--------|----------|---------|
| `withTestGraph()` | `dev/test-graphs/shared/helpers.ts` | Temp workspace + cleanup |
| `buildDiskWorkUnitLoader()` | `dev/test-graphs/shared/helpers.ts` | Real filesystem unit loading |
| `withTemplateWorkflow()` | `dev/test-graphs/shared/template-test-runner.ts` | Template instantiation in temp dir |
| `completeUserInputNode()` | `dev/test-graphs/shared/helpers.ts` | Programmatic node completion |
| `answerNodeQuestion()` | Various e2e tests | Q&A simulation |

---

## Doping System Design

### `just dope-workflows` Command

```bash
just dope-workflows        # Populate all demo workflows
just dope-workflows clean  # Remove all demo data first
just dope-workflows <name> # Populate specific scenario
```

### Implementation: `scripts/dope-workflows.ts`

A single TypeScript script that creates a set of demo workflows in the **current worktree's** `.chainglass/` directory.

### Demo Scenarios

| Scenario | Slug | Lines | Nodes | State | Purpose |
|----------|------|-------|-------|-------|---------|
| **Blank** | `demo-blank` | 0 | 0 | pending | Test empty state UX |
| **Simple Serial** | `demo-serial` | 1 | 3 | pending | Basic line with 3 nodes |
| **In Progress** | `demo-running` | 2 | 5 | in_progress | Line 1 complete, Line 2 has running node |
| **With Question** | `demo-question` | 1 | 2 | in_progress | Node waiting for human answer |
| **With Error** | `demo-error` | 1 | 3 | in_progress | One node in blocked-error state |
| **Complete** | `demo-complete` | 2 | 4 | complete | Fully executed workflow |
| **Complex** | `demo-complex` | 3 | 8 | mixed | Multi-line, parallel, manual gates, various states |

### Scenario Details

#### demo-blank
```yaml
# Just create the graph with no lines
slug: demo-blank
lines: []
state: { graph_status: pending }
```

#### demo-serial
```yaml
slug: demo-serial
lines:
  - label: "Specification"
    nodes: [sample-input, sample-spec-builder, sample-spec-reviewer]
    settings: { transition: auto }
state: { graph_status: pending, nodes: {} }
```

#### demo-running
```yaml
slug: demo-running
lines:
  - label: "Requirements"
    nodes: [sample-input, sample-spec-builder]
    settings: { transition: auto }
  - label: "Development"
    nodes: [sample-coder, sample-tester, sample-pr-creator]
    settings: { transition: manual }
state:
  graph_status: in_progress
  nodes:
    sample-input-xxx: { status: complete }
    sample-spec-builder-xxx: { status: complete }
    sample-coder-xxx: { status: agent-accepted }  # Currently running
    sample-tester-xxx: {}  # pending (computed)
    sample-pr-creator-xxx: {}
  transitions:
    line-002: { triggered: true }  # Manual gate opened
```

#### demo-question
```yaml
slug: demo-question
lines:
  - label: "Specification"
    nodes: [sample-input, sample-spec-builder]
state:
  graph_status: in_progress
  nodes:
    sample-input-xxx: { status: complete }
    sample-spec-builder-xxx:
      status: waiting-question
      pending_question_id: q-001
  questions:
    - question_id: q-001
      node_id: sample-spec-builder-xxx
      type: single
      text: "What programming language should we use?"
      options: ["TypeScript", "Python", "Rust", "Go"]
```

#### demo-error
```yaml
slug: demo-error
lines:
  - label: "Build Pipeline"
    nodes: [sample-input, sample-coder, sample-tester]
state:
  graph_status: in_progress
  nodes:
    sample-input-xxx: { status: complete }
    sample-coder-xxx: { status: complete }
    sample-tester-xxx:
      status: blocked-error
      error:
        code: E160
        message: "Test suite failed: 3 assertions did not pass"
```

#### demo-complete
```yaml
slug: demo-complete
lines:
  - label: "Plan"
    nodes: [sample-input, sample-spec-builder]
  - label: "Execute"  
    nodes: [sample-coder, sample-pr-creator]
state:
  graph_status: complete
  nodes:
    all: { status: complete, completed_at: ... }
```

#### demo-complex
```yaml
slug: demo-complex
lines:
  - label: "Requirements Gathering"
    nodes: [sample-input, sample-spec-builder]
    settings: { transition: auto }
  - label: "Parallel Development"
    nodes:
      - sample-coder (execution: parallel)
      - sample-tester (execution: parallel)
      - sample-spec-reviewer (execution: parallel)
    settings: { transition: manual }
  - label: "Release"
    nodes: [sample-pr-preparer, sample-pr-creator]
    settings: { transition: auto }
state:
  graph_status: in_progress
  # Line 1 complete, Line 2 has 2 complete + 1 running, Line 3 pending
```

---

## Script Structure

```typescript
// scripts/dope-workflows.ts
import { PositionalGraphService } from '@chainglass/positional-graph';
import { TemplateService } from '@chainglass/workflow';
// ... DI setup

const SCENARIOS = {
  'demo-blank': buildBlankScenario,
  'demo-serial': buildSerialScenario,
  'demo-running': buildRunningScenario,
  'demo-question': buildQuestionScenario,
  'demo-error': buildErrorScenario,
  'demo-complete': buildCompleteScenario,
  'demo-complex': buildComplexScenario,
};

async function main() {
  const args = process.argv.slice(2);
  const clean = args.includes('clean');
  const specific = args.find(a => !a.startsWith('-'));
  
  const ctx = resolveWorkspaceContext(process.cwd());
  
  if (clean) {
    // Remove all demo-* graphs from .chainglass/data/workflows/
    await cleanDemoWorkflows(ctx);
  }
  
  const scenarios = specific 
    ? { [specific]: SCENARIOS[specific] }
    : SCENARIOS;
  
  for (const [slug, builder] of Object.entries(scenarios)) {
    console.log(`Creating ${slug}...`);
    await builder(ctx, service);
    console.log(`  ✓ ${slug} created`);
  }
  
  console.log(`\nDone! ${Object.keys(scenarios).length} demo workflows created.`);
  console.log('View at: http://localhost:3000/workflows');
}
```

### State Injection

For scenarios that need non-pending states (running, error, question), we write `state.json` directly after building the graph:

```typescript
async function buildRunningScenario(ctx, service) {
  // 1. Build graph structure normally
  const { lineId: l1 } = await service.create(ctx, 'demo-running');
  const n1 = await service.addNode(ctx, 'demo-running', l1, 'sample-input');
  const n2 = await service.addNode(ctx, 'demo-running', l1, 'sample-spec-builder');
  // ... add more nodes, lines, wiring
  
  // 2. Inject state directly (bypass orchestration)
  const state = {
    graph_status: 'in_progress',
    updated_at: new Date().toISOString(),
    nodes: {
      [n1.nodeId]: { status: 'complete', completed_at: '...' },
      [n2.nodeId]: { status: 'agent-accepted', started_at: '...' },
    },
    transitions: {},
    questions: [],
  };
  await service.persistGraphState(ctx, 'demo-running', state);
}
```

---

## Justfile Integration

```justfile
# Populate development worktree with demo workflows
dope-workflows *args:
    pnpm build --filter @chainglass/positional-graph --filter @chainglass/workflow --filter @chainglass/shared
    npx tsx scripts/dope-workflows.ts {{args}}

# Quick alias
dope: dope-workflows

# Clean and repopulate
redope:
    just dope-workflows clean
    just dope-workflows
```

### Usage Examples

```bash
just dope                           # Create all 7 demo workflows
just dope demo-question             # Create just the question scenario
just dope clean                     # Remove all demo workflows
just redope                         # Clean + recreate all
```

---

## SSE Scope: Active Workflow Only

**SSE real-time updates are scoped to the workflow you're currently viewing in the editor.** When `graph.yaml` or `state.json` changes on disk for the open workflow (from CLI, agents, another tab), the canvas refreshes automatically — nodes update status, context badges recalculate, gate chips change.

The workflow **list page** does NOT use SSE — it loads workflows on navigate. Run `just dope`, then navigate to the list (or refresh) to see new workflows. This avoids the complexity of watching for new/deleted workflow directories.

### What Triggers Live Refresh (Editor Only)

| File Changed | What Refreshes |
|---|---|
| `graph.yaml` | Full canvas rebuild (lines, nodes, topology) |
| `state.json` | Status indicators, gate chips, question badges |
| `nodes/*/node.yaml` | Node card details, context badges, input wiring |

### Development Loop

```
1. Run `just dope` in terminal
2. Navigate to workflow list page → see 7 workflows
3. Click into demo-running → canvas renders with running state
4. In another terminal: modify demo-running's state.json via CLI
5. Canvas updates live (SSE) — see node status change
6. Edit component code → Fast Refresh applies
7. Run `just redope` → navigate back to list → see fresh scenarios
```

---

## Extensible Scenario Design

Scenarios are **designed to be extended** during development. As we build components and discover edge cases, we add new scenarios to the dope script:

### Scenario Categories

| Category | Purpose | Example Scenarios |
|----------|---------|-------------------|
| **Structure** | Test canvas layout | blank, single-line, multi-line, many-nodes (8+ for horizontal scroll) |
| **Status** | Test all 8 node status states | pending, ready, starting, running, question, error, restart-pending, complete |
| **Gates** | Test all 5 readiness gate displays | preceding-blocked, transition-blocked, serial-blocked, contextFrom-blocked, inputs-blocked |
| **Context** | Test context badge variants | noContext node, explicit contextFrom, cross-line inheritance, parallel isolation |
| **Templates** | Test template/instance UI | from-template instance with breadcrumb, save-as-template candidate |
| **Edge cases** | Test tricky states | all-complete graph, all-error graph, mixed parallel/serial line, empty lines between full lines |

### Adding a New Scenario

Adding a scenario is just adding a function to the `SCENARIOS` map:

```typescript
const SCENARIOS = {
  // ... existing 7
  'demo-many-nodes': buildManyNodesScenario,      // Test horizontal scroll
  'demo-all-gates': buildAllGatesScenario,         // One node per gate type
  'demo-context-variants': buildContextScenario,   // All context badge colors
};
```

Each scenario function follows the same pattern: build graph → inject state → done. No new infrastructure needed.

---

## Also Needed: Sample Agents Script

The user specifically mentioned three sample agents: **spec**, **dev**, **review** — where spec asks questions (like Plan 039 e2e).

These already exist as `sample-spec-builder`, `sample-coder`, `sample-spec-reviewer` in `.chainglass/units/`. But we should also ensure they're easy to populate from scratch:

```justfile
# Populate sample work units from committed templates
dope-agents:
    @echo "Work units already committed in .chainglass/units/"
    @echo "Available units:"
    @ls .chainglass/units/ 2>/dev/null || echo "  (none — run 'just dope-workflows' to generate)"
```

Since units are committed to git, they're always available. The `dope-workflows` script creates graphs that reference them.

---

## Open Questions

### Q1: Should demo workflows live in `.chainglass/data/workflows/` or `.chainglass/templates/`?

**RESOLVED**: `.chainglass/data/workflows/` — these are working instances with injected state, not templates. Templates are clean (no state). Demo workflows should feel like "active" workflows that the user is working on.

### Q2: Should the dope script also create template + instance pairs?

**RESOLVED**: Yes — add one scenario (`demo-from-template`) that creates a template and then instantiates it. This tests the template → instance flow in the UI.

### Q3: Should demo workflows persist across git operations?

**RESOLVED**: No. `.chainglass/data/` is gitignored. Demo workflows are ephemeral — recreated with `just dope`. Templates in `.chainglass/templates/` are committed and permanent.

---

## Summary

The doping system uses a single `scripts/dope-workflows.ts` script (invoked via `just dope`) that creates 7+ demo workflows covering all UI states: blank, serial, running, question-waiting, errored, complete, and complex multi-line. It builds graphs imperatively via `PositionalGraphService`, then injects state.json directly for non-pending states. Existing sample work units (`.chainglass/units/sample-*`) provide the agent/code/human-input definitions. The system is fast (<5s), repeatable, and independent of real agent execution.

**New workflows appear in the browser automatically via SSE** — no page refresh needed. This makes the development loop extremely tight: edit component → `just redope` → see result instantly. Scenarios are extensible — add new functions to the `SCENARIOS` map as edge cases are discovered during implementation. The goal is to validate every UI state through doping **before** real agents are wired, so there are no surprises.
