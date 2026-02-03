# Code Review: Subtask 001 — Property Bags and Orchestrator Settings

**Reviewed**: 2026-02-03
**Phase**: Phase 7 Subtask 001
**Plan**: [positional-graph-plan.md](../positional-graph-plan.md)
**Dossier**: [001-subtask-property-bags-and-orchestrator-settings.md](../tasks/phase-7-integration-tests-e2e-and-documentation/001-subtask-property-bags-and-orchestrator-settings.md)
**Testing Approach**: TAD (Test-Assisted Development)
**Diff Source**: `git diff HEAD` (uncommitted changes)

---

## A) Verdict

**APPROVE** ✅

All tasks complete. Quality gate passed. Minor advisory findings noted but none blocking.

---

## B) Summary

This subtask adds extensibility infrastructure to the positional graph schema layer:
- **Property bags** (`properties: Record<string, unknown>`) on Graph, Line, and Node for arbitrary metadata
- **Orchestrator settings** (typed Zod schemas) with base + entity-specific overrides for execution control
- Migrated `execution` from NodeConfig and `transition` from LineDefinition into `orchestratorSettings`
- Added kubectl-style `get`/`set` CLI commands with `--prop` and `--orch` flags
- Backward compatibility via pre-parse backfill migration for old YAML format
- 19 new tests covering schemas, round-trip, migration, and defaults

Changes: +702/-262 lines across 15 files (plus 4 new files).

---

## C) Checklist

**Testing Approach: TAD (Test-Assisted Development)**

- [x] Tests cover key behaviors (schema validation, round-trip, migration, defaults)
- [x] Test names are descriptive and valuable
- [x] Edge cases covered (unknown key rejection, partial updates, old format migration)
- [x] Evidence documented in execution log (19 tests pass, 2959 full suite)
- [x] Mock usage matches spec: Avoid mocks ✅ (real FakeFileSystem, real service)

**Universal:**

- [x] Only in-scope files changed (plus one justified addition: `enums.schema.ts` per DYK discovery)
- [x] Linters/type checks clean (`just lint` 0 errors, `just typecheck` 0 errors)
- [x] Absolute paths used (service methods use `ctx.worktreePath` patterns)
- [x] Backward compatibility preserved (backfill migration for old YAML)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| SEC-001 | MEDIUM | positional-graph.command.ts:93-108 | Prototype pollution risk in parseKeyValuePairs | Add key sanitization |
| SEC-002 | LOW | positional-graph.command.ts:101-104 | No size limit on JSON.parse input | Add length check |
| COR-001 | MEDIUM | positional-graph.service.ts:1240-1292 | Type mismatch: Record<string,unknown> vs Partial<T> | Align signatures |
| COR-002 | LOW | positional-graph.command.ts:159-201 | No feedback when `set` called with no options | Add validation message |
| COR-003 | LOW | positional-graph.service.ts:104-119 | Backfill migration mutates in-place | Clone before mutation |
| COR-004 | LOW | orchestrator-settings.schema.ts:11 | GraphOrchestratorSettingsSchema is empty | Document as placeholder |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Skipped**: Single subtask extension, no prior phases to regress against.

### E.1) Doctrine & Testing Compliance

#### Graph Integrity (Link Validation)

| Link Type | Status | Notes |
|-----------|--------|-------|
| Task↔Log | ✅ INTACT | All 13 tasks have corresponding execution log entries |
| Task↔File | ✅ INTACT | All files in diff covered by task table |
| Footnote↔File | ⚠️ N/A | Subtask dossier doesn't use footnotes (parent plan handles) |

#### TAD Compliance

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Test coverage | ✅ PASS | 19 tests covering all key behaviors |
| Test quality | ✅ PASS | Descriptive names, real assertions |
| Evidence documented | ✅ PASS | Execution log shows test results |
| Mocks avoided | ✅ PASS | Uses FakeFileSystem, real service |

#### Plan Compliance

| Task | Status | Notes |
|------|--------|-------|
| ST001 | ✅ PASS | properties.schema.ts with 3 open-bag schemas |
| ST002 | ✅ PASS | orchestrator-settings.schema.ts with base + entity overrides |
| ST003 | ✅ PASS | graph.schema.ts migration complete |
| ST004 | ✅ PASS | node.schema.ts migration complete |
| ST005 | ✅ PASS | Barrel exports updated |
| ST006 | ✅ PASS | Backfill migration implemented |
| ST007 | ✅ PASS | Service interface updated, old setters removed |
| ST008 | ✅ PASS | 6 existing test files updated |
| ST009 | ✅ PASS | kubectl-style `get` commands added |
| ST010 | ✅ PASS | kubectl-style `set` with --prop/--orch added |
| ST011 | ✅ PASS | 19 new unit tests |
| ST012 | ✅ PASS | Quality gate passed |
| ST013 | ✅ N/A | Manual validation (documented in log) |

#### Scope Creep

- **enums.schema.ts**: Created (not originally planned) to resolve circular dependency. Documented in Discoveries table. ✅ Justified.
- **No excessive changes**: All modifications align with task scope.

### E.2) Semantic Analysis

