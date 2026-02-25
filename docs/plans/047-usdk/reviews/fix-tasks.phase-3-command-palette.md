# Fix Tasks: Phase 3 — Command Palette

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Add `processing` guard to `openPalette()` and `focusInput()`
- **Severity**: HIGH
- **File(s)**: `/home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx`
- **Issue**: Plan Finding 01 (Critical) flagged the `processing` race condition but neither `openPalette()` nor `focusInput()` check `processing`. If a handler chain is mid-flight, opening the palette will set `editing=true` and `inputValue='>'`, but when `handleSubmit` finishes it sets `editing=false` — immediately exiting the palette.
- **Fix**: Add `if (processing) return;` at the top of both imperative handle methods.
- **Patch hint**:
  ```diff
       focusInput: () => {
  +      if (processing) return;
         setEditing(true);
         setInputValue(filePath);
  ```
  ```diff
       openPalette: () => {
  -      if (!sdk) return;
  +      if (!sdk || processing) return;
         setEditing(true);
  ```

### FT-002: Wrap `handlePaletteExecute` in try/catch
- **Severity**: HIGH
- **File(s)**: `/home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx`
- **Issue**: `sdk.commands.execute(commandId)` throws if the command ID is not registered. The handler chain in `handleSubmit` wraps in try/finally, but the palette path does not.
- **Fix**: Wrap in try/catch with toast.error fallback. Always exit palette in finally.
- **Patch hint**:
  ```diff
       const handlePaletteExecute = useCallback(
         async (commandId: string) => {
           if (!sdk) return;
  -        await sdk.commands.execute(commandId);
  -        onCommandExecute?.(commandId);
  -        exitPaletteMode();
  +        try {
  +          await sdk.commands.execute(commandId);
  +          onCommandExecute?.(commandId);
  +        } catch (error) {
  +          console.error('[CommandPalette] Execute failed:', error);
  +        } finally {
  +          exitPaletteMode();
  +        }
         },
         [sdk, onCommandExecute, exitPaletteMode]
       );
  ```

### FT-003: Populate execution log with evidence
- **Severity**: HIGH
- **File(s)**: `/home/jak/substrate/041-file-browser/docs/plans/047-usdk/tasks/phase-3-command-palette/execution.log.md`
- **Issue**: Execution log is completely empty — zero evidence for any of 7 tasks (T000–T006).
- **Fix**: Run `just fft` and record results. Document per-task evidence: what changed, how verified, output/screenshots. Record test count baseline and delta.

## Medium Fixes

### FT-004: Add ARIA roles to command palette dropdown
- **Severity**: MEDIUM
- **File(s)**: `/home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx`
- **Issue**: Items use `aria-selected` but container lacks `role="listbox"` and items lack `role="option"`.
- **Fix**: Add ARIA roles.
- **Patch hint**:
  ```diff
  -          <div ref={listRef} className="py-1">
  +          <div ref={listRef} role="listbox" className="py-1">
               {commands.map((cmd, index) => (
                 <div
                   key={cmd.id}
  +               role="option"
                   aria-selected={index === selectedIndex}
  ```

### FT-005: Fix Tab key swallowed in palette mode
- **Severity**: MEDIUM
- **File(s)**: `/home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx`
- **Issue**: All keyDown events are delegated to dropdown and early-returned. Keys the dropdown doesn't handle (Tab, Home, End) are silently consumed.
- **Fix**: Only delegate specific keys to the dropdown; let others propagate.
- **Patch hint**:
  ```diff
       const handleKeyDown = useCallback(
         (e: React.KeyboardEvent<HTMLInputElement>) => {
  -        // In command palette mode (> prefix): delegate all keys to dropdown
           if (paletteMode) {
  -          dropdownRef.current?.handleKeyDown(e);
  -          return;
  +          // Only delegate palette-specific keys to dropdown
  +          if (['Escape', 'ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
  +            dropdownRef.current?.handleKeyDown(e);
  +            return;
  +          }
           }
  ```

