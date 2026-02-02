# Subtask 001: Align Docs with Execution Rules Workshop — Execution Log

---

## Task ST001: Audit all concept drift
**Started**: 2026-02-01
**Status**: ✅ Complete
**Dossier Task**: ST001 | **Plan Task**: Subtask 001

### What I Did
Read all four source documents and the execution rules workshop (source of truth). Produced a line-by-line change checklist organized by document, covering all 8 ACs.

### Change Checklist

#### Document 1: `workshops/positional-graph-prototype.md`

**AC-S1: Per-node execution (8 sites)**

| # | Line | Current Text | Change To | AC |
|---|------|-------------|-----------|-----|
| 1 | 81 | `string execution_mode "parallel \| serial"` on Line entity | Move to Node entity as `string execution "serial \| parallel"` (note: serial first = default) | AC-S1 |
| 2 | 137 | `execution_mode: parallel` on line-0 | Remove field entirely from line | AC-S1 |
| 3 | 145 | `execution_mode: parallel` on line-1 | Remove field entirely from line | AC-S1 |
| 4 | 154 | `execution_mode: serial` on line-2 | Remove field entirely from line | AC-S1 |
| 5 | 164-166 | "Line `execution_mode` controls how nodes **within** a line run: parallel/serial" | Rewrite: execution is per-node property, serial default, parallel opts out of chain | AC-S1 |
| 6 | 172 | "**Node ordering within a line matters** for `serial` mode" | Update to reference per-node serial/parallel | AC-S1 |
| 7 | 195-196 | `ExecutionModeSchema = z.enum(['parallel', 'serial'])` / `ExecutionMode` type | Keep schema but note it applies to nodes, not lines. Rename to `ExecutionSchema` or keep with updated context. Default changes from 'parallel' to 'serial'. | AC-S1 |
| 8 | 207 | `execution_mode: ExecutionModeSchema.default('parallel')` on `LineDefinitionSchema` | Remove from LineDefinitionSchema. Add `execution: ExecutionModeSchema.default('serial')` to NodeConfigSchema. | AC-S1 |
| 9 | 389-392 | `execution_mode: parallel` in graph.yaml example | Remove from line definitions | AC-S1 |
| 10 | 436 | Show output: `Line 0 (parallel):` | Change display: remove per-line execution label. Show per-node execution markers like `(S)` / `(P)` | AC-S1 |
| 11 | 459-468 | Show output: `Line 0 (parallel):`, `Line 1 "Research" (parallel):`, `Line 2 (parallel):` | Remove `(parallel)` / `(serial)` from line labels in all show examples | AC-S1 |
| 12 | 487-514 | CLI examples 8-9: `line set --mode serial`, show output with `(serial)` | Remove line set --mode command. Update show output. | AC-S1 |
| 13 | 84-88 | Node entity in ERD missing `execution` field | Add `string execution "serial \| parallel"` to Node entity | AC-S1 |
| 14 | 230-237 | `NodeConfigSchema` missing `execution` field | Add `execution: ExecutionModeSchema.default('serial')` | AC-S1 |

**AC-S2: Remove E165 (2 sites)**

| # | Line | Current Text | Change To | AC |
|---|------|-------------|-----------|-----|
| 15 | 654 | `code: string; // E160-E165` in ErrorInput | Change to `// E160-E164` | AC-S2 |
| 16 | 1125 | `E165 \| Forward reference \| Referenced node is on a later line` | Delete row | AC-S2 |

**AC-S3: getStatus API (15+ sites)**

