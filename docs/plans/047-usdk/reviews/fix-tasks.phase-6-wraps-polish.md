# Fix Tasks: Phase 6 — SDK Wraps, Go-to-Line & Polish

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Clear `line` param on file navigation

- **Severity**: HIGH (F001 + F002)
- **File(s)**:
  - `/home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx`
- **Issue**: The `line` URL param is never cleared when navigating to a new file. After navigating to `file.ts:42`, clicking any other file carries `?line=42` forward, causing it to scroll to line 42.
- **Fix**: In all places where `setParams({ file })` is called to navigate to a file, also set `line: null`. In the `openFileAtLine` handler, always set line explicitly.
- **Patch hint**:
  ```diff
  # In openFileAtLine handler (~line 331):
  -        setParams(
  -          { file: path, ...(line != null ? { line } : {}) },
  -          { history: 'push' },
  -        );
  +        setParams(
  +          { file: path, line: line ?? null },
  +          { history: 'push' },
  +        );
  ```
  Also find all other `setParams({ file: ... })` calls in the file and add `line: null` to each.

### FT-002: Fix infrastructure→business dependency in sdk-bootstrap.ts

- **Severity**: HIGH (F003 + F004)
- **File(s)**:
  - `/home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/sdk-bootstrap.ts`
- **Issue**: `sdk-bootstrap.ts` (infrastructure `_platform/sdk`) imports `registerFileBrowserSDK` from business domain `file-browser` and `registerEventsSDK` from `_platform/events`. This creates an infrastructure→business dependency and a circular dep (file-browser→sdk→file-browser).
- **Fix**: Extract domain registration calls into a separate app-level wiring module (e.g., `sdk-domain-registrations.ts`) that is NOT part of the `_platform/sdk` domain. The bootstrap function should accept registrations as a parameter or the caller should invoke them after bootstrap.
- **Patch hint**:
  ```diff
  # sdk-bootstrap.ts — remove imports and calls:
  -import { registerEventsSDK } from '@/features/027-central-notify-events/sdk/register';
  -import { registerFileBrowserSDK } from '@/features/041-file-browser/sdk/register';
  ...
  -  // Phase 6: Domain registrations (ADR-0009 pattern)
  -  registerFileBrowserSDK(sdk);
  -  registerEventsSDK(sdk);
  -
     return sdk;

  # New file: apps/web/src/lib/sdk/sdk-domain-registrations.ts
  +import type { IUSDK } from '@chainglass/shared/sdk';
  +import { registerEventsSDK } from '@/features/027-central-notify-events/sdk/register';
  +import { registerFileBrowserSDK } from '@/features/041-file-browser/sdk/register';
  +
  +/** App-level wiring — calls domain registration functions. */
  +export function registerAllDomains(sdk: IUSDK): void {
  +  registerFileBrowserSDK(sdk);
  +  registerEventsSDK(sdk);
  +}
  ```
  Then call `registerAllDomains(sdk)` from the SDK provider or wherever `bootstrapSDK()` is called.

### FT-003: Add parseLineSuffix unit tests

- **Severity**: HIGH (F005)
- **File(s)**:
  - `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/services/file-path-handler.ts` — export `parseLineSuffix`
  - `/home/jak/substrate/041-file-browser/test/unit/web/features/file-path-handler.test.ts` — add tests
- **Issue**: `parseLineSuffix` is a pure function with clear edge cases but zero test coverage. The spec explicitly identified this as a TDD candidate.
- **Fix**: Export `parseLineSuffix` and add unit tests:
  1. `"src/index.ts:42"` → `{ cleanPath: "src/index.ts", line: 42 }`
  2. `"src/index.ts#L42"` → `{ cleanPath: "src/index.ts", line: 42 }`
  3. `"src/index.ts"` → `null` (no suffix)
  4. `"src/index.ts:abc"` → `null` (non-numeric)
  5. `"2024-01-15T10:30:00.log"` → `null` (timestamp with colons — should NOT match, but check if it does since `:00` is numeric. This IS actually a potential bug — `:00` is numeric, so `parseLineSuffix` would return `{ cleanPath: "2024-01-15T10:30", line: 0 }` but `line: 0` fails the `line > 0` check in code-editor.tsx. Still, the path-first resolution in the handler should catch this if the full filename exists.)
  6. `"src/index.ts:0"` → Returns `{ cleanPath: "src/index.ts", line: 0 }` — line 0 is invalid (1-based), verify handling

