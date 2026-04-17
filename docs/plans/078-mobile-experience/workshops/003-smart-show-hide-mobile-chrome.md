# Workshop: Smart Show/Hide for Mobile Toolbars and Overlays

**Type**: UX Pattern
**Plan**: 078-mobile-experience
**Spec**: [mobile-experience-spec.md](../mobile-experience-spec.md)
**Created**: 2026-04-12
**Status**: Draft

**Related Documents**:
- [Workshop 001 — Mobile Swipeable Panel Experience](001-mobile-swipeable-panel-experience.md)
- [Workshop 002 — xterm.js Mobile/Touch-First](002-xterm-mobile-touch-first.md)

**Domain Context**:
- **Primary Domain**: `terminal` — modifier key toolbar
- **Related Domains**: `_platform/panel-layout` — explorer bar on mobile, `file-browser` — search on mobile

---

## Purpose

Design the show/hide behavior for two mobile-only UI elements that must not permanently consume vertical space:

1. **Modifier key toolbar** — Esc, Tab, Ctrl, Alt, arrow keys for the terminal
2. **Explorer bar** — path bar, search, command palette for the file browser

Both need to be **instantly accessible** but **invisible by default**. On a 390×844 viewport with a 42px swipe strip and 50px bottom nav, we have ~752px of usable height. Every pixel of chrome we add permanently shrinks the workspace content.

## Key Questions Addressed

- How does the modifier toolbar appear when the keyboard opens and disappear when it closes?
- How does the explorer bar appear without stealing vertical space from the content?
- Should these use the same show/hide pattern or different ones?
- What triggers show/hide — automatic detection, user gesture, or both?

---

## The Vertical Space Budget

```
┌─────────────────────────┐
│  Swipe strip       42px │  fixed
├─────────────────────────┤
│                         │
│  CONTENT AREA           │  ~752px (no keyboard)
│                         │  ~352px (keyboard open)
│                         │
├─────────────────────────┤
│  Bottom nav        50px │  fixed
└─────────────────────────┘

With keyboard open:
┌─────────────────────────┐
│  Swipe strip       42px │
├─────────────────────────┤
│  CONTENT AREA     ~316px│  ← if toolbar added: ~280px
│                         │
├─────────────────────────┤
│  Modifier toolbar  36px │  ← only when keyboard is open
├─────────────────────────┤
│  [Virtual keyboard]     │  ~400px
│                         │
└─────────────────────────┘
  (bottom nav hidden behind keyboard)
```

**Key constraint**: The modifier toolbar costs 36px, but only when the keyboard is already consuming ~400px. The net loss is small relative to the keyboard's impact. The explorer bar, however, would cost ~44px from full content height — more painful.

---

## Element 1: Modifier Key Toolbar

### The Problem

Mobile keyboards lack Esc, Tab, Ctrl, Alt, and arrow keys. These are essential for:
- `Ctrl+C` — interrupt command / exit process
- `Ctrl+D` — EOF / exit shell
- `Esc` — exit vim insert mode, cancel TUI menus
- `Tab` — autocomplete
- Arrow keys — navigate TUI menus (Copilot CLI), vim movement

### Design: Keyboard-Docked Toolbar

The toolbar behaves like iOS's `inputAccessoryView` — it **docks above the virtual keyboard** and moves with it.

```
Keyboard closed:                    Keyboard open:
┌──────────────────────┐           ┌──────────────────────┐
│  ⚡ Terminal          │           │  ⚡ Terminal          │
├──────────────────────┤           ├──────────────────────┤
│                      │           │  $ vim config.yaml   │
│  $ ls                │           │  ---                 │
│  apps/ docs/ pkg/    │           │  server:             │
│  $ _                 │           │    port: 3000        │
│                      │           ├──────────────────────┤
│                      │           │ Esc Tab Ctrl Alt │←↑↓→│ 36px
│                      │           ├──────────────────────┤
├──────────────────────┤           │  [q][w][e][r][t][y]  │
│  Home  Workspace  ⚡  │           │  [a][s][d][f][g][h]  │
└──────────────────────┘           │  [z][x][c][v][b][n]  │
                                   │  [space]             │
  Toolbar: NOT VISIBLE             └──────────────────────┘
                                     Bottom nav: HIDDEN
                                     (behind keyboard)
```

