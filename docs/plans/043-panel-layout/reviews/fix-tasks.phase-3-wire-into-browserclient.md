# Fix Tasks: Phase 3: Wire Into BrowserClient + Migration

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Restore ExplorerPanel error feedback
- **Severity**: HIGH
- **File(s)**: /home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx
- **Issue**: `barContext.showError` is a no-op; not-found path navigation failures are silent.
- **Fix**: Wire callback to user-visible toast error.
- **Patch hint**:
  ```diff
   showError: (message: string) => {
  -  // toast handled by ExplorerPanel
  +  toast.error(message);
   },
  ```

### FT-002: Replace mock-style tests with fakes + Test Docs
- **Severity**: HIGH
- **File(s)**: /home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/file-path-handler.test.ts
- **Issue**: Uses `vi.fn()` and lacks required 5-field Test Doc comments.
- **Fix**: Implement concrete fake BarContext and add Test Doc block in each `it` case.
- **Patch hint**:
  ```diff
  - pathExists: vi.fn().mockResolvedValue('file')
  + pathExists: async () => fake.pathType
  
  +/*
  +Test Doc:
  +- Why: ...
  +- Contract: ...
  +- Usage Notes: ...
  +- Quality Contribution: ...
  +- Worked Example: ...
  +*/
  ```

### FT-003: Add missing Full-TDD evidence for key ACs
- **Severity**: HIGH
- **File(s)**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-3-wire-into-browserclient/execution.log.md, relevant test files
- **Issue**: No explicit RED→GREEN sequence and weak proof for AC-9/22/23/24/25.
- **Fix**: Add targeted tests and attach explicit failing-then-passing evidence + command outputs.
- **Patch hint**:
  ```diff
  +## RED/GREEN Evidence
  +- RED: <test name> failed with ...
  +- GREEN: <test name> passed after ...
  +
  +## AC Evidence Addendum
  +- AC-9: <test path + assertion>
  +- AC-22: <test path + assertion>
  +- AC-23/24/25: <integration test refs>
  ```

## Medium / Low Fixes

### FT-004: Harden worktree prefix normalization
- **Severity**: MEDIUM
- **File(s)**: /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/services/file-path-handler.ts
- **Issue**: Prefix stripping can incorrectly trim paths that merely share a prefix.
- **Fix**: Require full-segment boundary check before slicing.
- **Patch hint**:
  ```diff
  -if (normalized.startsWith(context.worktreePath)) {
  +if (
  +  normalized === context.worktreePath ||
  +  normalized.startsWith(`${context.worktreePath}/`)
  +) {
     normalized = normalized.slice(context.worktreePath.length);
   }
  ```

### FT-005: Use public panel-layout contract imports only
- **Severity**: MEDIUM
- **File(s)**:
  - /home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx
  - /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/hooks/use-panel-state.ts
  - /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/services/file-path-handler.ts
- **Issue**: Imports from internal `.../panel-layout/types` path across domain boundary.
- **Fix**: Import all contracts/types from `@/features/_platform/panel-layout` barrel.
- **Patch hint**:
  ```diff
  -import type { PanelMode } from '@/features/_platform/panel-layout/types';
  +import type { PanelMode } from '@/features/_platform/panel-layout';
  ```

### FT-006: Update Domain Manifest currency
- **Severity**: MEDIUM
- **File(s)**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-plan.md
- **Issue**: New Phase 3 files are missing from `## Domain Manifest`.
- **Fix**: Add rows for `hooks/use-clipboard.ts`, `hooks/use-file-navigation.ts`, `hooks/use-panel-state.ts`, `services/file-path-handler.ts` with domain/classification.
- **Patch hint**:
  ```diff
  +| `apps/web/src/features/041-file-browser/hooks/use-clipboard.ts` | file-browser | internal | Clipboard handlers extracted from BrowserClient |
  +| `apps/web/src/features/041-file-browser/hooks/use-file-navigation.ts` | file-browser | internal | File navigation state/effects extracted from BrowserClient |
  +| `apps/web/src/features/041-file-browser/hooks/use-panel-state.ts` | file-browser | internal | Panel mode + changes data state |
  +| `apps/web/src/features/041-file-browser/services/file-path-handler.ts` | file-browser | internal | ExplorerPanel BarHandler for typed path navigation |
  ```

### FT-007: Split unrelated scope from Phase 3 review range
- **Severity**: MEDIUM
- **File(s)**: /home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/live-file-events-plan.md (and related Plan 045 files)
- **Issue**: Unrelated Plan 045 artifacts are in the phase diff range, reducing deterministic review scope.
- **Fix**: Isolate Phase 3 changes (separate commit/range) or explicitly mark these files out-of-scope in execution evidence.
- **Patch hint**:
  ```diff
  +# Review scope note
  +Exclude Plan 045 artifacts from Phase 3 review range; reviewed separately under Plan 045.
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