| # | Line | Current Text | Change To | AC |
|---|------|-------------|-----------|-----|
| 17 | 563 | `## Status Computation (canRun)` section header | Keep section but add note: canRun is internal algorithm, public API is getStatus (see execution rules workshop §12) | AC-S3 |
| 18 | 580-597 | canRun Rules section — 3 rules (preceding lines, transition gate, serial predecessor) | Update Gate 3 to per-node serial/parallel. Add Gate 4 (input availability). Add cross-reference to execution rules workshop §5 for authoritative 4-gate algorithm. | AC-S3 |
| 19 | 714 | `canRun(ctx, graphSlug, nodeId): Promise<CanRunResult>` | Keep as internal concept. Add note: public API is getNodeStatus/getLineStatus/getStatus. | AC-S3 |
| 20 | 716-723 | `CanRunResult` interface | Replace with note referencing execution rules workshop CanRunResult (§5). | AC-S3 |
| 21 | 999-1033 | §Service Interface Sketch — `canRun()`, `status()` as separate methods | Replace with `getNodeStatus`/`getLineStatus`/`getStatus` methods. Make this the **canonical** interface. Incorporate NodeStatus/LineStatus/GraphStatus/StarterReadiness from execution rules workshop §12. | AC-S3 |
| 22 | 1086-1102 | `PGStatusResult` interface | Replace with `GraphStatus`/`LineStatus`/`NodeStatus` from execution rules workshop §12 | AC-S3 |
| 23 | 362-363 | Status Operations table: `canrun <graph> <nodeId>` | Replace with `status <graph> [nodeId] [--line lineId]` pattern. Keep canrun as an alias or remove. | AC-S3 |

**AC-S4: Same-line resolution blind (2 sites)**

| # | Line | Current Text | Change To | AC |
|---|------|-------------|-----------|-----|
| 24 | 584 | "**Serial predecessor complete** (serial lines only)" | "**Serial predecessor complete** (serial nodes only)" — per-node, not per-line | AC-S4 |
| 25 | 782 | "**Same-line resolution** (serial only) — in a serial line" | "**Same-line resolution** — any node at position N can reference positions < N regardless of execution mode" | AC-S4 |

**AC-S5: Default serial (2 sites)**

Already covered by items 7, 8 above (schema default change from 'parallel' to 'serial').

**AC-S6: Remove setLineMode (3 sites)**

| # | Line | Current Text | Change To | AC |
|---|------|-------------|-----------|-----|
| 26 | 330 | `line set <graph> <lineId> --mode <mode>` in operations table | Remove row. Add `node set <graph> <nodeId> --execution <mode>` to Node Operations table. | AC-S6 |
| 27 | 1013 | `setLineMode(ctx, graphSlug, lineId, mode)` in service interface | Remove method. Add `setNodeExecution(ctx, graphSlug, nodeId, execution)` to node operations. | AC-S6 |
| 28 | 1041 | `mode?: ExecutionMode` in AddLineOptions | Remove field. Add `execution?: ExecutionMode` to AddNodeOptions. | AC-S6 |

---

#### Document 2: `positional-graph-spec.md`

**AC-S1: Per-node execution (1 site)**

| # | Line | Current Text | Change To | AC |
|---|------|-------------|-----------|-----|
| 29 | 90 | AC-2: "have their label, description, execution mode, and transition set" | Remove "execution mode" from line properties. Add separate note about per-node execution. | AC-S1 |

**AC-S3: getStatus API (3 sites)**

| # | Line | Current Text | Change To | AC |
|---|------|-------------|-----------|-----|
| 30 | 37 | Goal 7: "consumed by both `canRun` (checking readiness) and execution (feeding data)" | Update to mention getStatus as public API, canRun as internal algorithm | AC-S3 |
| 31 | 95 | AC-7: "`canRun` computation" | Update to reference getStatus pattern — readiness is a field on status, not a separate method | AC-S3 |
| 32 | 96 | AC-8: "Status display...`canRun` result" | Update to reference getStatus/getNodeStatus pattern | AC-S3 |

**AC-S6: Per-node execution in spec (1 site)**

| # | Line | Current Text | Change To | AC |
|---|------|-------------|-----------|-----|
| 33 | 36 | Goal 6: "Status computation from position" | Add note about per-node execution (serial/parallel) as part of status computation | AC-S3/S1 |

**AC-S7: Workshop cross-reference (2 sites)**

