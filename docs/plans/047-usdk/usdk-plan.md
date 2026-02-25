# USDK Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-24
**Spec**: [usdk-spec.md](./usdk-spec.md)
**Status**: DRAFT
**Mode**: Full

---

## Summary

The Chainglass codebase has 6 domains but no unified SDK surface for cross-domain feature discovery, invocation, or configuration. This plan implements the USDK — an internal SDK layer where domains self-publish commands, settings, and keyboard shortcuts to a standardised surface. Users interact through a command palette (Ctrl+Shift+P), configurable keyboard shortcuts, and a domain-organised settings page. The plan creates two new domains (`_platform/sdk`, `_platform/settings`), extends three existing domains, and delivers 34 acceptance criteria across 6 phases.

**Approach**: Foundation-first. SDK types and registry are built with full TDD, then the React provider wires them into the app, then UI surfaces (command palette, settings page) consume them. Existing features are wrapped as SDK commands last, validating the entire publish/consume pattern.

---

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| `_platform/sdk` | **NEW** | create | SDK framework: command registry, keybinding resolver, context keys, types, provider |
| `_platform/settings` | **NEW** | create | Settings store, settings page UI, settings server action. First SDK dogfood. |
| `_platform/panel-layout` | existing | modify | Extend BarHandler chain for command palette (`>` prefix handler) |
| `_platform/events` | existing | modify | Wrap toast() as SDK commands; publish toast.show, toast.dismiss |
| `file-browser` | existing | modify | Publish commands + settings; replace hardcoded Ctrl+P with SDK shortcut |
| `_platform/file-ops` | existing | consume | Used by file-related SDK commands (no changes) |
| `_platform/workspace-url` | existing | consume | Used by navigation commands (no changes) |
| `_platform/viewer` | existing | consume | Used by file display (no changes) |

