# Terminal Integration via tmux

**Mode**: Full

📚 This specification incorporates findings from `research-dossier.md` and `workshops/001-terminal-ui-main-and-popout.md`.

## Research Context

Research (60+ findings across 8 subagents) and 3 deep research queries confirmed:
- **xterm.js + node-pty + ws** is the industry standard stack (VS Code, JupyterLab, Azure Cloud Shell)
- **Sidecar WebSocket server** is required — Next.js route handlers cannot upgrade to WebSocket; custom servers break Turbopack HMR
- **tmux `new-session -A`** provides atomic create-or-attach with race-condition safety
- **CSS `resize: horizontal`** is the established pattern in this codebase (Plan 043 Phase 3)
- **15 prior learnings** from Plans 042, 043, 045, 057 directly apply

Workshop 001 resolved all UI layout questions for both terminal surfaces.

## Summary

Developers working in Chainglass need terminal access without leaving the browser. When a developer navigates to a worktree's terminal page, the system automatically creates or re-attaches to a tmux session named by the worktree convention (e.g., `064-tmux`). If the developer refreshes the page, closes the browser, or opens the same URL on a different machine, they reconnect to the same running tmux session — all previous output and state is preserved.

The terminal appears in two places: (1) a **full terminal page** accessible from the sidebar nav when inside a worktree, and (2) a **pop-out panel** on the right edge of any workspace page, toggleable via keyboard shortcut. Both surfaces use the same terminal component and follow the same tmux reconnection rules.

## Goals

- **Seamless tmux integration**: Auto-create or re-attach to tmux sessions named by worktree branch convention (`NNN-slug`)
- **Session persistence**: tmux sessions survive page refreshes, browser restarts, and server restarts — reconnection is automatic and transparent
- **Two terminal surfaces**: A dedicated terminal page (from sidebar nav) and a pop-out right-edge panel (available on any workspace page)
- **Resizable everything**: Sidebar, left panel, main content, and pop-out panel can all be made very small or expanded — no complex mechanism, just draggable edges
- **Session discovery**: Left panel lists all available tmux sessions, highlights the current worktree's session, shows attached client count
- **Graceful degradation**: If tmux is not installed, fall back to raw shell with a toast warning explaining sessions won't persist
- **Multi-client support**: Two browser tabs (or main page + pop-out) can view the same tmux session simultaneously — input from either appears in both

## Non-Goals

- **Terminal multiplexer UI**: We do not build our own tmux-like split panes, tabs, or window management inside the browser. tmux handles that. The browser shows one tmux session at a time.
- **Remote SSH terminals**: The terminal connects to the local machine's tmux only. No SSH, no remote hosts.
- **Terminal recording/replay**: No scrollback persistence beyond what tmux provides. No session recording to files.
- **Custom shell configuration**: We use the user's default shell and tmux configuration. No `.tmux.conf` management.
- **Mobile/phone support**: Terminal requires a keyboard. No phone layout or touch optimizations.
- **Authentication/multi-user**: This is a single-user developer tool. No auth on WebSocket connections beyond same-machine access.

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| terminal | **NEW** | **create** | New business domain owning terminal UI, session management, WebSocket connection |
| _platform/panel-layout | existing | **modify** | Extend `PanelMode` union with `'sessions'` for terminal session list |
| _platform/events | existing | **consume** | Use `toast()` for tmux unavailable warning and connection status |
| _platform/sdk | existing | **consume** | Register terminal toggle command + `Ctrl+\`` keybinding |
| _platform/state | existing | **consume** | Publish pop-out panel visibility and connection state |
| _platform/workspace-url | existing | **consume** | Use `workspaceHref()` for deep-linking terminal sessions |

### New Domain Sketches

#### terminal [NEW]
- **Purpose**: Workspace-scoped terminal access via tmux. Users open terminal sessions for worktrees, run commands, monitor builds, and interact with agents — all within the browser. Sessions persist across page refreshes and browser restarts via tmux.
- **Boundary Owns**: Terminal page (`/workspaces/[slug]/terminal`), terminal session list, `TerminalView` component (xterm.js wrapper), pop-out terminal panel, WebSocket connection lifecycle, tmux session discovery and management, connection status display, terminal URL params, **sidecar WebSocket server** (`features/064-terminal/server/`)
- **Boundary Excludes**: tmux configuration (user's own `.tmux.conf`), shell configuration (user's `$SHELL`), panel layout primitives (owned by `_platform/panel-layout`), toast infrastructure (owned by `_platform/events`)

## Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=2, D=0, N=1, F=1, T=1 → Total P=7 (borderline CS-3/CS-4, rounding up due to native dependency and new transport layer)
- **Confidence**: 0.80
- **Assumptions**:
  - tmux is installed on the developer's machine (with graceful fallback if not)
  - macOS is primary target, Linux secondary
  - node-pty compiles successfully in the CI environment
  - The sidecar WebSocket server approach works alongside `next dev --turbopack` without HMR issues
- **Dependencies**:
  - `node-pty` native compilation requires C++ toolchain (Xcode CLT on macOS)
  - `@xterm/xterm` v5+ with Canvas renderer addon
  - `ws` library for WebSocket server
  - tmux 3.x+ on the host machine
- **Risks**:
  - **node-pty native build**: Could fail in CI or on uncommon architectures. Mitigation: use `node-pty-prebuilt-multiarch` if raw compilation fails.
  - **WebSocket sidecar port management**: Two processes need coordinated startup. Mitigation: fixed port (3001) with environment variable override.
  - **tmux window size conflicts**: Multiple clients with different terminal sizes cause tmux to use smallest dimensions. Mitigation: document behavior, accept as standard tmux behavior.
- **Phases**: 5 suggested
  1. Sidecar WebSocket server + node-pty + tmux integration (backend)
  2. TerminalView component with xterm.js (frontend core)
  3. Terminal page with PanelShell layout and session list (Surface 1)
  4. Pop-out terminal panel in DashboardShell (Surface 2)
  5. Polish: keybindings, theme sync, sidebar nav item, dev workflow

## Acceptance Criteria

**AC-01**: When a developer navigates to `/workspaces/[slug]/terminal` for a worktree named `064-tmux`, a terminal emulator appears showing a shell prompt. If no tmux session named `064-tmux` exists, one is created automatically with the CWD set to the worktree directory. If one already exists, the terminal re-attaches to it.

**AC-02**: When a developer types a command in the terminal (e.g., `echo hello`), the output appears in real-time with correct ANSI colors and formatting.

**AC-03**: When a developer refreshes the browser page while a long-running command is executing in tmux, the terminal reconnects and shows the ongoing output — no data is lost, and the command continues running.

**AC-04**: When a developer opens the same terminal URL on a different browser or machine (connected to the same server), they see the same tmux session content and can type commands that appear in all connected clients.

**AC-05**: When a developer presses `Ctrl+\`` (or clicks the terminal toggle button) while on any workspace page, a terminal overlay panel slides in from the right edge of the page (following the Plan 059 Phase 3 `AgentOverlayPanel` pattern — `position: fixed`, 480px wide), connected to the current worktree's tmux session.

**AC-06**: When the terminal overlay panel is open and the developer navigates between workspace pages (browser → agents → workflows), the terminal overlay stays open and connected — the WebSocket connection is not interrupted. This works because the overlay is rendered in the workspace layout (via `TerminalOverlayProvider`), not in individual page components.

**AC-07**: When a developer resizes the left panel (session list) on the terminal page by dragging its edge, the terminal emulator re-fits to the new dimensions and the tmux session is notified of the size change.

**AC-08**: When a developer drags the left panel edge to make it very small (150px), the panel shrinks accordingly without breaking the layout.

**AC-09**: The left panel of the terminal page displays a list of all available tmux sessions. The current worktree's session is highlighted. Each session shows its name and whether it has attached clients (green dot = active, gray dot = detached).

**AC-10**: When a developer selects a different tmux session from the session list, the main terminal area switches to that session.

