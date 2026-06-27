# Research Report: Env-forced file-watch polling fallback (WSL/Windows-mount)

**Generated**: 2026-06-04
**Research Query**: "Chain Glass on WSL with the workspace on a Windows filesystem mount — file-change-notify doesn't detect changes; we want a polling fallback. Simplest version: force it on with an env var, no auto-detection."
**Mode**: Pre-Plan (feeds `/plan-1b`)
**Location**: docs/plans/085-watch-polling-fallback/research-dossier.md
**FlowSpace**: Not used (standard tools + Explore subagent survey)
**Findings**: 12 (consolidated from prior in-conversation survey)

> This dossier is a write-up of research already performed live in the originating
> conversation (Explore-agent survey of the watcher subsystem + direct reads of the
> adapter and interface). It is recorded here for posterity so the spec/plan have a
> durable, referenceable source.

---

## Executive Summary

### What it does
Chain Glass watches each workspace/worktree for filesystem changes and turns them into
domain events (file-change notifications, workflow/state updates, work-unit catalog
updates) delivered to the web UI. The watcher is **Node's native `fs.watch({ recursive: true })`**
(migrated from chokidar in Plan 060 to eliminate file-descriptor exhaustion).

### The problem
On **WSL2 with the workspace on a Windows filesystem mount** (`/mnt/c/...`, the `drvfs`/9P
filesystem), `fs.watch` is **inotify-backed on Linux** and inotify events **do not propagate
across the 9P boundary** from the Windows host into the Linux guest. The watcher registers
successfully, throws no error, and simply **never receives events** — a silent dead-zone.

### The fix (scoped minimal)
Add a **polling-based `IFileWatcher` implementation** and let a **single env var force it on**
in place of the native adapter. No auto-detection in this pass. Default behavior unchanged.

### Key Insights
1. The `IFileWatcher` factory seam is **already clean and per-worktree** — switching the
   implementation is a localized change, not a refactor.
2. `FileWatcherOptions.usePolling` / `interval` are **already declared but unwired** — the
   type surface exists; there is no polling engine behind it (chokidar, which had one, was
   removed in Plan 060).
3. The existing **`SOURCE_WATCHER_IGNORED`** list is the single most important lever for
   making polling cheap — reusing it keeps the poll walk off `node_modules`/`.git`/`.next`.

