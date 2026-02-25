# USDK — Internal SDK System for Chainglass

**Mode**: Full

📚 This specification incorporates findings from [research-dossier.md](./research-dossier.md) (71 findings), [VS Code API research](./external-research/vscode-extension-api.md), [keyboard shortcuts research](./external-research/keyboard-shortcuts-react.md), and three workshops:
- [001 SDK Surface — Consumer & Publisher Experience](./workshops/001-sdk-surface-consumer-publisher-experience.md)
- [002 Initial SDK Candidates](./workshops/002-initial-sdk-candidates.md)
- [003 Settings Domain Data Model](./workshops/003-settings-domain-data-model.md)

---

## Research Context

The Chainglass codebase has **6 existing domains** (5 infrastructure + 1 business) with cross-domain consumption happening through DI injection, direct imports, and documented domain contracts. No unified discovery, invocation, or configuration surface exists. The research identified **71 findings** across 8 dimensions, with 5 critical discoveries:

1. **The explorer bar is the natural command palette host** — ExplorerPanel's BarHandler chain is extensible by design.
2. **NodeEventRegistry is the command registry blueprint** — domain-scoped registry with Zod validation already exists in 032-node-event-system.
3. **A settings domain is missing and needed** — no domain owns user preferences; ideal first SDK dogfood.
4. **Phase 5 subtask 001 is now complete** — workspace preferences schema is stable (WorktreeVisualPreferences, worktreePreferences map).
5. **Client/server export split is non-negotiable** — multiple prior learnings confirm subpath exports are mandatory.

External research confirmed: VS Code separates static declaration from dynamic registration; tinykeys is the recommended shortcut library; chord state machines need a ~1000ms timeout.

---

## Summary

The **USDK** (Us SDK) is an internal SDK layer — analogous to VS Code's extension API — where Chainglass domains self-publish commands, settings, and UI actions to a standardised surface. Users interact with it through a **command palette** (Ctrl+Shift+P), **keyboard shortcuts**, and a **domain-organised settings page**. Developers interact with it through a publish/consume API: domains register commands and settings at bootstrap, and any domain (or UI component) can execute commands and read settings through the SDK.

**Why**: Today, cross-domain feature consumption is scattered across DI resolution, direct imports, and undiscoverable code paths. The USDK provides a single, homogeneous, discoverable surface that enforces domain boundaries while making cross-domain features accessible. The settings domain dogfoods the entire pattern, validating it before wider adoption.

---

## Goals

- **G1: Command Registry** — Domains can register commands with typed parameters (Zod-validated), human-readable titles, and domain attribution. Commands are executable by ID from any consumer.
- **G2: Command Palette** — Users can press Ctrl+Shift+P to open a VS Code-style command palette in the explorer bar. Typing with `>` prefix shows and filters available commands. Commands execute on selection.
- **G3: Keyboard Shortcuts** — Commands can be bound to keyboard shortcuts (single combinations and chord sequences). Shortcuts are configurable and conflict-aware. One hardcoded Ctrl+P in browser-client.tsx is replaced by SDK-managed shortcuts.
- **G4: Settings Surface** — Domains can contribute typed, validated settings with defaults, UI hints, and descriptions. Settings are workspace-scoped, persisted in the existing workspace preferences system, and observable via change listeners.
- **G5: Settings Page** — A domain-organised settings page auto-generates controls from contributed setting schemas. Users browse by section, search by keyword, and toggle/select/input values. No raw JSON editing.
- **G6: Domain Self-Service** — Each domain publishes to the SDK by exporting a static contribution manifest and a registration function. The pattern follows the existing module registration convention (ADR-0009).
- **G7: Initial SDK Wrap** — Existing features (toast notifications, go-to-file, theme toggle, sidebar toggle, worktree icon/color) are wrapped as SDK commands, making them discoverable and invocable through the palette.
- **G8: Go to File and Line** — Users can navigate to a specific file and line number (e.g., `path:42` or `path#L42`), extending the current file navigation with line-number support.
- **G9: Context Keys** — Commands and shortcuts support when-clauses (e.g., "only when a file is open") via a simple in-memory context key service.
- **G10: Out-of-Scope Stubs** — The command palette supports `#` prefix (symbol search / LSP / Flowspace) and no-prefix (file search) modes as stubs that show "coming soon" feedback.

---

## Non-Goals

