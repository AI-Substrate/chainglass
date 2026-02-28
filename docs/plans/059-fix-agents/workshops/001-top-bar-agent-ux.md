# Workshop: Top Bar Agent UX — Persistent Agent Visibility

**Type**: CLI Flow / State Machine / Data Model (hybrid)
**Plan**: 059-fix-agents
**Research Dossier**: [research-dossier.md](../research-dossier.md)
**Created**: 2026-02-28
**Status**: Draft

**Related Documents**:
- [_platform/state domain](../../../domains/_platform/state/domain.md) — GlobalStateSystem, useGlobalState, useGlobalStateList
- [_platform/panel-layout domain](../../../domains/_platform/panel-layout/domain.md) — PanelShell, ExplorerPanel
- [_platform/events domain](../../../domains/_platform/events/domain.md) — SSE transport, useSSE
- [Research Dossier — Proposed Agent State Paths](../research-dossier.md#proposed-agent-state-paths-following-plan-053-pattern)

**Domain Context**:
- **Primary Domain**: agents (proposed — to be extracted)
- **Related Domains**: `_platform/state` (publish/subscribe), `_platform/events` (SSE transport), `_platform/panel-layout` (layout shell)

---

## Purpose

Design the persistent agent top bar: what it shows, how agents are ordered, what interaction the chips provide, and how attention-seeking events (questions, errors) surface to the user. This workshop resolves the 7 key questions from the research dossier and produces concrete component specs, state paths, and interaction flows that the architect can consume directly.

## Key Questions Addressed

1. What constitutes a "running agent"? What statuses appear in the top bar?
2. How to order agents without visual thrashing?
3. What does each agent chip show?
4. Popover behavior — size, multiplicity, capabilities?
5. Cross-worktree agent visibility in the left menu?
6. Attention-seeking UX — screen flash, question badge, multiple simultaneous questions?
7. How to indicate what created an agent (user, workflow, pod)?

---

## Q1: Agent Lifecycle & Top Bar Visibility

### The Problem

The backend has 3 statuses: `working`, `stopped`, `error`. But "stopped" is ambiguous — it could mean "finished successfully", "waiting for user input", or "crashed mid-run". The existing `AgentStatusIndicator` component already has a richer 5-status model (`idle`, `running`, `waiting_input`, `completed`, `archived`) but it's disconnected from backend state.

### RESOLVED: Extended Status Model

**Why**: We need a status model that answers "should the user care about this agent right now?" The top bar exists to surface agents that need attention. A completed agent sitting idle is noise.

```
┌─────────────────────────────────────────────────────────────────────┐
│ Agent Lifecycle                                                     │
│                                                                     │
│  [created] ──→ idle ──→ working ──→ stopped ──→ idle                │
│                  │         │           │          │                  │
│                  │         │           ▼          │                  │
│                  │         │     waiting_input    │                  │
│                  │         │           │          │                  │
│                  │         ▼           │          ▼                  │
│                  │       error         │      completed              │
│                  │                     │          │                  │
│                  │         ◀───────────┘          │                  │
│                  │    (user responds)             ▼                  │
│                  │                            archived               │
│                  ▼                                                   │
│              terminated                                             │
└─────────────────────────────────────────────────────────────────────┘
```

**Status definitions for top bar**:

| Status | Visual | Meaning | Shows in Top Bar? | Needs Attention? |
|--------|--------|---------|-------------------|------------------|
| `working` | 🔵 spinning | Actively executing a prompt | ✅ Yes | No — just working |
| `waiting_input` | 🟡 pulsing | Agent stopped and is asking a question | ✅ Yes | **Yes** — user must respond |
| `idle` | ⚪ static | Created but not doing anything / between runs | ✅ Yes | No |
| `error` | 🔴 static | Last run failed | ✅ Yes | **Yes** — user should investigate |
| `completed` | 🟢 static | Finished successfully, no more work | ✅ Yes (fades after 30s) | No |
| `archived` | — | User dismissed / old | ❌ No | No |
| `terminated` | — | Hard-killed, gone | ❌ No | No |

**Top bar rule — REVISED (Recency Model)**:

The top bar does NOT show all agents by status. Instead, it renders a **recent agents list** — a persisted, per-worktree data structure that tracks which agents should be visible.

**Auto-populate**: Any agent that runs gets added to the recent list with a timestamp. If already present, the timestamp refreshes.

**Auto-depopulate**: On page load (or periodic tidy), sweep the list and remove anything older than 24h that isn't currently `working`. Agents that ARE `working` never get swept regardless of age.

**Manual dismiss**: User can ✕ an agent off the recent list without killing it. The agent keeps running, just not visible in the bar. Reopening it (from agent page, workflow node, etc.) re-adds it.

**First-class questions override recency**: If an agent raises a typed question via MessageService, it gets flash/badge/attention treatment regardless of whether it's in the recent list. Questions always surface.

**Storage**: Persisted as `<worktree>/.chainglass/data/agent-recent-list.json`, published to state system on load:
```json
{
  "agents": [
    { "agentId": "abc-123", "addedAt": "2026-02-28T06:00:00Z", "order": 0 },
    { "agentId": "def-456", "addedAt": "2026-02-28T07:30:00Z", "order": 1 }
  ]
}
```

On page load: read file → filter out expired (>24h AND not working) → write back → publish to state system → top bar renders.

**"Waiting for input" detection**: We do NOT try to infer whether an idle agent is "waiting" from heuristics. Only first-class questions (MessageService) trigger `waiting_input` status. An agent that goes `stopped` after a run is simply `idle` in the recent list — available to reconnect but not attention-seeking.

### Status Derivation (Simplified)

The backend publishes raw `working` / `stopped` / `error`. The client derives display status. `waiting_input` is ONLY triggered by a first-class question via MessageService — never inferred from agent idle state.

```typescript
type BackendAgentStatus = 'working' | 'stopped' | 'error';

type DerivedAgentStatus =
  | 'working'
  | 'waiting_input'   // ONLY when hasQuestion === true
  | 'idle'            // Default for stopped agents in recent list
  | 'error';

function deriveDisplayStatus(
  backendStatus: BackendAgentStatus,
  hasQuestion: boolean,
): DerivedAgentStatus {
  if (backendStatus === 'working') return 'working';
  if (backendStatus === 'error') return 'error';
  // backendStatus === 'stopped'
  if (hasQuestion) return 'waiting_input';
  return 'idle';
}
```

**Removed states**: `completed` and `archived` are no longer derived statuses. The recency model handles visibility — agents auto-depopulate after 24h of inactivity, no need for "completed" or "archived" semantics in the top bar.

### State Paths (Plan 053 Pattern)

```
agent:{agentId}:status          → 'working' | 'stopped' | 'error'
agent:{agentId}:intent          → string (e.g., "Refactoring auth module")
agent:{agentId}:type            → 'claude-code' | 'copilot' | 'copilot-cli'
agent:{agentId}:name            → string
agent:{agentId}:workspace       → string (worktree slug)
agent:{agentId}:has-question    → boolean (ONLY true when MessageService question raised)
agent:{agentId}:question-text   → string (the actual question, for popover preview)
agent:{agentId}:creator         → 'user' | 'workflow' | 'pod'
```

**Why this granularity**: Each field updates independently. `intent` changes frequently during `working` state; `status` changes rarely. Fine-grained paths prevent unnecessary re-renders via `useGlobalState`.

**Removed**: `has-ever-run` and `last-run-ok` — no longer needed since we use recency model instead of status derivation for visibility.

---

## Q2: Agent Ordering Strategy

### The Problem

If agents reorder every time one changes status, the top bar becomes a shuffling mess. The user can't build muscle memory for "my auth agent is third from left."

### RESOLVED: Stable Creation Order + Drag Override

**Decision**: Agents appear in **creation-time order** (oldest left, newest right) by default. User can **drag to reorder** for custom arrangement. Drag order persists per-worktree in localStorage.

**Why not other options**:

| Strategy | Pros | Cons | Verdict |
|----------|------|------|---------|
| Creation time (default) | Stable, predictable | New agents always at end | ✅ **Default** |
| Last activity | Active agents visible | Constant shuffling, disorienting | ❌ |
| Priority groups | Attention items first | Still shuffles within groups | ❌ as primary |
| Drag-to-reorder | User has full control | Requires persistence | ✅ **Override** |

**Priority visual hints instead of reordering**: Rather than moving agents, we use **visual urgency cues** on the chip itself:

```
┌─────────────────────────────────────────────────────────────┐
│ 🤖 Agent Top Bar                                            │
│                                                             │
│  Normal:   [⚪ Auth Agent]  [🔵⟳ API Agent]  [⚪ DB Agent]  │
│                                                             │
│  Question: [⚪ Auth Agent]  [🔵⟳ API Agent]  [🟡⚡ DB Agent] │
│            └── same position ──────────────┘  └─ pulses ──┘ │
│                                                             │
│  Error:    [⚪ Auth Agent]  [🔴! API Agent]   [⚪ DB Agent]  │
│            └── same position ──────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

**Drag reorder persistence**:

```typescript
// Key: worktree-scoped
const STORAGE_KEY = `agent-order:${worktreeSlug}`;

// Value: ordered array of agent IDs
// ["agent-abc", "agent-def", "agent-ghi"]

// New agents not in the order array go to the end
function getOrderedAgents(agents: AgentChipData[], savedOrder: string[]): AgentChipData[] {
  const ordered: AgentChipData[] = [];
  const remaining: AgentChipData[] = [];

  for (const id of savedOrder) {
    const agent = agents.find(a => a.id === id);
    if (agent) ordered.push(agent);
  }
  for (const agent of agents) {
    if (!savedOrder.includes(agent.id)) remaining.push(agent);
  }
  // Remaining sorted by createdAt ascending
  remaining.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return [...ordered, ...remaining];
}
```

---

## Q3: Agent Chip Design

### Overview

Each agent in the top bar is a "chip" — a compact, self-contained element showing identity and status at a glance.

### Chip Anatomy

```
 ┌──────────────────────────────────────────┐
 │  🤖  Auth Agent  ⟳  Refactoring auth...  │    ← Full chip (enough space)
 │  ↑      ↑        ↑          ↑            │
 │ icon   name    status    intent           │
 └──────────────────────────────────────────┘

 ┌────────────────────────┐
 │  🤖  Auth Agent  ⟳     │    ← Medium chip (constrained)
 └────────────────────────┘

 ┌───────────┐
 │  🤖  AA  ⟳│    ← Compact chip (many agents)
 │  ↑   ↑  ↑ │
 │ icon ini st│
 └───────────┘
```

### Chip Fields

| Field | Source | Always Visible | Notes |
|-------|--------|---------------|-------|
| **Type icon** | `agent:{id}:type` | ✅ | 🤖 copilot, 🧠 claude-code, 💻 copilot-cli |
| **Name** | `agent:{id}:name` | ✅ (truncated) | Max 16 chars, then ellipsis. Compact: 2-letter initials |
| **Status indicator** | derived from state | ✅ | Colored dot/spinner per status table above |
| **Intent snippet** | `agent:{id}:intent` | When space allows | Max 24 chars, subtle text. Hidden in compact mode |
| **Creator badge** | `agent:{id}:creator` | Only for non-user | Small "WF" or "POD" badge. User-created = no badge |
| **Question badge** | `agent:{id}:has-question` | When true | Pulsing `?` overlaid on chip — high visual priority |

### Chip States (Visual)

```
 Idle:
 ┌─────────────────────────────┐
 │  🤖  Auth Agent  ·          │   Gray dot, muted text
 └─────────────────────────────┘

 Working:
 ┌─────────────────────────────────────────────┐
 │  🤖  Auth Agent  ⟳  Refactoring auth...     │   Blue spinner, blue left border
 └─────────────────────────────────────────────┘

 Waiting Input (has question):
 ╔═════════════════════════════════════════════╗
 ║  🤖  Auth Agent  ❓  "Should I use JWT?"    ║   Amber pulse, question overlay
 ╚═════════════════════════════════════════════╝      ↑ double border = attention

 Error:
 ┌─────────────────────────────────────────────┐
 │  🤖  Auth Agent  ✖  Process exited (1)      │   Red dot, red left border
 └─────────────────────────────────────────────┘

 Completed:
 ┌─────────────────────────────────────────────┐
 │  🤖  Auth Agent  ✓  Done                    │   Green dot, fades after 30s
 └─────────────────────────────────────────────┘
```

### TypeScript Types

```typescript
interface AgentChipData {
  id: string;
  name: string;
  type: 'claude-code' | 'copilot' | 'copilot-cli';
  status: DerivedAgentStatus;
  intent: string;
  creator: 'user' | 'workflow' | 'pod';
  hasQuestion: boolean;
  questionPreview: string; // First ~60 chars of question text
  workspace: string;
  createdAt: string; // ISO-8601 — for stable default ordering
}

// Icon mapping
const AGENT_TYPE_ICONS: Record<AgentChipData['type'], string> = {
  'copilot': '🤖',
  'claude-code': '🧠',
  'copilot-cli': '💻',
};

// Or Lucide icons for crisp rendering:
const AGENT_TYPE_LUCIDE: Record<AgentChipData['type'], LucideIcon> = {
  'copilot': Bot,           // generic bot
  'claude-code': Brain,     // thinking
  'copilot-cli': Terminal,  // CLI
};
```

### Responsive Behavior

```
 ≤ 3 agents: Full chips with intent
 ┌─────────────────────────────────────────────────────────────────────────┐
 │  🤖 Auth Agent ⟳ Refactoring...  │  🧠 API Agent · idle  │  💻 CLI ·  │
 └─────────────────────────────────────────────────────────────────────────┘

 4–8 agents: Medium chips (name + status only)
 ┌─────────────────────────────────────────────────────────────────────────┐
 │  🤖 Auth ⟳  │  🧠 API ·  │  💻 CLI ⟳  │  🤖 DB ❓  │  🤖 Test ·    │
 └─────────────────────────────────────────────────────────────────────────┘

 9+ agents: Compact chips (initials + status), wraps to multiple rows
 ┌─────────────────────────────────────────────────────────────────────────┐
 │  🤖AA⟳  🧠AP·  💻CL⟳  🤖DB❓  🤖TE·  🤖FE⟳  🧠BE·  🤖IN⟳  🤖DE·  │
 │  🤖MG·  🧠QA⟳                                                         │
 └─────────────────────────────────────────────────────────────────────────┘
```

**Breakpoint logic**:

```typescript
type ChipMode = 'full' | 'medium' | 'compact';

function getChipMode(agentCount: number, containerWidth: number): ChipMode {
  const fullWidth = agentCount * 280;    // ~280px per full chip
  const mediumWidth = agentCount * 140;  // ~140px per medium chip

  if (fullWidth <= containerWidth) return 'full';
  if (mediumWidth <= containerWidth) return 'medium';
  return 'compact';
}
```

---

## Q4: Popover Behavior

### Interaction Model

Clicking a chip opens a **popover** anchored to that chip. The popover contains the agent's chat interface. This is the primary way users interact with agents — they do NOT navigate away from their current page.

### Popover Specification

```
  ┌───────────────── Top Bar ───────────────────────────────┐
  │  [🤖 Auth ⟳]  [🧠 API ·]  [💻 CLI ⟳]                  │
  └────────┬────────────────────────────────────────────────┘
           │ click
           ▼
  ┌────────────────────────────────────┐
  │ Auth Agent                    ✕  ↗ │ ← Header: name, close, "open full" link
  │ 🤖 copilot · Working              │ ← Subtitle: type, status
  │ Intent: Refactoring auth module    │ ← Current intent
  ├────────────────────────────────────┤
  │                                    │
  │  🤖 I'll refactor the auth module  │
  │     to use JWT tokens instead of   │ ← Chat messages (scrollable)
  │     session cookies...             │
  │                                    │
  │  👤 Yes, proceed with RSA keys     │
  │                                    │
  │  🤖 ⟳ Updating auth.service.ts...  │ ← Streaming content
  │                                    │
  ├────────────────────────────────────┤
  │ > Type a message...          Send  │ ← Input (AgentChatInput)
  └────────────────────────────────────┘
```

### Popover Properties

| Property | Value | Rationale |
|----------|-------|-----------|
| **Width** | 480px | Wide enough for code snippets, narrow enough for side-by-side |
| **Height** | 70vh (max 640px) | Tall enough for conversation context |
| **Anchor** | Bottom of clicked chip, left-aligned | Natural dropdown position |
| **Multiple open?** | **No** — one at a time | Multiple overlapping popovers create chaos. Click another chip to switch. |
| **Click outside** | Closes popover | Standard popover behavior |
| **Escape** | Closes popover | Keyboard accessibility |
| **Full chat?** | Yes — scrollable history | User needs full context to make decisions |
| **Can send prompts?** | **Yes** | This IS the primary interaction point — user connects/disconnects freely |
| **Streaming?** | **Yes** | Re-uses `useAgentInstance` hook — live content deltas |
| **Open full page** | `↗` button → `/workspaces/[slug]/agents/[id]` | Escape hatch for complex debugging |

### RESOLVED: One Popover, Full Chat, Can Send

**Why one-at-a-time**: The popover is 480px wide. Two open popovers at 960px total would consume most screens. The mental model is a "walkie-talkie" — you're tuned to one agent at a time. Switching is instant (click another chip).

**Why full chat, not summary**: The user's workflow is "agent asks question → user reads context → user answers." A summary would force another click to see context. The popover IS the agent's chat window.

**Why send prompts**: This is the core interaction loop described in the research dossier: "Agents running in BG a lot — user connects and disconnects to see stuff, provide inputs." If the popover can't send prompts, users must navigate to the agent page, breaking flow.

### Popover Component

```typescript
interface AgentPopoverProps {
  agentId: string;
  anchorEl: HTMLElement;      // The chip element for positioning
  onClose: () => void;
  onOpenFullPage: () => void; // Navigate to /workspaces/[slug]/agents/[id]
}

// Internals re-use existing components:
// - AgentChatView (chat messages + streaming)
// - AgentChatInput (prompt input)
// - useAgentInstance(agentId) (data + SSE subscription)
```

### Popover Lifecycle

```
 User clicks chip
       │
       ▼
 Is popover open for this agent?
       │
   ┌───┴───┐
   │Yes    │No
   │       │
   ▼       ▼
 Close   Is another popover open?
          │
      ┌───┴───┐
      │Yes    │No
      │       │
      ▼       ▼
   Close it  Open popover
   Open new  for this agent
   one
```

**State**: Single `openPopoverAgentId: string | null` in a React context or local state at the top bar level.

---

## Q5: Cross-Worktree Agent Visibility

### The Problem

Top bar shows agents for the **current worktree**. But agents in other worktrees might need attention (asking questions, errored). User said: "if agent in another worktree asks question or has been stopped a while, indicate in left menu activity area."

### RESOLVED: Left Menu Activity Badges

Agents from OTHER worktrees surface as **badges** on the worktree entries in `DashboardSidebar`, not in the top bar.

```
 ┌──── Dashboard Sidebar ─────┐
 │                             │
 │  🏠 Worktrees               │
 │                             │
 │    📁 main                  │  ← no badge: no agent activity
 │    📁 feature/auth   🟡 2   │  ← 2 agents need attention (questions)
 │    📁 feature/api    🔵 1   │  ← 1 agent working (informational)
 │    📁 bugfix/css     🔴 1   │  ← 1 agent errored
 │                             │
 └─────────────────────────────┘
```

**Why not in top bar**: The top bar is scoped to "my current workspace." Mixing worktrees would confuse the workspace context. The sidebar already lists worktrees — adding a badge is natural.

### Badge Rules

| Other Worktree Has... | Badge | Color | Priority |
|----------------------|-------|-------|----------|
| Agent with `has-question: true` | Count | 🟡 Amber | 1 (highest) |
| Agent with `error` status | Count | 🔴 Red | 2 |
| Agent with `working` status | Count | 🔵 Blue | 3 |
| Only idle/completed agents | None | — | — |

**Badge shows highest-priority color.** If worktree has 1 question + 2 working, badge is 🟡 3.

### State Subscription

```typescript
// In DashboardSidebar — subscribe to ALL agent state across worktrees
const allAgents = useGlobalStateList('agent:**');

// Group by workspace
const agentsByWorktree = useMemo(() => {
  const map = new Map<string, AgentSummary[]>();
  // Parse state entries into per-worktree summaries
  // ...
  return map;
}, [allAgents]);

// For each worktree in sidebar, show badge if any agents need attention
```

---

## Q6: Attention-Seeking UX — Screen Flash & Question Badge

### The Problem

When an agent stops with a question (especially via workflow event system), the user needs to be alerted. The user's stated design: "screen border flashes green 10s + big ? in top-left." But what about multiple simultaneous questions?

### RESOLVED: Layered Attention System

Three layers of escalating attention:

```
 Layer 1: Chip State Change (always)
 ┌─────────────────────────────────────────────────────────┐
 │  [🤖 Auth ⟳]  [🧠 API ·]  [💻 CLI ❓]                  │
 │                             └─ chip pulses amber ───────│
 └─────────────────────────────────────────────────────────┘

 Layer 2: Toast Notification (when popover closed for that agent)
 ┌──────────────────────────────────────────────────────────────┐
 │                              ┌──────────────────────────┐   │
 │                              │ 💻 CLI Agent has a        │   │
 │                              │ question: "Should I       │   │
 │                              │ proceed with deletion?"   │   │
 │                              │              [View]       │   │
 │                              └──────────────────────────┘   │
 │                                                             │
 └──────────────────────────────────────────────────────────────┘

 Layer 3: Screen Border Flash (first question only, user not focused on agents)
 ╔═══════════════════════════════════════════════════════════════╗
 ║                                                               ║
 ║  ❓                                                           ║
 ║                                                               ║
 ║                    [ normal page content ]                     ║
 ║                                                               ║
 ║                                                               ║
 ╚═══════════════════════════════════════════════════════════════╝
  ↑ green border glow, fades over 10s
  ↑ big ❓ in top-left corner, clickable → opens popover for that agent
```

### Layer Details

#### Layer 1: Chip Visual Change
- **Always active**
- Chip transitions to `waiting_input` state → amber pulse animation
- Question mark `❓` appears on chip
- No additional action needed — chip state is reactive via `useGlobalState`

#### Layer 2: Toast Notification
- **Fires when**: Agent transitions to `has-question: true` AND popover is NOT open for that agent
- **Content**: Agent name + first 80 chars of question
- **Action button**: "View" → opens popover for that agent
- **Duration**: Persistent (doesn't auto-dismiss) — user must act or manually dismiss
- **Stacking**: Multiple toasts stack vertically (sonner handles this)

#### Layer 3: Screen Border Flash
- **Fires when**: Agent transitions to `has-question: true` AND user has not interacted with any agent popover in the last 60 seconds (they're "away" from agent context)
- **Visual**: CSS box-shadow animation on body/main container — green glow that fades over 10 seconds
- **❓ badge**: Fixed-position element in top-left corner. Shows count of total unanswered questions.
- **Click**: Opens popover for the oldest unanswered question
- **Auto-dismiss**: Border flash fades after 10s. Badge persists until all questions answered.

### Multiple Simultaneous Questions

```
 Scenario: 3 agents ask questions within seconds of each other

 Top Bar:
 ┌─────────────────────────────────────────────────────────────┐
 │  [🤖 Auth ❓]  [🧠 API ❓]  [💻 CLI ❓]                     │
 │   ↑ pulse       ↑ pulse      ↑ pulse                       │
 └─────────────────────────────────────────────────────────────┘

 Question Badge (top-left):
 ┌──────┐
 │ ❓ 3  │  ← click cycles through: Auth → API → CLI
 └──────┘

 Toast Stack:
 ┌─────────────────────────────┐
 │ 💻 CLI: "Delete old files?" │
 │                      [View] │
 ├─────────────────────────────┤
 │ 🧠 API: "Use REST or gRPC?"│
 │                      [View] │
 ├─────────────────────────────┤
 │ 🤖 Auth: "RSA or ECDSA?"   │
 │                      [View] │
 └─────────────────────────────┘

 Screen Flash:
 - Fires ONCE on first question arrival
 - Does NOT re-flash for questions 2 and 3 (within cooldown)
 - Cooldown: 30s after last flash
```

### Flash Cooldown Logic

```typescript
const FLASH_COOLDOWN_MS = 30_000;
const FLASH_DURATION_MS = 10_000;

let lastFlashAt = 0;

function onAgentQuestion(agentId: string) {
  // Layer 1: chip state updates automatically via state system

  // Layer 2: toast
  if (openPopoverAgentId !== agentId) {
    toast.info(`${agentName} has a question`, {
      description: questionPreview,
      action: { label: 'View', onClick: () => openPopover(agentId) },
      duration: Infinity, // persistent
    });
  }

  // Layer 3: screen flash (with cooldown)
  const now = Date.now();
  if (now - lastFlashAt > FLASH_COOLDOWN_MS) {
    triggerScreenFlash();
    lastFlashAt = now;
  }

  // Layer 3: update question badge count (always)
  updateQuestionBadgeCount();
}
```

### CSS for Screen Flash

```css
@keyframes agent-attention-flash {
  0% { box-shadow: inset 0 0 0 4px rgba(34, 197, 94, 0.8); }   /* green-500 */
  30% { box-shadow: inset 0 0 0 3px rgba(34, 197, 94, 0.5); }
  100% { box-shadow: inset 0 0 0 0px rgba(34, 197, 94, 0); }
}

.agent-attention-flash {
  animation: agent-attention-flash 10s ease-out forwards;
}
```

---

## Q7: Agent Creator Tracking

### The Problem

Agents can be created by: (a) the user manually, (b) a workflow node, (c) a pod/team. The user wants to know at a glance what created each agent.

### RESOLVED: Creator Badge on Chip + State Path

**Creator types**:

| Creator | Source | Badge | Color |
|---------|--------|-------|-------|
| `user` | Manual creation via UI/CLI | None (default) | — |
| `workflow` | Workflow agentic node (Plan 030 IODS) | `WF` | Purple |
| `pod` | Pod/team orchestration | `POD` | Teal |

**Visual**:

```
 User-created (no badge — most common):
 ┌─────────────────────────────┐
 │  🤖  Auth Agent  ⟳          │
 └─────────────────────────────┘

 Workflow-created:
 ┌─────────────────────────────┐
 │  🤖  Auth Agent  ⟳    WF   │
 │                        ↑    │
 │                   purple bg │
 └─────────────────────────────┘

 Pod-created:
 ┌─────────────────────────────┐
 │  🤖  Auth Agent  ⟳   POD   │
 │                        ↑    │
 │                    teal bg  │
 └─────────────────────────────┘
```

**Implementation**: Set at creation time, immutable. Stored as `agent:{id}:creator` state path.

```typescript
// In agent creation API
const creator: AgentCreator = body.workflowNodeId ? 'workflow'
  : body.podId ? 'pod'
  : 'user';

// Published to state system
state.publish(`agent:${agentId}:creator`, creator);
```

---

## Component Architecture

### Component Tree

```
 DashboardShell
 └── SidebarInset
     ├── AgentTopBar                          ← NEW: persistent bar
     │   ├── AgentQuestionBadge               ← NEW: floating ❓ counter
     │   ├── AgentChip (×N)                   ← NEW: per-agent chip
     │   │   └── AgentStatusDot               ← REUSE: from AgentStatusIndicator
     │   └── AgentPopover                     ← NEW: chat overlay
     │       ├── AgentPopoverHeader           ← NEW: name, type, status, close/expand
     │       ├── AgentChatView                ← REUSE: existing chat component
     │       └── AgentChatInput               ← REUSE: existing input component
     ├── AgentScreenFlash                     ← NEW: border flash effect
     └── <main>
         └── [page content]
```

### New Components

| Component | Responsibility | Key Props |
|-----------|---------------|-----------|
| `AgentTopBar` | Container: subscribes to agent state, renders chips, manages popover state, handles drag reorder | `worktreeSlug: string` |
| `AgentChip` | Single agent chip: icon, name, status, intent, creator badge, question badge | `data: AgentChipData`, `mode: ChipMode`, `isActive: boolean`, `onClick: () => void` |
| `AgentPopover` | Floating panel with chat: anchored to chip, contains AgentChatView + AgentChatInput | `agentId: string`, `anchorEl: HTMLElement`, `onClose`, `onOpenFullPage` |
| `AgentPopoverHeader` | Popover header: agent name, type icon, status text, close button, expand button | `agent: AgentChipData`, `onClose`, `onExpand` |
| `AgentQuestionBadge` | Floating counter: shows total unanswered questions, click cycles through them | `questionAgentIds: string[]`, `onSelect: (id: string) => void` |
| `AgentScreenFlash` | CSS animation wrapper: green border flash on question arrival | `active: boolean` |
| `AgentStatePublisher` | Invisible: bridges server agent state → GlobalStateSystem (Plan 053 pattern) | `agentId: string` |
| `AgentStateConnector` | Invisible: registers agent domain, mounts publishers for all agents | `worktreeSlug: string` |

### Reused Components

| Component | From | Adaptation Needed |
|-----------|------|-------------------|
| `AgentChatView` | `components/agents/` | Add `compact` prop to hide header (popover has its own) |
| `AgentChatInput` | `components/agents/` | None — works as-is |
| `AgentStatusIndicator` | `components/agents/` | Already has compact mode. Map new status model to existing icons. |

### State Wiring

```typescript
// AgentTopBar.tsx — subscribes to all agent state for current worktree
function AgentTopBar({ worktreeSlug }: { worktreeSlug: string }) {
  const allAgentState = useGlobalStateList('agent:**');

  // Derive chip data from flat state entries
  const agents = useMemo(() => {
    return deriveAgentChips(allAgentState, worktreeSlug);
  }, [allAgentState, worktreeSlug]);

  // Filter: only agents for this worktree, in visible statuses
  const visibleAgents = agents.filter(a =>
    a.workspace === worktreeSlug &&
    !['archived', 'terminated'].includes(a.status)
  );

  // Order: saved drag order, then creation time
  const [savedOrder] = useLocalStorage<string[]>(
    `agent-order:${worktreeSlug}`,
    []
  );
  const orderedAgents = getOrderedAgents(visibleAgents, savedOrder);

  // ...render
}
```

---

## State System Registration

Following the WorktreeStatePublisher exemplar from Plan 053-P5:

```typescript
// register-agent-state.ts
import type { IStateService } from '@chainglass/shared/state';

export function registerAgentState(state: IStateService): void {
  state.registerDomain({
    name: 'agent',
    description: 'Per-agent execution state (status, intent, type, questions)',
    multiInstance: true,
    properties: {
      status:        { type: 'string', description: 'Backend status: working | stopped | error' },
      intent:        { type: 'string', description: 'Current action description' },
      type:          { type: 'string', description: 'Agent adapter type' },
      name:          { type: 'string', description: 'Human-readable agent name' },
      workspace:     { type: 'string', description: 'Worktree slug' },
      'has-question':  { type: 'boolean', description: 'Agent is waiting for user input' },
      'question-text': { type: 'string', description: 'The question being asked' },
      creator:       { type: 'string', description: 'What created this agent: user | workflow | pod' },
      'has-ever-run':  { type: 'boolean', description: 'Has the agent ever executed a prompt' },
      'last-run-ok':   { type: 'boolean', description: 'Did the last run succeed (null if never run)' },
    },
  });
}
```

```typescript
// AgentStatePublisher.tsx
'use client';

import { useEffect } from 'react';
import { useAgentInstance } from '@/features/019-agent-manager-refactor/hooks/useAgentInstance';
import { useStateSystem } from '@/lib/state';

export function AgentStatePublisher({ agentId }: { agentId: string }) {
  const state = useStateSystem();
  const { agent } = useAgentInstance(agentId);

  useEffect(() => {
    if (!agent) return;
    const prefix = `agent:${agentId}`;
    state.publish(`${prefix}:status`, agent.status);
    state.publish(`${prefix}:intent`, agent.intent ?? '');
    state.publish(`${prefix}:type`, agent.type);
    state.publish(`${prefix}:name`, agent.name);
    state.publish(`${prefix}:workspace`, agent.workspace);
    // has-question derived from SSE events or last event type
    // creator set once at creation, not re-published
  }, [state, agentId, agent?.status, agent?.intent, agent?.type, agent?.name, agent?.workspace]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      state.removeInstance('agent', agentId);
    };
  }, [state, agentId]);

  return null; // Invisible publisher
}
```

---

## Layout Integration

### Physical Placement

```tsx
// dashboard-shell.tsx (modified)
export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <DashboardSidebar />
        <SidebarInset>
          <AgentTopBar />           {/* ← NEW: above main, always visible */}
          <AgentScreenFlash />      {/* ← NEW: CSS overlay for attention */}
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
```

### Top Bar CSS

```css
/* Agent top bar — sticky, above content, wraps for many agents */
.agent-top-bar {
  position: sticky;
  top: 0;
  z-index: 40;                          /* above content, below modals */
  display: flex;
  flex-wrap: wrap;                       /* wraps to multiple rows */
  gap: 6px;
  padding: 6px 12px;
  background: hsl(var(--background));
  border-bottom: 1px solid hsl(var(--border));
  min-height: 0;                         /* collapses when no agents */
}

