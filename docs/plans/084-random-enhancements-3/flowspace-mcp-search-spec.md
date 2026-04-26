# FlowSpace Search via Long-Lived MCP Client

**Mode**: Simple
**Plan Folder**: `docs/plans/084-random-enhancements-3/`
**Workshop**: [`workshops/002-flowspace-mcp-search.md`](workshops/002-flowspace-mcp-search.md) — authoritative design

📚 This specification incorporates findings from [`workshops/002-flowspace-mcp-search.md`](workshops/002-flowspace-mcp-search.md). Process pool architecture, sequence diagrams, TypeScript shapes, and edge cases are pre-resolved there.

ℹ️ Adjacent: [`docs/plans/051-flowspace-search/`](../051-flowspace-search/) — original CLI-based plan that this work supersedes operationally (the CLI subprocess approach times out under realistic loads).

## Research Context

The `$` semantic search prefix in the explorer bar is functionally broken in everyday use: every keystroke (post-debounce) spawns a fresh `fs2` process, which must re-deserialise a ~397 MB graph from `.fs2/graph.pickle` before answering. End-to-end cold cost is 3–15 s, well past the 5 s `execFile` timeout in `apps/web/src/lib/server/flowspace-search-action.ts:173`. Users see "Search timed out. Try a simpler query." regardless of query simplicity.

`fs2` ships an MCP server (`fs2 mcp`) that loads the graph once and stays alive. Workshop 002 designed a process-pool integration around it: per-worktree child process, JSON-RPC over stdio via `@modelcontextprotocol/sdk` (already a transitive dependency through `packages/mcp-server`), and a "Loading FlowSpace, please wait…" affordance for the one-time cold start.

## Summary

**WHAT**: Replace the per-keystroke `execFile('fs2 search …')` path with a long-lived `fs2 mcp` child process — one per worktree — that hosts the FlowSpace graph in RAM for the lifetime of the session. The first search a user runs after page load shows a clear "Loading FlowSpace, please wait…" state (the spawn + handshake + graph-load window). Every subsequent search hits the warm process and returns in under ~150 ms.

**WHY**: Today's `$` semantic search is unusable on the chainglass repo because the cold-start cost dominates every call. Moving to a long-lived process collapses that cost into a single one-time event per worktree per session. Users get back a working semantic search; the dropdown's `Searching…` spinner becomes truthful again.

## Goals

- `$ <query>` returns results reliably for queries that previously timed out, on a real-sized chainglass graph.
- The first search after page load shows "Loading FlowSpace, please wait…" rather than a generic "Searching…" — the user understands this is one-time.
- Subsequent searches in the same worktree complete in well under 1 s end-to-end (target: <300 ms p95 from keypress to results render, exclusive of debounce).
- Switching worktrees does not corrupt or cross-contaminate results — each worktree has its own isolated process.
- The integration survives Next.js dev-mode HMR without leaking child processes.
- Graph rebuilds (`fs2 scan` re-running) are picked up automatically — the next search after the rebuild uses the fresh graph.
- A user-visible "Restart FlowSpace" affordance exists for when the user wants to manually recycle the process (e.g., suspected staleness).

## Non-Goals

- Replacing or modifying the `#` git-grep content search. `#` continues to use `git grep` as designed by Plan 052. (Re-evaluate after this lands — see Open Question Q1.)
- Wrapping `fs2 tree` or `fs2 get_node` MCP tools — only `search` is in scope.
- Building or refreshing the FlowSpace graph from inside the app — users still run `fs2 scan` themselves.
- Cross-tab process sharing or status broadcasting (one Node server, one pool, one tab speaks for itself).
- Windows support is not in scope for this iteration; the rest of the app is macOS/Linux-first and so is this.
- Server-Sent Events / WebSocket plumbing for streaming spawn progress. Polling is sufficient.
- Caching results across queries inside the MCP client (the warm fs2 process is already the cache).

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|--------------|----------------------|
| `_platform/panel-layout` | existing | **modify** | Add `spawning` state to dropdown surface; render new "Loading FlowSpace…" UI branch in semantic mode; thread the new state through `ExplorerPanel` props. |
| `file-browser` | existing | **modify** | Update `useFlowspaceSearch` hook to expose `spawning`; wire it through `browser-client.tsx` to the dropdown. |

