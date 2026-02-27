# Workshop: Single-Question Simplification

**Type**: Architecture Simplification
**Plan**: 054-unified-human-input
**Created**: 2026-02-27
**Status**: Draft

---

## Purpose

Simplify Plan 054 by enforcing one question per user-input node. Multi-output collection is achieved by placing multiple single-question nodes on a line — composability through the graph, not through complex modal forms. This workshop documents the simplified design AND catalogs every remediation needed across the spec, plan, and prior workshops.

---

## Design: One Node = One Question = One Output

### How It Works

A user-input unit has exactly **one `user_input` config** and exactly **one primary output** that receives the answer:

```yaml
slug: get-requirements
type: user-input
version: 1.0.0
outputs:
  - name: requirements
    type: data
    data_type: text
    required: true
user_input:
  question_type: text
  prompt: "Describe your project requirements"
```

The user clicks the node → modal opens → user answers → submit → node completes → output available downstream.

### Multiple Questions = Multiple Nodes

Need 3 pieces of data? Place 3 user-input nodes on the same line:

```
── Line 1 ─────────────────────────────────────────────────────────
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ 👤 get-      │  │ 👤 pick-     │  │ 👤 confirm-  │
│    requirements│  │    language   │  │    priority   │
│              │  │              │  │              │
│  ? Awaiting  │  │  ? Awaiting  │  │  ? Awaiting  │
└──────────────┘  └──────────────┘  └──────────────┘

── Line 2 ─────────────────────────────────────────────────────────
┌──────────────────┐
│ 🤖 build-app     │     inputs:
│                  │       spec: from get-requirements.requirements
│  ○ Pending       │       lang: from pick-language.language
└──────────────────┘       priority: from confirm-priority.priority
```

Each user-input node:
- Has its own question type (text, single-choice, confirm, etc.)
- Has its own output wired independently to downstream nodes
- Completes independently — fill them in any order
- Uses the existing serial/parallel execution model (parallel on same line = fill in any order)

### Why This Is Better

| Multi-output modal | Single-question nodes |
|---|---|
| New `fields[]` schema | Schema unchanged |
| Per-field save buttons | One submit button |
| Partial save state management | No partial state |
| Direct filesystem writes (bypass service) | Use existing lifecycle |
| `loadUserInputState` action | Not needed |
| `saveUserInputField` action | Not needed |
| `completeUserInput` action | Not needed |
| Progress counter badge ("1/3 filled") | Not needed |
| `partially-filled` display status | Not needed |
| `savedOutputCount` / `requiredOutputCount` on NodeStatusResult | Not needed |
| Workshop 009 (fields schema) | Superseded |
| ~33 tasks across 4 phases | ~15 tasks across 3 phases |

---

## Simplified Architecture

### Modal

One question, one answer, one submit button. The modal reads from `NodeStatusResult.userInput` (prompt, questionType, options) and calls `submitUserInput` on submit.

```
┌─ Human Input ─────────────────────────────────────────┐
│                                                    ✕  │
│  👤 get-requirements                                  │
├───────────────────────────────────────────────────────┤
│                                                       │
│  Describe your project requirements                   │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Build a REST API for user management...         │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  Additional notes (optional)                          │
│  ┌─────────────────────────────────────────────────┐  │
│  │                                                 │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
├───────────────────────────────────────────────────────┤
│                              [Cancel]  [Submit]       │
└───────────────────────────────────────────────────────┘
```

### Server Action

One action: `submitUserInput`. Atomic — write output to data.json (Format A), walk lifecycle, return status.

```
submitUserInput(workspaceSlug, graphSlug, nodeId, answer)
  ├── Write { outputs: { outputName: answer.structured } } to data.json
  ├── Write _metadata (freeform notes, timestamp) to data.json
  ├── startNode() → pending → starting
  ├── raiseNodeEvent('node:accepted') → starting → agent-accepted
  ├── endNode() → agent-accepted → complete (canEnd finds output in data.json)
  └── return reloadStatus()
```

### Node Card States (simplified)

Only **two** new display statuses needed (not three):

