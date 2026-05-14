# Research Report: Recent Changes Feed (Main-Panel Media Stack)

**Generated**: 2026-05-03
**Research Query**: "New main-panel view that takes over (like clicking a folder), showing the last X changed files repo-wide as a vertical stack of type-specific previews — images render, videos play inline, markdown shows excerpt, code shows excerpt. Newest goes to the top when something changes. Repo-wide, not folder-scoped. Git can seed initial ordering, but live updates come from the file-change system."
**Mode**: Pre-Plan (will feed `/plan-1b-specify`)
**Plan Folder**: `docs/plans/084-random-enhancements-3/` (multi-feature bundle — coexists with `auth-bootstrap-code`, `flowspace-mcp-search`, `live-monitoring-rescan`)
**FlowSpace**: Available (used by subagents)
**Total Findings**: 38 (10 BR + 10 FC + 10 PV + 10 PL — slight overlaps merged)

---

## Executive Summary

### What This Feature Is

A new **main-panel view** in the file browser that shows a vertical, scrolling **feed of recently changed files repo-wide**. Each entry renders a type-specific preview (image inline, video plays inline with autoplay-muted-loop, markdown excerpt, code excerpt). Newest changes promote to the top live. The tree/sidebar stays put — only the main panel content swaps, the same way clicking a folder swaps to `FolderPreviewPanel` today.

### What's Already Built (≈90% of the primitives exist)

- **Panel-mode dispatch**: `PanelMode = 'tree' | 'changes' | 'sessions'` union with URL-driven `?panel=` (extend with a new mode).
- **Main-panel content swap**: Server-component page hands `dir`/`file` params to `BrowserClientInner`, which already conditionally renders `FileViewerPanel` vs `FolderPreviewPanel` vs empty state — adding a third branch for the feed is the same pattern.
- **Live file changes**: `_platform/events` ships `FileChangeHub` + `useFileChanges` + multiplexed SSE channel `file-changes`, server-debounced 300ms, last-event-wins. **The feed reuses this exact channel — no new SSE channel is created.**
- **Initial ordering**: `getRecentFiles(worktreePath, limit)` already runs `git log --name-only --no-merges` and dedupes. Drop-in seed for the feed.
- **Type-specific viewers**: `_platform/viewer` already has `ImageViewer`, `VideoViewer`, `AudioViewer`, `MarkdownServer`, Shiki code highlighter, and a `detectContentType()` dispatcher. Card-sized variants already exist in `preview-cards/{image,video,audio,generic}-card.tsx` with `useLazyLoad` IntersectionObserver gating.
- **Raw file URL**: `GET /api/workspaces/{slug}/files/raw?worktree=...&file=...` streams bytes with Range support for video seek.

### What's Genuinely New

1. **Markdown excerpt extractor** — `MarkdownServer` renders the full document; a feed needs a "first paragraph / first N lines" truncator (small utility).
2. **Code-snippet card** — there's no existing "first 20 lines, syntax-highlighted, in a card" component. Compose from `highlightCode()` server action + a thin card wrapper.
3. **Feed component** — a virtualized vertical stack (≈3-5 items rendered at a time via `content-visibility: auto` or `react-window`) that **subscribes to the existing `file-changes` SSE channel** via `useFileChanges('**')` and prepends new entries to the top. **No new SSE channel is added** — this is purely another client consumer of the existing hub.
4. **Bootstrap action** — server action that returns `{ path, mtime, eventType }[]` for the last N files using `git log` (cheap, deterministic) — newest-first ordered.
5. **URL param** — add a `?view=recent-feed` param so the main panel swaps to the feed view (tree stays in `?panel=tree`).

### Quick Stats

- **Components to build**: 3 new (FeedView, MarkdownExcerptCard, CodeExcerptCard) + 1 server action + 1 utility (`truncateMarkdown`).
- **Components to reuse**: ImageCard, VideoCard, AudioCard, GenericCard, FileIcon, useLazyLoad, useFileChanges, getRecentFiles, detectContentType, highlightCode, raw-file API.
- **Domains touched**: `file-browser` (modify — new view), `_platform/viewer` (consume — possibly extend with excerpt utility), `_platform/events` (consume — useFileChanges).
- **Complexity (preliminary)**: CS-3 (medium). Surface: 1, Integration: 1, Data: 0, Novelty: 1, NFR: 1 (memory/virtualization), Testing: 1 = 5 → CS-3.