### Show/Hide Mechanism

**Detection**: Use `visualViewport` API (already in `terminal-inner.tsx`):

```typescript
const KEYBOARD_THRESHOLD = 150; // px — keyboard is at least this tall

function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const check = () => {
      const offset = window.innerHeight - vv.height;
      setOpen(offset > KEYBOARD_THRESHOLD);
    };

    check();
    vv.addEventListener('resize', check);
    return () => vv.removeEventListener('resize', check);
  }, []);

  return open;
}
```

**Rules**:
- Toolbar appears **automatically** when keyboard opens (viewport shrinks by >150px)
- Toolbar disappears **automatically** when keyboard closes
- No manual toggle needed — the keyboard IS the toggle
- Toolbar sits at `position: fixed; bottom: <keyboard-height>px`
- When toolbar is visible, terminal refits to smaller height via `FitAddon.fit()` (ResizeObserver handles this)

### Why Automatic (Not Manual Toggle)

| Approach | Pro | Con | Verdict |
|----------|-----|-----|---------|
| Always visible | Always accessible | Wastes 36px when keyboard closed | ❌ |
| Manual toggle button | User controls | Extra tap to access Ctrl+C (critical path) | ❌ |
| **Auto on keyboard open** | Zero friction, appears exactly when needed | Can't dismiss while typing | ✅ |
| Auto + dismissible | Best of both | Over-engineered for V1 | ⏳ V2 |

**Why auto wins**: When is the modifier toolbar useful? Only when typing. When is the keyboard open? Only when typing. They're the same trigger. There's no scenario where the keyboard is open but the user wants to hide the toolbar — the 36px is negligible next to the ~400px keyboard.

### Toolbar Layout

```
┌──────────────────────────────────────────────────┐
│  [Esc] [Tab] [Ctrl] [Alt]  │  [←] [↑] [↓] [→]  │  36px
└──────────────────────────────────────────────────┘
   modifiers (left)              arrows (right)
   each: 44×32px touch target    each: 36×32px
```

- **Esc, Tab**: Momentary — tap sends key immediately
- **Ctrl, Alt**: Toggle — tap activates, next keypress on the virtual keyboard sends the modified key, then auto-deactivates. Visual feedback: background highlight + text color change when active.
- **Arrows**: Momentary — tap sends ANSI escape sequence

### Ctrl Toggle Behavior

```
User taps [Ctrl]
  → Ctrl highlights (active state)
  → User taps 'c' on virtual keyboard
  → Terminal receives \x03 (Ctrl+C = ASCII 3)
  → Ctrl auto-deactivates (returns to normal)

User taps [Ctrl] again (while active)
  → Ctrl deactivates (cancel without sending)
```

This is how Termius, Blink Shell, and every mobile SSH client implements it.

### CSS Positioning

```css
.modifier-toolbar {
  position: fixed;
  left: 0;
  right: 0;
  /* bottom is set dynamically via JS to sit above keyboard */
  z-index: 30;
  height: 36px;
  display: flex;
  align-items: center;
  background: var(--surface);
  border-top: 1px solid var(--border);
  backdrop-filter: blur(8px);
}
```

```typescript
// Position above keyboard using visualViewport
useEffect(() => {
  const vv = window.visualViewport;
  if (!vv || !toolbarRef.current) return;

  const position = () => {
    const keyboardHeight = window.innerHeight - vv.height;
    toolbarRef.current!.style.bottom = `${keyboardHeight}px`;
  };

  position();
  vv.addEventListener('resize', position);
  vv.addEventListener('scroll', position);
  return () => {
    vv.removeEventListener('resize', position);
    vv.removeEventListener('scroll', position);
  };
}, []);
```

