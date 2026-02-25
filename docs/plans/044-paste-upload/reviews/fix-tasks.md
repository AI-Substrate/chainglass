# Fix Tasks: Phase 1: Paste Upload

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Re-scope computed diff to Phase 044
- **Severity**: HIGH
- **File(s)**: /home/jak/substrate/041-file-browser/docs/plans/044-paste-upload/reviews/_computed.diff
- **Issue**: Current diff does not include planned paste/upload implementation files.
- **Fix**: Recompute diff from the commit range or working tree that contains only T001-T012 implementation for Plan 044.
- **Patch hint**:
  ```diff
  - diff --git a/apps/web/src/features/041-file-browser/services/directory-listing.ts b/apps/web/src/features/041-file-browser/services/directory-listing.ts
  + diff --git a/apps/web/src/features/041-file-browser/services/upload-file.ts b/apps/web/src/features/041-file-browser/services/upload-file.ts
  ```

### FT-002: Implement planned Phase 1 code changes
- **Severity**: HIGH
- **File(s)**: /home/jak/substrate/041-file-browser/apps/web/next.config.mjs; /home/jak/substrate/041-file-browser/packages/shared/src/interfaces/filesystem.interface.ts; /home/jak/substrate/041-file-browser/packages/shared/src/adapters/node-filesystem.adapter.ts; /home/jak/substrate/041-file-browser/packages/shared/src/fakes/fake-filesystem.ts; /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/services/upload-file.ts; /home/jak/substrate/041-file-browser/apps/web/app/actions/file-actions.ts; /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/paste-upload-button.tsx; /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/paste-upload-modal.tsx; /home/jak/substrate/041-file-browser/apps/web/src/components/dashboard-sidebar.tsx
- **Issue**: Phase ACs have no implementation evidence.
- **Fix**: Complete T001-T011 exactly as defined in tasks.md and plan.
- **Patch hint**:
  ```diff
  - // no uploadFile server action
  + export async function uploadFile(formData: FormData): Promise<UploadFileResult> { ... }
  ```

### FT-003: Add required verification evidence
- **Severity**: HIGH
- **File(s)**: /home/jak/substrate/041-file-browser/docs/plans/044-paste-upload/execution.log.md
- **Issue**: Missing execution log prevents validation of T012 and acceptance criteria.
- **Fix**: Record commands and observed outcomes (`just fft`, targeted tests, runtime verification) with timestamps.
- **Patch hint**:
  ```diff
  + ## 2026-02-24 Verification
  + - just fft  # PASS
  + - pnpm test test/contracts/filesystem.contract.ts  # PASS
  + - ...
  ```

### FT-004: Add phase-required tests and evidence mapping
- **Severity**: HIGH
- **File(s)**: /home/jak/substrate/041-file-browser/test/contracts/filesystem.contract.ts; /home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/upload-file.test.ts
- **Issue**: Buffer parity and upload behavior tests are missing from reviewed evidence.
- **Fix**: Implement T005 and T007 tests and map results to AC-16..AC-35.
- **Patch hint**:
  ```diff
  + it('writes Buffer content and reports matching stat size', async () => { ... })
  + it('uses timestamp naming and collision suffix', async () => { ... })
  ```

### FT-005: Resolve doctrine violations in unrelated changed test (or remove from scope)
- **Severity**: HIGH
- **File(s)**: /home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/file-tree.test.tsx
- **Issue**: Uses `vi.fn` and lacks required Test Doc metadata under project rules.
- **Fix**: Replace mock usage with explicit fakes + add Test Doc blocks, or exclude this file from Plan 044 phase diff.
- **Patch hint**:
  ```diff
  - const onOpenChange = vi.fn();
  + const calls: boolean[] = [];
  + const onOpenChange = (next: boolean) => { calls.push(next); };
  ```

## Medium / Low Fixes

### FT-006: Reconcile domain documentation with actual implemented scope
- **Severity**: MEDIUM
- **File(s)**: /home/jak/substrate/041-file-browser/docs/domains/file-browser/domain.md; /home/jak/substrate/041-file-browser/docs/domains/domain-map.md
- **Issue**: Domain currency/edge updates are not clearly tied to implemented phase scope.
- **Fix**: Update domain docs only after phase code is implemented and verified; ensure map edges correspond to real imports/contracts.
- **Patch hint**:
  ```diff
  - | file-browser -> _platform/panel-layout | planned |
  + | file-browser -> _platform/panel-layout | implemented (with referenced import paths) |
  ```

### FT-007: Eliminate reinvention risk for panel abstractions
- **Severity**: MEDIUM
- **File(s)**: /home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/panel-shell.tsx; /home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/left-panel.tsx; /home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx
- **Issue**: New panel components overlap existing file-browser layout/header/path utility behaviors.
- **Fix**: Prefer reuse/extension of existing components/utilities or document justified extraction boundaries.
- **Patch hint**:
  ```diff
  - <PanelHeader ... />
  + <ExistingFileTreeHeader ... />
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