---

## Domain Context

### Existing Domains Relevant to This Research

| Domain | Relationship | Relevant Contracts | Role |
|---|---|---|---|
| `file-browser` | **modify** | `BrowserClientInner`, `FolderPreviewPanel`, `params/file-browser.params.ts`, `services/recent-files.ts` (`getRecentFiles`) | Hosts the new view; extends `PanelMode` and `fileBrowserParams` |
| `_platform/viewer` | **consume** (possibly extend) | `detectContentType`, `ImageViewer`, `VideoViewer`, `MarkdownServer`, `highlightCode`, `image-url.ts`, preview-cards barrel | Renders each feed card |
| `_platform/events` | **consume** | `useFileChanges`, `FileChangeProvider`, `FileChangeHub` | Live updates that promote files to the top |
| `_platform/panel-layout` | **consume** | `PanelShell`, `MainPanel`, `PanelMode` union | Hosts main-panel swap |
| `_platform/themes` | **consume** | `resolveFileIcon`, `FileIcon` | File-type icons in card chrome |
| `_platform/workspace-url` | **consume** | `workspaceHref`, `fileBrowserParams` | URL composition for clicks → file viewer |

No new domain is needed. The feature fits cleanly inside `file-browser` with read-only consumption of the surrounding platform domains.

### Domain Map Position

The feed sits where `FolderPreviewPanel` sits today — same composition, different content source (live event stream vs. directory listing). No new contract flows; only an additional consumer of the existing `useFileChanges` and `getRecentFiles` contracts.

---

## How Existing Pieces Work

### Browse Mode Architecture (BR-01..BR-10 condensed)

- **Page**: `apps/web/app/(dashboard)/workspaces/[slug]/browser/page.tsx` is a server component — fetches worktree metadata + initial entries, hands them to `BrowserClient` → `BrowserClientInner`.
- **URL state**: `apps/web/src/features/041-file-browser/params/file-browser.params.ts` defines `fileBrowserParams` (`dir`, `file`, `mode`, `panel`, `worktree`, …) via `nuqs`. The `panel` param drives the **left panel** mode; main panel content is decided by `dir`/`file`.
- **Main-panel branches** (in `BrowserClientInner` ~lines 1050-1220):
  - `selectedFile` → `FileViewerPanel`
  - `currentDir` (dir param set, no file) → `FolderPreviewPanel` (gallery grid)
  - else → `ContentEmptyState`
- **Existing "changes" view**: `apps/web/src/features/041-file-browser/components/changes-view.tsx` lives in the **left panel** when `?panel=changes`. Two sections: working tree (git status M/A/D/?/R) and committed-recent (deduped from `git log --name-only`). This is the simple text list the user described — distinct from the new media-rich main-panel view we're adding.
- **Folder navigation**: clicking a folder in the tree calls `handleExpandedDirsChange` → `setParams({ dir: path })` → URL updates → `FolderPreviewPanel` renders (gallery of cards from `/api/workspaces/[slug]/files`).

### File Change Pipeline (FC-01..FC-10 condensed)

- **Server**: `CentralWatcherService` (Plan 060) uses native `fs.watch({recursive: true})` per worktree. `FileChangeWatcherAdapter` filters `.chainglass/` paths, converts absolute→relative, **debounces 300ms with last-event-wins coalescing**.
- **Transport**: `FileChangeDomainEventAdapter` → `ICentralEventNotifier` → multiplexed SSE channel `file-changes`.
- **SSE payload**:
  ```ts
  type FileChangeSSEMessage = {
    type: 'file-changed';
    channel: 'file-changes';
    changes: Array<{
      path: string;          // relative
      eventType: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
      worktreePath: string;  // absolute
      timestamp: number;     // unix ms
    }>;
  };
  ```
