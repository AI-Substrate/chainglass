# Fix Tasks: Phase 1 — Types, Interfaces, and PlanPak Setup

**Plan**: 036-cli-orchestration-driver
**Phase**: Phase 1
**Generated**: 2026-02-17
**From Review**: review.phase-1-types-interfaces-and-planpak-setup.md

---

## Blocking Fixes (must complete before merge)

### FIX-1: Populate footnote system via plan-6a (V4, V5, V6, V7, V8)

**Severity**: CRITICAL + HIGH
**Root Cause**: `plan-6a-update-progress` was never run post-implementation.

**Steps**:

1. Run `plan-6a-update-progress` targeting Phase 1 to:
   - Add `[^N]` footnote references to the Notes column of cross-plan-edit tasks (T002, T003, T004, T005, T007, T008)
   - Populate the "Phase Footnote Stubs" table in `tasks.md`
   - Replace placeholder entries in plan § 12 "Change Footnotes Ledger" with actual file paths and FlowSpace node IDs

2. **Files requiring footnotes** (5 cross-plan-edited files):

   | File | Tasks | Suggested Footnote |
   |------|-------|--------------------|
   | `orchestration-service.types.ts` | T002, T003 | [^1] — DriveOptions, DriveEvent, DriveResult, DriveExitReason types + drive() on IGraphOrchestration |
   | `graph-orchestration.ts` | T004, T005 | [^2] — podManager? on GraphOrchestrationOptions + drive() stub |
   | `fake-orchestration-service.ts` | T007 | [^3] — FakeGraphOrchestration.drive() with setDriveResult/getDriveHistory |
   | `030-orchestration/index.ts` | T008 | [^4] — Barrel exports for 5 new types |
   | `positional-graph/src/index.ts` | T008 | [^5] — Package-level re-exports for 5 new types |

3. **Validation**: After running plan-6a:
   - Every cross-plan-edit task has `[^N]` in Notes
   - Phase Footnote Stubs table has 5 entries
   - Plan § 12 has 5 entries with FlowSpace node IDs (not placeholders)

---

## Non-Blocking Suggestions (optional)

### FIX-2: Split combined execution log entries (V1)

**Severity**: MEDIUM

The execution log combines T002+T003 and T004+T005 into single entries. For 1:1 task↔log traceability, either:
- Split into individual entries, OR
- Add `### T002` / `### T003` sub-headings within combined entries

### FIX-3: Fix log anchor reference in Discoveries table (V2)

**Severity**: LOW

In `tasks.md` line 444, change `log#task-t006` to a valid markdown link:
```
[log](execution.log.md#task-t006-red-tests-for-fakegraphorchestrationdrive)
```

### FIX-4: Add backlinks from log entries to dossier (V3)

**Severity**: MEDIUM

Add a "Dossier Task" field to each log entry linking back to the tasks table, e.g.:
```markdown
**Dossier Task**: [T001](../tasks.md#tasks)
```

### FIX-5: Consider package-root import for FakeGraphConfig (IMP-1)

**Severity**: LOW

In `fake-drive.test.ts` line 19, `FakeGraphConfig` is imported via deep relative path but is available from `@chainglass/positional-graph`. Consider aligning with line 14's package import style. Note: `buildFakeReality` (line 17) requires the deep path, so this is a minor consistency item.