| # | Line | Current Text | Change To | AC |
|---|------|-------------|-----------|-----|
| 34 | 8 | §Research Context: only references prototype workshop | Add reference to `workshops/workflow-execution-rules.md` | AC-S7 |
| 35 | 158 | §Workshop Opportunities: single completed row | Add row for execution rules workshop | AC-S7 |

---

#### Document 3: `positional-graph-plan.md`

**AC-S1: Per-node execution (3 sites)**

| # | Line | Current Text | Change To | AC |
|---|------|-------------|-----------|-----|
| 36 | 413 | Task 2.2: "execution_mode/transition enums" | Change to "execution/transition enums" — execution is per-node | AC-S1 |
| 37 | 440 | Test example: `execution_mode: 'parallel'` | Remove `execution_mode` from line. Execution is on nodes. | AC-S1 |
| 38 | 510 | AC: "Line properties (label, description, execution_mode, transition)" | Remove "execution_mode" from line properties | AC-S1 |

**AC-S2: Remove E165 (4 sites)**

| # | Line | Current Text | Change To | AC |
|---|------|-------------|-----------|-----|
| 39 | 181 | Critical Discovery 12: "E160-E165 for input resolution errors" | Change to "E160-E164" | AC-S2 |
| 40 | 584 | Task 5.3: "error (forward reference E165)" | Remove this test case | AC-S2 |
| 41 | 586 | Task 5.5: "node not in preceding lines E165" | Replace with "waiting" behavior (no error) | AC-S2 |
| 42 | 629 | AC: "Forward references detected and reported as E165" | Remove this AC line | AC-S2 |

**AC-S3: getStatus API (5 sites)**

| # | Line | Current Text | Change To | AC |
|---|------|-------------|-----------|-----|
| 43 | 560 | Phase 5 objective: "`canRun`/`status` computation" | "`getStatus` computation (canRun is internal algorithm)" | AC-S3 |
| 44 | 565 | Deliverable: "`canRun` — node executability check" | "`getNodeStatus`/`getLineStatus`/`getStatus` — status at node/line/graph scope" | AC-S3 |
| 45 | 589-590 | Tasks 5.8-5.9: "canRun rules/tests" | Update to "getStatus/canRun" — canRun is internal, public API is getStatus | AC-S3 |
| 46 | 627 | AC: "`canRun` checks..." | Update to reference getStatus pattern | AC-S3 |
| 47 | 658 | Task 6.4: "`canrun` command" | Update to `status` command with node/line/graph scope | AC-S3 |

**AC-S5: Default serial (1 site)**

Already covered by item 37 above (test example removal).

**AC-S6: Remove setLineMode (1 site)**

| # | Line | Current Text | Change To | AC |
|---|------|-------------|-----------|-----|
| 48 | 501 | Task 3.4: "set mode/transition/label/description" | Remove "mode" from line set operations | AC-S1/S6 |

**AC-S7: Workshop cross-reference (1 site)**

| # | Line | Current Text | Change To | AC |
|---|------|-------------|-----------|-----|
| 49 | 11 | §Workshops: only lists prototype workshop | Add execution rules workshop link | AC-S7 |

**Additional plan updates from Insights:**

| # | Line | Current Text | Change To | AC |
|---|------|-------------|-----------|-----|
| 50 | ~535 | Phase 4 tasks — no `setNodeExecution` | Add task for `setNodeExecution` (node set --execution serial\|parallel) | Insight 5 |

---

#### Document 4: `packages/workflow/src/interfaces/workunit.types.ts`

| # | Line | Check | Result | AC |
|---|------|-------|--------|-----|
| 51 | all | Grep for `execution_mode`, `execution mode`, `canRun`, `E165`, `setLineMode` | 0 results — no concept drift | AC-S8 |

**Confirmed clean**: WorkUnit types define I/O ports only. No execution semantics.

### Evidence
- Read execution rules workshop (1274 lines) — authoritative source
- Read prototype workshop (1216 lines) — 28 change sites identified
- Read spec (251 lines) — 7 change sites identified
- Read plan (813 lines) — 15 change sites identified
- Read workunit.types.ts (131 lines) — confirmed clean

