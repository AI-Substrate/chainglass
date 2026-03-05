# Workshop: tmux Copy Buffer Button

**Type**: Integration Pattern
**Plan**: 064-tmux
**Spec**: [tmux-spec.md](../tmux-spec.md)
**Created**: 2026-03-03
**Status**: Draft

**Related Documents**:
- [Workshop 001: Terminal UI](001-terminal-ui-main-and-popout.md)
- [Workshop 002: Terminal WS Authentication](002-terminal-ws-authentication.md)

**Domain Context**:
- **Primary Domain**: `terminal` — button lives in terminal header components
- **Related Domains**: `_platform/panel-layout` (ExplorerPanel hosts the button on non-terminal pages)

---

## Purpose

OSC 52 clipboard passthrough from tmux → node-pty → WebSocket → xterm.js doesn't reliably reach the browser clipboard, especially with tmux mouse mode intercepting selections. This workshop designs a "Copy tmux buffer" button that grabs the tmux paste buffer server-side and writes it to the browser clipboard — a guaranteed workaround that works regardless of OSC 52 support.

## Key Questions Addressed

- How does the browser get the tmux paste buffer contents?
- Where does the button appear (terminal page header, overlay header, explorer bar)?
- How does the clipboard write work on HTTP (non-HTTPS) origins?

---

## Overview

When a user selects text in tmux mouse mode, tmux copies to its internal paste buffer. The browser can't access this directly. We add a button that:

1. Browser sends `{type: 'copy-buffer'}` message over existing WS connection
2. Sidecar server runs `tmux show-buffer` and returns `{type: 'clipboard', data: '...'}`
3. Browser writes to clipboard via `navigator.clipboard.writeText()`

```
User selects text in tmux (mouse mode)
        │
        ▼
tmux copies to paste buffer
        │
        ▼
User clicks 📋 button (or Ctrl+Shift+C)
        │
        ▼
Browser → WS: {type: "copy-buffer"}
        │
        ▼
Server: execSync("tmux show-buffer")
        │
        ▼
Server → WS: {type: "clipboard", data: "selected text..."}
        │
        ▼
Browser: navigator.clipboard.writeText(data)
        │
        ▼
Toast: "Copied to clipboard"
```

## Protocol Extension

### New WS Messages

**Client → Server:**
```json
{ "type": "copy-buffer" }
```

**Server → Client:**
```json
{ "type": "clipboard", "data": "the copied text content" }
```

**Server → Client (error):**
```json
{ "type": "clipboard", "data": "", "error": "No buffer available" }
```

### Server Handler (terminal-ws.ts)

```typescript
if (msg.type === 'copy-buffer') {
  try {
    const buffer = execSync('tmux show-buffer', { encoding: 'utf8' }).trim();
    ws.send(JSON.stringify({ type: 'clipboard', data: buffer }));
  } catch {
    ws.send(JSON.stringify({ type: 'clipboard', data: '', error: 'No buffer available' }));
  }
  return;
}
```

### Client Handler (use-terminal-socket.ts)

Add `clipboard` to the `CONTROL_TYPES` whitelist and add `onClipboard` callback:

```typescript
const CONTROL_TYPES = new Set(['status', 'error', 'sessions', 'clipboard']);

// In message handler:
if (msg.type === 'clipboard' && msg.data) {
  onClipboardRef.current?.(msg.data);
}
```

## Button Placement

### Terminal Page Header

```
┌─[Terminal]────────────────────────────────────────────────────┐
│ TerminalSquare  064-tmux          📋 Copy   ● Connected       │
└───────────────────────────────────────────────────────────────┘
```

Add clipboard button to `terminal-page-header.tsx` between session name and status badge.

### Overlay Panel Header

```
┌──────────────────────────────────────────┐
│ TerminalSquare  064-tmux    📋  ●  ✕     │
└──────────────────────────────────────────┘
```

Add clipboard button to `terminal-overlay-panel.tsx` header.

### ExplorerPanel (stretch goal)

Not needed initially — the button is only useful when viewing a terminal. The toggle button already exists there.

## Clipboard API Constraints

- `navigator.clipboard.writeText()` requires **secure context** (HTTPS or localhost)
- On `192.168.1.32:3002` (HTTP, not localhost), clipboard API may be blocked
- **Fallback**: Use `document.execCommand('copy')` with a hidden textarea (works on HTTP)
- **iOS Safari**: Clipboard write requires user gesture (button click qualifies)

### Clipboard Write Helper

```typescript
async function writeToClipboard(text: string): Promise<boolean> {
  // Try modern API first
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* fall through */ }
  }
  // Fallback for HTTP origins
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(textarea);
  return ok;
}
```

## Implementation Tasks

| # | Task | File | Effort |
|---|------|------|--------|
| 1 | Add `copy-buffer` handler to WS server | `terminal-ws.ts` | ~5 lines |
| 2 | Add `clipboard` to control types + `onClipboard` callback | `use-terminal-socket.ts` | ~10 lines |
| 3 | Add `writeToClipboard` helper | `hooks/use-clipboard-copy.ts` (new) | ~20 lines |
| 4 | Add copy button to `terminal-page-header.tsx` | `terminal-page-header.tsx` | ~10 lines |
| 5 | Add copy button to `terminal-overlay-panel.tsx` | `terminal-overlay-panel.tsx` | ~10 lines |
| 6 | Toast feedback ("Copied" / "No buffer") | Uses existing `sonner` toast | ~3 lines |

**Total: ~60 lines across 5 files. No new dependencies.**

## Open Questions

### Q1: Should we also support Ctrl+Shift+C as a keyboard shortcut?

**OPEN**: Standard terminal copy shortcut. Would need to intercept before xterm.js. Could conflict with tmux's own Ctrl+Shift+C if configured. Start with button only, add shortcut later.

### Q2: Should the button show buffer preview (first 50 chars)?

**OPEN**: Nice UX touch but adds complexity. Start without, add if requested.

---

## Quick Reference

```
# Test tmux buffer has content:
tmux show-buffer

# Test from browser console (after implementation):
# Click copy button → check clipboard
```