/* Only render when there are agents */
.agent-top-bar:empty {
  display: none;
}
```

### Conditional Rendering

The top bar should not render anything when there are zero visible agents:

```typescript
function AgentTopBar({ worktreeSlug }: { worktreeSlug: string }) {
  const orderedAgents = useAgentTopBarData(worktreeSlug);

  if (orderedAgents.length === 0) return null; // No bar at all

  return (
    <div className="agent-top-bar" role="toolbar" aria-label="Running agents">
      {orderedAgents.map(agent => (
        <AgentChip key={agent.id} data={agent} /* ... */ />
      ))}
    </div>
  );
}
```

---

## Drag-to-Reorder Implementation

### Library Choice

**RESOLVED**: Use `@dnd-kit/core` — already the standard for drag in React. Lightweight, accessible, touch-friendly.

### Drag UX

```
 Before drag:
 ┌──────────────────────────────────────────────────────────────┐
 │  [🤖 Auth ⟳]  [🧠 API ·]  [💻 CLI ⟳]  [🤖 DB ❓]          │
 └──────────────────────────────────────────────────────────────┘

 During drag (Auth being moved):
 ┌──────────────────────────────────────────────────────────────┐
 │  [         ]  [🧠 API ·]  [💻 CLI ⟳]  [🤖 DB ❓]           │
 │        ↕                                                     │
 │  ┌─────────────┐                                             │
 │  │ 🤖 Auth ⟳   │  ← drag ghost, 50% opacity                │
 │  └─────────────┘                                             │
 └──────────────────────────────────────────────────────────────┘
                       ↑ drop indicator line between CLI and DB

 After drop (Auth moved to between CLI and DB):
 ┌──────────────────────────────────────────────────────────────┐
 │  [🧠 API ·]  [💻 CLI ⟳]  [🤖 Auth ⟳]  [🤖 DB ❓]          │
 └──────────────────────────────────────────────────────────────┘
