# Multi-Folder File Browser Tree — Implementation Plan

**Plan Version**: 1.0.0
**Mode**: Full
**Created**: 2026-05-13
**Spec**: [multi-folder-tree-spec.md](./multi-folder-tree-spec.md)
**Research**: [`multi-folder-tree-research.md`](./multi-folder-tree-research.md) + [`external-research/`](./external-research/)
**Status**: DRAFT (awaiting `/plan-4-v2-complete-the-plan` validation)
**Complexity**: CS-4 (large) — 9 = S2+I1+D1+N1+F2+T2

---

## Summary

Pin additional folders to a workspace so they appear as sibling roots in the file browser tree, with a `+` to add and `−` to remove. The work breaks into three coherent strands: a **watcher substrate migration** (Phase 1) to escape the macOS `fs.watch` ceiling, a **path-validation harden pass** (Phase 2) to make `worktrees[] ∪ extraFolders[]` the closed-set boundary at every read route, and the **multi-root feature itself** (Phases 3–8) — contract extension, watcher lifecycle, multi-root rendering, add UI, type-aware menus, and polish. The expected outcome is a chainglass workspace where a user can navigate a git repo and an OneDrive notes folder side-by-side in the same tree, with live updates for local roots, polled updates for cloud-synced roots, and the FX007 Copy-URL menu gracefully gating on each root's kind.

---

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| `workspace` | existing | **modify** | `WorkspacePreferences.extraFolders[]` + `addExtraFolder` / `removeExtraFolder` service methods + new `validatePath()` method on `IWorkspaceService` + tighten `resolveContextFromParams` lenient fallback |
| `_platform/events` | existing | **modify** | Migrate `NativeFileWatcherAdapter` from raw `fs.watch` to `@parcel/watcher`; add per-root subscribe/unsubscribe lifecycle; CloudStorage prefix detection + 5–10s polling; startup pre-flight check |
| `file-browser` | existing | **modify** | Per-root state shape (`Map<rootPath, …>`); namespaced React keys; render N `<FileTree>` siblings; per-root header with type badge; add/remove/reorder/alias UI; settings page accordion |
| `_platform/git` | existing | **consume** | Per-root `RepoInfo` resolution via FX007's existing `/api/workspaces/[slug]/repo-info` endpoint (one call per extra root, lazy on first interaction) |
| `_platform/state` | existing | **consume** | No changes; existing per-workspace state lookups |

No new domains. No new domain-map edges (file-browser already depends on workspace and on `_platform/*`).

---

## Domain Manifest