---

## Element 2: Explorer Bar (Search / Command Palette)

### The Problem

The desktop ExplorerPanel provides:
- File path display + navigation
- Command palette (type `>` to search commands)
- FlowSpace code search
- File search

On mobile, this 44px bar would permanently consume ~6% of content height. But users still need search and the command palette.

### Design: Search Icon → Bottom Sheet

Instead of an always-visible bar, provide a **search icon in the segmented control** that opens a **bottom sheet** with the full explorer functionality.

```
Default state:                     Sheet open:
┌──────────────────────────┐      ┌──────────────────────────┐
│ 📁 Files │ 📄 Content │ 🔍│      │ 📁 Files │ 📄 Content │ 🔍│
├──────────────────────────┤      ├──────────────────────────┤
│                          │      │                          │
│  File tree / content     │      │  (dimmed backdrop)       │
│                          │      │                          │
│                          │      ├──────────────────────────┤
│                          │      │  ┌────────────────────┐  │
│                          │      │  │ 🔍 Search files...  │  │
│                          │      │  └────────────────────┘  │
│                          │      │                          │
│                          │      │  Recent:                 │
├──────────────────────────┤      │   panel-shell.tsx        │
│  Home  Workspace  ⚡      │      │   useResponsive.ts       │
└──────────────────────────┘      │   terminal-inner.tsx     │
                                  │                          │
  🔍 = search icon (right          │  Type > for commands     │
  side of segmented control)      └──────────────────────────┘
```

### Why Bottom Sheet (Not Top Bar)

| Approach | Pro | Con | Verdict |
|----------|-----|-----|---------|
| Always-visible top bar | No extra tap | 44px permanent loss | ❌ |
| Pull-down gesture | Feels native | Conflicts with system pull-down (notifications) | ❌ |
| Floating action button | Minimal chrome | Another tap target competing with content | ❌ |
| **Search icon → bottom sheet** | Zero permanent cost, familiar pattern, already have Sheet component | Extra tap to access | ✅ |
| Inline in segmented control | No new UI element | Makes segmented control crowded | ❌ |

### Show/Hide Mechanism

**Trigger**: Tap the search icon (🔍) in the segmented control strip.

**Implementation**: Use the existing shadcn/ui `Sheet` component (already used by mobile sidebar):

```tsx
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Search } from 'lucide-react';

function MobileExplorerSheet({ filePath, handlers, context, ...props }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="p-2" aria-label="Search files and commands">
          <Search className="h-4 w-4" />
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[60vh]">
        <ExplorerPanel
          filePath={filePath}
          handlers={handlers}
          context={context}
          {...props}
        />
      </SheetContent>
    </Sheet>
  );
}
```

**Behavior**:
- Sheet slides up from bottom (Radix Sheet, already handles backdrop + dismiss)
- Takes 60% of viewport height — enough for search results
- Dismiss: tap backdrop, swipe down, or press Escape
- When a file is selected from search, sheet auto-closes and navigates to Content view
- When a command is executed from palette, sheet auto-closes

### Search Icon Placement

The search icon sits **inside the segmented control strip**, right-aligned:

```
┌──────────────────────────────────────────┐
│ [pill]                                    │
│  📁 Files  │  📄 Content  │        [🔍]  │  42px
└──────────────────────────────────────────┘
   ← segmented tabs →        search button
```

For the terminal page (single view, no segmented control needed), the search icon can sit in the terminal header bar:

```
┌──────────────────────────────────────────┐
│  ⚡ Terminal  ·  main          [📋] [🔍]  │  42px
└──────────────────────────────────────────┘
    session name            copy  search
```

### Content Within the Sheet

The sheet reuses `ExplorerPanel` but adapted for full-width mobile:

