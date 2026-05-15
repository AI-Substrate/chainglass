# Live File Monitoring After Workspace & Worktree Changes

**Mode**: Simple

📚 This specification incorporates findings from [Workshop 003: Watcher Rescan on Workspace & Worktree Changes](./workshops/003-watcher-rescan-on-workspace-changes.md). All open questions from that workshop have been resolved with evidence (see § Open Questions below).

---

## Research Context

Investigation pinpointed two cooperating bugs that produce identical user-visible symptoms:

1. **No notification path from worktree creation to the file watcher.** `WorkspaceService.createWorktree` returns success without informing `CentralWatcherService`. There is no DI wire-up between the two.
2. **The registry-file watcher dies after one atomic-rename write.** `WorkspaceRegistryAdapter.writeRegistry` writes to `.tmp` then renames over the target. `NativeFileWatcherAdapter` (which uses Node `fs.watch`) is bound to the *inode*, so once the original inode is unlinked, the watcher silently watches a dead inode. On Linux this means it never fires again; on macOS FSEvents it fires inconsistently.

A grep audit confirmed there are **zero** code paths that mutate workspace/worktree state outside `WorkspaceService`: every `registryAdapter.save/remove/update` and `gitManager.createWorktree` call is owned by that one service. So a single signaling point — emitted from `WorkspaceService` after a successful mutation — covers every code path that exists today.

A check of the SSE pipeline confirmed `file-changes` is a single global channel (multiplexed-sse-provider.tsx:75 bakes the channel list into the URL at mount, and `FileChangeProvider` filters by `worktreePath` client-side). Once the server-side watcher rescans, the frontend picks up new paths without any client-side change.

---

## Summary

When a user creates a new worktree in an existing workspace, or registers a new workspace in the app, the live file event stream goes silent for the new directory until the dev server is restarted. This feature ensures live file monitoring activates within ~1 second of the mutation, with no restart required, for the lifetime of the dev server.

The fix has two parts: (1) `WorkspaceService` becomes the single source of truth for "workspace state changed" notifications and `CentralWatcherService` listens; (2) the registry watcher is hardened against the atomic-rename pattern so out-of-band edits (e.g., manual edits to `~/.config/chainglass/workspaces.json`) also trigger a rescan.

---

## Goals

- After a user creates a new worktree via the UI, file additions/changes/deletions inside that worktree appear in the live file event stream within ~1 second, without a server restart.
- After a user registers a new workspace via the UI, file events for all of that workspace's worktrees flow within ~1 second, without a server restart.
- After registering a 2nd, 3rd, 4th workspace in succession, every one is watched correctly (no stale-inode failure mode).
- After a worktree is removed, the corresponding watcher is closed; no further events arrive for that path.
- The fix survives Next.js HMR — editing a server file does not break the signal path or leak listeners.
- A user manually editing `~/.config/chainglass/workspaces.json` (out-of-band registration) still triggers a rescan within a few seconds.
- A failure inside the rescan path does not break the workspace/worktree creation operation itself — the user's mutation always completes successfully.

---

## Non-Goals

- **No frontend changes.** SSE multiplexer + per-worktree filtering already handles new paths once the server emits.
- **No new domain.** Existing domains absorb the change.
- **No event bus or pub/sub infrastructure.** Internal Node `EventEmitter` on `WorkspaceService` is sufficient.
- **No watching of `.git/worktrees/`** as a backup signal. Once `WorkspaceService` always emits, that's the canonical signal.
- **No targeted rescan hints** (e.g., "rescan only this workspace"). Full rescan is fast enough for current workspace counts; revisit only if profiling shows otherwise.
- **No CLI changes.** Out of scope for this feature.
- **No guarantee for crashed-then-recovered watchers.** If a watcher dies due to inotify limits or permission changes, the next deliberate mutation triggers a fresh rescan — that's the recovery story, no separate health probe.