No new domains. The new `flowspace-mcp-client.ts` lives under `apps/web/src/lib/server/` — server-only adjacent infrastructure that the existing server action delegates to. It is not large enough to warrant its own domain charter; it sits as an implementation detail of the panel-layout search surface.

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=1, D=0, N=1, F=1, T=1
- **Confidence**: 0.78
- **Assumptions**:
  - `@modelcontextprotocol/sdk` is usable as a *client* in the Next.js server runtime (the package exposes `Client` + `StdioClientTransport` from `client/index.js` and `client/stdio.js` respectively — same dep we already pin server-side).
  - `fs2 mcp` exposes a `search` tool with arguments `{ pattern, mode, limit }` returning a JSON envelope identical (or trivially mappable) to the CLI's `fs2 search --mode <m>` output. Workshop 002 §"MCP Tool Contract" assumes this shape; verifying once during init is part of the implementation.
  - The Next.js Node runtime allows long-lived `child_process` handles to outlive a single request (it does — module-scope state is fine on the Node server, dev HMR is the only edge worth handling explicitly).
  - The chainglass graph fits in process RAM comfortably (it does today — ~400 MB).
  - Users typically work in one or two worktrees per session, not dozens — the process-per-worktree model is bounded in practice.
- **Dependencies**:
  - `fs2 mcp` (external CLI, already a prerequisite for the existing `$` flow).
  - `@modelcontextprotocol/sdk` v1.4.x (already pinned in `packages/mcp-server`; needs to be reachable from `apps/web`).
- **Risks**:
  - MCP search tool shape might diverge from CLI envelope shape (mitigated by a tiny mapper + a startup smoke check).
  - Concurrent first-callers must dedupe spawn or we get N children for one worktree (workshop covers this with a shared `proc.ready` promise; needs a unit test).
  - HMR child-process leaks (mitigated by `globalThis.__FLOWSPACE_MCP_POOL__` pattern).
  - Process crash mid-search must surface as an error and respawn cleanly on next call (test coverage required).
  - Idle reaping must not race a search in flight (use `inflight` counter + `lastUsedAt`).
- **Phases**:
  1. Server foundation — new `flowspace-mcp-client.ts` (pool, spawn, search, status, prewarm, shutdown, mtime recycle, idle reaper, HMR-safe pool); rewrite `flowspace-search-action.ts` to delegate; remove the 5 s timeout; share result-mapping helpers.
  2. Client plumbing — extend `useFlowspaceSearch` with `spawning`; thread the prop through `ExplorerPanel` and `browser-client.tsx`; render the new "Loading FlowSpace…" branch in `command-palette-dropdown.tsx`.
  3. Polish & tests — `> Restart FlowSpace` SDK command; unit tests for pool semantics (in-memory MCP transport); env-gated integration test against a real `fs2 mcp`; logging cleanup; remove dead `execFile`-only code paths.

## Acceptance Criteria

Numbered, observable, and tied directly to user-visible behaviour.

