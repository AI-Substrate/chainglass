# Workshop: Combined Window + Copilot Badge UI

**Type**: UI Design
**Plan**: 075-tmux-copilot-status
**Spec**: [tmux-copilot-status-spec.md](../tmux-copilot-status-spec.md)
**Created**: 2026-03-15
**Status**: Draft

**Related Documents**:
- [001-status-line-ui.md](001-status-line-ui.md) — original two-row layout (superseded)

---

## Purpose

Merge the two separate header rows (window badges + copilot session badges) into unified per-window card elements. Each card shows the window title on line 1, and copilot session details on line 2 (only when a copilot session exists in that window). Eliminates visual disconnect between "which window" and "which copilot session".

## Key Questions Addressed

- How should combined badge cards be laid out?
- What happens to windows without a copilot session?
- How do the two data sources (window badges + copilot badges) merge by window index?
- What component changes are needed?

---

## Current State — Two Separate Rows

From the screenshot, the terminal overlay panel header currently shows:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 📋 074-actaul-real-agents  0:w1 🍌 074 Phase 5…  1:w2 Extract…  2:r1 Review…  3:node Inspect…  │ ← Row 1: session + window badges
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 0:copilot: opus-4.6-1m (high) │ 220k/1000k (22%) │ 7s ago                                      │ ← Row 2: copilot badges (separate)
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ (terminal content)                                                                               │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Problem**: The copilot badge says `0:copilot:` but you have to mentally match that `0` back to `0:w1` in the row above. With multiple sessions, the visual mapping gets harder.

---

## Proposed Layout — Combined Cards

Each window becomes a single stacked element. Title on line 1, copilot details on line 2 (when present). Windows without copilot sessions show only the title line.

### Layout anatomy

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 📋 074-actaul-real-agents   [card 0]  [card 1]  [card 2]  [card 3]                              │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Where each card is:

**Card WITH copilot session** (two lines, tinted background):
```
┌───────────────────────────────────────────┐
│ 0:w1 074 Phase 5 task dossier             │  ← title (existing window badge content)
│ opus-4.6-1m (high) 220k/1000k (22%) 7s   │  ← copilot details (smaller text)
└───────────────────────────────────────────┘
```

**Card WITHOUT copilot session** (single line, plain):
```
┌───────────────────────────────────────────┐
│ 3:node Inspect FlowSpace Embeddings       │  ← title only
└───────────────────────────────────────────┘
```

### Full mockup — mixed scenario

Session name stays left-anchored. Cards flow inline after it, wrapping as needed:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 📋 074-actaul-real-agents                                                                        │
│                                                                                                  │
│  ┌──────────────────────────────────┐  ┌──────────────────────────────────┐                       │
│  │ 0:w1 074 Phase 5 task dossier   │  │ 1:w2 Extract Copilot Session     │                       │
│  │ opus-4.6-1m (high) 220k/1000k   │  │ sonnet-4.6 (high) 84k/200k      │                       │
│  │ (22%) 7s                        │  │ (42%) 2m                         │                       │
│  └──────────────────────────────────┘  └──────────────────────────────────┘                       │
│                                                                                                  │
│  ┌──────────────────────────────────┐  ┌──────────────────────────────────┐                       │
│  │ 2:r1 Review Phase 4 UI          │  │ 3:node Inspect FlowSpace         │                       │
│  └──────────────────────────────────┘  └──────────────────────────────────┘                       │
│                                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Wait — that's too spacious. The header should stay compact. Better approach: **inline cards, single row, flex-wrap**.

### Revised mockup — compact inline

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 📋 074-actaul-real-agents                                                                [X] [📋]│
│ ┌─────────────────────────┐ ┌─────────────────────────┐ ┌────────────────────┐ ┌──────────────┐  │
│ │ 0:w1 074 Phase 5 task…  │ │ 1:w2 Extract Copilot…   │ │ 2:r1 Review Ph…    │ │ 3:node Insp… │  │
│ │ opus-4.6-1m (high)      │ │ sonnet-4.6 (high)       │ └────────────────────┘ └──────────────┘  │
│ │ 220k/1000k (22%) 7s     │ │ 84k/200k (42%) 2m       │                                         │
│ └─────────────────────────┘ └─────────────────────────┘                                          │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ (terminal content)                                                                               │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Still too tall. The detail line should be a single compact line — no wrapping within a card.

### Final mockup — compact two-line cards

Each card is a rounded `bg-muted` pill. Line 1 is the window title. Line 2 (optional) is a compact copilot summary. Cards sit in a single flex-wrap row:

```
Header row:
 📋 074-actaul-real-agents                                                               [📋] [X]

Badge row (flex-wrap):
 ┌────────────────────────────┐ ┌────────────────────────────┐ ┌──────────────────┐ ┌────────────┐
 │ 0:w1 074 Phase 5 task…     │ │ 1:w2 Extract Copilot…      │ │ 2:r1 Review Ph…  │ │ 3:node In… │
 │ opus-4.6-1m(high) 220k/1M  │ │ sonnet-4.6(high) 84k/200k  │ └──────────────────┘ └────────────┘
 │ 22% 7s                     │ │ 42% 2m                      │
 └────────────────────────────┘ └────────────────────────────┘

Terminal content below...
```

---

## Component Design

### Data merge strategy

Both hooks (`useTerminalWindowBadges` and `useCopilotSessionBadges`) are keyed by `windowIndex`. The merge is a left join — every window badge gets a card, copilot data enriches matching windows.

```typescript
interface CombinedBadge {
  windowIndex: string;
  windowName: string;
  label: string;          // from window badge (pane title)
  // Copilot fields — null when no copilot in this window
  model: string | null;
  reasoningEffort: string | null;
  promptTokens: number | null;
  contextWindow: number | null;
  pct: number | null;
  lastActivityAgo: string | null;
}
```

