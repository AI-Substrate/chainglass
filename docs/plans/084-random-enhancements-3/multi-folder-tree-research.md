# Research Report: Multi-Folder File Browser Tree

**Generated**: 2026-05-10T22:02:06Z
**Research Query**: "Add other folders to the browser tree — e.g. `~/github/jordo` plus `~/Library/CloudStorage/OneDrive-Microsoft/Jordo-IQ` — and have them show up in the same tree, side-by-side. VS Code multi-root style. A `+` to add, `-` to remove. Open question: dynamic refresh."
**Mode**: Plan-Associated (writing into existing `084-random-enhancements-3` plan folder, alongside FX007 / recent-changes-feed work)
**Location**: `docs/plans/084-random-enhancements-3/multi-folder-tree-research.md`
**FlowSpace**: Available (fs2 scanned graph used by agents)
**Findings**: 50 (IA × 12, WW × 10, SEC × 10, SR × 10, DB × 8 — 1 dedicated synthesis section + PL × 12)

---

## Executive Summary

### What you want
Two (or more) top-level folders rendered as siblings inside the same browser tree. A primary worktree (today's single root) plus one or more user-added folders — they could be git repos, plain directories, or cloud-synced folders (OneDrive / iCloud / Drive). A `+` to add, `-` to remove. Open question: when one of these changes on disk, how do we know.

### What the code looks like today
**Single-root, top to bottom.** Every layer — URL param, fetch hook, child-entries cache key, expand-state Set, React keys, repo-info state, SSE filter, "Copy Relative Path" semantics — assumes exactly one active `worktreePath`. Nothing renders a second root as a sibling today. The closest precedent is the **WorktreePicker** (IA-12), which lists multiple worktrees but treats them as a switchable singleton, not parallel siblings.

### The architectural lever
**Workspace-domain owns the list.** Add a new field `extraFolders: ExtraFolder[]` to `WorkspacePreferences` and persist via the existing `~/.config/chainglass/workspaces.json` registry (WW-02, WW-03, DB-02). File-browser then consumes it and renders N trees as siblings. **Do not reuse `worktrees[]`** — they are git-managed and auto-discovered; a discriminant-tagged hybrid (DB-03) creates filter burden at every consumer and lets non-git folders silently leak into git-typed code paths (PR-view, repo-info).

### The architectural risk
**The path-validation surface is currently inconsistent across API routes** (SEC-03, SEC-07, WW-09). FX007's `repo-info` route uses canonical 2-layer validation (defensive + closed-set against `workspaces[].worktrees[].path`). But `files/route.ts` uses defensive-only ("starts with `/`, no `..`, exists on disk") and `workspace.service.ts:220` even falls back to returning the user-supplied path when the closed-set match fails. **The day you add `extraFolders[]`, every route that touches a worktree path must validate against `worktrees[] ∪ extraFolders[]` — or you have a silent privilege expansion** (any path that "exists on disk" becomes readable).

### The hardest engineering problem
**Dynamic refresh on macOS CloudStorage folders.** The user's example second root is `/Users/jordanknight/Library/CloudStorage/OneDrive-Microsoft/Jordo-IQ`. macOS' kqueue / FSEvents is documented as unreliable on file-provider extensions (OneDrive, iCloud Drive, Dropbox Smart-Sync) — placeholders, materialise-on-read, and FUSE-like protocols silently drop events. The codebase has zero existing handling for this (SR-03). This is the single biggest unknown — flagged as the top external research opportunity below.

### Recommended approach (high-level — for spec, not plan)
1. **Workspace contract** — extend `WorkspacePreferences` with `extraFolders: { path, label, emoji? }[]`. Hardened path-validation helper takes a workspace and returns `worktrees ∪ extraFolders` for the closed-set.
2. **Path-validation harden pass** — bring all currently-defensive routes (`files`, `files/raw`, `file-notes`, `pr-view`) up to the canonical FX007 2-layer model **before** shipping the feature. This is the security prerequisite, not a follow-on.
3. **Watcher lifecycle** — extend `CentralWatcherService.sourceWatchers` map to register each extra folder when it's added (`workspace:updated` mutation event already exists, WW-10, SR-07). Closes naturally on removal via existing `performRescan()` reflex.
4. **Tree composition** — render N `<FileTree>` instances inside a wrapper that namespaces React keys (`${rootPath}:${entry.path}`), expand-state (`Map<rootPath, Set<string>>`), and child-entries cache (`Map<rootPath, Record<dir, FileEntry[]>>`).
5. **UI affordance** — `+` button lives in `LeftPanel`'s PanelHeader `actions` slot (IA-06); `-` per root header. Add-folder modal validates path (exists, readable, absolute, not a symlink-to-outside).
6. **CloudStorage strategy** — *deliberately defer*. Ship with `fs.watch` for local paths only. CloudStorage paths get a "Refresh" button + a "watcher not reliable on this folder" annotation. Polling fallback (Option D in SR refresh-strategy table) is a Phase 2 follow-on, after external research.

### Estimated complexity
**CS-3 to CS-4** depending on path-validation scope. If the harden pass is in-scope, this is genuinely CS-4 (large) — it touches workspace persistence, every file-API route, the tree, the watcher service, and a settings UI. If the harden pass is split out as a prerequisite plan, the multi-root work alone is CS-3.

---

## Quick Stats

- **Single-root assumptions touched**: 8+ layers (URL param, fetch hook, child-entries cache, expand state, React keys, repo-info, SSE filter, "Copy Relative Path" semantics)
- **API routes needing harden pass for path-validation**: 5+ (`files`, `files/raw`, `file-notes`, `pr-view`, `samples`)
- **Existing patterns reusable**: persistence (WW-02), starred-pattern UI (PL-07), watcher service (SR-02, SR-07), domain composition (DB-07/PL-09)
- **Domain-map changes needed**: none (file-browser already depends on workspace)
- **External research opportunities**: 3 (CloudStorage watch reliability, VS Code multi-root UX patterns, watcher fd scaling)

---

## How It Currently Works

### Single-Root Pipeline (top to bottom)

```mermaid
flowchart TD
    URL["URL: /workspaces/[slug]/browser?worktree=PATH"] --> SSR[page.tsx SSR<br/>listDirectory worktreePath dir=''']
    SSR --> BC[browser-client.tsx<br/>initialEntries: FileEntry[]]
    BC --> FT[FileTree<br/>entries: FileEntry[]<br/>key=entry.path]
    BC --> RI[repoInfo state<br/>per: slug, worktreePath]
    BC --> FN[useFileNavigation<br/>childEntries: dir→entries[]]
    FT -->|onExpand dir| FN
    FN -->|fetch| API["/api/workspaces/[slug]/files?worktree=&dir="]
    API -->|listDirectory| FS[filesystem]
    SSE["SSE file-changes channel"] --> FCP["FileChangeProvider<br/>filter: c.worktreePath === worktreePath"]
    FCP --> UFC["useFileChanges('*')"]
    UFC -->|handleRefreshDir| FN
    classDef single fill:#E3F2FD,stroke:#1976D2
    class URL,SSR,BC,FT,RI,FN,API,FCP,UFC single
```

The system was built coherently for one root. Every box above has a `worktreePath` baked into its closure or props.

### Entry Points

| Entry | Type | Location | Purpose |
|---|---|---|---|
| Browser page route | Next.js page | `apps/web/app/(dashboard)/workspaces/[slug]/browser/page.tsx:48-62` | SSR root entries; pass to client |
| Browser client | Client component | `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | Owns state, wires hooks, renders panels |
| FileTree | Component | `apps/web/src/features/041-file-browser/components/file-tree.tsx:84-118` | Render tree |
| Files API | Route handler | `apps/web/app/api/workspaces/[slug]/files/route.ts:32-75` | List a directory |
| File-changes SSE | Multiplexed channel | `apps/web/src/lib/sse/multiplexed-sse-provider.tsx:74-75` | Live file updates |
| CentralWatcherService | Server singleton | `packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts:37-144` | One `fs.watch` per known worktree |
| WorkspaceService | Service | `packages/workflow/src/services/workspace.service.ts:197-199` | `getInfo(slug)` returns `worktrees[]` |
| WorkspaceRegistryAdapter | Persistence | `packages/workflow/src/adapters/workspace-registry.adapter.ts:40-65` | Reads/writes `~/.config/chainglass/workspaces.json` |

### Architecture: How Single-Root Becomes a Constraint at Each Layer

| Layer | Single-Root Today | Multi-Root Tomorrow |
|---|---|---|
| **URL** | `?worktree=<path>` | Either `?worktrees=p1,p2,...` or move the list into per-workspace persistence and drop the param (preferred: keeps URLs sane and respects per-workspace state) |
| **SSR** | Calls `listDirectory(worktree, '')` once | Calls `listDirectory(root, '')` per active root |
| **`initialEntries`** | `FileEntry[]` (one root's children) | `Record<rootPath, FileEntry[]>` |
| **Child-entries cache** | `childEntries[dirPath]` | `childEntries[rootPath][dirPath]` — **path-only key collides** if two roots both have e.g. `src/index.ts` (IA-03) |
| **Expand state** | `Set<string>` of dir paths | `Map<rootPath, Set<string>>` (IA-08, SR-04) |
| **React `key`** | `entry.path` | `${rootPath}:${entry.path}` — **duplicate keys** today if multi-root naively spliced (IA-11) |
| **`repoInfo` state** | One per active worktree | `Map<rootPath, RepoInfo | null>` — each root can be a different git repo, ADO, or non-git (IA-09) |
| **"Copy Relative Path"** | Relative to *the* worktree | Ambiguous — relative to which root? Either label the root in the menu or always include the root name (IA-05) |
| **SSE event routing** | Filtered to `c.worktreePath === worktreePath` (file-change-provider.tsx:54-55) | Filter must match `worktreePath ∈ activeRoots`; receivers must namespace events by root (SR-08, SR-09) |
| **Watcher** | One `fs.watch` per worktree, started at `rescan()` (SR-02) | Add an entry to `sourceWatchers` when extra folder is added; close it on remove. Existing pattern handles this — no new infra. |
| **Path validation in API routes** | Some routes closed-set (`repo-info`); some routes defensive-only (`files`, `files/raw`, `pr-view`, `file-notes`) | Closed-set must become `worktrees[] ∪ extraFolders[]` everywhere (SEC-03, SEC-07, WW-09) — **harden pass required** |
| **Domain ownership** | Workspace owns preferences; file-browser owns tree UI | Workspace gains `extraFolders[]`; file-browser gains add/remove UI + multi-root rendering (DB-01, DB-02, DB-07) |

---

## Critical Findings

### 🚨 Critical Finding 01: Path-validation surface is inconsistent and will silently widen when extraFolders[] lands

**Impact**: Critical (security / correctness)
**Source**: SEC-03, SEC-07, WW-05, WW-09
**What**: Some API routes use the canonical FX007 2-layer model (`repo-info`). Others use only defensive checks (`files`, `files/raw`, `pr-view`, `file-notes`). `WorkspaceService.resolveContextFromParams()` even returns a context with the user-supplied path *when the closed-set match fails* (`workspace.service.ts:220-270`, the line `worktreePath: targetWorktree?.path ?? worktreePath ?? info.path`).
**Why It Matters**: The moment `extraFolders[]` exists in workspace data, the *defensive-only* routes will accept arbitrary `/`-prefixed paths and silently grant read access to anything that "exists on disk" — that's not the user-chosen folder list, it's *every path on the box*. Defensive-only validation is acceptable today **only because** any caller's `worktreePath` is going to match the closed-set anyway (the UI never sends anything else). The contract changes the day the UI can send an arbitrary path.
**Required Action**: **Harden pass is a prerequisite**, not a follow-on. Build a shared `validateWorkspacePath(slug, path) → Result<{ kind: 'worktree' | 'extra' }, Error>` helper, route every existing path-accepting endpoint through it, and only *then* land the `extraFolders[]` write surface. Best done as its own preceding fix or Phase 1 of the multi-root plan.

### 🚨 Critical Finding 02: macOS CloudStorage file-watching is unhandled and historically unreliable

**Impact**: High (UX correctness)
**Source**: SR-03
**What**: The user's archetypal second-root is `/Users/jordanknight/Library/CloudStorage/OneDrive-Microsoft/Jordo-IQ`. macOS CloudStorage is a file-provider extension that materialises files on read and uses a FUSE-like protocol. Node's `fs.watch` (kqueue / FSEvents under the hood) is widely documented as flaky on these mounts — placeholders may not emit events at all, and watcher registrations may silently drop. The codebase has zero existing handling: grep for "CloudStorage", "OneDrive", "placeholder", "kqueue", "FSEvents", "iCloud" returned no hits anywhere.
**Why It Matters**: A user adds their OneDrive folder, edits a file *outside* the app (in VS Code, in Word, on another device), and the browser tree silently misses the change. They go file-hunting for stale data. The bug is hard to reproduce, hard to diagnose, and very common in real workflows (cloud-synced docs folders, GitHub clones inside iCloud Drive, etc.).
**Required Action**: Decide explicitly. Three options: (a) ship with a "Refresh" button per root and accept that cloud folders need manual refresh; (b) detect CloudStorage mount points and route them through a 5–10s `fs.stat` polling loop; (c) defer cloud support until external research nails the reliable pattern. **External research is a strong fit here** — see Opportunity 1 below.

### 🚨 Critical Finding 03: Workspace registry is per-machine-user, with no per-user path ownership

**Impact**: Medium (acceptable today; design constraint for the future)
**Source**: SEC-09, SEC-10
**What**: Workspaces live in `~/.config/chainglass/workspaces.json` — one global file per OS user. All authenticated app sessions see all workspaces. There is no `addedByUserId` or per-user filter.
**Why It Matters**: Today this is fine — chainglass is a single-developer-on-their-own-machine tool. But `extraFolders[]` materially expands what "the workspace claims access to," and if this ever becomes multi-tenant or shared (e.g. ssh'd remote, future hosted mode), the "add any folder" button becomes "any user adds any path the process can read." This isn't a blocker for shipping; it's a constraint to acknowledge in the spec's threat model.
**Required Action**: Document the assumption in the spec ("single OS-user trust boundary; extra folders inherit current trust model"). Do **not** add per-user ownership now (over-engineering for current threat model). Do leave the door open: `ExtraFolder.addedAt: string` is cheap to add now and useful for audit later.

---

## Domain Context

### Existing Domains Relevant to This Research

| Domain | Relationship | Relevant Contracts | Key Components |
|---|---|---|---|
| `workspace` | **modify** (owns the new field) | `WorkspacePreferences`, `WorkspaceInfo`, `WorkspaceMutationEvent` | `WorkspaceService.getInfo`, `WorkspaceService.updatePreferences`, `IWorkspaceRegistryAdapter` |
| `file-browser` | **modify** (consumes + renders) | none changed externally; internal `FileTreeProps` and hooks gain root-namespacing | `FileTree`, `useFileNavigation`, `browser-client.tsx`, settings UI |
| `_platform/git` | **consume** (per extra root, where applicable) | `RepoInfo` resolution from FX007 | `repo-info/route.ts` (per-root call) |
| `_platform/events` | **consume** (per extra root) | `useFileChanges('*', ...)` | `CentralWatcherService.sourceWatchers` map |
| `_platform/state` | **n/a** | Don't put `extraFolders[]` here — it's persistent metadata, not ephemeral state (DB-06) | — |

### Domain Map Position

No new node, no new edge in `docs/domains/domain-map.md`. File-browser already depends on workspace; adding `extraFolders[]` to a contract file-browser already consumes is a within-edge change.

### Potential Domain Actions

- **Extend workspace domain**: add `ExtraFolder` type + `extraFolders?: ExtraFolder[]` to `WorkspacePreferences` (DB-08). Add a § Concepts entry: "Manage extra folders" (entry points: `IWorkspaceService.addExtraFolder`, `removeExtraFolder`).
- **Extend file-browser domain**: § Composition gains "ExtraFoldersList" component + "AddFolderModal"; § Dependencies adds the new contract method names from workspace.
- **No new domain needed.**

---

## Prior Learnings (From FX007 and Recent-Changes-Feed)

These are gold — directly applicable patterns and gotchas the multi-root work will inherit.

### 📚 PL-FX007-01: Two-layer path validation is canonical
**Source**: `docs/plans/084-random-enhancements-3/copy-repo-url-plan.md` Finding 01; `copy-repo-url-execution.log.md` T005
**Action**: Build `validateWorkspacePath(slug, path) → Result<...>` as a shared helper. Every API route accepting a path imports it. Layer 1: defensive (`startsWith('/') && !includes('..')`). Layer 2: closed-set match against `workspaces[].worktrees[] ∪ extraFolders[]`.

### 📚 PL-FX007-02: Sync-clear state on worktree switch (Companion F002)
**Source**: `copy-repo-url-execution.log.md`, Companion F002
**Action**: When the user switches the active root focus (or removes a root), clear that root's caches *synchronously at effect start*, before any fetch. Otherwise a fast right-click between focus changes shows stale data from the previous root. Apply this to `repoInfo`, `childEntries`, `expandPaths` per-root.

### 📚 PL-RCF-01: Reuse the existing SSE file-changes channel — do NOT add a new one
**Source**: `docs/plans/084-random-enhancements-3/recent-changes-feed-research.md` § How Existing Pieces Work
**Action**: `useFileChanges('*', cb)` is the contract. Multi-root subscribes to the same channel and filters by `c.worktreePath ∈ activeRoots`. A new SSE channel for multi-root would fragment the event hub.

### 📚 PL-RCF-02: Path filter is universal, not per-root
**Source**: `recent-changes-feed.execution.log.md` Finding 06
**Action**: The `isFilteredPath` predicate (drops `node_modules/`, `.next/`, `.turbo/`, `.cache/`, `dist/`, `build/`, `.chainglass/`, `.fs2/`) applies to *all* events regardless of root. This is correct behavior — build artifacts are build artifacts everywhere — but document it explicitly in the spec.

### 📚 PL-RCF-03: HMR singleton pinning via `globalThis`
**Source**: `recent-changes-feed-research.md` PL-07
**Action**: If a new client-side singleton is needed (e.g. a multi-root state coordinator), pin its unsubscribe to `globalThis.__multiRootUnsub__` to survive HMR. Existing watcher service is already pinned on the server side.

### 📚 PL-RCF-04: Server-side debounce + client-side batch
**Source**: `recent-changes-feed-research.md` PL-01
**Action**: Server debounces 300ms (last-event-wins). Client receives batches. Multi-root must accumulate per-root and update once per batch — don't call `getRecentFiles()` or `handleRefreshDir()` per individual event.

### 📚 PL-Live-01: Watcher rescan is mutation-driven and already handles add/remove
**Source**: `docs/plans/084-random-enhancements-3/live-monitoring-rescan-plan.md`
**Action**: `WorkspaceService` emits `WorkspaceMutationEvent` ('workspace:updated') on preference change; CentralWatcherService subscribes and calls `performRescan()`; rescan diffs known vs. registered, starts new watchers, closes stale ones. **Extending this pattern to extra folders is mechanical** — emit `workspace:updated` on `addExtraFolder()` / `removeExtraFolder()` and the watcher follows.

---

## Modification Considerations

### ✅ Safe to Modify
- **`WorkspacePreferences` shape extension** (`packages/workflow/src/entities/workspace.ts`) — additive, backwards-compatible if `extraFolders` is optional.
- **`CentralWatcherService.sourceWatchers` map additions** — well-tested rescan reflex already handles add/remove.
- **`LeftPanel` header `actions` array** — designed for adding icon buttons (Refresh button is the precedent).

### ⚠️ Modify with Caution
- **Every file-API route that accepts a `worktree` param** — harden to the 2-layer model BEFORE shipping multi-root, not after. Security correctness depends on it (SEC-03, SEC-07).
- **FileTree state shape** — `expanded: Set<string>` → `Map<rootPath, Set<string>>` is a non-trivial refactor; ensure no consumer reads from the inner set without root context.
- **React keys** — `key={entry.path}` everywhere in the tree must become root-namespaced. Test by adding two roots that share a common subpath (e.g. both have `src/`).

### 🚫 Danger Zones
- **`workspace.service.ts:220-270` lenient fallback** — the line `worktreePath: targetWorktree?.path ?? worktreePath ?? info.path` is a footgun for multi-root. Tightening it may break code paths that currently rely on it. Tighten **carefully** with explicit unit tests for "unknown path" cases.
- **Reusing `worktrees[]` for non-git folders** — appealing on the surface (one less field, less code) but every consumer (worktree-picker, sidebar, PR-view, git-cli wrappers from FX007) currently assumes "if it's in `worktrees[]`, it's a git directory." A `kind: 'git' | 'aux'` discriminant *will* be forgotten somewhere. **Use a separate field.**

### Extension Points
- **`WorkspaceMutationEvent` taxonomy** (WW-10) is the natural channel for add/remove broadcasts.
- **`PanelHeader.actions[]` slot** for the `+` button.
- **Settings page at `/settings/workspaces`** (DB-05, PL-07) is the natural home for the management UI — replicate the starred-worktree edit pattern.

---

## Architectural Decisions to Make (for the Spec)

These are the open questions the spec will need to nail. Each has a recommended position based on the research; the user/spec author can override.

1. **Field naming**: `extraFolders` vs `additionalRoots` vs `auxFolders`. **Recommend `extraFolders`** — matches user's language ("add other folders"), avoids overloading "root" (which has a tree-rendering meaning) and "worktree" (which is git-tied).

2. **Storage location**: Workspace preferences (in registry JSON) vs separate per-workspace file vs cross-workspace user setting. **Recommend `WorkspacePreferences.extraFolders`** (WW-03, WW-07, DB-01). Reuses existing persistence; per-workspace scoping matches the user's mental model ("this workspace also looks at this folder").

3. **Path-validation harden pass: prerequisite or in-scope?** Two viable framings — (a) ship harden pass as its own FX or Phase 1 of this plan, (b) bundle it. **Recommend ship as Phase 1 of the same plan, with multi-root features in Phase 2+.** Forces the harden-pass to happen but keeps related work co-located.

4. **CloudStorage strategy**: Ship without, ship with manual-refresh, ship with polling fallback. **Recommend ship without explicit CloudStorage handling in v1; add "Refresh" affordance per root that users can click manually; mark CloudStorage handling as explicit Phase 2 (gated on external research).**

5. **URL strategy**: Encode active roots in URL or rely on persistence only. **Recommend persistence-only** for v1 — URL becomes unwieldy with N roots; reload restores from preferences. Future bookmarkable per-root deep-links can be added without breaking change.

6. **Reuse of `WorktreePicker`**: Treat extra folders as another row in the picker (sibling concept), or render them separately. **Recommend separate** — picker is for *switching* the active worktree, multi-root is for *adding parallel siblings*. Different mental models; same UI would confuse both.

7. **Per-root repo-info**: Fetch eagerly on add, lazily on first interaction, or never (let user opt-in). **Recommend lazy on first expand of the root**. Repo-info needs a git binary call per root; doing it eagerly for 5+ roots is slow on workspace load.

8. **Removal UX**: Confirmation modal or instant undo-toast. **Recommend instant + toast with "Undo" for 5 seconds** — extra folders are cheap to re-add; modal friction is overkill.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Path-validation harden pass is skipped/deferred → silent privilege expansion the day `extraFolders[]` exists | Medium | Critical | Make harden pass an explicit Phase 1 gate in the plan; companion review must verify every route accepting a worktree param routes through the shared helper |
| macOS CloudStorage roots silently miss file changes → users see stale tree | High | High | Ship with manual Refresh button per root; add explicit "watcher reliability not guaranteed on this folder" annotation for detected CloudStorage mounts; defer auto-handling to Phase 2 |
| React key collisions when two roots share subpath names | Medium | Medium | Namespace all keys with `${rootPath}:${entry.path}` in a single refactor pass; add a unit test that adds two roots with identical subtrees |
| Expand/collapse state lost when switching root focus or removing a root | High | Low | Make `Map<rootPath, Set<string>>` the explicit data shape from day one; preserve other-root state on focus/remove |
| `worktrees[]` reuse for non-git folders breaks PR-view / git-cli wrappers | Low (because we recommend against it) | High | Use separate `extraFolders[]` field; verify FX007 git-cli wrappers are only called against `worktrees[]`-typed paths |
| User adds a *huge* directory (`/Users`) and the recursive watcher exhausts fds | Low | High | Validate at add-time: refuse paths above a depth threshold (e.g. >50K entries when scanned shallowly); inform user |
| `~` expansion in user-pasted paths is mishandled | Medium | Low | Expand `~` to `process.env.HOME` at the API boundary (registry adapter already does this for the registry path; reuse the same logic) |

---

## External Research Opportunities

### Research Opportunity 1: macOS file-provider extensions (OneDrive / iCloud Drive / Dropbox) and `fs.watch` reliability

**Why Needed**: The user's archetypal second-root is a CloudStorage folder. macOS file-provider extensions use a FUSE-like protocol with materialise-on-read; `fs.watch` (kqueue / FSEvents) is widely reputed to drop events in this case. The codebase has zero existing handling and nothing in the wider ecosystem makes the reliable pattern obvious. Choosing between "no live watching for cloud folders + manual refresh," "polling fallback," and "specific FSEvents API tier" requires current research.
**Impact on Plan**: Determines whether v1 ships with cloud support, manual-only, or pure local. The architectural difference between "register one more fs.watch entry" and "register a polling job + per-root health monitor" is material.
**Source Findings**: SR-03, Critical Finding 02.

**Ready-to-use prompt**:
```
/deepresearch "How reliable is Node.js `fs.watch` on macOS file-provider extensions (OneDrive on Mac, iCloud Drive, Dropbox Smart-Sync, Google Drive File Stream)?

Context:
- App is a Next.js / Node 22 dev tool that uses CentralWatcherService with `fs.watch` (recursive, persistent) on per-worktree directories.
- New feature: let the user add an arbitrary folder as a sibling root in the file browser.
- Archetypal target path: /Users/<user>/Library/CloudStorage/OneDrive-Microsoft/<folder>.
- Files in CloudStorage folders are placeholders that materialise on read.

Research questions:
1. What is the current (2025–2026) state of reliability of fs.watch / kqueue / FSEvents on macOS CloudStorage / file-provider mount points? Cite any known issue trackers (nodejs/node, electron, chokidar).
2. What patterns do major editors (VS Code, IntelliJ, Sublime, Helix) use to watch files inside iCloud Drive / OneDrive / Dropbox folders on macOS? Manual refresh? Polling? FSEvents directly via Node addon?
3. How does chokidar (and its Mac-specific options like `usePolling`, `useFsEvents`, `awaitWriteFinish`) compare to raw `fs.watch` on these mounts?
4. Is there a low-overhead detect-CloudStorage heuristic (e.g. `mount` output, `getattrlist`, looking for `kCFURLIsUbiquitousItemKey`) that can decide watch-vs-poll per path?
5. What is a sensible polling interval (5s / 10s / 30s?) and a memory budget for ~N folders?
6. Recommend an architectural approach (single watcher tier vs hybrid watch+poll) with rationale.

Output: Practical recommendation table, ranked by reliability/cost, plus the chosen pattern's pseudo-code for Node 22."
```

**Results location**: `docs/plans/084-random-enhancements-3/external-research/cloudstorage-watching.md`

### Research Opportunity 2: Multi-root workspace UX patterns

**Why Needed**: VS Code, IntelliJ, Helix, Zed, and Sublime have all implemented multi-root. They've each made different choices about: (a) one flat tree vs separate roots-as-siblings, (b) drag-drop reordering, (c) per-root settings inheritance, (d) the "active workspace" concept (e.g. which root owns `tasks.json`), (e) terminal-cwd resolution across roots, (f) search/grep scope. We have a single open question here ("two folders showing up in the same tree") but the design space around it has been explored.
**Impact on Plan**: Informs the spec's UX clarifications — what behavior users expect from prior tools, what failure modes are common, what the minimal-viable feature set is for a "+ a folder" interaction.
**Source Findings**: DB-04, IA-12 (the existing WorktreePicker is a different mental model).

**Ready-to-use prompt**:
```
/deepresearch "Multi-root workspace UX patterns in modern code editors (2024-2026)

Context: We're a Next.js-based dev tool with a single-root file browser. We want to add a '+' button to add additional top-level folders as siblings in the tree, '-' to remove. Roots can be git repos or plain directories.

Research questions:
1. How do VS Code, IntelliJ-family (WebStorm/PyCharm), Helix, Zed, Sublime Text 4, and Cursor implement multi-root workspaces? Cover: tree rendering (separate roots vs unified), drag-drop reorder, root labels (folder name vs custom), per-root settings, search scope, terminal cwd resolution.
2. What are common user complaints about multi-root in those tools? (search GitHub issues, Reddit /r/vscode, Discord)
3. What is the canonical UX for adding/removing roots? Button placement, modal vs file picker, persistence model.
4. For our archetype (git repo + cloud-synced docs folder shown side-by-side), what is the minimal-viable feature set?
5. What are the second-order features users always ask for after multi-root ships? (so we can decide what to defer cleanly)

Output: UX recommendations matrix, with citations to the editors that pioneered each pattern."
```

**Results location**: `docs/plans/084-random-enhancements-3/external-research/multiroot-ux-patterns.md`

### Research Opportunity 3: `fs.watch` recursive watcher fd scaling on macOS and Linux

**Why Needed**: Today we run one recursive `fs.watch` per worktree. Adding N user-chosen folders multiplies this. macOS has a default `kqueue` fd limit of 256; Linux's `inotify` has `fs.inotify.max_user_watches` (commonly 8192–524288 depending on distro). A user with five roots, each with `node_modules` recursed into, can blow past these limits.
**Impact on Plan**: May surface a hard cap on number of extra folders, or trigger a switch to chokidar with polling-fallback at certain thresholds, or push us to a single non-recursive watcher with manual descent.
**Source Findings**: SR-02 (existing CentralWatcherService design), Risk table row "User adds a huge directory".

**Ready-to-use prompt**:
```
/deepresearch "Scaling Node.js fs.watch with recursive:true across many directories on macOS and Linux (2024-2026)

Context: A Node 22 server uses fs.watch with {recursive: true, persistent: true} on multiple top-level project directories. We're adding multi-root support that may push this from 1-3 watched directories to 5-15.

Research questions:
1. What are the actual fd / kqueue / inotify limits on macOS Sequoia and recent Linux distros (Ubuntu 24.04, Fedora 40, Debian 12) for recursive fs.watch?
2. Does fs.watch with recursive:true on Node 22 use one fd per file or one fd per directory tree on each OS?
3. What is the practical upper bound of distinct fs.watch recursive trees before degradation (event loss, missed updates)? Cite benchmarks if available.
4. When chokidar is used as a wrapper, does it materially change the cost? What are its Mac-specific FSEvents-backed options?
5. Recommended pattern for 10+ roots of typical-project size (~10k–500k files each, with node_modules)?

Output: A table of per-OS limits and watcher costs, plus a recommendation for our target of up to ~15 roots."
```

**Results location**: `docs/plans/084-random-enhancements-3/external-research/watcher-scaling.md`

---

## Recommendations

### If proceeding to spec/plan
1. **Phase 1: Path-validation harden pass.** Build shared `validateWorkspacePath(slug, path)` helper. Route every API endpoint that takes a worktree param through it. Tighten `WorkspaceService.resolveContextFromParams()` lenient fallback. **Acceptance**: every existing path-accepting route uses the same 2-layer model; no path that fails closed-set match is silently accepted.
2. **Phase 2: Workspace contract extension.** Add `ExtraFolder` type + `extraFolders?: ExtraFolder[]` to `WorkspacePreferences`. Add `addExtraFolder` / `removeExtraFolder` methods to `IWorkspaceService` that emit `WorkspaceMutationEvent`. Extend `validateWorkspacePath` to accept `worktrees[] ∪ extraFolders[]`.
3. **Phase 3: Watcher lifecycle wire-up.** `CentralWatcherService.performRescan()` already does the right thing once the workspace data includes the new paths — verify and unit-test for "extra folder added/removed" event handling. Add CloudStorage-mount detection and a `watchable: boolean` annotation on the per-root tree header.
4. **Phase 4: Multi-root tree rendering.** Refactor `FileTree` consumer state to `Map<rootPath, ...>`. Namespace React keys. Render N `<FileTree>` instances inside a wrapper. Per-root header with label, refresh button, and `-` to remove.
5. **Phase 5: Add-folder UI.** `+` button in PanelHeader actions. Modal: native folder picker + label field + optional emoji. Submit calls `addExtraFolder` server action; surfaces validation errors (path doesn't exist, not absolute, symlinks-out-of-itself, depth-bomb refusal).
6. **Phase 6: Settings management UI.** Add an "Extra Folders" accordion in `/settings/workspaces` mirroring the starred-worktree edit pattern.
7. **Phase 7: Per-root repo-info.** Lazy-fetch on first expand; cache per `rootPath` in client state; surfaces "Copy URL" menu items for git-typed roots only (FX007 pattern).

### Companion-mode hint
This plan is a great candidate for `/plan-6-v2-implement-phase-companion` — the path-validation harden pass is exactly the kind of cross-cutting change a companion catches inconsistency on (one missed route is a vuln).

---

## Appendix: Full Findings (Compressed)

### File Browser Architecture (IA-01 → IA-12)
Single-root flow from URL → SSR → `browser-client` → `FileTree`. Cache keys are path-only (collide across roots). Expand state is one `Set<string>` (collides). React keys are `entry.path` (collide). `repoInfo` is single-valued (each root could be a different repo). Files API is well-designed for absolute `worktree` param — no change needed there. `LeftPanel` PanelHeader has an `actions[]` slot for new buttons. `WorktreePicker` is the closest precedent — but it's "switch one of N," not "render N as siblings."

### Workspace / Worktree Model (WW-01 → WW-10)
`WorkspaceService.getInfo(slug)` → `WorkspaceInfo { worktrees: Worktree[] }`. Worktrees are git-managed (auto-discovered via `git worktree list`). Persistence is `~/.config/chainglass/workspaces.json` with `WorkspaceJSON.preferences: WorkspacePreferences` already containing visual + SDK fields — extension point for `extraFolders`. Path validation lives partly in routes, partly in `WorkspaceService.resolveContextFromParams` which has a lenient fallback that returns user-supplied paths when closed-set fails (footgun). `WorkspaceMutationEvent` taxonomy already exists for add/update/remove broadcasts.

### Security & Path Validation (SEC-01 → SEC-10)
Canonical 2-layer pattern from FX007 `repo-info` route. `PathResolver.resolvePath` does string-boundary check + traversal detection (no `realpath`). Read routes (`files`, `files/raw`) are defensive-only. Write routes (`file-mutation-actions`) call `realpath` to detect symlink escapes. Auth is `auth()` session + bootstrap cookie verify. No audit logging, no per-user path ownership. Registry is per-OS-user.

### State, Refresh, File Watching (SR-01 → SR-10)
`useFileChanges(pattern, opts)` is single-pattern, single-worktree-filtered. Backend: one `CentralWatcherService` singleton, recursive `fs.watch` per worktree, 300ms debounced batches, last-event-wins. SSE multiplexed channel `file-changes` carries all events. macOS CloudStorage is unhandled (zero references). Expand state is React-memory only, no persistence. Recent-changes-feed pipeline already uses the same channel — multi-root extends the consumer, not the channel. Cache keying is workspace-slug-scoped, not root-scoped.

### Domain & Boundary (DB-01 → DB-08)
Workspace owns the field (per-workspace, not cross-workspace user setting). `WorkspacePreferences` is the natural extension point. Reusing `worktrees[]` is *not* recommended — discriminant filtering will be forgotten. File-browser owns the consuming UI (tree + settings page accordion). No new domain or new domain-map edge needed.

### Prior Learnings (PL-01 → PL-12)
2-layer validation is the canonical pattern (FX007). Sync-clear state on switch (Companion F002). Reuse the existing SSE channel (recent-changes-feed). Server-side 300ms debounce + client-side batch consumption. HMR pin singletons via `globalThis`. Watcher rescan is mutation-driven and handles add/remove naturally. Starred-items pattern is reusable for `+`/`-` UI. Worktree-relative paths everywhere; never leak absolute paths to UI. `FileChangeHub` callbacks receive batches — don't fan-out per event.

---

## External Research Synthesis (added 2026-05-10)

The three Perplexity Deep Research prompts above were executed and saved to `external-research/`. The findings materially **sharpen and partially revise** the recommendations above. Key updates:

### ER-01: Drop `fs.watch` for the multi-root expansion — adopt `@parcel/watcher`
**Source**: `external-research/cloudstorage-watching.md`, `external-research/watcher-scaling.md`

The original dossier (SR-02, SR-07) assumed we'd extend `CentralWatcherService.sourceWatchers` by adding more native `fs.watch` entries. The external research shows this won't scale: macOS hits a hard ~4,096 `fs.watch` ceiling even with `ulimit -n` raised to 200,000 (watchpack issue #169), and chokidar degrades superlinearly past 100k files (chokidar #1162). VS Code, Tailwind, Nx, Nuxt have all moved to **@parcel/watcher** — a native C++ addon that uses FSEvents directly on macOS (no per-file fd cost) and inotify-or-FTS on Linux. **Recommendation update**: the multi-root plan should land `@parcel/watcher` as a Phase 1 substrate change. The existing watcher service is wrapped, not extended. This protects against silent scaling failures the day a user adds their 5th root.

### ER-02: CloudStorage detection + polling is the canonical hybrid
**Source**: `external-research/cloudstorage-watching.md`

The original dossier deferred CloudStorage handling entirely to Phase 2 "after external research." External research now provides the pattern:
- **Detection heuristic**: path prefix `/Users/*/Library/CloudStorage/*` is reliable, O(1), and used by major tools.
- **Strategy**: route CloudStorage paths through a 5–10s polling loop; route everything else through `@parcel/watcher` with FSEvents.
- **Resource budget**: ~5–10 MB memory and ~5–10% sustained CPU for ten CloudStorage folders of ~100 files each at 5s polling. Acceptable.
- **Always provide a "Refresh" affordance per root** for both watch and poll paths — it's the universal escape hatch.

**Recommendation update**: CloudStorage can be in v1 with the hybrid pattern, not deferred. The polling loop is straightforward and the detection is one regex. The thing that *should* stay deferred is auto-detection via `getattrlist` or mount-table analysis — prefix matching is sufficient for shipping.

### ER-03: UX validation — VS Code sibling model is canonical; pain points are well-mapped
**Source**: `external-research/multiroot-ux-patterns.md`

The original dossier recommended VS Code-style siblings. External research confirms that's the right baseline and surfaces five well-documented complaints to design around:

1. **Folder ordering at scale (>15 roots)** — VS Code has no alphabetical sort for roots; only drag-to-reorder which is non-discoverable. **Mitigation**: provide explicit Move Up/Move Down context menu items from day one (also better for accessibility); add an alphabetical sort option in the workspace settings. Even though our target is ~10 roots, the alphabetical option costs almost nothing.
2. **Terminal `cwd` ambiguity** — VS Code's #1 multi-root complaint (issues #142520, #147173, #256984). Terminal opens with first root's `cwd`; doesn't follow selected root. **Mitigation**: in our model, terminals should default to the currently-focused root's `cwd`, and the terminal tab title should display the root path. **Not v1 scope but flag for the spec.**
3. **Debug/task active-root ambiguity** — VS Code creates `launch.json` always in first root (issue #87237). **Not applicable to us** (no debug/tasks concept) but documents the *category* of failure: any "create something in *this* root" action needs an explicit root selector or visual indicator.
4. **Mixed local + remote roots** — Cursor feature request #146363. Workaround is sshfs mounts. **Note for our threat model**: if user adds a CloudStorage folder, treat the trust level exactly like sshfs — bytes come from a process the app doesn't control. Validate paths, don't trust filesystem metadata for safety decisions.
5. **Monorepo scale (50+ roots)** — explicitly out of scope for us (~10 roots), but the second-order asks (custom aliases, grouping, sort) are predictable.

**Recommendation updates from UX research**:
- **Custom aliases** — VS Code stores aliases per-folder in `.code-workspace`. Worth including in `ExtraFolder` type from v1: `{ path, label, alias?, emoji? }` where `alias` is the display name and `label` is a description. This is a 5-minute addition to the contract and saves a future migration.
- **Type indicators** — `[Git]`, `[Cloud]`, `[Local]` icon/badge per root. Cheap to add, materially helps users orient. Detected: git via `_platform/git` repo-info per root (already shipped FX007); cloud via the prefix heuristic; local is the default.
- **Explicit Move Up/Down + drag-to-reorder as secondary** — accessibility and discoverability. Three lines of UI code.
- **Removal**: instant + undo toast (the dossier already recommended this; external research confirms).

### ER-04: System-level pre-flight check at startup
**Source**: `external-research/watcher-scaling.md`

Both macOS (default `ulimit -n` of 256) and Linux (default `fs.inotify.max_user_watches` of 8,192) ship with conservative limits that watching even one large worktree can blow past. The watcher service should query these at boot and **warn the user** in the dev console (and ideally in a UI banner) if limits are low. Concrete check:
- macOS: `ulimit -n` ≥ 10,000 → ok; below → warn.
- Linux: `fs.inotify.max_user_watches` ≥ 500,000 → ok; below → warn with the `sysctl` line they need.

This is a 30-line addition to the watcher service. Catches a class of "it works on my machine" mysteries.

### Updated Architectural Decisions (delta from § Architectural Decisions to Make)

Item 4 (CloudStorage strategy) is **updated**: ship with hybrid `@parcel/watcher` + 5–10s polling for CloudStorage paths in v1, with prefix-based detection. Do **not** wait for Phase 2. The pattern is well-established.

New item 9: **Library choice for watching**. Replace `fs.watch` in `CentralWatcherService` with `@parcel/watcher`. This is a Phase 1 substrate change *before* the multi-root feature itself.

New item 10: **Type indicators per root**. Compute `kind: 'git' | 'cloud' | 'local'` at add time (git via FX007's `repo-info`, cloud via prefix). Store on `ExtraFolder` and display in UI.

New item 11: **Custom aliases**. Extend `ExtraFolder` to `{ path, label, alias?, emoji?, kind }`. `alias` is display-time only; falls back to folder basename when unset.

### Updated Complexity Estimate

Original: CS-3 to CS-4. **Revised: CS-4** is now the right call regardless of whether the harden pass is in scope, because of the `@parcel/watcher` substrate swap. The migration itself is moderate (replace `fs.watch` with `watcher.subscribe`, update event shape) but it touches a singleton server-side service and needs careful validation. Bundle it with the harden pass and the multi-root feature as a coherent Phase 1.

### Updated Phase Order Recommendation

1. **Phase 1: Watcher substrate swap.** Replace raw `fs.watch` in `CentralWatcherService` with `@parcel/watcher`. Add startup pre-flight check for `ulimit` / `inotify` limits. Acceptance: existing single-root behavior unchanged; warning emitted on undersized limits.
2. **Phase 2: Path-validation harden pass.** As originally specced.
3. **Phase 3: Workspace contract extension.** `ExtraFolder { path, label, alias?, emoji?, kind }` + `extraFolders[]` field. `addExtraFolder` / `removeExtraFolder` service methods. Mutation events.
4. **Phase 4: Watcher lifecycle for extra roots, including CloudStorage polling.** Hybrid strategy: prefix-detect CloudStorage and route to a 5–10s polling loop; everything else through `@parcel/watcher`.
5. **Phase 5: Multi-root tree rendering.** `Map<rootPath, ...>` state shape, namespaced React keys, N `<FileTree>` instances.
6. **Phase 6: Add-folder UI + settings page.** `+` button, modal, settings-page accordion.
7. **Phase 7: Per-root repo-info + type indicators.** Lazy-fetch `repo-info` on first expand; render type badges.
8. **Phase 8: Removal UX, sort, alias edit, drag reorder.** Polish.

---

## Next Steps

External research is **complete and incorporated**. The dossier is now ready to drive specification.

1. Run `/plan-1b-v2-specify "Multi-folder file browser tree — extraFolders[] in WorkspacePreferences; @parcel/watcher substrate swap; harden path validation; hybrid CloudStorage polling. Render N roots as siblings with type indicators and custom aliases."`
2. The spec should call out:
   - The 8-phase order above
   - The 11 architectural decisions (8 original + 3 from external research)
   - The 3 critical findings from § Critical Findings as explicit risks
   - The 5 user complaints from ER-03 as design constraints (especially the terminal-cwd one if/when terminals are added later)

---

**Research Complete**: 2026-05-10T22:02:06Z
**External Research Complete**: 2026-05-10T22:02:06Z (3 Perplexity Deep Research calls)
**Report Location**: `/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/084-random-enhancements-3/multi-folder-tree-research.md`
**External Research Folder**: `/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/084-random-enhancements-3/external-research/`
