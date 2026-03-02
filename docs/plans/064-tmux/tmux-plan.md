# Terminal Integration via tmux — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-03-02
**Spec**: [tmux-spec.md](./tmux-spec.md)
**Research**: [research-dossier.md](./research-dossier.md)
**Workshop**: [001-terminal-ui-main-and-popout.md](./workshops/001-terminal-ui-main-and-popout.md)
**Status**: DRAFT

## Summary

Developers need terminal access within the Chainglass web UI to run commands and monitor builds without leaving the browser. This plan adds a browser-based terminal emulator (xterm.js) connected to tmux sessions via a sidecar WebSocket server (node-pty + ws). When a developer navigates to a worktree's terminal page, the system atomically creates or re-attaches to a tmux session named by the branch convention (e.g., `064-tmux`). The terminal appears as both a dedicated workspace page and a persistent right-edge overlay panel (following the Plan 059 Phase 3 AgentOverlayPanel pattern). Sessions survive page refreshes, browser restarts, and server restarts.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| terminal | **NEW** | **create** | New business domain: terminal UI, session management, WS connection, sidecar server |
| _platform/panel-layout | existing | **modify** | Extend `PanelMode` union with `'sessions'` |
| _platform/events | existing | **consume** | `toast()` for tmux unavailable warning |
| _platform/sdk | existing | **consume** | Register terminal toggle command + keybinding |
| _platform/state | existing | **consume** | Publish connection state |
| _platform/workspace-url | existing | **consume** | `workspaceHref()` for deep-linking |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/src/features/064-terminal/types.ts` | terminal | contract | Public types: TerminalSession, TerminalMessage, ConnectionStatus |
| `apps/web/src/features/064-terminal/index.ts` | terminal | contract | Barrel exports |
| `apps/web/src/features/064-terminal/server/terminal-ws.ts` | terminal | internal | Sidecar WebSocket server |
| `apps/web/src/features/064-terminal/server/tmux-session-manager.ts` | terminal | internal | tmux create/attach/list/validate |
| `apps/web/src/features/064-terminal/components/terminal-view.tsx` | terminal | contract | Dynamic import wrapper (ssr: false) |
| `apps/web/src/features/064-terminal/components/terminal-inner.tsx` | terminal | internal | xterm.js + WebSocket + FitAddon |
| `apps/web/src/features/064-terminal/components/terminal-skeleton.tsx` | terminal | internal | Loading placeholder |
| `apps/web/src/features/064-terminal/components/terminal-session-list.tsx` | terminal | internal | Left panel session list |
| `apps/web/src/features/064-terminal/components/terminal-overlay-panel.tsx` | terminal | contract | Fixed-position overlay (Plan 059 pattern) |
| `apps/web/src/features/064-terminal/components/terminal-page-client.tsx` | terminal | internal | Surface 1 page client |
| `apps/web/src/features/064-terminal/components/terminal-page-header.tsx` | terminal | internal | Custom header bar |
| `apps/web/src/features/064-terminal/components/connection-status-badge.tsx` | terminal | internal | Status indicator |
| `apps/web/src/features/064-terminal/hooks/use-terminal-overlay.tsx` | terminal | contract | Context + hook for overlay open/close/toggle |
| `apps/web/src/features/064-terminal/hooks/use-terminal-socket.ts` | terminal | internal | WebSocket lifecycle |
| `apps/web/src/features/064-terminal/hooks/use-terminal-sessions.ts` | terminal | internal | Session list fetching |
| `apps/web/src/features/064-terminal/params/terminal.params.ts` | terminal | contract | nuqs URL params |
| `apps/web/src/features/064-terminal/domain.md` | terminal | contract | Domain documentation |
| `app/(dashboard)/workspaces/[slug]/terminal/layout.tsx` | terminal | internal | Route layout |
| `app/(dashboard)/workspaces/[slug]/terminal/page.tsx` | terminal | internal | Route page |
| `apps/web/src/features/_platform/panel-layout/types.ts` | _platform/panel-layout | cross-domain | Extend PanelMode union |
| `apps/web/src/lib/navigation-utils.ts` | (shared) | cross-domain | Add terminal nav item |
| `app/(dashboard)/workspaces/[slug]/layout.tsx` | (shared) | cross-domain | Add TerminalOverlayProvider + TerminalOverlayPanel |
| `apps/web/package.json` | (shared) | cross-domain | Add xterm, node-pty, ws deps |
| `apps/web/next.config.mjs` | (shared) | cross-domain | Add node-pty to serverExternalPackages |
| `justfile` | (shared) | cross-domain | Update dev recipe for sidecar |
| `docs/domains/terminal/domain.md` | terminal | contract | Domain definition |
| `docs/domains/registry.md` | (shared) | cross-domain | Register terminal domain |
| `docs/domains/domain-map.md` | (shared) | cross-domain | Add terminal to diagram |
| `docs/how/dev/terminal-setup.md` | (docs) | internal | Developer setup guide |
| `test/unit/web/features/064-terminal/tmux-session-manager.test.ts` | terminal | internal | TDD: tmux service |
| `test/unit/web/features/064-terminal/terminal-ws.test.ts` | terminal | internal | TDD: WS server |
| `test/unit/web/features/064-terminal/terminal-view.test.tsx` | terminal | internal | Lightweight: component render |
| `test/unit/web/features/064-terminal/terminal-session-list.test.tsx` | terminal | internal | Lightweight: session list |
| `test/fakes/fake-pty.ts` | (test) | internal | Fake node-pty for tests |
| `test/fakes/fake-tmux-executor.ts` | (test) | internal | Fake tmux CLI executor |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | **Plan 059 agent overlay not yet merged to main** — TerminalOverlayPanel follows the AgentOverlayPanel pattern from 059 Phase 3, but that code only exists in the 059 worktree. | Merge 059→main before Phase 4, OR implement terminal overlay independently (same pattern, different provider). Plan assumes independent implementation since both use simple context+hook pattern. |
| 02 | Critical | **node-pty needs `serverExternalPackages`** — next.config.mjs lists Shiki packages but not node-pty. Native modules must be externalized or standalone build fails. | Add `'node-pty'` to `serverExternalPackages` in Phase 1. Note: node-pty only runs in sidecar server, not Next.js process, so this may not be strictly needed — but add defensively. |
| 03 | High | **PanelMode extension risk** — Adding `'sessions'` to the union `'tree' \| 'changes'` could surface as `undefined` in existing `children[mode]` lookups. LeftPanel uses `Partial<Record<PanelMode, ReactNode>>` which handles missing keys gracefully (returns undefined → renders nothing). | Safe to extend. LeftPanel already handles unknown modes via `Partial<>`. Verify with a quick test in Phase 3. |
| 04 | High | **No `concurrently` installed** — Sidecar WS server needs to start alongside `next dev`. Neither root nor web package.json has `concurrently`. | Install `concurrently` as root devDependency in Phase 1. Update justfile dev recipe. |
| 05 | High | **Workspace layout.tsx is critical path** — Adding TerminalOverlayProvider to the workspace layout affects ALL workspace pages. If provider throws, all workspace pages break. | Wrap TerminalOverlayProvider in error boundary. Make WebSocket connection non-blocking. Provider itself is pure React context (no side effects until TerminalView mounts). |
| 06 | Medium | **Port collision: NEXT_PORT + 1500** — No validation that derived port is available. | Log chosen port on startup. Fail fast with clear error message if port busy. Overridable via `TERMINAL_WS_PORT` env var. |

## Phases

### Phase 1: Sidecar WebSocket Server + tmux Integration

**Objective**: Build the backend — a standalone TypeScript WebSocket server that spawns PTY processes attached to tmux sessions, with full session lifecycle management.
**Domain**: terminal (server/)
**Delivers**:
- `TmuxSessionManager` class: session create/attach/list/validate
- Sidecar WebSocket server: connection handling, PTY spawn, bidirectional I/O piping
- Fake objects: `FakePty`, `FakeTmuxExecutor`
- npm dependencies installed: `node-pty`, `ws`, `concurrently`
- Justfile `dev` recipe updated
- TDD test suite for tmux session manager and WS server
**Depends on**: None
**Key risks**: node-pty native compilation; port conflicts

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Install dependencies: `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-canvas`, `@xterm/addon-web-links`, `node-pty`, `ws` in apps/web; `concurrently` in root | terminal | `pnpm install` succeeds; `node -e "require('node-pty')"` succeeds | Per finding 02, 04 |
| 1.2 | Add `node-pty` to `serverExternalPackages` in `next.config.mjs` | terminal | `pnpm build` succeeds | Per finding 02 |
| 1.3 | Create `FakeTmuxExecutor` and `FakePty` test doubles | terminal | Fakes implement injectable function interfaces; no vi.mock() | Constitution Principle 4 |
| 1.4 | TDD: `TmuxSessionManager` — tmux detection, session validation, create-or-attach, list sessions, fallback to raw shell. Constructor accepts injectable executor function (not direct `execSync`). Tests use child container isolation per ADR-0004. | terminal | Tests pass for: tmux available + session exists, tmux available + no session, tmux unavailable → raw shell | DR-03 patterns; ADR-0004 DI |
| 1.5 | TDD: Sidecar WebSocket server — connection lifecycle, session tracking, multi-client, PTY spawn, I/O piping, resize, cleanup | terminal | Tests pass for: connect → spawn PTY, disconnect → kill PTY (not tmux), resize message → pty.resize(), multi-client same session | DR-02 patterns |
| 1.6 | Wire port derivation: `WS_PORT = NEXT_PORT + 1500`, overridable via `TERMINAL_WS_PORT` | terminal | Server starts on correct port; logs port to stdout | Clarification Q6 |
| 1.7 | Update justfile `dev` recipe to start sidecar alongside Next.js via `concurrently` | terminal | `just dev` starts both processes; Next.js HMR works; WS server auto-restarts on file change | Per finding 04 |
| 1.8 | Create feature directory structure + types.ts + index.ts barrel | terminal | Directory tree matches domain manifest; TypeScript compiles | — |

### Phase 2: TerminalView Component (xterm.js Frontend)

**Objective**: Build the core terminal emulator React component — xterm.js wrapper with WebSocket connection, resize handling, theme sync, and proper React 19 cleanup.
**Domain**: terminal (components/, hooks/)
**Delivers**:
- `TerminalView` component (dynamic import, ssr: false)
- `terminal-inner.tsx` (xterm.js + WebSocket + FitAddon + Canvas renderer)
- `use-terminal-socket.ts` hook
- `TerminalSkeleton` loading state
- `ConnectionStatusBadge` component
- Lightweight component render tests
**Depends on**: Phase 1 (WS server for manual testing)
**Key risks**: xterm.js strict mode double-mount; dynamic import SSR safety

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Create `terminal-inner.tsx`: xterm.js Terminal + FitAddon + Canvas renderer + WebSocket wiring | terminal | Terminal renders in browser; types in terminal appear as input; server output displays with ANSI colors | DR-01 patterns |
| 2.2 | Create `use-terminal-socket.ts` hook: WebSocket connect/disconnect/reconnect, message handling, status tracking | terminal | Hook manages WS lifecycle; exposes `send()`, `status`, `close()`; reconnects on unexpected close | DR-02 client patterns |
| 2.3 | Create `terminal-view.tsx`: `next/dynamic` wrapper with `ssr: false` + Suspense fallback | terminal | `TerminalView` renders skeleton during load, terminal after; no SSR errors | DR-01 finding 2 |
| 2.4 | Implement ResizeObserver + FitAddon integration: resize → fit → send resize message to WS | terminal | Resizing container re-fits terminal; tmux session receives SIGWINCH | DR-01 finding 6 |
| 2.5 | Implement theme sync with `next-themes`: dark/light terminal themes | terminal | Terminal background matches app theme; switches live when theme toggles | DR-01 finding 7 |
| 2.6 | Implement React 19 strict mode cleanup: dispose terminal, close WS, disconnect ResizeObserver | terminal | No console warnings in dev; no memory leaks on mount/unmount cycle | DR-01 finding 3 |
| 2.7 | Create `connection-status-badge.tsx` and `terminal-skeleton.tsx` | terminal | Badge shows connecting/connected/disconnected states; skeleton matches terminal dimensions | — |
| 2.8 | Lightweight tests: TerminalView renders without SSR crash; ConnectionStatusBadge states | terminal | Tests pass in jsdom | — |

### Phase 3: Terminal Page (Surface 1)

**Objective**: Build the full terminal workspace page with PanelShell layout, session list in left panel, and terminal in main panel. Add sidebar navigation item.
**Domain**: terminal (page), _platform/panel-layout (PanelMode extension)
**Delivers**:
- Terminal page route: `/workspaces/[slug]/terminal`
- `TerminalPageClient` with PanelShell composition
- `TerminalSessionList` component
- `use-terminal-sessions.ts` hook
- Terminal sidebar nav item
- PanelMode extension with `'sessions'`
- URL params via nuqs
**Depends on**: Phase 2 (TerminalView component)
**Key risks**: PanelMode extension breaking existing pages (finding 03, mitigated by `Partial<Record>` pattern)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Extend `PanelMode` union in `_platform/panel-layout/types.ts` with `'sessions'` | _platform/panel-layout | Existing browser/workflow pages still render correctly; TypeScript compiles | Per finding 03 |
| 3.2 | Create `use-terminal-sessions.ts`: fetch session list from WS server, create session, select session | terminal | Hook returns session list with name, attached count, isCurrentWorktree flag | Clarification Q7 |
| 3.3 | Create `terminal-session-list.tsx`: render sessions with status dots, highlight current worktree, "New Session" button | terminal | List renders; clicking session changes active; current worktree highlighted | AC-09, AC-10 |
| 3.4 | Create `terminal-page-header.tsx`: session name display + connection status badge + pop-out button | terminal | Header shows session name and connection status | Workshop 001 |
| 3.5 | Create `terminal-page-client.tsx`: compose PanelShell with header, LeftPanel (sessions), MainPanel (TerminalView) | terminal | PanelShell renders three sections; left panel resizable; terminal fills main area | AC-01, AC-07, AC-08 |
| 3.6 | Create `terminal/layout.tsx` and `terminal/page.tsx` route files | terminal | `/workspaces/[slug]/terminal` renders terminal page; URL param `?session=` works | AC-01 |
| 3.7 | Create `terminal.params.ts`: nuqs URL param definitions | terminal | `?session=064-tmux` is parsed and persisted | — |
| 3.8 | Add Terminal to `WORKSPACE_NAV_ITEMS` in `navigation-utils.ts` | (shared) | Terminal appears in sidebar under Tools when inside a worktree | AC-12 |
| 3.9 | Lightweight test: TerminalSessionList renders sessions correctly | terminal | Test passes in jsdom | — |

### Phase 4: Terminal Overlay Panel (Surface 2)

**Objective**: Build the persistent right-edge terminal overlay that stays open across workspace page navigations, following the Plan 059 AgentOverlayPanel pattern.
**Domain**: terminal (overlay), workspace layout (cross-domain wiring)
**Delivers**:
- `TerminalOverlayProvider` context + `useTerminalOverlay()` hook
- `TerminalOverlayPanel` component (fixed position, slide-in animation)
- Workspace layout integration
- `Ctrl+\`` keybinding via SDK
- Sidebar toggle button
**Depends on**: Phase 2 (TerminalView component)
**Key risks**: Workspace layout modification affects all pages (finding 05)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | Create `use-terminal-overlay.tsx`: context + provider + hook (openTerminal, closeTerminal, toggleTerminal) | terminal | Provider stores session name + CWD; hook exposes open/close/toggle; throws outside provider | Plan 059 useAgentOverlay pattern |
| 4.2 | Create `terminal-overlay-panel.tsx`: fixed right panel, slide-in animation, close on Escape, header with session name + X button | terminal | Panel appears at right edge; closes on Escape and X; z-index 44 (below agent overlay) | Workshop 001, AC-05 |
| 4.3 | Wire `TerminalOverlayProvider` + `TerminalOverlayPanel` into workspace `layout.tsx` | (shared) | Overlay available on all workspace pages; no errors when provider is present but overlay closed | Per finding 05; wrap in error boundary |
| 4.4 | Register `terminal.toggleOverlay` SDK command + `Ctrl+\`` keybinding | terminal | Pressing Ctrl+\` toggles overlay; command appears in command palette | AC-05 |
| 4.5 | Add terminal toggle button to sidebar footer | (shared) | Button visible in sidebar; clicking toggles overlay | AC-05 |
| 4.6 | Verify overlay persists across workspace page navigation | terminal | Open overlay on browser page → navigate to agents → overlay still open and connected | AC-06 |
| 4.7 | Verify overlay closes on Escape and X button; tmux session survives | terminal | Close overlay → WS disconnected → reopen → reconnects to same tmux session | AC-13 |

### Phase 5: Polish + Documentation

**Objective**: tmux fallback, developer documentation, domain registration, and final integration testing.
**Domain**: terminal (docs), docs/domains/ (registry)
**Delivers**:
- tmux fallback to raw shell with toast warning
- `docs/how/dev/terminal-setup.md` setup guide
- `docs/domains/terminal/domain.md` domain definition
- Domain registry + domain-map updates
- End-to-end manual verification of all ACs
**Depends on**: Phases 1-4
**Key risks**: None significant

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 5.1 | Implement tmux fallback: detect tmux unavailable → spawn raw shell → send status message → client shows toast warning | terminal | When tmux not in PATH, terminal works with raw shell; toast warns about no persistence | AC-11 |
| 5.2 | Verify `docs/domains/terminal/domain.md` is complete and accurate after implementation | terminal | domain.md reflects actual contracts, composition, dependencies | Pre-created; update after implementation |
| 5.3 | Verify `docs/domains/registry.md` terminal row is accurate | (shared) | Terminal domain listed as active business domain | Pre-created; verify after implementation |
| 5.4 | Verify `docs/domains/domain-map.md` terminal node and edges are accurate | (shared) | Mermaid diagram renders correctly with terminal dependencies | Pre-created; verify after implementation |
| 5.5 | Create `docs/how/dev/terminal-setup.md`: prerequisites, dev workflow, troubleshooting | (docs) | Guide covers: tmux install, node-pty build tools, `just dev` with sidecar, port config, common issues | Documentation Strategy |
| 5.6 | Verify all acceptance criteria AC-01 through AC-13 via manual testing | terminal | All 13 ACs pass | — |
| 5.7 | Run `just fft` — lint, format, typecheck, test | (shared) | All green | Constitution 3.4 |

## Acceptance Criteria

- [ ] **AC-01**: Navigate to terminal page → auto-creates or re-attaches tmux session
- [ ] **AC-02**: Type command → output with ANSI colors in real-time
- [ ] **AC-03**: Refresh page during long command → reconnects, output continues
- [ ] **AC-04**: Same URL on different browser → same tmux session, both see input
- [ ] **AC-05**: Ctrl+\` → overlay slides in from right, connected to worktree tmux
- [ ] **AC-06**: Navigate between workspace pages → overlay stays open and connected
- [ ] **AC-07**: Resize left panel → terminal re-fits, tmux notified
- [ ] **AC-08**: Drag panel to 150px → shrinks without breaking layout
- [ ] **AC-09**: Session list shows all tmux sessions with status dots
- [ ] **AC-10**: Select different session → terminal switches
- [ ] **AC-11**: tmux not installed → raw shell + toast warning
- [ ] **AC-12**: Terminal nav item in sidebar only when inside worktree
- [ ] **AC-13**: Close overlay → WS closed, PTY killed, tmux session survives

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| node-pty fails to compile | Medium | High | Use prebuilt binaries; add build tools to CI | Phase 1 |
| WS sidecar port collision | Low | Medium | Fail fast with error; TERMINAL_WS_PORT override | Phase 1 |
| PanelMode extension breaks existing pages | Low | High | Partial<Record> handles unknowns; verify in Phase 3 | Phase 3 |
| Workspace layout.tsx modification breaks all workspace pages | Low | Critical | Error boundary around TerminalOverlayProvider; pure context (no side effects) | Phase 4 |
| xterm.js strict mode double-mount leaks | Medium | Medium | Comprehensive cleanup; disposed flag pattern | Phase 2 |
| Plan 059 agent overlay merge conflict | Medium | Medium | Terminal overlay is independent implementation; same pattern, separate provider | Phase 4 |

## Constitution Compliance

No critical deviations from constitution principles. Two documented variances:

| Principle | Compliance | Notes |
|-----------|-----------|-------|
| P1: Clean Architecture | ✅ | TmuxSessionManager uses injectable executor functions; no direct process imports in components |
| P2: Interface-First | ✅ | FakePty + FakeTmuxExecutor created before implementations (Phase 1, Task 1.3) |
| P3: TDD | ⚠️ Variance | Hybrid approach authorized by spec clarification Q2: TDD for backend (WS server, tmux service), lightweight for UI components. Justification: frontend is mostly integration with xterm.js library — visual verification more valuable than unit tests for terminal rendering. Backend process management is stateful and error-prone, warranting full TDD. |
| P4: Fakes Over Mocks | ✅ | FakeWebSocket, FakePty, FakeTmuxExecutor — no vi.mock() (Task 1.3 enforces) |
| P5: Fast Feedback | ✅ | Sidecar server uses tsx watch for instant reload |
| P6: Developer Experience | ✅ | `just dev` starts everything; docs/how/dev/terminal-setup.md covers prerequisites |
| P7: Shared by Default | ⚠️ Variance | Terminal code stays in `apps/web` (not `packages/shared`) because: (a) xterm.js is browser-only with DOM dependencies, (b) node-pty is a native C++ addon only needed by the sidecar server, (c) no other app (CLI, MCP) consumes terminal UI. This is app-specific by nature. If terminal backend logic is later needed by CLI, extract `TmuxSessionManager` to shared at that point. |

### ADR Alignment
- **ADR-0002** (Exemplar-Driven Development): ✅ Fakes before implementations
- **ADR-0004** (DI Container): ✅ TmuxSessionManager uses injectable executor functions via constructor; tests use child containers for isolation. Sidecar server is standalone Node.js (no DI container needed — simple function composition).
- **ADR-0007** (SSE Single-Channel Routing): ✅ No conflict — WebSocket for terminal I/O is separate from SSE for agent/workflow events. SSE infrastructure unchanged.