- **AC-01**: With `fs2` installed and `.fs2/graph.pickle` present, typing `$ command palette` in the explorer bar returns results within 30 s on the cold (first-of-session) call and within 1 s on warm calls. The 5 s "Search timed out" error no longer occurs for non-pathological queries.
- **AC-02**: While the first call's child process is spawning + handshaking + loading the graph, the dropdown shows the message "Loading FlowSpace, please wait…" with a spinner, plus a subtle hint that it's a first-search-only event. The generic "Searching…" message does **not** appear during this window.
- **AC-03**: After the first successful warm call, subsequent `$ <query>` calls in the same worktree show "Searching…" (the existing label), not "Loading FlowSpace…".
- **AC-04**: Switching to a different worktree (different `worktreePath`) and running `$ <query>` triggers a fresh "Loading FlowSpace…" state for that worktree. Returning to the original worktree returns to warm behaviour without re-spawning.
- **AC-05**: When `fs2` is not installed, the dropdown shows the existing "FlowSpace not installed" branch with the install link — no spawn is attempted, no error pollution from a failed `child_process.spawn`.
- **AC-06**: When `.fs2/graph.pickle` does not exist, the dropdown shows the existing "Run `fs2 scan` to index your codebase" branch — again, no spawn.
- **AC-07**: When semantic embeddings are missing, the dropdown surfaces the existing "Semantic search requires embeddings — run `fs2 scan --embed`" message, sourced from the MCP error response (mapping mirrors the CLI-stderr mapping).
- **AC-08**: The first call's polling loop has a hard ceiling of 30 s. If the spawn does not reach `ready` within that window, the dropdown shows an error ("FlowSpace did not start in time") and the next user keystroke is allowed to retry.
- **AC-09**: If the underlying child process crashes during a search, the dropdown surfaces an error message; the next user-typed query re-spawns the child cleanly. Stale references are not retained in the pool.
- **AC-10**: After `fs2 scan` rebuilds the graph in a worktree, the next `$ <query>` in the running app picks up the new graph automatically (process is recycled on detected mtime change). The user observes one extra "Loading FlowSpace…" cycle.
- **AC-11**: Editing a server file (Next.js dev mode HMR) does not orphan child processes. Running `ps` after several saves shows at most one `fs2 mcp` process per active worktree.
- **AC-12**: A new SDK command "Restart FlowSpace" is available in the `>` command palette. Executing it shuts down the current worktree's `fs2 mcp` process. The next `$ <query>` triggers a fresh "Loading FlowSpace…" cycle.
- **AC-13**: Idle worktree processes are reaped after 10 minutes of no search activity (configurable via `FLOWSPACE_IDLE_MS`). A search submitted to a reaped worktree triggers a fresh "Loading FlowSpace…" cycle.
- **AC-14**: Two near-simultaneous first searches in the same worktree spawn exactly one child process, not two. The second caller awaits the same readiness promise.
- **AC-15**: Result rendering — category icon, name, file path, line range, optional smart-content summary — is unchanged from today. Workshop 002 deliberately preserves the existing `CodeSearchResultsList` rendering.
- **AC-16**: The folder-distribution header (`src/ 8 · packages/ 3 · 🧠 semantic`) and "indexed N mins ago" graph-age display continue to work, fed from the same envelope shape, now sourced from the MCP response.
- **AC-17**: Right-click context menus (Copy Full Path / Copy Relative Path / Copy Content / Download) on results continue to work — purely a UI passthrough, must not regress.
- **AC-18**: Logging uses a `[flowspace-mcp]` prefix (mirroring the existing `[flowspace]` style) and emits one log line per spawn, per recycle, per reap, and per search (with elapsed time). Existing `[flowspace]` logs are removed or migrated.
- **AC-19**: The 5 s `execFile` timeout in the server action is removed. Per-call cancellation uses an `AbortSignal` ceiling of 30 s, distinct from the spawn-window 30 s ceiling in AC-08.
- **AC-20**: Tests:
  - Unit tests cover pool dedup, mtime recycle, crash recovery, and idle reaping using `InMemoryTransport` from the MCP SDK (no `vi.fn()`, per repo doctrine).
  - One env-gated integration test (skipped when `fs2` is not on PATH) spawns a real `fs2 mcp`, runs a known query, and asserts results parse.
  - One UI-level test confirms the dropdown renders the spawn message before the search message.

## Risks & Assumptions

| Risk | Impact | Mitigation |
|------|--------|------------|
| MCP `search` tool argument/response shape diverges from `fs2 search` CLI envelope | Result mapper breaks; users see broken results or errors | Verify once at startup with a smoke `tools/list` call; build a tiny mapper layer; if shapes diverge significantly, fall back to a single CLI-form `fs2 search` proxy via the MCP server's exec-style tool. Capture as workshop addendum if needed. |
| Concurrent first-callers double-spawn | Two children per worktree; wasted RAM | De-dupe via shared `proc.ready` promise (covered in workshop §"Module Interface"); unit test required (AC-14) |
| HMR orphans children | Process leak in dev | `globalThis.__FLOWSPACE_MCP_POOL__` survives reloads (covered in workshop §"Why globalThis"); also register `process.on('exit', closeAll)` once per pool init |
| Graph rebuild during session | Stale results until manual restart | Mtime check before each search recycles the process automatically (AC-10) |
| Idle process holds 400 MB indefinitely | Memory pressure on long-running dev sessions | 10-minute idle reap with `inflight` guard (AC-13) |
| `fs2 mcp` exits unexpectedly mid-call | One bad call surfaces as error; pool should not retain dead handle | `transport.onclose` deletes from pool; next call respawns (AC-09) |
| Multiple worktrees open → N × 400 MB | RAM cost grows linearly | Documented; bounded by user behaviour and idle reaper |
| Polling-based "spawning" status feels janky | Users perceive flicker between states | 1 s poll cadence inside a 30 s ceiling is fast enough to feel responsive without flooding the server action; alternative SSE explicitly out of scope (Open Question Q2) |