- **Client**: `FileChangeProvider` wraps the page, instantiates `FileChangeHub`. `useFileChanges(pattern, callback, opts)` subscribes (pattern matching `'src/**'` recursive vs `'src/'` direct-children). Worktree-scoped (no stale state across worktrees).
- **HMR safety**: long-lived listeners are pinned to `globalThis` with unconditional detach-then-resubscribe (`__centralNotificationsStarted`, `__watcherMutationUnsubscribe__` pattern from Plan 084).
- **Initial ordering**: `apps/web/src/features/041-file-browser/services/recent-files.ts` exports `getRecentFiles(worktreePath, limit=20)` — runs `git log --name-only --no-merges --pretty=format: --diff-filter=AMCR`, scans 3× the limit commits to dedupe. Returns ordered list — perfect seed.

### Media Rendering Primitives (PV-01..PV-10 condensed)

- **`detectContentType(filename)`** in `apps/web/src/lib/content-type-detection.ts` returns `{category: 'image'|'pdf'|'video'|'audio'|'html'|'binary', mimeType}` for ≥27 extensions.
- **Image**: full = `<img>` cover/contain in `ImageViewer`; **card** = `<img loading="lazy" object-cover>` with IntersectionObserver gating (`useLazyLoad`).
- **Video**: full = `<video controls>`; **card** = `<video autoPlay muted loop playsInline preload="auto">` with click-to-pause overlay. Reusable as-is.
- **Audio**: `<audio controls preload="metadata">` with FileIcon + filename label.
- **Markdown**: `MarkdownServer` (`apps/web/src/components/viewers/markdown-server.tsx`) renders **full** markdown via `react-markdown` + `remark-gfm` + `@shikijs/rehype`. **Excerpt extraction does not exist** — needs a small utility (`truncateMarkdown(content, {lineLimit, charLimit})`).
- **Code**: server action `highlightCodeAction(code, lang)` returns Shiki HTML with dual-theme classes (`shiki-themes github-light github-dark`), per-line `data-line` attrs. Highlighter is a server-process singleton across 38 preloaded languages. Pre-render N-line excerpt server-side, ship HTML to client.
- **Raw bytes**: `GET /api/workspaces/{slug}/files/raw?worktree={path}&file={file}&download={bool}` streams with Range support, MIME from `detectContentType`, path-traversal-safe via `IPathResolver`.
- **Image URL resolution in markdown**: `apps/web/src/features/_platform/viewer/lib/image-url.ts` — reuse so excerpt-rendered markdown still resolves relative `./images/foo.png` correctly.

---

## 📚 Prior Learnings

These are the load-bearing institutional notes from prior work that the implementation must respect.

### PL-01 — Debounce events at 300ms server-side, coalesce client-side

**Source**: Plan 045, Plan 084 (live-monitoring-rescan)
**Why**: A `git checkout` with 200 changed files emits one batch, not 200 renders. The watcher already does this — the feed must not undo it by mapping each change to its own setState.
**Action**: Subscribe with `useFileChanges('**', batchCallback, { debounceMs: 100 })`; merge batches into a single dedup-by-path Map keyed update.

### PL-02 — Seed from `git log`, never `mtime` walk

**Source**: Plan 084 (`live-monitoring-rescan-plan.md`, finding 01 & 04)
**Why**: An mtime walk of a 10K-file worktree is slow and non-deterministic. `git log` is sub-100ms and ordered.
**Action**: On mount, call `getRecentFiles(worktreePath, 50)` for initial state; SSE events thereafter promote to top.

### PL-03 — Main panel swaps, tree stays — use the existing pattern

**Source**: Plan 050 (workflow-page-ux), Plan 041 patterns
**Why**: Users keep their tree position. The codebase already does this for `FolderPreviewPanel` vs `FileViewerPanel`.
**Action**: Add a third branch in `BrowserClientInner`'s main-panel decision and a new `PanelMode` value `recent-feed` (or `?view=recent-feed` as a separate param so it composes with `?panel=tree|changes`).