---

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `packages/shared/src/interfaces/sdk.interface.ts` | `_platform/sdk` | contract | IUSDK, ICommandRegistry, ISDKSettings interfaces (per R-ARCH-002, R-CODE-003) |
| `packages/shared/src/sdk/types.ts` | `_platform/sdk` | contract | SDKCommand, SDKSetting, SDKKeybinding, SDKContribution value types |
| `packages/shared/src/sdk/index.ts` | `_platform/sdk` | contract | Barrel export for SDK types + re-export interfaces |
| `packages/shared/src/sdk/tokens.ts` | `_platform/sdk` | contract | SDK DI tokens |
| `packages/shared/src/fakes/fake-usdk.ts` | `_platform/sdk` | contract | FakeUSDK for consumer/publisher tests |
| `apps/web/src/lib/sdk/command-registry.ts` | `_platform/sdk` | internal | Command registration, execution, listing |
| `apps/web/src/lib/sdk/settings-store.ts` | `_platform/sdk` | internal | Settings contribute/get/set/onChange/hydrate |
| `apps/web/src/lib/sdk/keybinding-adapter.ts` | `_platform/sdk` | internal | tinykeys-based shortcut binding + chord state (per R-CODE-002: adapter suffix for external lib wrapper) |
| `apps/web/src/lib/sdk/context-key-service.ts` | `_platform/sdk` | internal | In-memory context key store + when-clause evaluator |
| `apps/web/src/lib/sdk/sdk-provider.tsx` | `_platform/sdk` | internal | React context provider + bootstrap |
| `apps/web/src/lib/sdk/use-sdk.ts` | `_platform/sdk` | internal | useSDK hook |
| `apps/web/src/lib/sdk/use-sdk-setting.ts` | `_platform/sdk` | internal | useSDKSetting hook (useSyncExternalStore) |
| `apps/web/src/lib/sdk/use-sdk-context.ts` | `_platform/sdk` | internal | useSDKContext hook |
| `apps/web/src/lib/sdk/sdk-bootstrap.ts` | `_platform/sdk` | internal | Domain registration orchestrator |
| `apps/web/src/features/_platform/panel-layout/command-palette-handler.ts` | `_platform/panel-layout` | internal | BarHandler for `>` prefix — command palette mode |
| `apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx` | `_platform/panel-layout` | internal | Dropdown UI for palette results |
| `apps/web/app/actions/sdk-settings-actions.ts` | `_platform/settings` | internal | Server action: updateSDKSettings |
| `apps/web/src/features/settings/components/settings-page.tsx` | `_platform/settings` | internal | Domain-organised settings page |
| `apps/web/src/features/settings/components/setting-control.tsx` | `_platform/settings` | internal | Per-setting UI control renderer |
| `apps/web/src/features/settings/components/settings-sidebar.tsx` | `_platform/settings` | internal | Section navigation sidebar |
| `apps/web/src/features/settings/sdk/contribution.ts` | `_platform/settings` | internal | sdk.openSettings command declaration |
| `apps/web/src/features/settings/sdk/register.ts` | `_platform/settings` | internal | Handler binding |
| `apps/web/src/features/041-file-browser/sdk/contribution.ts` | `file-browser` | internal | file-browser SDK contribution manifest |
| `apps/web/src/features/041-file-browser/sdk/register.ts` | `file-browser` | internal | file-browser handler binding |
| `apps/web/src/features/027-central-notify-events/sdk/contribution.ts` | `_platform/events` | internal | toast SDK contribution manifest |
| `apps/web/src/features/027-central-notify-events/sdk/register.ts` | `_platform/events` | internal | toast handler binding |
| `packages/workflow/src/entities/workspace.ts` | cross-domain | cross-domain | Add sdkSettings, sdkShortcuts, sdkMru to WorkspacePreferences |
| `docs/domains/_platform/sdk/domain.md` | `_platform/sdk` | contract | Domain documentation |
| `docs/domains/_platform/settings/domain.md` | `_platform/settings` | contract | Domain documentation |
| `docs/domains/registry.md` | cross-domain | cross-domain | Add 2 new domains |
| `docs/domains/domain-map.md` | cross-domain | cross-domain | Update mermaid diagram |
| `apps/web/src/lib/sdk/keyboard-shortcut-listener.tsx` | `_platform/sdk` | internal | Global tinykeys keyboard listener component |
| `apps/web/app/(dashboard)/workspaces/[slug]/settings/page.tsx` | `_platform/settings` | internal | Server component settings route entry |
| `apps/web/src/features/settings/components/settings-search.tsx` | `_platform/settings` | internal | Settings search/filter component |
| `docs/how/sdk/publishing-to-sdk.md` | cross-domain | docs | SDK publisher guide |
| `docs/how/sdk/consuming-sdk.md` | cross-domain | docs | SDK consumer guide |
| `docs/how/sdk/settings-domain.md` | cross-domain | docs | Settings domain guide |
| `docs/how/sdk/keyboard-shortcuts.md` | cross-domain | docs | Keyboard shortcuts reference |
| `docs/adr/adr-NNNN-usdk-architecture.md` | cross-domain | docs | USDK architecture decision record |
| `test/unit/web/sdk/command-registry.test.ts` | `_platform/sdk` | test | CommandRegistry unit tests (TDD) |
| `test/unit/web/sdk/settings-store.test.ts` | `_platform/sdk` | test | SettingsStore unit tests (TDD) |
| `test/unit/web/sdk/context-key-service.test.ts` | `_platform/sdk` | test | ContextKeyService unit tests (TDD) |
| `test/contracts/sdk.contract.ts` | `_platform/sdk` | test | SDK contract test factory (fake/real parity) |

---

## Constitution & Architecture Gates

### Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| P1: Clean Architecture | ✅ | SDK interfaces in `shared/interfaces/sdk.interface.ts`, implementations in apps/web |
| P2: Interface-First | ✅ | Interfaces → FakeUSDK → contract tests → real implementation (task order enforced) |
| P3: TDD | ⚠️ Deviation | Hybrid TDD: Full TDD for core (registry, settings store, shortcuts), lightweight for UI wraps |
| P4: Fakes Over Mocks | ✅ | FakeUSDK, FakeCommandRegistry — no mocks |
| P5: Fast Feedback | ✅ | SDK tests are in-memory, sub-second |
| P7: Shared by Default | ✅ | Types in shared, hooks in apps/web (client-only, app-specific) |

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| P3 (TDD): Lightweight testing for UI wraps and settings page | UI wraps are 1-2 line delegations to existing code; full TDD would quadruple test code for trivial pass-through functions | Full TDD for all wraps | Core logic (registry, settings store, shortcuts) gets full TDD with contract tests. Wraps get focused integration tests. |