**AC-11**: When tmux is not installed on the machine, the terminal falls back to a raw shell (user's `$SHELL`). A toast warning appears: "tmux not available — sessions won't persist across page refreshes."

**AC-12**: The terminal sidebar nav item ("Terminal") appears in the workspace Tools group only when the user is inside a worktree — consistent with Browser, Agents, Work Units, and Workflows.

**AC-13**: When the developer closes the overlay panel (click X or press `Ctrl+\``), the WebSocket connection is closed and the PTY is cleaned up, but the tmux session continues running in the background.

## Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `node-pty` fails to compile in CI | Medium | High | Use prebuilt binaries; add build tools to CI image |
| WebSocket sidecar startup race with `next dev` | Low | Medium | Fixed port with retry logic; `concurrently` handles startup order |
| tmux window size conflict with multiple viewers | Low | Low | Accept smallest-client-wins (standard tmux behavior); document |
| xterm.js strict mode double-mount leaks | Medium | Medium | Comprehensive cleanup in useEffect return; disposed flag pattern |
| Turbopack incompatibility with xterm.js CSS import | Low | Low | Dynamic import with `ssr: false` isolates xterm from SSR |

| Assumption | Confidence |
|------------|-----------|
| Developer has tmux 3.x+ installed (or feature degrades gracefully) | High |
| macOS + Homebrew is the primary development environment | High |
| Single-user tool — no auth needed on WebSocket | High |
| `next/dynamic` with `ssr: false` works in Next.js 16 for xterm.js | High (confirmed by deep research DR-01) |
| CSS `resize: horizontal` is sufficient for panel resizing (no library) | High (confirmed by Plan 043 Phase 3) |
| Sidecar WS server preserves Turbopack HMR | High (confirmed by deep research DR-02) |

## Open Questions

*All resolved — see Clarifications below.*

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Terminal UI: Main View & Pop-Out | Integration Pattern | ✅ **COMPLETED** — see `workshops/001-terminal-ui-main-and-popout.md` | Layout hierarchy, resize behavior, state management, connection lifecycle |

## Testing Strategy

- **Approach**: Hybrid — TDD for backend (WebSocket server, tmux session service, PTY lifecycle), lightweight for frontend (React components, xterm.js integration)
- **Rationale**: Backend process management is stateful and error-prone (race conditions, cleanup, reconnection). Frontend is mostly integration with xterm.js library — visual verification is more valuable than unit tests.
- **Mock Usage**: Avoid mocks entirely — use fake objects (FakeWebSocket, FakePty, FakeTmuxExecutor) with injectable functions, consistent with ADR-0002 and the CopilotCLIAdapter pattern from Plan 057.
- **Focus Areas**:
  - WebSocket server: connection lifecycle, session tracking, multi-client, cleanup on disconnect
  - tmux session service: create-or-attach, session listing, fallback to raw shell, validation
  - PTY lifecycle: spawn, data piping, resize, cleanup without killing tmux session
  - React components: render test for TerminalView (dynamic import), session list rendering
- **Excluded**: Visual appearance of terminal output, xterm.js rendering internals, tmux UI behavior

## Documentation Strategy

- **Location**: `docs/how/` only
- **Rationale**: Terminal introduces a sidecar WebSocket server (new dev workflow), native dependency (node-pty requiring C++ toolchain), and justfile changes. Developer setup guide is essential. domain.md covers the domain contract documentation.
- **Documents to Create**:
  - `docs/how/dev/terminal-setup.md` — Prerequisites (tmux, node-pty build tools), dev workflow (`just dev` with sidecar), troubleshooting

## Clarifications

### Session 2026-03-02

**Q1: Workflow Mode** → **Full** — Multi-phase plan, required dossiers, all gates. Justified by CS-4 complexity, new domain, native dependency, new transport layer.

**Q2: Testing Strategy** → **Hybrid** — TDD for backend (WebSocket server, tmux session service, PTY lifecycle), lightweight for frontend (React components, xterm.js integration).

**Q3: Mock Usage** → **Avoid mocks entirely** — Use fake objects (FakeWebSocket, FakePty, FakeTmuxExecutor) with injectable functions. Consistent with ADR-0002 and CopilotCLIAdapter pattern.

**Q4: Documentation Strategy** → **docs/how/ only** — Terminal setup and dev workflow guide at `docs/how/dev/terminal-setup.md`.

**Q5: Domain Review** → **Boundary confirmed** — Sidecar WebSocket server lives inside terminal domain (`features/064-terminal/server/`). `PanelMode` extension is backward-compatible. No concerns about existing domain contracts.

**Q6: WebSocket Server Port** → **WS_PORT = NEXT_PORT + 1500** — Derived from Next.js port to support multiple concurrent worktree dev servers. Examples: 3000→4500, 3001→4501. Client reads `location.port` and adds 1500 to connect. Overridable via `TERMINAL_WS_PORT` env var.

**Q7: Session Auto-Creation** → **Current worktree only** — Navigating to the terminal page auto-creates a tmux session for the current worktree (using the branch name convention). Other existing sessions appear in the list but are not auto-created.
