# Workshop: Recent Changes Feed — UI & Reason for Existing

**Type**: UX / UI Design
**Plan**: 084-random-enhancements-3
**Spec**: _to-be-created_ (`recent-changes-feed-spec.md`)
**Research**: [recent-changes-feed-research.md](../recent-changes-feed-research.md)
**Created**: 2026-05-03
**Status**: Draft

**Related Documents**:
- [Research dossier](../recent-changes-feed-research.md)
- Existing preview-cards: `apps/web/src/features/041-file-browser/components/preview-cards/`
- `CardActions` (Plan 077 — folder-content preview): `card-actions.tsx`

**Domain Context**:
- **Primary Domain**: `file-browser` (hosts the new view)
- **Related Domains**: `_platform/viewer` (renders previews), `_platform/events` (live updates via existing `file-changes` SSE channel — **no new channel**), `_platform/themes` (file icons)

---

## Purpose

This workshop locks in the **why** and the **how it looks** for the Recent Changes Feed before architecture. The feature is, at face value, "a list of recently changed files." But framing it that way undersells the actual flow that motivates it — and the motivating flow drives nearly every UI decision (what's on each card, what buttons exist, what the empty state says, what gets pinned to the top).

This document is a working reference for the developer building it. ASCII mocks, real action lists, real path strings.

---

## Key Questions Addressed

1. **Why does this view exist?** What user problem is it solving that the existing tree + working-changes list does not?
2. **What does each card look like, per content type?** (image, video, audio, markdown, code, generic)
3. **What actions are on each card?** Specifically: download, copy abs path, copy rel path, and what else.
4. **How does title + path display work** without consuming so much vertical space the feed loses its punch?
5. **What does the feed header / chrome look like?** Filters? Count? Refresh? Pause?
6. **What animations / promotion behavior** when new files arrive?
7. **What's the empty state and the loading state?**
8. **Keyboard + accessibility?**

---

## 1. The Reason It Exists (the "Why")

### The motivating flow

> Sometimes I have flows like `~/github/higgs-jordo` where I generate images and videos and I just wanna review 'em.

This is the load-bearing use case. Reframe it concretely:

```
$ cd ~/github/higgs-jordo
$ python generate.py --batch 12 --style "noir watercolor"
  [generation runs for 4 minutes]
  output/img-001.png
  output/img-002.png
  ...
  output/img-012.png
  output/video-clip-final.mp4

$ # Now what? Open the file tree, click each one to review?
$ # 12 click-back-click-back round trips? Painful.
```

The existing surface area for "what just changed":

| Surface | What it shows | Limitation for this flow |
|---|---|---|
| **File tree** | Hierarchy of all files | No previews; user has to click each file individually |
| **`?panel=changes` left panel (`changes-view.tsx`)** | Git working-tree changes (M/A/D/?/R) + recent committed file names | Text-only list; user still has to click each one to see the actual image/video |
| **Folder preview panel** (`?dir=output`) | Gallery grid of one folder | Folder-scoped only; misses cross-folder generation runs (`output/`, `cache/`, `notes/`) |
| **GitHub PR view, etc.** | Code diffs | Useless for binary media |

None of those let you **scroll a wall of "stuff I just made" with the media playing inline**. That's the gap.

### Three real-world flows this serves

1. **Generative review** (the higgs-jordo case): batch-generate images/videos, scroll the feed, mentally cull the keepers, copy paths of the keepers into a prompt or script.
2. **Screenshot triage**: taking a bunch of screenshots while debugging, want to see them stacked in time order, copy paths into bug reports.
3. **General "what's changed lately"**: you came back to a repo after a few days, want a high-bandwidth glance at *what's been happening* — not just file names.

### Why it's not just "git status with thumbnails"

Git status only sees tracked files in working state. The feed must show:
- Untracked new outputs (gitignored or just not added yet — the common case for `output/` directories).
- Files that have changed since some recent point in time, regardless of git index state.
- All under one watcher pipeline (the existing file-watcher/SSE), not by polling git.

It uses `git log` to **seed initial ordering** (newest committed first), but the live channel is the file watcher — same one the file tree uses for its dot indicators.

### Anti-goals (what this is explicitly NOT)

- **Not a git history viewer.** No diffs, no commit hashes, no author attribution.
- **Not a notification center.** It's a passive view, not a push surface. No badges, no unread counts (in v1).
- **Not folder-scoped.** It's repo-wide. Folder-scoped media review already exists (`FolderPreviewPanel`).
- **Not a multi-select / bulk-action surface** in v1. One file, one card, one set of buttons. Bulk multi-select is a v2 conversation.

---

## 2. Card Anatomy (the unit of the feed)

Each row in the feed is one **card**. Card height varies by content type. Here is the canonical anatomy:

```
┌──────────────────────────────────────────────────────────────────────┐
│ ┌──┐ filename.png                                  [⏵ ▤ ⎘ ⤓ … ]    │ ← header strip (40px)
│ │🖼│ output/generated/filename.png                                  │   icon · title · path
│ └──┘ 4 minutes ago · 2.3 MB · added                                  │   meta line (timestamp · size · event)
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│                       [ TYPE-SPECIFIC PREVIEW ]                       │ ← preview area
│                                                                       │   variable height
│                                                                       │   max-h-[60vh]
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### Header strip layout

```
┌──┐ ┌─────────────────────────────────────┐                   ┌──┐┌──┐┌──┐┌──┐┌──┐
│🖼│ │ filename.png                        │                   │⏵ ││▤ ││⎘ ││⤓ ││⋯│
└──┘ │ output/generated/filename.png       │                   └──┘└──┘└──┘└──┘└──┘
     └─────────────────────────────────────┘
     ↑                                     ↑                   ↑
  40px icon col                  flex-1 truncate              actions (right-aligned)
                                title bold + path muted
                                stacked vertically
```

- **Icon** (40×40 col): `<FileIcon name={path} />` from `_platform/themes` (consistent with file tree).
- **Title**: filename only, semibold, single-line truncate. Click → opens file in `FileViewerPanel`.
- **Path**: workspace-relative path, muted (`text-muted-foreground text-xs`), single-line truncate. Hover → tooltip with full absolute path.
- **Meta line**: relative timestamp ("4 minutes ago"), file size, event type badge (`added` / `changed` / `deleted-stale`).
- **Actions**: see § 3.

### Preview area sizing

| Type | Default height | Max height | Notes |
|---|---|---|---|
| Image | `min(actualHeight, 60vh)` | `60vh` | `object-contain`, no crop. Aspect honored. |
| Video | `min(actualHeight, 60vh)` | `60vh` | Native `<video controls>` — *not* autoplay-loop in feed (see § 6). |
| Audio | `~80px` (waveform optional) | `120px` | Native `<audio controls>` + filename label. |
| Markdown | `~280px` (excerpt) | `320px` | First paragraph or first 8 non-empty lines, fade-out gradient at bottom hinting "more." |
| Code | `~240px` (≤ 12 lines visible) | `280px` | Shiki-rendered, monospace, line numbers, fade-out at bottom. |
| Binary / unknown | `~80px` (icon + meta) | `120px` | Icon + size + "Binary file — preview not available." |
| Deleted | `~60px` | `60px` | Strikethrough title, "deleted N seconds ago", undo affordance if available. |

### Variants in mock form

#### Image card (the primary case for the higgs-jordo flow)

```
┌────────────────────────────────────────────────────────────────────────┐
│ ┌──┐ noir-watercolor-007.png                            [▤ ⎘ ⤓ ⋯]    │
│ │🖼│ output/2026-05-03/noir-watercolor-007.png                         │
│ └──┘ 12 seconds ago · 3.1 MB · added                                   │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│                                                                        │
│                  [   actual image rendered here   ]                    │
│                  [   max height 60vh, contained   ]                    │
│                                                                        │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

#### Video card

```
┌────────────────────────────────────────────────────────────────────────┐
│ ┌──┐ render-final.mp4                                   [▤ ⎘ ⤓ ⋯]    │
│ │🎬│ output/render-final.mp4                                           │
│ └──┘ 1 minute ago · 18.4 MB · changed                                  │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│            [    video element with native controls    ]                │
│            [    poster frame shown until played       ]                │
│            [    preload="metadata" until visible      ]                │
│                                                                        │
│                                       ▶ ━━━━━━━━━●━━ 0:42 / 1:18 🔊  │
└────────────────────────────────────────────────────────────────────────┘
```

#### Markdown excerpt card

```
┌────────────────────────────────────────────────────────────────────────┐
│ ┌──┐ design-notes.md                                    [⎘ ⋯]         │
│ │📝│ docs/plans/084-random-enhancements-3/design-notes.md              │
│ └──┘ 3 minutes ago · 4.1 KB · changed                                  │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  # Design Notes                                                        │
│                                                                        │
│  We're building a recent-changes feed. The interesting question        │
│  is what to put on each card. Three options were on the table:         │
│                                                                        │
│  - Just a thumbnail and a filename                                     │
│  - Full preview with action buttons                                    │
│  - Compact list with click-to-expand                                   │
│            [ ↓ fade-out gradient ↓ ]                                   │
└────────────────────────────────────────────────────────────────────────┘
```

#### Code excerpt card

```
┌────────────────────────────────────────────────────────────────────────┐
│ ┌──┐ recent-feed.tsx                                    [⎘ ⋯]         │
│ │📄│ apps/web/src/features/041-file-browser/components/recent-feed/…   │
│ └──┘ 8 seconds ago · 6.8 KB · added                                    │
├────────────────────────────────────────────────────────────────────────┤
│   1│ 'use client';                                                     │
│   2│                                                                   │
│   3│ import { useFileChanges } from '@/features/045-live-file-events'; │
│   4│ import { ImageCard } from '../preview-cards/image-card';          │
│   5│                                                                   │
│   6│ export function RecentFeedView({ worktreePath }: Props) {         │
│   7│   const [items, setItems] = useState<FeedItem[]>([]);             │
│   8│                                                                   │
│   9│   useFileChanges('**', (changes) => {                             │
│  10│     setItems((prev) => mergeChanges(prev, changes));              │
│  11│   });                                                             │
│  12│   …                                                               │
│            [ ↓ fade-out gradient ↓ ]                                   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Action Buttons — the Headline Feature

Per the user's request: each card has **download, copy full path, copy relative path** at minimum. Workshopping the full set:

### The action menu

Two layers:
- **Inline pinned actions** (always visible in the header strip on hover, always visible on mobile/touch): the most-used 3-4 actions for that file type.
- **Overflow menu** (`⋯` button): the long tail.

### Action catalog

| Icon | Label | Behavior | Inline for | In overflow for |
|---|---|---|---|---|
| `▤` (eye/open) | **Open** | Opens file in `FileViewerPanel` (sets `?file={path}&mode=source`, clears `?view=`) | image, video, markdown, code | audio, generic |
| `⎘` (copy) | **Copy relative path** | Copies workspace-relative path (`output/img-001.png`) | all types | — |
| `⎘ᵃ` (copy abs) | **Copy absolute path** | Copies full system path (`/Users/.../output/img-001.png`) | image, video | all (overflow) |
| `⤓` (download) | **Download** | Triggers raw-file API with `?download=true`; browser saves with original filename | image, video, audio, generic (binary) | — |
| `📋` | **Copy filename** | Copies just `img-001.png` | — | all |
| `🔗` | **Copy as Markdown link** | `![img-001](output/img-001.png)` for images, `[file](path)` for others | — | image, video, markdown |
| `📂` | **Reveal in tree** | Sets `?dir={parent-path}&file={path}`, leaves feed open in main panel via secondary URL state | — | all |
| `📑` | **Copy file contents** | For markdown/code: copies the entire file text (not just the excerpt) | — | markdown, code |
| `🗑` | **Dismiss from feed** | Hides this card without deleting the file (in-memory hide for this session) | — | all |

### Why "copy relative" vs "copy absolute" both matter

Concrete pasting contexts the user actually has:

| Pasting into | Wants | Why |
|---|---|---|
| Claude/ChatGPT prompt | Absolute path | The agent needs to read the actual file from disk |
| README / docs / Discord | Relative path | Portable — works for anyone with the repo |
| Shell command (`cat`, `open`) | Absolute or `./relative` from cwd | Depends on cwd context |
| Markdown image link (`![]()`) | Relative path | GitHub renders relative paths inside the repo |
| Spreadsheet / note | Filename only | Just a label |

**Conclusion**: copy-rel is the default (`⎘`), copy-abs is one extra click. Both are inline-pinned for image/video cards because the higgs-jordo flow likely paste-into-prompts (abs) or paste-into-Discord (rel).

### Action button sizing & spacing

- Inline buttons: `h-7 w-7` (28×28px), gap-1 between them, right-aligned in header strip.
- Tooltip on hover (Radix `<Tooltip>`): "Copy relative path" / "Copy absolute path" / "Open in viewer" / "Download".
- Toast on success (existing `_platform/events.toast()`): `Copied path` (with a subtle check-mark animation, like existing `CardActions`).
- Overflow menu: Radix `<DropdownMenu>` with the long-tail items.

### Action keybindings (when card is focused)

| Key | Action |
|---|---|
| `Enter` | Open in viewer |
| `c` | Copy relative path |
| `Shift+C` | Copy absolute path |
| `d` | Download |
| `r` | Reveal in tree |
| `m` | Copy as markdown link |
| `Esc` | Move focus to feed root |

### Extending the existing `CardActions`

`apps/web/src/features/041-file-browser/components/preview-cards/card-actions.tsx` (Plan 077) already has:
- ✅ Single "copy path" button (currently relative — confirm in implementation)
- ✅ Download button
- ✅ Hover-revealed glassmorphism style
- ✅ Mobile always-visible variant

**Gap to close**:
- Add absolute-path-copy variant (different callback, different tooltip).
- Add overflow `⋯` menu with the long-tail actions.
- Add eye/open button as the primary action (currently absent; the gallery-grid use case opens on whole-card click, but the feed wants an explicit button so the rest of the card can host hover-to-pause-video etc.).

**Decision**: extend `CardActions` in-place (not fork). It's already shared between gallery and feed. New props are additive: `onCopyAbsolutePath?`, `onOpen?`, `overflowMenu?: ReactNode`. This keeps Plan 077's gallery card unchanged behavior unless it opts in.

---

## 4. Title + Path Display

### The constraint

Filenames in real workspaces are long. Paths are longer. The feed is high-density. Most cards' titles will need truncation.

### Layout decision: title bold + path muted, stacked

```
filename-with-some-long-name-007.png         ← line 1: bold, truncate, no extension styling
output/2026-05-03/generated/noir-watercolor/  ← line 2: muted, truncate from the LEFT
```

**Why truncate path from the left, not the right**: when paths are long, the *trailing* segments (closer to filename) are the discriminators. `output/.../noir-watercolor/` tells you nothing; `…/2026-05-03/generated/noir-watercolor/` tells you a lot. Use CSS `direction: rtl; text-align: left; unicode-bidi: plaintext;` on the path span (or wrap with an explicit ellipsis-prefix when overflowing).

### Hover → full path tooltip

On hover of the path text, show a Radix `<Tooltip>` with the **full absolute path**. This gives users a way to *see* the abs path without copying it.

### Click on title vs click on card

| Click target | Behavior |
|---|---|
| Title text | Open file in viewer (same as `▤`) |
| Path text | Show tooltip; do NOT navigate (avoids accidental clicks) |
| Preview area (image/video/code/markdown body) | Open file in viewer |
| Action buttons | Their own action |
| Outside any of the above (header strip whitespace) | No-op |

---

## 5. Feed Chrome (header bar, filters, footer)

```
┌────────────────────────────────────────────────────────────────────────┐
│  Recent Changes                                       [⏸] [↻] [⚙]    │ ← feed header
│  47 changes in the last hour · live                                    │
│                                                                        │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                       │ ← type filter chips
│  │ All  │ │ 🖼 12 │ │ 🎬 3 │ │ 📝 8 │ │ 📄 24│                       │   click to toggle
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                       │   active = primary fill
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  [card 1 — newest]                                               │ │ ← virtualized list
│  └──────────────────────────────────────────────────────────────────┘ │   prepend on new event
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  [card 2]                                                        │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│   …                                                                   │
└────────────────────────────────────────────────────────────────────────┘
```

### Header bar elements

- **Title**: "Recent Changes" (h2, large, bold).
- **Live indicator**: small pulsing dot + "live" text. Greys out and changes to "paused" if user pauses the feed.
- **Counter**: "N changes in the last hour" — soft truth, doesn't have to be perfect; clears when user clears the feed.
- **`⏸` Pause/Resume button**: temporarily stops promoting new entries to the top (still receives them in a "1 new change — click to load" pill). Useful when reviewing a moving target.
- **`↻` Refresh button**: re-runs `getRecentFiles()` seed (replaces feed contents). Confirmation if filters are active.
- **`⚙` Settings**: feed settings — feed size limit, default filters, excerpt sizing, autoplay video on/off.

### Filter chips

- **All** (default) — every type.
- **🖼 Images** — `image/*`.
- **🎬 Videos** — `video/*`.
- **🎵 Audio** — `audio/*`.
- **📝 Markdown** — `.md`, `.mdx`.
- **📄 Code** — anything with a Shiki-supported language extension.
- **Other** — everything else (binaries, archives, configs).

Counts in chips reflect items currently in the feed (not the whole repo). Multi-select supported (cmd-click to toggle).

### Newest-arrival pill (when paused)

```
                  ┌──────────────────────────────────┐
                  │  ↑ 3 new changes — click to show │
                  └──────────────────────────────────┘
```

Sticky at the top of the scroll area. Click → unpauses, prepends the buffered items, scrolls to top.

### Footer / scroll-end

- "Showing 50 of 50 most recent. [Load more]" — clicking calls `getRecentFiles(worktreePath, currentLimit + 50)`.
- Hard ceiling at 200 items in v1 (avoid runaway memory).

---

## 6. Animations & Promotion Behavior

### When a new event arrives

1. SSE `file-changes` event lands → batch coalesced (300ms server-side, 100ms client).
2. For each path in the batch:
   - If path already exists in feed: **animate to the top** (translate-y over 250ms ease-out, brief background flash).
   - If path is new: **insert at top** with slide-down + fade-in (200ms ease-out).
   - If event is `unlink`: replace with deleted-state mini card (stays for 5s, then auto-removes from feed unless user pinned it).

### Reduced-motion

`prefers-reduced-motion: reduce` → disable slide/translate, just instant swap with brief opacity flash (100ms).

### Video autoplay decision

**Decision: NOT autoplay-muted-loop in the feed.** The folder gallery (Plan 077) uses autoplay-loop because it shows ≤12 items at once in a gallery grid. The feed could have 50+ video cards stacked. Autoplay across that many videos would:
- Spike memory (each video buffers).
- Burn battery on laptops.
- Confuse "what am I looking at" — multiple videos competing for attention.

Instead: **poster frame + click-to-play with native controls**. The poster frame is the first video frame (browser default). Quiet by default, audible only on user-initiated play. This matches the YouTube/Twitter feed pattern users expect.

### Image lazy-load

Same `useLazyLoad` IntersectionObserver hook the existing image-card uses. Only fetch image bytes when the card scrolls into viewport. Outside viewport: blurred placeholder or solid background with file icon.

---

## 7. States: Empty, Loading, Error

### Empty state (no changes yet, no git history)

```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│                                                                        │
│                            ┌─ ─ ─ ─ ─ ─ ┐                              │
│                            │     📭     │                              │
│                            └─ ─ ─ ─ ─ ─ ┘                              │
│                                                                        │
│                       Nothing changed recently                         │
│                                                                        │
│             When you edit, generate, or save a file, it'll             │
│                       show up here automatically.                      │
│                                                                        │
│                  Watching: /Users/.../higgs-jordo                      │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Loading state (initial seed in flight)

Skeleton rows of `card-skeleton.tsx` (existing component). 5 skeletons. Pulse animation. No spinner.

### Error state (seed failed)

```
┌────────────────────────────────────────────────────────────────────────┐
│  ⚠ Couldn't load recent changes                                        │
│                                                                        │
│  Reason: git log failed: not a git repository                          │
│                                                                        │
│  The feed will still show files as they change live.                   │
│                                                                        │
│                              [ Retry ]                                 │
└────────────────────────────────────────────────────────────────────────┘
```

The feed should stay functional even when the seed fails — it just starts empty and fills up as files change.

### Disconnected state (SSE dropped)

Banner at top of feed:
```
┌────────────────────────────────────────────────────────────────────────┐
│  ⚡ Live updates disconnected — reconnecting in 3s …      [Retry now]  │
└────────────────────────────────────────────────────────────────────────┘
```

Auto-recovers via existing SSE reconnect logic. Don't blow away the existing items on reconnect.

---

## 8. Keyboard Navigation & Accessibility

### Focus model

- The feed is a `<ul role="feed">` (the ARIA `feed` role exists for exactly this pattern — paginated stream of articles).
- Each card is `<li role="article" aria-labelledby="card-{id}-title" tabindex="-1">` so it's reachable via roving tab focus (`useRovingFocus` pattern).
- `Tab` / `Shift+Tab` moves between feed and other page chrome. `Tab` *into* the feed lands on the first card. Arrow-down/arrow-up moves between cards within the feed. `Tab` *out* of the feed continues to the next page region.

### Card-level shortcuts

(See § 3 keybindings table.)

### Screen reader semantics

- `aria-busy="true"` on the feed during initial seed load.
- New items announced via polite live region: "New change: filename.png in output/".
- Action buttons have `aria-label` (icons alone are not enough).
- Path text has `aria-label="Workspace-relative path: output/img-001.png"`.
- Time labels use `<time datetime="ISO">` so screen readers and machines both read them right.

### Color contrast

- Title: foreground (passes WCAG AA against card bg in both themes).
- Path: muted-foreground (must pass AA on its own — verify the existing token does; if not, use `text-foreground/70` instead).
- Live indicator dot: ensure it's visible to colorblind users — use shape (pulsing) + color, never color alone.

---

## 9. Settings (the `⚙` menu)

```
┌─ Recent Changes Settings ───────────────────────┐
│                                                  │
│  Feed size                  [ 50 ▾ ]            │
│    20  50  100  200                              │
│                                                  │
│  Default filters                                 │
│    [✓] Images       [✓] Videos                  │
│    [✓] Markdown     [✓] Code                    │
│    [✓] Audio        [ ] Other                    │
│                                                  │
│  Markdown excerpt                                │
│    Lines:  [ 8 ▾ ]    Chars:  [ 600 ▾ ]        │
│                                                  │
│  Code excerpt                                    │
│    Lines:  [ 12 ▾ ]                              │
│                                                  │
│  Autoplay videos          [ Off ▾ ]             │
│    Off (recommended) · On hover · On            │
│                                                  │
│  Show deleted files       [ 5s ▾ ]              │
│    Never · 5s · 30s · Until dismissed           │
│                                                  │
└──────────────────────────────────────────────────┘
```

Settings persist via `_platform/sdk` (`ISDKSettings` / `useSDKSetting`) under the `fileBrowser.recentFeed.*` namespace, matching the icon-theme settings precedent (Plan 073).

---

## 10. Composition & File Layout (implementation reference)

```
apps/web/src/features/041-file-browser/components/recent-feed/
├── recent-feed-view.tsx            # Orchestrator: header + filters + virtualized list
├── recent-feed-header.tsx          # Title, counter, pause/refresh/settings buttons
├── recent-feed-filters.tsx         # Type-chip row
├── recent-feed-list.tsx            # Virtualized vertical stack
├── feed-card.tsx                   # Card shell — header strip + actions, dispatches preview by type
├── card-actions-menu.tsx           # Extended action set (inline + overflow) — wraps existing CardActions
├── previews/
│   ├── image-preview.tsx           # Wraps preview-cards/image-card.tsx with feed-sized layout
│   ├── video-preview.tsx           # Native controls, no autoplay
│   ├── audio-preview.tsx
│   ├── markdown-excerpt.tsx        # Reads excerpt via server action, renders via MarkdownServer
│   ├── code-excerpt.tsx            # Reads excerpt via server action, renders via highlightCode
│   ├── binary-preview.tsx          # Icon + size + "Binary file"
│   └── deleted-preview.tsx         # Strikethrough mini card
├── hooks/
│   ├── use-recent-feed-state.ts    # Seed + live merge + filter state
│   ├── use-feed-actions.ts         # Copy abs/rel/markdown-link/filename, download, open
│   └── use-feed-keyboard.ts        # Roving focus + per-card shortcuts
├── feed-empty-state.tsx
├── feed-error-state.tsx
└── feed-skeleton.tsx               # Reuses card-skeleton.tsx
```

Settings page entry: `apps/web/src/features/_platform/settings/sections/recent-feed-settings.tsx`.

URL param: extend `apps/web/src/features/041-file-browser/params/file-browser.params.ts` with:
```ts
view: parseAsStringEnum(['recent-feed']).withDefault(null),
feedFilter: parseAsArrayOf(parseAsString).withDefault(null), // optional URL-driven filter
```

Main-panel branch in `BrowserClientInner` (canonical decision tree):
```ts
if (view === 'recent-feed') return <RecentFeedView worktreePath={worktreePath} />;
if (selectedFile)            return <FileViewerPanel ... />;
if (currentDir)              return <FolderPreviewPanel ... />;
return <ContentEmptyState />;
```

---

## 11. Open Questions

### Q1: Should "deleted" files appear at all in the feed?

**OPEN**: Options
- **A**: Yes, briefly (5s, with strikethrough mini card), then auto-vanish — unless user pins. Adds value for "wait, what just happened?" moments.
- **B**: No — they only confuse the review flow; just remove the card silently.
- **C**: Configurable via settings (default 5s).

**Recommendation**: **C** with default = 5s. Settings control already exists in § 9 mock.

### Q2: Pinning?

**OPEN**: Should users be able to pin a card so it stays in the feed even when it'd otherwise scroll off the bottom (or be dismissed)? Useful for the higgs-jordo flow: "keep this one image visible while I generate more."

**Recommendation**: **defer to v2.** v1 ships without pinning; revisit if the higgs-jordo flow shows users wishing for it.

### Q3: Should the feed sync across browser tabs?

**OPEN**: If the user has the workspace open in two tabs, do they share a feed (state sync via `_platform/state`) or each have their own?

**Recommendation**: **each tab independent**. Feed state is a per-tab UX concern — pause/filter/scroll position differ per tab. SSE delivers the same events to both tabs naturally.

### Q4: Bulk actions (multi-select)?

**RESOLVED — out of scope for v1.** Anti-goal stated in § 1. Revisit if real demand surfaces.

### Q5: Does the feed remember where the user was when they navigate away and come back?

**OPEN**: Two flavors:
- **A**: Scroll position only (URL state).
- **B**: Scroll position + a "last seen" marker that subtly highlights cards added since last visit (like Slack's unread line).

**Recommendation**: **A for v1**, **B is a strong v2 candidate** — it would directly improve the higgs-jordo "I left to make coffee, what's new" flow.

### Q6: Should we show something for `addDir` / `unlinkDir` events?

**OPEN**: A new directory typically isn't useful as a feed entry (no media to preview). But "directory deleted" might matter ("oh, I just nuked something").

**Recommendation**: **filter `addDir`/`unlinkDir` out of the feed by default**. They're noise. Workspace-level events (worktree added/removed) are already handled elsewhere.

### Q7: How is the feed entered?

**OPEN — needs spec-clarification answer**:
- Top-bar button in `ExplorerPanel` ("Recent")?
- USDK command (`fileBrowser.openRecentFeed`) — keybinding?
- Panel-mode toggle dropdown?
- All of the above?

**Recommendation**: **all of the above**, prioritized:
1. **ExplorerPanel button** (top bar, always visible) — primary entry for mouse users.
2. **USDK command + default keybinding** (suggest `Cmd+Shift+R` — but verify no conflict) — primary for keyboard users.
3. **Settings toggle for "open feed on workspace launch"** — for users who want it as their default landing view.

---

## 12. Quick Reference — Card-Type → Inline Actions

| Type | Inline 1 | Inline 2 | Inline 3 | Inline 4 | Overflow |
|---|---|---|---|---|---|
| Image | Open `▤` | Copy rel `⎘` | Copy abs `⎘ᵃ` | Download `⤓` | filename, MD link, reveal, dismiss |
| Video | Open `▤` | Copy rel `⎘` | Copy abs `⎘ᵃ` | Download `⤓` | filename, MD link, reveal, dismiss |
| Audio | Copy rel `⎘` | Download `⤓` | — | — | open, copy abs, filename, reveal, dismiss |
| Markdown | Open `▤` | Copy rel `⎘` | — | — | copy abs, copy file contents, filename, reveal, dismiss |
| Code | Open `▤` | Copy rel `⎘` | — | — | copy abs, copy file contents, filename, reveal, dismiss |
| Generic / binary | Copy rel `⎘` | Download `⤓` | — | — | open, copy abs, filename, reveal, dismiss |
| Deleted | Reveal `📂` (parent dir) | — | — | — | undo (if available), dismiss |

---

## 13. Implementation Order Suggestion

When this becomes phases, a natural slice order:

1. **Card shell + header strip + extended `CardActions`** (new copy-abs, open, overflow menu). Standalone; can be tested with dummy data.
2. **Image card variant + Video card variant** — covers the headline higgs-jordo flow.
3. **Feed view skeleton** — header bar, virtualized list, empty/loading/error states; wire to `getRecentFiles` seed only (no live yet).
4. **Live merge** — subscribe to existing `file-changes` SSE via `useFileChanges('**')`, merge into feed state with promotion animation.
5. **Markdown excerpt + Code excerpt** — server-side truncation utility + cards. (Lower priority for the higgs-jordo flow; higher for the "what's been happening" flow.)
6. **Filters + settings + polish** — type chips, settings page, keyboard shortcuts, accessibility pass.
7. **Entrypoints** — ExplorerPanel button, USDK command, default keybinding.

This ordering means the user sees the headline value (image/video review) by phase 4 — before code/markdown excerpts and filter chrome land.

---

**Workshop Status**: Draft — awaiting review.

When approved, the spec and architect should treat the **action button set in § 3**, the **card anatomy in § 2**, and the **anti-goals in § 1** as binding decisions.