### Architecture Compliance

| Rule | Status | Notes |
|------|--------|-------|
| R-ARCH-001 (Dependency Direction) | ✅ | SDK hooks import types from shared, not implementations |
| R-ARCH-002 (Interface-First) | ✅ | SDK interfaces in `packages/shared/src/interfaces/sdk.interface.ts` (per R-CODE-003 `.interface.ts` suffix) |
| R-ARCH-003 (DI with useFactory) | ⚠️ Note | Server-side (settings action) uses DI with useFactory. Client-side SDK uses React Context as delivery mechanism — documented in planned ADR (task 6.8) |
| R-ARCH-004 (Package Boundaries) | ✅ | Types shared; hooks app-specific (client-only) |
| R-CODE-003 (File Naming) | ✅ | Interface file uses `.interface.ts` suffix; adapter uses `Adapter` suffix |
| Client/Server Split | ✅ | New subpath export `@chainglass/shared/sdk` for types only. Hooks stay in apps/web. |
| ADR-0008 (Workspace-Scoped Data) | ✅ | SDK settings workspace-scoped in WorkspacePreferences |
| ADR-0009 (Module Registration) | ✅ | SDK domain registration mirrors module registration pattern (`registerXxxSDK(sdk)`) |

---

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | **ExplorerPanel focusInput race**: The `focusInput()` imperative handle sets `editing=true` with a 0ms timeout. If command palette mode activates concurrently, the `processing` flag may trap the input. | Phase 3: Add modal lock to ExplorerPanel. Check `processing === false` before focusInput. Add test for double-focus race. |
| 02 | Critical | **No bar-handlers directory**: BarHandler type exists in `_platform/panel-layout/types.ts` but handlers are inline/scattered. `createFilePathHandler()` is in file-browser services. | Phase 3: Command palette handler follows same pattern — function in `_platform/panel-layout/`, registered via ExplorerPanel props. |
| 03 | High | **No Zod schema for WorkspacePreferences on read**: Adapter deserializes raw JSON without validation. Adding `sdkSettings`/`sdkShortcuts`/`sdkMru` fields is safe on write but stale data could cause runtime errors. | Phase 1: Add optional Zod schema for new SDK fields with `.passthrough()`. Validate in adapter load path. |
| 04 | High | **Barrel import pollution risk**: 97 `'use client'` files in apps/web. Shared package has no client/server subpath split. SDK hooks must NOT leak into shared barrel. | Phase 1: Add `@chainglass/shared/sdk` subpath export for types only. SDK hooks stay in `apps/web/src/lib/sdk/` — never exported from shared. |
| 05 | High | **updateWorkspacePreferences ignores unknown fields**: Server action only accepts emoji/color/starred/sortOrder. SDK settings need a separate persistence path. | Phase 2: Create dedicated `updateSDKSettings` server action that writes sdkSettings atomically. Uses `IWorkspaceService.updatePreferences()` directly (which accepts full `Partial<WorkspacePreferences>`). |
| 06 | High | **NodeEventRegistry pattern reusable**: Map-based registration with Zod validation in 032-node-event-system is 80% of command registry design. | Phase 1: Mirror the register/get/list pattern. Don't import directly (different domain, different types), but use as architectural reference. |
| 07 | Medium | **No tinykeys installed**: No keyboard shortcut library in any package.json. | Phase 4: Install tinykeys in apps/web. Single global listener approach per external research. |
| 08 | Medium | **Hardcoded Ctrl+P uses deprecated navigator.platform**: browser-client.tsx lines 266-282. Two risks: deprecated API and race with SDK palette. | Phase 4: Remove hardcoded handler and replace with SDK-registered shortcut. Feature flag for safe rollout. |