```

### Persistence

```typescript
function onDragEnd(event: DragEndEvent) {
  const { active, over } = event;
  if (!over || active.id === over.id) return;

  setAgents(prev => {
    const oldIndex = prev.findIndex(a => a.id === active.id);
    const newIndex = prev.findIndex(a => a.id === over.id);
    const reordered = arrayMove(prev, oldIndex, newIndex);

    // Persist to localStorage
    const order = reordered.map(a => a.id);
    localStorage.setItem(`agent-order:${worktreeSlug}`, JSON.stringify(order));

    return reordered;
  });
}
```

---

## Mobile Considerations

On mobile (`< 768px`), `NavigationWrapper` renders a different layout with `BottomTabBar`. The agent top bar adaptation:

```
 Mobile: Collapsed to icon strip above bottom bar
 ┌─────────────────────────────┐
 │                             │
 │     [page content]          │
 │                             │
 ├─────────────────────────────┤
 │  🤖⟳  🧠·  💻❓  [+2]      │  ← agent icon strip (compact only)
 ├─────────────────────────────┤
 │  🏠  📁  🔀  ⚙️             │  ← bottom tab bar
 └─────────────────────────────┘
```

- Only compact mode (icons + status dot)
- Tap → full-screen sheet (not popover — popovers are awkward on mobile)
- `[+2]` overflow counter if too many to fit

---

## Complete State Path Reference

| Path Pattern | Type | Published By | Consumed By |
|---|---|---|---|
| `agent:{id}:status` | `'working' \| 'stopped' \| 'error'` | AgentStatePublisher | AgentTopBar, DashboardSidebar |
| `agent:{id}:intent` | `string` | AgentStatePublisher | AgentChip (tooltip/text) |
| `agent:{id}:type` | `'claude-code' \| 'copilot' \| 'copilot-cli'` | AgentStatePublisher | AgentChip (icon) |
| `agent:{id}:name` | `string` | AgentStatePublisher | AgentChip (label) |
| `agent:{id}:workspace` | `string` | AgentStatePublisher | AgentTopBar (filter), DashboardSidebar (group) |
| `agent:{id}:has-question` | `boolean` | AgentStatePublisher | AgentChip (badge), AgentQuestionBadge, AgentScreenFlash |
| `agent:{id}:question-text` | `string` | AgentStatePublisher | Toast content, popover preview |
| `agent:{id}:creator` | `'user' \| 'workflow' \| 'pod'` | AgentStatePublisher (once) | AgentChip (badge) |
| `agent:{id}:has-ever-run` | `boolean` | AgentStatePublisher | Status derivation |
| `agent:{id}:last-run-ok` | `boolean \| null` | AgentStatePublisher | Status derivation |

**Subscribe patterns used**:

| Consumer | Pattern | Purpose |
|----------|---------|---------|
| AgentTopBar | `agent:**` | All agent state for deriving chip data |
| DashboardSidebar | `agent:**` | Cross-worktree badges |
| AgentChip | `agent:{id}:*` | Single agent (only if component needs direct sub) |

---

## Open Questions

### Q-OPEN-1: Completed Agent Auto-Fade Timing?

**OPEN**: Current design says completed agents fade from top bar after 30s. Should this be:
- 30 seconds (quick cleanup)
- 5 minutes (user might come back to check)
- Never auto-fade (user manually archives)
- Configurable via settings

**Recommendation**: 5 minutes, then fade to 50% opacity (still visible, but visually de-emphasized). User can click to see results. Manual archive removes entirely.

### Q-OPEN-2: Agent Name Editing?

**OPEN**: Can users rename agents in the top bar? Currently agents get a name at creation. Options:
- Double-click chip name to edit inline
- Edit in popover header
- Not supported (name is immutable)

**Recommendation**: Edit in popover header via pencil icon. Inline editing on chips is fiddly.

### Q-OPEN-3: Keyboard Navigation?

**OPEN**: Should the top bar support keyboard navigation?
- Tab between chips, Enter to open popover, arrow keys within popover
- Not a priority for initial implementation

**Recommendation**: Yes for accessibility, but implement in a follow-up phase. Use `role="toolbar"` with `aria-label` from the start so the structure is in place.

---

## Quick Reference

### Status Colors

| Status | Dot Color | Border | Animation |
|--------|-----------|--------|-----------|
| `working` | `blue-500` | `blue-500/20` left | Spinning loader |
| `waiting_input` | `amber-500` | `amber-500/20` all | Pulse |
| `idle` | `zinc-400` | none | None |
| `error` | `red-500` | `red-500/20` left | None |
| `completed` | `green-500` | none | Fade out after 5min |

### Key Dimensions

| Element | Size |
|---------|------|
| Chip height | 32px |
| Chip gap | 6px |
| Top bar padding | 6px 12px |
| Popover width | 480px |
| Popover max-height | 70vh / 640px |
| Question badge size | 28px circle |

### State System Quick Start

```typescript
// Subscribe to all agents
const agents = useGlobalStateList('agent:**');

// Subscribe to single agent status
const status = useGlobalState<string>(`agent:${id}:status`, 'idle');

// Check for questions across all agents
const questions = useGlobalStateList('agent:*:has-question');
const questionCount = questions.filter(e => e.value === true).length;
```

---

## Summary of Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| Q1 | What shows in top bar? | 5 visible statuses (working, waiting_input, idle, error, completed) | Derived from backend 3-state + client context |
| Q2 | Ordering? | Creation time + drag override | Stability > recency; visual hints > reordering |
| Q3 | Chip content? | Type icon + name + status dot + intent (space permitting) + creator badge | Progressive disclosure based on available width |
| Q4 | Popover? | 480px wide, one at a time, full chat, can send prompts | Primary interaction point — must be complete |
| Q5 | Cross-worktree? | Badge on sidebar worktree entries | Top bar = current workspace; sidebar = global view |
| Q6 | Attention flash? | 3 layers: chip pulse → toast → screen flash | Escalating attention without overwhelming |
| Q7 | Creator tracking? | Badge on chip (WF/POD), no badge for user-created | Visual noise reduction for common case |