### PL-04 — Virtualize the stack or you will OOM

**Source**: New insight (no prior fix)
**Why**: 50 stacked `<video>` elements all preload — browsers do not lazily decode video. Same for high-res images.
**Action**: Render only 3-5 cards in viewport via `content-visibility: auto` (cheap, native) or `react-window`. For video cards specifically, `preload="metadata"` until in viewport, then upgrade to `preload="auto"`.

### PL-05 — Notification-fetch pattern: SSE carries paths, not bytes

**Source**: Plan 045 PL-05
**Why**: SSE messages must stay tiny; large payloads bottleneck the broadcaster.
**Action**: Each card fetches its preview content on first paint via raw-file API or an `excerpt(path)` server action — never expect content in the SSE event.

### PL-06 — Subscribe BEFORE the watcher emits

**Source**: Plan 045 PL-07
**Why**: Late subscribers miss everything until the next event. Tests pass locally then fail in CI.
**Action**: `FileChangeProvider` already wires this on the dashboard layout. The feed mounts under it, so this is free — just confirm via integration test.

### PL-07 — HMR persistence via `globalThis` for any server-side singleton

**Source**: Plan 084 (`live-monitoring-rescan`), Plan 045
**Why**: Editing a server file triggers HMR; un-pinned listeners die silently and the feed goes dead.
**Action**: We don't add any new server singletons (we consume existing ones), so this is a check, not a build.

### PL-08 — Worktree-relative paths, always

**Source**: Plan 084 spec
**Why**: Absolute paths leak the user's filesystem layout to the UI and break across workspaces.
**Action**: SSE already gives relative paths; `getRecentFiles` returns relative; raw-file API takes worktree+file separately. Display relative; build clicks via `workspaceHref` + `fileBrowserParams`.

### PL-09 — Reuse `_platform/themes` icon resolver

**Source**: Plan 073 (file-type-icons)
**Why**: Visual consistency — icons match the file tree.
**Action**: Use `<FileIcon name={path} />` in card chrome.

### PL-10 — Rename = `unlink` + `add` pair (treat as one event)

**Source**: Plan 045 / FC-04
**Why**: A rename surfaces twice; naive UI shows two separate cards.
**Action**: When merging batches, drop the `unlink` if a matching `add` arrives for the same basename within 200ms; collapse into a single "renamed" card. (Optional polish — defer if it adds CS.)

---

## Critical Decisions Surfaced

### 🚨 Decision 1: New `PanelMode` value vs. new URL param

**Options**:
- **A**: Extend `PanelMode = 'tree' | 'changes' | 'sessions'` with `'recent-feed'`. Then `?panel=recent-feed` swaps **left panel** to a feed view. ❌ This collapses the tree, which contradicts the "tree stays" requirement.
- **B**: Keep `panel` as-is (tree/changes/sessions for left panel) and add a new param `?view=recent-feed` that swaps the **main panel**. ✅ Matches the "main panel takes over, tree stays" intent literally.
- **C**: Reuse `dir` param with a sentinel like `:recent`. ❌ Hacky; conflicts with future folder named `:recent`.

**Recommendation**: **Option B** — a separate `view` param. Composes cleanly with `?panel=tree`, leaves `dir`/`file` as nullable (when view is set, those are ignored).

### 🚨 Decision 2: How is the feed entered?

- A button on the explorer top bar ("Recent activity")?
- A new entry in the panel-mode toggle?
- A breadcrumb/home link?
- A keybinding (USDK command)?

**Recommendation**: At least two entrypoints — **(a)** a button in `ExplorerPanel` header, and **(b)** an SDK command (`fileBrowser.openRecentFeed`) registered via `IUSDK`. This matches how `pr-view` and `notes` are exposed.

### 🚨 Decision 3: Excerpt size & limits

- How many lines for code? (Suggest: 20 lines, server-truncated to avoid shipping huge HTML.)
- How long for markdown excerpt? (Suggest: first paragraph OR first 200 chars OR first 5 non-empty lines, whichever is shortest.)
- Image/video sizing? (Suggest: aspect-video container max-h-`60vh`, scale-down `object-contain`.)
- How many feed entries? (Suggest: default 50, configurable via setting.)

