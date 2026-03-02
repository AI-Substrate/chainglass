# Component: SDK (`_platform/sdk`)

> **Domain Definition**: [_platform/sdk/domain.md](../../../../domains/_platform/sdk/domain.md)
> **Source**: `packages/shared/src/interfaces/sdk.interface.ts` + `apps/web/src/lib/sdk/`
> **Registry**: [registry.md](../../../../domains/registry.md) — Row: SDK

Client-side internal SDK layer where domains publish commands, settings, and keyboard shortcuts. Provides a facade (IUSDK) that unifies command registration, setting contribution, context key evaluation, and keybinding management. Domains register their capabilities at startup; the SDK makes them available to the command palette and keyboard shortcuts.

```mermaid
C4Component
    title Component diagram — SDK (_platform/sdk)

    Container_Boundary(sdk, "SDK") {
        Component(iusdk, "IUSDK", "Interface/Facade", "Top-level SDK facade:<br/>commands, settings, context,<br/>keybindings, toast")
        Component(cmdReg, "CommandRegistry", "Internal Service", "In-memory command store:<br/>register, execute, list,<br/>isAvailable (when-clauses)")
        Component(settingsStore, "SettingsStore", "Internal Service", "Setting contribution store:<br/>contribute, get, set, reset,<br/>onChange listeners")
        Component(ctxKeys, "ContextKeyService", "Internal Service", "Context key store:<br/>set/get boolean context keys<br/>for when-clause evaluation")
        Component(keybindings, "KeybindingService", "Internal Service", "Keybinding registration<br/>via tinykeys library,<br/>maps shortcuts → commands")
        Component(provider, "SDKProvider", "React Provider", "React context providing<br/>IUSDK instance to tree")
        Component(useSDK, "useSDK()", "Hook", "Consumer hook for<br/>accessing SDK facade")
        Component(types, "SDKCommand / SDKSetting", "Types", "Registration types with<br/>Zod params, domain owner,<br/>when-clauses, handlers")
        Component(fakeSDK, "FakeUSDK", "Fake", "Test double for SDK<br/>with assertion helpers")
    }

    Rel(iusdk, cmdReg, "Delegates commands to")
    Rel(iusdk, settingsStore, "Delegates settings to")
    Rel(iusdk, ctxKeys, "Delegates context to")
    Rel(iusdk, keybindings, "Delegates shortcuts to")
    Rel(provider, iusdk, "Provides instance of")
    Rel(useSDK, provider, "Reads from context")
    Rel(cmdReg, ctxKeys, "Evaluates when-clauses via")
    Rel(keybindings, cmdReg, "Executes commands via")
    Rel(fakeSDK, iusdk, "Implements")
```

## Components

| Component | Type | Description |
|-----------|------|-------------|
| IUSDK | Interface/Facade | Top-level SDK: commands, settings, context, keybindings, toast |
| CommandRegistry | Internal Service | In-memory command registration, execution, when-clause filtering |
| SettingsStore | Internal Service | Setting contribution with get/set/reset and onChange listeners |
| ContextKeyService | Internal Service | Boolean context key store for when-clause evaluation |
| KeybindingService | Internal Service | Keybinding registration via tinykeys, maps shortcuts → commands |
| SDKProvider | React Provider | Provides IUSDK instance to React component tree |
| useSDK() | Hook | Consumer hook for accessing SDK facade from components |
| SDKCommand / SDKSetting | Types | Registration types: Zod params, domain owner, when-clauses |
| FakeUSDK | Fake | Test double with assertion helpers |

## External Dependencies

Depends on: tinykeys (npm). No domain dependencies.
Consumed by: _platform/settings, _platform/panel-layout, _platform/events, file-browser, workflow-ui.

---

## Navigation

- **Zoom Out**: [Web App Container](../../containers/web-app.md) | [Container Overview](../../containers/overview.md)
- **Domain**: [_platform/sdk/domain.md](../../../../domains/_platform/sdk/domain.md)
- **Hub**: [C4 Overview](../../README.md)