---

## Phases

### Phase 1: SDK Foundation

**Objective**: Create the `_platform/sdk` domain with core types, command registry, settings store, context key service, and full test infrastructure (TDD).
**Domain**: `_platform/sdk` (NEW)
**Delivers**:
- SDK type definitions (SDKCommand, SDKSetting, SDKKeybinding, SDKContribution, IUSDK)
- Command registry (register, execute, list, isAvailable)
- Settings store (contribute, get, set, reset, onChange, hydrate, toPersistedRecord)
- Context key service (set, get, evaluate when-clauses)
- FakeUSDK with inspection methods
- Contract tests for all SDK interfaces
- `@chainglass/shared/sdk` subpath export
- `sdkSettings`, `sdkShortcuts`, `sdkMru` fields on WorkspacePreferences
- Domain documentation and registry updates

**Depends on**: None
**Key risks**: Subpath export may need shared package rebuild. WorkspacePreferences schema extension must be non-breaking.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Create `docs/domains/_platform/sdk/domain.md`, update `docs/domains/registry.md` and `docs/domains/domain-map.md` | `_platform/sdk` | Domain registered with contracts listed | |
| 1.2 | Define SDK interfaces in `packages/shared/src/interfaces/sdk.interface.ts` — IUSDK, ICommandRegistry, ISDKSettings, IContextKeyService | `_platform/sdk` | Interfaces compile, exported via `@chainglass/shared/interfaces` and `@chainglass/shared/sdk` | Per R-ARCH-002, R-CODE-003 |
| 1.3 | Define SDK value types in `packages/shared/src/sdk/types.ts` — SDKCommand, SDKSetting, SDKKeybinding, SDKContribution. Add `@chainglass/shared/sdk` to package.json exports | `_platform/sdk` | Types compile, `import { type SDKCommand } from '@chainglass/shared/sdk'` works | Per finding 04: subpath export |
| 1.4 | Create FakeUSDK in `packages/shared/src/fakes/fake-usdk.ts` with inspection methods (FakeCommandRegistry, FakeSettingsStore, FakeContextKeyService) | `_platform/sdk` | Fakes implement interfaces, inspection methods work | Per constitution P2: fake before real. Per P4: fakes over mocks |
| 1.5 | Create contract test factory `test/contracts/sdk.contract.ts` — runs against both fake and real | `_platform/sdk` | Contract test factory defined, runs against FakeUSDK, all pass | Per constitution P2: tests using fake before real adapter |
| 1.6 | Implement CommandRegistry class (TDD) — Map-based, Zod validation on execute | `_platform/sdk` | Contract tests pass against real: register, execute valid/invalid params, list, list with domain filter | Per finding 06: mirror NodeEventRegistry pattern |
| 1.7 | Implement SettingsStore class (TDD) — hydrate, contribute, get, set, reset, onChange, toPersistedRecord | `_platform/sdk` | Contract tests pass: contribute → get returns default, set → onChange fires, set invalid → throws, reset → default restored, toPersistedRecord only overrides | Per workshop 003 |
| 1.8 | Implement ContextKeyService class (TDD) — set, get, evaluate simple when-clauses | `_platform/sdk` | Contract tests pass: set/get roundtrip, evaluate 'key' → true when set, evaluate '!key' → true when unset | |
| 1.9 | Extend WorkspacePreferences with sdkSettings, sdkShortcuts, sdkMru fields | cross-domain | Existing tests pass, DEFAULT_PREFERENCES includes new empty-object defaults | Per finding 03: additive, non-breaking |

### Acceptance Criteria
- [ ] AC-01: Domain registers command, appears in list
- [ ] AC-02: Command executes with validated params
- [ ] AC-03: Invalid params throw Zod error before handler
- [ ] AC-04: When-clause filters command availability
- [ ] AC-16: Domain contributes setting, appears in list
- [ ] AC-17: get() returns persisted override or schema default
- [ ] AC-19a: SettingsStore.onChange fires callback when value changes (in-memory)
- [ ] AC-20: reset() returns to default, removes override
- [ ] AC-33: FakeUSDK works without server/persistence
- [ ] AC-34: Contract tests verify fake/real parity