**Recommendation**: All four are workshop opportunities — surface them as `## Workshop Opportunities` in the spec.

---

## Modification Considerations

### ✅ Safe to Modify
- Adding a new `?view=` param to `fileBrowserParams` — additive, defaults to nullable.
- Adding a new branch to `BrowserClientInner` main-panel decision.
- Adding a new component under `apps/web/src/features/041-file-browser/components/recent-feed/`.
- Composing existing preview-cards into a new feed layout.

### ⚠️ Modify with Caution
- Extending `_platform/viewer` with a `MarkdownExcerpt` component — keeps domain boundaries clean but adds a new contract row. Alternative: keep the truncator local to the feed feature and inline it; promote to viewer domain if a second consumer appears.
- The Shiki highlighter is a process singleton — calling `highlightCodeAction()` from many feed cards in parallel is fine (it dispatches per code+lang), but be aware of its cost on cold start.

### 🚫 Danger Zones
- **DO NOT add a new SSE channel.** The feed MUST consume the existing `file-changes` multiplexed SSE channel via `useFileChanges` from `_platform/events`. No new server route, no new channel name, no new broadcaster — just another client subscriber on the existing hub. Adding a parallel channel would duplicate watcher load and fragment the event pipeline that Plan 045 / 060 / 084 worked hard to centralize.
- **DO NOT** add file content to SSE payload (PL-05).
- **DO NOT** fetch all preview content eagerly (PL-04).
- **DO NOT** call `getRecentFiles()` on every SSE event (it shells out to git — debounce or trust the SSE stream after initial seed).
- **DO NOT** change the `FileChangeHub` callback contract — there are existing consumers (file tree, file viewer panel auto-refresh, change-view).

### Extension Points
- New preview-card types (markdown excerpt, code excerpt) plug into the existing `preview-cards/` barrel.
- The feed itself is a candidate for a new "main-panel view" registry pattern — but **defer** that abstraction unless a second consumer appears (YAGNI).

---

## External Research Opportunities

No external research opportunities identified. All decisions are bounded by existing codebase patterns and standard web platform features (HTML5 video, IntersectionObserver, `content-visibility`).

---

## Recommendations for `/plan-1b-specify`

When the spec runs, surface these as **clarification questions**:

1. **Entrypoint**: Top-bar button only? Or also SDK command? Or also panel-mode toggle?
2. **Excerpt sizing**: 20 lines for code? First paragraph for markdown? Or both configurable in settings?
3. **Default feed size**: 20, 50, or 100 entries?
4. **Filter controls**: Should the feed have type filters (only images / only code)? Defer to v2?
5. **Click behavior**: Card click → opens the file in the existing `FileViewerPanel` (replacing the feed) — confirm this is the intent (single-pane "drill into" UX) vs. opens in a new tab/split.
6. **Persistence**: When the user navigates away and back, should the feed remember its scroll position and last-seen marker (`Plan 071 notes` does similar)?
7. **Deletions**: When a file is `unlink`ed, does its card stay (greyed) or vanish from the feed?
8. **Initial bootstrap source**: Pure `git log` (already implemented), `git log` + uncommitted working-tree changes (would need to merge `git status`), or `git log` + `mtime` window? — Recommend: `git log` + `git status` (working tree), no mtime walk.

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|---|---|---|---|
| Feed card layout & sizing | UX | High visual variation across types | Aspect ratios, max heights, hover states, action buttons |
| Excerpt extraction utilities | Data Model | Reusable across feed + future overlay views | `truncateMarkdown` API, code excerpt API, max-line vs max-char strategy |
| Live ordering & event merging | State Machine | Coalescing, rename-pair detection, deletion handling | When does a card "fall off the end"? When does an event mutate vs. push to top? |
| Bootstrap query | Storage | Git log vs git log + working tree vs mtime | Single server action shape, performance budget, return DTO |

---

