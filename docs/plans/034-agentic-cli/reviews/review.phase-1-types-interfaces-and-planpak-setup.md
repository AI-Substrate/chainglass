# Code Review: Phase 1 — Types, Interfaces, and PlanPak Setup

**Plan**: 034-agentic-cli
**Phase**: Phase 1: Types, Interfaces, and PlanPak Setup
**Diff Range**: `4306090..575c264`
**Review Date**: 2026-02-16
**Testing Approach**: Full TDD (interfaces-only phase; TDD starts Phase 2)
**Mock Usage**: Fakes only (no vi.fn/jest.fn)

---

## A. Verdict

**APPROVE**

All code is correct, complete, and compiles cleanly. All 5 acceptance criteria satisfied. All 3730 tests pass with zero regressions. The code changes are exactly what was specified — no more, no less.

Graph integrity findings (execution log formatting, footnote population) are documented as warnings below. These are documentation hygiene items that should be addressed before starting Phase 2 but do not block approval of the code changes.

---

## B. Summary

Phase 1 delivers precisely what was planned: 4 PlanPak directories + 4 TypeScript source files defining type contracts for the redesigned agent system. The interfaces faithfully implement the Workshop 02 design. All acceptance criteria (AC-01, AC-02, AC-03, AC-10, AC-13) are satisfied. `tsc --noEmit` passes, `just fft` passes (3730 tests, 0 failures). No out-of-scope changes. No Plan 019 files modified. PlanPak placement rules followed. ADR constraints honored.

The only findings are in documentation artifacts: execution log heading structure, plan/dossier cross-links, and footnote population — all fixable without code changes.

---

## C. Checklist

**Testing Approach: Full TDD** (Phase 1 exemption: interfaces-only, no tests expected)

- [x] No implementation code (interfaces only) — TDD starts Phase 2
- [x] No tests needed (per dossier Test Plan section)
- [x] BridgeContext patterns: N/A (no VS Code extension code in this phase)
- [x] Only in-scope files changed (4 source files + 4 plan artifacts)
- [x] Linters/type checks are clean (`tsc --noEmit` ✓, `just fft` ✓)
- [x] Absolute paths used in dossier task table
- [x] PlanPak placement rules followed (flat, descriptive names in `features/034-agentic-cli/`)
- [x] Dependency direction correct (034 imports from `interfaces/`, never reverse)
- [ ] Execution log headings present for all tasks (T001-T004 missing headings)
- [ ] Footnote ledger populated post-implementation (all placeholders)
- [ ] Plan task table Log column links to execution log

---

## D. Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| V1 | MEDIUM | execution.log.md:33-128 | T001-T004 lack `## Task` headings; only T005 has proper heading | Add headings for T001-T004 |
| V2 | MEDIUM | agentic-cli-plan.md:307-311 | Plan task table Log column all "-" despite completed tasks | Add log links after V1 fix |
| V3 | MEDIUM | tasks.md:237-241 | Dossier task Notes column has no log anchor references | Add log anchor links to Notes |
| V4 | LOW | agentic-cli-plan.md:736-740 | Footnote ledger has 5 unfilled placeholders post-implementation | Populate or mark N/A for new-file-only phase |
| V5 | LOW | agentic-cli-plan.md:307 | Plan Notes says "T000" but dossier uses "T001" | Update plan to "T001" |
| V6 | LOW | execution.log.md:30-36 | Phase summary placed mid-log between T005 and T004 | Move to end or add T004 heading |
| V7 | LOW | tasks.md:401-408 | Phase Footnote Stubs table empty; no file-to-footnote mapping | Add note: new-file-only phase, no cross-plan modifications |
| V8 | LOW | agentic-cli-plan.md:308 | Plan 1.1 success criteria missing AgentType (documented as Gap 1 in dossier) | Add AgentType to plan criteria |
| F-01 | LOW | agent-instance.interface.ts:11 | AgentResult imported directly from agent-types.ts instead of local types.ts re-export | Minor import consistency cleanup |
| F-02 | INFO | agent-instance.interface.ts:81-87 | terminate() JSDoc silent on null-session behavior (compact documents it) | Add JSDoc note for implementor clarity |

---

## E. Detailed Findings

### E.0 Cross-Phase Regression Analysis

**Skipped**: First phase of plan — no prior phases to regress against.

