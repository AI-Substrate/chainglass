# Code Review: Env-Forced File-Watch Polling Fallback (Plan 085, Simple Mode)

**Plan**: /Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/085-watch-polling-fallback/watch-polling-fallback-plan.md
**Spec**: /Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/085-watch-polling-fallback/watch-polling-fallback-spec.md
**Phase**: Simple Mode (single phase, T001–T006 + companion/review FX)
**Date**: 2026-06-04
**Reviewer**: Automated (plan-7-v2) — 4 parallel lenses (implementation, domain/doctrine/reinvention, testing/evidence, live harness)
**Testing Approach**: Lightweight (real fs, no mocks)

## A) Verdict

**APPROVE WITH NOTES**

Zero HIGH/CRITICAL findings. The implementation faithfully transcribes the authoritative workshop with correct event parity, sound cost controls, and clean domain/doctrine compliance. Live harness validation passed (the production DI route serves HTTP 200, console + dev-server clean). The review surfaced several MEDIUM/LOW findings; **the high-value ones were fixed in commit `b72ad1ce`** (on top of the earlier companion fixes `5ca08674`/`38972ecf`).

**Key failure areas**: none blocking.
- **Implementation**: clean — minor lifecycle hardening applied (events-after-close guard).
- **Domain compliance**: clean (layer placement, interface-first, shared-by-default, no chokidar).
- **Reinvention**: none — legitimate net-new impl of the long-declared `usePolling` option.
- **Testing**: was 82% confidence; AC5/AC6/E5 gaps now closed → strong.
- **Doctrine**: clean — `console.log` → `console.warn` applied.

## B) Summary

Plan 085 adds a `PollingFileWatcherAdapter` plus a selecting `FileWatcherFactory` (env `CHAINGLASS_WATCH_POLLING`) that swaps in for native `fs.watch` on WSL/Windows mounts where inotify is silently dead, with full event parity and default behavior unchanged. All four review lenses agreed there are no HIGH issues. Domain compliance is clean (new infra adapters under `packages/workflow/src/adapters`, one-line DI swap, shared `compileIgnorePatterns` extraction). Anti-reinvention confirmed no duplication and no chokidar reintroduction. Testing was real-fs/no-mocks but had three genuine gaps (AC5 value never asserted, AC6 unasserted, E5 parity branch untested) — all now closed. The session's honest harness episode (src-aliased vitest masked a stale-dist export-resolution failure, caught + fixed + harness-verified) is well documented.

## C) Checklist

**Testing Approach: Lightweight**
- [x] Core validation tests present (diff→event parity, factory selection)
- [x] Critical paths covered (add/change/unlink/addDir, removed-dir⇒unlink, E5 reuse, ignoreInitial, debounce)
- [x] Consumer-ripple proven (real CentralWatcherService under polling)
- [x] Only in-scope files changed
- [x] Linters/type checks clean (`tsc` 0 errors, `biome` clean)
- [x] Domain compliance checks pass
- [x] Live runtime verified (harness-verify HTTP 200, clean)

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Resolution |
|----|----------|------------|----------|---------|------------|
| F001 | MEDIUM | polling-file-watcher.adapter.ts (add baseline) | resource/race | Baseline seeding not gated by `scanning` guard → N concurrent walks at startup on cold 9P | **Documented** as v1 limitation (inline NOTE + risk); re-architecting out of scope for this edge-case feature |
| F002 | MEDIUM | polling-file-watcher.adapter.ts (startup log) | logging/doctrine | `console.log` → stdout could corrupt MCP STDIO JSON-RPC; inconsistent with sibling adapters | **Fixed** `b72ad1ce` → `console.warn` (stderr) |
| F003 | MEDIUM | file-watcher.factory.ts:41 / test | testing | AC5 "falls back to 1000ms" asserted only as "doesn't throw", never the value | **Fixed** `b72ad1ce` → readonly `intervalMs` getter + value asserts (1000/250/explicit) |
| F004 | MEDIUM | polling-file-watcher.adapter.ts (diff isDir-flip) | testing/parity | E5 file↔dir reuse (only two-event branch) untested | **Fixed** `b72ad1ce` → E5 unit test (unlink then addDir, never change) |
| F005 | MEDIUM | polling-file-watcher.adapter.ts (startup log) | testing | AC6 startup log asserted by no test | **Fixed** `b72ad1ce` → console.warn capture test |
| F006 | LOW×3 | polling-file-watcher.adapter.ts emit()/unwatch() | lifecycle | Events (esp. debounced `change`) could fire after `close()` in inter-root await window | **Fixed** `b72ad1ce` → `closed` guard in `emit()` + `unwatch()` |
| F007 | LOW | polling-file-watcher.adapter.ts (symlinks) | parity | Edits to a symlink's *target* won't emit `change` (lstat of the link) | **Accepted** — cycle-safety is correct; no symlinks in the target trees |
| F008 | LOW | unit test timing | flakiness | Unit margin 4 ticks thinnest; fail-closed | **Fixed** `b72ad1ce` → SETTLE 320→400 (5 ticks) |
| F009 | LOW | test files | doctrine | 5-field Test Doc blocks absent | **Accepted** — matches local precedent (060/023) under Lightweight |
| F010 | LOW | plan AC1/T006 text | docs | Plan's literal "run 023 with env set" is unsatisfiable (023 hardcodes native factory) | **Documented** — substitution is sound; plan text annotated |

## E) Detailed Findings