### FT-004: Complete execution log

- **Severity**: HIGH (F006)
- **File(s)**:
  - `/home/jak/substrate/041-file-browser/docs/plans/047-usdk/tasks/phase-6-wraps-polish/execution.log.md`
- **Issue**: Execution log stops at T006. Missing T007 entry for ADR-0013. No post-implementation `just fft` evidence.
- **Fix**: Add T007 entry confirming ADR-0013 creation. Run `just fft` and record pass count. Add closing verification section.

## Medium Fixes

### FT-005: Pass scrollToLine in preview mode

- **Severity**: MEDIUM (F007)
- **File(s)**:
  - `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx`
  - `/home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx`
- **Issue**: `scrollToLine` is only passed to CodeEditor in `edit` mode. The default mode is `preview`, so go-to-line is broken in the default UX.
- **Fix**: Either (a) auto-switch to `edit` mode when `scrollToLine` is set (simplest — set `mode: 'edit'` in URL params when line is detected), or (b) pass `scrollToLine` to the preview renderer too (requires Shiki scroll support).
- **Patch hint** (option a — auto-switch to edit):
  ```diff
  # In browser-client.tsx, after setting line param:
  +if (line != null) {
  +  setParams({ mode: 'edit' }, { history: 'replace' });
  +}
  ```

### FT-006: Add goToFile to file-browser contribution manifest

- **Severity**: MEDIUM (F008)
- **File(s)**:
  - `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/sdk/contribution.ts`
- **Issue**: AC-25 requires ≥3 commands. Only 2 in manifest. `goToFile` registered ad-hoc in Phase 3 without manifest entry, violating AC-27.
- **Fix**: Add `goToFile` entry to `fileBrowserContribution.commands` (no handler — handlers bound separately).
- **Patch hint**:
  ```diff
  +    {
  +      id: 'file-browser.goToFile',
  +      title: 'Go to File',
  +      domain: 'file-browser',
  +      category: 'Navigation',
  +      params: z.object({}),
  +      icon: 'file-search',
  +    },
  ```

### FT-007: Update domain documentation

- **Severity**: MEDIUM (F010–F013)
- **File(s)**:
  - `/home/jak/substrate/041-file-browser/docs/domains/domain-map.md`
  - `/home/jak/substrate/041-file-browser/docs/domains/_platform/sdk/domain.md`
  - `/home/jak/substrate/041-file-browser/docs/domains/file-browser/domain.md`
  - `/home/jak/substrate/041-file-browser/docs/domains/_platform/events/domain.md`
- **Issue**: Domain map has stale dashed "future" arrows. Three domain.md files missing Phase 6 history, source entries, and dependency updates.
- **Fix**:
  1. domain-map.md: Change `-.->` to `-->` for file-browser→sdk and events→sdk edges. Remove "future phases" comment.
  2. sdk/domain.md: Add Phase 6 history row.
  3. file-browser/domain.md: Add Phase 6 history row, `sdk/contribution.ts` and `sdk/register.ts` to source table, `_platform/sdk` to dependencies.
  4. events/domain.md: Add Phase 6 history row, `sdk/contribution.ts` and `sdk/register.ts` to source table, `_platform/sdk` to dependencies.

### FT-008: Add go-to-line tests to file-path-handler.test.ts

- **Severity**: MEDIUM (F014)
- **File(s)**:
  - `/home/jak/substrate/041-file-browser/test/unit/web/features/file-path-handler.test.ts`
- **Issue**: 10 existing tests, zero cover Phase 6 go-to-line behavior.
- **Fix**: Add tests:
  1. `path:42` calls `onLineDetected(42)` and navigates to file
  2. `path#L42` calls `onLineDetected(42)` and navigates to file
  3. Full-path-that-exists with `:42` suffix navigates to full path first (path-first resolution)
  4. Non-numeric suffix `path:abc` returns false

## Low Fixes

### FT-009: Memoize handleCreateEditor callback

- **Severity**: LOW (F015)
- **File(s)**: `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/code-editor.tsx`
- **Issue**: `handleCreateEditor` inline function creates new reference each render.
- **Fix**: Wrap in `useCallback` or use ref pattern for `scrollToLine`.

## Re-Review Checklist

- [ ] All critical/high fixes applied (FT-001 through FT-004)
- [ ] All medium fixes applied (FT-005 through FT-008)
- [ ] `just fft` passes with test count recorded
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