```
┌────────────────────────────────────┐
│  ──── (drag handle)                │
│                                    │
│  ┌──────────────────────────────┐  │
│  │ 🔍 Search files...           │  │  auto-focused input
│  └──────────────────────────────┘  │
│                                    │
│  📄 panel-shell.tsx      1.8K      │  recent files (MRU)
│  📄 useResponsive.ts     3.2K      │
│  📄 terminal-inner.tsx   12K       │
│                                    │
│  ─── Commands (type >) ───         │
│  Registered: 12 commands           │
│                                    │
└────────────────────────────────────┘
```

When the user types `>`, it switches to command palette mode (existing `CommandPaletteDropdown` behavior, re-rendered in the sheet context).

---

## Pattern Comparison: The Two Elements

| Property | Modifier Toolbar | Explorer Bar |
|----------|-----------------|--------------|
| **Trigger** | Automatic (keyboard open) | Manual (tap search icon) |
| **Position** | Fixed, docked above keyboard | Bottom sheet overlay |
| **Dismiss** | Automatic (keyboard close) | Tap backdrop / swipe down |
| **Permanent space cost** | 0px (only when keyboard open) | 0px (sheet is overlay) |
| **Interaction model** | Momentary taps → keys sent | Search/navigate → auto-close |
| **Frequency of use** | Every terminal session | Occasional (find file, run command) |
| **Component** | New: `TerminalModifierToolbar` | Reuse: shadcn `Sheet` + `ExplorerPanel` |

**Key insight**: These are fundamentally different patterns because they have different triggers. The toolbar is **context-automatic** (keyboard state), the explorer is **user-initiated** (explicit action). Don't try to unify them.

---

## Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Toolbar show/hide | Auto on keyboard open/close via `visualViewport` | Zero friction; keyboard IS the use case |
| Toolbar positioning | `position: fixed; bottom: <keyboard-height>px` | Docks above keyboard like native `inputAccessoryView` |
| Toolbar toggle keys | Ctrl/Alt toggle on tap, auto-deactivate after one keypress | Industry standard (Termius, Blink Shell) |
| Toolbar dismiss | Auto only — no manual toggle in V1 | Extra tap hurts Ctrl+C critical path |
| Explorer trigger | Search icon (🔍) in segmented control strip | Zero permanent space, familiar icon |
| Explorer presentation | shadcn `Sheet` from bottom, 60vh | Reuses existing component, dismissible |
| Explorer content | Reuse `ExplorerPanel` component inside sheet | No duplication; same search/palette behavior |
| Explorer auto-close | Close sheet on file select or command execute | Frictionless flow back to content |
| Unification | None — different patterns for different triggers | Auto vs manual are fundamentally different UX |

---

## Open Questions

### Q1: Should the toolbar have a "dismiss" button?

**RESOLVED**: No, not in V1. Auto-hide on keyboard close is sufficient. If users report wanting to dismiss the toolbar while keeping the keyboard open (unlikely), add a small `×` button in V2.

### Q2: What if the keyboard detection threshold is wrong?

**RESOLVED**: Use 150px threshold. On all modern phones, keyboards are 250-450px tall. A 150px threshold avoids false positives from iOS Safari URL bar changes (~50px). If edge cases arise, make the threshold configurable via a constant.

### Q3: Should the explorer sheet be available on ALL mobile views or just Files/Content?

**RESOLVED**: Available on all workspace mobile views. The search icon appears in whatever header is visible (segmented control on browser page, terminal header on terminal page). Consistent access regardless of active view.

---

## Navigation

- **Plan**: [078-mobile-experience](../exploration.md)
- **Related**: [Workshop 001](001-mobile-swipeable-panel-experience.md), [Workshop 002](002-xterm-mobile-touch-first.md)
- **Domains**: [Terminal](../../../domains/terminal/domain.md), [Panel Layout](../../../domains/_platform/panel-layout/domain.md)
