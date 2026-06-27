# Flight Plan: Env-Forced File-Watch Polling Fallback

**Spec**: [watch-polling-fallback-spec.md](./watch-polling-fallback-spec.md)
**Plan**: [watch-polling-fallback-plan.md](./watch-polling-fallback-plan.md)
**Generated**: 2026-06-04
**Status**: Ready

---

## The Mission

**What we're building**: A polling-based file watcher that a single environment variable
(`CHAINGLASS_WATCH_POLLING=true`) switches on in place of the native `fs.watch`. It walks the
worktree on a fixed interval, reusing the existing ignore list, and emits the same change
events — so Chain Glass detects file changes even on WSL where the workspace lives on a
Windows mount and native inotify events never fire.

**Why it matters**: Unblocks the WSL-on-Windows-mount workflow (a real dead-zone today)
without changing behavior for anyone on a normal filesystem.

---

## Where We Are → Where We're Headed

```
TODAY:                                  AFTER this plan:
1 watcher impl (native fs.watch)        2 impls (native + polling), env-selected

🔵 IFileWatcher interface (same)        🔵 IFileWatcher interface (same)
🟡 usePolling flag (declared, dead)     🟢 usePolling honored + env-forced
❌ no polling engine                     🔴 PollingFileWatcherAdapter (NEW)
🔴 WSL/mount = silent dead-zone          🟢 WSL/mount = polling fallback works
```

---

## Scope

**Goals**:
- New `PollingFileWatcherAdapter` (same `IFileWatcher` event shape).
- `CHAINGLASS_WATCH_POLLING=true` forces it on across all watchers; `*_POLL_INTERVAL` tunes it.
- Reuse `SOURCE_WATCHER_IGNORED`; visible startup log; default (native) behavior unchanged.

**Non-Goals**:
- Auto-detection (`/proc/mounts`/WSL sniffing), adaptive interval, dir-mtime fast-path,
  reintroducing chokidar, per-worktree selection.

---

## Journey Map

```mermaid
flowchart LR
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef ready fill:#9E9E9E,stroke:#757575,color:#fff

    S[Specify]:::done --> P[Plan]:::done
    P --> B[Build]:::ready
    B --> R[Review]:::ready
    R --> M[Merge]:::ready
```

**Legend**: green = done | yellow = active | grey = not started

---

## Phases Overview

| Phase | Title | Tasks | CS | Status |
|-------|-------|-------|----|--------|
| 1 (Simple) | Polling adapter + selecting factory + env flag + docs + tests | 6 (T001–T006) | CS-3 | Pending |

---

## Acceptance Criteria

- [ ] Flag unset → native adapter, behavior unchanged (existing tests pass)
- [ ] Flag set → polling adapter for every watcher
- [ ] Polling emits add/change/unlink within the interval
- [ ] Ignored dirs (e.g. node_modules) are never walked
- [ ] `*_POLL_INTERVAL` overrides default; invalid value falls back cleanly
- [ ] Startup log line names each watched root + interval
- [ ] Env vars documented in `.env.example` + README

---

## Key Risks

| Risk | Mitigation |
|------|-----------|
| Poll cost on 9P | Reuse ignore list; ~1000ms default; (size,mtime) short-circuit; tunable |
| Event-shape drift breaks consumers | Emit identical normalized events; parity tests |
| Initial-scan storm | Honor `ignoreInitial`; seed baseline on first walk |

---

## Flight Log

_No phases completed yet._
