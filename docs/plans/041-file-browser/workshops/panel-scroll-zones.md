# Workshop: Panel Scroll Zones & Sticky Headers

**Type**: UI Layout
**Plan**: 041-file-browser
**Spec**: [file-browser-spec.md](../file-browser-spec.md)
**Fix**: [FX002-panel-scroll-separation.md](../fixes/FX002-panel-scroll-separation.md)
**Created**: 2026-02-27
**Status**: Draft

**Related Documents**:
- [left-panel-view-modes.md](./left-panel-view-modes.md) — original sticky header design intent
- [file-path-utility-bar.md](./file-path-utility-bar.md) — ExplorerPanel design

---

## Purpose

Align on exactly which UI regions scroll, which stay fixed, and how the scroll containers are structured. The current implementation has triple-nested scroll contexts causing headers to scroll away. This workshop defines the correct layout.

## Key Questions Addressed

- Which headers stay pinned and which regions scroll?
- How many scroll containers should there be and where?
- Does file selection `scrollIntoView` still work correctly?
- Does editor `scrollToLine` still work correctly?

---

## Current Layout (Bug — Before Fix)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  EXPLORER BAR  [📋 path/to/file.md                              ]      │ ← shrink-0 ✅ stays
├────────────────────┬────────────────────────────────────────────────────┤
│ FILES [🌳] [Δ] [↻] │  [💾 Save] [Edit] [Preview] [Diff]   [↻] [↗]   │
│─────────────────── │──────────────────────────────────────────────────  │
│ ▶ src/             │  1 │ import React from 'react';                   │
│   ▶ components/    │  2 │ import { useState } from 'react';            │
│     file-tree.tsx  │  3 │                                               │
│     code-editor.tsx│  4 │ export function MyComponent() {               │
│   ▶ features/      │  5 │   const [count, setCount] = useState(0);     │
│     ...            │  6 │   return <div>{count}</div>;                  │
│     ...            │  7 │ }                                             │
│     ...            │  ...│  ...                                         │
│     ...            │  ...│  ...                                         │
│     ...            │  ...│  ...                                         │
└────────────────────┴────────────────────────────────────────────────────┘

  ← LEFT PANEL ──→   ← MAIN PANEL ─────────────────────────────────────→
```

### The Problem: Triple Nested Scroll

```
PanelShell left wrapper    ← overflow-y-auto    ← SCROLL CONTEXT 1 ❌
  └─ LeftPanel
       ├─ PanelHeader     ← sticky top-0       ← tries to stick to #1
       └─ content wrapper  ← overflow-y-auto    ← SCROLL CONTEXT 2
            └─ FileTree    ← overflow-y-auto    ← SCROLL CONTEXT 3 ❌
```

**What happens**: When the file tree is long enough to overflow, **Scroll Context 1** (PanelShell wrapper) can also scroll, which pulls the "FILES" header away. The `sticky top-0` on PanelHeader is anchored to the PanelShell wrapper's scroll, not the LeftPanel's content scroll, so it doesn't reliably pin.

---

## Fixed Layout (After Fix)

### Scroll Zone Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   EXPLORER BAR  [📋 path/to/file.md                          ]          │
│                                                                         │
│   ═══════════════ PINNED ══════ never scrolls ══════════════════════    │
│                                                                         │
├────────────────────┬────────────────────────────────────────────────────┤
│                    │                                                    │
│  FILES [🌳] [Δ] [↻]│ [💾 Save] [Edit] [Preview] [Diff]   [↻] [↗]     │
│                    │                                                    │
│  ══ PINNED ══════  │  ═══════ PINNED ══════════════════════════════    │
│                    │                                                    │
│┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄│┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄│
│ ▶ src/             │  1 │ import React from 'react';                   │
│   ▶ components/    │  2 │ import { useState } from 'react';            │
│     file-tree.tsx  │  3 │                                               │
│     code-editor.tsx│  4 │ export function MyComponent() {               │
│   ▶ features/      │  5 │   const [count, setCount] = useState(0);     │
│     ...            │  6 │   return <div>{count}</div>;                  │
│                    │  7 │ }                                             │
│   SCROLLS ↕        │  ...│  ...                                         │
│   independently    │  ...│  SCROLLS ↕ independently                     │
│                    │  ...│                                               │
│                    │  ...│                                               │
└────────────────────┴────────────────────────────────────────────────────┘
```

### Three Pinned Zones

| Zone | Component | CSS Strategy | Scrolls? |
|------|-----------|-------------|----------|
| **Top bar** | ExplorerPanel | `shrink-0` in outer flex-col | ❌ Never |
| **Left header** | PanelHeader ("FILES") | `shrink-0` in LeftPanel flex-col | ❌ Never |
| **Right header** | FileViewerPanel toolbar | `shrink-0` in viewer flex-col | ❌ Never |

### Two Independent Scroll Zones

| Zone | Component | CSS Strategy | Contains |
|------|-----------|-------------|----------|
| **Tree scroll** | LeftPanel content wrapper | `flex-1 overflow-y-auto` | FileTree (no own scroll) |
| **Editor scroll** | FileViewerPanel content area | `flex-1 overflow-auto` | CodeEditor / Preview / Diff |

---

## Component Hierarchy (Fixed)

