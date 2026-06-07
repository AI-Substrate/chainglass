# Env-Forced File-Watch Polling Fallback (WSL/Windows-mount)

**Mode**: Simple
**Spec Version**: 1.0.0
**Created**: 2026-06-04
**Status**: Specifying

📚 Specification incorporates findings from [research-dossier.md](./research-dossier.md).

## Research Context

Chain Glass watches each worktree with Node's native `fs.watch({ recursive: true })`
(`packages/workflow/src/adapters/native-file-watcher.adapter.ts`), inotify-backed on Linux.
On **WSL2 with the workspace on a Windows mount** (`/mnt/c/...`, `drvfs`/9P), inotify events
do **not** cross the 9P boundary — the watcher registers, raises no error, and receives
**zero events** (a silent dead-zone). The UI goes stale on file changes.

Key facts the fix relies on (from the dossier):
- `FileWatcherOptions.usePolling` / `interval` are **declared but unwired** — the native
  adapter ignores them; there is no polling engine (chokidar, which had one, was removed in
  Plan 060). The env flag must therefore point at a **new** polling implementation.
- `IFileWatcher`/`IFileWatcherFactory` is a **clean, per-worktree seam** — swapping the
  implementation is localized to the factory; consumers see identical normalized events.
- `SOURCE_WATCHER_IGNORED` (`source-watcher.constants.ts`) is reusable and is the key lever
  that keeps a poll walk off `node_modules`/`.git`/`.next`.
- The native polling primitive that **does** work over 9P is `fs.watchFile` (stat polling),
  but it is per-file, so a recursive poller must walk the tree and stat entries itself.

## Summary

**WHAT**: Add a polling-based `IFileWatcher` implementation and let a single environment
variable force it on in place of native `fs.watch`.
**WHY**: Unblock the WSL-on-Windows-mount workflow where native filesystem events never
fire, without changing behavior for anyone else.

## Goals

- A new `PollingFileWatcherAdapter` that implements `IFileWatcher` and emits the same
  normalized `add` / `change` / `unlink` / `addDir` events as the native adapter.
- A single env flag (`CHAINGLASS_WATCH_POLLING=true`) that, when set, makes the watcher
  factory return the polling adapter instead of the native one — for **every** watcher it
  creates (data + source + registry).
- Optional `CHAINGLASS_WATCH_POLL_INTERVAL=<ms>` to tune the poll cadence (sane default).
- Reuse of `SOURCE_WATCHER_IGNORED` so polling never descends into heavy/ignored directories.
- A visible startup log line per watched root when polling is active, stating the interval.
- Default behavior (native `fs.watch`) **completely unchanged** when the flag is unset.

## Non-Goals

- **Auto-detection.** No `/proc/mounts` fstype probe, no WSL sniffing, no `auto` mode in this
  pass. The user explicitly wants env-forced only. (Deferred — see Open Questions.)
- **Adaptive / backoff interval.** v1 is a fixed interval; no burst-on-activity or idle-decay.
- **Directory-mtime fast-path optimization.** A straightforward recursive stat-walk is
  acceptable for v1 given the ignore list keeps the tree small.
- **Reintroducing chokidar.** The poller is built fresh to preserve Plan 060's FD win.
- **Per-worktree selection.** The flag is process-global; it flips all watchers at once.

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| File watching (workflow pkg — `023-central-watcher-notifications` / `060-native-file-watcher`) | existing (unregistered) | **modify** | Add a polling adapter + factory selection; this area lives in `packages/workflow` and is not a formally-registered `docs/domains/` domain |
| `_platform/file-ops` | existing | **consume** | Filesystem read/stat operations the poller relies on; no contract changes |

### Notes
- No NEW domains. No domain-map topology change. The change is internal to the workflow
  package's file-watcher adapters/interfaces; no cross-domain contract is altered.

## Testing Strategy

- **Approach**: Lightweight.
- **Rationale**: The feature is a contained, flag-gated addition. The only logic worth
  asserting is the poller's change-detection and event-shape parity; the rest is wiring.
- **Focus Areas**:
  - The poller's `(size, mtimeMs)` diff → correct `add` / `change` / `unlink` emission.
  - Ignore-list reuse: ignored directories are never stat-walked.
  - Factory selection: env flag (and `options.usePolling`) returns the polling adapter; unset
    returns the native adapter unchanged.
  - One integration test forcing polling: write/modify/delete a file in a temp dir, assert the
    corresponding event lands within the configured interval.
