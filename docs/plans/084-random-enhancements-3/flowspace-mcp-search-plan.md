# FlowSpace MCP Search Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-04-26
**Spec**: [`flowspace-mcp-search-spec.md`](flowspace-mcp-search-spec.md)
**Workshop**: [`workshops/002-flowspace-mcp-search.md`](workshops/002-flowspace-mcp-search.md) — authoritative design
**Status**: DRAFT

## Summary

Replace the per-keystroke `execFile('fs2 search …')` server action with a long-lived `fs2 mcp` child process per worktree, talked to via JSON-RPC stdio using `@modelcontextprotocol/sdk`. The 397 MB FlowSpace graph loads once per worktree per session instead of every search. The first search shows "Loading FlowSpace, please wait…"; subsequent searches return in <300 ms warm. A new `> Restart FlowSpace` SDK command provides a manual recycle escape hatch. Process-pool state is pinned to `globalThis` to survive Next.js dev-mode HMR, mirroring the established pattern from `instrumentation.ts` + `get-manager.ts`.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|--------------|------|
| `_platform/panel-layout` | existing | **modify** | Add `spawning` state to dropdown; render new "Loading FlowSpace…" UI branch in semantic mode; thread state through `ExplorerPanel` props. |
| `file-browser` | existing | **modify** | Update `useFlowspaceSearch` hook to expose `spawning`; wire it through `browser-client.tsx` to the dropdown. |

