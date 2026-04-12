# Domain: Terminal

**Slug**: terminal
**Type**: business
**Created**: 2026-03-02
**Created By**: Plan 064 — Terminal Integration via tmux
**Status**: active

## Purpose

Browser-based terminal emulator connected to tmux sessions for persistent, reconnectable shell access within workspace pages. Developers can run commands, monitor builds, and interact with the system without leaving the browser. Sessions survive page refreshes, browser restarts, and server restarts via tmux.

## Boundary

### Owns
- Sidecar WebSocket server (terminal-ws.ts) — standalone Node.js process alongside Next.js
- tmux session lifecycle (tmux-session-manager.ts) — create, attach, list, validate, fallback
- xterm.js terminal component (terminal-inner.tsx) — rendering, resize, theme, cleanup
- WebSocket client hook (use-terminal-socket.ts) — connect, reconnect, message parsing
- Terminal page (Surface 1) — PanelShell composition with session list
- Terminal overlay panel (Surface 2) — persistent right-edge panel across workspace pages
- Copy buffer clipboard integration (copy-tmux-buffer.ts) — deferred ClipboardItem pattern
- Session list fetching (use-terminal-sessions.ts)
- Connection status display (connection-status-badge.tsx)
- URL params (terminal.params.ts)
- Test doubles (fake-pty.ts, fake-tmux-executor.ts)

### Does NOT Own
- PanelShell layout framework — belongs to `_platform/panel-layout`
- Toast notifications — belongs to `_platform/events` (sonner)
- SDK command/keybinding registration — belongs to `_platform/sdk`
- Workspace URL resolution — belongs to `_platform/workspace-url`
- Sidebar navigation — shared `navigation-utils.ts`

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `TerminalView` | Component | Terminal page, external consumers | Dynamic-imported xterm.js wrapper (`ssr: false`). Props: sessionName, cwd, className, onConnectionChange |
| `TerminalOverlayPanel` | Component | Workspace layout | Fixed-position right-edge panel. Consumes `useTerminalOverlay()` context |
| `TerminalOverlayProvider` | Provider | Workspace layout | React context provider for overlay state. Listens for `terminal:toggle` custom events |
| `useTerminalOverlay()` | Hook | Any workspace component | Returns: isOpen, sessionName, cwd, openTerminal, closeTerminal, toggleTerminal |
| `ConnectionStatusBadge` | Component | Terminal page header, overlay header | Displays connecting/connected/disconnected status with reconnect button |
| `TerminalSkeleton` | Component | Suspense boundaries | Loading placeholder during dynamic import |
| `copyTmuxBuffer()` | Function | Terminal page header, overlay header | Clipboard write with deferred ClipboardItem Promise pattern + modal fallback |
| `TerminalSession` | Type | Session list, API route | `{ name, attached, windows, created, isCurrentWorktree }` |
| `TerminalMessage` | Type | WS server, WS client | `{ type: 'data'\|'resize'\|'status', ... }` |
| `ConnectionStatus` | Type | Components, hooks | `'connecting' \| 'connected' \| 'disconnected'` |
| `PtySpawner` | Type | Server, test doubles | `(name, cwd, cols, rows) → PtyProcess` |
| `CommandExecutor` | Type | Server, test doubles | `(command, args) → { code, output }` |
| `createTerminalServer()` | Factory | Sidecar entry point | Creates WS server with injectable deps. Supports WSS via env vars |

## Custom Events (Cross-Boundary Communication)

| Event | Dispatched By | Listened By | Payload |
|-------|--------------|------------|---------|
| `terminal:toggle` | Sidebar button, SDK command | TerminalOverlayProvider | none |
| `terminal:copy-buffer` | copyTmuxBuffer() | terminal-inner.tsx | none |
| `terminal:clipboard-data` | terminal-inner.tsx (onClipboard) | copyTmuxBuffer() | `{ data, error }` |
| `terminal:show-copy-modal` | copyTmuxBuffer() (on failure) | terminal-inner.tsx | none |

## Dependencies

