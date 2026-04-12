# Workshop: xterm.js in a Mobile/Touch-First World

**Type**: Integration Pattern
**Plan**: 078-mobile-experience
**Spec**: (pre-spec — exploration-driven)
**Created**: 2026-04-12
**Status**: Draft

**Related Documents**:
- [Workshop 001 — Mobile Swipeable Panel Experience](001-mobile-swipeable-panel-experience.md)
- [Exploration Report](../exploration.md)
- [Terminal Domain](../../../domains/terminal/domain.md)
- [Plan 064 — tmux terminal integration](../../064-tmux/tmux-spec.md)

**Domain Context**:
- **Primary Domain**: `terminal` — owns TerminalView, TerminalInner, WebSocket hook, tmux session manager
- **Related Domains**: `_platform/panel-layout` (mobile shell hosts terminal view), `_platform/viewer` (content view coexists with terminal)

---

## Purpose

Design the mobile terminal experience for Chainglass. The terminal runs xterm.js v6 connected to tmux via WebSocket, hosting TUI apps (Copilot CLI, vim, htop). This workshop addresses: how does xterm.js actually work on mobile, what breaks, what needs custom handling, and what's the pragmatic path to a usable phone terminal.

## Key Questions Addressed

- Does xterm.js work on mobile out of the box? What breaks?
- How do we handle virtual keyboard input with xterm.js?
- Should we use CanvasAddon or DOM renderer on mobile?
- How do copy/paste and clipboard work on iOS/Android?
- What font size and terminal dimensions work on a 390px phone?
- How does tmux mouse mode interact with touch?
- What do production mobile terminals (Blink Shell, Termius) do differently?

---

## Current State: What We Already Have

```typescript
// apps/web/src/features/064-terminal/components/terminal-inner.tsx

const terminal = new Terminal({
  cursorBlink: true,
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', ..., monospace",
  scrollback: 10000,
  allowProposedApi: true,
});

// Addons loaded:
// - CanvasAddon    — GPU-accelerated rendering
// - FitAddon       — auto-resize to container
// - ClipboardAddon — OSC 52 clipboard support
// - WebLinksAddon  — clickable URLs

// Mobile-aware features already present:
// - visualViewport listener for keyboard offset (lines 99-115)
// - Touch detection: 'ontouchstart' in window || navigator.maxTouchPoints > 0
// - Copy modal fallback for HTTP/iOS clipboard restrictions (lines 396-424)
// - tmux show-buffer server-side copy (WebSocket control message)
```

**What works**: Terminal renders, WebSocket connects, commands execute, keyboard offset adjusts.

**What doesn't work well on mobile**: Touch scrolling, text selection, keyboard auto-show, font size too large, copy/paste friction, TUI navigation.

---

## How xterm.js Actually Works on Mobile

### Touch Event Handling

xterm.js **does not have comprehensive built-in touch support**. It relies on the browser's translation of touch events into mouse events. This creates several problems:

| Behavior | Desktop | Mobile |
|----------|---------|--------|
| Scrolling | Mouse wheel → scroll | Touch → unreliable, fails on text areas on iOS |
| Text selection | Click + drag | Long-press → OS selection menu (not xterm selection) |
| Right-click menu | Right mouse button | Long-press (conflicts with selection) |
| Keyboard input | Physical keyboard | Hidden textarea → virtual keyboard |
| Copy/paste | Ctrl+C/V | OS clipboard gestures → restricted by Clipboard API |

**Critical iOS bug**: Touch scrolling fails when initiated on text elements in the DOM renderer. Users can only scroll by touching empty space. This is a known xterm.js issue documented in the GitHub repo.

**Recent fixes (2026)**: CSS `touch-action` property applied to `.xterm-screen` element, and touch scrolling patches for mobile — but these may not be in our installed version (@xterm/xterm v6.0.0).

### Hidden Textarea Architecture

xterm.js captures keyboard input via a hidden `<textarea>` element positioned off-screen. This is essential for mobile because:

1. Mobile browsers require a focused editable element to show the virtual keyboard
2. The textarea receives IME composition events (Android predictive text)
3. It handles paste events from the OS clipboard

**Problem**: The textarea isn't always properly focused on mobile tap, so the keyboard may not appear. Users tap the terminal but nothing happens.

**Solution**: Explicitly focus the textarea on terminal tap:

```typescript
// When terminal view becomes active (e.g., swipe to terminal view)
const focusTerminal = () => {
  const textarea = containerRef.current?.querySelector('textarea.xterm-helper-textarea');
  if (textarea) {
    textarea.focus({ preventScroll: true });
  }
};
```

### IME Composition (Android)

Android's predictive keyboard sends `compositionstart` → `compositionupdate` → `compositionend` events. xterm.js handles these, but imperfectly:

- Predictive text can appear ahead of the cursor
- Autocomplete suggestions may inject unexpected characters
- Some keyboard apps (GBoard, Samsung Keyboard) behave differently

**Pragmatic approach**: Accept minor IME quirks. Users running TUI apps on mobile are power users who'll disable autocorrect anyway. Consider adding a note in the UI: "Disable autocorrect for best terminal experience."

---

## Renderer Choice: Canvas vs DOM on Mobile

### Performance Analysis

| Factor | CanvasAddon | DOM Renderer |
|--------|-------------|--------------|
| Desktop performance | Excellent (GPU-accelerated) | Good |
| Mobile performance | Variable (CPU-bound 2D context) | Better on most phones |
| Battery impact | Higher (continuous GPU draw) | Lower |
| Touch scrolling | Works (canvas doesn't intercept touch) | iOS bug: fails on text elements |
| Text selection | Not supported (it's a canvas) | Browser-native (but conflicts with xterm) |
| Memory | Character atlas + canvas buffer | DOM nodes per cell |
| Low-end devices | Can cause jank | More forgiving |

### Recommendation

**RESOLVED**: Keep CanvasAddon on mobile. Rationale:

1. **Touch scrolling actually works better** with CanvasAddon because the canvas element doesn't have the iOS DOM text-touch bug
2. Our terminal dimensions on mobile are small (≈45×25), so canvas performance is fine
3. Text selection is handled via `tmux show-buffer` + copy modal anyway, not browser-native selection
4. We already have CanvasAddon loaded with graceful fallback (try/catch in terminal-inner.tsx:228-234)

If we see performance issues on low-end phones, we can add a runtime check:

```typescript
// Future: fall back to DOM renderer on low-end devices
const useCanvas = !navigator.hardwareConcurrency || navigator.hardwareConcurrency >= 4;
```

---

## Font Size and Terminal Dimensions

### The Math

On a 390px iPhone viewport with monospace font:

| Font Size | Char Width (approx) | Columns | Readable? | iOS Auto-zoom? |
|-----------|-------------------|---------|-----------|----------------|
| 10px | ~6px | 65 cols | Tiny, straining | No |
| 11px | ~6.6px | 59 cols | Small but usable | No |
| 12px | ~7.2px | 54 cols | Good sweet spot | No |
| 13px | ~7.8px | 50 cols | Comfortable | No |
| 14px (current) | ~8.4px | 46 cols | Desktop-optimized | No |
| 16px | ~9.6px | 40 cols | Large, few columns | No (≥16px is safe) |

**Note**: iOS auto-zoom only affects `<input>` and `<textarea>` elements with font-size < 16px, not canvas. Our hidden textarea should be 16px to prevent zoom when keyboard opens. The visible terminal canvas is unaffected.

### Recommendation

**RESOLVED**: Use **12px** font size on phone, **14px** on tablet/desktop.

```typescript
const isPhone = window.innerWidth < 768;
const terminal = new Terminal({
  fontSize: isPhone ? 12 : 14,
  // ...
});
```

At 12px with a 390px viewport and ~12px side padding:
- **≈54 columns × 35 rows** (portrait, no keyboard)
- **≈54 columns × 15 rows** (portrait, keyboard open)
- Enough for most CLI tools, vim with line numbers, htop

If the user wants larger text, we can add a font size control in the terminal header.

### Rows When Keyboard Opens

```
┌──────────────────────┐
│ Swipe strip    42px  │
├──────────────────────┤
│                      │
│  Terminal content     │ ~340px = ~28 rows @ 12px
│  $ copilot           │
│  > What do?          │
│  > _                 │
│                      │
├──────────────────────┤
│  [Virtual keyboard]  │ ~300px
│                      │
│                      │
│  [q][w][e][r][t][y]  │
│  [a][s][d][f][g][h]  │
│  [z][x][c][v][b][n]  │
│  [space]             │
└──────────────────────┘

FitAddon.fit() handles this automatically via ResizeObserver + visualViewport.
tmux receives the resize event and reflows.
```

---

## tmux Mouse Mode and Touch

### How tmux Mouse Mode Works

With `set -g mouse on`, tmux captures mouse events for:
- Pane selection (click on a pane)
- Window selection (click on status bar)
- Pane resizing (drag pane borders)
- Scroll mode (scroll wheel → enters copy-mode)
- Text selection (click+drag in copy-mode)

### Touch Translation

Browsers translate touch events to mouse events:
- **Single tap** → `mousedown` + `mouseup` + `click`
- **Long press** → `mousedown` (delayed `mouseup`)
- **Scroll** → `wheel` events (via touch momentum)

**What works**: Single tap for pane selection, scroll for copy-mode entry.

**What breaks**: Drag for text selection (conflict with page scroll), pane resize (needs precise drag on tiny borders), right-click context menu.

### Recommendation

**RESOLVED**: Keep `mouse on` in tmux. It mostly works. The edge cases (pane resize, text selection via drag) are rare on mobile — users will use the Copy button instead. The scroll-to-enter-copy-mode behavior is actually useful on mobile.

**Do NOT disable mouse mode** — it would break scroll-mode, which is essential for reviewing terminal output on a small screen.

---

## Copy/Paste on Mobile

### The Clipboard Landscape

| Platform | Clipboard Write | Clipboard Read | Restrictions |
|----------|----------------|----------------|--------------|
| iOS Safari | `navigator.clipboard.writeText()` in HTTPS + user gesture | Very restricted | Must be in response to tap/click |
| Chrome Android | `navigator.clipboard.writeText()` in HTTPS | Clipboard API with permission | Requires secure context |
| HTTP (dev) | Fails silently | Fails | No clipboard API |

### Current Copy Flow (Already Implemented)

```
User taps "Copy" button
       │
       ▼
WebSocket: { type: "copy-buffer" }
       │
       ▼
Server: tmux show-buffer → returns text
       │
       ▼
Client: try navigator.clipboard.writeText(text)
       │
       ├── Success → toast "Copied!"
       │
       └── Failure (HTTP, iOS restrictions)
               │
               ▼
          Show copy modal with <textarea>
          User long-press → Select All → Copy
```

**This flow is already mobile-safe.** The copy modal at lines 396-424 in `terminal-inner.tsx` is the fallback. No changes needed for basic copy.

### Mobile Copy Improvements

1. **Copy modal size**: Currently hard-coded to 800×800px. Change to responsive:
   ```typescript
   style={{ maxWidth: '95vw', maxHeight: '80vh', width: '100%' }}
   ```

2. **Paste**: Mobile users paste via long-press → Paste on the hidden textarea. This works because xterm.js's textarea receives paste events and sends them via `terminal.onData()`. **No changes needed.**

3. **Visible Copy button**: On mobile, always show the Copy button in the terminal header (it's already there). Consider making it larger (48px touch target).

---

## What Blink Shell and Termius Do Differently

### Blink Shell (iOS) — Gesture-First Design

| Gesture | Action |
|---------|--------|
| Two-finger tap | New shell session |
| Swipe left/right | Switch between shells |
| Pinch | Adjust font size |
| Tap + drag | Enter text selection mode |
| Double-tap home bar | Context menu |
| Three-finger tap | Paste |

**Key insight**: Blink Shell separates "navigation gestures" (multi-finger) from "terminal interaction" (single-finger). Single finger is always terminal — scrolling and typing. Multi-finger is always UI navigation.

### Termius — Toolbar Approach

Termius adds an **extra toolbar row** above the keyboard with:
- Tab, Ctrl, Alt, Esc modifier keys
- Arrow keys (←↑↓→)
- Common shortcuts (Ctrl+C, Ctrl+D)

This solves the "how do I press Ctrl+C on a phone keyboard" problem.

### What We Should Steal

1. **Modifier key toolbar** — a small row above the keyboard with Ctrl, Alt, Esc, Tab, arrows. This is the single most impactful mobile terminal improvement.
2. **Font size control** — pinch-to-zoom or a +/- control in the header
3. **Single-finger = terminal, multi-finger = navigation** — but we already solve navigation via the top swipe strip, so this is less relevant

---

## Mobile Terminal Toolbar Design

The most impactful change for mobile terminal UX is a **modifier key toolbar** that appears above the virtual keyboard.

```
┌──────────────────────────────────────────┐
│  Terminal content                          │
│  $ vim config.yaml                         │
│  ---                                       │
│  server:                                   │
│    port: 3000                              │
├──────────────────────────────────────────┤
│  [Esc] [Tab] [Ctrl] [Alt] │ [←][↑][↓][→] │  ← Modifier toolbar (36px)
├──────────────────────────────────────────┤
│  [q][w][e][r][t][y][u][i][o][p]           │
│  [a][s][d][f][g][h][j][k][l]             │  ← Virtual keyboard
│  [z][x][c][v][b][n][m]                    │
│  [space]                                   │
└──────────────────────────────────────────┘
```

### Implementation

```tsx
interface TerminalToolbarProps {
  onKey: (key: string) => void;
  onModifier: (mod: 'ctrl' | 'alt' | 'esc' | 'tab') => void;
}

function TerminalToolbar({ onKey, onModifier }: TerminalToolbarProps) {
  const [ctrlActive, setCtrlActive] = useState(false);
  const [altActive, setAltActive] = useState(false);

  const sendKey = (key: string) => {
    if (ctrlActive) {
      // Ctrl+key: send ASCII control character
      const code = key.toUpperCase().charCodeAt(0) - 64;
      onKey(String.fromCharCode(code));
      setCtrlActive(false);
    } else {
      onKey(key);
    }
  };

  return (
    <div className="flex h-9 items-center gap-1 px-2 border-t bg-surface">
      <ToolbarKey label="Esc" onTap={() => onKey('\x1b')} />
      <ToolbarKey label="Tab" onTap={() => onKey('\t')} />
      <ToolbarKey
        label="Ctrl"
        active={ctrlActive}
        onTap={() => setCtrlActive(!ctrlActive)}
      />
      <ToolbarKey
        label="Alt"
        active={altActive}
        onTap={() => setAltActive(!altActive)}
      />
      <div className="flex-1" />
      <ToolbarKey label="←" onTap={() => onKey('\x1b[D')} />
      <ToolbarKey label="↑" onTap={() => onKey('\x1b[A')} />
      <ToolbarKey label="↓" onTap={() => onKey('\x1b[B')} />
      <ToolbarKey label="→" onTap={() => onKey('\x1b[C')} />
    </div>
  );
}
```

The toolbar sends key data through the existing `terminal.onData` → WebSocket pipeline. Ctrl+C becomes `\x03`, Esc becomes `\x1b`, arrow keys are ANSI escape sequences.

**Positioning**: The toolbar sits between the terminal content and the virtual keyboard. Use the existing `visualViewport` offset to position it correctly. When keyboard is closed, toolbar hides.

---

## Practical Changes Required for Mobile Terminal

### Priority 1: Essential (V1)

| Change | Where | What |
|--------|-------|------|
| **Font size 12px on phone** | `terminal-inner.tsx` | `fontSize: isPhone ? 12 : 14` |
| **Copy modal responsive** | `terminal-inner.tsx:400` | Replace `width: '800px'` with `width: '100%'` |
| **Focus on view-switch** | `terminal-inner.tsx` or `mobile-panel-shell.tsx` | Call `terminal.focus()` when terminal view becomes active |
| **touch-action CSS** | `terminal-inner.tsx` or global CSS | Add `touch-action: manipulation` to `.xterm-screen` |
| **Prevent iOS zoom on textarea** | `terminal-inner.tsx` | Ensure hidden textarea has `font-size: 16px` |

### Priority 2: High Impact (V1 if time allows)

| Change | Where | What |
|--------|-------|------|
| **Modifier key toolbar** | New component in `064-terminal` | Esc, Tab, Ctrl, Alt, arrow keys above keyboard |
| **Refit on view-active** | `mobile-panel-shell.tsx` callback | `FitAddon.fit()` when terminal view is swiped to |
| **Larger Copy button** | `terminal-page-client.tsx` | 48px touch target for mobile |

### Priority 3: Nice to Have (V2)

| Change | Where | What |
|--------|-------|------|
| Font size +/- control | Terminal header | User-adjustable 10-18px range |
| Pinch-to-zoom | Custom pointer event handler | Map pinch gesture to font size change |
| DOM renderer fallback | `terminal-inner.tsx` | Switch from Canvas on low-end devices |
| Haptic feedback | Modifier toolbar | `navigator.vibrate(10)` on Ctrl/Alt/Esc tap |

---

## Open Questions

### Q1: Should we detect phone and auto-set font size?

**RESOLVED**: Yes. Use `useResponsive().isPhone` to set `fontSize: 12` on phone. Users can override via a +/- control later (V2).

### Q2: Should we disable tmux mouse mode on phone?

**RESOLVED**: No. Keep `mouse on`. Scroll-to-copy-mode is useful. Pane resize edge case is acceptable.

### Q3: When keyboard opens, should we hide the swipe strip?

**OPEN**: Options:
- **Option A**: Hide swipe strip when keyboard is open — more terminal rows, but user can't switch views without closing keyboard
- **Option B**: Keep swipe strip — fewer rows, but navigation always available
- **Leaning**: Option B — keep it visible. Users might want to quickly check a file while typing a command.

### Q4: Should we show the modifier toolbar always or only when keyboard is open?

**RESOLVED**: Only when keyboard is open. Use `visualViewport` height change to detect keyboard state. When `window.innerHeight - visualViewport.height > 100`, keyboard is likely open.

### Q5: What about landscape mode on phone?

**OPEN**: Landscape gives more columns (~90) but very few rows (~12). This is actually great for wide terminal output. No special handling needed — FitAddon handles it. But the swipe strip + toolbar eat into the already-tiny vertical space.

---

## Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Renderer | CanvasAddon (keep current) | Better touch scroll on iOS, small terminal size = fine perf |
| Font size (phone) | 12px | ~54 cols, readable, good density |
| Font size (tablet/desktop) | 14px (unchanged) | Current behavior |
| tmux mouse mode | Keep `mouse on` | Scroll-mode is essential |
| Copy mechanism | Keep tmux show-buffer + modal | Already mobile-safe |
| Copy modal size | Responsive (100% width) | Fix the 800px hard-code |
| Keyboard input | Hidden textarea (xterm default) | Works, just needs proper focus |
| Modifier toolbar | New component, above keyboard | Esc/Tab/Ctrl/Alt/arrows |
| touch-action | `manipulation` on .xterm-screen | Prevent double-tap zoom, fix scroll |
| iOS textarea zoom | Set textarea font-size: 16px | Prevent viewport zoom |

---

## Navigation

- **Plan**: [078-mobile-experience](../exploration.md)
- **Related Workshop**: [001 — Mobile Swipeable Panel Experience](001-mobile-swipeable-panel-experience.md)
- **Domain**: [Terminal](../../../domains/terminal/domain.md)
- **Terminal Source**: `apps/web/src/features/064-terminal/`
