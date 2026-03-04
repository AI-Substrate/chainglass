# Workshop: Agent Top Bar Redesign — Summary Strip + Expandable Grid

**Type**: UI/UX Design
**Plan**: 059-fix-agents
**Spec**: [fix-agents-spec.md](../fix-agents-spec.md)
**Created**: 2026-03-04
**Status**: Draft

**Related Documents**:
- [Workshop 001: Top Bar Agent UX](001-top-bar-agent-ux.md)
- [Workshop 008: Agent Intents](008-agent-intents.md)

**Domain Context**:
- **Primary Domain**: agents (UI)
- **Related Domains**: _platform/panel-layout (layout slot)

---

## Purpose

Redesign the agent top bar from a row of inline chips (current, messy) to a two-mode system: a slim summary strip (default) that shows aggregate status at a glance, expandable into a tiled grid with rich agent cards. Separate "intent" (what the agent is doing now) from "last action" (what it did before stopping).

## Key Questions Addressed

- What does the collapsed/slim state look like?
- What does the expanded tiled grid look like?
- How are agents ordered in the grid?
- How do intent vs last-action display differently?
- What aggregate indicators should the summary strip show?

---

## Design: Two Modes

### Mode 1: Summary Strip (Default — Collapsed)

A single thin line across the top. Always visible. Shows aggregate counts at a glance.

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🤖 3 agents  ● 1 working  ◐ 1 waiting  ○ 1 idle          ▼ expand │
└──────────────────────────────────────────────────────────────────────┘
```

**Height**: ~28px (text-xs, py-1). Minimal vertical footprint.

**Content (left to right)**:
1. **Agent icon + count**: `🤖 3 agents`
2. **Status breakdown** with colored dots:
   - `● 1 working` (blue dot)
   - `◐ 1 waiting` (amber dot, pulsing)
   - `○ 1 idle` (grey dot)
   - `✕ 1 error` (red dot) — only shown if errors exist
3. **Expand toggle** (right-aligned): `▼` chevron or "expand"

**Behavior**:
- If ANY agent is `waiting_input`: strip background has subtle amber tint + pulse
- If ALL agents are `idle`: strip is muted/grey
- If ALL agents are `working`: strip has subtle blue tint
- Click anywhere on the strip → expands to grid

**Why this works**: The user's primary need is "do I need to look at my agents?" — the strip answers that in <1 second without consuming vertical space.

### Mode 2: Expanded Grid (Click to Open)

Slides down below the strip. Shows agent cards in a responsive tiled grid.

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🤖 3 agents  ● 1 working  ◐ 1 waiting  ○ 1 idle          ▲ collapse│
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────┐ │
│  │ ◐ Jordo 2           │  │ ● Code Reviewer     │  │ ○ Test Agent │ │
│  │   copilot            │  │   claude-code        │  │   copilot    │ │
│  │                      │  │                      │  │              │ │
│  │ ⏳ Waiting for input │  │ 🔵 Reading auth.ts   │  │ Last action: │ │
│  │ "Should I proceed    │  │                      │  │ "Edited 3    │ │
│  │  with the refactor?" │  │                      │  │  files"      │ │
│  │                      │  │                      │  │              │ │
│  │ 2m ago               │  │ just now             │  │ 15m ago      │ │
│  └─────────────────────┘  └─────────────────────┘  └──────────────┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Grid layout**: CSS Grid, `grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))`. Cards flow left→right, top→bottom.

**Card anatomy** (each ~220px min, flexible):

```
┌─────────────────────────┐
│ ◐ Agent Name            │  ← status dot + name (bold)
│   agent-type             │  ← type label (muted)
│                          │
│ [Intent or Last Action]  │  ← see below
│                          │
│ 2m ago                   │  ← relative time (muted)
└─────────────────────────┘
```

**Card height**: ~100-120px. Generous vertical space.

**Click card** → opens agent overlay (existing behavior).

---

## Intent vs Last Action — Separate Display

Two distinct concepts:

| | Intent | Last Action |
|---|---|---|
| **When shown** | Agent is `working` | Agent is `idle`/`stopped` |
| **What it shows** | Current tool/thinking | Last intent before stopping |
| **Visual** | Blue/active styling, live-updating | Grey/muted, static |
| **Label** | No label (just the text) | "Last action:" prefix |
| **Example** | `Reading auth.ts` | `Last: Edited 3 files` |

### Implementation

```typescript
// In the agent card
function getIntentDisplay(agent) {
  if (agent.status === 'working') {
    // Live intent — what the agent is doing right now
    return { text: agent.intent, style: 'text-foreground', label: null };
  }
  if (agent.status === 'waiting_input') {
    // Waiting state — show what it's asking
    return { text: agent.intent, style: 'text-amber-600', label: '⏳' };
  }
  if (agent.intent && (agent.status === 'idle' || agent.status === 'stopped')) {
    // Stopped — show last thing it did, dimmed
    return { text: agent.intent, style: 'text-muted-foreground', label: 'Last:' };
  }
  return null;
}
```

---

## Sort Order: Most Recent "Need for Human" First

The grid sorts agents by urgency, not creation time:

```typescript
function sortByHumanNeed(agents) {
  return [...agents].sort((a, b) => {
    // 1. waiting_input first (needs human attention NOW)
    if (a.status === 'waiting_input' && b.status !== 'waiting_input') return -1;
    if (b.status === 'waiting_input' && a.status !== 'waiting_input') return 1;

    // 2. errors second (needs human investigation)
    if (a.status === 'error' && b.status !== 'error') return -1;
    if (b.status === 'error' && a.status !== 'error') return 1;

    // 3. working third (actively running, may need attention soon)
    if (a.status === 'working' && b.status !== 'working') return -1;
    if (b.status === 'working' && a.status !== 'working') return 1;

    // 4. within same status: most recently active first
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}
```

---

## Aggregate Indicators — Summary Strip Logic

```typescript
interface AgentSummary {
  total: number;
  working: number;
  waiting: number;
  error: number;
  idle: number;
}

function computeSummary(agents): AgentSummary {
  return {
    total: agents.length,
    working: agents.filter(a => a.status === 'working').length,
    waiting: agents.filter(a => (a.status as string) === 'waiting_input').length,
    error: agents.filter(a => a.status === 'error').length,
    idle: agents.filter(a => a.status === 'idle' || a.status === 'stopped').length,
  };
}

// Strip background tint
function getStripTint(summary: AgentSummary): string {
  if (summary.waiting > 0) return 'bg-amber-50/50 dark:bg-amber-950/20';
  if (summary.error > 0) return 'bg-red-50/50 dark:bg-red-950/20';
  if (summary.working > 0) return 'bg-blue-50/50 dark:bg-blue-950/20';
  return 'bg-card/80';
}
```

---

## Component Structure

```
AgentChipBar (renamed: AgentTopBar)
├── AgentSummaryStrip          ← always visible, slim line
│   ├── agent count
│   ├── status counters (● working, ◐ waiting, etc.)
│   └── expand/collapse toggle
│
└── AgentGridPanel             ← shown when expanded
    └── AgentCard[]            ← tiled grid, larger cards
        ├── status dot + name
        ├── agent type
        ├── intent OR last action
        └── relative time
```

**Files to change**:
- `agent-chip-bar.tsx` → rewrite as `AgentTopBar` with strip + grid
- `agent-chip.tsx` → rewrite as `AgentCard` with larger format
- `workspace-agent-chrome.tsx` → update to use new component name

---

## Transition Animation

- Expand: grid slides down with `animate-in slide-in-from-top duration-200`
- Collapse: slides up with `animate-out slide-out-to-top duration-150`
- Max expanded height: `max-h-[50vh]` with overflow-y-auto (same as before)

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| 0 agents | Strip hidden entirely |
| 1 agent | Strip shows "1 agent ● working" — no grid needed, click strip → overlay |
| 20+ agents | Grid scrolls vertically, cards wrap |
| All idle | Strip muted, no tint |
| Agent finishes while grid is open | Card updates in-place, re-sorts |

---

## Open Questions

### Q1: Should strip auto-expand when an agent starts waiting?

**RESOLVED**: No — use the attention flash system (Phase 3) instead. Auto-expand would be disruptive. The amber tint + pulse on the strip is sufficient visual cue.

### Q2: Drag-to-reorder in grid?

**RESOLVED**: No — remove drag-to-reorder. Sort by urgency is more useful than manual ordering. Simplifies code significantly (remove @dnd-kit dependency for this component).

### Q3: Should the strip be clickable as a whole or just the expand button?

**RESOLVED**: Entire strip is clickable to expand/collapse. More forgiving touch target.