- **Excluded**: Adaptive-interval behavior, auto-detection, native-adapter behavior (untouched).
- **Mock Usage**: Avoid mocks — real temp-directory filesystem in integration tests; the
  existing `FakeFileWatcher` pattern for any unit-level needs (per Constitution Principle 4).

## Documentation Strategy

- **Location**: README + env example.
- **Rationale**: The env var is the entire user-facing surface; it must be discoverable.
  Add `CHAINGLASS_WATCH_POLLING` (+ `CHAINGLASS_WATCH_POLL_INTERVAL`) to `apps/web/.env.example`
  with a one-line comment explaining the WSL/Windows-mount use case, and a short note in the
  relevant README/dev doc.

## Complexity

- **Score**: CS-3 (medium) — sits at the CS-2/CS-3 boundary.
- **Breakdown**: S=1, I=1, D=1, N=0, F=1, T=1 (P=5).
- **Confidence**: 0.80
- **Assumptions**:
  - The recursive stat-walk over a normal source tree (with the ignore list applied) at a
    ~1000ms interval is acceptably cheap over 9P. (If a worktree is pathological, the ignore
    list + interval tuning are the mitigations.)
  - Downstream consumers depend only on the normalized `IFileWatcher` event shape, so the
    swap is invisible to them.
- **Dependencies**: Node `fs.promises` (`readdir`/`stat`), existing `SOURCE_WATCHER_IGNORED`,
  the `IFileWatcherFactory` DI registration.
- **Risks**: see Risks & Assumptions.
- **Phases**: Single phase (Simple mode).

## Acceptance Criteria

1. With `CHAINGLASS_WATCH_POLLING` unset, the watcher factory returns the native adapter and
   behavior is byte-for-byte unchanged (existing native-adapter tests still pass).
2. With `CHAINGLASS_WATCH_POLLING=true`, the factory returns `PollingFileWatcherAdapter` for
   every watcher it creates.
3. Under polling, creating a file in a watched tree emits `add`; modifying it emits `change`;
   deleting it emits `unlink` — each within the configured poll interval.
4. The poller does not stat-walk any directory excluded by `SOURCE_WATCHER_IGNORED`
   (e.g. a file created under `node_modules/` emits no event).
5. `CHAINGLASS_WATCH_POLL_INTERVAL=<ms>` overrides the default interval; an unset/invalid
   value falls back to the default without error.
6. When polling is active, a startup log line names each watched root and the interval in use.
7. `apps/web/.env.example` documents both env vars; the README/dev note explains the WSL case.

## Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Poll cost on 9P (stat storm) | Medium | Medium | Reuse `SOURCE_WATCHER_IGNORED`; default interval ~1000ms; `(size,mtime)` short-circuit; interval is tunable |
| Event-shape drift vs native adapter breaks downstream consumers | Low | High | Emit identical normalized events; cover parity in tests; reuse the same event names/semantics |
| Initial-scan event storm on startup (every file looks "new") | Medium | Low | Honor `ignoreInitial`: seed the baseline snapshot on first walk and emit nothing for pre-existing files |
| Atomic-rename writes missed | Low | Medium | `(size,mtime)` diff naturally re-detects the reappeared entry (per dossier PL-02) |

## Open Questions

- **Auto-detection (deferred, not this plan)**: a follow-up could make the flag default to
  `auto` via a `/proc/mounts` fstype check (`drvfs`/`9p`/`v9fs`/`cifs`/`nfs` → poll) + a WSL
  heuristic, so users on a mount get polling without setting anything. Out of scope here by
  explicit request.
- **Interval default value**: 1000ms is the proposed default; confirm during implementation if
  a different starting point is preferred.

## Workshop Opportunities

_None._ The mechanism is well-understood and fully grounded in existing seams (see dossier);
no design exploration is needed before architecture.

## Clarifications

### Session 2026-06-04

- **Workflow Mode**: Simple — contained, single-area, flag-gated additive change.
- **Testing Strategy**: Lightweight — focused unit test on the diff/event core + one
  forcing-polling integration test.
- **Mock Usage**: Avoid mocks — real temp-dir filesystem + existing `FakeFileWatcher`.
- **Documentation**: README + env example — document `CHAINGLASS_WATCH_POLLING` and
  `CHAINGLASS_WATCH_POLL_INTERVAL`, including the WSL/Windows-mount rationale.
- **Scope**: Env-forced only; **no auto-detection** and **no adaptive interval** in this pass
  (explicit user direction: "simplest version… force it on with env… super edge case").