Files this plan introduces (NEW) or modifies (MOD), grouped by phase. Classifications: `contract` (public interface), `internal` (domain-internal), `cross-domain` (editing another domain's files).

### Phase 1: Watcher Library Migration
| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `package.json` (apps/web + packages/workflow) | `_platform/events` | internal | Add `@parcel/watcher` dependency |
| MOD `packages/workflow/src/features/023-central-watcher-notifications/native-file-watcher.adapter.ts` | `_platform/events` | internal | Replace `fs.watch` impl with `@parcel/watcher.subscribe`; preserve `IFileWatcher` interface |
| MOD `packages/workflow/src/features/023-central-watcher-notifications/file-change-watcher.adapter.ts` | `_platform/events` | internal | Verify event shape unchanged for downstream consumers |
| MOD `packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts` | `_platform/events` | internal | Wire through new adapter; preserve `sourceWatchers` / `dataWatchers` / `registryWatcher` maps |
| NEW `packages/workflow/src/features/023-central-watcher-notifications/lib/preflight-check.ts` | `_platform/events` | internal | Startup `ulimit -n` (macOS) / `fs.inotify.max_user_watches` (Linux) check + console warning |
| NEW Tests | `_platform/events` | internal | Adapter + preflight unit tests |

### Phase 2: Workspace Path Validation Harden
| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| MOD `packages/workflow/src/interfaces/workspace-service.interface.ts` | `workspace` | contract | Add `validatePath(slug, path): Promise<Result<{ kind: 'worktree' \| 'extra'; path }, ValidationError>>` to `IWorkspaceService` |
| MOD `packages/workflow/src/services/workspace.service.ts` | `workspace` | internal | Implement `validatePath()` (defensive `startsWith('/') && !includes('..')` + closed-set match against `info.worktrees[].path`; Phase 3 will extend the closed-set with `extraFolders[]`). Also tighten `resolveContextFromParams` lenient-fallback (line 242: stop returning user-supplied path when closed-set match fails) |
| MOD `apps/web/app/api/workspaces/[slug]/workflows/[graphSlug]/execution/_resolve-worktree.ts` | `workspace` | cross-domain | Delegate to `workspaceService.validatePath()`; remove duplicated logic |
| MOD `apps/web/app/api/workspaces/[slug]/files/route.ts` | `workspace` | cross-domain | Route through `workspaceService.validatePath()` (upgrades from defensive-only to canonical 2-layer) |
| MOD `apps/web/app/api/workspaces/[slug]/files/raw/route.ts` | `workspace` | cross-domain | Same |
| MOD `apps/web/app/api/workspaces/[slug]/file-notes/route.ts` | `workspace` | cross-domain | Same |
| MOD `apps/web/app/api/workspaces/[slug]/pr-view/route.ts` | `workspace` | cross-domain | Same |
| MOD `apps/web/app/api/workspaces/[slug]/samples/route.ts` | `workspace` | cross-domain | Same |
| MOD `apps/web/app/api/workspaces/[slug]/repo-info/route.ts` | `workspace` | cross-domain | Refactor FX007's inline 2-layer to call `workspaceService.validatePath()` (no behavior change) |
| NEW Tests | `workspace` | internal | Per-route negative test (unknown path → 400); `validatePath()` unit tests in workflow package |

### Phase 3: Extra Folders Contract
| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| MOD `packages/workflow/src/entities/workspace.ts` | `workspace` | contract | Add `ExtraFolder { path, label, alias?, emoji?, kind }`; extend `WorkspacePreferences` with `extraFolders?: ExtraFolder[]` |
| MOD `packages/workflow/src/interfaces/workspace-service.interface.ts` | `workspace` | contract | Add `addExtraFolder(slug, folder)` + `removeExtraFolder(slug, path)` + `updateExtraFolder(slug, path, patch)` method signatures |
| MOD `packages/workflow/src/services/workspace.service.ts` | `workspace` | internal | Implement add/remove/update; validation at add-time (exists, absolute, no `..`, readable, shallow-scan depth threshold); emit `workspace:updated` mutation event. **Also extend `validatePath()` (added in Phase 2) so the closed-set is `worktrees[] ∪ extraFolders[]`** — returns `{ kind: 'worktree' }` or `{ kind: 'extra' }`. |
| MOD `packages/workflow/src/adapters/workspace-registry.adapter.ts` | `workspace` | internal | Persist `extraFolders[]` round-trip (additive; absence → empty list) |
| NEW Tests | `workspace` | internal | Round-trip persistence; mutation event emission; validation refusals; closed-set expansion of `validatePath()` verified |

### Phase 4: Watcher Lifecycle + CloudStorage Routing
| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| NEW `packages/workflow/src/features/023-central-watcher-notifications/lib/cloudstorage-classifier.ts` | `_platform/events` | internal | Prefix detect `/Users/*/Library/CloudStorage/*`; classify root as `event-watch` vs `poll-watch` |
| NEW `packages/workflow/src/features/023-central-watcher-notifications/lib/polling-watcher.ts` | `_platform/events` | internal | 5–10s `fs.stat`-based change-detection loop; emits to same `IFileWatcher` callback shape |
| MOD `packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts` | `_platform/events` | internal | Subscribe to `WorkspaceMutationEvent('workspace:updated')`; extend `performRescan()` to include `extraFolders[]`; per-root hybrid routing |
| NEW `apps/web/app/api/workspaces/[slug]/extras/refresh/route.ts` | `_platform/events` | cross-domain | POST to force a re-scan for one root (manual "Refresh" affordance) |
| NEW Tests | `_platform/events` | internal | Add/remove root → watcher start/stop; CloudStorage prefix path → polling watcher used; refresh endpoint triggers rescan |

### Phase 5: Multi-Root Tree Rendering
| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| MOD `apps/web/app/(dashboard)/workspaces/[slug]/browser/page.tsx` | `file-browser` | internal | SSR loads root entries for active worktree + each extra folder |
| MOD `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | `file-browser` | internal | State shape becomes `Map<rootPath, ...>` (rootEntries / repoInfo / expandPaths / childEntries) |
| MOD `apps/web/src/features/041-file-browser/components/file-tree.tsx` | `file-browser` | internal | Namespace React keys with `${rootPath}:${entry.path}`; render per-root header above each subtree |
| NEW `apps/web/src/features/041-file-browser/components/root-header.tsx` | `file-browser` | internal | Per-root header: label/alias, type badge, refresh button, `−` button, kebab menu |
| MOD `apps/web/src/features/041-file-browser/hooks/use-file-navigation.ts` | `file-browser` | internal | `childEntries[rootPath][dirPath]` (was `childEntries[dirPath]`) |
| MOD `apps/web/src/features/041-file-browser/hooks/use-clipboard.ts` | `file-browser` | internal | "Copy Relative Path" computed relative to that file's root (per spec C-6) |
| NEW Tests | `file-browser` | internal | Two-roots-same-subtree (no React key warnings); expand-state preserved per-root across focus changes |

### Phase 6: Add-Folder UI + Persistence Wiring
| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| MOD `apps/web/src/features/_platform/panel-layout/components/left-panel.tsx` | `file-browser` | cross-domain | `+` button in `actions[]` slot of `PanelHeader` |
| NEW `apps/web/src/features/041-file-browser/components/add-folder-modal.tsx` | `file-browser` | internal | Folder picker + label/alias/emoji fields + path validation UI |
| NEW `apps/web/src/features/041-file-browser/hooks/use-extra-folders.ts` | `file-browser` | internal | Add/remove/update + persistence wiring + soft-warning toast past 10 |
| NEW `apps/web/app/api/workspaces/[slug]/extras/route.ts` | `file-browser` | cross-domain | POST add / DELETE remove / PATCH update (alias / emoji / position) |
| NEW Tests | `file-browser` | internal | Add success path + each validation refusal (non-existent, not absolute, has `..`, unreadable); soft warning at 11 |

### Phase 7: Per-Root Repo-Info + Type Indicators + Copy-URL Gate
| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| MOD `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | `file-browser` | internal | Per-root `repoInfo` Map; lazy-fetch on first interaction with each root |
| MOD `apps/web/src/features/041-file-browser/components/root-header.tsx` | `file-browser` | internal | Render `[Git]` / `[Cloud]` / `[Local]` badge + icon |
| MOD `apps/web/src/features/041-file-browser/components/file-tree.tsx` | `file-browser` | internal | Accept `repoInfo` Map; per-context-menu lookup by file's owning root |
| MOD `apps/web/src/features/041-file-browser/hooks/use-clipboard.ts` | `file-browser` | internal | Copy-URL handlers consult owning-root's `repoInfo`; gracefully no-op when `kind !== 'git'` |
| MOD Tests | `file-browser` | internal | Mixed-root fixture: git root shows Copy-URL menu items; cloud root hides them; non-git plain root hides them |

### Phase 8: Reorder + Alias + Removal Polish + Docs
| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| MOD `apps/web/src/features/041-file-browser/components/root-header.tsx` | `file-browser` | internal | `−` button + 5s undo toast; Move Up / Move Down context items; rename inline or via modal |
| MOD `apps/web/src/features/041-file-browser/components/file-tree.tsx` | `file-browser` | internal | Drag-to-reorder root nodes (secondary affordance) |
| NEW `apps/web/src/features/041-file-browser/components/extra-folders-settings.tsx` | `file-browser` | internal | Settings page accordion for managing extras (replicates emoji/star pattern from `workspace-settings-table.tsx`) |
| MOD `apps/web/app/(dashboard)/settings/workspaces/workspace-settings-table.tsx` | `file-browser` | cross-domain | Surface extra-folder count + entry point to settings accordion |
| NEW `docs/how/multi-folder-tree.md` | documentation | — | Trust model; CloudStorage caveats; system-tuning hints (`ulimit` / `inotify`) |
| MOD `README.md` | documentation | — | One paragraph + link to how-doc |
| MOD `docs/domains/workspace/domain.md` | documentation | — | History + Concepts entry + Contracts rows |
| MOD `docs/domains/file-browser/domain.md` | documentation | — | History + Composition |
| MOD `docs/domains/_platform/events/domain.md` | documentation | — | History noting `@parcel/watcher` substrate swap + CloudStorage polling |

---

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | **Critical** | Path-validation surface is inconsistent today: `repo-info` uses canonical 2-layer (FX007); `files`, `files/raw`, `pr-view`, `file-notes`, `samples` use defensive-only. The day `extraFolders[]` exists, defensive-only routes silently widen to read *any* `/`-prefixed path that exists on disk. | Phase 2 adds `validatePath()` to `IWorkspaceService` and routes every endpoint through it **before** Phase 3 ships `extraFolders[]`. Companion review must verify every route was migrated. |
| 02 | **Critical** | macOS CloudStorage file-watching is unreliable: FSEvents drops events on file-provider mounts (OneDrive, iCloud Drive, Dropbox Smart-Sync). The codebase has zero existing handling. | Phase 4 routes prefix-matched CloudStorage roots through a 5–10s polling watcher with a per-root manual "Refresh" affordance always available. Auto-poll silently (per spec C-14 default). |
| 03 | **High** | `fs.watch` hits a hard ~4,096 ceiling on macOS regardless of `ulimit -n`. The current `NativeFileWatcherAdapter` wraps raw `fs.watch` (post-Plan 060 chokidar removal). Going from 1–3 worktrees to 5–15 user-chosen roots risks silent scaling failure. | Phase 1 swaps the adapter to `@parcel/watcher` (FSEvents directly via native addon on macOS, FTS on Linux). Preserves `IFileWatcher` interface so downstream consumers unchanged. |
| 04 | **High** | Single-root assumptions are baked into ≥8 layers: URL param, SSR fetch, child-entries cache, expand state, React keys, `repoInfo`, SSE filter, "Copy Relative Path" semantics. Path-only cache keys collide across roots (`childEntries['src/index.ts']` from root-A clobbered by root-B). | Phase 5 namespaces all state shapes by `rootPath` (`Map<rootPath, …>`) and namespaces React keys (`${rootPath}:${entry.path}`). Explicit two-roots-same-subtree test required. |
| 05 | **High** | `WorkspaceMutationEvent('workspace:updated')` already exists (workflow/src/interfaces/workspace-service.interface.ts:178-183) and the `CentralWatcherService.performRescan()` reflex already discovers known worktrees on mutation. Extending this to `extraFolders[]` is mechanical, not architectural. | Phase 4 hooks into existing event; no new event taxonomy needed. |
| 06 | **High** | A shared path-validation surface does not exist anywhere. The closest precedent is `_resolve-worktree.ts` in the workflows execution route — a copy-pasted local helper. The 2-layer pattern lives only at the FX007 `repo-info` route. | Phase 2 adds a `validatePath(slug, path)` method to `IWorkspaceService` (Clean-Architecture-idiomatic: capability exposed via interface, implementation in `packages/workflow/src/services/workspace.service.ts`). All routes call `workspaceService.validatePath()`. Phase 3 extends the closed-set to include `extraFolders[]`. |
| 07 | **Medium** | `WorkspacePreferences` is mature (workflow/src/entities/workspace.ts:32-51): `emoji`, `color`, `starred`, `sortOrder`, `starredWorktrees[]`, `worktreePreferences{}`, `sdkSettings{}`, `sdkShortcuts{}`. Adding `extraFolders?: ExtraFolder[]` is additive + backward-compatible (absence → empty list). | Phase 3 schema change is straightforward; no migration; persistence uses existing `update()` adapter call. |
| 08 | **Medium** | FX007's `_platform/git` contract (`getRemoteUrl`, `getCurrentBranch`, etc.) takes a `worktree` path arg per function. The `/api/workspaces/[slug]/repo-info` endpoint accepts any `worktree` param and returns `RepoInfo { host, currentBranch, isDetached, ... }` with `host: 'unknown'` for non-git paths. | Phase 7 calls this endpoint once per extra root (lazy, on first interaction), caches per `rootPath`, and gates the Copy-URL menu on `kind === 'git'`. |
| 09 | **Medium** | Workspace settings UI pattern is established at `apps/web/app/(dashboard)/settings/workspaces/workspace-settings-table.tsx`: inline emoji/color pickers, star toggle, remove button, server actions. Replicate this for extra-folders management in Phase 8. | Phase 8 settings accordion follows this exact pattern; no new component primitives needed. |
| 10 | **Medium** | The `WorkspaceService.resolveContextFromParams()` fallback at workspace.service.ts:242 returns the user-supplied path when closed-set match fails. This is a footgun once `extraFolders[]` lands. | Phase 2 tightens this in the harden pass; tests cover "unknown path → not silently accepted." |

---

## Agent Harness Strategy

- **Current Maturity**: L3 — Boot + Browser Interaction + Structured Evidence + CLI SDK (per `docs/project-rules/harness.md`)
- **Target Maturity**: L3 (no agent-harness work needed; this plan consumes existing capability)
- **Boot Command**: `just harness dev` (auto-computes worktree-derived ports)
- **Health Check**: `just harness health`
- **Interaction Model**: HTTP API via Playwright/CDP browser automation + CLI SDK (`harness/src/cli/index.ts`)
- **Evidence Capture**: JSON responses from `check-route` + screenshots
- **Pre-Phase Validation**: Required at the start of every phase (Boot → Interact → Observe per `harness.md § Pre-Phase Validation`).
- **Per-Phase Compile-Time Verification**: After every task that touches a barrel `index.ts` crossing the client/server line, an `app/` route, or a new module importing `node:*` — run `just harness-verify "/workspaces/<slug>/browser"`. This is non-negotiable for Phases 1, 2, 4, 5, 6, 7, 8 (every phase except 3, which only touches `packages/workflow`). The recipe was added in plan 084 FX007 specifically to catch the class of Turbopack chunking error that crops up when a server-only module is value-re-exported into a client barrel — Phase 1 (`@parcel/watcher` native addon) and Phase 4 (polling-watcher module) are exactly that class of risk.

---

## Phases

### Phase Index

| Phase | Title | Primary Domain | Objective | Depends On |
|-------|-------|---------------|-----------|------------|
| 1 | Watcher Library Migration + Pre-flight | `_platform/events` | Replace raw `fs.watch` with `@parcel/watcher`; add startup `ulimit`/`inotify` warning | None |
| 2 | Workspace Path Validation Harden | `workspace` | Add `validatePath()` method to `IWorkspaceService`; route every existing read endpoint through it; tighten `resolveContextFromParams` lenient fallback | None (can run in parallel with Phase 1, but lands before Phase 3) |
| 3 | Extra Folders Contract | `workspace` | `ExtraFolder` type + `extraFolders[]` on `WorkspacePreferences`; `addExtraFolder` / `removeExtraFolder` / `updateExtraFolder` service methods; closed-set extension | Phase 2 |
| 4 | Watcher Lifecycle + CloudStorage Routing | `_platform/events` | Subscribe to `workspace:updated`; per-root subscribe/unsubscribe; CloudStorage prefix-detect + polling watcher; manual-refresh endpoint | Phase 1, Phase 3 |
| 5 | Multi-Root Tree Rendering | `file-browser` | Per-root state shape (`Map<rootPath, …>`); namespaced React keys; N `<FileTree>` siblings; per-root header component | Phase 3 |
| 6 | Add-Folder UI + Persistence Wiring | `file-browser` | `+` button; add-folder modal; `/api/workspaces/[slug]/extras` route; soft warning past 10 | Phase 5 |
| 7 | Per-Root Repo-Info + Type Indicators + Copy-URL Gate | `file-browser` (consumes `_platform/git`) | Per-root `repoInfo` Map (lazy); `[Git]`/`[Cloud]`/`[Local]` badges; FX007 menu gating | Phase 5, Phase 6 |
| 8 | Reorder + Alias + Removal + Settings + Docs | `file-browser` | Move Up/Down primary + drag secondary; alias rename; instant-remove + 5s undo toast; settings accordion; `docs/how/multi-folder-tree.md`; domain.md History rows | Phase 7 |

---

### Phase 1: Watcher Library Migration + Pre-flight

**Objective**: Replace raw `fs.watch` in `_platform/events` with `@parcel/watcher` while preserving the `IFileWatcher` interface for downstream consumers; add a startup pre-flight check that warns when system limits (`ulimit -n` / `fs.inotify.max_user_watches`) are below the multi-root threshold.

**Domain**: `_platform/events`

**Delivers**:
- `NativeFileWatcherAdapter` backed by `@parcel/watcher.subscribe` (no change to consumer-facing `IFileWatcher` contract)
- Preserved event shape for SSE multiplexed `file-changes` channel (recent-changes-feed, PR-view, file-browser consumers unchanged)
- New `lib/preflight-check.ts` emitting console warnings for low system limits at boot
- Tests verifying the new adapter passes the same observable behavior as the old

**Depends on**: None (independent foundational work)

**Key risks**: Regression on existing consumers (`045-live-file-events`, `recent-changes-feed`, PR-view). Native addon (`@parcel/watcher`) build failure in some dev environments.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Add `@parcel/watcher` dependency to `packages/workflow` and verify native build on macOS + Linux | `_platform/events` | `pnpm install` succeeds; `pnpm test` for `023-central-watcher-notifications` still passes against the unchanged adapter | Finding 03; verify Turbopack chunking via `just harness-verify` |
| 1.2 | Refactor `NativeFileWatcherAdapter` to use `@parcel/watcher.subscribe(path, callback, { recursive: true })` | `_platform/events` | Adapter exposes the same `IFileWatcher` methods; unit tests pass | Preserve `200ms` write-stabilization logic if still applicable |
| 1.3 | Verify event shape unchanged for downstream consumers (SSE `file-changes` channel) | `_platform/events` | Integration test: real file change in a tmpdir watched root → SSE emits a payload matching the pre-migration shape | Critical for not breaking recent-changes-feed |
| 1.4 | Implement `lib/preflight-check.ts`: on `CentralWatcherService` boot, check `ulimit -n` (macOS) ≥ 10,000 and `fs.inotify.max_user_watches` (Linux) ≥ 500,000; emit console warning if low | `_platform/events` | Boot a dev server with constrained limits → warning visible; boot with healthy limits → no warning | AC-14 |
| 1.5 | Run `just harness-verify "/workspaces/<slug>/browser"` end-to-end | `_platform/events` | No Turbopack chunking errors; browser tree still renders; SSE updates still arrive | Required gate per harness rules |

---

### Phase 2: Workspace Path Validation Harden

**Objective**: Add a `validatePath(slug, path)` method to `IWorkspaceService` (interface + impl in `packages/workflow`) and route every existing file-API endpoint through it, eliminating the defensive-only validation pattern that would silently widen the day `extraFolders[]` lands. Tighten the lenient fallback in `WorkspaceService.resolveContextFromParams()`.

**Domain**: `workspace`

**Delivers**:
- New `validatePath(slug, path): Promise<Result<...>>` method on `IWorkspaceService` (interface + impl in `packages/workflow`)
- All path-accepting routes migrated to call `workspaceService.validatePath()` (5+ routes)
- `WorkspaceService.resolveContextFromParams()` no longer returns user-supplied path when closed-set match fails
- Per-route negative tests (unknown path → 400)

**Depends on**: None (can run in parallel with Phase 1; both land before Phase 3)

**Key risks**: Missing a route is a silent vuln once Phase 3 lands. Tightening `resolveContextFromParams` could break code paths that today rely on the lenient fallback.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Audit every API route under `apps/web/app/api/workspaces/[slug]/` that accepts a `worktree` param: run `grep -rln "worktree" apps/web/app/api/workspaces/` and walk every match. Classify each route as canonical-2-layer / defensive-only / other. **Companion review must verify every grep hit is accounted for in the manifest.** | `workspace` | Inventory table in execution log enumerating every hit from grep, classified; manifest extended if any route missed | Findings 01, 06; doctrine V3 |
| 2.2 | Add `validatePath(slug, path): Promise<Result<...>>` method to `IWorkspaceService`. Implement in `WorkspaceService` with defensive (`startsWith('/') && !includes('..')`) + closed-set match against `info.worktrees[].path`. Initially returns only `{ kind: 'worktree' }` on match (Phase 3 extends to `extraFolders[]`). | `workspace` | TDD: unit tests in `packages/workflow` cover defensive-fail, closed-set-fail, closed-set-success cases | Finding 06; HIGH violation fix from plan-4 |
| 2.3 | Migrate every defensive-only route to call `workspaceService.validatePath()`: `files`, `files/raw`, `file-notes`, `pr-view`, `samples` | `workspace` | Per-route test: known worktree → 200; unknown absolute path → 400; traversal `..` → 400 | Finding 01; AC-13 |
| 2.4 | Refactor `repo-info/route.ts` (FX007's canonical 2-layer) to call `workspaceService.validatePath()` (no behavior change) | `workspace` | Existing repo-info tests still pass | Reduces duplication |
| 2.5 | Refactor `_resolve-worktree.ts` (workflows execution) to delegate to `workspaceService.validatePath()` | `workspace` | Workflows execution tests still pass | Consolidates the precedent |
| 2.6 | Tighten `WorkspaceService.resolveContextFromParams()` at workspace.service.ts:242 — when closed-set match fails, return `null` rather than returning user-supplied path. Update any downstream consumers that relied on the lenient behavior. | `workspace` | New unit test: unknown path → returns null; existing callers verified via integration tests | Finding 10 |
| 2.7 | Run `just harness-verify "/workspaces/<slug>/browser"` + `just harness-verify "/workspaces/<slug>"` | `workspace` | Every route still serves; no regressions | Gate |

---

### Phase 3: Extra Folders Contract

**Objective**: Extend the workspace domain with the `ExtraFolder` entity, `extraFolders[]` field on `WorkspacePreferences`, and the service-method surface for adding/removing/updating extras. Extend `workspaceService.validatePath()` (introduced in Phase 2) so the closed-set is `worktrees[] ∪ extraFolders[]`.

**Domain**: `workspace`

**Delivers**:
- `ExtraFolder { path, label, alias?, emoji?, kind }` type on `entities/workspace.ts`
- `IWorkspaceService.addExtraFolder` / `removeExtraFolder` / `updateExtraFolder` method signatures
- Service implementations with full add-time validation (exists, absolute, no `..`, readable, depth/entry threshold for blast-radius refusal)
- Round-trip persistence via existing `WorkspaceRegistryAdapter`
- `workspace:updated` mutation events on add/remove/update
- `workspaceService.validatePath()` extended so closed-set is `worktrees[] ∪ extraFolders[]`

**Depends on**: Phase 2 (so the closed-set extension is meaningful)

**Key risks**: Schema-extension surprise (old registry files without the field must still load). Service-method test coverage gaps could leak invalid paths into persistence.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Add `ExtraFolder` type to `packages/workflow/src/entities/workspace.ts` with fields `path: string`, `label: string`, `alias?: string`, `emoji?: string`, `kind: 'git' \| 'cloud' \| 'local'` | `workspace` | Type exported; existing workspace tests still compile | Finding 07; spec C-9, C-10 |
| 3.2 | Extend `WorkspacePreferences` with `extraFolders?: ExtraFolder[]`; absence → empty list | `workspace` | Round-trip test: load registry with no `extraFolders` → loads cleanly; save → field present only if non-empty | Backward-compatible |
| 3.3 | Add method signatures to `IWorkspaceService`: `addExtraFolder(slug, folder): Promise<Result>`, `removeExtraFolder(slug, path): Promise<Result>`, `updateExtraFolder(slug, path, patch): Promise<Result>` | `workspace` | Interface compiles; fakes provided for tests | Contract change |
| 3.4 | Implement add/remove/update in `WorkspaceService`. Validation at add-time: path absolute, no `..`, exists on disk, readable, fails if shallow scan exceeds depth/entry threshold | `workspace` | TDD: unit tests cover every validation refusal + success; mutation event emitted on each method | AC-10; spec § Risks "enormous tree" |
| 3.5 | Compute and persist `kind` at add-time: `cloud` if path matches `/Users/*/Library/CloudStorage/*`; `git` if `<path>/.git` exists; `local` otherwise | `workspace` | Tests cover each detection branch | Phase 7 reads this kind for type badges |
| 3.6 | Extend `workspaceService.validatePath()` implementation so the closed-set becomes `worktrees[] ∪ extraFolders[]`; return `{ kind: 'extra' }` when the match is in `extraFolders[]` | `workspace` | Routes hardened in Phase 2 now also accept extra-folder paths | Closes the loop |
| 3.7 | Verify persistence round-trip via `WorkspaceRegistryAdapter` — add, reload, remove, reload | `workspace` | Integration test against tmpdir registry | AC-03 |

---

### Phase 4: Watcher Lifecycle + CloudStorage Routing

**Objective**: Wire `CentralWatcherService` to start/stop watchers as extras are added/removed; route CloudStorage-prefix paths through a polling watcher instead of an event watcher; expose a manual-refresh endpoint per root.

**Domain**: `_platform/events`

**Delivers**:
- `lib/cloudstorage-classifier.ts` — pure path-prefix classifier
- `lib/polling-watcher.ts` — 5–10s `fs.stat`-driven change-detection loop conforming to `IFileWatcher`
- `CentralWatcherService.performRescan()` extended to walk `extraFolders[]` and route each to event-watch or poll-watch
- `POST /api/workspaces/[slug]/extras/refresh` — manual force-rescan for one root

**Depends on**: Phase 1 (substrate), Phase 3 (the `extraFolders[]` data the rescan reads)

**Key risks**: Polling watcher behavior diverges subtly from event watcher (e.g. coalesce semantics, debounce timing) — downstream consumers see inconsistent change shapes. CloudStorage classifier false-positives on user paths that *look* like the prefix but aren't actually file-provider mounts.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | Implement `lib/cloudstorage-classifier.ts`: `classifyPath(path): 'event-watch' \| 'poll-watch'`; prefix `/Users/*/Library/CloudStorage/*` → `poll-watch`; else `event-watch` | `_platform/events` | Unit tests cover OneDrive / iCloud / Dropbox / Google-Drive prefix variants + non-cloud paths | Finding 02 |
| 4.2 | Implement `lib/polling-watcher.ts`: 5–10s `fs.stat` walk emitting changes to the same `IFileWatcher` callback shape as the event watcher | `_platform/events` | Unit tests: file added/changed/removed in tmpdir → callback fires within poll interval; coalesce semantics match event-watch (last-event-wins) | Spec C-14 default |
| 4.3 | Extend `CentralWatcherService` to subscribe to `WorkspaceMutationEvent('workspace:updated')`; on event, walk `extraFolders[]` and start/stop watchers | `_platform/events` | Integration test: add extra folder → SSE event for changes in that folder fires within 1s (local) / 10s (cloud) | Findings 05, 09; AC-06, AC-07 |
| 4.4 | Wire hybrid routing in `performRescan()`: classifier picks event-watch or poll-watch per root; CloudStorage roots get `PollingWatcher`, others get `NativeFileWatcherAdapter` | `_platform/events` | Test: add cloud-prefix path → poll-watch registered; add plain path → event-watch registered | Finding 02 |
| 4.5 | Implement `POST /api/workspaces/[slug]/extras/refresh` — force re-scan for one root; routed through `workspaceService.validatePath()` | `_platform/events` | Endpoint returns 200 on known extra path; 400 on unknown path | Manual-refresh affordance |
| 4.6 | Run `just harness-verify "/workspaces/<slug>/browser"` after adding a fixture extra folder via direct API call | `_platform/events` | Browser tree updates within 1s for local extras and within 10s for cloud extras | AC-06, AC-07 |

---

### Phase 5: Multi-Root Tree Rendering

**Objective**: Refactor the file-browser state shape from single-root flat keys to per-root `Map<rootPath, …>`. Namespace React keys and child-entries cache to prevent collisions. Render N `<FileTree>` instances as siblings under per-root headers.

**Domain**: `file-browser`

**Delivers**:
- Updated `browser-client.tsx` with per-root state Maps (`rootEntries`, `childEntries`, `expandPaths`, `repoInfo`)
- Updated `file-tree.tsx` with `${rootPath}:${entry.path}` React keys
- New `root-header.tsx` component (label, type badge slot, kebab menu slot)
- `useFileNavigation` hook updated to cache by `(rootPath, dirPath)` tuple
- `useClipboard` "Copy Relative Path" computed relative to file's owning root
- Two-roots-same-subtree fixture test (no React key warnings, no cache contamination)

**Depends on**: Phase 3 (the `extraFolders[]` data drives rendering)

**Key risks**: Subtle bugs from converting flat keys to `Map<rootPath, …>` (e.g. clearing on worktree switch must preserve other roots' state). React key collisions if any consumer is missed. Performance regression if N roots cause O(N) work in tree-update hooks.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 5.1 | Refactor `browser-client.tsx` state shape: `rootEntries`, `childEntries`, `expandPaths`, `repoInfo` become `Map<rootPath, …>` | `file-browser` | Existing single-root flow still works (one entry in each Map); types updated | Finding 04; AC-04 |
| 5.2 | Namespace React keys in `file-tree.tsx`: change `key={entry.path}` to `key={`${rootPath}:${entry.path}`}` at every render site (folder + file-leaf; both ChangesView and FileTree) | `file-browser` | Two-roots-same-subtree fixture: no React key warnings in console | AC-05 |
| 5.3 | Update `useFileNavigation` to cache child-entries by `(rootPath, dirPath)` tuple instead of flat path | `file-browser` | Test: `src/index.ts` in root-A and `src/index.ts` in root-B fetch separately, no cache collision | Finding 04 |
| 5.4 | Implement `root-header.tsx`: per-root row with label/alias, slot for type badge (Phase 7 fills), slot for actions (Phase 8 fills), and a Refresh button | `file-browser` | Component renders for one root; clicking Refresh fires the Phase-4 endpoint | Foundation for Phase 7 + 8 |
| 5.5 | Render N `<FileTree>` instances as siblings under per-root headers in `browser-client.tsx` | `file-browser` | Two-root fixture renders both trees; expanding `src` in one doesn't expand the other | AC-04 |
| 5.6 | Update `useClipboard` "Copy Relative Path" to compute relative to file's owning root | `file-browser` | Test: file `notes/meeting.md` in cloud root copies `notes/meeting.md` (today's behavior generalized) | Spec C-6 |
| 5.7 | Run `just harness-verify "/workspaces/<slug>/browser"` with the two-root fixture | `file-browser` | Browser renders cleanly; no console errors | Gate |

---

### Phase 6: Add-Folder UI + Persistence Wiring

**Objective**: Surface a `+` button in the file-browser left panel that opens an add-folder modal, validates the picked path against the workspace's existing roots, calls the workspace service, and persists. Soft-warn past 10 roots.

**Domain**: `file-browser`

**Delivers**:
- `+` button in `LeftPanel`'s `PanelHeader.actions[]` slot
- `add-folder-modal.tsx` with folder picker + label/alias/emoji fields + path validation feedback
- `use-extra-folders.ts` hook orchestrating add/remove/update + persistence + soft warning
- `POST /api/workspaces/[slug]/extras` route routing to `addExtraFolder` service method
- Soft warning toast at 11+ roots (no hard cap)

**Depends on**: Phase 5 (rendering ready), Phase 3 (service methods exist)

**Key risks**: Native folder-picker affordance varies by browser; needs a graceful fallback. Validation error messages need to be user-friendly (not service-stack-trace-shaped).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 6.1 | Add `+` button to `LeftPanel` `PanelHeader.actions[]` slot; opens add-folder modal | `file-browser` | Button visible in browser; clicking opens modal | AC-01 |
| 6.2 | Implement `add-folder-modal.tsx`: folder picker (use existing file-input pattern or native `showDirectoryPicker`), label field (defaults to basename), optional alias + emoji | `file-browser` | Modal renders + accepts input; canceling closes without side effect | AC-01 |
| 6.3 | Implement `use-extra-folders.ts` hook: wraps add/remove/update; surfaces validation errors; shows soft-warning toast at 11+ | `file-browser` | Test: add 11 roots → 11th add succeeds + warning toast appears | Spec C-5 |
| 6.4 | Implement `POST /api/workspaces/[slug]/extras` route — body `{ path, label, alias?, emoji? }` — calls `workspaceService.addExtraFolder` | `file-browser` (cross-domain) | Test: valid body → 200; invalid path → 400 with structured error; bootstrap-cookie + auth gates intact | AC-01, AC-10 |
| 6.5 | Surface per-validation error in the modal (non-existent / not-absolute / has-`..` / unreadable / blast-radius) with clear remediation hints | `file-browser` | Manual test: each failure surfaces a useful message | AC-10 |
| 6.6 | Run `just harness-verify "/workspaces/<slug>/browser"` after adding a folder via the modal | `file-browser` | Folder appears in tree within 1s; persists across reload | AC-01, AC-03 |

---

### Phase 7: Per-Root Repo-Info + Type Indicators + Copy-URL Gate

**Objective**: Lazy-fetch `RepoInfo` per extra root on first interaction; surface `[Git]` / `[Cloud]` / `[Local]` type badge in each root header; gate FX007 Copy-URL menu items per file's owning root's kind.

**Domain**: `file-browser` (consumes `_platform/git`)

**Delivers**:
- Per-root `repoInfo` Map in `browser-client.tsx` populated lazy-on-expand
- Type badge rendered in `root-header.tsx` driven by `ExtraFolder.kind`
- `file-tree.tsx` + `use-clipboard.ts` look up owning-root's `repoInfo`; Copy-URL menu items hidden when `kind !== 'git'`
- Tests with mixed-root fixture covering each badge variant and menu visibility

**Depends on**: Phase 5 (per-root state), Phase 6 (extras can be added)

**Key risks**: Lazy fetch race conditions if user expands and right-clicks immediately. Per-root `RepoInfo` cache invalidation on root removal must be synchronous (FX007 Companion F002 pattern).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 7.1 | Add per-root `repoInfo` Map state in `browser-client.tsx`; lazy-fetch on first expand of an extra root | `file-browser` | Test: expanding a git extra fires one `/repo-info` request; expanding again doesn't | Finding 08 |
| 7.2 | Synchronously clear `repoInfo[rootPath]` when root is removed (FX007 F002 pattern) | `file-browser` | Test: remove root + immediately right-click on a stale file → no menu items leaked from the removed root | FX007 Companion F002 |
| 7.3 | Render `[Git]` / `[Cloud]` / `[Local]` badge + icon in `root-header.tsx` driven by `ExtraFolder.kind` | `file-browser` | Visual verification: each root header shows the correct badge | Spec C-12; AC-04 |
| 7.4 | Update `file-tree.tsx` to pass `repoInfo` for the owning root into each `<ContextMenuItem>` site | `file-browser` | Right-click on a file inside a git extra shows Copy-URL items; inside a cloud or local extra hides them | AC-08 |
| 7.5 | Update `use-clipboard.ts` Copy-URL handlers to no-op gracefully when `kind !== 'git'` | `file-browser` | Test: calling handler with non-git repoInfo doesn't throw, doesn't write to clipboard | AC-08 |
| 7.6 | Run `just harness-verify "/workspaces/<slug>/browser"` with mixed-root fixture (git + cloud + local extras) | `file-browser` | All three badges render; Copy-URL menu visible only inside git root | AC-04, AC-08 |

---

### Phase 8: Reorder + Alias + Removal + Settings + Docs

**Objective**: Final UX polish — Move Up / Move Down context menu items (primary reorder) + drag-to-reorder (secondary); alias rename inline; instant remove with 5s undo toast; settings-page accordion for managing extras. Documentation: `docs/how/multi-folder-tree.md`, README mention, domain.md History rows.

**Domain**: `file-browser` + docs

**Delivers**:
- `−` button + 5s undo toast in `root-header.tsx` (in-session undo only per spec C-11)
- Move Up / Move Down context menu items in `root-header.tsx` (primary, keyboard-accessible)
- Drag-to-reorder for root nodes in `file-tree.tsx` (secondary affordance)
- Alias inline edit (click label → input → save)
- `extra-folders-settings.tsx` accordion in `/settings/workspaces` (replicates `workspace-settings-table` pattern)
- `docs/how/multi-folder-tree.md` — trust model, CloudStorage caveats, system-tuning hints
- README mention + link to how-doc
- Domain.md History + Concepts/Composition updates for `workspace`, `file-browser`, `_platform/events`

**Depends on**: Phase 7

**Key risks**: Undo persistence semantics (in-session only per clarify session — must not surprise users who expect post-reload undo). Drag-and-drop for root-level reorder is a different affordance than drag inside the tree; semantic ambiguity warned about in research.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 8.1 | Add `−` button to `root-header.tsx`; on click, removes root + shows 5s undo toast | `file-browser` | Click → root removed; toast appears; clicking Undo within 5s restores state; after 5s toast clears | Spec C-8, C-11; AC-02, AC-11 |
| 8.2 | Implement Move Up / Move Down context menu items in `root-header.tsx`; call `updateExtraFolder` with new position | `file-browser` | Keyboard-accessible; reorder persists across reload | Spec C-7 |
| 8.3 | Implement drag-to-reorder for root nodes in `file-tree.tsx` (secondary affordance; visual placeholder line during drag) | `file-browser` | Drag root-B above root-A → order updates + persists | Spec C-7 |
| 8.4 | Implement alias inline edit in `root-header.tsx` (click label → input → save on blur/Enter) | `file-browser` | Rename works; persists; falls back to basename when alias is empty | Spec C-10 |
| 8.5 | Implement `extra-folders-settings.tsx` accordion on `/settings/workspaces` page; replicates `workspace-settings-table` row pattern (label, emoji, kind badge, remove) | `file-browser` (cross-domain) | Accordion expands; rows match other workspace preference rows visually | Finding 09 |
| 8.6 | Author `docs/how/multi-folder-tree.md` covering trust model, CloudStorage caveats, system-tuning hints, known limitations | docs | Doc renders cleanly; cross-linked from README and from `docs/domains/file-browser/domain.md` | Spec § Documentation Strategy |
| 8.7 | Update domain.md files: `workspace` (History + Concepts entry + Contracts table rows), `file-browser` (History + Composition), `_platform/events` (History noting substrate swap + CloudStorage polling) | docs | Each domain.md reflects current state | Plan-6 progress gate |
| 8.8 | Update `docs/domains/domain-map.md` Health Summary table for the three modified domains | docs | Table reflects current contracts | Plan-6 progress gate |
| 8.9 | Run `just harness-verify "/workspaces/<slug>/browser"` + manual scale baseline (10 extras, mix of types) | `file-browser` | AC-12 met: ≤2s initial render with 10 extras; tree responsive | AC-12 |

---

## Acceptance Criteria

From spec (verbatim — each will be re-tested in plan-6 implementation):

- [ ] AC-01 Add Folder works (+ button → folder picker → root appears within 1s)
- [ ] AC-02 Remove Folder works (− button → root disappears; folder on disk untouched)
- [ ] AC-03 Persistence across page reload and dev-server restart
- [ ] AC-04 Mixed-type rendering (git + plain + cloud extras render with distinct indicators)
- [ ] AC-05 Path-name collision handled (two roots both containing `src/index.ts` work; no React key warnings)
- [ ] AC-06 Live updates for local extras (≤ 1s)
- [ ] AC-07 Updates for CloudStorage extras (≤ 10s OR via manual Refresh)
- [ ] AC-08 Type-aware Copy-URL menu (visible in git roots only)
- [ ] AC-09 Path-validation closed-set rejection (every read route returns 400 for unknown paths)
- [ ] AC-10 Add Folder validates input (non-existent / not-absolute / has-`..` / unreadable refused with clear message)
- [ ] AC-11 Removing last extra returns to clean single-worktree state
- [ ] AC-12 Scale baseline: 10 extras, ≤ 2s initial render, no fd exhaustion
- [ ] AC-13 Harden pass observable from outside (400 on unknown paths via every route)
- [ ] AC-14 Startup pre-flight warning for low `ulimit` / `inotify`

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| macOS CloudStorage event drops → user sees stale tree | High | High | Phase 4 polling watcher; per-root manual Refresh button; documented in `docs/how/multi-folder-tree.md` |
| Harden pass misses a route → silent privilege widening | Medium | Critical | Phase 2 audit task lists every route; companion review on Phase 2 commits; per-route negative test mandatory |
| `@parcel/watcher` native build fails in some dev environments | Low | High | Phase 1.1 verifies build on macOS + Linux; CI catches early; fallback path: keep raw `fs.watch` behind a feature flag during Phase 1 only |
| Watcher substrate swap regresses existing consumers (recent-changes-feed, PR-view) | Medium | High | Phase 1.3 explicit shape-preservation test; harness-verify after Phase 1 |
| User adds enormous tree (`/Users`, `/`) → fd exhaustion at watch-time | Low | High | Phase 3.4 add-time blast-radius refusal (depth/entry threshold); Phase 1.4 preflight warns user about constrained limits |
| React key collisions when two roots share subpath names | Medium | Medium | Phase 5.2 namespace; Phase 5.6 explicit two-roots-same-subtree test |
| HMR singleton lifecycle for new watchers leaks listeners | Low | Medium | If new client-side singletons are introduced in Phases 4/5, pin to `globalThis.__multiRootUnsub__` per recent-changes-feed precedent |
| Drag-to-reorder semantic ambiguity (drag into vs. between roots) | Medium | Low | Phase 8.3 visual placeholder line during drag; Move Up/Down remains primary affordance |
| Removed root's stale `repoInfo` leaks into context menu before clear | Low | Medium | Phase 7.2 synchronous clear (FX007 F002 pattern) |
| User on multi-tenant machine surprised that extras grant cross-user access | Low | Medium | Documented in `docs/how/multi-folder-tree.md` as a known trust-model assumption; revisit if app becomes multi-tenant |

---

## Constitution & Architecture Compliance

This plan respects the constitution's Clean Architecture principle and the architecture document's package boundaries. No deviations required.

- **Clean Architecture (Constitution Principle 1)**: `IFileWatcher` interface preserved across Phase 1 substrate swap; service-method signatures added to `IWorkspaceService` before implementation. `validatePath()` is exposed as a workspace-service capability (interface in `packages/workflow/src/interfaces/`, implementation in `packages/workflow/src/services/workspace.service.ts`) — route handlers in `apps/web` call it through the workflow public surface. This is the canonical Service+Interface pattern from Constitution Principle 1.
- **Package boundaries (Architecture § 2)**: `apps/web` consumes `packages/workflow` via its existing public exports. Phase 2's `validatePath()` is added as a method on `IWorkspaceService` (interface in `packages/workflow/src/interfaces/`, implementation in `packages/workflow/src/services/workspace.service.ts`) — route handlers in `apps/web` call it via the workflow public surface. The previously-proposed `apps/web/app/api/_lib/` location was revised after plan-4 doctrine review (idioms.md § 11): workspace-domain logic belongs in `packages/workflow`, not in app-specific `_lib`. No imports cross domain boundaries in violation of `_platform/git` / file-browser / workspace boundaries — file-browser consumes the public `repo-info` API endpoint, not internal modules.
- **Dependency direction (Constitution Principle 1)**: `file-browser` (UI) depends on `workspace` (entity + service) and `_platform/events` (file watcher contract); never inverse. `@parcel/watcher` is a runtime adapter dep, swappable behind `IFileWatcher`.

No Deviation Ledger entries required.

---

## Workshops Status

The spec identified one Workshop Opportunity ("Extras Add/Remove UX + state model"). All clarifying questions in that workshop's scope were resolved in the clarify session (C-5 through C-13). **No workshop required**; design decisions are locked in spec § Clarifications.

---

## Next Steps

1. Run `/plan-4-v2-complete-the-plan --plan "/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/084-random-enhancements-3/multi-folder-tree-plan.md"` to validate readiness.
2. On `READY`: run `/plan-5-v2-phase-tasks-and-brief --phase "Phase 1: Watcher Library Migration + Pre-flight" --plan "<PLAN_PATH>"` for the first phase dossier.
3. Then `/plan-6-v2-implement-phase-companion --phase "Phase 1: ..." --plan "<PLAN_PATH>"` to implement with companion review.