---

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `workspace` | existing | **modify** | `WorkspaceService` gains an internal mutation event channel emitting on every successful workspace/worktree mutation. |
| `_platform/events` | existing | **modify** | `CentralWatcherService` registry-file watcher hardened (parent-dir watch + path filter); `start-central-notifications.ts` subscribes to workspace mutation events and triggers `rescan()`. |
| `file-browser` | existing | **consume** | No changes. Consumes `useFileChanges` which already handles new worktree paths via client-side filtering. Verified post-fix (manual smoke). |

No new domains. No domain contracts change at the cross-domain boundary; the new event channel is initially internal to the `workspace` domain (only `_platform/events` subscribes via the start-central-notifications wire-up).

---

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=0, D=0, N=1, F=1, T=2 → P=5
  - **S=1**: ~4 production files (`workspace.service.ts`, `central-watcher.service.ts`, `start-central-notifications.ts`, possibly a contracts file).
  - **I=0**: No external integrations.
  - **D=0**: No schema/migration.
  - **N=1**: Design is settled by Workshop 003; minor ambiguity around test seam choice for the integration test.
  - **F=1**: HMR survivability + cross-platform `fs.watch` semantics (macOS FSEvents vs Linux inotify).
  - **T=2**: Need an integration test that uses real `fs.watch` against a temp directory to validate the parent-dir registry watch under atomic-rename. Also unit tests for the emitter contract.
- **Confidence**: 0.85 — strong design baseline from the workshop; remaining uncertainty is around integration-test stability and HMR pattern verification.
- **Assumptions**:
  - The existing `__FLOWSPACE_MCP_POOL__` / `__centralNotificationsStarted` HMR-survival pattern can be applied directly to the listener subscription.
  - `WorkspaceService` is resolved as a singleton from the DI container (verifiable, but assumed for the design).
  - Listener errors caught + logged are an acceptable failure mode (matches existing watcher-error handling at central-watcher.service.ts:265-270).
- **Dependencies**: None external. Internal: depends on `IWorkspaceService` interface being modifiable (it is — owned by this codebase).
- **Risks**:
  - HMR pattern may need tuning if `WorkspaceService` identity changes per request (vs per server lifetime).
  - Integration test flakiness on slow CI (atomic-rename event detection has a small but real delay).
  - Spurious rescans from the parent-dir registry watch picking up unrelated files (mitigated with path filter).