### FT-006: Change search fallback to `toast.info()`
- **Severity**: MEDIUM
- **File(s)**: `/home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx`
- **Issue**: `context.showError('Search coming soon')` uses error toast for informational message. Inconsistent with `toast.info()` in stub-handlers.ts.
- **Fix**: Import toast from sonner and use `toast.info()` directly, or add a `showInfo` method to BarContext.
- **Patch hint**:
  ```diff
  -        context.showError('Search coming soon');
  +        toast.info('Search coming soon');
  ```
  (Add `import { toast } from 'sonner';` at top if not already imported)

### FT-007: Fix contract-import violation for MruTracker
- **Severity**: MEDIUM
- **File(s)**: `/home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx`, `/home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx`
- **Issue**: `panel-layout` imports `MruTracker` directly from `@/lib/sdk/mru-tracker` (SDK internal file).
- **Fix**: Re-export `type { MruTracker }` from `sdk-provider.tsx` (it already imports MruTracker). Then update both imports to use `@/lib/sdk/sdk-provider`.
- **Patch hint**:
  In `sdk-provider.tsx`, add at bottom:
  ```diff
  + export type { MruTracker } from './mru-tracker';
  ```
  In both consumer files, change:
  ```diff
  - import type { MruTracker } from '@/lib/sdk/mru-tracker';
  + import type { MruTracker } from '@/lib/sdk/sdk-provider';
  ```

### FT-008: Update domain.md files for Phase 3
- **Severity**: MEDIUM
- **File(s)**: `/home/jak/substrate/041-file-browser/docs/domains/_platform/panel-layout/domain.md`, `/home/jak/substrate/041-file-browser/docs/domains/_platform/sdk/domain.md`
- **Issue**: Neither domain.md has Phase 3 history, source location, or composition updates.
- **Fix**: Add Phase 3 rows to History tables, add new files to Source Location, add new components to Composition, update Dependencies.

### FT-009: Add lightweight tests for UI components
- **Severity**: MEDIUM
- **File(s)**: New test files
- **Issue**: No tests for command-palette-dropdown.tsx (210 LOC), stub-handlers.ts, or ExplorerPanel palette mode.
- **Fix**: Add at minimum:
  1. `test/unit/web/features/panel-layout/stub-handlers.test.ts` — 2 tests: `#` intercept returns true with toast, non-`#` returns false
  2. `test/unit/web/lib/sdk/mru-tracker.test.ts` already exists (7 tests) — adequate
  3. Document manual verification steps in execution log for dropdown/palette mode if not adding component tests

## Low Fixes (Optional)

### FT-010: Merge split imports
- **File(s)**: `command-palette-dropdown.tsx:17-18`, `browser-client.tsx:37-38`
- **Fix**: Combine duplicate imports from same module into single import statement.

### FT-011: Update domain-map.md
- **File(s)**: `/home/jak/substrate/041-file-browser/docs/domains/domain-map.md`
- **Fix**: Change `panels -.->` to `panels -->` (solid arrow — palette is implemented). Update panels node label.

### FT-012: Add `navigator.platform` deprecation comment
- **File(s)**: `browser-client.tsx:290`
- **Fix**: Add comment noting deprecation, matching pattern in agent-chat-input.tsx.

## Re-Review Checklist

- [ ] F001: `processing` guard added to `openPalette()` and `focusInput()`
- [ ] F002: `handlePaletteExecute` wrapped in try/catch/finally
- [ ] F003: Execution log populated with evidence
- [ ] F004: ARIA roles added to dropdown
- [ ] F005: Only palette keys delegated, others propagate
- [ ] F006: Search fallback uses `toast.info()` not `toast.error()`
- [ ] F007: MruTracker imported via SDK public export
- [ ] F008: domain.md files updated for Phase 3
- [ ] Re-run `/plan-7-v2-code-review --phase "Phase 3: Command Palette" --plan /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-plan.md` and achieve zero HIGH/CRITICAL