**Assumptions**:
- The chainglass MCP server implementation (`packages/mcp-server`) and the FlowSpace MCP server use compatible JSON-RPC framing (both rely on `@modelcontextprotocol/sdk`).
- `fs2 mcp` is reasonably well-behaved on stdio (no spurious stdout writes that would corrupt JSON-RPC framing).
- The `cwd` argument passed to `StdioClientTransport` is honoured — `fs2 mcp` uses `cwd` to find `.fs2/graph.pickle`.
- The `inflight` counter is a sufficient safeguard for idle reaping (no race with mid-call timeouts because the counter is decremented in `finally`).
- Existing `checkFlowspaceAvailability` semantics (graph mtime → "indexed N mins ago") are preserved; we don't need to relocate them onto the MCP path.

## Open Questions

The workshop carries 8 numbered questions with recommendations. Restating here for spec-level visibility, each tagged as resolved or deferred for clarification:

### Q1: Do we extend `#` (git grep) to also use fs2 MCP?

**DEFER (recommended: leave alone)** — Workshop 002 §Q1 recommends Option A (only rewire `$`). Re-evaluate after this ships. If we change our mind, it's a follow-up plan, not an expansion of this one.

### Q2: How is the "spawning" state surfaced — polling, SSE, or long-poll?

**RESOLVED — polling.** Workshop 002 §Q2: server action returns `{ kind: 'spawning' }` immediately when the pool is cold; hook re-calls every 1 s up to 30 s. No SSE.

### Q3: Where does the `spawning` flag live on the wire?

**RESOLVED — discriminated union.** Workshop 002 §Q3: `{ kind: 'spawning' } | { kind: 'ok'; results, folders } | { kind: 'error'; error }`.

### Q4: Idle timeout — 10 min, 30 min, never?

**RESOLVED — 10 min default**, configurable via `FLOWSPACE_IDLE_MS`. Workshop 002 §Q4.

### Q5: Manual "Restart FlowSpace" SDK command?

**RESOLVED — yes, ship in this plan.** Workshop 002 §Q5 — cheap; useful escape hatch. Captured as AC-12.

### Q6: Pre-warm on bar focus, or only on first search?

**RESOLVED — first-search-only** for the initial cut. Workshop 002 §Q6. Revisit if the loading message ever feels slow; a follow-up could prefetch on `$` keypress.

### Q7: Windows support?

**OUT OF SCOPE** — same as the rest of the app. Workshop 002 §Q7.

### Q8: Test strategy?

**RESOLVED — InMemoryTransport for unit tests, env-gated integration test for real `fs2 mcp`.** Workshop 002 §Q8. AC-20.

### Spec-level questions still open

