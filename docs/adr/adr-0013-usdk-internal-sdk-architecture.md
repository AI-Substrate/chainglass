---
title: "ADR-0013: USDK Internal SDK Architecture"
status: "Accepted"
date: "2026-02-25"
authors: "Platform Team"
tags: ["architecture", "decision", "sdk", "cross-domain", "command-palette", "keyboard-shortcuts", "settings"]
supersedes: ""
superseded_by: ""
---

# ADR-0013: USDK Internal SDK Architecture

## Status

Accepted

## Context

The Chainglass web application has 8 domains but no unified surface for cross-domain feature discovery, invocation, or configuration. Users cannot discover available actions without knowing which page to visit. Developers wire cross-domain interactions ad-hoc — a hardcoded `document.addEventListener('keydown')` for Ctrl+P, direct `toast()` calls scattered across features, and no way for a domain to declare its capabilities to the rest of the system.

VS Code solves this with an extension API where extensions publish commands, settings, and keybindings to a standardised surface. We need a similar pattern, but scoped to an internal monorepo (no runtime plugin loading) and compatible with Next.js 16 App Router + React Server Components.

Key constraints: (1) React Server Components cannot use hooks or browser APIs — the SDK must be client-side only. (2) DI already handles server-side service wiring via tsyringe — the SDK must complement, not replace DI. (3) Workspace-scoped settings already persist in WorkspacePreferences — the SDK must extend, not duplicate storage. (4) The existing BarHandler chain in ExplorerPanel must not break.

## Decision

We introduce the USDK (Us SDK) — a client-side internal SDK layer where domains self-publish commands, settings, and keyboard shortcuts to a standardised surface. The SDK provides three user-facing surfaces: a command palette (Ctrl+Shift+P), configurable keyboard shortcuts (via tinykeys), and a domain-organised settings page. Domains contribute to the SDK at bootstrap time via `registerXxxSDK(sdk)` functions following ADR-0009.

The SDK is structured as: interfaces and types in `@chainglass/shared/sdk` (subpath export to prevent barrel pollution), real implementations in `apps/web/src/lib/sdk/`, React context delivery via `<SDKProvider>` at the app root, and workspace data bridged imperatively via `<SDKWorkspaceConnector>`.

The boundary between SDK and DI is: DI handles server-side service-to-service wiring (adapters, repositories, business logic); SDK handles user-facing cross-domain feature consumption (command palette, shortcuts, settings UI). A button that navigates to a file uses the SDK. A service that reads a file uses DI.

## Consequences

**Positive**

- **POS-001**: Domains self-publish capabilities to a discoverable surface — users find features through the command palette instead of memorising UI locations.
- **POS-002**: Keyboard shortcuts are centralised and conflict-aware — replacing scattered `document.addEventListener` calls with a single tinykeys listener that respects when-clauses.
- **POS-003**: Settings are typed, validated, and auto-rendered — domains declare a Zod schema and UI hint, the settings page generates the control. No per-setting UI code.
- **POS-004**: Cross-domain consumption uses a stable contract — domains import `IUSDK` from shared, not each other's internals. Domain boundaries stay crisp.
- **POS-005**: The SDK is testable via FakeUSDK — contract tests run against both fake and real implementations, ensuring fake/real parity.

**Negative**

- **NEG-001**: Adds a new abstraction layer — developers must learn when to use SDK vs DI vs direct imports.
- **NEG-002**: Client-side only — server-side code cannot register or execute SDK commands directly. Server operations must go through server actions called from SDK command handlers.
- **NEG-003**: Workspace-scoped settings only — no user-global or cross-device settings in v1. Switching workspaces resets SDK state.
- **NEG-004**: Bootstrap ordering matters — commands registered via `useEffect` in components are only available while those components are mounted. Static bindings in bootstrap may reference commands that don't exist yet.

## Alternatives Considered

### Alternative 1: Extend DI to cover user-facing features