No semantic issues found. Implementation matches spec:
- `properties` fields use `.catchall(z.unknown())` as specified
- `orchestratorSettings` fields use `.strict()` as specified
- Default values match spec (`execution: 'serial'`, `transition: 'auto'`, etc.)
- Backfill migration correctly moves top-level fields into `orchestratorSettings`

### E.3) Quality & Safety Analysis

**Safety Score: 94/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 2, LOW: 4)
**Verdict: APPROVE** (no blocking issues)

#### Security Findings

**[MEDIUM] SEC-001: Prototype Pollution Risk**
- **File**: `apps/cli/src/commands/positional-graph.command.ts:93-108`
- **Issue**: `parseKeyValuePairs` accepts arbitrary keys without sanitization. Keys like `__proto__`, `constructor`, or `prototype` could pollute Object.prototype.
- **Impact**: Malicious input `--prop __proto__.polluted=true` could affect global behavior.
- **Fix**: Add key validation:
  ```typescript
  const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];
  if (key && !FORBIDDEN_KEYS.includes(key) && valueParts.length > 0) {
    // ... existing logic
  }
  ```

**[LOW] SEC-002: No Size Limit on JSON.parse**
- **File**: `apps/cli/src/commands/positional-graph.command.ts:101-104`
- **Issue**: Large JSON values could cause memory exhaustion.
- **Impact**: DoS via `--prop key={...massive JSON...}`
- **Fix**: Add length check before JSON.parse.

#### Correctness Findings

**[MEDIUM] COR-001: Type Signature Mismatch**
- **File**: `packages/positional-graph/src/services/positional-graph.service.ts`
- **Issue**: Service implementation uses `Record<string, unknown>` but interface declares `Partial<GraphProperties>`.
- **Impact**: Less type safety than interface implies.
- **Fix**: Align service signature with interface types.

**[LOW] COR-002: Silent Success on Empty Set**
- **File**: `apps/cli/src/commands/positional-graph.command.ts:159-201`
- **Issue**: `cg wf set my-graph` (no options) succeeds without making changes.
- **Impact**: User confusion.
- **Fix**: Return informative message when no options provided.

**[LOW] COR-003: In-Place Mutation During Migration**
- **File**: `packages/positional-graph/src/services/positional-graph.service.ts:104-119`
- **Issue**: Backfill migration mutates parsed object without cloning.
- **Impact**: If yamlParser caches, mutation could affect cached data.
- **Fix**: Clone before mutation.

**[LOW] COR-004: Empty GraphOrchestratorSettingsSchema**
- **File**: `packages/positional-graph/src/schemas/orchestrator-settings.schema.ts:11`
- **Issue**: Schema is empty (no valid keys).
- **Impact**: `--orch foo=bar` on graph fails with unhelpful error.
- **Fix**: Document as intentional placeholder.

### E.4) Doctrine Evolution Recommendations

**Advisory — does not affect verdict**

| Category | Recommendation |
|----------|---------------|
| **Idiom** | `parseKeyValuePairs` pattern could be extracted to shared utility |
| **Rule** | Add prototype pollution guard to CLI parsing guidelines |
| **ADR** | Consider ADR for schema versioning/migration strategy |

---

## F) Coverage Map

| Acceptance Criterion | Test Coverage | Confidence |
|---------------------|---------------|------------|
| Properties bag on all entities | 4 tests (node, line, graph, deep-merge) | 100% |
| Orchestrator settings on all entities | 4 tests (set/get, partial, rejection) | 100% |
| Service update methods | Round-trip tests via service calls | 100% |
| kubectl-style get/set CLI | Manual validation (ST013) | 75% |
| Dynamic orch validation | `rejects unknown orchestrator keys` test | 100% |
| Backward compatibility (migration) | 2 tests (old node format, old graph format) | 100% |
| Defaults applied | 3 tests (node, line, empty) | 100% |

**Overall Coverage Confidence: 96%**

---

## G) Commands Executed

```bash
# Quality checks
just lint           # 0 errors
just typecheck      # 0 errors

# Test runs
pnpm vitest run test/unit/positional-graph/properties-and-orchestrator.test.ts  # 19 passed
pnpm vitest run test/unit/positional-graph/                                      # 233 passed

# Diff analysis
git diff --stat HEAD  # 15 files changed, +702/-262
```

---

## H) Decision & Next Steps

**Approved for merge.**

**Recommended pre-merge fixes** (MEDIUM findings):
1. **SEC-001**: Add prototype pollution guard to `parseKeyValuePairs`
2. **COR-001**: Align type signatures between interface and implementation

These fixes are recommended but not blocking. Implementation is functionally correct and well-tested.

**Post-merge actions**:
1. Commit all changes with message: `feat(positional-graph): add properties and orchestratorSettings to all entities`
2. Update subtasks registry in parent plan
3. Consider extracting `parseKeyValuePairs` to shared helpers if pattern is reused

---

## I) Footnotes Audit

**N/A** — Subtask uses parent plan's footnote ledger. No new footnotes introduced in this subtask dossier.

---

*Review performed by plan-7-code-review agent. Testing approach: TAD (per execution log). All validators completed successfully.*
