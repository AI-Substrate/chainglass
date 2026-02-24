# Fix Tasks: Simple Mode

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Replace forbidden mock-based toast tests
- **Severity**: HIGH
- **File(s)**: /home/jak/substrate/041-file-browser/test/unit/web/features/042-global-toast/toast-integration.test.ts
- **Issue**: Uses `vi.mock()`/`vi.fn()` which violates fake-only testing doctrine.
- **Fix**: Replace module mocking with doctrine-compliant fake strategy and add rule-required Test Doc blocks.
- **Patch hint**:
  ```diff
  -vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { ... }) }))
  +// Use a fake notifier abstraction and assert fake interactions
  +// Add full 5-field Test Doc blocks for each test
  ```

### FT-002: Test real production toast wiring paths
- **Severity**: HIGH
- **File(s)**: /home/jak/substrate/041-file-browser/test/unit/web/features/042-global-toast/toast-integration.test.ts
- **Issue**: Current tests primarily assert mocked API calls and do not execute browser/workgraph handlers.
- **Fix**: Add focused tests that trigger save success/conflict and workgraph external-change paths in production code, then assert expected notifier behavior via allowed fake pattern.
- **Patch hint**:
  ```diff
  -toast.success('File saved')
  -expect(toast.success).toHaveBeenCalledWith('File saved')
  +await runHandleSaveSuccessScenario(...)
  +fakeNotifier.assertSuccess('File saved')
  ```

### FT-003: Align conflict-path behavior with AC-09 contract
- **Severity**: HIGH
- **File(s)**: /home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx
- **Issue**: Conflict currently resolves to generic promise error message, not explicit `"Save conflict"` + description contract from plan.
- **Fix**: Emit explicit conflict toast with title and description (or update spec/plan to match intended behavior).
- **Patch hint**:
  ```diff
  -error: (err) => err.message,
  +error: (err) => err.message,
  +// conflict branch should call:
  +// toast.error('Save conflict', { description: 'File was modified externally. Refresh to see changes.' })
  ```

### FT-004: Provide missing execution evidence for AC-14
- **Severity**: HIGH
- **File(s)**: /home/jak/substrate/041-file-browser/docs/plans/042-global-toast-system/execution.log.md
- **Issue**: Execution log artifact missing; cannot validate `just fft` success.
- **Fix**: Add execution log entries with actual command outputs for lint/typecheck/build/tests (or documented equivalent).
- **Patch hint**:
  ```diff
  +## Verification
  +- just fft
  +  - lint: PASS
  +  - format: PASS
  +  - typecheck: PASS
  +  - test: PASS
  ```

## Medium / Low Fixes

### FT-005: Add refresh feedback or narrow scope wording
- **Severity**: MEDIUM
- **File(s)**: /home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx
- **Issue**: Plan task expects save/refresh feedback, but refresh handlers emit no toast.
- **Fix**: Add `toast.info` for refresh handlers or update plan/spec wording to save-only behavior.

### FT-006: Normalize domain artifact consistency
- **Severity**: MEDIUM
- **File(s)**:
  - /home/jak/substrate/041-file-browser/docs/plans/042-global-toast-system/global-toast-system-plan.md
  - /home/jak/substrate/041-file-browser/docs/domains/registry.md
  - /home/jak/substrate/041-file-browser/docs/domains/domain-map.md
- **Issue**: Manifest omits touched files; workgraph-ui domain labeling is not fully formalized in registry.
- **Fix**: Update manifest mappings and either formalize workgraph-ui as a domain or remove informal slug usage.

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
