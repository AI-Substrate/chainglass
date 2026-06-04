# Env-Forced File-Watch Polling Fallback Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-06-04
**Spec**: [watch-polling-fallback-spec.md](./watch-polling-fallback-spec.md)
**Workshop**: [001-polling-file-watcher-adapter.md](./workshops/001-polling-file-watcher-adapter.md) (authoritative design)
**Status**: READY

## Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | No `[NEEDS CLARIFICATION]` markers remain in spec |
| G2 | Constitution | PASS | Interface-first (implements `IFileWatcher`), fakes-over-mocks, shared-by-default (extract `compileIgnorePatterns`) all honored. Testing is Lightweight per spec choice with the diff core covered — acceptable for a CS-3 flag-gated addition |
| G3 | Architecture | PASS | New code is an infrastructure adapter in `packages/workflow`; depends only on Node `fs` + existing interface; no dependency-direction violation |
| G4 | ADR Compliance | PASS | ADR-0004 (DI container) respected — factory swapped via the container registration; no Accepted ADR contradicted |
| G5 | Structure | PASS | All required Simple-mode sections present |
| G6 | Testing Alignment | PASS | Lightweight: T006 provides unit (diff/factory) + one forcing-polling integration test; acceptance criteria are measurable |
| G7 | Domain Completeness | PASS | Both spec domains present; manifest covers every file; no NEW domains |

## Summary

On WSL with the workspace on a Windows mount (`/mnt/c/...`, drvfs/9P), Node's native
`fs.watch` (inotify) silently delivers no events, so Chain Glass goes blind to file changes.
This plan adds a polling-based `IFileWatcher` implementation that walks each watched root on a
fixed interval, diffs `(size, mtimeMs)` snapshots, and emits the **same** normalized events as
the native adapter. A single env var (`CHAINGLASS_WATCH_POLLING=true`) makes a thin selecting
factory return the poller in place of native; everything else — consumers, event shape, ignore
semantics — is unchanged. Design is fully specified in the workshop; this is largely a
transcription with one shared-helper refactor.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| File watching (workflow pkg — `060-native-file-watcher` / `023-central-watcher-notifications`) | existing (unregistered) | **modify** | Add polling adapter + selecting factory; extract a shared ignore-pattern helper |
| `_platform/file-ops` | existing | **consume** | Node `readdir`/`stat` filesystem reads; no contract changes |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `packages/workflow/src/adapters/polling-file-watcher.adapter.ts` | file-watching | internal | NEW — the poller (`PollingFileWatcherAdapter`) |
| `packages/workflow/src/adapters/ignore-patterns.ts` | file-watching | internal | NEW — shared `compileIgnorePatterns` used by both adapters |
| `packages/workflow/src/adapters/file-watcher.factory.ts` | file-watching | internal | NEW — selecting `FileWatcherFactory` (reads env, delegates) |
| `packages/workflow/src/adapters/index.ts` | file-watching | internal | MODIFY — export `FileWatcherFactory` alongside `NativeFileWatcherFactory` |
| `packages/workflow/src/adapters/native-file-watcher.adapter.ts` | file-watching | internal | MODIFY — import shared `compileIgnorePatterns` (no behavior change) |
| `apps/web/src/lib/di-container.ts` | file-watching | cross-domain | MODIFY — register `FileWatcherFactory` in place of `NativeFileWatcherFactory` (one line) |
| `apps/web/.env.example` | file-watching | internal | MODIFY — document `CHAINGLASS_WATCH_POLLING` + `CHAINGLASS_WATCH_POLL_INTERVAL` |
| `README.md` (or nearest dev/setup doc under `docs/how/`) | file-watching | internal | MODIFY — short note on the WSL/Windows-mount polling fallback |
| `test/unit/workflow/polling-file-watcher.test.ts` | file-watching | internal | NEW — unit tests for diff/event parity + factory selection (flat unit-test convention) |
| `test/integration/workflow/features/085/polling-file-watcher.integration.test.ts` | file-watching | internal | NEW — forcing-polling integration test on a real temp dir |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `usePolling`/`interval` are declared in `FileWatcherOptions` but the native adapter ignores them — no polling engine exists (chokidar removed in Plan 060) | Build `PollingFileWatcherAdapter` fresh; honor the flag in the new factory. Do NOT reintroduce chokidar (preserve Plan 060 FD win) |
| 02 | Critical | Event-shape parity is the whole game: native emits `unlink` for removed files **and** dirs (never `unlinkDir`); `add`/`addDir`/`change` otherwise | Poller's diff→event mapping must match exactly (workshop parity table). Cover parity in tests |
| 03 | High | Poll cost on 9P is the risk; the ignore list is the lever | Prune ignored dirs **before descending** (not just filter events); reuse `SOURCE_WATCHER_IGNORED`; default 1000ms; `(size,mtime)` short-circuit |
| 04 | High | Overlapping async scans on slow 9P could pile up | `scanning` guard: a tick is a no-op while a scan is in progress (self-throttles) |
| 05 | Medium | Production passes `ignoreInitial:true`; a naive first walk would emit an event storm | First walk seeds the baseline snapshot and emits nothing when `ignoreInitial` |
| 06 | Medium | `compileIgnorePatterns` currently lives inside the native adapter | Extract to shared `ignore-patterns.ts`; import from both adapters to prevent ignore-semantics drift |