---

### E.1 Doctrine & Testing Compliance

#### Graph Integrity

**Graph Integrity Score**: ⚠️ MINOR_ISSUES (documentation-only findings, no code issues)

**Execution Log Structure (V1, V6)**:
The execution log has proper `## Task T005: Create barrel index.ts` heading but T001-T004 entries lack `## Task Txxx:` headings — they are bare metadata blocks after `---` separators. This makes them unreferenceable by anchor links. Additionally, the "Phase 1 Complete" summary block is positioned between T005 and T004 entries, creating confusing flow.

**Plan↔Dossier Sync (V2, V3, V5)**:
Plan task table Log column shows "-" for all 5 completed tasks. Dossier task Notes column has mapping text (e.g., "maps to plan task 1.0") but no log anchor references. Plan Notes cell for task 1.0 uses "T000" while dossier uses "T001" for the same task.

**Footnotes (V4, V7)**:
Plan Change Footnotes Ledger (lines 736-740) has 5 placeholder entries "[To be added during implementation via plan-6a]" — none were populated post-implementation. Dossier Phase Footnote Stubs table is empty. For an interfaces-only phase creating only new plan-scoped files, footnotes may be unnecessary — but the placeholders should either be populated or explicitly marked N/A.

**Success Criteria Drift (V8)**:
Plan task 1.1 success criteria omits `AgentType` — documented as Gap 1 in the dossier's Requirements Traceability section but the plan was not updated to reflect the resolution.

#### Authority Conflicts

No authority conflicts detected. Plan and dossier are consistent in task definitions, status, and scope. The footnote placeholders are unfilled on both sides (no sync conflict — both are empty).

#### Testing Compliance

Phase 1 is interfaces-only by design. The dossier Test Plan section explicitly states: "Phase 1 has no tests. Interfaces-only phase — validation is via `tsc --noEmit`." This is consistent with the plan's Full TDD approach which begins TDD in Phase 2. No TDD violations.

---

### E.2 Semantic Analysis

**All checks pass.** The interfaces faithfully implement the Workshop 02 design:

- **IAgentInstance**: 10 readonly properties + 6 methods, exactly matching AC-01. AC-02 exclusions verified (no getEvents, setIntent, notifier, storage). 3-state status model (AC-03). Metadata as `Readonly<Record<string, unknown>>` (AC-10). Optional sessionId and metadata in AgentInstanceConfig (AC-13).

- **IAgentManagerService**: 6 methods with correct return types. Same-instance guarantee documented via RFC-2119 MUST in JSDoc. Constructor constraint (AdapterFactory only) documented in file header.

- **types.ts**: All 8 type definitions correct. AgentRunOptions is instance-level (no sessionId, adds timeoutMs per Discovery 09). AgentInstanceConfig has NO adapter field (per DYK-P5#2). AgentCompactOptions adds timeout parity (per DYK-P5#1). AgentEventHandler re-exported from shared location.

Minor finding (F-01, LOW): `agent-instance.interface.ts` line 11 imports `AgentResult` directly from `../../interfaces/agent-types.js` while all other types come from the local `./types.js` re-export. Functional but inconsistent — one-line cleanup opportunity.

Minor finding (F-02, INFO): `terminate()` JSDoc documents the always→stopped guarantee but doesn't specify behavior when sessionId is null. `compact()` explicitly documents this as a @throws. Implementors would benefit from clarity here.

---

### E.3 Quality & Safety Analysis

**Safety Score: 100/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0)
**Verdict: APPROVE**

This phase contains only TypeScript interface definitions and type aliases — no logic, no I/O, no state mutation, no security surface. The code is purely declarative.

- **Correctness**: N/A — no logic to evaluate
- **Security**: N/A — no executable code, no secrets, no input processing
- **Performance**: N/A — no runtime behavior
- **Observability**: N/A — no logging or metrics surface

---

### E.4 Doctrine Evolution Recommendations

**Advisory — does not affect verdict.**

| Category | New | Updates | Priority HIGH |
|----------|-----|---------|---------------|
| ADRs | 0 | 0 | 0 |
| Rules | 0 | 0 | 0 |
| Idioms | 1 | 0 | 0 |
| Architecture | 0 | 0 | 0 |