---

### Phase 2: SDK Provider & Bootstrap

**Objective**: Wire the SDK into the React app with a provider, bootstrap, and hooks. Create the settings server action for persistence.
**Domain**: `_platform/sdk` + `_platform/settings` (server action)
**Delivers**:
- `<SDKProvider>` React context wrapping the app
- `useSDK`, `useSDKSetting`, `useSDKContext` hooks
- SDK bootstrap function (domain registration orchestrator)
- `updateSDKSettings` server action
- Settings persistence roundtrip (set → persist → rehydrate)

**Depends on**: Phase 1
**Key risks**: Provider mounting order matters — must be inside existing Providers wrapper. Server action needs access to DI container.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Create `apps/web/src/lib/sdk/sdk-provider.tsx` — React context, creates SDK instance, hydrates from server props | `_platform/sdk` | SDKProvider renders children, useSDK returns IUSDK instance | |
| 2.2 | Create `useSDK`, `useSDKSetting`, `useSDKContext` hooks | `_platform/sdk` | useSDKSetting returns [value, setter], re-renders on change via useSyncExternalStore | Per workshop 001 §6 |
| 2.3 | Create `apps/web/src/lib/sdk/sdk-bootstrap.ts` — orchestrates domain registrations | `_platform/sdk` | bootstrapSDK() returns configured IUSDK | |
| 2.4 | Mount `<SDKProvider>` in app layout (inside existing Providers wrapper) | `_platform/sdk` | SDK accessible from any client component via useSDK | Per finding 05: provider mount point |
| 2.5 | Create `apps/web/app/actions/sdk-settings-actions.ts` — updateSDKSettings server action | `_platform/settings` | Persists sdkSettings to workspace preferences, revalidates path | Per finding 05: separate action |
| 2.6 | Wire settings persistence: useSDKSetting setter → SettingsStore.set → server action → disk | `_platform/sdk` + `_platform/settings` | Change a setting → read workspace JSON → value persisted in sdkSettings | |

### Acceptance Criteria
- [ ] AC-18: set() validates, updates in-memory, fires onChange, persists
- [ ] AC-19b: useSDKSetting hook re-renders consuming components on change (via useSyncExternalStore)
- [ ] AC-23: Settings change persists, consuming components update without page refresh

---

### Phase 3: Command Palette

**Objective**: Extend the explorer bar with a command palette mode (`>` prefix) that lists, filters, and executes SDK commands.
**Domain**: `_platform/panel-layout` (modify)
**Delivers**:
- Command palette BarHandler (intercepts `>` prefix)
- Command palette dropdown component (renders filtered command list)
- Keyboard navigation (arrow keys, Enter to select, Escape to exit)
- MRU tracking for palette ordering
- Out-of-scope stubs (`#` prefix, no-prefix search)

**Depends on**: Phase 2 (SDK provider must be mounted)
**Key risks**: ExplorerPanel focusInput race condition (finding 01). Must not break existing file navigation.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Create `command-palette-handler.ts` in `_platform/panel-layout` — BarHandler for `>` prefix | `_platform/panel-layout` | Input starting with `>` activates palette mode, returns true. Other input passes through. | Per finding 02: function in panel-layout |
| 3.2 | Create `command-palette-dropdown.tsx` — renders filtered command list below explorer bar | `_platform/panel-layout` | Shows matching commands, keyboard nav (up/down/enter/escape), MRU ordering | |
| 3.3 | Wire command palette handler into ExplorerPanel handler chain (first position) | `_platform/panel-layout` | `>` prefix shows commands, regular paths still navigate | Per finding 01: modal lock on focusInput |
| 3.4 | Implement MRU tracking — record command execution, persist to sdkMru | `_platform/sdk` | Recently executed commands float to top of palette results | Per spec OQ-3 resolution |
| 3.5 | Create stub handlers for `#` prefix (symbol search) and no-prefix (file search) | `_platform/panel-layout` | `#` shows toast "Symbol search coming later", no-prefix with non-path text shows toast "Search coming soon" | |
| 3.6 | Add `sdk.openCommandPalette` command — focuses explorer bar with `>` prefix | `_platform/sdk` | Calling command focuses bar in palette mode | |

