# Workshop: UX Vision & Workspace Experience

**Type**: UX Design
**Plan**: 041-file-browser
**Spec**: docs/plans/041-file-browser/research.md
**Created**: 2026-02-22
**Status**: Draft — Authoritative vibe reference

**Related Documents**:
- [Deep Linking Workshop](./deep-linking-system.md)
- [Exploration Research Dossier](../research.md)

---

## Purpose

Establish the **authoritative UX vision** for Chainglass as a product. This isn't just "how should the landing page look" — it defines what this tool IS and how it FEELS. Every future feature should refer back here for vibe, interaction patterns, and design principles.

This workshop also provides concrete design for: landing page, workspace navigation, sidebar structure, browser tab strategy, visual identification (emojis/colors), and how deep linking makes the whole thing sing.

## Key Questions Addressed

- What is the product vibe? How should it feel to use?
- How does the landing page / workspace selector work?
- How does a user work across multiple workspaces in multiple browser tabs?
- How do emojis / visual identifiers work across tabs?
- How does the sidebar adapt when you're "inside" a workspace vs "browsing"?
- How do deep links enable power-user workflows (pinning, bookmarking)?
- How do we open things in new tabs?

---

## 1. The Vibe

### What this product IS

**One human, many agents.** Chainglass is a mission control for a single developer who runs a fleet of AI agents across multiple codebases. The human reviews code, sees diffs, chats with agents, stops them, redirects them, launches new ones — all from a browser. The browser IS the cockpit.

### What it is NOT

