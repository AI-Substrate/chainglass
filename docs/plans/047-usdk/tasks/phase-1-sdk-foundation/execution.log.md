# Phase 1: SDK Foundation — Execution Log

**Phase**: 1 of 6
**Started**: 2026-02-24T22:27Z
**Status**: Complete

---

## Task Log

### T001: Domain Documentation ✅
- Created `docs/domains/_platform/sdk/domain.md` with contracts, composition, dependencies, source locations
- Added `_platform/sdk` row to `docs/domains/registry.md`
- Updated `docs/domains/domain-map.md` with SDK node and dashed dependency edges

### T002: SDK Interfaces ✅
- Created `packages/shared/src/interfaces/sdk.interface.ts` with IUSDK, ICommandRegistry, ISDKSettings, IContextKeyService
- DYK-02: Documented referential stability on get() JSDoc
- DYK-03: IUSDK has toast convenience methods; provider accepts lazy persistence callback (Phase 2)
- Re-exported from `packages/shared/src/interfaces/index.ts`

### T003: SDK Value Types + Subpath Export ✅
- Created `packages/shared/src/sdk/types.ts` — SDKCommand, SDKSetting, SDKKeybinding, SDKContribution
- Created `packages/shared/src/sdk/index.ts` — barrel re-exporting interfaces + types
- Created `packages/shared/src/sdk/tokens.ts` — SDK_DI_TOKENS
- Added `"./sdk"` subpath to `packages/shared/package.json`
- `pnpm build` in shared succeeds

### T004: FakeUSDK ✅
- Created `packages/shared/src/fakes/fake-usdk.ts` — FakeCommandRegistry, FakeSettingsStore, FakeContextKeyService, createFakeUSDK()
- DYK-01: FakeCommandRegistry.register() throws on duplicate ID
- DYK-05: FakeCommandRegistry.execute() wraps handler in try/catch
- Exported from `packages/shared/src/fakes/index.ts`

### T005: Contract Test Factory ✅
- Created `test/contracts/sdk.contract.ts` — sdkCommandRegistryContractTests, sdkSettingsStoreContractTests, sdkContextKeyContractTests
- 23 contract tests per implementation (7 command, 9 settings, 7 context key)
- DYK-01: Duplicate-ID test included
- DYK-02: Referential stability test included
- All 23 tests pass against FakeUSDK

### T006: CommandRegistry (TDD) ✅
- Created `apps/web/src/lib/sdk/command-registry.ts`
- DYK-01: Throws on duplicate ID
- DYK-05: execute() wraps handler in try/catch with onError callback
- isAvailable() delegates when-clause evaluation to IContextKeyService
- All 23 contract tests pass against real implementation

### T007: SettingsStore (TDD) ✅
- Created `apps/web/src/lib/sdk/settings-store.ts`
- DYK-02: get() returns stable references (no defensive copies)
- hydrate → contribute ordering works correctly
- toPersistedRecord() exports only overrides

### T008: ContextKeyService (TDD) ✅
- Created `apps/web/src/lib/sdk/context-key-service.ts`
- Supports: 'key' (truthy), '!key' (negation), 'key == value' (equality)
- onChange fires on every set()

### T009: WorkspacePreferences Extension ✅
- Added sdkSettings, sdkShortcuts, sdkMru to WorkspacePreferences interface
- Updated DEFAULT_PREFERENCES with empty defaults
- All 4416 existing tests pass — no regression

---

## Evidence

- `pnpm --filter @chainglass/shared build` — clean (0 errors)
- `pnpm test -- test/contracts/sdk.contract.test.ts` — 46 tests passed (23 fake + 23 real)
- `pnpm test` — 4416 passed, 72 skipped, 0 failed