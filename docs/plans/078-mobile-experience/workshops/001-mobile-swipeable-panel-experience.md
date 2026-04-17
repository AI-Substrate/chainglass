# Workshop: Mobile Swipeable Panel Experience

**Type**: Integration Pattern / UX Flow
**Plan**: 078-mobile-experience
**Spec**: (pre-spec — exploration-driven)
**Created**: 2026-04-12
**Status**: Draft

**Related Documents**:
- [Exploration Report](../exploration.md)
- [Responsive Patterns](../../../how/responsive-patterns.md)
- [Panel Layout Domain](../../../domains/_platform/panel-layout/domain.md)
- [Terminal Domain](../../../domains/terminal/domain.md)

**Domain Context**:
- **Primary Domain**: `_platform/panel-layout` — owns PanelShell, layout constants, breakpoints
- **Related Domains**: `terminal` (xterm.js interaction), `file-browser` (tree + viewer), `_platform/viewer` (content display)

---

## Purpose

Design the mobile phone layout for workspace pages that currently use `PanelShell`. On phone viewports (`<768px`), the three-panel desktop layout (explorer + left + main) must transform into **swipeable full-screen views** where each panel gets 100% of the screen, and users swipe horizontally to navigate between them.

This workshop resolves the critical tension: **horizontal swipe navigation must coexist with xterm.js terminal interaction** (scrolling, text selection, copy/paste, virtual keyboard input).

## Key Questions Addressed

- How should horizontal swipe navigation work without breaking terminal interaction?
- What's the view order, and how do users know which view they're on?
- Where does the sidebar/menu go on mobile?
- How do we keep multiple heavy views (xterm.js, syntax highlighter, file tree) performant when mounted?
- What happens when the virtual keyboard opens/closes?

---

## Design Overview

### The Mental Model

```
┌─────────────────────────────────────────────────┐
│  Phone viewport (390 × 844)                     │
│                                                  │
│  ┌─────┐ ┌─────┐ ┌─────┐                       │
│  │ TRM │ │ VWR │ │ TRE │   ← 3 full-screen     │
│  │     │ │     │ │     │     views in a          │
│  │     │ │     │ │     │     horizontal strip    │
│  │     │ │     │ │     │                         │
│  └─────┘ └─────┘ └─────┘                        │
│    ◄──── swipe left ────►                        │
│                                                  │
│  ┌──────────────────────────┐                    │
│  │ ● ○ ○    View indicator  │   ← top strip     │
│  └──────────────────────────┘                    │
│                                                  │
│  ┌──────────────────────────┐                    │
│  │ ☰  Home  ⚡  Terminal    │   ← bottom nav     │
│  └──────────────────────────┘                    │
└─────────────────────────────────────────────────┘
```

### View Order

| Position | View | Content | Default |
|----------|------|---------|---------|
| 0 (left) | **Terminal** | Full-screen xterm.js session | ✅ Start here |
| 1 (center) | **Content** | FileViewer / MarkdownViewer / DiffViewer | |
| 2 (right) | **File Browser** | File tree + directory listing | |

**Rationale**: Terminal is the primary workspace tool — users land there first. Swipe left to see file content, swipe again to browse the tree. Clicking a file in the tree (view 2) auto-navigates to the content view (view 1).

### Navigation Mechanisms

Users can switch views via:

1. **Swipe** — horizontal swipe on the **top navigation strip** (≈48px tall)
2. **Tap** — tap view indicator dots or labels in the top strip
3. **Programmatic** — clicking a file in the tree switches to content view

Swipe is **only** available in the top strip area. The main content area below passes all touch events through to the active view (terminal, viewer, tree).

---

## Gesture Architecture

### The Conflict Problem