### Acceptance Criteria
- [x] AC-05: Ctrl+Shift+P focuses explorer bar in command mode
- [x] AC-06: Typing with `>` filters commands by title
- [x] AC-07: Selecting command executes it
- [x] AC-08: Escape exits command mode
- [x] AC-09: `#` prefix shows stub message
- [x] AC-10: No-prefix text shows stub message (paths still work)

---

### Phase 4: Keyboard Shortcuts

**Objective**: Add configurable keyboard shortcuts with chord support. Replace the hardcoded Ctrl+P with SDK-managed shortcuts.
**Domain**: `_platform/sdk` (keybinding resolver)
**Delivers**:
- tinykeys integration (global keyboard listener)
- KeybindingResolver with chord state machine (~1000ms timeout)
- When-clause filtering for shortcuts
- Shortcut configuration persistence (sdkShortcuts)
- Removal of hardcoded Ctrl+P handler
- Ctrl+Shift+P bound to openCommandPalette

**Depends on**: Phase 3 (command palette must exist for Ctrl+Shift+P)
**Key risks**: Browser shortcut conflicts. tinykeys may not handle all edge cases.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| ~~4.1~~ | ~~Install tinykeys in apps/web~~ | `_platform/sdk` | ✅ tinykeys ^3.0.0 installed | Complete |
| ~~4.2~~ | ~~Implement KeybindingService — thin layer over tinykeys, when-clause check~~ | `_platform/sdk` | ✅ Contract tests pass (9 per impl) | DYK-P4-01: No chord state machine — tinykeys handles chords |
| ~~4.3~~ | ~~Create `<KeyboardShortcutListener>` client component — mounts tinykeys in SDKProvider~~ | `_platform/sdk` | ✅ Global listener active, shortcuts trigger commands | Mounted in SDKProvider |
| ~~4.4~~ | ~~Register default shortcuts: Ctrl+Shift+P (palette), Ctrl+P (go to file)~~ | `_platform/sdk` | ✅ Both default shortcuts work | DYK-P4-05: Bindings static in bootstrap |
| ~~4.5~~ | ~~Implement shortcut configuration persistence~~ | `_platform/sdk` | ⏭️ Deferred to Phase 5 | DYK-P4-02: Persistence deferred to settings page |
| ~~4.6~~ | ~~Remove hardcoded Ctrl+P from browser-client.tsx~~ | `file-browser` | ✅ Hardcoded handler deleted, SDK shortcut replaces it | DYK-P4-03: CodeMirror guard inline in handler |
| ~~4.7~~ | ~~Add `sdk.listShortcuts` command~~ | `_platform/sdk` | ✅ Command registered, shows in palette | Logs to console + toast |

### Acceptance Criteria
- [x] AC-11: Shortcuts trigger bound commands
- [x] AC-12: Chord sequences supported with ~1000ms timeout
- [x] AC-13: Hardcoded Ctrl+P removed, replaced by SDK shortcut
- [x] AC-14: Shortcuts respect when-clauses
- [x] AC-15: Users can view registered shortcuts
- [x] AC-30: Ctrl+P triggers go-to-file through SDK

---

### Phase 5: Settings Domain & Page

**Objective**: Create the `_platform/settings` domain with a domain-organised settings page that auto-generates controls from contributed schemas.
**Domain**: `_platform/settings` (NEW)
**Delivers**:
- Settings page at `/workspaces/[slug]/settings`
- Auto-generated controls from SDKSetting.ui hints
- Section grouping by domain/section
- Settings search/filter
- `sdk.openSettings` command with Ctrl+, shortcut
- Settings domain documentation