| State | Condition | Badge |
|---|---|---|
| Pending | `user-input` + `pending` + NOT `ready` | Gray ○ Pending |
| **Awaiting Input** | `user-input` + `pending` + `ready` | Violet ? Awaiting Input |
| Complete | `user-input` + `complete` | Green ✓ Complete |

No `partially-filled` state. No progress counter.

### NodeStatusResult Extension (simplified)

Only need `userInput` config. No `savedOutputCount` or `requiredOutputCount`:

```typescript
export interface NodeStatusResult {
  // ... existing fields ...
  
  /** Present when unitType is 'user-input'. Config from unit.yaml. */
  userInput?: {
    prompt: string;
    questionType: 'text' | 'single' | 'multi' | 'confirm';
    options?: { key: string; label: string }[];
    defaultValue?: string | boolean;
  };
}
```

---

## Remediation Catalog

### Spec: `unified-human-input-spec.md`

| Section | Change | Detail |
|---------|--------|--------|
| Summary | Remove "multi-output" references | Single-question per node, compose via graph |
| Non-Goals | Add "Multi-output user-input nodes" | Explicitly out of scope |
| Non-Goals | Remove "Multi-step form wizards" | Redundant — no forms at all |
| Complexity | Lower to CS-2 | Less surface area, no data/state complexity for partial saves |
| AC-08 | Simplify | "After submission, node transitions to `complete`" — remove "all required outputs" language |
| AC-17 | **DELETE** | "Multi-output modal shows one field per output" — no longer applies |
| AC-18 | **DELETE** | "Per-field save supported" — no longer applies |
| AC-19 | **DELETE** | "Partial save persisted; re-open shows saved values" — no longer applies |
| AC-20 | **DELETE** | "Primary output uses user_input.prompt; others use description" — no longer applies |
| Risks/Assumptions | Remove #3 "Multi-output partial save UX" risk | No partial saves |
| Risks/Assumptions | Update #1 and #2 — confirmed by Workshop 008 | Simplify language |
| Clarifications Q7 | Superseded | Multi-output answer no longer relevant |
| Clarifications Q8 | Superseded | Multi-output confirmation no longer relevant |

### Plan: `unified-human-input-plan.md`

| Section | Change | Detail |
|---------|--------|--------|
| Summary | Rewrite — remove multi-output references | Single question per node |
| Domain Manifest | Remove `saveUserInputField` references | Only `submitUserInput` needed |
| Key Findings | Remove F01 partial save discussion | Direct IFileSystem write still needed but only for single atomic write |
| Phase 1 tasks | Remove 1.2 (`savedOutputCount`), 1.4 (populate savedOutputCount) | Not needed |
| Phase 1 tasks | Simplify 1.5 (display-status) — remove `partially-filled` | Only `awaiting-input` |
| Phase 1 tasks | Simplify 1.6 (STATUS_MAP) — remove `partially-filled` | Only `awaiting-input` |
| Phase 2 tasks | Remove 2.6 (properties panel outputs section) — still show output but no save state | Simplify to just show unit info |
| Phase 3 tasks | Remove `saveUserInputField`, `completeUserInput`, `loadUserInputState` | Only `submitUserInput` |
| Phase 3 tasks | Remove downstream gate verification complexity | Single output, straightforward |
| **Phase 4** | **DELETE ENTIRELY** | Multi-output support phase no longer needed |
| Progress table | Update task counts, remove Phase 4 row | 3 phases total |
| ACs checklist | Remove AC-17 through AC-20 | Match spec changes |
| Risks table | Remove "Partial data.json writes bypass service guard" risk | No partial writes |

### Workshop 006: `006-unified-human-input-design.md`

Already marked "partially superseded". No further changes needed — the supersession note covers it.

### Workshop 007: `007-human-input-ui-ux.md`