- **Q-S1**: Should the "Restart FlowSpace" SDK command also clear the result cache visually (collapse the dropdown), or just shut down the process and let the next keystroke trigger a re-spawn? [NEEDS CLARIFICATION: probable answer is "just shut down" — the user is already typing, results refresh naturally]
- **Q-S2**: When a user has multiple browser tabs open against the same worktree, do they share one MCP process (server-side singleton, yes) — but does the spawn-message UX play out per-tab independently (each tab's hook polls its own 1 s loop)? [NEEDS CLARIFICATION: assumed yes — server-side singleton, per-tab UX]
- **Q-S3**: ~~The graph age display ("indexed N mins ago") today reads from the on-disk `.fs2/graph.pickle` mtime. Should it instead reflect the mtime captured *when the current process spawned*?~~ **RESOLVED (Session 2026-04-26)**: Keep on-disk mtime. The brief drift window between an external `fs2 scan` and the next-search-driven mtime recycle is acceptable — the recycle closes the gap on the very next keystroke.

## Workshop Opportunities

The primary architecture is already workshopped (002 covers process pool, sequence diagrams, state machine, TypeScript shapes, edge cases, ASCII mocks). One small additional workshop *may* help, but is optional:

| # | Topic | Type | Why Workshop | Key Questions |
|---|-------|------|--------------|---------------|
| 1 | Restart FlowSpace UX | CLI Flow | Tiny scope, but worth confirming where the command appears (`>` palette only? also a button in the dropdown header?), what feedback the user gets, and whether it should warn if a search is in flight | Where does the command live? Is there a confirmation? What does the dropdown show during the restart window? |

If skipped, Q-S1 in Open Questions covers the same surface area at a lower fidelity and the implementation can decide based on AC-12 alone.

## Testing Strategy

- **Approach**: Lightweight (unit + opt-in integration). Workshop 002 §Q8 covers the rationale.
- **Rationale**: Pool lifecycle invariants are subtle enough that regressions would be silent — but the surface is small and contained, so full TDD is overkill. Lightweight gives coverage on the riskiest seams (pool dedup, mtime recycle, crash recovery, idle reap) without inflating ceremony.
- **Focus Areas**:
  - Process pool semantics: dedup, mtime recycle, crash recovery, idle reaping.
  - Server action protocol: `spawning | ok | error` discriminated union round-trips correctly.
  - Hook polling: 1 s cadence + 30 s ceiling; `spawning` flips to `loading` after first warm call.
  - UI rendering: dropdown picks the right branch (`Loading FlowSpace…` vs `Searching…` vs error vs results).
- **Excluded**: Full property-based testing of MCP protocol framing (the SDK already covers that); cross-tab coordination tests (out of scope per non-goals); Windows-specific paths.
- **Mock Usage**: **Avoid entirely.** Per repo doctrine. Use `InMemoryTransport` from `@modelcontextprotocol/sdk` to drive the client against a fake server in-process — that replaces what `vi.fn()` would do. Real `fs2 mcp` integration test is env-gated (`it.skipIf(!hasFs2)`).

## Documentation Strategy

- **Location**: `docs/how/` only.
- **Rationale**: The module is internal infrastructure with no user-facing API surface beyond the existing dropdown UX. The operational gotchas are subtle enough that a how-to is worth writing once, but they don't belong in `apps/web/README` (out of scope for that file's audience) and they're too long for in-code comments alone.
- **Deliverable**: One short how-to (`docs/how/flowspace-mcp-lifecycle.md` or similar) covering: HMR pool persistence (`globalThis` pattern), idle reaping defaults + env override, mtime-based recycle, the `> Restart FlowSpace` SDK command, and how to debug a stuck spawn. Workshop 002 is the deeper design reference; the how-to is the operational quick reference.

---

## Clarifications

### Session 2026-04-26

- **Workflow Mode → Simple.** User overrode the CS-3 default. Rationale (inferred): workshop 002 is exhaustive enough that multi-phase gating would add ceremony without value. Implication: phases collapse into a single execution pass (server foundation → client plumbing → polish & tests), inline tasks rather than per-phase dossiers, plan-4/plan-5 optional. Acceptance criteria still gate completion.
- **Testing → Lightweight.** Unit tests for pool semantics via `InMemoryTransport`; one env-gated integration test against real `fs2 mcp`; one UI test for the spawning state. No TDD ceremony.
- **Mocks → Avoid entirely.** Per repo doctrine. `InMemoryTransport` replaces `vi.fn()` for client wiring; everything else uses real implementations.
- **Documentation → docs/how/ only.** One operational how-to covering HMR pool persistence, idle reaping, mtime recycle, `> Restart FlowSpace` command, debugging a stuck spawn.
- **Domain Review → confirmed as listed.** `_platform/panel-layout` (modify) + `file-browser` (modify), both existing. The new `flowspace-mcp-client.ts` is adjacent server-only infrastructure under `apps/web/src/lib/server/` — not its own domain. Matches precedent for `git-grep-action.ts` and the original `flowspace-search-action.ts`.
- **Harness Readiness → L3 sufficient.** Harness covers AC-02/03/12 UI verification (loading message, warm transition, `> Restart FlowSpace`). Pool semantics live in unit tests using `InMemoryTransport`; no harness probe needed for child-process inspection.
- **Graph age display (Q-S3) → keep on-disk mtime (current behavior).** No change to AC-16. Acknowledged trade-off: brief drift window between an external `fs2 scan` completing and the next-search-driven mtime recycle, during which the displayed "indexed N min ago" reflects the freshest on-disk timestamp rather than the in-memory graph. Acceptable; the recycle will close the gap on the user's very next keystroke.

---

## Next Steps

- **Workshop already done** for the bulk of the design. If Q-S1 / Q-S2 / Q-S3 remain interesting, run **/plan-2-v2-clarify** for ≤3 targeted questions; otherwise proceed directly to **/plan-3-architect**.
- Generate plan-level Flight Plan with **/plan-5b-flightplan --plan "docs/plans/084-random-enhancements-3/flowspace-mcp-search-spec.md"**.
