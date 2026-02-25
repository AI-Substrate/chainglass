# Execution Log: Phase 3 — Command Palette

**Started**: 2026-02-25
**Baseline**: 4423 tests passing, `just fft` clean
**Final**: 4432 tests passing, `just fft` clean

---

## Task Log

### T000: Reposition ExplorerPanel as centered command bar
- Restyled outer wrapper: `flex justify-center border-b bg-muted/30 shrink-0 px-4 py-1.5`
- Inner bar: `relative flex items-center gap-1.5 w-full max-w-2xl rounded-lg border bg-background px-3 py-1 shadow-sm`
- Verified: all existing file navigation works, bar is visually centered

### T001: Palette mode detection via onChange
- Added `paletteMode = editing && inputValue.startsWith('>') && !!sdk` as derived state
- `paletteFilter = inputValue.slice(1).trim()` for downstream filtering
- Handler chain bypassed when paletteMode is true

### T002: CommandPaletteDropdown
- Created multi-mode dropdown component with forwardRef + useImperativeHandle
- Three modes: `commands` (MRU-sorted filtered command list), `symbols` (stub), `search` (hints)
- `filterAndSort()` utility: MRU first, then alphabetical, filtered by title substring
- DYK-P3-02: `onMouseDown={e.preventDefault()}` on container prevents blur

### T003: Wire into ExplorerPanel
- Extended `ExplorerPanelHandle` with `openPalette()`
- Added `sdk`, `mru`, `onCommandExecute` props to ExplorerPanelProps
- Keyboard delegation: palette-specific keys (Escape/Arrow/Enter) delegated to dropdown
- Search fallback: `toast.info('Search coming soon')` replaces `showError('Not found: X')`
- Dropdown renders inside bar container for absolute positioning

### T004: MRU Tracker
- Created `MruTracker` class: `recordExecution()`, `getOrder()`, `toArray()`
- Caps at 20 items, deduplicates on record
- Extended SDKProvider with MRU lifecycle (useSDKMru hook, persistMruFn)
- Extended SDKWorkspaceConnector with sdkMru prop + persistMru action
- Created `updateSDKMru` server action
- 7 unit tests

### T005: Stub handlers
- Created `createSymbolSearchStub()` BarHandler — `#` prefix → `toast.info()` + return true
- 2 unit tests (FT-009)

### T006: Register sdk.openCommandPalette
- Registered via useEffect in browser-client.tsx with `z.object({})` params
- Handler: `explorerRef.current?.openPalette()` (closure over ref)
- Dispose on unmount
- Hidden from palette results to avoid circular UX

## Review Fixes Applied

| Fix | Description |
|-----|-------------|
| FT-001 | Added `if (processing) return` guard to both `focusInput()` and `openPalette()` |
| FT-002 | Wrapped `handlePaletteExecute` in try/catch/finally — always exits palette |
| FT-003 | This execution log |
| FT-004 | Added `role="listbox"` + `role="option"` + `tabIndex={-1}` to dropdown |
| FT-005 | Only palette keys (Escape/Arrow/Enter) delegated; others propagate |
| FT-006 | Changed search fallback from `showError()` to `toast.info()` |
| FT-007 | Re-exported `MruTracker` type from `sdk-provider.tsx`; updated consumer imports |
| FT-008 | Updated panel-layout and sdk domain.md files with Phase 3 history/composition |
| FT-009 | Added 2 stub-handlers tests |
| FT-010 | Merged split imports in dropdown and browser-client |

## Discoveries

| Discovery | Resolution |
|-----------|------------|
| `z.object({}).parse(undefined)` throws ZodError | Default `params ?? {}` in both real and fake CommandRegistry |
| `sdk.openCommandPalette` circular in palette | Filter it out of dropdown results |
| Folder navigate doesn't scroll into view | Added `data-tree-path` attr + scrollIntoView with green flash animation |