- Not a team collaboration tool (one user, their machine)
- Not an IDE replacement (it complements your editor, not replaces it)
- Not a monitoring dashboard (it's interactive — you intervene, you direct)
- Not a project management tool (no tickets, no sprints)

### Design principles (in priority order)

1. **Calm over busy.** When 8 agents are running, the UI should feel controlled, not chaotic. Show status, not noise. A glance should tell you "all good" or "attention needed."

2. **Spatial memory over menus.** Users learn where things are. Workspaces are always in the same place. The file browser is always on the left. Modes toggle in the same spot. Predictable layout > flexible layout.

3. **URL is truth.** Every meaningful state is in the URL. Bookmark it, pin it, share it across tabs. The back button works. Refresh works. This is a web app — use web strengths.

4. **Browser-native.** Middle-click opens a new tab. Right-click "open in new tab" works. Cmd+click works. We don't fight the browser — we lean into it. Links are links. Tabs are tabs.

5. **Glanceable identity.** Each workspace should be instantly recognizable without reading text. Color, emoji, visual weight — your eyes should find the right tab in 0.2 seconds.

6. **Progressive disclosure.** Landing page is simple. Click into workspace → more detail. Click into agent → full detail. Each level adds information, never dumps it all at once.

7. **Elegant minimalism.** Every pixel earns its place. No chrome for chrome's sake. No features that "might be useful." If it doesn't serve the human-scaler use case, it doesn't exist.

---

## 2. The Landing Page — Workspace Selector

### What it looks like

The landing page is `http://localhost:3000/`. It shows your workspaces and nothing else. No dashboard widgets, no charts, no getting-started cards. Just: "here are your workspaces, pick one."

```
┌─────────────────────────────────────────────────────────────────┐
│  ◆ Chainglass                                    [☀/🌙] [⚙]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│          Your Workspaces                                        │
│                                                                 │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│   │  🔮          │  │  🌊          │  │  ⚡          │        │
│   │  substrate   │  │  web-app     │  │  infra       │        │
│   │              │  │              │  │              │        │
│   │  main        │  │  feature/x   │  │  main        │        │
│   │  3 agents ●  │  │  1 agent ●   │  │  idle        │        │
│   └──────────────┘  └──────────────┘  └──────────────┘        │
│                                                                 │
│   ┌──────────────┐                                             │
│   │  ＋          │                                             │
│   │  Add         │                                             │
│   │  workspace   │                                             │
│   └──────────────┘                                             │
│                                                                 │
│   ─────────────────────────────────────────────────            │
│   Settings: Manage workspaces →                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Card anatomy

Each workspace card shows:

```
┌──────────────────────────┐
│  🔮  substrate           │  ← Emoji (persisted) + workspace name
│                          │
│  12 worktrees            │  ← Worktree count (not a list — too many)
│  3 agents running  ●●●   │  ← Agent fleet status (dots = running agents)
│                          │
│  ~/substrate             │  ← Path (muted, small)
└──────────────────────────┘
```

**Why count, not list?** A workspace like `substrate` has **23 worktrees** (one per plan branch). Listing them all on the card would make it enormous. The card is for identification and status at a glance — worktree selection happens AFTER you click into the workspace.

For small workspaces (1-3 worktrees), the card can show branch names inline:

```
┌──────────────────────────┐
│  🌊  web-app             │
│                          │
│  main · feature/auth     │  ← 1-3 worktrees: show names
│  ● 1 agent               │
│  ~/web-app               │
└──────────────────────────┘
```

**Rule**: ≤3 worktrees → show branch names. >3 → show count only.

- **Click** → enters workspace (navigates to `/workspaces/{slug}`)
- **Middle-click / Cmd+click** → opens workspace in new tab (it's a `<Link>`)
- **Agent status** is live (SSE-fed). Green dots = running. No dots = idle. Red dot = needs attention.
- **Hover** → subtle elevation/shadow. No other decoration.

### The "Add Workspace" card

A dashed-border card with `+` icon. Clicking it opens an inline form (not a modal — modals break spatial memory). The form has two fields: name + path. That's it.

### No sidebar on landing page

The landing page has NO sidebar. It's a full-width, centered layout. The sidebar appears only after you enter a workspace. This reinforces the "pick a workspace first" mental model.

```
Landing page (/)          →  Workspace page (/workspaces/slug)
┌───────────────────┐        ┌────┬──────────────────┐
│                   │        │    │                   │
│   [cards grid]    │   →    │ SB │   [workspace UI]  │
│                   │        │    │                   │
└───────────────────┘        └────┴──────────────────┘
```

### Settings / Manage Workspaces

Below the cards grid, a subtle text link: "Manage workspaces →". This goes to `/settings/workspaces` — a table view for power-user operations (reorder, remove, edit emoji, edit path). NOT the default experience. The landing page is for selecting, not managing.

---

## 3. Inside a Workspace — The Sidebar

Once you click into a workspace, the sidebar appears. It has two sections:

```
┌─────────────────────┐
│ 🔮 substrate        │  ← Workspace header (emoji + name)
│ main                │  ← Active worktree/branch
├─────────────────────┤
│                     │
│ 📁 Browser          │  ← File browser (this plan)
│ 🤖 Agents           │  ← Agent fleet for this workspace
│ ⚡ Workflows        │  ← Workflow graphs (future)
│                     │
├─────────────────────┤
│                     │
│ ← All Workspaces    │  ← Back to landing page
│                     │
├─────────────────────┤
│ Dev                 │  ← Collapsed section (demos, internal tools)
│  ▸ Demos            │
│  ▸ Kanban           │
│  ▸ Workflow Viz     │
└─────────────────────┘
```

### Key decisions

1. **Workspace name in sidebar header** — always visible, always first. With emoji. You know exactly which workspace you're in.

2. **Three main items** — Browser, Agents, Workflows. That's the product. Everything else is secondary.

3. **"All Workspaces" link** — not buried in a menu. It's always there, clearly labeled, takes you back to `/`. This is how you switch workspaces.

4. **"Dev" section** — collapsed by default. Contains demos, kanban, workflow visualization, and other internal/prototype pages. Keeps them accessible without cluttering the main nav.

5. **No workspace switcher dropdown in the sidebar** — that would encourage staying in the sidebar and switching context in-place. We WANT users to go back to the landing page (or open another tab). Each tab = one workspace context.

### Worktree selection

A workspace can have MANY worktrees — the real `substrate` workspace has **23**. A simple dropdown of 23 items is unusable. This needs a proper selection experience.

**Sidebar worktree selector** — a compact searchable picker:

```
┌─────────────────────────┐
│ 🔮 substrate            │
│ ▾ 041-file-browser      │  ← Current worktree (click to open picker)
├─────────────────────────┤
```

Clicking opens a popover/sheet with search + list:

```
┌─────────────────────────┐
│ 🔮 substrate            │
│ ┌───────────────────┐   │
│ │ 🔍 filter...      │   │
│ ├───────────────────┤   │
│ │ ★ main            │   │  ← Starred/recent worktrees at top
│ │ ★ 041-file-browser│   │
│ │ ───────────────── │   │
│ │   002-agents      │   │  ← Rest alphabetically
│ │   003-wf-basics   │   │
│ │   005-web-slick   │   │
│ │   ...  (23 total) │   │
│ │   033-real-agent..│   │
│ └───────────────────┘   │
├─────────────────────────┤
│ 📁 Browser              │
```

**Design decisions for scale (20+ worktrees):**
- **Search/filter** at top — type "033" to find `033-real-agent-pods` instantly
- **Starred worktrees** pin to top (same star pattern as workspace favorites)
- **Recently used** above the alphabetical list (last 3 visited)
- **Scrollable** — max-height with scroll for 23+ items
- **Keyboard navigable** — arrow keys + enter, escape to close
- **Branch name display** — short branch name, full path in tooltip
- On **phone**: full-screen sheet with large touch targets
- **Activity indicators** — worktrees with running agents get a green dot, so you can see which branches are "hot"
- **Attention indicators** — worktrees with agents in error/question state get ◆ amber diamond, so you can quickly find which branch needs you

```
│ ★ main             ● ◆ │  ← Running agent + attention needed
│ ★ 041-file-browser ●   │  ← Running agent, all healthy
│   002-agents            │  ← Idle
│   033-real-agent.. ◆    │  ← Attention needed (agent stuck)
```

> **Note: Design-only for now.** The worktree-level attention aggregation requires correlating agents with their worktree context. The current agent data model has a `workspace` field but worktree-level eventing and data structures don't exist yet. The UI should render the indicators when the data is available, and gracefully show nothing when it isn't. Design the component props to accept optional attention state — wire it up when the eventing system lands.

**The worktree picker is essentially a command palette scoped to worktrees.** For 2-3 worktrees the search is unnecessary, but for 23 it's essential. The same UI scales gracefully for both.

Selecting a worktree updates the `?worktree=` param on the current page via deep linking. All sub-pages (browser, agents) are scoped to the selected worktree.

---

## 4. Browser Tab Strategy

### The mental model

**One browser tab = one workspace focus.** Users open different workspaces in different tabs. Within a workspace, they might also open specific files or agent chats in separate tabs.

### How it works

- **Landing page** → click workspace → same tab navigates to workspace
- **Landing page** → middle-click workspace → new tab opens to workspace
- **Inside workspace** → any link can be opened in a new tab via middle-click or right-click "Open in New Tab"
- **Agent list** → middle-click agent → new tab with that agent's chat

This is all just `<Link href>` — the browser handles the rest. We don't need a custom "open in new tab" button. The browser does this natively for every `<a>` tag.

### BUT: An explicit "pop out" affordance

For key things where parallel viewing is especially useful, add a small "pop out" icon button next to the link:

```
┌─────────────────────────────────────────────────────┐
│ Agent: code-reviewer        ●  working    [↗]  [⏹] │
└─────────────────────────────────────────────────────┘
                                            ↑
                                    Opens in new tab
                                    (window.open)
```

The `[↗]` button calls `window.open(deepLinkedUrl, '_blank')`. This is for users who might not know about middle-click, or who are on a trackpad without easy middle-click.

**Where to put pop-out buttons:**
- Agent chat links (in agent list)
- File viewer (when viewing a specific file)
- NOT on every link (that would be noisy)

### Tab identification

When you have 5 tabs open, you need to tell them apart. The browser tab title should be:

```
🔮 substrate — Browser                    ← workspace emoji + name + current page
🌊 web-app — agent-reviewer (working)     ← workspace emoji + name + agent context
⚡ infra — src/deploy.ts [edit]            ← workspace emoji + name + file context
```

This uses `document.title` (or Next.js `metadata.title`). The emoji comes first so it's visible even when tabs are narrow and text is truncated.

---

## 5. Visual Identity — Emojis & Colors

### The design problem

You have 4 tabs open. You glance at the tab bar. You need to find "substrate" in 0.2 seconds. Text is too slow to read. You need shape + color.

### Emoji approach

Each workspace gets an emoji. This emoji:
- Is **persisted per workspace** (not per session, not per tab)
- Is stored in the workspace data model (server-side)
- Is **user-selectable** from a curated palette
- Defaults to a random pick from the palette on workspace creation

### Why persisted per workspace, not per tab?

If each tab gets a random emoji, you'd see different emojis for the same workspace across tabs. That defeats the purpose. The emoji IS the workspace identity — it must be consistent.

**Original request was "random per session."** After consideration: pinning to workspace is better because:
- Same workspace in 3 tabs → same emoji in all 3 → spatial recognition works
- You learn "🔮 = substrate" once, it sticks forever
- You can choose an emoji that means something to you
- Tab titles show the emoji → consistent across all tabs for that workspace

### The emoji palette

Curated set of ~30 visually distinct emojis. NOT the full emoji keyboard (too many choices, many look similar at small sizes). Focus on shapes and colors that are distinct at tab-bar size.

```typescript
const WORKSPACE_EMOJI_PALETTE = [
  // Gems & objects (distinct shapes)
  '🔮', '💎', '🔥', '⚡', '🌊', '🌿', '🎯', '🚀', '⭐', '🌸',
  // Animals (recognizable silhouettes)
  '🦊', '🐙', '🦋', '🐝', '🦅', '🐺',
  // Geometric / abstract
  '🔷', '🔶', '🟣', '🟢', '🔴', '🟡',
  // Fun
  '🎲', '🎪', '🧊', '🌈', '🍊', '🌺', '🎸', '🏔️',
];
```

### Color accent (stretch goal, keep simple for now)

Each workspace could also have a subtle color accent — a thin colored bar at the top of the sidebar, or a colored dot next to the emoji. This is a nice-to-have. Start with emoji only.

### Where the emoji appears

| Location | Format | Example |
|----------|--------|---------|
| Landing page card | Large, prominent | `🔮 substrate` |
| Sidebar header | Medium, with name | `🔮 substrate` |
| Browser tab title | First character | `🔮 substrate — Browser` |
| Breadcrumbs | Inline with name | `🔮 substrate / Browser / src/lib` |

### Emoji selection UX

On the "Manage Workspaces" page (`/settings/workspaces`), each workspace row has its emoji as a clickable button. Click it → a small popover shows the palette. Click an emoji → saved immediately.

On workspace creation, a random emoji is assigned. The user can change it later. No emoji picker during creation (keep the add form dead simple — name + path only).

---

## 6. Deep Linking in Action — Power User Workflows

### Scenario: "I want to check on my 3 running agents across 2 workspaces"

1. Open browser, type `localhost:3000` → landing page shows workspaces with live agent counts
2. Middle-click "substrate" → new tab: `🔮 substrate — Agents`
3. Middle-click "web-app" → new tab: `🌊 web-app — Agents`
4. In substrate tab, see agent list. Click into "code-reviewer" → `🔮 substrate — code-reviewer (working)`
5. Each tab has its own full URL: `/workspaces/substrate/agents/abc123`

Total time: ~5 seconds. All bookmarkable.

### Scenario: "Pin my most-used file for quick access"

1. Navigate to: `/workspaces/substrate/browser?worktree=...&file=src/lib/utils.ts&mode=edit`
2. Bookmark it in browser favorites bar
3. Tomorrow: click bookmark → opens directly to that file in edit mode
4. No navigation needed. No "find the file." It's just there.

### Scenario: "Agent is stuck, I need to see the diff and chat at the same time"

1. In agent chat, see the file it's working on
2. Click `[↗]` pop-out on the file reference → new tab opens: `/workspaces/substrate/browser?file=src/lib/utils.ts&mode=diff`
3. Now: one tab = agent chat, other tab = file diff. Side by side.

### Scenario: "I'm reviewing code across two worktrees"

1. Tab 1: `/workspaces/substrate/browser?worktree=/path/main&file=src/auth.ts`
2. Tab 2: `/workspaces/substrate/browser?worktree=/path/feature-x&file=src/auth.ts`
3. Same file, two worktrees, two tabs. Browser-native comparison.

---

## 7. Page-by-Page UX Notes

### `/` — Landing page

- Full-width centered layout, no sidebar
- Grid of workspace cards (responsive: 1-4 columns)
- Live agent status on each card (SSE-updated)
- "Add workspace" card at the end
- "Manage workspaces" text link below grid
- Title: `Chainglass`

### `/workspaces/[slug]` — Workspace home

- Sidebar appears (Browser, Agents, Workflows)
- Main content: worktree selector (if multiple) + feature cards
- Quick stats: N agents running, N files changed
- Title: `🔮 substrate`

### `/workspaces/[slug]/browser` — File browser

- Two-panel layout: file tree (left) + file viewer (right)
- File tree: expandable folders, filter toggle (all/changed), refresh button
- File viewer: edit/preview/diff mode buttons, save button, refresh button
- Deep link params: `?dir=`, `?file=`, `?mode=`, `?changed=`
- Title: `🔮 substrate — src/lib/utils.ts [edit]` (or `— Browser` if no file selected)

### `/workspaces/[slug]/agents` — Agent fleet

- List of agents with live status
- Each row: name, type, status dot, intent, last active time, `[↗]` pop-out
- Create agent form (in sidebar or compact inline)
- Title: `🔮 substrate — Agents`

### `/workspaces/[slug]/agents/[id]` — Agent chat

- Full-height chat view
- Header: agent name, status, stop/resume buttons
- Chat: message stream, tool calls, thinking blocks
- Title: `🔮 substrate — code-reviewer (working)`

### `/settings/workspaces` — Workspace management

- Table: emoji (clickable) + name + path + created + actions (edit, remove)
- Reorder via drag? (Maybe later. Keep it simple.)
- No sidebar — standalone settings page like the landing page

---

## 8. Sidebar State & Persistence

### Collapsed vs expanded

The sidebar can be collapsed to icon-only mode (existing behavior via shadcn Sidebar). Collapse state is persisted in a cookie (`sidebar_state`) — already implemented.

### When collapsed

```
┌───┐
│🔮 │  ← Workspace emoji (clickable → expands sidebar)
├───┤
│📁 │  ← Browser (tooltip: "Browser")
│🤖 │  ← Agents
│⚡ │  ← Workflows
├───┤
│ ← │  ← All Workspaces
├───┤
│🔧 │  ← Dev section
└───┘
```

Icons only. Tooltips on hover. The emoji at top immediately tells you which workspace.

---

## 9. Responsive Design — Phone & iPad Are First-Class

**All pages must be responsive. Phone and iPad support is critical.**

The user may check on their agent fleet from their phone while away from their desk. They may review a diff on an iPad while on the couch. The deep linking system makes this especially powerful — text a deep link to yourself, open on phone, see the file.

### Breakpoints

| Breakpoint | Device | Layout |
|-----------|--------|--------|
| `<640px` | Phone (portrait) | Single column, bottom tab bar, full-screen panels |
| `640-1023px` | Phone (landscape) / iPad (portrait) / small tablets | Single column, sidebar as overlay sheet |
| `≥1024px` | iPad (landscape) / desktop | Sidebar + content side by side |

### Phone (<640px)

**Navigation**: Bottom tab bar with 3-4 icons (Home, Browser, Agents, more). The existing `BottomTabBar` component already handles this. When inside a workspace, the tabs switch to workspace-scoped: Browser, Agents, Workflows.

**Landing page**: Full-width stacked cards, 1 column. Fleet status bar at top. Cards slightly taller with larger touch targets. Emoji + name + status — path hidden to save space.

```
┌─────────────────────┐
│ ● 3 agents working  │  ← Fleet bar (compact)
├─────────────────────┤
│                     │
│  🔮 substrate       │  ← Card (full width)
│  ●● 2 agents        │
│                     │
│  🌊 web-app         │  ← Card
│  ● 1 agent          │
│                     │
│  ＋ Add workspace   │
│                     │
├─────────────────────┤
│ 🏠  📁  🤖  ⋯      │  ← Bottom tab bar
└─────────────────────┘
```

**File browser**: Two full-screen modes. The tree is a full-screen list (touch-friendly, 44px+ rows). Tapping a file navigates to a full-screen viewer. Back button returns to tree. No split panel — screen is too narrow.

```
File tree view:              File viewer:
┌─────────────────────┐      ┌─────────────────────┐
│ ← Browser   🔄 ☰   │      │ ← utils.ts  ✏️ 👁 ∆ │
├─────────────────────┤      ├─────────────────────┤
│ 📁 src/             │      │                     │
│   📁 lib/           │      │  [file content      │
│     📄 utils.ts     │ →    │   with syntax       │
│     📄 auth.ts      │      │   highlighting]     │
│   📁 components/    │      │                     │
│ 📄 package.json     │      │                     │
├─────────────────────┤      ├─────────────────────┤
│ ☐ Changed only  🔄  │      │ [Save]    [Refresh] │
├─────────────────────┤      ├─────────────────────┤
│ 🏠  📁  🤖  ⋯      │      │ 🏠  📁  🤖  ⋯      │
└─────────────────────┘      └─────────────────────┘
```

**Agent chat**: Full-screen chat. Message input pinned to bottom (above tab bar). No sidebar agent list — access via back button to agent list page.

**Edit/Preview/Diff toggle**: On phone, these three modes are a horizontal pill group (segmented control) at the top of the viewer. Large enough to tap.

### iPad / Tablet (640-1023px)

**Navigation**: Sidebar available as a slide-over sheet (swipe from left edge, or tap hamburger icon). When open, it overlays the content with a dim backdrop. Not persistent — closes on navigation.

**Landing page**: 2-column card grid. Fleet status bar at top. Same layout as desktop but narrower.

**File browser**: Choice of layouts depending on orientation:
- **Portrait**: Full-width. Tree as a collapsible drawer (bottom sheet or left sheet). Viewer takes full width. Toggle tree on/off with a button.
- **Landscape**: Side-by-side tree + viewer (narrow tree, ~30% width). Similar to desktop but compressed.

**Agent chat**: Full-width chat with sidebar agent list as a slide-over sheet.

### Desktop (≥1024px)

Full sidebar (collapsible to icons) + content. File browser: tree (resizable, ~250px default) + viewer side by side. Agent chat: chat + agent list sidebar. As described in earlier sections.

### Responsive design principles

1. **Same data, different layout.** The deep linking system means the same URL works on every device. `/workspaces/substrate/browser?file=utils.ts&mode=edit` opens the file on phone, tablet, or desktop. Only the layout changes.

2. **Touch targets.** All interactive elements ≥44px on phone. File tree rows, buttons, tabs — all fat enough to tap.

3. **No hover-only interactions.** Everything accessible via touch must also be accessible via tap. Tooltips are nice-to-have, not essential.

4. **Bottom-anchored actions on phone.** Save button, mode toggles, primary actions — all at the bottom of the screen, within thumb reach. No reaching to the top.

5. **Tailwind responsive classes.** Use `sm:`, `md:`, `lg:` prefixes consistently. The existing codebase already uses this pattern.

6. **Test at every breakpoint.** Every new page must look good at 375px (iPhone SE), 768px (iPad portrait), 1024px (iPad landscape), and 1440px (laptop).

### Existing responsive infrastructure

The codebase already has:
- `NavigationWrapper` → switches between `DashboardShell` (desktop) and `BottomTabBar` (phone)
- `useResponsive()` hook → `useMobilePatterns` boolean
- `useIsMobile()` hook from shadcn sidebar
- `Sheet` component (radix) for slide-over panels
- All shadcn components are responsive-ready

We extend this, not replace it.

---

## 10. The "Dev" Section — Migrating Existing Pages

Current nav items that are internal/demo get moved:

| Current | New Location | Notes |
|---------|-------------|-------|
| Home (/) | → Landing page (workspace selector) | Replaces dashboard placeholder |
| Workflows (/workflows) | Sidebar → Workflows | Workspace-scoped |
| Workflow Visualization | Sidebar → Dev → Workflow Viz | Demo/internal |
| Kanban Board | Sidebar → Dev → Kanban | Demo/internal |
| Agents (/agents) | Sidebar → Agents | Workspace-scoped |
| FileViewer Demo | Sidebar → Dev → Demos | Internal |
| MarkdownViewer Demo | Sidebar → Dev → Demos | Internal |
| DiffViewer Demo | Sidebar → Dev → Demos | Internal |
| Responsive Demo | Sidebar → Dev → Demos | Internal |

The "Dev" section is collapsed by default. It's a collapsible group in the sidebar. Internal tools, demos, experiments. Not part of the product experience.

---

## 11. Open Questions

### Q1: Should the landing page show a global "fleet status" summary?

**RESOLVED: Yes.** A compact fleet status bar above the workspace cards.

See **Section 14: Fleet Status Bar** below for full design.

### Q2: Should we support workspace "favorites" or pinning?

**RESOLVED: Yes, simple star/unstar.** A small star toggle on each workspace card. Starred workspaces pin to the top of the grid. Within starred and unstarred groups, order by most-recently-used. No drag-to-reorder — just star/unstar.

### Q3: Should the file browser tree persist its expand/collapse state in the URL?

**RESOLVED: No.** Tree expand/collapse is ephemeral client state (React state). Only the selected file and mode go in the URL. When you bookmark and return, the tree auto-expands to the selected file's parent automatically.

### Q4: What happens when you navigate to `/workspaces/slug` and that workspace no longer exists?

**RESOLVED:** 404 page with a friendly message and a link back to `/`. "This workspace was removed. Go to All Workspaces."

### Q5: Should each workspace card on the landing page be a different accent color?

**RESOLVED: Yes — user picks both emoji AND accent color.** A random emoji + random color are auto-assigned on workspace creation so it's zero-effort. The user can customize both later on the manage page. The accent color shows as a subtle left-border or top-border on the workspace card and a thin bar in the sidebar header. This gives two channels of glanceable identity: shape (emoji) + color (accent).

Curated color palette (~10 distinct colors that work in both light and dark mode):
```typescript
const WORKSPACE_COLOR_PALETTE = [
  { name: 'purple', light: '#8B5CF6', dark: '#A78BFA' },
  { name: 'blue',   light: '#3B82F6', dark: '#60A5FA' },
  { name: 'cyan',   light: '#06B6D4', dark: '#22D3EE' },
  { name: 'green',  light: '#10B981', dark: '#34D399' },
  { name: 'yellow', light: '#F59E0B', dark: '#FBBF24' },
  { name: 'orange', light: '#F97316', dark: '#FB923C' },
  { name: 'red',    light: '#EF4444', dark: '#F87171' },
  { name: 'pink',   light: '#EC4899', dark: '#F472B6' },
  { name: 'indigo', light: '#6366F1', dark: '#818CF8' },
  { name: 'teal',   light: '#14B8A6', dark: '#2DD4BF' },
];
```

### Q6: Should the emoji be visible in the favicon?

**RESOLVED: Yes — stretch goal.** Dynamic favicons using canvas → blob URL → `link[rel=icon]`. Nice-to-have, not blocking.

---

## 12. Implementation Priority

For the 041-file-browser plan, implement in this order:

1. **Sidebar restructure** — Move items to Dev section, add workspace header, add "All Workspaces" link. This is foundational for everything else.

2. **Landing page** — Replace dashboard home with workspace card grid. Cards link to workspace pages. No live agent status yet (add later when SSE is wired).

3. **Emoji system** — Add `emoji` field to workspace data model. Random default on creation. Display in sidebar header + page titles. Emoji picker on manage page is later.

4. **Deep linking infrastructure** — Install `nuqs`, wire `NuqsAdapter`, create param definitions (per deep linking workshop).

5. **File browser** — The actual feature. Uses all of the above.

6. **Tab titles** — Dynamic `<title>` with emoji + context. Progressive enhancement.

7. **Pop-out buttons** — `[↗]` affordance on agent list items and file viewer.

8. **Settings page** — `/settings/workspaces` for workspace management + emoji picker.

---

## 14. Fleet Status Bar — Mission Control at a Glance

### The problem

You have 3 workspaces. Across them, 7 agents are running — some standalone, some as part of workflows. Two workflows are active, one has an agent that's stuck (error state). You need to know all this in 0.5 seconds when you open the landing page.

### The data model

The fleet status aggregates from two sources:

1. **AgentManagerService** — `getAgents()` returns all agents across all workspaces, with `status: 'working' | 'stopped' | 'error'` and `workspace` field.
2. **Orchestration system** (future, Plan 033+) — GraphOrchestration handles per workspace, each tracking running workflow graphs with their pods (AgentPods/CodePods).

For now (pre-033), we have agents only. Post-033, we add workflow awareness.

### Phase 1 design (agents only — this plan)

A single bar above the workspace cards. Three states:

**All idle:**
```
┌─────────────────────────────────────────────────────────────┐
│          Your Workspaces                                    │
│                                                             │
│   [workspace cards...]                                      │
```
No bar at all. Clean. Nothing to report.

**Agents running, all healthy:**
```
┌─────────────────────────────────────────────────────────────┐
│  ● 5 agents working                                        │
├─────────────────────────────────────────────────────────────┤
│          Your Workspaces                                    │
```
Green dot. Single number. That's it.

**Attention needed:**
```
┌─────────────────────────────────────────────────────────────┐
│  ● 4 agents working  · ◆ 1 needs attention                 │
├─────────────────────────────────────────────────────────────┤
│          Your Workspaces                                    │
```
Green dot for healthy + amber/red diamond for errors. The "needs attention" is clickable — it scrolls to or highlights the workspace card that has the problem agent.

### Phase 2 design (agents + workflows — post-033)

When workflows exist, the bar expands:

**Active fleet:**
```
┌─────────────────────────────────────────────────────────────┐
│  ● 7 agents  ·  ⚡ 3 workflows  ·  across 2 workspaces     │
├─────────────────────────────────────────────────────────────┤
```

**With attention needed:**
```
┌─────────────────────────────────────────────────────────────┐
│  ● 6 agents  ·  ◆ 1 stuck  ·  ⚡ 3 workflows  ·  2 ws     │
├─────────────────────────────────────────────────────────────┤
```

### Complexity handled simply

The reality is complex:
- Some agents run standalone (user-created from the Agents page)
- Some agents are spawned by workflows (ODS → AgentManagerService → AgentPod)
- A workflow may have 3 nodes, 2 running agents in parallel, 1 code pod
- Multiple workflows can run in the same workspace
- Multiple workspaces can have workflows running simultaneously

But the user doesn't need to see this tree on the landing page. They need:
1. **How many things are working?** (agents count)
2. **How many things need me?** (error/stuck count)
3. **How many workflows are in flight?** (workflow count)
4. **Where?** (workspace count — then they can click into the right one)

That's 4 numbers. The workspace CARDS themselves show per-workspace breakdowns.

### Workspace card with fleet detail

Each workspace card gets a richer status line when things are active:

**Idle workspace:**
```
┌──────────────────────────┐
│  🔮  substrate           │
│  main · 041-file-browser │
│  idle                    │
│  ~/substrate             │
└──────────────────────────┘
```

**Active workspace (agents only, phase 1):**
```
┌──────────────────────────┐
│  🔮  substrate           │
│  main · 041-file-browser │
│  ●● 2 agents working     │
│  ~/substrate             │
└──────────────────────────┘
```

The dots (●●) are small green circles — one per running agent, up to maybe 5, then "●●●●● 7 agents" (capped dots + number). Each dot could be clickable in the future to jump to that agent, but for now they're just visual weight.

**Active workspace with attention needed:**
```
┌──────────────────────────┐
│  🔮  substrate           │
│  main · 041-file-browser │
│  ●● 2 working · ◆ 1 err │
│  ~/substrate             │
└──────────────────────────┘
```

The card itself might get a subtle left-border color: green for healthy, amber for attention needed. This gives instant visual scanning — you see a card with an amber border and know to click in.

**Active workspace (agents + workflows, phase 2):**
```
┌──────────────────────────┐
│  🔮  substrate           │
│  main · 041-file-browser │
│  ●●● 3 agents            │
│  ⚡ deploy-pipeline       │
│  ⚡ test-suite            │
│  ~/substrate             │
└──────────────────────────┘
```

Each workflow gets a named line. This lets you see WHICH workflows are running without clicking in. Workflows are the named, intentional, "big picture" things — they deserve a line. Agents are the grunts — dots are enough.

### Data flow

```
Landing page loads
  → API: GET /api/workspaces?include=worktrees
  → API: GET /api/agents (all agents across all workspaces)
  → Client: aggregate counts per workspace
  → Client: render fleet bar + cards

SSE: subscribe to agent status events
  → On agent status change: update counts in real-time
  → Cards re-render with new dots/numbers

Future (post-033):
  → API: GET /api/orchestrations (all running workflows)
  → Client: aggregate workflow counts per workspace
```

The fleet bar and card status are SSE-driven for live updates. This uses the existing `useWorkspaceSSE` / `useAgentManager` hooks. When an agent goes from working → error, the card updates immediately — the user sees the amber dot appear without refreshing.

### Design principles applied

- **Calm over busy**: The bar is ONE line. The cards show dots, not tables. No graphs. No timelines. Just: how many, any problems.
- **Progressive disclosure**: Landing page shows counts. Click into workspace → see agent list. Click into agent → full chat/detail.
- **Glanceable identity**: The colored border on cards (green/amber) + emoji + dots = you scan 4 cards in under a second.
- **Browser-native**: Cards are `<Link>` elements. Middle-click the card with the amber border to investigate in a new tab while keeping the landing page open.

---

## 15. Attention System — Bubbling Alerts From Agent to Browser Tab

### The problem

You have 3 browser tabs open, each on a different workspace. An agent in tab 2 hits an error. You're looking at tab 1. How do you know something needs you?

Attention signals must **bubble up** through every layer:

```
Agent error/question
  → Worktree has attention needed
    → Workspace card shows amber indicator
      → Landing page fleet bar shows "◆ 1 needs attention"
        → Browser tab title shows ❗ prefix
          → Favicon changes (stretch goal)
```

### What triggers "needs attention"

| Trigger | Severity | Source |
|---------|----------|--------|
| Agent status → `error` | High | AgentManagerService SSE |
| Agent asks a question | High | Agent event stream |
| Workflow node blocked | Medium | Orchestration events (future) |
| Save conflict detected | Low | File browser (future) |

**Not attention triggers** (normal operation):
- Agent working normally
- Agent completed successfully
- File changed on disk

### Layer-by-layer attention display

**1. Agent list row** — the source of truth:

```
┌─────────────────────────────────────────────────────┐
│ code-reviewer        ◆ error     "Index out of..."  │  ← Red dot + error message
│ test-runner          ● working                      │  ← Green dot, all good
│ deploy-agent         ◆ question  "Which env?"       │  ← Amber dot + question text
└─────────────────────────────────────────────────────┘
```

**2. Worktree picker** — dot on affected worktrees:

```
│ ★ main             ◆  │  ← This worktree has an agent needing attention
│ ★ 041-file-browser    │  ← Clean
│   002-agents          │
```

**3. Sidebar workspace header** — aggregated:

```
┌─────────────────────────┐
│ 🔮 substrate  ◆         │  ← Amber diamond = something in this workspace needs you
│ ▾ 041-file-browser      │
├─────────────────────────┤
```

**4. Landing page workspace card** — border + indicator:

```
┌──────────────────────────┐
◆  🔮  substrate           │  ← Amber left-border + diamond
│                          │
│  23 worktrees            │
│  ●● 2 working · ◆ 1 err │  ← Attention count in status line
│  ~/substrate             │
└──────────────────────────┘
```

**5. Fleet status bar** — global:

```
┌─────────────────────────────────────────────────────────────┐
│  ● 6 agents  ·  ◆ 1 needs attention  ·  3 workspaces       │
├─────────────────────────────────────────────────────────────┤
```

The "◆ 1 needs attention" text is clickable — jumps to the first workspace with an attention item.

**6. Browser tab title** — the key for cross-tab awareness:

When a workspace has attention needed, prefix the tab title:

```
Normal:     🔮 substrate — Browser
Attention:  ❗🔮 substrate — Browser
```

The ❗ prefix is visible even when tabs are narrow. It works across ALL tabs for that workspace — if you're on the Browser page but an agent on the Agents page needs attention, you still see ❗.

**7. Favicon** (stretch goal):

Replace the favicon with a red-tinted version or overlay a red dot badge. This makes attention visible even when the tab is pinned (pinned tabs only show favicon, no title text).

### Clearing attention

Attention clears when:
- You navigate to the agent that needs attention (acknowledges it)
- The agent recovers (error → working)
- The question is answered
- The agent is terminated

**No manual "dismiss"** — attention is state-driven, not notification-driven. When the underlying condition resolves, the indicator disappears. This is "calm over busy" — the system self-heals.

### Implementation approach

**SSE-driven**: The existing `useWorkspaceSSE` and agent status events already carry status changes. The attention state is derived, not stored:

```typescript
// Derived attention state — no separate storage needed
function workspaceNeedsAttention(agents: IAgentInstance[]): boolean {
  return agents.some(a => a.status === 'error');
}

function attentionCount(agents: IAgentInstance[]): number {
  return agents.filter(a => a.status === 'error').length;
}
```

**Tab title update**: A small client hook that watches agent state and updates `document.title`:

```typescript
function useAttentionTitle(workspaceEmoji: string, pageName: string, hasAttention: boolean) {
  useEffect(() => {
    const prefix = hasAttention ? '❗' : '';
    document.title = `${prefix}${workspaceEmoji} ${workspaceName} — ${pageName}`;
  }, [hasAttention, workspaceEmoji, pageName]);
}
```

### Design principles applied

- **Calm over busy**: Only genuinely actionable things trigger attention. Normal operation = no indicators. The absence of indicators IS the signal that all is well.
- **Bubbles up, never down**: You see attention at every level — you never have to drill in to discover problems. The landing page tells you immediately.
- **State-driven, not notification-driven**: No toast popups, no notification badges with counts that require manual clearing. The UI reflects reality. When reality changes, the UI changes.
- **Browser-native**: Tab title is the primary cross-tab signal. No need for browser notification permission or service workers.

### Implementation reality

The attention system has two tiers:

**Tier 1 — Implementable now (this plan):**
- Agent-level attention (error/question status) — data exists via `AgentManagerService`
- Workspace-level aggregation on landing page cards — derived from agent list
- Fleet status bar attention count — derived from agent list
- Browser tab title ❗ prefix — derived from agent state
- Sidebar workspace header ◆ indicator — derived from agent state

**Tier 2 — Design only, wire up later:**
- Worktree-level attention indicators in the picker — requires correlating agents to specific worktrees (agent `workspace` field exists but worktree mapping doesn't)
- Workflow-level attention — requires orchestration events (Plan 033+)
- Per-worktree eventing infrastructure — doesn't exist yet

**Approach**: Build all the UI components with optional attention props. Tier 1 gets wired up immediately. Tier 2 renders the same indicators but receives `undefined`/empty data until the eventing system lands. No dead code — just components ready for data that will arrive soon.

---

## 13. Quick Reference — UX Cheatsheet

```
LANDING PAGE
  - No sidebar, full-width, centered grid of workspace cards
  - Fleet status bar above cards: "● 5 agents · ⚡ 3 workflows · across 2 workspaces"
  - Bar hidden when all idle (calm over busy)
  - Click card → enter workspace (same tab)
  - Middle-click → new tab
  - "Add workspace" card at end
  - Live agent dots on each card (SSE-updated)
  - Card left-border: green (healthy) / amber (needs attention)

FLEET STATUS
  - Phase 1 (this plan): agent counts only
  - Phase 2 (post-033): + workflow names and counts
  - Per-card: ●● dots for running agents, ◆ for errors
  - Global bar: aggregated totals across all workspaces
  - SSE-driven: updates in real-time without refresh

INSIDE WORKSPACE
  - Sidebar: emoji+name header, worktree selector, Browser/Agents/Workflows, "← All Workspaces"
  - "Dev" section collapsed at bottom
  - Breadcrumbs: 🔮 substrate / Browser / src/lib/utils.ts

BROWSER TABS
  - One tab = one workspace focus
  - Tab title: "🔮 substrate — context"
  - All links are real <Link> elements → middle-click/right-click works
  - [↗] pop-out button on key items

EMOJI
  - Persisted per workspace (not per tab/session)
  - Curated palette of ~30 distinct emojis
  - Random default, user-selectable later
  - Appears: card, sidebar, tab title, breadcrumbs

DEEP LINKING
  - Every page state is URL-encoded
  - Bookmarkable, pinnable, shareable
  - nuqs for type-safe URL ↔ state sync
  - workspaceHref() for building links

RESPONSIVE
  - Phone (<640px): bottom tab bar, full-screen panels, stacked cards
  - Tablet (640-1023px): sidebar as sheet overlay, 2-col cards
  - Desktop (≥1024px): persistent sidebar, side-by-side panels
  - Same URL works on every device — only layout changes
  - Touch targets ≥44px, no hover-only interactions
  - Bottom-anchored actions on phone (thumb reach)

ATTENTION SYSTEM
  - Bubbles up: agent → worktree → workspace → landing page → browser tab title
  - Triggers: agent error, agent question, workflow blocked
  - Visual: ◆ amber diamond at every level, ❗ prefix in tab title
  - State-driven: no manual dismiss, clears when condition resolves
  - SSE-driven: derived from agent status, no separate storage
  - Calm: absence of indicators = all is well
```