### Files Changed
- None (read-only audit)

**Completed**: 2026-02-01
---

## Task ST002: Update prototype workshop
**Started**: 2026-02-01
**Status**: ✅ Complete
**Dossier Task**: ST002 | **Plan Task**: Subtask 001

### What I Did
Applied 25 edits to `workshops/positional-graph-prototype.md` covering all 6 ACs assigned to ST002:

1. **ERD** (AC-S1): Moved `execution_mode` from Line to Node as `execution`, default `serial`
2. **graph.yaml example** (AC-S1): Removed `execution_mode` from all 3 line definitions
3. **Key design points** (AC-S1): Rewrote execution description for per-node semantics with cross-ref to execution rules workshop
4. **Zod schemas** (AC-S1, S5): `ExecutionModeSchema` → `ExecutionSchema`, removed from `LineDefinitionSchema`, added to `NodeConfigSchema` with default `'serial'`
5. **NodeConfigSchema** (AC-S1): Added `execution` field in both schema code blocks
6. **Line operations table** (AC-S6): Removed `line set --mode` row
7. **Node operations table** (AC-S6): Added `node set --execution` row
8. **Status operations table** (AC-S3): Replaced `canrun` with `status --node/--line` pattern
9. **CLI examples** (AC-S1, S6): Updated `line set --mode` to `node set --execution`, all show outputs updated to display `(S)`/`(P)` markers and `(auto)`/`(manual)` on lines
10. **canRun Rules** (AC-S3, S4): Updated Gate 3 for per-node serial, added Gate 4 (inputs), added cross-reference to execution rules workshop §5
11. **ErrorInput code range** (AC-S2): Changed `E160-E165` to `E160-E164`
12. **canRun interface** (AC-S3): Added note that canRun is internal, public API is getStatus
13. **Same-line resolution** (AC-S4): Removed "serial only" qualifier
14. **Service Interface** (AC-S3, S6): Complete replacement — removed `setLineMode`, `mode` from `AddLineOptions`, `canRun`/`status` public methods. Added `setNodeExecution`, `execution` to `AddNodeOptions`, `getNodeStatus`/`getLineStatus`/`getStatus`, `triggerTransition`. Incorporated `NodeStatus`/`LineStatus`/`GraphStatus`/`StarterReadiness` types from execution rules workshop §12 directly. Kept CRUD result types (`AddLineResult`, `AddNodeResult`, `NodeShowResult`).
15. **Error codes table** (AC-S2): Removed E165 row
16. **E2E script** (AC-S1, S3): Updated line-mode to node-execution, canrun to status
17. **Related Documents** (AC-S7): Added execution rules workshop link
18. **node.yaml example** (AC-S1): Added `execution: serial` field
19. **Validation section** (AC-S4): Updated "serial line" to "same line"

### Evidence
- 25 targeted edits applied, all traceable to change checklist items 1-28
- No content removed that wasn't replaced — preserved CRUD types, kept canRun as internal algorithm concept

### Files Changed
- `docs/plans/026-positional-graph/workshops/positional-graph-prototype.md` — 25 edits across ERD, schemas, interface, CLI examples, error codes, status operations

**Completed**: 2026-02-01
---

## Task ST003: Update spec
**Started**: 2026-02-01
**Status**: ✅ Complete
**Dossier Task**: ST003 | **Plan Task**: Subtask 001

### What I Did
Applied 8 edits to `positional-graph-spec.md`:

1. **§Research Context** (AC-S7): Added execution rules workshop reference and key decisions (per-node execution, getStatus API)
2. **Goal 6** (AC-S1): Added per-node execution ordering to status computation description
3. **Goal 7** (AC-S3): Updated canRun reference to getStatus pattern
4. **AC-2** (AC-S1): Removed "execution mode" from line properties, noted it's per-node
5. **AC-7** (AC-S3): Renamed to "Readiness computation", referenced getStatus/getLineStatus/getNodeStatus as public API
6. **AC-8** (AC-S3): Updated status display to reference `--node`/`--line` scope flags
7. **§Workshop Opportunities** (AC-S7): Added execution rules workshop row
8. **§Risks** (AC-S1): Updated line reordering risk to note per-node execution travels with node