### This Domain Depends On
| Domain | Contract Used | Why |
|--------|-------------|-----|
| _platform/panel-layout | PanelShell, PanelMode, LeftPanel | Page composition (Surface 1) |
| _platform/events | sonner toast | tmux unavailable warning (AC-11) |
| _platform/sdk | registerCommand, registerKeybinding | `terminal.toggleOverlay` + `$mod+Backquote` |
| _platform/workspace-url | workspaceHref() | Sidebar navigation link |
| activity-log | appendActivityLogEntry(), shouldIgnorePaneTitle() | Sidecar writes activity entries to worktree log |

### Domains That Depend On This
| Domain | Contract Used | Why |
|--------|-------------|-----|
| activity-log | Pane title source (sidecar polls tmux) | Terminal sidecar is the first activity log event source |

## Source Location

```
apps/web/src/features/064-terminal/
├── index.ts                          # Barrel exports (contracts)
├── types.ts                          # Public types
├── domain.md                         # This file
├── components/
│   ├── terminal-inner.tsx            # Core xterm.js component (internal)
│   ├── terminal-view.tsx             # Dynamic import wrapper (contract)
│   ├── terminal-skeleton.tsx         # Loading placeholder (contract)
│   ├── terminal-overlay-panel.tsx    # Right-edge overlay (contract)
│   ├── terminal-page-client.tsx      # Surface 1 page composition (internal)
│   ├── terminal-page-header.tsx      # Page header bar (internal)
│   ├── terminal-session-list.tsx     # Session list panel (internal)
│   └── connection-status-badge.tsx   # Status indicator (contract)
├── hooks/
│   ├── use-terminal-socket.ts        # WS lifecycle (internal)
│   ├── use-terminal-sessions.ts      # Session list fetching (internal)
│   └── use-terminal-overlay.tsx      # Overlay context/provider/hook (contract)
├── lib/
│   └── copy-tmux-buffer.ts           # Deferred clipboard write (contract)
├── params/
│   └── terminal.params.ts            # nuqs URL params (contract)
└── server/
    ├── terminal-ws.ts                # Sidecar WS/WSS server (internal)
    └── tmux-session-manager.ts       # tmux session lifecycle (internal)

app/(dashboard)/workspaces/[slug]/
├── terminal/
│   ├── layout.tsx                    # Pass-through route layout
│   └── page.tsx                      # Server component entry point
└── terminal-overlay-wrapper.tsx      # Error boundary + dynamic import

app/api/terminal/
└── route.ts                          # GET: tmux list-sessions JSON

test/fakes/
├── fake-pty.ts                       # FakePty test double
└── fake-tmux-executor.ts             # FakeTmuxExecutor test double
```

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | 3000 | Next.js port. WS port = PORT + 1500 |
| `TERMINAL_WS_PORT` | (derived) | Override WS port explicitly |
| `TERMINAL_WS_HOST` | 127.0.0.1 | Bind address. Set `0.0.0.0` for remote access |
| `TERMINAL_WS_CERT` | (none) | Path to TLS cert for WSS |
| `TERMINAL_WS_KEY` | (none) | Path to TLS key for WSS |

## History

| Plan | Change | Date |
|------|--------|------|
| 064-tmux Phase 1 | Sidecar WS server, tmux session manager, types, fakes | 2026-03-02 |
| 064-tmux Phase 2 | TerminalView component, WS hook, status badge, skeleton | 2026-03-02 |
| 064-tmux Phase 3 | Terminal page, session list, API route, nav item | 2026-03-02 |
| 064-tmux Phase 4 | Overlay panel, provider, SDK command, sidebar button | 2026-03-03 |
| 064-tmux Post-P4 | Copy buffer (deferred clipboard), HTTPS/WSS, ESM fix | 2026-03-03 |
| 064-tmux Phase 5 | tmux fallback toast, domain docs, dev setup guide | 2026-03-03 |
| Plan 081 | 25 terminal color themes (Dracula, Nord, Catppuccin, etc.) via SDK setting + Palette popover picker in header | 2026-04-10 |