- **Not a plugin system** — USDK is internal only. Domains are compiled into the application. There is no dynamic extension loading, sandboxing, or third-party API.
- **Not a replacement for DI** — DI handles service-to-service wiring and server-side infrastructure. The SDK is a user-facing surface on top of DI.
- **Not user-global settings in v1** — All settings are workspace-scoped (per ADR-0008). Global preferences (e.g., theme) can be added later as a non-breaking extension.
- **Not cross-tab sync in v1** — Settings changes in one browser tab don't reflect in others until navigation. BroadcastChannel sync is a future enhancement.
- **Not CLI integration in v1** — The SDK is client-side (browser). CLI uses DI directly. Future CLI SDK is possible but out of scope.
- **Not migrating existing preferences** — Existing workspace preferences (emoji, color, starred) stay as-is with their dedicated UI and server actions. SDK settings are a parallel system.
- **Not full search or LSP** — File search (no prefix) and symbol search (`#` prefix) in the command palette are stubs only.

---

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `_platform/sdk` | **NEW** | **create** | The USDK framework itself — command registry, keybinding resolver, context keys, SDK provider |
| `_platform/settings` | **NEW** | **create** | Settings store, settings page UI, settings management commands. First SDK dogfood. |
| `_platform/panel-layout` | existing | **modify** | Extend ExplorerPanel's BarHandler chain to host command palette (`>` prefix handler) |
| `_platform/events` | existing | **modify** | Wrap toast() as SDK commands; publish toast.show, toast.dismiss |
| `file-browser` | existing | **modify** | Publish file.open, file.openAtLine, copyPath commands + settings; replace hardcoded Ctrl+P |
| `_platform/file-ops` | existing | **consume** | Use IFileSystem for file-related SDK commands (no changes to domain) |
| `_platform/workspace-url` | existing | **consume** | Use workspaceHref for navigation commands (no changes to domain) |
| `_platform/viewer` | existing | **consume** | Use viewer components for file display (no changes to domain) |

### New Domain Sketches

#### `_platform/sdk` [NEW]
- **Purpose**: The USDK framework — provides the command registry, keybinding resolver, context key service, and the React provider that makes the SDK available to all components.
- **Boundary Owns**: Command registration/execution/listing, keybinding registration/resolution, context key state, SettingsStore engine (in-memory contribute/get/set/onChange), SDK bootstrap, the IUSDK interface, SDKCommand/SDKSetting/SDKKeybinding types.
- **Boundary Excludes**: Settings persistence (belongs to `_platform/settings`), individual command handlers (belong to publishing domains), UI components for the command palette (belongs to `_platform/panel-layout`).

#### `_platform/settings` [NEW]
- **Purpose**: Settings management — provides settings persistence via server actions, the settings page UI, and the settings domain SDK contribution.
- **Boundary Owns**: Settings persistence via server actions, settings page component, setting control rendering, section grouping, settings search, `sdk.openSettings` command.
- **Boundary Excludes**: SettingsStore engine (belongs to `_platform/sdk` — co-located with other SDK internals), the SDKSetting type definition (belongs to `_platform/sdk`), individual setting schemas (belong to contributing domains), workspace visual preferences (emoji, color — belong to existing preferences system).

---

## Complexity

**Score**: CS-4 (large)

**Breakdown**:
- S (Surface Area) = 2 — Touches shared types, web features, server actions, two new domains, multiple existing domains
- I (Integration) = 1 — One new external dependency (tinykeys for shortcuts); otherwise internal
- D (Data/State) = 1 — Minor schema extension (additive `sdkSettings` + `sdkShortcuts` + `sdkMru` fields on WorkspacePreferences); no migration
- N (Novelty) = 1 — Well-specified via workshops; some ambiguity in keyboard chord edge cases
- F (Non-Functional) = 1 — Keyboard shortcuts need browser conflict handling; settings page needs responsive design
- T (Testing) = 2 — Fake-first testing with contract parity; integration tests for command palette; keyboard shortcut testing

**Total P** = 8 → **CS-4 (large)**

**Confidence**: 0.85 — Three detailed workshops de-risk the design significantly. Remaining uncertainty is in keyboard shortcut browser conflicts and settings page UX polish.

**Assumptions**:
- Phase 5 subtask 001 is complete (confirmed — all ST01–ST08 done, 4370 tests passing)
- tinykeys library is suitable for production use
- The explorer bar can be extended without breaking existing file navigation
- Workspace-scoped settings are sufficient for v1

