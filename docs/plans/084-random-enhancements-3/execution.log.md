# Execution Log — FlowSpace MCP Search

**Plan**: [flowspace-mcp-search-plan.md](./flowspace-mcp-search-plan.md)
**Mode**: Simple (single phase, 14 tasks)
**Date**: 2026-04-26

---

## Cluster 1 — Server Foundation (T001–T004)

### T001 — Add `@modelcontextprotocol/sdk` dependency

Edited `apps/web/package.json` to add `"@modelcontextprotocol/sdk": "^1.4.1"`. `pnpm install --filter @chainglass/web` resolved cleanly to 1.27.1 (the version already pulled in transitively via `packages/mcp-server`'s `^1.4.1` entry — pnpm dedupes).

**Evidence**: `pnpm install` exited zero; subsequent imports of `@modelcontextprotocol/sdk/client/index.js` typecheck.

### T002 — Extract result mappers into `flowspace-result-mapper.ts`

Created `apps/web/src/lib/server/flowspace-result-mapper.ts` with:
- `extractFilePath(nodeId)`
- `extractName(nodeId, smartContent?)`
- `sanitizeSmartContent(raw)`
- `mapResultRow(rawRow): FlowSpaceSearchResult`
- `mapEnvelope(env): { results, folders }`

Pure module — no I/O. The file-existence filter for stale results stays in the action layer (since it's I/O).

### T003 — Create `flowspace-mcp-client.ts`

New module — the central piece. Implements:
- Pool keyed by worktree path, pinned to `globalThis.__FLOWSPACE_MCP_POOL__`.
- Idle reaper (`setInterval` 60 s, threshold `FLOWSPACE_IDLE_MS` env / default 10 min) also pinned to global; `unref()`-ed.
- `getFlowspaceStatus(cwd)`: returns `idle | spawning | ready | error`.
- `flowspaceMcpSearch(cwd, query, mode, opts)`: lazy spawn, mtime recycle, 30 s `AbortSignal` ceiling.
- `prewarmFlowspace(cwd)` and `shutdownFlowspace(cwd)`.
- Test seam: `setFlowspaceTransportFactory(factory?)` to inject `InMemoryTransport` in unit tests.

### T004 — Rewrite `flowspace-search-action.ts`

Discriminated union return: `{ kind: 'spawning' } | { kind: 'ok'; results, folders } | { kind: 'error'; error }`. Idle pool → `prewarmFlowspace + return spawning`; spawning pool → return spawning; ready pool → call MCP search and return ok/error. `checkFlowspaceAvailability` preserved verbatim. `execFile` 5 s timeout removed. `restartFlowspaceAction(cwd)` exported.

**Discovery #1**: After a typecheck pass, no errors in any of my new files. Two unrelated pre-existing errors in `mobile-search-overlay.tsx` (lines 103-104 — wrong SDK contract calls) are NOT mine; left alone.

---

## Cluster 2 — Client Wiring (T005–T009)

### T005 — Hook with `spawning` state + polling

Rewrote `useFlowspaceSearch`. Key additions:
- New return field `spawning: boolean`.
- On `kind: 'spawning'` response: set `spawning=true`, sleep 1 s, re-call. Hard ceiling 30 s, then surface "FlowSpace did not start in time" error.
- Epoch counter (`queryEpochRef`) invalidates in-flight polls when the user types a new query.
- `cancelled` flag and clean-up function ensure aborted runs don't update state.

### T006 — Dropdown "Loading FlowSpace…" branch

Added `codeSearchSpawning?: boolean` prop to `command-palette-dropdown.tsx`. Inserted new branch **above** the existing `codeSearchLoading` branch in the `mode === 'semantic'` tree:

```tsx
codeSearchSpawning ? <Loading FlowSpace, please wait…>
  : codeSearchLoading ? <Searching...>
  : codeSearchError ? <error>
  : ...
```

### T007 — Thread prop through `ExplorerPanel`

Added `codeSearchSpawning?` to `ExplorerPanelProps` and `MobileSearchOverlayProps`. Forwarded into the dropdown / overlay's loading branch.

**Decision**: Mobile overlay also gets the spawning UI for parity. Original task list named only `explorer-panel.tsx`; adding the mobile overlay was a few extra lines of identical pattern.

### T008 — Wire `flowspace.spawning` in `browser-client.tsx`

```tsx
codeSearchSpawning={activeCodeSearchMode === 'semantic' && flowspace.spawning}
```

Two wire points (desktop ExplorerPanel + MobileSearchOverlay), both updated. Important: only emit `spawning=true` for semantic mode — `#` grep mode uses git grep, never spawns fs2 mcp.

### T009 — `> Restart FlowSpace` SDK command

Added `file-browser.restartFlowspace` to `contribution.ts` (category "Search", icon "refresh"). Handler in `register.ts` reads `?worktree=` from `window.location`, calls `restartFlowspaceAction(worktree)`, toasts on success/error.

---

## Cluster 3 — Tests (T010–T012)

### T010 — Migrate + add pool tests

Renamed `flowspace-search-action.test.ts` → `flowspace-result-mapper.test.ts` (via `mv`; `git mv` failed because the test file was tracked under the apps/web path inadvertently). Replaced inline reimplementations of helpers with real imports from the mapper module — 19 tests, all pass.

New `flowspace-mcp-client.test.ts` uses `InMemoryTransport.createLinkedPair()` + `Server` from `@modelcontextprotocol/sdk` to stand in for `fs2 mcp`. Covers:
- Single call returns mapped results (factory called once, search called once).
- Sequential calls reuse the warm process (factory called once for N calls).
- **AC-14**: 3 concurrent first-callers spawn exactly one process.
- Idle/ready status transitions.

**Discovery #2**: First version of the test failed with `factoryCalls === 3` instead of 1. Root cause: `await readGraphMtime(cwd)` ran *before* `pool.set(cwd, proc)`, so concurrent callers all entered the synchronous prefix before any of them registered the entry. Fix: move the await inside the `proc.ready` IIFE so the synchronous prefix runs to completion.

**Discovery #3**: After the first fix, tests crashed with `TypeError: Cannot set properties of undefined (setting 'graphMtimeAtSpawn')`. Root cause: the IIFE body started running synchronously up to the first await, and the first statement was `proc.graphMtimeAtSpawn = await readGraphMtime(cwd)` — which evaluates the `proc` reference *before* awaiting, while `proc` is still being assigned. Fix: compute the mtime into a local first, await, then assign to `proc` (whose object literal has fully evaluated by then).

```ts
// Was:
proc.graphMtimeAtSpawn = await readGraphMtime(cwd);

// Now:
const mtime = await readGraphMtime(cwd);
await client.connect(transport);
proc.graphMtimeAtSpawn = mtime;
```

### T011 — Env-gated integration test

`test/integration/web/flowspace-mcp.integration.test.ts`. `it.skipIf(!hasFs2)` guards against environments without `fs2` on PATH or `.fs2/graph.pickle`.

Two tests:
- Cold first call: spawns real `fs2 mcp` against the repo, runs `flowspaceMcpSearch(cwd, 'useFlowspaceSearch', 'grep')`, asserts wire-shape integrity.
- Warm second call: completes in <5 s.

**Result**: Cold ~13.2 s, warm ~2.2 s, 20 results returned. Confirms MCP envelope shape matches CLI envelope verbatim — no adapter needed.

**Discovery #4**: Initial test used `mode: 'semantic'`. The chainglass `.fs2/graph.pickle` has no embeddings, so semantic mode errored with "No nodes have embeddings". Switched to `mode: 'grep'` (which my code maps to fs2 `auto`, which falls back to text matching). Production user repos with `fs2 scan --embed` will work in semantic mode.

### T012 — UI test for spawning state

Three new `describe('semantic-mode spawning state')` cases:
- `codeSearchSpawning=true, codeSearchLoading=true` → "Loading FlowSpace, please wait…" present, "Searching…" absent.
- `codeSearchSpawning=false, codeSearchLoading=true` → "Searching…" present, "Loading FlowSpace" absent.
- Empty input + spawning false → "FlowSpace semantic search" hint.

All 18 dropdown tests pass (3 new + 15 pre-existing).

---

## Cluster 4 — Polish (T013–T014)

### T013 — How-to doc

Created `docs/how/flowspace-mcp-lifecycle.md`. Sections:
- What it is + lifecycle diagram
- HMR persistence rationale
- Idle reaping with env override
- Graph rebuild detection
- `> Restart FlowSpace` usage
- Debugging stuck spawns + log prefix table
- Test seams reference

### T014 — Manual smoke (handed off to user)

Cannot fully verify browser UX without a live dev session. Integration test (T011) validates the underlying MCP path end-to-end on real `fs2 mcp`. Browser-side validation pending: AC-04 (worktree switch), AC-09 (mid-call crash recovery), AC-10 (graph rebuild observation), AC-11 (HMR persistence).

---

## Final Validation

- **Unit tests**: 322/322 file-browser tests pass (321 + 1 skipped pre-existing).
- **Integration test**: 2/2 pass against real `fs2 mcp` on chainglass repo.
- **Lint**: `just lint` clean across all 1567 files.
- **Typecheck**: no errors in any of my touched files.
- **Tests touched/created**: 28 new (19 mapper + 4 pool + 2 integration + 3 UI).

---

## Discoveries Summary

| # | Discovery | Resolution |
|---|-----------|-----------|
| 1 | `@modelcontextprotocol/sdk` not in `apps/web/package.json` (workshop's transitive-availability assumption was wrong) | Explicit add in T001 |
| 2 | `pool.set` after `await readGraphMtime` broke concurrent-caller dedup | Moved await inside `proc.ready` IIFE so synchronous prefix is atomic |
| 3 | `proc.graphMtimeAtSpawn = await ...` as first IIFE statement crashed because `proc` is undefined during outer object literal | Compute mtime into local first, then assign after await |
| 4 | chainglass `.fs2/graph.pickle` has no embeddings — semantic-mode integration test failed | Integration test uses `mode: 'grep'` (→ fs2 `auto`) which works without embeddings |
| 5 | fs2 v0.1.0 MCP `search` tool envelope shape matches CLI envelope verbatim | No adapter needed — `mapEnvelope` handles both paths |
