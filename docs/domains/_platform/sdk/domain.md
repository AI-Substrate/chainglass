# Domain: SDK (`_platform/sdk`)

**Type**: infrastructure
**Status**: active
**C4 Diagram**: [C4 Component](../../../c4/components/_platform/sdk.md)
**Created By**: Plan 047 — USDK
**Parent**: `_platform`

---

## Purpose

The USDK (Us SDK) framework — a client-side internal SDK layer where domains self-publish commands, settings, and keyboard shortcuts to a standardised surface. Provides the command registry, settings store, keybinding resolver, context key service, and the React provider that makes the SDK available to all components.

**This is NOT a plugin system** — only compiled-in domains publish to the SDK.

---

## Contracts (Public API)

| Contract | Type | Description |
|----------|------|-------------|
| `IUSDK` | interface | Top-level SDK facade — commands, settings, context, keybindings, toast |
| `ICommandRegistry` | interface | Register, execute, list, isAvailable for SDK commands |
| `ISDKSettings` | interface | Contribute, get, set, reset, onChange, list for domain settings |
| `IContextKeyService` | interface | Set, get, evaluate when-clause context keys |
| `SDKCommand` | type | Command definition with Zod params, handler, when-clause |
| `SDKSetting` | type | Setting definition with Zod schema, UI hint, section |
| `SDKKeybinding` | type | Keyboard shortcut bound to a command |
| `SDKContribution` | type | Domain's complete static SDK manifest |
| `FakeUSDK` | fake | Test double implementing IUSDK with inspection methods |
| `IKeybindingService` | interface | Register, getBindings, buildTinykeysMap for keyboard shortcuts |

---

## Composition

| Component | Type | Description |
|-----------|------|-------------|
| CommandRegistry | service | In-memory command registration and execution |
| SettingsStore | service | Setting contribution, get/set with onChange listeners |
| ContextKeyService | service | In-memory context key store with when-clause evaluator |
| bootstrapSDK | factory | Creates configured IUSDK instance with wired engines |
| SDKProvider | React context | Provides IUSDK to all client components |
| useSDK | hook | Access IUSDK from any client component |
| useSDKSetting | hook | Subscribe to a setting with auto re-render (useSyncExternalStore) |
| useSDKContext | hook | Set context key on mount, clear on unmount |
| SDKWorkspaceConnector | React component | Bridges workspace data to global SDKProvider |
| useSDKMru | hook | Access MRU tracker with auto-persistence |
| KeybindingService | service | Keybinding registration, when-clause filtering, tinykeys map builder |
| KeyboardShortcutListener | React component | Global tinykeys keyboard listener |

---

## Dependencies

### This Domain Depends On

| Domain | Contract | Why |
|--------|----------|-----|
| (none) | — | SDK framework is self-contained; no domain dependencies |
| `tinykeys` (npm) | tinykeys | Global keyboard shortcut listener engine |

### Domains That Depend On This

| Domain | Contract | Why |
|--------|----------|-----|
| `_platform/settings` | IUSDK, ISDKSettings, SDKSetting | Settings domain consumes SDK to register settings commands and render settings page |
| `_platform/panel-layout` | ICommandRegistry | Hosts command palette UI, reads command list |
| `file-browser` | IUSDK | Publishes commands and settings |
| `_platform/events` | IUSDK | Publishes toast commands |

---

## Source Location

```
packages/shared/src/interfaces/sdk.interface.ts    # Interfaces
packages/shared/src/sdk/types.ts                   # Value types
packages/shared/src/sdk/index.ts                   # Barrel export
packages/shared/src/sdk/tokens.ts                  # DI tokens
packages/shared/src/fakes/fake-usdk.ts             # FakeUSDK
apps/web/src/lib/sdk/command-registry.ts           # CommandRegistry
apps/web/src/lib/sdk/settings-store.ts             # SettingsStore
apps/web/src/lib/sdk/context-key-service.ts        # ContextKeyService
apps/web/src/lib/sdk/sdk-bootstrap.ts              # bootstrapSDK factory
apps/web/src/lib/sdk/sdk-provider.tsx              # SDKProvider + useSDK
apps/web/src/lib/sdk/use-sdk-setting.ts            # useSDKSetting hook
apps/web/src/lib/sdk/use-sdk-context.ts            # useSDKContext hook
apps/web/src/lib/sdk/sdk-workspace-connector.tsx   # SDKWorkspaceConnector
apps/web/src/lib/sdk/mru-tracker.ts                # MruTracker
apps/web/src/lib/sdk/keybinding-service.ts         # KeybindingService
apps/web/src/lib/sdk/keyboard-shortcut-listener.tsx # KeyboardShortcutListener
apps/web/src/lib/sdk/sdk-domain-registrations.ts   # Domain SDK contribution wiring
apps/web/app/actions/sdk-settings-actions.ts       # Settings + MRU persistence server actions
test/contracts/sdk.contract.ts                     # Contract tests
test/unit/web/sdk/                                 # Unit tests
```

---

## History

| Plan | Change | Date |
|------|--------|------|
| 047-usdk Phase 1 | Domain created — interfaces, types, fakes, registry, store, context keys | 2026-02-24 |
| 047-usdk Phase 2 | SDKProvider, bootstrapSDK, React hooks (useSDK, useSDKSetting, useSDKContext), SDKWorkspaceConnector, settings server action | 2026-02-24 |
| 047-usdk Phase 3 | MruTracker, useSDKMru hook, updateSDKMru server action, MRU lifecycle in SDKProvider/SDKWorkspaceConnector | 2026-02-25 |
| 047-usdk Phase 4 | IKeybindingService interface, KeybindingService, FakeKeybindingService, KeyboardShortcutListener, tinykeys integration, default shortcuts (Ctrl+Shift+P, Ctrl+P), sdk.listShortcuts command, hardcoded Ctrl+P removed | 2026-02-25 |
| 047-usdk Phase 6 | Domain SDK contributions wired, go-to-line, developer docs | 2026-02-25 |