- **ALT-001**: **Description**: Register commands and settings as DI services. Use the existing tsyringe container to resolve cross-domain features. Command palette queries the container.
- **ALT-002**: **Rejection Reason**: DI is server-side (tsyringe with factory registration). React hooks can't resolve from the DI container. Commands need browser APIs (DOM, keyboard events) that don't exist on the server. Mixing user-facing UI concerns into the DI container violates separation of concerns.

### Alternative 2: Event bus / pub-sub pattern

- **ALT-003**: **Description**: Domains publish and subscribe to events via a global event bus. Command palette listens for "command:registered" events. No registry — just fire-and-forget messages.
- **ALT-004**: **Rejection Reason**: Event bus has no type safety for command parameters (Zod validation), no conflict detection for keyboard shortcuts, no structured settings with UI hints. Discoverability requires convention over contract. Prior experience with loose event systems in the codebase (SSE routing) showed the need for structured registries.

### Alternative 3: Plugin system with dynamic loading

- **ALT-005**: **Description**: Define a plugin manifest format. Plugins loaded at runtime from a registry. Full isolation, hot-reloading support.
- **ALT-006**: **Rejection Reason**: Massive over-engineering for an internal monorepo with 8 domains. Runtime loading adds security concerns, performance overhead, and version compatibility issues. All code is compile-time available. The spec explicitly lists "Not a plugin system" as a non-goal.

### Alternative 4: Direct cross-domain imports

- **ALT-007**: **Description**: Keep the status quo. Domains import each other's functions directly. No registry, no palette, no unified settings.
- **ALT-008**: **Rejection Reason**: Creates tight coupling between domains. Adding a new feature requires every consumer to update imports. No discoverability — users must know where features live. The hardcoded Ctrl+P handler is a symptom of this approach.

## Implementation Notes

- **IMP-001**: SDK types use a dedicated subpath export (`@chainglass/shared/sdk`) to prevent barrel pollution — client-side SDK hooks must never leak into server-side shared imports (Plan Finding 04).
- **IMP-002**: tinykeys chosen as keyboard shortcut engine for its layout-independent `code` property, built-in chord support with configurable timeout, and minimal bundle size. Chords are space-separated (`$mod+k $mod+c`) with ~1000ms timeout — tinykeys handles the state machine, not us (DYK-P4-01).
- **IMP-003**: Settings persist as `sdkSettings: Record<string, unknown>` inside existing WorkspacePreferences (ADR-0008). Additive field — no migration needed. Shortcuts persist separately in `sdkShortcuts` (OQ-1 resolution).
- **IMP-004**: SDKProvider is mounted at the app root. Workspace data flows in imperatively via SDKWorkspaceConnector (React props can't flow up the tree). Bootstrap failure returns a no-op stub — the app never crashes due to SDK issues.
- **IMP-005**: Domain registration follows ADR-0009 pattern: `registerXxxSDK(sdk: IUSDK)` functions called in bootstrapSDK. Commands that need React component refs register via `useEffect` in the owning component instead.
- **IMP-006**: Rollback via USDK_ENABLED feature flag. Disabling hides command palette, unmounts keyboard listener, removes settings page. Existing features continue working through their original UI paths.

## References

- **REF-001**: [USDK Specification](../plans/047-usdk/usdk-spec.md)
- **REF-002**: [USDK Implementation Plan](../plans/047-usdk/usdk-plan.md)
- **REF-003**: [Workshop 001: SDK Surface — Consumer & Publisher Experience](../plans/047-usdk/workshops/001-sdk-surface-consumer-publisher-experience.md)
- **REF-004**: [Workshop 003: Settings Domain Data Model](../plans/047-usdk/workshops/003-settings-domain-data-model.md)
- **REF-005**: [ADR-0004: Dependency Injection Container Architecture](adr-0004-dependency-injection-container-architecture.md)
- **REF-006**: [ADR-0008: Workspace Split Storage Data Model](adr-0008-workspace-split-storage-data-model.md)
- **REF-007**: [ADR-0009: Module Registration Function Pattern](adr-0009-module-registration-function-pattern.md)
- **REF-008**: [External Research: Keyboard Shortcuts in React](../plans/047-usdk/external-research/keyboard-shortcuts-react.md)
