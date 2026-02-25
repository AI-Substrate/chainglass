# Fix Tasks: Phase 1: Panel Infrastructure

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Fix ExplorerPanel edit/display state sync
- **Severity**: HIGH
- **File(s)**: /home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx
- **Issue**: Component can remain in input mode after `filePath` transitions from empty to non-empty.
- **Fix**: Add state reconciliation so external `filePath` updates restore display mode when not actively editing by user intent.
- **Patch hint**:
  ```diff
  - const [editing, setEditing] = useState(!filePath);
  + const [editing, setEditing] = useState(false);
  + useEffect(() => {
  +   if (filePath && editing && !processing) {
  +     setEditing(false);
  +   }
  + }, [filePath, editing, processing]);
  ```

### FT-002: Complete ExplorerPanel verification coverage
- **Severity**: HIGH
- **File(s)**: /home/jak/substrate/041-file-browser/test/unit/web/features/_platform/panel-layout/explorer-panel.test.tsx
- **Issue**: Missing explicit checks for blur revert, spinner behavior, and select-all behavior expected by Phase 1 tasks.
- **Fix**: Add dedicated tests/assertions for those behaviors; keep behavior-focused and deterministic.
- **Patch hint**:
  ```diff
  + it('reverts to display mode on blur', async () => { ... })
  + it('shows spinner while handlers are processing', async () => { ... })
  + it('focusInput selects all text', () => { ... })
  ```

### FT-003: Resolve doctrine mismatch on mocking primitives
- **Severity**: HIGH
- **File(s)**:
  - /home/jak/substrate/041-file-browser/test/unit/web/features/_platform/panel-layout/panel-header.test.tsx
  - /home/jak/substrate/041-file-browser/test/unit/web/features/_platform/panel-layout/explorer-panel.test.tsx
  - /home/jak/substrate/041-file-browser/test/unit/web/features/_platform/panel-layout/left-panel.test.tsx
- **Issue**: `vi.fn()` usage conflicts with R-TEST-007 in current project rules.
- **Fix**: Either migrate to fake objects/helpers or update project rule documentation to explicitly allow UI callback spies in this test layer.
- **Patch hint**:
  ```diff
  - const onCopy = vi.fn()
  + const onCopy = createFakeCallbackRecorder()
  ```

## Medium / Low Fixes

### FT-004: Align domain map edge status with implemented code
- **Severity**: MEDIUM
- **File(s)**: /home/jak/substrate/041-file-browser/docs/domains/domain-map.md
- **Issue**: Map edges currently represent planned Phase 3 consumption as active.
- **Fix**: Mark those edges as planned/future (or defer adding until code imports exist).
- **Patch hint**:
  ```diff
  - fileBrowser -->|"PanelShell..."| panels
  + %% planned in Plan 043 Phase 3
  + %% fileBrowser -->|"PanelShell..."| panels
  ```

### FT-005: Strengthen execution evidence for Full TDD
- **Severity**: MEDIUM
- **File(s)**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-1-panel-infrastructure/execution.log.md
- **Issue**: Evidence is summary-only, missing traceable RED→GREEN command outputs.
- **Fix**: Append concrete command snippets and outputs tied to each task.
- **Patch hint**:
  ```diff
  + ### T005 RED
  + pnpm vitest test/unit/web/features/_platform/panel-layout/explorer-panel.test.tsx -t "shows spinner"
  + # failing output ...
  + ### T006 GREEN
  + pnpm vitest test/unit/web/features/_platform/panel-layout/explorer-panel.test.tsx
  + # passing output ...
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