**Dependencies**:
- Plan 041 Phase 5 subtask 001 completion ✅ (done)
- tinykeys npm package (external, stable)
- Existing Shadcn UI components (Switch, Select, Input) for settings controls

**Risks**:
- R1: Browser shortcut conflicts (Ctrl+P opens print in some browsers) — mitigated by tinykeys' preventDefault and user-configurable overrides
- R2: ExplorerPanel generalisation may affect file browser UX — mitigated by keeping existing handlers intact, adding new handler to chain
- R3: Settings page performance with many settings — mitigated by section-based rendering and search filtering

**Phases** (high-level):
1. SDK Foundation (types, registry, provider, context keys)
2. Command Palette (BarHandler, palette UI, command list/filter/execute)
3. Keyboard Shortcuts (tinykeys integration, chord state machine, conflict detection)
4. Settings Domain (settings store, server action, settings page, auto-generated controls)
5. Initial SDK Wraps (toast, file.open, theme toggle, etc.)
6. Go to File + Line (URL param, CodeMirror scroll, path parser)
7. Polish (stubs, docs, ADR)

---

## Acceptance Criteria

### Command Registry

1. **AC-01**: A domain can register a command with an ID, title, Zod parameter schema, and handler function. The command appears in `sdk.commands.list()`.
2. **AC-02**: Any component can execute a registered command by ID with typed parameters. The handler runs with Zod-validated params.
3. **AC-03**: Executing a command with invalid parameters throws a Zod validation error before the handler is called.
4. **AC-04**: Commands that specify a `when` clause are only available when the condition evaluates true (via context keys).

### Command Palette

5. **AC-05**: Pressing Ctrl+Shift+P focuses the explorer bar and enters command mode (shows `>` prefix).
6. **AC-06**: With `>` prefix, typing filters the command list by title. Matching commands display in a dropdown below the bar.
7. **AC-07**: Selecting a command from the palette executes it. If the command requires parameters, a parameter input step is shown.
8. **AC-08**: Pressing Escape exits command mode and returns the explorer bar to normal file navigation.
9. **AC-09**: The `#` prefix shows a "Symbol search (LSP/Flowspace) coming later" stub message.
10. **AC-10**: No prefix with text input shows a "Search coming soon" stub message (existing file navigation continues to work for paths).

### Keyboard Shortcuts

11. **AC-11**: Registered keyboard shortcuts trigger their bound commands when pressed.
12. **AC-12**: Chord sequences (e.g., Ctrl+K Ctrl+C) are supported with a ~1000ms timeout between keys.
13. **AC-13**: The existing hardcoded Ctrl+P handler in browser-client.tsx is removed and replaced by an SDK-registered shortcut.
14. **AC-14**: Shortcuts respect `when` clauses — a shortcut only fires if its when-clause context is active.
15. **AC-15**: Users can view registered shortcuts via a settings section or command.

### Settings Surface

16. **AC-16**: A domain can contribute settings with key, label, description, Zod schema (with default), and UI hint. The setting appears in `sdk.settings.list()`.
17. **AC-17**: `sdk.settings.get(key)` returns the persisted override if one exists, otherwise the schema default.
18. **AC-18**: `sdk.settings.set(key, value)` validates against the Zod schema, updates the in-memory store, fires onChange listeners, and persists to the workspace's `sdkSettings` in workspaces.json.
19. **AC-19**: Components using `useSDKSetting(key)` re-render when the setting value changes.
20. **AC-20**: A setting can be reset to its schema default, removing the persisted override.

### Settings Page

21. **AC-21**: A settings page at `/workspaces/[slug]/settings` renders all contributed settings grouped by section.
22. **AC-22**: Each setting renders with the appropriate control based on its `ui` hint (toggle for boolean, select for enum, text input for string, etc.).
23. **AC-23**: Changing a setting on the settings page persists immediately and consuming components update without page refresh.
24. **AC-24**: A search input on the settings page filters settings by label and description text.

### Domain Self-Service

25. **AC-25**: The file-browser domain publishes at least 3 commands and 2 settings to the SDK.
26. **AC-26**: The events domain publishes toast.show and toast.dismiss commands to the SDK.
27. **AC-27**: Each publishing domain has a static contribution manifest separate from its handler bindings (declaration vs registration).