## Implementation

**Objective**: Add an env-selected polling `IFileWatcher` with event parity to the native adapter, default behavior unchanged.
**Testing Approach**: Lightweight — focused unit tests on the diff/factory core + one integration test forcing polling on a real temp directory. Avoid mocks (real fs + existing fake patterns), per spec and Constitution Principle 4.

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | Extract `compileIgnorePatterns` **from `native-file-watcher.adapter.ts` (lines 222-231)** into a new shared `ignore-patterns.ts` module and re-point the native adapter at it (pure refactor, no behavior change) | file-watching | `/Users/jordanknight/substrate/084-random-enhancements-3/packages/workflow/src/adapters/ignore-patterns.ts`, `/Users/jordanknight/substrate/084-random-enhancements-3/packages/workflow/src/adapters/native-file-watcher.adapter.ts` | New `ignore-patterns.ts` exports the helper; native adapter imports it; the native-adapter integration test (`test/integration/workflow/features/060/native-file-watcher.integration.test.ts`) still passes | Finding 06 |
| [x] | T002 | Implement `PollingFileWatcherAdapter` per the workshop: per-root snapshot, recursive `readdir`+`stat` walk (prune-before-descend, no symlink follow), `(size,mtimeMs)` diff → `add`/`change`/`addDir`/`unlink`, `scanning` guard, `ignoreInitial` baseline, `awaitWriteFinish` debounce, startup log line | file-watching | `/Users/jordanknight/substrate/084-random-enhancements-3/packages/workflow/src/adapters/polling-file-watcher.adapter.ts` | Class implements `IFileWatcher`; emits events matching the workshop parity table; honors `ignored`/`ignoreInitial`/`interval`/`persistent` | Findings 02,03,04,05; workshop skeleton |
| [x] | T003 | Implement selecting `FileWatcherFactory`: reads `CHAINGLASS_WATCH_POLLING` and `CHAINGLASS_WATCH_POLL_INTERVAL` once at construction; `create()` returns polling adapter when `options.usePolling ?? forcePolling`, else native; invalid interval → 1000ms default. **Export `FileWatcherFactory` from `packages/workflow/src/adapters/index.ts`** (next to the existing `NativeFileWatcherFactory` export) so it is importable for DI | file-watching | `/Users/jordanknight/substrate/084-random-enhancements-3/packages/workflow/src/adapters/file-watcher.factory.ts`, `/Users/jordanknight/substrate/084-random-enhancements-3/packages/workflow/src/adapters/index.ts` | `create()` returns the correct adapter per flag; `FileWatcherFactory` is exported; `NativeFileWatcherFactory` left untouched | Finding 01; FC: export gap |
| [x] | T004 | Swap DI registration from `NativeFileWatcherFactory` to `FileWatcherFactory` | file-watching | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/lib/di-container.ts` | `FILE_WATCHER_FACTORY` resolves to `FileWatcherFactory`; app boots; flag unset → native behavior unchanged | ADR-0004 DI pattern |
| [x] | T005 | Document the env vars in `.env.example` (commented, with WSL rationale) + a short note in the nearest dev/setup doc | file-watching | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/.env.example`, `/Users/jordanknight/substrate/084-random-enhancements-3/README.md` | Both `CHAINGLASS_WATCH_POLLING` and `CHAINGLASS_WATCH_POLL_INTERVAL` documented with the WSL/Windows-mount use case | Spec Documentation Strategy |
| [x] | T006 | Tests: unit for diff→event parity + factory selection (incl. bad-interval fallback); one integration test forcing polling on a real temp dir asserting `add`/`change`/`unlink`/`addDir` within the interval and that `node_modules` is never walked; **plus a consumer check — run the CentralWatcherService integration test(s) under feature 023 with `CHAINGLASS_WATCH_POLLING=true` to confirm downstream event consumers behave under polling** | file-watching | `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/workflow/polling-file-watcher.test.ts`, `/Users/jordanknight/substrate/084-random-enhancements-3/test/integration/workflow/features/085/polling-file-watcher.integration.test.ts` | All workshop test scenarios (T-add…T-factory-badint) pass; CentralWatcherService integration green with the flag set; no mocks | Workshop test table; FC: consumer ripple |

### Acceptance Criteria