**Idiom Candidate (MEDIUM priority)**:
- **Pattern**: "Config = identity + settings (serializable). Dependencies = collaborators (separate constructor params)."
- **Evidence**: `AgentInstanceConfig` deliberately excludes adapter; this pattern is documented in DYK-P5#2 and enforced in the type design.
- **Rationale**: This pattern separates serializable configuration from injected dependencies, making config portable (saveable, loggable, comparable). If applied more broadly, it could be documented in `idioms.md` as a standard pattern for service configuration in this codebase.

**Positive Alignment**:
- ADR-0011 (first-class domain concepts): Phase 1 follows interface-first development ✓
- ADR-0004 (decorator-free DI): No DI in Phase 1 ✓
- ADR-0006 (CLI-based orchestration): AgentRunOptions excludes sessionId ✓
- ADR-0010 (notifier removal): IAgentInstance has no notifier ✓
- Constitution P2 (interface-first): Interfaces defined before any implementation ✓

---

## F. Coverage Map

**Testing Approach**: Full TDD — Phase 1 Exemption (interfaces-only)

| AC | Description | Test Coverage | Confidence |
|----|-------------|--------------|------------|
| AC-01 | IAgentInstance members | Validated by `tsc --noEmit` (type compilation) | 75% (behavioral tests in Phase 2) |
| AC-02 | Excluded members | Validated by absence in interface definition | 100% (static check) |
| AC-03 | 3-state status model | Validated by type alias definition | 100% (static check) |
| AC-10 | Metadata type + mutability | Validated by `Readonly<Record<string, unknown>>` + `setMetadata` | 75% (runtime tests in Phase 2) |
| AC-13 | Optional sessionId/metadata in config | Validated by `?` optional markers | 100% (static check) |

**Overall Coverage Confidence**: 90% (static type validation; behavioral validation deferred to Phase 2 per plan)

---

## G. Commands Executed

```bash
# Type checking
pnpm exec tsc --noEmit                    # Exit 0 — no errors

# Full quality check
just fft                                   # 254 files passed | 5 skipped
                                           # 3730 tests passed | 41 skipped
                                           # Duration: 92.66s

# Diff computation
git diff --unified=3 --no-color 4306090..575c264
```

---

## H. Decision & Next Steps

**Decision**: APPROVE with documentation warnings.

All code changes are correct, complete, and safe. The phase delivers exactly what was planned. Warnings are documentation hygiene items:

1. **Before starting Phase 2**, address execution log formatting (V1, V6):
   - Add `## Task T001:`, `## Task T002:`, `## Task T003:`, `## Task T004:` headings
   - Move "Phase 1 Complete" summary to end of log or separate it clearly

2. **Optional cleanup** (can be done alongside Phase 2):
   - Populate footnote ledger or mark N/A for new-file-only phase (V4, V7)
   - Add log links to plan/dossier task tables (V2, V3)
   - Fix T000→T001 ID mismatch in plan (V5)
   - Add AgentType to plan 1.1 success criteria (V8)
   - Import consistency fix in agent-instance.interface.ts (F-01)
   - Add null-session JSDoc to terminate() (F-02)

**Next step**: Proceed to `/plan-5-phase-tasks-and-brief` for Phase 2. Address documentation warnings via `plan-6a` or inline during Phase 2 implementation.

---

## I. Footnotes Audit

| Diff-Touched Path | Footnote Tag(s) | Plan Ledger Node ID(s) |
|--------------------|-----------------|----------------------|
| `packages/shared/src/features/034-agentic-cli/types.ts` | — (none assigned) | — (placeholder [^1]-[^5] unfilled) |
| `packages/shared/src/features/034-agentic-cli/agent-instance.interface.ts` | — (none assigned) | — (placeholder [^1]-[^5] unfilled) |
| `packages/shared/src/features/034-agentic-cli/agent-manager-service.interface.ts` | — (none assigned) | — (placeholder [^1]-[^5] unfilled) |
| `packages/shared/src/features/034-agentic-cli/index.ts` | — (none assigned) | — (placeholder [^1]-[^5] unfilled) |

**Note**: All 4 source files are newly created and plan-scoped. No cross-plan modifications were made. Footnote ledger placeholders [^1]-[^5] remain unfilled — recommend either populating with new-file entries or adding an explicit N/A note for interfaces-only phases.