**Depends on**: Phase 2 (settings persistence), Phase 4 (Ctrl+, shortcut)
**Key risks**: Settings page UX may need iteration. Shadcn components must support all ui hint types.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 5.1 | Create `docs/domains/_platform/settings/domain.md`, update registry and domain-map | `_platform/settings` | Domain registered | |
| 5.2 | Create settings page route at `apps/web/app/(dashboard)/workspaces/[slug]/settings/page.tsx` | `_platform/settings` | Server component resolves workspace, passes sdkSettings to client | |
| 5.3 | Create `settings-page.tsx` client component — reads sdk.settings.list(), groups by section | `_platform/settings` | All contributed settings render grouped by section | |
| 5.4 | Create `setting-control.tsx` — renders Switch/Select/Input based on ui hint | `_platform/settings` | Toggle for boolean, select for enum, text input for string, number input for number | Per workshop 003 §7 |
| 5.5 | Create `settings-sidebar.tsx` — section navigation | `_platform/settings` | Clicking section scrolls to that group | |
| 5.6 | Create `settings-search.tsx` — filter settings by label/description | `_platform/settings` | Typing filters visible settings across all sections | |
| 5.7 | Create settings SDK contribution — `sdk.openSettings` command + Ctrl+, binding | `_platform/settings` | Command navigates to settings page | Per workshop 001 §12 |
| 5.8 | Wire `registerSettingsSDK(sdk)` into bootstrap | `_platform/settings` | Settings commands appear in palette | |

### Acceptance Criteria
- [ ] AC-21: Settings page renders all contributed settings grouped by section
- [ ] AC-22: Appropriate control renders per ui hint
- [ ] AC-23: (verified) Settings roundtrip works end-to-end through settings page
- [ ] AC-24: Search filters settings by label/description
- [ ] AC-27: Separate contribution manifest from handler binding

---

### Phase 6: SDK Wraps, Go-to-Line & Polish

**Objective**: Wrap existing features as SDK commands, add go-to-file+line, create stubs, write documentation, and produce ADR.
**Domain**: `file-browser`, `_platform/events` (modify), plus docs
**Delivers**:
- file-browser SDK contribution (openFile, openFileAtLine, copyPath commands + settings)
- events SDK contribution (toast.show, toast.dismiss commands + settings)
- Go to file + line (URL param, path parser, CodeMirror scroll-to-line)
- SDK documentation (README section + docs/how/sdk/ guides)
- ADR for USDK architecture decision

**Depends on**: Phase 1-5
**Key risks**: Go-to-line needs CodeMirror EditorView.dispatch which may not be exposed. Line-number URL param needs nuqs integration.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 6.1 | Create file-browser SDK contribution + register function | `file-browser` | `file-browser.openFile`, `file-browser.openFileAtLine`, `file-browser.copyPath` registered | Per workshop 001 §3.2 |
| 6.2 | Create events SDK contribution + register function | `_platform/events` | `toast.show`, `toast.dismiss` registered, toast handler calls sonner | Per workshop 001 §3.3 |
| 6.3 | Implement go-to-file+line: add `line` URL param, parse `path:42` and `path#L42` syntax | `file-browser` | URL like `?file=src/index.ts&line=42` scrolls CodeMirror to line 42 | |
| 6.4 | Expose CodeMirror scroll-to-line API (EditorView.dispatch with scrollIntoView) | `_platform/viewer` | `file-browser.openFileAtLine` scrolls viewer to specified line | |
| 6.5 | Wire all domain registrations into sdk-bootstrap.ts | `_platform/sdk` | All domain contributions loaded at bootstrap | |
| 6.6 | Add SDK Quick Start section to README.md | docs | Publisher and consumer patterns documented | |
| 6.7 | Create docs/how/sdk/ guides: publishing, consuming, settings, shortcuts | docs | 4 guide files with worked examples | |
| 6.8 | Create ADR for USDK architecture decision | docs | ADR in docs/adr/ explaining SDK vs DI boundary, why not plugins, storage choices | |