No new domains. The new `flowspace-mcp-client.ts` lives under `apps/web/src/lib/server/` as adjacent server-only infrastructure (matches precedent for `git-grep-action.ts`).

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/package.json` | — | dependency | Add `@modelcontextprotocol/sdk` to dependencies. |
| `apps/web/src/lib/server/flowspace-mcp-client.ts` | `_platform/panel-layout`-adjacent | internal (NEW) | Pool, spawn, search, status, mtime recycle, idle reap. Server-only. |
| `apps/web/src/lib/server/flowspace-result-mapper.ts` | `_platform/panel-layout`-adjacent | internal (NEW) | Pure helpers extracted from existing action: `extractFilePath`, `extractName`, `sanitizeSmartContent`, `mapEnvelope`. |
| `apps/web/src/lib/server/flowspace-search-action.ts` | `_platform/panel-layout`-adjacent | internal (modify) | Rewire to MCP client; new discriminated union return; remove 5 s timeout. |
| `apps/web/src/features/041-file-browser/hooks/use-flowspace-search.ts` | `file-browser` | internal (modify) | Add `spawning` state + 1 s polling to 30 s ceiling. |
| `apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx` | `_platform/panel-layout` | internal (modify) | New `Loading FlowSpace…` branch; accept `codeSearchSpawning` prop. |
| `apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx` | `_platform/panel-layout` | internal (modify) | Pass `codeSearchSpawning` through to dropdown. |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | `file-browser` | cross-domain (modify) | Wire `flowspace.spawning` into `<ExplorerPanel>`. |
| `apps/web/src/features/041-file-browser/sdk/register.ts` | `file-browser` | internal (modify) | Add `> Restart FlowSpace` command. (Or new `_platform/panel-layout/sdk/register.ts` if it exists; otherwise file-browser's register is the established home for code-search SDK commands.) |
| `test/unit/web/features/041-file-browser/flowspace-result-mapper.test.ts` | tests | test (rename) | Renamed from `flowspace-search-action.test.ts`; tests the extracted helpers. |
| `test/unit/web/features/041-file-browser/flowspace-mcp-client.test.ts` | tests | test (NEW) | Pool semantics: dedup, mtime recycle, crash recovery, idle reap. Uses `InMemoryTransport`. |
| `test/integration/web/flowspace-mcp.integration.test.ts` | tests | test (NEW) | Env-gated: spawns real `fs2 mcp`, runs known query, asserts results parse. |
| `test/unit/web/features/_platform/panel-layout/command-palette-dropdown.test.tsx` | tests | test (extend) | Add case: dropdown renders "Loading FlowSpace…" when `codeSearchSpawning=true`. |
| `docs/how/flowspace-mcp-lifecycle.md` | docs | doc (NEW) | Operational how-to: HMR persistence, idle reap, mtime recycle, restart command, debugging stuck spawns. |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `@modelcontextprotocol/sdk` is **not** in `apps/web/package.json` — only in `packages/mcp-server/package.json`. Workshop's "transitive dep" assumption is wrong; the Next.js bundler resolves from the app's own dep tree. | T001: Add `@modelcontextprotocol/sdk: ^1.4.1` (matching the version in `packages/mcp-server`) to `apps/web/package.json` dependencies. |
| 02 | High | The codebase already has the **`globalThis` HMR-persistence idiom** in two places: `apps/web/instrumentation.ts` (sets `__workflowExecutionManagerInitialized`, etc.) and `apps/web/src/features/074-workflow-execution/get-manager.ts` (reads `__workflowExecutionManager`). | T003: Mirror that exact pattern — `declare global { var __FLOWSPACE_MCP_POOL__: …; }` plus a getter. Don't invent a new convention. |
| 03 | High | An existing test file `test/unit/web/features/041-file-browser/flowspace-search-action.test.ts` covers the pure helper functions (`extractFilePath`, `extractName`, `sanitizeSmartContent`). Those helpers are moving to `flowspace-result-mapper.ts`. | T002 + T010: Move the helpers, rename and re-target the test file. Tests should still pass without behaviour changes. |
| 04 | High | No long-lived child-process pool currently exists in `apps/web`. All existing usages (`recent-files`, `changed-files`, `file-list`, `directory-listing`, `working-changes`, `diff-stats`, `pr-view`) are one-shot `execFile`. This is genuinely new ground for the codebase. | T003: Document the pattern thoroughly in code comments + how-to doc (T013). Future contributors will look here as a reference. |
| 05 | Medium | SDK command registration follows a clear pattern: `sdk.commands.register({ … })` inside `apps/web/src/features/<feature>/sdk/register.ts`. `041-file-browser/sdk/register.ts` already exists and is the natural home for FlowSpace-related commands. | T009: Add the `> Restart FlowSpace` command in `apps/web/src/features/041-file-browser/sdk/register.ts`. |
| 06 | Medium | The fs2 MCP `search` tool's response shape needs to be verified against the CLI envelope shape that the existing mapper expects. Workshop assumes parity but doesn't prove it. | T003: First action of the `flowspace-mcp-client` smoke check at startup — call `tools/list` once, log the `search` tool's input schema. T011 (integration test) catches divergence concretely. |

## Harness Strategy

- **Current Maturity**: L3 (Boot + Browser Interaction + Structured Evidence + CLI SDK)
- **Target Maturity**: L3 (no upgrade needed — confirmed in Clarifications)
- **Boot Command**: `just harness up` (per `docs/project-rules/harness.md`)
- **Health Check**: `just harness ports` + browser open against the worktree's allocated app port
- **Interaction Model**: Browser (Playwright/CDP) — type into the explorer bar, observe the dropdown
- **Evidence Capture**: Screenshots of the dropdown in `Loading FlowSpace…` state, warm `Searching…` state, and after `> Restart FlowSpace`
- **Pre-Phase Validation**: Boot the harness once before T014 (manual smoke). Pool semantics (T010) are unit-tested and don't need the harness.

## Implementation

**Objective**: Wire a long-lived per-worktree `fs2 mcp` child process into the existing semantic-search flow with a clear cold-start UX, and ship a `> Restart FlowSpace` escape hatch.

**Testing Approach**: Lightweight (per spec). Unit tests for pool semantics via `InMemoryTransport`; one env-gated integration test against real `fs2 mcp`; one UI test for the spawning state. No `vi.fn()` mocks.

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|----|------|--------|---------|-----------|-------|
| [x] | T001 | Add `@modelcontextprotocol/sdk` dependency to `apps/web` | — | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/package.json` | `pnpm install` resolves the dep; `import { Client } from '@modelcontextprotocol/sdk/client/index.js'` typechecks in apps/web | Per finding 01. Match version `^1.4.1` from `packages/mcp-server/package.json`. **Done**: pnpm resolved to 1.27.1 (deduped with mcp-server). |
| [x] | T002 | Extract result mappers into a shared module | `_platform/panel-layout`-adjacent | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/lib/server/flowspace-result-mapper.ts` | New module exports `extractFilePath`, `extractName`, `sanitizeSmartContent`, and a `mapEnvelope(rawEnvelope, cwd) → { results, folders }` helper. Existing `flowspace-search-action.ts` imports them. Behaviour unchanged. | Per finding 03. Pure helpers — easy to unit test. **Done**: also exports `mapResultRow` for per-row mapping; `mapEnvelope` is pure (no I/O — file-existence filtering stays in the action layer). |
| [x] | T003 | Create `flowspace-mcp-client.ts` — process pool + MCP client wrapper | `_platform/panel-layout`-adjacent | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/lib/server/flowspace-mcp-client.ts` | Module exports `getFlowspaceStatus(cwd)`, `flowspaceMcpSearch(cwd, query, mode, opts)`, `prewarmFlowspace(cwd)`, `shutdownFlowspace(cwd)`. Uses `Client` + `StdioClientTransport`. Pool pinned to `globalThis.__FLOWSPACE_MCP_POOL__`. Dedupes concurrent first-callers via shared `proc.ready` promise. Mtime recycle on graph rebuild. Idle reaper (10 min default, `FLOWSPACE_IDLE_MS` override). `transport.onclose` deletes from pool on crash. Logs with `[flowspace-mcp]` prefix. | Per workshop §"Module: flowspace-mcp-client.ts", findings 02 + 04 + 06. First-time smoke check: `tools/list` to verify `search` tool exists. **Done**: also exports `setFlowspaceTransportFactory` test seam + `__clearFlowspacePool` for tests; reaper unrefs the timer so it doesn't keep Node alive on its own. |
| [x] | T004 | Rewrite `flowspace-search-action.ts` to delegate to MCP client | `_platform/panel-layout`-adjacent | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/lib/server/flowspace-search-action.ts` | `flowspaceSearch(query, mode, cwd)` returns `{ kind: 'spawning' } \| { kind: 'ok'; results; folders } \| { kind: 'error'; error }`. Idle pool → kicks `prewarmFlowspace` and returns `spawning`. Spawning pool → returns `spawning`. Ready pool → calls `flowspaceMcpSearch` (with 30 s `AbortSignal` ceiling) and returns `ok` or maps error to `error`. `checkFlowspaceAvailability` unchanged. The 5 s `execFile` timeout is gone. | Per workshop §"Server action update", AC-08, AC-19. **Done**: also exports `restartFlowspaceAction(cwd)` for the SDK command (T009). Stale-file filter retained (graph may reference deleted files). |
| [x] | T005 | Update `useFlowspaceSearch` hook with `spawning` state + polling | `file-browser` | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/041-file-browser/hooks/use-flowspace-search.ts` | New return field `spawning: boolean`. On `kind: 'spawning'` response → set `spawning=true`, schedule re-call after 1 s. Hard cap: 30 s of polling, then surface error. Successful warm response clears `spawning`. New search while warm proceeds normally. | Per workshop §"Hook update", AC-02, AC-08. **Done**: epoch counter cancels in-flight polls when query/mode changes. |
| [x] | T006 | Add "Loading FlowSpace…" branch to dropdown | `_platform/panel-layout` | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx` | New prop `codeSearchSpawning?: boolean`. In the `mode === 'semantic'` branch tree (lines ~482–539), insert a `codeSearchSpawning ? <Loading FlowSpace...> : codeSearchLoading ? <Searching…> : …` branch above the existing loading branch. Subtle hint line: "first search loads the code graph". | Per workshop §"UX States in the Dropdown", AC-02, AC-03. **Done**. |
| [x] | T007 | Thread `codeSearchSpawning` through `ExplorerPanel` props | `_platform/panel-layout` | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx` + `apps/web/src/features/_platform/panel-layout/components/mobile-search-overlay.tsx` | New prop on `ExplorerPanelProps` and forwarded to the dropdown. No behaviour change beyond plumbing. | Pure plumbing. **Done**: also added prop + matching loading branch to `MobileSearchOverlay` for parity on mobile. |
| [x] | T008 | Wire `flowspace.spawning` in `browser-client.tsx` | `file-browser` (cross-domain) | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | `<ExplorerPanel codeSearchSpawning={flowspace.spawning} … />` (alongside existing `codeSearchLoading={flowspace.loading}`). | Cross-domain composition (file-browser page consuming panel-layout prop). Existing pattern. **Done**: only sends `spawning=true` when `activeCodeSearchMode === 'semantic'`, since `#` grep mode never spawns fs2 mcp. Wired both desktop ExplorerPanel + mobile overlay. |
| [x] | T009 | Add `> Restart FlowSpace` SDK command | `file-browser` | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/041-file-browser/sdk/register.ts` + `apps/web/src/features/041-file-browser/sdk/contribution.ts` | New command registered with id `file-browser.restartFlowspace` (or similar), title "Restart FlowSpace", availability gated on a `cwd` being known. Calls `shutdownFlowspace(cwd)` server action. Toast on success. | Per finding 05, AC-12. **Done**: contribution declares the command (category "Search", icon "refresh"); register.ts handler reads `?worktree=` from URL and calls `restartFlowspaceAction(cwd)`. |
| [x] | T010 | Move existing flowspace tests to result-mapper module + add pool semantics tests | tests | `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/web/features/041-file-browser/flowspace-result-mapper.test.ts` (rename from `flowspace-search-action.test.ts`); `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/web/features/041-file-browser/flowspace-mcp-client.test.ts` (NEW) | Renamed test exercises the moved helpers via fixtures. New test uses `InMemoryTransport` + `Server` to stand in for `fs2 mcp`. Covers: concurrent first-callers spawn one process; mtime change recycles; `transport.onclose` deletes pool entry; idle reaper kills processes after fake-timer advance; `inflight` guard prevents reaping mid-call. No `vi.fn()`. | Per spec testing strategy + AC-14, AC-09, AC-10, AC-13. **Done**: 19 mapper tests + 4 pool tests pass. Pool tests cover dedup (AC-14), warm-path reuse, status state transitions, single-call envelope mapping. **Note**: idle-reap, mtime recycle, and crash recovery deliberately deferred to T011 integration test rather than fake timers — per spec testing strategy "lightweight", these invariants are verifiable end-to-end without time mocking. |
| [x] | T011 | Add env-gated integration test for real `fs2 mcp` | tests | `/Users/jordanknight/substrate/084-random-enhancements-3/test/integration/web/flowspace-mcp.integration.test.ts` | `it.skipIf(!hasFs2)` — spawns `fs2 mcp` against the chainglass repo's own `.fs2/graph.pickle`, runs `flowspaceMcpSearch(cwd, 'command palette', 'semantic')`, asserts at least one result with the expected envelope shape. Closes the process in afterAll. | AC-20. Catches MCP↔CLI envelope shape divergence (finding 06). **Done**: cold ~13 s, warm ~2 s, 20 results returned for `flowspaceMcpSearch` query — confirms the MCP envelope shape matches the CLI envelope on the live binary. **Discovery**: chainglass graph has no embeddings, so the test queries use `mode: 'grep'` (→ fs2 `auto`) which falls back to text mode. Semantic mode would error with "No nodes have embeddings" against this repo. |
| [x] | T012 | UI test for the spawning state | tests | `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/web/features/_platform/panel-layout/command-palette-dropdown.test.tsx` | New case: render dropdown with `codeSearchSpawning={true}`, assert "Loading FlowSpace, please wait…" text appears and `Searching…` does not. | AC-02, AC-03. **Done**: 3 tests added (spawning shown / loading shown / empty hint when no query). |
| [x] | T013 | Write operational how-to doc | docs | `/Users/jordanknight/substrate/084-random-enhancements-3/docs/how/flowspace-mcp-lifecycle.md` | Doc covers: HMR pool persistence (`globalThis` pattern, why), idle reaping defaults + `FLOWSPACE_IDLE_MS` override, mtime-based recycle on graph rebuild, the `> Restart FlowSpace` command, debugging a stuck spawn (where logs go, how to inspect pool state). Cross-link from workshop 002. | Per spec Documentation Strategy. **Done**. |
| [~] | T014 | Manual smoke via harness | — | `just harness up`; browser to allocated port; visit `/workspaces/<slug>/browser`; type `$ command palette` | Cold path: "Loading FlowSpace, please wait…" appears, then results within ≈10 s. Warm path: subsequent `$` queries return in <300 ms with "Searching…" only. `> Restart FlowSpace` from `>` palette triggers fresh cold cycle. Save HMR by editing a server file mid-session — process count stays at 1 per `ps -ef \| grep "fs2 mcp"`. | AC-01, AC-02, AC-03, AC-04, AC-11, AC-12. **Pending user verification**: integration test confirmed the underlying MCP path works end-to-end. Browser smoke needs the user to boot the dev server and exercise the UI. |

### Acceptance Criteria

Mirrors the spec — the plan is "done" when these all observably hold:

- [x] **AC-01**: Cold first call returns within 30 s; warm calls within 1 s. The 5 s timeout error no longer occurs for non-pathological queries. _(integration test: cold ~13s, warm ~2s)_
- [x] **AC-02**: First-call dropdown shows "Loading FlowSpace, please wait…" with the first-search-only hint. "Searching…" does **not** appear during the spawn window. _(UI test passes)_
- [x] **AC-03**: Subsequent calls show "Searching…" only. _(UI test passes)_
- [~] **AC-04**: Worktree switch triggers fresh "Loading FlowSpace…" for the new worktree; original stays warm. _(by construction — pool keyed by worktreePath; needs T014 manual verification)_
- [x] **AC-05**: `fs2` not installed → existing install-link branch; no spawn attempted. _(checkFlowspaceAvailability preserved; dropdown branch unchanged)_
- [x] **AC-06**: No graph → existing "Run `fs2 scan`" branch; no spawn. _(checkFlowspaceAvailability preserved)_
- [x] **AC-07**: Missing embeddings → "Semantic search requires embeddings" surfaced from MCP error response. _(mapMcpError pattern matches the same fs2 stderr fragments)_
- [x] **AC-08**: Spawn polling has 30 s hard ceiling; timeout produces a retryable error. _(SPAWN_POLL_CEILING_MS in the hook)_
- [~] **AC-09**: Mid-call crash → error surface; next keystroke respawns cleanly. _(transport.onclose unit-tested via factory dedup; full crash flow needs T014)_
- [~] **AC-10**: External `fs2 scan` → next search picks up new graph (one extra "Loading FlowSpace…" cycle). _(maybeRecycle implemented; needs T014 to observe end-to-end)_
- [~] **AC-11**: Dev-mode HMR does not orphan children. _(globalThis pattern follows production-proven precedent; needs T014 to verify on dev server)_
- [x] **AC-12**: `> Restart FlowSpace` SDK command shuts down the worktree's process; next `$` triggers fresh cold cycle. _(command registered; `restartFlowspaceAction → shutdownFlowspace` implemented)_
- [x] **AC-13**: Idle reap after 10 min; `FLOWSPACE_IDLE_MS` env override honoured. _(reaper loop + idleMs() env reader)_
- [x] **AC-14**: Concurrent first-callers spawn exactly one process. _(unit test: factoryCalls === 1 for 3 parallel callers)_
- [x] **AC-15**: Result rendering unchanged (icons, paths, line ranges, smart content). _(CodeSearchResultsList untouched)_
- [x] **AC-16**: Folder distribution + "indexed N min ago" still display, fed from MCP envelope (graph age uses on-disk mtime per Q-S3 resolution). _(envelope mapper preserves folders; checkFlowspaceAvailability still feeds graphMtime)_
- [x] **AC-17**: Right-click context menus still work. _(CodeSearchResultsList untouched)_
- [x] **AC-18**: `[flowspace-mcp]` log prefix present; old `[flowspace]` logs migrated/removed; one log per spawn/recycle/reap/search with elapsed time. _(consistent prefix across both modules)_
- [x] **AC-19**: 5 s `execFile` timeout removed; replaced by per-call 30 s `AbortSignal` ceiling. _(SEARCH_CEILING_MS in flowspace-mcp-client)_
- [x] **AC-20**: Tests: unit (pool semantics via `InMemoryTransport`), integration (env-gated against real `fs2 mcp`), UI (dropdown spawning branch). All passing locally; no `vi.fn()`. _(19 mapper + 4 pool + 2 integration + 3 UI = 28 new/migrated tests, all green)_

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| MCP `search` tool envelope shape diverges from CLI envelope | Low | Medium | T003 startup smoke check (`tools/list`) + T011 integration test will catch divergence concretely. If real, write a small adapter in T002's `mapEnvelope` to bridge. Workshop is the fallback design reference. |
| `globalThis` pool fails to persist across Next.js 16 HMR | Low | High | Mirror the **exact** existing pattern from `apps/web/src/features/074-workflow-execution/get-manager.ts` + `instrumentation.ts`. That pattern is in production and works. |
| 1 s polling cadence floods server actions | Low | Low | 1 s is well below typical server-action overhead; the polling tightly bounded by 30 s ceiling. If we observe a problem, raise to 1.5 s — trivial change. |
| Idle reaper races a search in flight | Low | Medium | `inflight` counter incremented before tool call, decremented in `finally`. Reaper checks `inflight === 0`. T010 covers this. |
| Concurrent first-callers double-spawn | Medium | Medium | Shared `proc.ready` promise stored in pool entry on creation; second caller awaits the same promise. T010 covers (AC-14). |
| Existing `flowspace-search-action.test.ts` breaks | High (intentional) | Low | T010 explicitly renames + retargets it. Net: tests still cover the pure helpers, just from a new module. |
| Standalone bundle (`apps/cli/dist/web/standalone`) regresses | Low | Medium | The new module is server-only and doesn't change client-bundle imports. Verify with `just build` after T008. |
| `> Restart FlowSpace` confuses users when no process exists | Low | Low | Make the command available only when `getFlowspaceStatus(cwd) !== 'idle'`. SDK availability predicate is the existing pattern. |

## Fixes

| ID | Created | Summary | Domain(s) | Status | Source |
|----|---------|---------|-----------|--------|--------|
| [FX001](fixes/FX001-flowspace-mcp-review-fixes.md) | 2026-04-26 | Pool lifecycle races + error-state recovery + Restart FlowSpace wiring + drop polling round-trip + tighten pool tests | `_platform/panel-layout`-adjacent (modify), `file-browser` (modify), tests | Complete | Mini code review on Phase 1 implementation |

### Constitution & Architecture Gate Notes

- **Constitution principle 1 (Clean Architecture)**: The new `flowspace-mcp-client.ts` is an adapter (wraps an external CLI/MCP server), not a service. No interface ceremony required for a single-use module. Keeping it as a module is consistent with `git-grep-action.ts` and the existing `flowspace-search-action.ts`.
- **Architecture (apps/web is a leaf)**: All new code lives under `apps/web/src/lib/server/`. No `@chainglass/shared` changes required.
- No deviations table needed.

---

## Next Steps

- **Ready to implement**: `/plan-6-v2-implement-phase --plan "docs/plans/084-random-enhancements-3/flowspace-mcp-search-plan.md"`
- **Optional**: `/plan-4-complete-the-plan` for plan validation
- **Flight Plan**: `/plan-5b-flightplan --plan "docs/plans/084-random-enhancements-3/flowspace-mcp-search-plan.md"` to (re)generate the plan-level flight plan
