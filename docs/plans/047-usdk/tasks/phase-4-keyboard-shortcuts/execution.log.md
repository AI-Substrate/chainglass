# Execution Log: Phase 4 — Keyboard Shortcuts

**Started**: 2026-02-25
**Baseline**: 4432 tests passing, `just fft` clean
**Final**: 4450 tests passing

---

## Task Log

### T001: Install tinykeys
- `pnpm add tinykeys` in apps/web → tinykeys ^3.0.0 installed

### T003: IKeybindingService interface + FakeKeybindingService
- Added `IKeybindingService` to `sdk.interface.ts` with `register`, `getBindings`, `buildTinykeysMap`
- Re-exported from `@chainglass/shared/sdk` barrel
- Created `FakeKeybindingService` in `fake-usdk.ts` with map-based pattern
- Updated `createFakeUSDK()` to include `keybindings` field
- Updated `createNoOpSDK()` stub in `sdk-provider.tsx`
- Exported `FakeKeybindingService` from fakes barrel

### T002: KeybindingService
- Created thin registration + when-clause layer in `keybinding-service.ts`
- DYK-P4-01: No custom chord state machine — tinykeys owns chord resolution
- `buildTinykeysMap()` generates handler map with when-clause + isAvailable checks
- Wired into `bootstrapSDK()` as `keybindings` field

### T004: Contract tests
- Added `sdkKeybindingContractTests` factory to `sdk.contract.ts` (9 tests)
- Runs against both FakeKeybindingService and real KeybindingService
- Tests: register, chord, duplicate throw, dispose, buildTinykeysMap (entries, when-clause, availability, execute, args)
- 68 total contract tests (50 existing + 18 new)

### T005: KeyboardShortcutListener
- Created React client component using `tinykeys(window, map)`
- Mounted inside SDKProvider
- Calls `buildTinykeysMap()` with `execute` and `isAvailable` callbacks
- Returns unsubscribe on unmount

### T006: Register default shortcuts
- Registered in bootstrap: `$mod+Shift+KeyP` → `sdk.openCommandPalette`, `$mod+KeyP` → `file-browser.goToFile`
- Registered `file-browser.goToFile` command in browser-client.tsx useEffect (same ref-closure pattern)
- DYK-P4-03: CodeMirror guard is inline in goToFile handler

### T007: Remove hardcoded Ctrl+P
- Deleted the `document.addEventListener('keydown')` useEffect from browser-client.tsx
- Ctrl+P now handled via SDK shortcut → `file-browser.goToFile` command

### T008: Register sdk.listShortcuts
- Registered in bootstrap with `z.object({})` params
- Handler logs bindings to console and shows toast with count