### Evidence
- All 7 change checklist items for the spec (items 29-35) addressed
- Spec remains normative — changes are precise, not expansive

### Files Changed
- `docs/plans/026-positional-graph/positional-graph-spec.md` — 8 edits

**Completed**: 2026-02-01
---

## Task ST004: Update plan
**Started**: 2026-02-01
**Status**: ✅ Complete
**Dossier Task**: ST004 | **Plan Task**: Subtask 001

### What I Did
Applied 15 edits to `positional-graph-plan.md`:

1. **§Workshops** (AC-S7): Added execution rules workshop link
2. **Critical Discovery 12** (AC-S2): Changed E160-E165 to E160-E164
3. **Task 2.2** (AC-S1): Updated execution_mode/transition to per-node execution
4. **Test example** (AC-S1, S5): Removed `execution_mode: 'parallel'` from graph schema test
5. **Task 3.4** (AC-S6): Removed "mode" from line set operations
6. **Phase 3 AC** (AC-S1): Removed execution_mode from line properties
7. **Phase 4 tasks** (Insight 5): Added tasks 4.9-4.10 for setNodeExecution
8. **Phase 5 objective** (AC-S3): Updated to getStatus computation
9. **Task 5.3** (AC-S2): Removed E165, forward refs resolve as waiting
10. **Task 5.5** (AC-S2): Removed E165, from_node forward ref resolves as waiting
11. **Tasks 5.8-5.11** (AC-S3): Updated to getNodeStatus/getLineStatus/getStatus pattern with StarterReadiness
12. **Phase 5 ACs** (AC-S2, S3): Updated to getStatus pattern, forward refs as waiting
13. **Task 6.4** (AC-S3): Changed canrun command to status command with scope flags
14. **Critical Discovery 09** (AC-S1): Added per-node execution detail
15. **Phase 6 AC** (AC-S3): Updated canrun to status in help listing

### Evidence
- All 15 change checklist items for the plan (items 36-50) addressed
- Phase 1 completion markers preserved: tasks 1.1-1.4 still [x], footnote [^1] intact, progress tracking still shows Phase 1 complete
- Phase 4 task numbering updated (4.9-4.10 inserted for setNodeExecution, old 4.9 renumbered to 4.11)

### Files Changed
- `docs/plans/026-positional-graph/positional-graph-plan.md` — 15 edits across Workshops, Critical Discoveries, Phases 2-6

**Completed**: 2026-02-01
---

## Task ST005: Verify Phase 1 code
**Started**: 2026-02-01
**Status**: ✅ Complete
**Dossier Task**: ST005 | **Plan Task**: Subtask 001

### What I Did
Read `packages/workflow/src/interfaces/workunit.types.ts` (131 lines). Searched for execution-related terms: `execution_mode`, `execution mode`, `canRun`, `E165`, `setLineMode` — zero results. File contains only pure I/O type definitions (WorkUnitInput, WorkUnitOutput, AgentConfig, CodeConfig, UserInputOption, UserInputConfig, WorkUnit).

### Evidence
- File has no execution-related fields — confirmed clean
- No changes needed

### Files Changed
- None (read-only verification)

**Completed**: 2026-02-01
---

## Task ST006: Run quality gate
**Started**: 2026-02-01
**Status**: ✅ Complete
**Dossier Task**: ST006 | **Plan Task**: Subtask 001

### What I Did
Ran `just typecheck` and `pnpm build` to verify documentation-only changes caused no code breakage.

### Evidence
```
just typecheck: ✅ (zero errors)
pnpm build: ✅ (6/6 tasks, FULL TURBO — all cached)
```

### Files Changed
- None (quality gate only)

**Completed**: 2026-02-01
---