### SDK Wraps

28. **AC-28**: `toast.show` SDK command produces the same toast as direct `toast()` from sonner.
29. **AC-29**: `file-browser.openFile` SDK command navigates to the specified file in the browser.
30. **AC-30**: Ctrl+P triggers the go-to-file command through the SDK (not the hardcoded handler).

### Go to File + Line

31. **AC-31**: `file-browser.openFileAtLine` navigates to a file and scrolls the viewer to the specified line number.
32. **AC-32**: The explorer bar (or command palette) accepts `path:42` or `path#L42` syntax for line-number navigation.

### Testing

33. **AC-33**: A FakeUSDK implementation exists that can be used in tests without any server or persistence dependencies.
34. **AC-34**: Contract tests verify that FakeUSDK and real USDK behave identically for all SDK interface methods.

---

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Browser shortcut conflicts (Ctrl+P = Print, Ctrl+, = browser settings) | Medium | Medium | tinykeys preventDefault; user override in settings; document known conflicts |
| ExplorerPanel changes break file navigation | Low | High | Existing BarHandler chain preserved; new handler added at start of chain with prefix check |
| Performance of global keydown listener | Low | Low | Single listener via tinykeys; only active shortcuts in map; no per-key re-renders |
| SDK type package creates client/server import issues | Medium | High | Subpath exports from day one; separate client/server entry points (PL-01, PL-06) |
| Settings page slow with many domains contributing | Low | Medium | Section-based lazy rendering; search filter reduces visible items |
| Concurrent settings writes from rapid user changes | Low | Low | In-memory store is synchronous truth; async persist writes full record (last-write-wins) |

### Assumptions

- A1: Workspace-scoped settings are sufficient for all v1 use cases (no user-global settings needed)
- A2: The explorer bar can support command palette mode without a separate modal component
- A3: tinykeys handles all keyboard shortcut edge cases (modifiers, international layouts, chord state)
- A4: Domains will voluntarily adopt the SDK pattern — adoption is cultural, not enforced at build time
- A5: The existing Shadcn UI components (Switch, Select, Input) are sufficient for settings controls

---

## Open Questions

All open questions resolved in clarification session 2026-02-24.

### OQ-1: Keyboard shortcut configuration storage — RESOLVED

**Answer**: Separated. Shortcuts live in a dedicated shortcuts map in SDK config, not inside `sdkSettings`. This keeps conflict detection, chord resolution, and modifier parsing clean. The shortcuts map is persisted alongside (but separate from) `sdkSettings` in workspace preferences.

### OQ-2: Complex parameters in command palette — RESOLVED

**Answer**: No params in palette. The command palette is for discovery and dispatch only. Commands that need complex parameters (e.g., color picker, file picker) open their own UI (dialog/popover) after being dispatched. This avoids building a parameter form system inside the palette and keeps the palette UX simple.

### OQ-3: Command palette result ordering — RESOLVED

