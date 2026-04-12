# Phase 3: Browser Mobile UX — Flight Plan

**Plan**: 078-mobile-experience
**Phase**: Phase 3: Browser Mobile UX
**Tasks Dossier**: [tasks.md](tasks.md)

---

## What This Phase Does

Transforms the file browser from a desktop-only experience into a touch-friendly mobile interface. After this phase, a user on a phone can browse files with properly sized touch targets, tap a file to auto-switch to the content viewer, see a helpful empty state when no file is selected, and access the search/command palette via a bottom sheet.

---

## Before → After

### Before (Phase 2 complete)

```mermaid
flowchart LR
    subgraph Mobile["Phone Viewport (390px)"]
        subgraph SwipeStrip["MobileSwipeStrip"]
            F["📁 Files"]
            C["📄 Content"]
        end
        subgraph Views["Views"]
            FV["Files View<br/>• Small rows (~28px)<br/>• No view-switch on tap"]
            CV["Content View<br/>• Inline 'Select a file' text<br/>• No back-to-files button"]
        end
        F --> FV
        C --> CV
    end

    subgraph Hidden["Hidden on Mobile"]
        EP["ExplorerPanel<br/>(search, commands, path bar)<br/>❌ Not accessible"]
    end
```

### After (Phase 3 complete)

```mermaid
flowchart LR
    subgraph Mobile["Phone Viewport (390px)"]
        subgraph SwipeStrip["MobileSwipeStrip"]
            F["📁 Files"]
            C["📄 Content"]
            S["🔍 Search icon"]
        end
        subgraph Views["Views"]
            FV["Files View<br/>• 48px rows (min-h-12)<br/>• Tap file → auto-switch<br/>  to Content"]
            CV["Content View<br/>• Empty state with icon<br/>  + 'Browse Files' button<br/>• FileViewerPanel when<br/>  file selected"]
        end
        subgraph Sheet["Bottom Sheet (60vh)"]
            EP["ExplorerPanel<br/>search + commands<br/>+ path bar"]
        end
        F --> FV
        C --> CV
        S -.->|tap| Sheet
    end
```

---

## Key Architecture Changes

### 1. MobilePanelShell gains controlled mode

```
BEFORE: activeIndex = internal useState (uncontrolled)
AFTER:  activeIndex = optional prop (controlled when provided, uncontrolled otherwise)
```

This enables BrowserClient to programmatically switch views (file-tap → Content, "Browse Files" → Files).

### 2. PanelShell forwards new mobile props

```
BEFORE: <MobilePanelShell views={mobileViews} />
AFTER:  <MobilePanelShell views={mobileViews}
           onViewChange={onMobileViewChange}
           activeIndex={mobileActiveIndex}
           rightAction={mobileRightAction} />
```

### 3. ExplorerPanel reused inside Sheet (no duplication)

The same `ExplorerPanel` component rendered in the desktop explorer bar is wrapped in a `Sheet` for mobile — same props, same behavior, different container.

---

## Task Dependency Graph

```mermaid
flowchart TD
    T001["T001: File tree 48px rows<br/>(independent)"]
    T003["T003: Content empty state<br/>(TDD — new component)"]
    T002["T002: File-tap view-switch<br/>(needs T003 for empty state)"]
    T004["T004: MobileExplorerSheet<br/>(TDD — new component)"]
    T005["T005: Wire Sheet into<br/>BrowserClient<br/>(needs T002 + T004)"]
    T006["T006: Harness verification<br/>(needs all above)"]

    T003 --> T002
    T002 --> T005
    T004 --> T005
    T005 --> T006
    T001 --> T006

    style T001 fill:#FFF9C4,stroke:#F9A825
    style T003 fill:#E3F2FD,stroke:#1565C0
    style T004 fill:#E3F2FD,stroke:#1565C0
    style T002 fill:#FFF9C4,stroke:#F9A825
    style T005 fill:#FFF9C4,stroke:#F9A825
    style T006 fill:#E8F5E9,stroke:#4CAF50
```

Legend: 🟦 TDD (write tests first) · 🟨 Lightweight · 🟩 Harness

---

## Suggested Execution Order

1. **T001** (independent) + **T003** (TDD, independent) + **T004** (TDD, independent) — _can be parallel_
2. **T002** — depends on T003 (uses ContentEmptyState in the empty state slot)
3. **T005** — depends on T002 + T004 (wires everything together)
4. **T006** — verification gate

---

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| BrowserClient regression from view-switch wiring | Per finding 03: callback is wired at PanelShell props level only, no mobile branching inside BrowserClient render tree |
| ExplorerPanel inside Sheet has focus/keyboard issues | Test command palette keyboard interaction; Sheet manages focus trap via Radix |
| MobilePanelShell controlled mode breaks terminal page | Terminal page doesn't pass `activeIndex` — uncontrolled mode preserved as default |
| Sheet component missing `side="bottom"` | Confirmed: `sheet.tsx` supports `side="bottom"` with proper animations |

---

## Files Changed Summary

| File | Change Type | Domain |
|------|-------------|--------|
| `file-tree.tsx` | Modify (add `min-h-12` on mobile) | `file-browser` |
| `content-empty-state.tsx` | **Create** | `file-browser` |
| `mobile-explorer-sheet.tsx` | **Create** | `_platform/panel-layout` |
| `mobile-panel-shell.tsx` | Modify (controlled mode) | `_platform/panel-layout` |
| `panel-shell.tsx` | Modify (forward new props) | `_platform/panel-layout` |
| `browser-client.tsx` | Modify (view-switch + Sheet wiring) | `file-browser` |
| `index.ts` (panel-layout barrel) | Modify (export MobileExplorerSheet) | `_platform/panel-layout` |
| `content-empty-state.test.tsx` | **Create** | test |
| `mobile-explorer-sheet.test.tsx` | **Create** | test |

---

## Navigation

- **Tasks Dossier**: [tasks.md](tasks.md)
- **Plan**: [mobile-experience-plan.md](../../mobile-experience-plan.md)
- **Spec**: [mobile-experience-spec.md](../../mobile-experience-spec.md)
- **Workshop 001**: [Mobile Swipeable Panel](../../workshops/001-mobile-swipeable-panel-experience.md)
- **Workshop 003**: [Smart Show/Hide](../../workshops/003-smart-show-hide-mobile-chrome.md)
- **Phase 1 Dossier**: [phase-1-mobile-panel-shell/tasks.md](../phase-1-mobile-panel-shell/tasks.md)
- **Phase 2 Dossier**: [phase-2-terminal-mobile-ux/tasks.md](../phase-2-terminal-mobile-ux/tasks.md)