```
┌────────────────────────────┐
│  ┌──── Swipe Zone ──────┐  │  ← 48px: horizontal swipe = view switch
│  │  ● Terminal  ○  ○    │  │     
│  └──────────────────────┘  │
│  ┌──── Content Zone ────┐  │  ← Remaining height: all touches go to
│  │                       │  │     the active view (xterm, viewer, tree)
│  │  $ ls -la             │  │
│  │  drwxr-xr-x  apps    │  │     In terminal: scroll, select, type
│  │  drwxr-xr-x  docs    │  │     In viewer: scroll, select, copy
│  │  -rw-r--r--  README   │  │     In tree: scroll, tap to open
│  │                       │  │
│  └──────────────────────┘  │
│  ┌──── Bottom Nav ──────┐  │  ← 56px: existing BottomTabBar
│  │  ☰   📁   ⚡   ⚙️    │  │
│  └──────────────────────┘  │
└────────────────────────────┘
```

### Why Top-Strip Swipe Zone (Not Full-Screen)

| Approach | Pro | Con | Verdict |
|----------|-----|-----|---------|
| Full-screen swipe + gesture disambiguation | More discoverable | Conflicts with xterm scroll, text select, tmux scroll-mode | ❌ Too risky |
| Edge-based swipe (from screen edges) | No zone needed | iOS back-swipe conflict on left edge; easy accidental triggers | ❌ Platform clash |
| **Top strip swipe zone** | Zero conflict with content | Slightly less discoverable | ✅ **Chosen** |
| Button-only (no swipe) | Simplest | Doesn't feel native | ❌ Not enough |

**The top strip is both a swipe target AND a tap target.** It shows:
- View labels: "Terminal", "Content", "Files"
- Active indicator (dot, underline, or bold)
- Can swipe left/right on it to switch views

### Swipe Zone Implementation

```
┌────────────────────────────────────────┐
│  ◀  Terminal  │  Content  │  Files  ▶  │  48px tall
└────────────────────────────────────────┘
       ●             ○           ○        dot indicators

Touch behavior:
- Tap a label → jump to that view
- Swipe left/right on this strip → animate to adjacent view
- Swipe velocity threshold: 300px/s OR 50px drag distance
```

### CSS Scroll-Snap Implementation

The view container uses native CSS scroll-snap for the actual view positioning:

```css
.mobile-views {
  display: flex;
  overflow-x: hidden;           /* NOT scroll — we control it */
  scroll-snap-type: x mandatory;
  width: 100%;
  height: calc(100% - 48px - 56px); /* minus top strip and bottom nav */
}

.mobile-view {
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  scroll-snap-align: start;
  overflow-y: auto;             /* Each view scrolls vertically */
  contain: layout style paint;  /* Performance isolation */
}

.mobile-view:not(.active) {
  visibility: hidden;           /* Don't render off-screen views */
  pointer-events: none;
}
```

**We do NOT use `overflow-x: scroll` on the container.** The views are positioned via `transform: translateX()` and animated with CSS transitions. The scroll-snap is on the top strip only.

### Alternative: `scrollTo` on the Container

A simpler approach — let the browser handle it:

```css
.mobile-views {
  display: flex;
  overflow-x: scroll;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;        /* hide scrollbar */
}

.mobile-views::-webkit-scrollbar {
  display: none;
}

.mobile-view {
  flex: 0 0 100%;
  scroll-snap-align: start;
}
```

Then to switch views: `container.scrollTo({ left: viewIndex * window.innerWidth, behavior: 'smooth' })`.

**Problem**: This makes the entire container swipeable, which conflicts with xterm. **We reject this for the content area.**

### Chosen Approach: Transform-Based with Top-Strip Swipe

```javascript
// State
let activeView = 0; // 0=terminal, 1=content, 2=files
const VIEW_COUNT = 3;

// Container position
function setView(index) {
  activeView = Math.max(0, Math.min(VIEW_COUNT - 1, index));
  const container = document.querySelector('.mobile-views');
  container.style.transform = `translateX(-${activeView * 100}%)`;
  updateIndicators(activeView);
}

// Top strip swipe handler
const strip = document.querySelector('.swipe-strip');
let startX = 0;
let startTime = 0;

strip.addEventListener('pointerdown', (e) => {
  startX = e.clientX;
  startTime = Date.now();
  strip.setPointerCapture(e.pointerId);
});

strip.addEventListener('pointerup', (e) => {
  const deltaX = e.clientX - startX;
  const velocity = Math.abs(deltaX) / (Date.now() - startTime);
  
  if (Math.abs(deltaX) > 50 || velocity > 0.3) {
    setView(activeView + (deltaX > 0 ? -1 : 1));
  }
});
```