```
PanelShell                          flex flex-col h-full overflow-hidden
├─ ExplorerPanel wrapper            shrink-0                    ← PINNED
└─ Left + Main split               flex flex-1 overflow-hidden
    │
    ├─ Left wrapper                 shrink-0 overflow-hidden ← WAS overflow-y-auto
    │   └─ LeftPanel                flex flex-col h-full
    │       ├─ PanelHeader          shrink-0                    ← PINNED
    │       └─ content wrapper      flex-1 overflow-y-auto      ← SCROLL ZONE (tree)
    │           └─ FileTree         (no overflow)  ← WAS overflow-y-auto
    │
    └─ Main wrapper                 flex-1 flex flex-col overflow-hidden
        └─ FileViewerPanel          flex flex-col h-full
            ├─ Toolbar              shrink-0                    ← PINNED
            ├─ Banners (optional)   shrink-0
            └─ Content area         flex-1 overflow-auto        ← SCROLL ZONE (editor)
                └─ CodeEditor / Preview / Diff
```

### What Changes (3 CSS edits)

| File | Element | Before | After | Why |
|------|---------|--------|-------|-----|
| `panel-shell.tsx` L33 | Left wrapper | `overflow-y-auto` | `overflow-hidden` | Eliminate competing scroll context |
| `file-tree.tsx` L141 | Root div | `h-full overflow-y-auto` | _(no overflow)_ | Delegate scrolling to LeftPanel wrapper |
| `panel-header.tsx` L46 | Header div | `sticky top-0` | _(removed)_ | No longer needed — pinned by flex `shrink-0` |

---

## Scroll Interaction Behaviors

### File Selection → Tree Scroll

When user clicks a file in the explorer dropdown or navigates via URL:

```
User clicks file
    │
    ▼
FileTree renders with selectedFile prop
    │
    ▼
TreeItem callback ref fires (line 292-298)
    │
    ▼
el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    │
    ▼
Scrolls the LeftPanel content wrapper (nearest overflow-y-auto ancestor)
    │
    ▼
PanelHeader stays pinned (it's above the scroll container)  ✅
```

**Verification**: After fix, `scrollIntoView` scrolls the LeftPanel `flex-1 overflow-y-auto` div — the only scroll ancestor in the left panel.

### Line Offset → Editor Scroll

When user navigates to `?file=path.ts&line=42`:

```
URL has ?line=42
    │
    ▼
BrowserClient passes scrollToLine={42} to FileViewerPanel
    │
    ▼
FileViewerPanel passes to CodeEditor
    │
    ▼
CodeEditor dispatches EditorView.scrollIntoView(pos)
    │
    ▼
CodeMirror scrolls within its own scroller (inside flex-1 overflow-auto)
    │
    ▼
Toolbar stays pinned (it's above the scroll container)  ✅
```

### Independent Scrolling

The tree and editor scroll contexts are **completely separate DOM subtrees**:

```
Left wrapper (overflow-hidden)          Main wrapper (overflow-hidden)
  └─ LeftPanel flex-col                   └─ FileViewerPanel flex-col
      ├─ Header (pinned)                     ├─ Toolbar (pinned)
      └─ [SCROLL A] ← overflow-y-auto       └─ [SCROLL B] ← overflow-auto
           └─ FileTree                            └─ Editor content
```

Scrolling in SCROLL A has zero effect on SCROLL B. ✅

---

## Visual Test Cases

### Test 1: Long file tree, scroll down

```
BEFORE (broken):                    AFTER (fixed):
┌─────────────────┐                ┌─────────────────┐
│ (header gone) ↑ │                │ FILES [🌳] [↻]  │ ← stays
│ ...200 files... │                │─────────────────│
│ ...scrolled...  │                │ ...200 files... │
│ ...to bottom... │                │ ...scrolled...  │
│ file-200.tsx    │                │ file-200.tsx    │
└─────────────────┘                └─────────────────┘
```

### Test 2: Long file content, scroll down

```
BEFORE (broken):                    AFTER (fixed):
┌──────────────────────┐           ┌──────────────────────┐
│ (toolbar gone) ↑     │           │ [Edit] [Preview] [↻] │ ← stays
│ line 500...          │           │──────────────────────│
│ line 501...          │           │ line 500...          │
│ line 502...          │           │ line 501...          │
│ line 503...          │           │ line 502...          │
└──────────────────────┘           └──────────────────────┘
```

### Test 3: Scroll tree without affecting editor

```
Action: Mouse wheel over tree area
Expected: Tree scrolls, editor stays at its current scroll position
Result: ✅ Separate overflow containers = no cross-scroll
```

### Test 4: Click file → tree scrolls to it

```
Action: Select deeply nested file via explorer bar search
Expected: Tree auto-expands to file, scrolls to center it
Result: ✅ scrollIntoView targets LeftPanel content wrapper
```

---

## Open Questions

### Q1: Should the left panel resizer still work?

**RESOLVED**: Yes. The CSS `resize: horizontal` is on the PanelShell left wrapper div. Changing its overflow from `overflow-y-auto` to `overflow-hidden` does NOT affect horizontal resize — `resize` works with any overflow value that isn't `visible`. Since `overflow-hidden` ≠ `visible`, the resize handle remains functional.

### Q2: Does removing `sticky` from PanelHeader break anything?

**RESOLVED**: No. `sticky top-0` only has effect inside a scrollable ancestor. After the fix, PanelHeader's parent (LeftPanel) is `flex flex-col h-full` with `shrink-0` on the header — the header is pinned by flex layout, not by sticky positioning. Removing `sticky top-0` is cleanup, not a behavior change.

### Q3: What about the ChangesView (other left panel mode)?

**RESOLVED**: ChangesView is rendered in the same `flex-1 overflow-y-auto` slot as FileTree. It inherits the same scroll behavior automatically. No changes needed to `changes-view.tsx`.

---

## Summary

**Three CSS class changes. Zero logic changes. Zero new components.**

The fix restructures scroll ownership so each panel has exactly one scroll container below its pinned header. The component hierarchy is already correct (flex-col with shrink-0 headers) — we just need to stop the PanelShell wrapper from creating a competing scroll context and stop FileTree from creating a redundant one.