Merge logic (in the overlay panel or a new combined hook):

```typescript
const combined: CombinedBadge[] = windowBadges.map(wb => {
  const copilot = copilotBadges.find(cb => cb.windowIndex === wb.windowIndex);
  return {
    ...wb,
    model: copilot?.model ?? null,
    reasoningEffort: copilot?.reasoningEffort ?? null,
    promptTokens: copilot?.promptTokens ?? null,
    contextWindow: copilot?.contextWindow ?? null,
    pct: copilot?.pct ?? null,
    lastActivityAgo: copilot?.lastActivityAgo ?? null,
  };
});
```

### Component structure — option A (simpler, recommended)

Remove `<CopilotSessionBadges>` as a separate component. Merge into the existing window badges rendering in `terminal-overlay-panel.tsx`:

```tsx
{/* Badge row — combined window + copilot cards */}
<div className="flex items-start gap-1.5 flex-wrap" data-testid="terminal-window-badges">
  {combined.map((badge) => (
    <div
      key={badge.windowIndex}
      className="inline-flex flex-col rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono"
    >
      {/* Line 1: window title */}
      <span className="text-muted-foreground whitespace-nowrap">
        <span className="text-foreground/70">
          {badge.windowIndex}
          {badge.windowName ? `:${badge.windowName}` : ''}
        </span>
        {' '}
        <span className="text-muted-foreground/80">{badge.label}</span>
      </span>

      {/* Line 2: copilot details (only when present) */}
      {badge.model && (
        <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">
          <span>{formatModel(badge.model)}</span>
          {badge.reasoningEffort && <span>({badge.reasoningEffort})</span>}
          {' '}
          <span>{formatTokens(badge.promptTokens)}/{formatTokens(badge.contextWindow)}</span>
          {' '}
          <span className={getPctColorClass(badge.pct)}>{badge.pct ?? '—'}%</span>
          {' '}
          {badge.lastActivityAgo && <span>{badge.lastActivityAgo}</span>}
        </span>
      )}
    </div>
  ))}
</div>
```

### Component structure — option B (keep separate components)

Keep `CopilotSessionBadges` component but refactor it to accept combined data and render as sub-lines within existing badge cards. More code, same result. Prefer option A.

---

## Visual Details

### Card with copilot session

```
┌─ bg-muted rounded ──────────────────────┐
│ 0:w1 074 Phase 5 task dossier            │  ← 11px, text-foreground/70 + text-muted-foreground/80
│ opus-4.6-1m(high) 220k/1M 22% 7s        │  ← 10px, text-muted-foreground/70, pct color-coded
└──────────────────────────────────────────┘
```

- Background: `bg-muted` (same as current window badges)
- Border: none (rounded pill, same as current)
- Padding: `px-1.5 py-0.5` (same as current)
- Line 1 font: `text-[11px] font-mono` (same as current)
- Line 2 font: `text-[10px] font-mono` (1px smaller — subordinate)
- Line 2 color: `text-muted-foreground/70` (dimmer than line 1)
- Percentage: color-coded per existing thresholds (green/yellow/orange/red)

### Card without copilot session

```
┌─ bg-muted rounded ──────────────────────┐
│ 3:node Inspect FlowSpace Embeddings      │  ← 11px, same as current
└──────────────────────────────────────────┘
```

Identical to current window badge — no visual change for non-copilot windows.

### Separator

Current layout uses inline `║` separators between copilot badges. With cards, the `gap-1.5` flex gap provides natural spacing — **no separator needed**. Each card is a visually distinct rounded pill.

---

## Changes Summary

| File | Change |
|------|--------|
| `terminal-overlay-panel.tsx` | Merge window + copilot data, render combined cards, remove `<CopilotSessionBadges>` usage |
| `copilot-session-badges.tsx` | Delete or repurpose — its rendering moves into the combined card |
| `use-copilot-session-badges.ts` | Keep as-is — still provides copilot data |
| `use-terminal-window-badges.ts` | Keep as-is — still provides window data |

### Lines of code estimate

- `terminal-overlay-panel.tsx`: ~40 lines changed (merge logic + combined render)
- `copilot-session-badges.tsx`: Move `formatModel`, `formatTokens`, `getPctColorClass` helpers to a shared util or inline in overlay panel. Delete component.
- Net: ~same LOC, fewer components, simpler data flow

---

## Edge Cases

### Copilot badge exists but no matching window badge

Shouldn't happen — copilot detection is keyed by tmux pane, which always belongs to a window. If it does happen (race condition), drop the orphan copilot data.

### Window badge exists, copilot data arrives on next poll

Window card renders with title only. 15s later when copilot data arrives, line 2 appears. Card height grows slightly — acceptable.

### All windows have copilot sessions

Every card gets two lines. Row is taller. flex-wrap handles overflow.

### No windows at all (no tmux)

Both arrays empty. No badge row rendered. Same as current behavior.

---

## Open Questions

### Q1: Should the copilot detail line truncate or wrap within the card?

**RESOLVED**: `whitespace-nowrap` — each card is as wide as its content. No internal wrapping. flex-wrap handles card overflow to next line.

### Q2: Keep `copilot-session-badges.tsx` or delete?

**RECOMMENDATION**: Delete. Move the 3 helper functions (`formatModel`, `formatTokens`, `getPctColorClass`) into `terminal-overlay-panel.tsx` as local functions. The component had no reuse outside the overlay panel.

### Q3: Where does the session name go?

**RESOLVED**: Session name (`074-actaul-real-agents`) stays in the header row above, next to the terminal icon — separate from the badge cards. Same as current layout. The badge row sits between header and terminal.