---

## View Details

### Terminal View (Position 0)

```
┌────────────────────────────┐
│  ● Terminal  ○ Content  ○  │  swipe strip
├────────────────────────────┤
│                            │
│  $ npm run build           │
│  > chainglass@1.0.0 build  │
│  > turbo run build         │
│                            │
│  ████████░░ 80%            │
│                            │
│  $ _                       │  ← cursor, keyboard input
│                            │
│                            │
├────────────────────────────┤
│  [virtual keyboard]        │  ← iOS/Android keyboard
└────────────────────────────┘
```

**Mobile-specific terminal behavior**:
- `touch-action: manipulation` on the xterm container (prevents double-tap zoom)
- `user-select: none` on xterm (use copy button instead of text selection)
- Virtual keyboard offset via existing `visualViewport` handling
- `font-size: 16px` on any input to prevent iOS auto-zoom
- Copy button visible at top-right — triggers existing `tmux show-buffer` flow

**What we DON'T change**: xterm.js vertical scrolling (tmux scroll-mode), keyboard input, command execution. These all work as-is within the full-screen terminal view.

### Content View (Position 1)

```
┌────────────────────────────┐
│  ○  ● Content  ○ Files     │  swipe strip
├────────────────────────────┤
│  📄 src/index.ts           │  file path bar (mini explorer)
├────────────────────────────┤
│  1  import { app } from .. │
│  2  import { config } ..   │
│  3                         │
│  4  const server = app()   │
│  5  server.listen(3000)    │
│  6                         │
│  7  // Health check        │
│  8  server.get('/health',  │
│  9    (req, res) => {      │
│ 10      res.json({ ok })   │
│ 11    })                   │
│                            │
├────────────────────────────┤
│  ☰   📁   ⚡   ⚙️          │  bottom nav
└────────────────────────────┘
```

**Behavior**:
- Shows whatever file is currently selected (via `file` URL param)
- If no file selected: shows a "Select a file" placeholder with a button to jump to Files view
- Supports: FileViewer (code), MarkdownViewer (preview), DiffViewer, binary viewers
- Vertical scroll for long files — no conflict with horizontal swipe (swipe is in top strip only)
- Mini file path bar shows current file name — tappable to reveal full path

### File Browser View (Position 2)

```
┌────────────────────────────┐
│  ○  ○ Content  ● Files     │  swipe strip
├────────────────────────────┤
│  📁 /src                   │  current directory
├────────────────────────────┤
│  📁 components/        ▶   │  48px touch targets
│  📁 features/          ▶   │
│  📁 hooks/             ▶   │
│  📁 lib/               ▶   │
│  📄 index.ts               │
│  📄 layout.tsx             │
│  📄 globals.css            │
│                            │
├────────────────────────────┤
│  ☰   📁   ⚡   ⚙️          │  bottom nav
└────────────────────────────┘
```

**Behavior**:
- Full-screen file tree (not the compressed sidebar tree)
- Minimum 48px row height for touch targets
- Tap folder → expand/navigate into it
- Tap file → set `file` URL param + auto-switch to Content view (position 1)
- Back button or breadcrumb trail for directory navigation
- Search/filter input at top (optional, V2)

---

## Sidebar / Menu on Mobile

The existing `BottomTabBar` handles global navigation (Home, Workflows, etc.). For workspace-level navigation, we repurpose the hamburger/menu button:

```
┌────────────────────────────┐
│  ☰  ← tap to open sheet   │
├────────────────────────────┤
│                            │  Sheet slides up from bottom
│  ┌──────────────────────┐  │  (Radix Sheet, already used
│  │  Workspace: chainglas │  │   by sidebar on mobile)
│  │  Worktree: main       │  │
│  │  ─────────────────── │  │
│  │  📁 Browser           │  │
│  │  ⚡ Terminal           │  │
│  │  🔄 Workflows         │  │
│  │  🤖 Agents            │  │
│  │  ⚙️  Settings          │  │
│  └──────────────────────┘  │
│                            │
└────────────────────────────┘
```

