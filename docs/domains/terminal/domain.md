# Domain: Terminal

**Slug**: terminal
**Type**: business
**Created**: 2026-03-02
**Created By**: Plan 064 — tmux terminal integration
**Status**: active

## Purpose

Workspace-scoped terminal access via tmux. Users open terminal sessions for worktrees, run commands, monitor builds, and interact with agents — all within the browser. Sessions persist across page refreshes and browser restarts via tmux. The terminal automatically creates or re-attaches to tmux sessions named by the worktree branch convention (e.g., `064-tmux`).

## Boundary

### Owns
- Terminal page (`/workspaces/[slug]/terminal`) — PanelShell composition with session list + terminal emulator
- `TerminalView` component — xterm.js wrapper with WebSocket connection (dynamic import, ssr: false)
- `TerminalOverlayPanel` — fixed-position right-edge overlay that persists across workspace page navigation (Plan 059 AgentOverlayPanel pattern)
- `TerminalOverlayProvider` + `useTerminalOverlay()` — context/hook for overlay open/close/toggle
- `TerminalSessionList` — left panel session list with status dots and current worktree highlighting
- Sidecar WebSocket server (`features/064-terminal/server/`) — node-pty + tmux session management
- `TmuxSessionManager` — tmux create/attach/list/validate with fallback to raw shell
- Terminal URL params (`session`) via nuqs
- Connection status display (`ConnectionStatusBadge`)

### Does NOT Own
- tmux configuration (user's own `.tmux.conf`)
- Shell configuration (user's `$SHELL`)
- Panel layout primitives (`PanelShell`, `LeftPanel`, `MainPanel` — owned by `_platform/panel-layout`)
- Toast infrastructure (owned by `_platform/events`)
- Command palette / keybinding service (owned by `_platform/sdk`)
- Global state system (owned by `_platform/state`)

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `TerminalView` | Component | Terminal page, overlay panel | xterm.js wrapper with WebSocket; accepts `sessionName`, `cwd`, `onConnectionChange` |
| `TerminalOverlayPanel` | Component | Workspace layout | Fixed-position overlay; renders when overlay is open |
| `TerminalOverlayProvider` | Component | Workspace layout | React context providing overlay open/close/toggle |
| `useTerminalOverlay()` | Hook | Sidebar toggle button, SDK command | Returns `{ isOpen, openTerminal, closeTerminal, toggleTerminal }` |
| `terminalParams` | nuqs defs | Terminal page | URL param: `session` (active tmux session name) |
| `TerminalSession` | Type | Session list, overlay | `{ name, attached, windows, created, isCurrentWorktree }` |
| `TerminalMessage` | Type | WS server, client hook | `{ type: 'data' \| 'resize' \| 'status', ... }` |
| `ConnectionStatus` | Type | Status badge, header | `'connecting' \| 'connected' \| 'disconnected'` |

## Composition (Internal)

| Component | Role | Depends On |
|-----------|------|------------|
| TerminalPageClient | Composes PanelShell with header, session list, terminal | PanelShell, LeftPanel, MainPanel, TerminalView |
| TerminalView | Dynamic import wrapper (ssr: false) | terminal-inner.tsx |
| terminal-inner.tsx | xterm.js + WebSocket + FitAddon + Canvas renderer | use-terminal-socket, @xterm/xterm |
| TerminalOverlayPanel | Fixed-position overlay with header + TerminalView | useTerminalOverlay, TerminalView |
| TerminalSessionList | Session list with status dots | use-terminal-sessions |
| TmuxSessionManager | tmux CLI wrapper: create/attach/list/validate | node child_process (injectable executor) |
| terminal-ws.ts | Sidecar WebSocket server | ws, node-pty, TmuxSessionManager |

## Source Location

Primary: `apps/web/src/features/064-terminal/`

| File | Role | Notes |
|------|------|-------|
| `components/terminal-view.tsx` | Dynamic import wrapper (contract) | ssr: false for xterm.js |
| `components/terminal-inner.tsx` | xterm.js + WebSocket + FitAddon | Internal; not exported |
| `components/terminal-overlay-panel.tsx` | Fixed overlay (contract) | Plan 059 AgentOverlayPanel pattern |
| `components/terminal-session-list.tsx` | Session list for left panel | Internal |
| `components/terminal-page-client.tsx` | Page composition | Internal |
| `components/terminal-page-header.tsx` | Custom header bar | Internal |
| `components/connection-status-badge.tsx` | Status indicator | Internal |
| `components/terminal-skeleton.tsx` | Loading placeholder | Internal |
| `hooks/use-terminal-overlay.tsx` | Overlay context + hook (contract) | Provider + useTerminalOverlay |
| `hooks/use-terminal-socket.ts` | WebSocket lifecycle | Internal |
| `hooks/use-terminal-sessions.ts` | Session list fetching | Internal |
| `server/terminal-ws.ts` | Sidecar WebSocket server | Runs as separate process |
| `server/tmux-session-manager.ts` | tmux CLI wrapper | Injectable executor functions |
| `params/terminal.params.ts` | nuqs URL params (contract) | `session` param |
| `types.ts` | Public types (contract) | TerminalSession, TerminalMessage, ConnectionStatus |
| `index.ts` | Barrel export | Created Phase 1 |
| `domain.md` | Domain documentation | This file |

## Dependencies

### This Domain Depends On
- `_platform/panel-layout` — PanelShell, LeftPanel, MainPanel, PanelMode (extended with `'sessions'`)
- `_platform/events` — toast() for tmux unavailable warning, connection status
- `_platform/sdk` — IUSDK, ICommandRegistry for terminal toggle command + Ctrl+\` keybinding
- `_platform/state` — useGlobalState for connection state
- `_platform/workspace-url` — workspaceHref() for deep-linking terminal sessions
- `@xterm/xterm` — terminal emulator (npm)
- `@xterm/addon-fit` — auto-resize (npm)
- `@xterm/addon-canvas` — Canvas renderer (npm)
- `@xterm/addon-web-links` — clickable URLs (npm)
- `node-pty` — PTY spawning for tmux/bash (npm, native)
- `ws` — WebSocket server (npm)
- `next-themes` — theme sync (npm, already installed)
- `sonner` — toast notifications (npm, already installed)
- `nuqs` — URL params (npm, already installed)
- `lucide-react` — icons (npm, already installed)

### Domains That Depend On This
- (none currently — leaf business domain)

## History

| Plan | What Changed | Date |
|------|-------------|------|
| Plan 064 | Domain created: terminal page, overlay, WS server, tmux session manager, 8 components, 3 hooks, 3 types | 2026-03-02 |
| Plan 064 Phase 2 | Added TerminalView component (xterm.js + WS + resize + theme + strict cleanup), use-terminal-socket hook, ConnectionStatusBadge, TerminalSkeleton | 2026-03-02 |