### Quick Stats
- **Core watcher**: 1 adapter (`NativeFileWatcherAdapter`) behind 1 interface (`IFileWatcher`)
- **Watcher granularity**: one watcher per worktree (data + source), created via factory
- **External deps for watching**: none (Node built-in `fs.watch` / `fs.watchFile`)
- **Complexity**: Low–Medium (contained; the poller's correctness is the only real work)
- **Domains**: workflow / `023-central-watcher-notifications` (no formal domain registry entry needed)

---

## How It Currently Works

### Entry Points

| Entry Point | Type | Location | Purpose |
|---|---|---|---|
| `NativeFileWatcherFactory.create()` | Factory | `packages/workflow/src/adapters/native-file-watcher.adapter.ts:240` | Constructs the watcher used everywhere |
| DI registration | Wiring | `apps/web/src/lib/di-container.ts:592-595` | Binds `FILE_WATCHER_FACTORY` → `NativeFileWatcherFactory` |
| `CentralWatcherService` | Service | `packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts` | Creates one watcher per worktree (data + source) |
| Bootstrap | Startup | `apps/web/instrumentation.ts` → `start-central-notifications.ts` | Starts the central notification system on server boot (Node runtime only) |

### Core Execution Flow
1. Server boots → `instrumentation.ts` (Node runtime guard) → `startCentralNotifications()`.
2. `CentralWatcherService` creates, **per worktree**:
   - **data watchers** on `<worktree>/.chainglass/data` and `.../units` (small, high-value).
   - a **source watcher** on the worktree root (large), with `SOURCE_WATCHER_IGNORED`.
   - a **registry watcher** on the parent dir of `~/.config/chainglass/workspaces.json`
     (parent-dir watch survives the atomic-rename write pattern).
3. Each watcher is a `NativeFileWatcherAdapter` calling `watch(path, { recursive: true }, cb)`
   (`native-file-watcher.adapter.ts:80`). Raw `change`/`rename` events are normalized to
   `add` / `change` / `addDir` / `unlink` (`:80-101`, `:178-203`).
4. Adapter-level **write stabilization** debounces `change` events
   (`:158-175`, default 200–300ms); a downstream `FileChangeWatcherAdapter(300)` batches
   again with last-event-wins dedup.
5. Normalized events fan out to domain adapters (file-change, workflow, work-unit catalog).

### Why it fails on the mount
`fs.watch` on Linux = inotify. The Windows host filesystem is exposed to WSL2 over the
**9P protocol** (`drvfs`); there is **no inotify bridge** across it. So watches on `/mnt/c/...`
register but deliver **zero events**. No error is raised — the UI just goes stale.

Corollary: the **native polling primitive that DOES work** over 9P is `fs.watchFile()` (it
uses `stat()` polling, which traverses 9P fine) — but it is **per-file, not recursive**, so a
recursive poller must walk the tree and stat entries itself.

---

## Architecture & Design

### The seam to use
```
IFileWatcher (interface)  ── packages/workflow/src/interfaces/file-watcher.interface.ts
  ├─ NativeFileWatcherAdapter      (production, fs.watch)        ← today's only impl
  ├─ FakeFileWatcher               (tests)                       ── src/fakes/fake-file-watcher.ts
  └─ PollingFileWatcherAdapter     (NEW — this plan)             ← to add

IFileWatcherFactory.create(options) decides which concrete impl to return.
```
Because `CentralWatcherService` only ever talks to `IFileWatcher`/`IFileWatcherFactory`,
adding a polling impl + a selection rule in the factory is a **drop-in** change. Consumers,
event normalization, debounce layers, and ignore handling are all reusable as-is.

### Design patterns in play
- **Factory + interface (DI)** — `IFileWatcherFactory` injected via tsyringe (`di-container.ts:592`).
- **Adapter** — `NativeFileWatcherAdapter` wraps the raw `fs.watch` API behind `IFileWatcher`.
- **Fakes over mocks** (Constitution Principle 4) — `FakeFileWatcher` for unit tests.

---

## Dependencies & Integration

### What this depends on
| Dependency | Type | Purpose | Risk if changed |
|---|---|---|---|
| Node `fs.watch` / `fs.watchFile` | Built-in | Native events / polling | Low (stable API) |
| `SOURCE_WATCHER_IGNORED` | Internal const | Excludes heavy dirs from watching | Reused by the poller — keep in sync |
| tsyringe DI container | Internal | Injects the factory | Low |

### What depends on this
- `CentralWatcherService` (the only production consumer of the factory).
- Transitively: file-change events → UI live updates; workflow/state watching; work-unit catalog.
  All consume **normalized** `IFileWatcher` events, so they are insulated from the impl swap.

---

## Quality & Testing
- **Unit**: `FakeFileWatcher` (`simulateChange/Add/Unlink`) — the new poller can be unit-tested
  the same way (inject fake, or test the poller's diff logic directly).
- **Integration**: `test/integration/workflow/features/060/native-file-watcher.integration.test.ts`
  exercises the real native adapter. A sibling test forcing polling (write a file, assert an
  event within an interval) is the natural coverage for the new path.
- **Gap today**: no polling code path exists at all; `usePolling: true` is silently ignored.

### Known issues / tech debt relevant here
| Issue | Severity | Location | Impact |
|---|---|---|---|
| `usePolling`/`interval` declared but unwired | Medium | `file-watcher.interface.ts:57-66` vs adapter `:57-69` | Misleading API; flipping the flag does nothing |
| Recursive native watch needs Node ≥20 on Linux | Low | platform | Even off-mount Linux requires modern Node; irrelevant once polling is used |

---

## Modification Considerations

### ✅ Safe to modify
- **Add `PollingFileWatcherAdapter`** — new file, new class, no edits to the native path.
- **Factory selection** — add an `options.usePolling ?? envFlag` branch in `create()`.
- **Reuse `SOURCE_WATCHER_IGNORED`** — read-only consumption.

### ⚠️ Modify with caution
- **Event-shape parity** — the poller MUST emit the same normalized `add/change/unlink/addDir`
  events (and honor the debounce expectation) so downstream adapters don't notice the swap.
- **Poll cost on 9P** — every `stat()` is a cross-VM round trip. Honor the ignore list; prefer
  directory-mtime short-circuits where practical; pick a sane default interval (~1000ms).

### 🚫 Danger zones
- None. This is additive behind a flag; default (native) behavior is untouched.

### Extension points (designed for follow-up)
- **Auto-detection** (deferred): a `/proc/mounts` fstype check (`drvfs`/`9p`/`v9fs`/`cifs`/`nfs`
  → poll) + WSL heuristic, so the flag becomes `auto`. Out of scope for v1 per user.
- **Adaptive interval** (deferred): burst-on-activity / idle-decay. v1 is fixed-interval.

---

## Prior Learnings (From Previous Implementations)

### 📚 PL-01: Chokidar removed for FD exhaustion (Plan 060)
**Source**: `native-file-watcher.adapter.ts` header (Plan 060 migration note)
**Type**: decision
**What they found**: chokidar v5 used ~1 FD per file (~2,750 FDs per tree); native
`fs.watch({recursive:true})` uses ~1–2 FDs per tree (measured 667× reduction).
**Why it matters now**: chokidar's `usePolling` engine went away with it — so the polling
fallback must be **built fresh**, not re-enabled. Do **not** reintroduce chokidar just to
get polling; a small `fs.watchFile`/stat-walk poller avoids regressing the FD win.

### 📚 PL-02: Registry watched via parent directory (atomic rename)
**Source**: `central-watcher.service.ts:106-142`
**Type**: gotcha
**What they found**: single-file watchers go stale after an atomic-rename write; watching the
**parent directory** survives it.
**Why it matters now**: the poller should detect change by **(size, mtimeMs) diff**, which is
naturally robust to atomic-rename writes (the entry reappears with a new mtime).

### 📚 PL-03: macOS `writeFile` fires `rename` for modifies too
**Source**: `native-file-watcher.adapter.ts:186-195`
**Type**: unexpected-behavior
**Why it matters now**: a poller sidesteps this entirely — it derives event type from
stat presence/absence + mtime diff, not from OS event semantics. One less platform quirk.

### Prior Learnings Summary
| ID | Type | Source | Key insight | Action |
|---|---|---|---|---|
| PL-01 | decision | Plan 060 / adapter header | chokidar (and its polling) removed for FD win | Build a fresh small poller; don't re-add chokidar |
| PL-02 | gotcha | central-watcher.service | atomic-rename writes break single-file watches | Use (size,mtime) diff in the poller |
| PL-03 | unexpected | adapter:186 | OS event semantics differ per platform | Poller infers type from stat, avoiding the quirk |

---

## Domain Context
- Owning area: **workflow** package, feature `023-central-watcher-notifications` (the watcher
  service) + `060-native-file-watcher` (the adapter). No `docs/domains/` registry entry governs
  this; the change lives entirely within the workflow package's adapters/interfaces.
- **No domain action needed** — additive adapter behind an existing interface.

---

## Critical Discoveries

### 🚨 Critical Finding 01: `usePolling` is a dead flag
**Impact**: Critical (to scoping)
**Source**: `file-watcher.interface.ts:57-66` (declares `usePolling`/`interval`);
`native-file-watcher.adapter.ts:57-69` (constructor reads only `ignored`, `ignoreInitial`,
`awaitWriteFinish`) and `:80` (always `fs.watch`, no polling branch).
**What**: Setting `usePolling: true` today does **nothing**.
**Why it matters**: The "just add an env var" instinct is correct for the *trigger*, but the
env var must point at a **new polling implementation** — there is no engine behind the flag.
**Required action**: Build `PollingFileWatcherAdapter`; wire the flag in the factory.

### 🚨 Critical Finding 02: inotify is silently dead on `/mnt/c` (drvfs/9P)
**Impact**: Critical (root cause)
**Source**: platform behavior of WSL2 + drvfs; `fs.watch` Linux backend = inotify.
**What**: Watches register but deliver zero events; no error surfaces.
**Why it matters**: Detection can't rely on an error; the only signals are (a) an explicit
env flag (this plan) or (b) a later mount/WSL probe (deferred).
**Required action**: Ship the env-forced override now; defer auto-detection.

---

## Recommendations

### If implementing this (minimal v1)
1. New `PollingFileWatcherAdapter implements IFileWatcher` — recursive `readdir`+`stat` walk on
   a fixed interval (default ~1000ms), reusing `SOURCE_WATCHER_IGNORED`, emitting identical
   normalized events, change detection via `(size, mtimeMs)` tuple diff.
2. Env flag `CHAINGLASS_WATCH_POLLING=true` (+ optional `CHAINGLASS_WATCH_POLL_INTERVAL=<ms>`)
   consulted by `NativeFileWatcherFactory.create()` (or a thin composite factory) →
   returns the poller instead of the native adapter. `options.usePolling` wins if passed.
3. One startup log line per watched root stating polling is active + interval, so the edge
   case is visible.
4. Tests: unit (diff logic / fake), one integration test that forces polling and asserts an
   event lands within the interval.

### Explicitly deferred (not v1)
- Auto-detection via `/proc/mounts` fstype + WSL heuristics (the `auto` mode).
- Adaptive/backoff interval and directory-mtime fast-path optimization.

---

## External Research Opportunities
No external research gaps. The mechanism (inotify vs 9P, `fs.watchFile` polling semantics) is
well understood and the fix is fully grounded in this codebase's existing seams.

---

## Appendix: File Inventory

### Core files
| File | Purpose |
|---|---|
| `packages/workflow/src/interfaces/file-watcher.interface.ts` | `IFileWatcher`, `FileWatcherOptions` (has unwired `usePolling`/`interval`) |
| `packages/workflow/src/adapters/native-file-watcher.adapter.ts` | `NativeFileWatcherAdapter` + `NativeFileWatcherFactory` |
| `packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts` | Per-worktree watcher creation |
| `packages/workflow/src/features/023-central-watcher-notifications/source-watcher.constants.ts` | `SOURCE_WATCHER_IGNORED` |
| `apps/web/src/lib/di-container.ts` (≈592-595) | Factory DI registration |
| `apps/web/instrumentation.ts` / `.../start-central-notifications.ts` | Bootstrap |

### Test files
| File | Purpose |
|---|---|
| `test/integration/workflow/features/060/native-file-watcher.integration.test.ts` | Real native-adapter integration tests |
| `packages/workflow/src/fakes/fake-file-watcher.ts` | `FakeFileWatcher` + factory for unit tests |

## Next Steps
- Proceed to **/plan-1b** to specify the minimal env-forced polling fallback (expected Simple Mode).

---

**Research Complete**: 2026-06-04
**Report Location**: docs/plans/085-watch-polling-fallback/research-dossier.md