This is the existing sidebar Sheet behavior. No new pattern needed.

---

## Performance Strategy

### Keeping Views Mounted

All three views stay mounted to preserve state (terminal WS connection, scroll position, expanded tree nodes). Off-screen views are hidden via CSS:

```css
.mobile-view {
  contain: layout style paint;  /* Isolate layout/paint costs */
}

.mobile-view[data-active="false"] {
  visibility: hidden;
  pointer-events: none;
}
```

- **Terminal**: xterm.js stays connected via WebSocket. `FitAddon.fit()` called when view becomes active (reflow to correct dimensions).
- **Content viewer**: Static HTML — no reflow needed. Shiki-highlighted code stays in DOM.
- **File tree**: React tree with lazy-loaded directories. Stays expanded.

### Memory Budget

| View | Estimated DOM nodes | Notes |
|------|-------------------|-------|
| Terminal | ~2,000 | xterm.js virtual rendering; only visible rows in DOM |
| Content | ~500–5,000 | Depends on file size; Shiki pre-renders |
| File tree | ~200–1,000 | Lazy per-directory; only expanded nodes |

Total: ~3,000–8,000 nodes. Well within mobile browser limits.

---

## Virtual Keyboard Handling

```
Before keyboard:                After keyboard:
┌──────────────┐               ┌──────────────┐
│  ● TRM ○ ○   │ 48px         │  ● TRM ○ ○   │ 48px
├──────────────┤               ├──────────────┤
│              │               │              │
│  $ _         │ 740px         │  $ _         │ ~340px
│              │               │              │
│              │               ├──────────────┤
│              │               │  [keyboard]  │ ~400px
│              │               │              │
├──────────────┤               └──────────────┘
│  ☰  📁  ⚡   │ 56px          bottom nav hidden
└──────────────┘                behind keyboard
```

- Use existing `visualViewport` resize handler (already in `terminal-inner.tsx`)
- When keyboard opens: terminal refits to smaller height via `FitAddon.fit()`
- Bottom nav naturally hides behind keyboard
- No JavaScript needed — the viewport shrinks, flexbox recalculates

---

## Component Architecture

### New Components (in `_platform/panel-layout`)

```
panel-layout/
  components/
    panel-shell.tsx              ← MODIFY: add mobile branch
    mobile-panel-shell.tsx       ← NEW: swipeable view container
    mobile-swipe-strip.tsx       ← NEW: top navigation strip
    mobile-view.tsx              ← NEW: wrapper for each view
```

### Modified PanelShell

```tsx
export function PanelShell({ explorer, left, main, autoSaveId }: PanelShellProps) {
  const { useMobilePatterns } = useResponsive();

  if (useMobilePatterns) {
    return (
      <MobilePanelShell
        explorer={explorer}
        left={left}
        main={main}
      />
    );
  }

  // Existing desktop layout unchanged
  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="shrink-0">{explorer}</div>
      <div className="flex flex-1 overflow-hidden">
        <div className="shrink-0 overflow-hidden border-r"
             style={{ width: 280, minWidth: 150, maxWidth: '50%', resize: 'horizontal' }}>
          {left}
        </div>
        <div className="flex-1 flex flex-col overflow-hidden" data-terminal-overlay-anchor>
          {main}
        </div>
      </div>
    </div>
  );
}
```

### MobilePanelShell

```tsx
interface MobilePanelShellProps {
  explorer: ReactNode;  // Not rendered directly — content view may use mini version
  left: ReactNode;      // Becomes "Files" view (position 2)
  main: ReactNode;      // Becomes "Content" view (position 1)
}

function MobilePanelShell({ explorer, left, main }: MobilePanelShellProps) {
  const [activeView, setActiveView] = useState(0);
  const views = ['Terminal', 'Content', 'Files'];

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <MobileSwipeStrip
        views={views}
        activeView={activeView}
        onViewChange={setActiveView}
      />
      <div
        className="flex flex-1 overflow-hidden transition-transform duration-300 ease-out"
        style={{ transform: `translateX(-${activeView * 100}%)`, width: '300%' }}
      >
        <MobileView active={activeView === 0}>
          {/* Terminal — rendered by page, not from PanelShell props */}
          {main} {/* or dedicated terminal slot */}
        </MobileView>
        <MobileView active={activeView === 1}>
          {main}
        </MobileView>
        <MobileView active={activeView === 2}>
          {left}
        </MobileView>
      </div>
    </div>
  );
}
```