### Acceptance Criteria
- [ ] AC-25: file-browser publishes 3+ commands, 2+ settings
- [ ] AC-26: events publishes toast.show, toast.dismiss
- [ ] AC-28: toast.show produces same toast as direct toast()
- [ ] AC-29: file-browser.openFile navigates to file
- [ ] AC-31: openFileAtLine scrolls to specified line
- [ ] AC-32: Explorer bar accepts `path:42` / `path#L42` syntax

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Browser shortcut conflicts (Ctrl+P = Print) | Medium | Medium | tinykeys preventDefault; shortcut config allows user override; document known conflicts |
| ExplorerPanel focusInput race with palette | Medium | High | Modal lock check in Phase 3; focused test coverage |
| Client/server barrel import pollution | Medium | High | SDK types in subpath export; hooks stay in apps/web; never in shared barrel (finding 04) |
| WorkspacePreferences stale data on new fields | Low | Medium | Optional fields with defaults; Zod validation on new fields (finding 03) |
| tinykeys edge cases (international layouts, chords) | Low | Medium | Manual testing matrix; fallback to document unsupported combinations |
| CodeMirror scroll-to-line API not exposed | Low | High | Phase 6 risk; fallback: wrap EditorView.dispatch directly |
| Settings page performance with many settings | Low | Low | Section-based rendering; search reduces visible items |

---

## Rollback Strategy

Per R-EST-004 (CS ≥ 4 requires rollback plan):

**Feature flag**: `USDK_ENABLED` controls all user-facing SDK surfaces. Disabling the flag:
- Hides command palette (`>` prefix handler skips when flag off)
- Disables keyboard shortcut listener (component unmounts)
- Removes settings page from navigation
- Restores hardcoded Ctrl+P handler (conditional on flag)

**Data safety**: The `sdkSettings`, `sdkShortcuts`, `sdkMru` fields on WorkspacePreferences are additive. If USDK is rolled back:
- Fields remain in `workspaces.json` but are ignored (orphaned data, harmless)
- No migration needed — `DEFAULT_PREFERENCES` spreads over missing fields
- Existing preferences (emoji, color, starred) are unaffected

**Per-phase rollback**:
| Phase | Rollback | Impact |
|-------|----------|--------|
| Phase 1 | Delete SDK types/fakes, revert WorkspacePreferences fields | No user impact — nothing deployed |
| Phase 2 | Remove SDKProvider from layout, delete server action | No user impact — SDK was internal-only |
| Phase 3 | Disable palette BarHandler via flag | Users lose command palette, file nav works |
| Phase 4 | Disable KeyboardShortcutListener, restore hardcoded Ctrl+P | Users lose configurable shortcuts, Ctrl+P still works |
| Phase 5 | Remove settings page route | Users lose settings page, preferences unaffected |
| Phase 6 | Remove domain SDK contributions | Commands no longer in palette, features still work via existing UI |

---

## Rollout Strategy

**Feature flag**: `USDK_ENABLED` in feature-flags.ts

| Phase | Flag Behaviour |
|-------|---------------|
| Phase 1-2 | SDK initialises but no user-facing changes |
| Phase 3 | Command palette visible when flag enabled |
| Phase 4 | Keyboard shortcuts active when flag enabled; hardcoded Ctrl+P removed behind flag |
| Phase 5 | Settings page linked in navigation when flag enabled |
| Phase 6 | Flag removed — USDK is the default |

---

## Complexity

**Overall**: CS-4 (large)

| Phase | CS | Rationale |
|-------|-----|-----------|
| Phase 1: SDK Foundation | CS-3 | New types + 3 TDD classes + contract tests. Well-specified via workshops. |
| Phase 2: SDK Provider & Bootstrap | CS-2 | React context + hooks + server action. Standard patterns. |
| Phase 3: Command Palette | CS-3 | BarHandler extension + dropdown UI + MRU. ExplorerPanel race risk. |
| Phase 4: Keyboard Shortcuts | CS-3 | New dependency (tinykeys) + chord state + shortcut config + Ctrl+P migration. |
| Phase 5: Settings Page | CS-3 | New route + auto-generated UI + section grouping + search. |
| Phase 6: Wraps & Polish | CS-3 | 5+ domain contributions + go-to-line + docs + ADR. Wide surface area. |

---

*Plan ready for validation. Run `/plan-4-v2-complete-the-plan` to verify readiness.*
