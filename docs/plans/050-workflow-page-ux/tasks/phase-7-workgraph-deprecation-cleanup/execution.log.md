# Execution Log: Phase 7 — Workgraph Deprecation + Cleanup

**Phase**: Phase 7: Workgraph Deprecation + Cleanup
**Started**: 2026-02-27

---

## T001: Execute workgraph reference audit

**Status**: ✅ Complete
**Started**: 2026-02-27T02:38Z

Audit completed during dossier preparation. Full blast radius documented in tasks.md Pre-Implementation Check table. Key findings:

- **42 files** total with workgraph references across codebase
- **22 files** in `apps/web/` to DELETE or MODIFY
- **17 files** in feature 022 folder (DELETE entire dir)
- **18 test files** in `test/unit/web/features/022-workgraph-ui/` (DELETE)
- **1 test file** at `test/unit/workflow/workgraph-watcher.adapter.test.ts` (DELETE — DYK insight: outside 022 dir)
- **1 integration test** at `test/integration/workflow/features/023/central-watcher.integration.test.ts` (VERIFY)
- Worktree page (`worktree/page.tsx`) imports WorkGraphUIService — must update
- DI container has ~20 lines of workgraph registrations
- `.next/standalone/` has stale copies — exclude from grep, clear cache

**Evidence**: grep audit output in prior conversation context.

---