| Section | Change | Detail |
|---------|--------|--------|
| Node Card State 3 | **DELETE** "Partially Filled" state | No partial state |
| Multi-Output Node section | **DELETE** entire "Multi-Output Node" modal layout section | No multi-output modal |
| Multi-Output UX decisions table | **DELETE** | No multi-output decisions |
| Flow 2 (multi-output partial save) | **DELETE** | No multi-output flow |
| Modal Props | Simplify — remove `outputs[]`, `onSaveField`, `onComplete` | Single question only |
| Properties Panel | Remove "Outputs" section with save state | Keep simple unit info |
| Status Badge Logic | Remove `partially-filled` from `getDisplayStatus()` | Only `awaiting-input` |
| STATUS_MAP Additions | Remove `partially-filled` entry | Only `awaiting-input` |
| Q1 (freeform per-field vs bottom) | Superseded — always one freeform below the one question | |

### Workshop 008: `008-save-persistence-strategy.md`

| Section | Change | Detail |
|---------|--------|--------|
| Multi-Output Sequence Diagram | Mark as "superseded by single-question simplification" | |
| Server Actions section | Remove `saveUserInputField`, `completeUserInput`, `loadUserInputState` | Only `submitUserInput` remains |
| Edge Cases E1-E2 | Simplified — no partial save crash concern, no concurrent editing of fields | |

### Workshop 009: `009-question-definition-schema.md`

**SUPERSEDE ENTIRELY**. The `fields[]` schema is not needed. The existing `user_input` config is perfect for single-question nodes. Add supersession note at top.

---

## Simplified Phase Structure

### Phase 1: NodeStatusResult + Display Status (7 tasks)

| # | Task | Notes |
|---|------|-------|
| 1.1 | Fix `collateInputs` to read Format A | One-line fix, per Workshop 008 |
| 1.2 | Update collate-inputs test fixtures | Format A wrapped |
| 1.3 | Extend `NodeStatusResult` with `userInput` config | Optional field, populated from unit.yaml |
| 1.4 | Populate `userInput` in `getNodeStatus()` | Service already loads unit at line 1041 |
| 1.5 | Create `display-status.ts` helper | `user-input` + `pending` + `ready` → `awaiting-input` |
| 1.6 | Add `awaiting-input` to STATUS_MAP + click routing | Violet badge, clickable |
| 1.7 | TDD tests for 1.1–1.4, lightweight for 1.5–1.6 | |

### Phase 2: Human Input Modal + Server Action (7 tasks)

| # | Task | Notes |
|---|------|-------|
| 2.1 | Create `HumanInputModal` component | Single question, freeform textarea, Submit button |
| 2.2 | Modal header: "Human Input" + unit slug + icon | Per Workshop 007 |
| 2.3 | All 4 question types render from unit.yaml | text, single, multi, confirm |
| 2.4 | Create `submitUserInput` server action | Write output → startNode → accept → endNode |
| 2.5 | Wire modal to workflow editor | `awaiting-input` opens HumanInputModal |
| 2.6 | Update properties panel: "Provide Input..." button | For user-input nodes |
| 2.7 | Modal + action tests | |

### Phase 3: Demo + Integration + Cleanup (5 tasks)

| # | Task | Notes |
|---|------|-------|
| 3.1 | Update dope-workflows with user-input demo | Node in ready/awaiting-input state |
| 3.2 | Add multi-node user-input demo | 3 user-input nodes on same line |
| 3.3 | Integration test: submit → complete → downstream gates | End-to-end flow |
| 3.4 | Error state: missing user_input config | Modal shows error for malformed units |
| 3.5 | Verify via Next.js MCP: zero errors, routes work | Final validation |

**Total: 19 tasks across 3 phases** (down from 33 tasks across 4 phases).

---

## Summary

Single-question-per-node is the right design because:

1. **It already works** — all 9 existing user-input units are single-question, single-output
2. **Composition via the graph** — multiple questions = multiple nodes on a line. That's what the positional graph system is designed for.
3. **No schema changes** — `user_input.question_type` + `prompt` is perfect
4. **No partial save complexity** — one submit, atomic lifecycle walkthrough
5. **Phase 4 eliminated** — 14 fewer tasks, no `fields[]` schema, no `saveUserInputField`, no `loadUserInputState`, no `partially-filled` display status
6. **Workshop 009 superseded** — the fields schema was designed for a problem we're solving differently