> **Open Question**: The terminal view is currently rendered inside `MainPanel` by `TerminalPageClient`, while the file browser renders tree in `LeftPanel` and viewer in `MainPanel`. The mobile shell needs to re-slot these — see Q1 below.

---

## Open Questions

### Q1: How do consumers pass mobile-specific view content?

**OPEN**: PanelShell currently takes `explorer`, `left`, `main`. On mobile, we need potentially different content for 3 views. Options:

- **Option A**: Add optional `mobileViews` prop: `{ terminal?: ReactNode, content?: ReactNode, files?: ReactNode }`
- **Option B**: Infer from existing props — `left` becomes files view, `main` becomes content view, terminal page provides terminal in `main`
- **Option C**: Separate `MobilePanelShell` that consumers opt into explicitly

**Leaning**: Option B — least API change. The browser page's `main` (FileViewerPanel) IS the content view. The browser page's `left` (FileTree) IS the files view. Terminal page needs special handling since its `main` IS the terminal.

### Q2: Terminal view — where does it come from on the browser page?

**OPEN**: On the browser page, there's no terminal in PanelShell — it's in the overlay. On mobile, we want terminal as view 0.

- **Option A**: Pull terminal from overlay into the mobile shell
- **Option B**: Terminal view 0 is only available on the terminal page; browser page has only Content + Files (2 views)
- **Option C**: Always show terminal as view 0 by embedding `TerminalView` in mobile shell

**Leaning**: Option B for V1 — keeps it simple. Terminal page = 2 views (terminal + sessions). Browser page = 2 views (content + files). Different view sets per page.

### Q3: Should the swipe strip be scroll-snap or transform-based?

**RESOLVED**: Transform-based for the content area (no accidental swipes on xterm). The top strip itself can use scroll-snap or simple pointer events — either works since it's small and has no conflicting content.

---

## Prototype Plan

A static HTML mockup in `scratch/mobile-prototype/` served via Python HTTP server for phone testing.

### What the Prototype Tests

1. Swipe-strip feel — is the top strip intuitive for view switching?
2. View transition animation — does `transform + transition` feel smooth?
3. Terminal interaction — can we type, scroll, select in the "terminal" area without triggering view switches?
4. Virtual keyboard — does the layout adapt when an input is focused?
5. Dot indicators — are they visible and useful?

### What the Prototype Does NOT Test

- Real xterm.js (uses a styled div with fake terminal output)
- Real file tree (uses hardcoded file list)
- Real syntax highlighting (uses `<pre>` with monospace text)
- WebSocket connections
- React component architecture

The prototype is pure HTML + CSS + vanilla JS, all inlined in a single file.

---

## Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Swipe zone | Top strip only (48px) | Zero conflict with xterm; tap + swipe on same element |
| View positioning | CSS `transform: translateX` | Programmatic control; no accidental scroll-snap on content |
| Animation | `transition: transform 300ms ease-out` | Native CSS, GPU-accelerated, smooth |
| Off-screen views | `visibility: hidden` + `contain` | Mounted but not painted; preserves state |
| Terminal refit | `FitAddon.fit()` on view-become-active | Standard xterm pattern |
| Sidebar on mobile | Bottom-sheet (existing Radix Sheet) | Already implemented, familiar pattern |
| iPad treatment | Desktop layout (no change) | `useResponsive.useMobilePatterns` is false for tablets |
| View count | Per-page: browser=2 (content+files), terminal=2 (terminal+sessions) | V1 simplicity |

---

## Navigation

- **Plan**: [078-mobile-experience](../exploration.md)
- **Domain**: [Panel Layout](../../../domains/_platform/panel-layout/domain.md)
- **Responsive Patterns**: [docs/how/responsive-patterns.md](../../../how/responsive-patterns.md)