## Architecture Sketch

```
URL: /workspaces/{slug}/browser?view=recent-feed
                       │
                       ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ BrowserClientInner                                          │
 │ (reads fileBrowserParams + new `view` param)                │
 │                                                             │
 │  ┌────────────┐  ┌──────────────────────────────────────┐  │
 │  │ LeftPanel  │  │ MainPanel                             │  │
 │  │ (tree)     │  │  view === 'recent-feed' →            │  │
 │  │ stays put  │  │    <RecentFeedView>                  │  │
 │  │            │  │      seed: getRecentFiles()          │  │
 │  │            │  │      live: useFileChanges('**')      │  │
 │  │            │  │      virtualized stack of cards:     │  │
 │  │            │  │       ├ ImageCard (existing)         │  │
 │  │            │  │       ├ VideoCard (existing)         │  │
 │  │            │  │       ├ AudioCard (existing)         │  │
 │  │            │  │       ├ MarkdownExcerptCard (NEW)    │  │
 │  │            │  │       ├ CodeExcerptCard (NEW)        │  │
 │  │            │  │       └ GenericCard (existing)       │  │
 │  └────────────┘  └──────────────────────────────────────┘  │
 └─────────────────────────────────────────────────────────────┘
```

---

## File Inventory (for implementation reference)

### Reusable (no changes)
- `apps/web/src/lib/content-type-detection.ts` — `detectContentType()`
- `apps/web/src/features/041-file-browser/services/recent-files.ts` — `getRecentFiles()`
- `apps/web/src/features/041-file-browser/components/preview-cards/{image,video,audio,generic}-card.tsx`
- `apps/web/src/features/041-file-browser/hooks/use-lazy-load.ts` (or wherever `useLazyLoad` lives)
- `apps/web/src/features/045-live-file-events/{file-change-hub.ts, use-file-changes.ts, file-change-provider.tsx}`
- `apps/web/src/features/_platform/viewer/lib/image-url.ts`
- `apps/web/src/lib/server/highlight-action.ts`
- `apps/web/app/api/workspaces/[slug]/files/raw/route.ts`

### To Modify
- `apps/web/src/features/041-file-browser/params/file-browser.params.ts` — add `view` param
- `apps/web/src/features/041-file-browser/components/browser-client-inner.tsx` (or wherever the main-panel decision lives) — add `view === 'recent-feed'` branch
- `apps/web/src/features/041-file-browser/components/explorer-panel.tsx` — add entrypoint button
- `docs/domains/file-browser/domain.md` — add `Recent Changes Feed` concept row + History entry

### To Create
- `apps/web/src/features/041-file-browser/components/recent-feed/recent-feed-view.tsx` — main component
- `apps/web/src/features/041-file-browser/components/recent-feed/markdown-excerpt-card.tsx`
- `apps/web/src/features/041-file-browser/components/recent-feed/code-excerpt-card.tsx`
- `apps/web/src/features/041-file-browser/components/recent-feed/use-recent-feed-state.ts` — merge of seed + live events with virtualization helpers
- `apps/web/src/lib/markdown-excerpt.ts` — `truncateMarkdown(content, opts)` utility
- `apps/web/app/api/workspaces/[slug]/files/excerpt/route.ts` — OR a server action — returns `{ kind: 'code'|'markdown', content: string, lang?: string }` for one path, server-truncated
- Tests under `test/unit/web/041-file-browser/recent-feed/` and `test/integration/web/recent-feed.integration.test.ts`

---

## Next Steps

1. **Review this dossier** — confirm the architecture sketch, entrypoint preference, and excerpt strategy.
2. **Run `/plan-1b-specify "Recent Changes Feed"`** to produce `recent-changes-feed-spec.md` in the same plan folder. The spec command will pick up this dossier automatically.
3. Consider a workshop on **feed card layout & sizing** (Workshop Opportunities table above) before architecting — visual decisions are easier to align in workshop form.

---

**Research Complete**: 2026-05-03
**Report Location**: `docs/plans/084-random-enhancements-3/recent-changes-feed-research.md`