- **Phases**: Single phase. Suggested task breakdown for plan-3:
  1. Add mutation event channel to `WorkspaceService` + emit at all 5 success exits (`save`, `update`, `remove`, `executeCreate`, future worktree-removal).
  2. Subscribe in `start-central-notifications.ts` with HMR-safe unsubscribe pinned to `globalThis`.
  3. Replace registry-file watch with parent-dir watch + path filter.
  4. Tests: unit (emit-on-success, no-emit-on-blocked, listener errors don't propagate) + integration (real fs in temp dir; assert watcher set grows after createWorktree + after second workspace registration).
  5. Update `_platform/events/domain.md` Source Location and `workspace/domain.md` Composition.

---

## Acceptance Criteria

1. **AC-1 (worktree creation, in-process)**: Creating a worktree via the `createNewWorktree` server action causes the new worktree's `.chainglass/data` and source-file paths to be watched within 1 second of the action returning, without a server restart. Verified by writing a file under the new worktree and observing a `file-changes` SSE event.
2. **AC-2 (workspace registration)**: Registering a new workspace via `addWorkspace` (or equivalent action) causes all of that workspace's pre-existing worktrees to be watched within 1 second, without a server restart.
3. **AC-3 (multiple workspaces in sequence — atomic-rename regression)**: Registering a second, third, and fourth workspace in succession all trigger a rescan; live file events flow for every one. Specifically, the second registration MUST work, regressing the current "registry watcher goes stale after first atomic rename" failure.
4. **AC-4 (worktree removal)**: Removing a worktree closes the corresponding `dataWatcher` and `sourceWatcher`. No further `file-changes` events arrive for that path.
5. **AC-5 (HMR survivability)**: Touching a server file (triggering Next.js HMR) does not break subsequent worktree creations — the next mutation still triggers a rescan. Listener count does not grow without bound across HMR cycles.
6. **AC-6 (out-of-band registry edit)**: Manually editing `~/.config/chainglass/workspaces.json` (e.g., via `vim`) triggers a rescan within ~3 seconds. Defense-in-depth — confirms the parent-directory watch fix.
7. **AC-7 (rescan failure isolation)**: If `rescan()` throws (simulated by injecting an error in a test seam), the originating workspace/worktree mutation still returns success to the user. The error is logged but does not propagate.
8. **AC-8 (test coverage)**: At least one unit test verifies emission on success and non-emission on `blocked` results. At least one integration test exercises a real filesystem temp dir with atomic-rename writes, asserting both registration paths flow through to a watcher set update.

---

## Risks & Assumptions

| # | Risk / Assumption | Likelihood | Impact | Mitigation |
|---|------------------|------------|--------|------------|
| R1 | HMR re-instantiates `WorkspaceService` and the prior listener leaks onto a dead instance | Medium | Listener leak / no actual harm but log noise | Pin entire wire-up to `globalThis` per existing pattern; on HMR, detach previous listener before re-subscribing. |
| R2 | Parent-dir registry watch fires on unrelated `.tmp` files (during the rename window) | High frequency, low impact | Spurious rescans (cheap; coalesced) | Path filter inside the event handler; rely on existing `isRescanning`/`rescanQueued` coalescing in `CentralWatcherService`. |
| R3 | Linux inotify watcher count limit hit if many workspaces are added | Low | Watcher creation silently fails | Existing logging at central-watcher.service.ts:267-270 already surfaces this; out of scope to fix. |
| R4 | Integration test is timing-sensitive on slow CI | Medium | Test flakes | Use a generous polling timeout (e.g., 5s) with short polling interval; do not rely on a single fixed delay. |
| R5 | Race between mutation completion and rescan: a file is created in the new worktree *before* the rescan finishes | Low | One missed event | The rescan is fast (<100ms typical) and the user's first interaction with a new worktree is navigation, not immediate file editing. Acceptable. |
| A1 | All workspace/worktree mutations route through `WorkspaceService` | Verified | — | Grep audit confirmed (workspace.service.ts:95, 124, 295, 470). New code paths must follow this rule — enforced by interface, not by check. |
| A2 | The SSE `file-changes` channel is global and the frontend filters per-worktree | Verified | — | multiplexed-sse-provider.tsx:75 + file-change-provider.tsx:54-55 confirm. |
| A3 | `fs.watch({recursive: true})` on the parent directory `~/.config/chainglass/` correctly fires on rename-into-place | High confidence | — | Standard FSEvents/inotify behavior; will be validated by integration test. |

---

## Open Questions

All workshop open questions have been investigated and resolved. The remaining items below are classified as **CONFIRMATION** (need user sign-off) rather than **NEEDS RESEARCH** (already answered).

### Resolved with evidence

| # | Question | Resolution | Evidence |
|---|----------|------------|----------|
| Q1 | Are there other code paths that mutate workspace state outside `WorkspaceService`? | **No.** All `registryAdapter.save/remove/update` and `gitManager.createWorktree` calls are owned by `WorkspaceService`. | Grep across `apps/web` + `packages/workflow/src` (excluding tests/fakes/mocks). 4 hits; all in `workspace.service.ts:95, 124, 295, 470`. |
| Q2 | Should the mutation-event interface be promoted to contracts, or stay package-internal? | **Stay internal initially.** Promote only when a second subscriber emerges (e.g., SSE cache invalidation). | YAGNI — no second consumer planned. Internal interface keeps the surface area small. |
| Q3 | Is the SSE `file-changes` channel global or per-worktree? | **Global.** Channel list baked into URL at mount; per-worktree filtering happens client-side. | multiplexed-sse-provider.tsx:74-75 + file-change-provider.tsx:54-55. |
| Q4 | Should `rescan()` accept a hint about which path changed? | **No, defer.** Full rescan is fast at current scale. Revisit if profiling shows it as a hotspot. | Current `performRescan()` implementation re-lists workspaces and diffs in <100ms for typical counts. |
| Q5 | How will this be tested? | Unit (emitter contract) + integration (real fs in temp dir; atomic-rename + worktree dir creation; assertion on watcher set membership). No mocks of `fs.watch` itself. | Workshop § Open Questions Q5. Aligns with existing integration-test patterns in this repo. |
| Q6 | Is the `globalThis.__watcherMutationUnsubscribe__` pattern enough for HMR? | **Yes, with proper detach-then-resubscribe order.** Mirrors `__FLOWSPACE_MCP_POOL__` + `__centralNotificationsStarted` patterns already in use. | Pattern proven in instrumentation.ts:22-31 and FlowSpace pool work. |

### Confirmation needed (carry into plan-2 clarification)

- **C1 (Mode)**: Recommend `Simple` Mode — single concern, ~4 production files, single-phase plan. User to confirm in `/plan-2-v2-clarify`.
- **C2 (Testing Strategy)**: Recommend `Lightweight` (focused unit tests) + one `Integration` test against real filesystem. No `Full TDD` — design is settled and the iteration cost is low.
- **C3 (Mock Usage)**: Recommend `Avoid mocks entirely` — use a real `EventEmitter`, real `fs.watch`, and a real temp directory. Mirrors the FlowSpace MCP work that used `InMemoryTransport` over function mocks.
- **C4 (Documentation)**: Recommend updating `docs/domains/_platform/events/domain.md` Source Location + Composition, and `docs/domains/workspace/domain.md` to note the new emitter contract. No new `docs/how/` guide. The workshop is the design record.
- **C5 (Harness usage)**: Harness is at L3 (per `docs/project-rules/harness.md`). Plan-3 should use the harness for AC-1, AC-2, AC-3 manual verification post-implementation (boot harness, register workspaces via the UI, assert file events via the harness's structured-evidence capture). No harness changes needed.

---

## Workshop Opportunities

| Topic | Type | Why Workshop | Status |
|-------|------|--------------|--------|
| Watcher rescan signaling pattern | Integration Pattern | Decision between direct call, notifier injection, event emitter, parent-dir watch needed before architecture | ✅ **Complete** — see [`workshops/003-watcher-rescan-on-workspace-changes.md`](./workshops/003-watcher-rescan-on-workspace-changes.md) |

No further workshops required for this feature. The workshop covers signaling, lifecycle, edge cases, and frontend coordination. Plan-3 can proceed directly.

---

## Cross-References

- Workshop: [`workshops/003-watcher-rescan-on-workspace-changes.md`](./workshops/003-watcher-rescan-on-workspace-changes.md) — authoritative design record (signaling pattern, sequence diagrams, interface sketch, edge cases)
- Sibling specs in the same plan folder:
  - [`flowspace-mcp-search-spec.md`](./flowspace-mcp-search-spec.md) — completed prior, established the `globalThis` HMR-survival pattern that this feature reuses
  - [`your-workspaces-search-and-header.md`](./workshops/001-your-workspaces-search-and-header.md) — workshop for an unrelated feature in the same plan
- Codebase anchors (read-only references for plan-3):
  - `packages/workflow/src/services/workspace.service.ts` (mutation points)
  - `packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts` (consumer of the new event)
  - `apps/web/src/features/027-central-notify-events/start-central-notifications.ts` (wire-up)
  - `packages/workflow/src/adapters/workspace-registry.adapter.ts` (atomic-rename root cause site)
  - `packages/workflow/src/adapters/native-file-watcher.adapter.ts` (inode-bound watcher)