### E.1) Implementation Quality
diff()→event mapping verified CORRECT and complete against the workshop parity table (add/addDir/change/unlink, removed-dir⇒unlink-never-unlinkDir, file↔dir reuse). walk() prune-before-descend, symlink cycle-safety, EACCES/ENOENT skip, vanished-mid-walk all correct. `scanning` guard is race-free for tick overlap (set synchronously before first await; ticks only diff seeded roots). The `watched`-set lifecycle fix is complete for the unwatch-during-pending-baseline case. Residual events-after-close gaps (F006) hardened with a one-line `closed` guard in `emit()`. F001 (concurrent baseline seeding) documented as a known v1 limit.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New files are infra adapters under `packages/workflow/src/adapters/` |
| Contract-only imports | ✅ | Poller imports only `node:fs/promises`, `node:path`, interface types, shared helper |
| Dependency direction | ✅ | No infrastructure→business; DI swap typed against `IFileWatcherFactory` |
| Domain.md updated | N/A | file-watching domain is unregistered (no `docs/domains/<slug>`); plan manifest used |
| Registry current | N/A | No domain registry entry for file-watching |
| No orphan files | ✅ | Every changed file in the Domain Manifest |
| Map nodes/edges | N/A | No domain map entry |
| No circular business deps | ✅ | — |
| Concepts documented | N/A | Unregistered domain |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| PollingFileWatcherAdapter | None (chokidar removed Plan 060; `usePolling` was a dead option) | file-watching | proceed — legitimate net-new |
| FileWatcherFactory (selecting) | None (sibling of NativeFileWatcherFactory) | file-watching | proceed |
| compileIgnorePatterns (shared) | Extracted from native adapter (not duplicated) | file-watching | reuse — correct |

### E.4) Testing & Evidence

**Coverage confidence**: was 82% → **strong** after F003/F004/F005 fixes.

| AC | Confidence (post-fix) | Evidence |
|----|------------|----------|
| AC1 | High | factory selection unit tests + features/060 (13) regression + harness-verify HTTP 200 |
| AC2 | High | unit + integration `instanceof PollingFileWatcherAdapter` via env-driven factory |
| AC3 | High | unit parity + integration lifecycle (add/change/unlink/addDir) |
| AC4 | High | integration: node_modules subtree emits nothing; visible sibling seen |
| AC5 | High (was 55%) | now asserts `intervalMs` = 1000 (bad/unset), 250 (valid), 77 (explicit) |
| AC6 | High (was 45%) | now asserts captured startup `console.warn` line names root + interval |
| AC7 | Adequate | `.env.example` + README doc presence (doc AC) |

### E.5) Doctrine Compliance
Clean. Interface-first, shared-by-default, fakes-over-mocks (zero `vi.mock`/`spyOn`/`fn`), ADR-0004 `useFactory` DI all honored. Sole doctrine nit (`console.log`) fixed → `console.warn`. Test Doc blocks omitted consistent with local 060/023 precedent (accepted).

### E.6) Harness Live Validation
- Agent harness status: **HEALTHY** (app:200, mcp, terminal, cdp all up).
- AC1 validated live: `just harness-verify "/workspaces/harness-test-workspace/browser"` and `"/"` → HTTP 200, console clean, dev-server clean. The earlier stale-dist `Export FileWatcherFactory doesn't exist` error is gone after the package rebuild; `dist/index.js` exports confirmed; `di-container.ts:595` wires the selecting factory.
- AC2/AC6 covered by the dedicated 085 suite + inspection; runtime polling-log confirmation deliberately SKIPPED (would need an env-changed container reboot, out of scope).

## F) Coverage Map

All 7 acceptance criteria map to verified evidence (see E.4). Overall coverage confidence: **strong** (post-fix).

## G) Commands Executed

```bash
git diff d31288ee^..HEAD -- packages/workflow/src apps/web/src apps/web/.env.example README.md 'test/**' > reviews/_computed.diff
pnpm exec tsc --noEmit                 # 0 errors
pnpm exec biome check ...              # clean
pnpm exec vitest run test/unit/workflow/polling-file-watcher.test.ts test/integration/workflow/features/{085,060,023}   # 45 passed
pnpm --filter @chainglass/workflow build
just harness health                    # ok (app/mcp/terminal/cdp up)
just harness-verify "/workspaces/harness-test-workspace/browser"   # PASS (HTTP 200)
```

## H) Handover Brief

**Review result**: APPROVE WITH NOTES (all actionable findings fixed; no blockers)

**Plan**: /Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/085-watch-polling-fallback/watch-polling-fallback-plan.md
**Spec**: /Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/085-watch-polling-fallback/watch-polling-fallback-spec.md
**Execution log**: /Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/085-watch-polling-fallback/execution.log.md
**Review file**: /Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/085-watch-polling-fallback/reviews/review.md

### Files Reviewed

| File | Status | Action |
|------|--------|--------|
| packages/workflow/src/adapters/polling-file-watcher.adapter.ts | NEW | hardened (F002/F006), documented (F001) |
| packages/workflow/src/adapters/file-watcher.factory.ts | NEW | clean |
| packages/workflow/src/adapters/ignore-patterns.ts | NEW | clean |
| packages/workflow/src/adapters/native-file-watcher.adapter.ts | MODIFIED | clean (refactor) |
| packages/workflow/src/adapters/index.ts, src/index.ts | MODIFIED | clean (barrel exports) |
| apps/web/src/lib/di-container.ts | MODIFIED | clean (DI swap) |
| test/unit/workflow/polling-file-watcher.test.ts | NEW | strengthened (AC5/AC6/E5) |
| test/integration/workflow/features/085/...integration.test.ts | NEW | clean (consumer ripple) |
| apps/web/.env.example, README.md | MODIFIED | clean |

### Required Fixes
None outstanding — all fixed (`b72ad1ce`, `5ca08674`, `38972ecf`) or accepted/documented.

### Next Step
Implementation complete and reviewed. Proceed to merge: `/plan-8-v2-merge --plan "docs/plans/085-watch-polling-fallback/watch-polling-fallback-plan.md"`.