- [x] AC1 — Flag unset → factory returns `NativeFileWatcherAdapter`; behavior unchanged (the native-adapter integration test `test/integration/workflow/features/060/native-file-watcher.integration.test.ts` and the CentralWatcherService integration tests still pass).
- [x] AC2 — `CHAINGLASS_WATCH_POLLING=true` → factory returns `PollingFileWatcherAdapter` for every watcher.
- [x] AC3 — Under polling: create→`add`, modify→`change`, delete→`unlink`, each within the configured interval.
- [x] AC4 — A file created under an ignored dir (e.g. `node_modules/`) emits no event and the dir is not walked.
- [x] AC5 — `CHAINGLASS_WATCH_POLL_INTERVAL` overrides the default; invalid/unset falls back to 1000ms without error.
- [x] AC6 — When polling is active, a startup log line names each watched root and the interval.
- [x] AC7 — `apps/web/.env.example` documents both env vars; a dev note explains the WSL case.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Poll cost on 9P (stat storm) | Medium | Medium | Reuse `SOURCE_WATCHER_IGNORED` (prune-before-descend); 1000ms default; `(size,mtime)` short-circuit; `scanning` guard; tunable interval |
| Event-shape drift breaks downstream consumers | Low | High | Match workshop parity table exactly (esp. `unlink` for dirs, no `unlinkDir`); parity unit tests |
| Initial-scan event storm | Medium | Low | Honor `ignoreInitial`: seed baseline, emit nothing on first walk |
| Sub-interval churn invisible (create+delete within one tick) | Low | Low | Documented inherent polling limitation; acceptable for this edge-case modality |

---

## Validation Record (2026-06-04)

### Validation Thesis

**Raison d'être**: Give `/plan-6` a transcribe-ready blueprint to add an env-forced polling file-watcher that unblocks WSL-on-Windows-mount (where native `fs.watch`/inotify silently delivers no events on `/mnt/c` drvfs/9P) without changing default behavior.

**Value claim**: The build phase needs zero new design decisions — the design is locked in workshop 001; the plan just maps it to real files.

**Artifact promise**: T001–T006 map to real files; acceptance criteria are testable; native event parity preserved.

**Intended beneficiaries**: `/plan-6` implementer (primary); `/plan-7` reviewer; future maintainers on WSL.

**Proof target**: Implementation

**Evidence standard**: Task file targets match real source; acceptance criteria measurable; parity contract from workshop preserved.

**Thesis source**: watch-polling-fallback-spec.md + workshops/001-polling-file-watcher-adapter.md

**Thesis verdict**: Advanced

**Main thesis risk**: AC1's "byte-for-byte unchanged" proof rests on the native-adapter *integration* coverage (no isolated unit suite) — now pinned to the real `features/060` integration test.

| Agent | Lenses Covered | Thesis Axes Covered | Issues | Verdict |
|-------|---------------|---------------------|--------|---------|
| Coherence/Completeness/Thesis | Coherence, Completeness, Evidence Sufficiency, Proof-Level Fit, CS-challenge, Thesis Alignment | Thesis Alignment, Implementation Readiness, Evidence Sufficiency | 1 HIGH + 4 MED fixed/clarified | ✅ |
| Source-Truth/Risk/Forward-Compat | Source Truth, Integration & Ripple, Domain Boundaries, Deployment/Ops, Technical Constraints, Forward-Compatibility | Downstream Usefulness, Contract Integrity, Safety to Change | 0 structural; 1 MED (export gap) fixed | ✅ |

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| `/plan-6` DI swap | `di-container.ts:593-595` registers `NativeFileWatcherFactory` (one-line swap target) | contract drift | ✅ | Verified at di-container.ts:593-595 |
| CentralWatcherService (production) | Consumes `IFileWatcherFactory` via DI; swap transparent | lifecycle ownership | ✅ | central-watcher.service.ts:41,73 — interface-only dependency |
| Plan-060/023 integration tests | Construct `NativeFileWatcherFactory` directly, bypass DI | test boundary | ✅ | Tests unaffected by container swap |
| Package exports | New `FileWatcherFactory` must be exported from `adapters/index.ts` | shape mismatch | ✅ FIXED | Added to T003 + Domain Manifest |

**Thesis alignment**: Value claim advanced at the Implementation proof level; the design is locked and source-verified, with the only residual risk being that AC1's no-regression proof is integration-level (now pinned to the real `features/060` test).

**Outcome alignment**: The plan, as written, directly advances the VPO Outcome — "detect file changes even on WSL where the workspace lives on a Windows mount and native inotify events never fire" — by introducing a polling fallback honoring `usePolling` via a selecting factory, with default behavior unchanged and full parity to the native adapter's event semantics (including the verified `unlink`-for-directories behavior); task targets are transcription-ready with no surprises awaiting implementation.

**Standalone?**: No — downstream `/plan-6` build phase consumes this plan.

Overall: VALIDATED WITH FIXES