**Answer**: MRU first, then alphabetical. Recently used commands float to the top of filtered results (matching VS Code's default behaviour). Remaining commands are sorted alphabetically. MRU history is stored per-workspace (in SDK config, lightweight — just a list of recent command IDs).

### OQ-4: SDK command undo support — RESOLVED

**Answer**: Out of scope for v1. No undo stack. Commands are fire-and-forget. Individual commands can implement their own undo if needed (e.g., a "revert color" button in the UI that set it).

---

## Workshop Opportunities

All three primary workshops have been completed. Remaining opportunities for detailed design exploration:

| Topic | Type | Why Workshop | Key Questions | Status |
|-------|------|--------------|---------------|--------|
| SDK Surface — Consumer & Publisher Experience | API Contract | Define the developer experience of publish and consume | Types, hooks, testing, persistence | ✅ Complete (Workshop 001) |
| Initial SDK Candidates | Integration Pattern | Inventory what gets added, effort, priority | 20 candidates, 4-phase rollout | ✅ Complete (Workshop 002) |
| Settings Domain Data Model | Data Model | How settings overlay workspace data model | Storage, resolution, change events | ✅ Complete (Workshop 003) |
| Keyboard Shortcut Chord State Machine | State Machine | Detailed chord detection, timeout, conflict resolution | State transitions, edge cases, browser conflicts | Not started |
| Command Palette UX Flow | CLI Flow | Detailed interaction flow for palette modes, parameter input | Mode switching, result rendering, keyboard navigation | Not started |

The two remaining workshops (Keyboard Chord State Machine, Command Palette UX Flow) are optional — the external research and Workshop 001 cover the core design. They can be done during architecture if the implementor wants more detail.

---

## Testing Strategy

**Approach**: Hybrid — TDD for SDK core, lightweight for wraps and UI

| Layer | Approach | What's Covered |
|-------|----------|----------------|
| SDK Core (registry, settings store, keybinding resolver, context keys) | Full TDD | Red-green-refactor cycle; contract tests for fake/real parity |
| UI Components (command palette, settings page, setting controls) | Lightweight | Verify rendering, basic interactions; no exhaustive DOM testing |
| Thin Wraps (toast, theme toggle, sidebar toggle, file.open) | Lightweight | Verify the command executes the underlying action; integration-level |

**Mock Policy**: No mocks — fakes only (per codebase convention QT-08). Use FakeUSDK, FakeCommandRegistry, FakeSettingsStore with contract parity tests.

**Focus Areas**:
- Command registration and execution with Zod validation
- Settings contribute/get/set/onChange lifecycle
- Keyboard shortcut resolution including chord sequences
- Context key evaluation for when-clauses

**Excluded**:
- Visual regression testing
- E2E browser automation for command palette (manual verification sufficient)
- Performance benchmarks for settings page rendering

---

## Documentation Strategy

**Location**: Hybrid — README quick-start + docs/how/ detailed guides

| Document | Location | Content |
|----------|----------|---------|
| SDK Quick Start | README.md (new section) | 30-second overview of publish/consume pattern |
| SDK Publisher Guide | docs/how/sdk/publishing-to-sdk.md | Full walkthrough: contribution.ts → register.ts → bootstrap |
| SDK Consumer Guide | docs/how/sdk/consuming-sdk.md | useSDK, useSDKSetting, command execution, toast convenience |
| Settings Domain Guide | docs/how/sdk/settings-domain.md | How the settings page works, how to contribute settings |
| Keyboard Shortcuts Reference | docs/how/sdk/keyboard-shortcuts.md | Default shortcuts, chord syntax, conflict table |

---

## Clarifications

### Session 2026-02-24

**Q1: Workflow Mode** → **Full Mode**. CS-4 large feature with 7 phases, 2 new domains, 34 acceptance criteria. Multi-phase plan with required dossiers and all gates.

**Q2: Testing Strategy** → **Hybrid**. TDD for SDK core (registry, settings store, keybinding resolver), lightweight for wraps and UI components. Matches the layered architecture — complex logic gets full TDD, thin wraps get basic verification.

**Q3: Mock Usage** → **No mocks, fakes only**. Follows codebase convention (QT-08). FakeUSDK designed in Workshop 001. Contract parity tests verify fake/real equivalence.

**Q4: Documentation Strategy** → **Hybrid (README + docs/how/)**. README gets a quick-start section for the publish/consume pattern. Detailed guides in docs/how/sdk/ for publishers, consumers, settings, and shortcuts.

**Q5: Domain Review** → **Boundaries confirmed**. `_platform/sdk` owns the framework (types, registry, keybinding resolver, context keys, provider). `_platform/settings` owns the settings surface (settings store, settings page UI, persistence). `_platform/panel-layout` hosts the command palette UI (BarHandler extension). No domains merged or split.

**Q6: Shortcut Configuration Storage** (OQ-1) → **Separated**. Dedicated shortcuts map in SDK config, not inside `sdkSettings`. Purpose-built for conflict detection and chord resolution. Persisted alongside `sdkSettings` in workspace preferences as a separate field.

**Q7: Complex Parameters in Palette** (OQ-2) → **No params in palette**. Command palette is discovery + dispatch only. Commands needing complex input open their own UI after dispatch.

**Q8: Palette Result Ordering** (OQ-3) → **MRU first, then alphabetical**. Recently used commands float to top. MRU history stored per-workspace in SDK config.

**OQ-4: Undo Support** → **Out of scope for v1**. Resolved without needing a user question — no undo stack, commands are fire-and-forget.

---

*All 4 open questions resolved. No `[NEEDS CLARIFICATION]` markers remain. Spec ready for architecture.*
*Run `/plan-3-v2-architect` to generate the implementation plan.*
