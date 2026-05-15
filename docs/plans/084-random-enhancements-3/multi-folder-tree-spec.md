# Multi-Folder File Browser Tree

**Mode**: Full
**Spec Version**: 1.1.0
**Created**: 2026-05-11
**Clarified**: 2026-05-12
**Status**: CLARIFIED (ready for plan-3-v2-architect)
**Plan Folder**: `docs/plans/084-random-enhancements-3/`
**Research**: [`multi-folder-tree-research.md`](./multi-folder-tree-research.md) + [`external-research/`](./external-research/)

📚 This specification incorporates findings from `multi-folder-tree-research.md` (six parallel exploration agents) and three deep-research dossiers (`external-research/cloudstorage-watching.md`, `multiroot-ux-patterns.md`, `watcher-scaling.md`).

---

## Research Context

Six parallel exploration agents mapped the current single-root pipeline end-to-end (entry route → state → fetch → cache → SSE filter → React keys). Three Perplexity Deep Research dossiers covered macOS CloudStorage watch reliability, VS Code/JetBrains/Zed multi-root UX patterns, and `fs.watch` recursive-watcher scaling. Key takeaways the spec reflects:

- **Single-root assumptions are baked into ≥8 layers**: URL param, SSR fetch, child-entries cache, expand state, React keys, repo-info, SSE filter, "Copy Relative Path" semantics. None of these is hard to fix in isolation; the integration is what makes this CS-4.
- **Path-validation surface is inconsistent today**: FX007's `repo-info` route is canonical 2-layer; other routes (`files`, `files/raw`, `pr-view`, `file-notes`) use defensive-only checks. The day "any folder the user picks" is valid workspace state, those routes silently widen.
- **macOS CloudStorage file-watching is unreliable** with raw `fs.watch` (FSEvents on file-provider mounts drops events; codebase has zero existing handling). The canonical pattern is prefix-detect + 5–10s polling for those paths; `@parcel/watcher` with FSEvents for everything else.
- **VS Code's unified sibling tree** is the canonical UX baseline. Five recurring complaints to design around: folder ordering at scale, terminal `cwd` ambiguity, debug-config active-root confusion, mixed local/remote, monorepo scale. Numbers 1, 4, and 5 are directly relevant to this feature.

---

## Summary

Today the file browser shows one top-level folder per workspace (the active git worktree). Users frequently want to navigate between a code repository and a related folder elsewhere on disk — most commonly a docs/notes folder, often in OneDrive or iCloud. Switching to a separate workspace breaks the flow.

This feature lets a user pin **additional folders** to a workspace so they appear as **siblings** in the same browser tree. A small `+` button opens a folder picker; each pinned folder gets a `−` to remove. Pins persist per-workspace. The result feels like VS Code's multi-root workspaces but with a much smaller surface area (no per-root settings inheritance, no per-root tasks/debug, no global search scope toggle — just files in a tree).

The motivating example is "git repo at `~/github/jordo` plus OneDrive notes at `~/Library/CloudStorage/OneDrive-Microsoft/Jordo-IQ` showing side-by-side."

---

## Goals

- A user can add an existing folder (any folder they can read on disk) as an extra root on the current workspace's file browser, via a clearly-discoverable `+` affordance.
- A user can remove an extra root with a single click, without affecting files on disk.
- Extra roots survive page reloads, dev-server restarts, and worktree switches within the workspace.
- Multiple roots — including a mix of git, plain, and cloud-synced — render as sibling top-level nodes in the same tree, with each root visually distinguished by its type.
- File-system events propagate to the tree for as many extra roots as the OS reliably supports (with a graceful fallback for cloud-synced folders that don't emit reliable events).
- Existing right-click affordances (Copy Path, Copy URL from FX007, Create/Rename/Delete) work consistently across all roots, gated by what makes sense for each root type.
- The path-validation guarantee that "every file-API route only reads paths the workspace knows about" is preserved and strengthened, not weakened, by this feature.
- A user with a typical setup (≤10 roots, mix of local + one or two CloudStorage) experiences no noticeable degradation in tree responsiveness.

---

## Non-Goals

- **Cross-workspace shared folders.** Extras are per-workspace, not user-global.
- **Per-root settings / inheritance.** No per-root preferences beyond the basic identity (label, alias, emoji). No per-root task or debug configs (we don't have those concepts anyway).
- **Multi-tenant trust model.** Single OS user; no per-user ownership of extra folders; no per-user filter on what shows up. (Same trust model as the existing workspace registry.)
- **Cross-root global search.** Search-across-roots is desirable but out of v1 scope. Search remains scoped to its existing surface.
- **Active-root concept beyond focus.** Selecting a root in the tree highlights it; we do not introduce an "active root" that drives terminal `cwd`, debug config, or task execution (no terminal/debug surface exists here).
- **Symlink-following outside a root.** Symlinks whose target resolves outside the root that contains them are not opened (security: prevents lateral movement via a malicious symlink in a CloudStorage folder).
- **Reorder via drag-only.** Drag-to-reorder may be supported as a secondary affordance but is not the primary one (accessibility + the VS Code complaint patterns make explicit Move Up/Down the canonical choice).
- **Windows support.** v1 targets macOS-primary, Linux-secondary, consistent with the rest of the project.
- **Removal of the primary workspace root.** The current worktree(s) stay in the tree by default and cannot be removed via the `−` affordance — only extras can be removed.
- **Inline file diff or "what changed in the cloud folder" indicators.** Cloud-sync status badging (synced/syncing/error) is out of v1 scope; the type indicator is a static "[Cloud]" label.

---

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|----------------------|
| `workspace` | existing | **modify** | Add `extraFolders[]` to `WorkspacePreferences`; add service methods to add/remove; emit mutation events; extend closed-set path-validation helper |
| `file-browser` | existing | **modify** | Render N roots as siblings; add `+`/`−` UI; settings page for managing extras; per-root state namespacing; type indicators |
| `_platform/events` | existing | **modify** | Watcher substrate swap (migrate from raw `fs.watch` to a library that scales to N roots without per-fd cost); add hybrid watch+poll routing for CloudStorage paths; lifecycle events when roots are added/removed |
| `_platform/git` | existing | **consume** | Per-root `RepoInfo` fetch (lazy, on first interaction with a root) to drive the "[Git]" type indicator and gate the FX007 "Copy URL" menu items |
| `_platform/state` | existing | **consume** | Existing patterns for per-workspace state lookups (no changes) |

No new domains. No new domain-map edges (file-browser already consumes from workspace and from `_platform/*`).

### Domain Review

| Domain | Concern | Resolution |
|---|---|---|
| `workspace` | New field `extraFolders[]` is additive to a JSON-persisted registry. Existing entries without the field must keep loading. | Field is optional; absence treated as empty list. Schema version bump only if forced by migration; otherwise no migration. |
| `workspace` | Closed-set path-validation today is `worktrees[].path`. After this feature, it must be `worktrees[].path ∪ extraFolders[].path`. A new exported helper is the right shape. | Add a `validateWorkspacePath(slug, path)` helper to the workspace service; route all callers through it. (Harden pass is a prerequisite phase.) |
| `file-browser` | Several state shapes (`childEntries`, `expandPaths`, `repoInfo`, React keys) are flat-keyed by path. Two roots that share a subpath name will collide. | Namespace all by `rootPath`. Cache becomes `Map<rootPath, ...>`; keys become `${rootPath}:${entry.path}`. |
| `_platform/events` | Today: one recursive `fs.watch` per known worktree. macOS hits a hard ~4,096 fs.watch ceiling regardless of `ulimit`. Adding N user-chosen roots without changing the substrate risks silent scaling failure. | Substrate swap to a library that uses FSEvents directly on macOS (no per-file fd cost), with FTS/inotify on Linux. Phase 1 prerequisite. |
| `_platform/events` | CloudStorage paths (`/Users/*/Library/CloudStorage/*`) emit unreliable file events on macOS regardless of library. | Hybrid: prefix-detect CloudStorage roots, route them through a polling watcher (5–10s) instead of an event watcher. Provide manual "Refresh" affordance per root either way. |
| `_platform/git` | A non-git extra root must not surface the "Copy URL" menu items shipped in FX007. | The existing repo-info pattern returns `kind: 'unknown'` for non-git paths, and FX007 already gates the menu on that. Per-root repo-info preserves the gate. |

---

## Complexity

**Score**: CS-4 (large)

**Breakdown**: S=2, I=1, D=1, N=1, F=2, T=2 (total = 9)

- Surface Area (2): touches workspace persistence, every file-API route (for harden pass), the file-tree component + browser-client wiring, the central watcher service, settings page UI, and domain.md files across 3 domains.
- Integration (1): one new external library candidate (the watcher substrate, e.g. `@parcel/watcher`) — internally-managed swap, not an external service.
- Data/State (1): additive schema change to `WorkspacePreferences`; no migration; backward-compatible.
- Novelty (1): some discovery remains around the migration semantics (do we run new + old watchers in parallel during cutover?) and around the CloudStorage detection edge cases (network drives that aren't CloudStorage, symlinks into CloudStorage, etc.). Most of the design is well-pinned by research.
- Non-Functional (2): security (path-validation harden pass is load-bearing), performance (must scale to ~10 roots without degradation), reliability (CloudStorage watch fallback), fd-limit hardening.
- Testing/Rollout (2): needs integration tests with real watchers across multiple OS configurations; the harden pass needs explicit per-route test coverage; CloudStorage polling needs a test fixture that simulates a file-provider mount or at least a "watch fails" scenario.

**Confidence**: 0.75 (high — research is unusually deep for a v1 spec; main uncertainty is around watcher-library migration mechanics in HMR/dev-server lifecycle)

**Assumptions**:
- Single OS-user trust model is acceptable (matches current chainglass posture).
- Target is macOS primary, Linux secondary; Windows not in scope.
- ~10 extra roots is the practical upper bound; users with more can be served with a soft warning rather than a hard refusal.
- The harden pass for path validation is sequenced as Phase 1 (before the user-facing feature); it's necessary regardless of the multi-root work shipping, and bundling it preserves correctness.
- The `_platform/events` watcher service can be swapped to a new library without breaking the recent-changes-feed, live-monitoring-rescan, or PR-view consumers (they read events, they don't depend on the underlying API).

**Dependencies**:
- FX007 (Copy URL items, already landed) — re-used for per-root git-aware menus.
- Plan 084's existing `live-monitoring-rescan` work (already landed) — the mutation event taxonomy is reused for "extra folder added/removed."
- A library choice (provisionally `@parcel/watcher` per external research, but the spec deliberately does not name a library — that's an implementation decision for plan-3).

**Risks**:
- macOS CloudStorage event reliability is fundamentally OS-level; even with polling fallback some users will see stale state. Mitigation: per-root manual refresh button.
- Path-validation harden pass touches many routes; missing one = vuln. Mitigation: shared helper + companion review on the harden pass commits.
- React-key / cache-key collisions when two roots share a subpath name are silent bugs if missed. Mitigation: add an explicit test that adds two roots with identical subtrees.
- Watcher library swap in `_platform/events` could regress existing consumers (recent-changes-feed, PR-view). Mitigation: feature-flag the substrate during Phase 1 cutover, or run new+old in parallel briefly with reconciliation.

**Phases** (suggested high-level, to be confirmed in plan-3):
1. Watcher substrate swap + startup pre-flight check (ulimit / inotify).
2. Path-validation harden pass (shared `validateWorkspacePath` helper; route every existing path-accepting endpoint through it).
3. Workspace contract extension (`ExtraFolder` type, `extraFolders[]` field, service methods, mutation events).
4. Watcher lifecycle for extras, including CloudStorage prefix-detect + polling routing.
5. Multi-root tree rendering (state shape, namespacing, N `<FileTree>` instances).
6. Add-folder UI (`+` button, modal, validation).
7. Per-root repo-info + type indicators + Copy-URL gate.
8. Removal UX, reorder (move up/down), alias edit, polish.

---

## Acceptance Criteria

1. **Add Folder works**: From the file browser, the user clicks a `+` affordance, picks any folder they can read on disk, and the folder appears as a new sibling root in the tree within 1 second. The folder shows its name (or chosen alias), an icon/badge for its type, and is expandable.

2. **Remove Folder works**: From the file browser, the user removes an extra root via the `−` (or context menu) and the root disappears from the tree immediately. The folder on disk is untouched.

3. **Persistence**: Pinned roots survive page reload and dev-server restart, scoped to the workspace they were added to. Opening a different workspace shows that workspace's extras, not this one's.

4. **Mixed-type rendering**: A workspace with one git worktree + one git extra root + one plain folder extra + one CloudStorage extra shows all four roots, with distinct visual indicators for type. Expanding any root lists its contents correctly.

5. **Path-name collision**: A workspace with two roots that both contain a `src/index.ts` (different actual files) selects only the clicked file when the user clicks one — no duplicate-key warnings in the console, no cache contamination.

6. **Live updates for local extras**: When a user edits a file inside a local (non-CloudStorage) extra root using a different tool, the change is reflected in the tree within 1 second (matching today's single-worktree behavior).

7. **Updates for CloudStorage extras**: When a user edits a file inside a CloudStorage extra root using a different tool, the change is reflected in the tree within an acceptable window (target ≤ 10 seconds) OR via a manual "Refresh" affordance on the root header.

8. **Type-aware Copy-URL menu**: Right-click on a file inside a git-typed root shows the FX007 "Copy URL (this branch)" and "Copy URL (default branch)" items. Right-click on a file inside a non-git-typed root hides those items (no error).

9. **Path-validation closed-set**: A direct API call to any file-reading route with a `worktree=` param that is neither in the workspace's `worktrees[]` nor in its `extraFolders[]` is rejected with a 400 error. Defensive-only routes are upgraded as part of this work.

10. **Add Folder validates input**: Attempting to add a folder that (a) doesn't exist, (b) isn't an absolute path, (c) contains `..`, or (d) the process can't read, is refused with a clear UI error. The user can correct and retry.

11. **Removing the only extra is fine**: With one extra root pinned, removing it returns the tree to its single-worktree state cleanly.

12. **Scale baseline**: A workspace with 10 extra roots (mix of local and CloudStorage), each containing realistic project content, renders the initial tree in ≤ 2 seconds and remains responsive to expand/collapse/click during normal use. No EMFILE or watcher-exhaustion errors are emitted on macOS or Linux on a default dev machine with reasonable system limits.

13. **Harden pass observable from the outside**: After Phase 2 lands, requesting a known worktree path via every file-API route succeeds; requesting an unrelated absolute path via the same routes fails with 400 (was sometimes 200 before this work).

14. **Startup pre-flight warning**: If the dev server starts on a system with `ulimit -n` < 10,000 (macOS) or `fs.inotify.max_user_watches` < 500,000 (Linux), a warning is emitted to the dev console naming the limit and the recommended remediation command.

---

## Risks & Assumptions

| Risk / Assumption | Likelihood | Impact | Mitigation |
|---|---|---|---|
| macOS CloudStorage events drop silently → user sees stale tree | High | High | Polling fallback for prefix-matched CloudStorage paths; per-root manual Refresh button; documented limitation |
| Harden pass misses a route → silent privilege widening | Medium | Critical | Shared `validateWorkspacePath` helper; companion review on harden-pass commits; explicit test per route |
| Watcher library swap regresses existing consumers (recent-changes-feed, PR-view) | Low | High | Feature-flag substrate during cutover; verify SSE event shape unchanged for consumers |
| User adds an enormous tree (`/Users`, `/`) and the watcher exhausts fds | Low | High | At add-time, refuse paths above a depth/entry threshold (shallow scan); inform user |
| React key collisions when roots share subpath names | Medium | Medium | Namespace all keys with `rootPath`; explicit two-roots-same-subtree test |
| Per-workspace persistence file grows unbounded with old/stale extras | Low | Low | UI surfaces all extras with last-accessed; user can remove dead entries; no auto-prune in v1 |
| User adds a network mount (NFS / SMB) that behaves like CloudStorage but doesn't match the prefix heuristic | Medium | Low | v1: accept the imperfection; add a "Refresh" button to every root regardless of type; revisit detection in Phase 2 |
| Trust model: any process that can write `~/.config/chainglass/workspaces.json` can grant read access to any path | Documented | Documented | Out of scope for v1; matches existing posture; consider per-user ownership claim if app becomes multi-tenant |

---

## Open Questions

Most of the original 10 open questions were resolved or defaulted in § Clarifications. One remains explicitly open.

1. **CloudStorage default refresh behavior** [NEEDS CLARIFICATION (deferred from clarify session)]: when a user adds a CloudStorage-prefix folder, should the system auto-enable polling (5–10s interval), start with manual-refresh-only and require opt-in, or surface a one-time per-folder prompt? Recommended default: **auto-poll silently** at 5–10s, with a per-root manual Refresh button always available (lowest friction; resource budget acceptable). Plan-3 may proceed with this default unless explicitly revisited.

All other open questions are resolved in § Clarifications above.

---

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|---|---|---|---|
| Extras Add/Remove UX + state model | UI Flow + Data Model | Eight open questions in § Open Questions are UX-shape decisions; a focused design pass would lock them as a coherent set rather than litigating per-PR | What's the canonical add flow? What does the row look like? What fields persist? When can the user un-remove? Are aliases editable inline or only via settings? |

The watcher substrate swap and the path-validation harden pass are well-mapped by research and don't need additional workshops; their detailed design belongs in plan-3 architect.

---

## Testing Strategy

**Approach**: Hybrid

**Rationale**: Different parts of this work have different risk profiles, and applying one testing style to all of them is wasteful in some places and reckless in others.

**Focus areas**:
- **Full TDD** for the path-validation harden pass — security-critical, the failure mode is silent privilege widening, and the shared `validateWorkspacePath` helper is the natural unit-test target. Every route that previously did defensive-only checks gets an explicit per-route test that an unknown path returns 400.
- **Full TDD** for the watcher substrate swap and the CloudStorage prefix-detection + polling logic — reliability-critical and the algorithm is amenable to unit tests against in-memory fixtures.
- **Lightweight tests** for UI state shape changes (per-root state maps, namespaced React keys, expand-state per root) — assert non-collision via explicit "two roots, same subtree" fixture; don't aim for full coverage of every render path.
- **Lightweight tests** for the workspace contract extension (`extraFolders[]` persistence round-trip; mutation event emission).
- **Manual verification** for CloudStorage polling behavior against actual cloud-synced folders (OneDrive, iCloud Drive) — these are too environment-dependent to automate cleanly in CI.
- **Manual verification** for system-tuning pre-flight warnings (low `ulimit` / `inotify`) — the warning trigger is correct by construction; the value is the human seeing it.

**Excluded**:
- We don't add tests for "does macOS FSEvents drop events on CloudStorage" — that's the OS's behavior, not ours; we document it.
- We don't add load tests at 50 roots — out of scope (10-root scale baseline is enough).

**Mock Usage**: Targeted mocks only — external systems (file watchers, OS-level fs-events stream) may be mocked at module boundaries. Real git repos in temporary directories for any git-cli paths (matching the PR-view + FX007 convention). Real filesystem fixtures (tmpdir) for path-validation tests — `fs.mkdtempSync` + real files, no `fs` module mocking. No `vi.mock` of `node:child_process` or `node:fs` core modules (the FX007 attempt to mock `execFile` failed; we know).

---

## Documentation Strategy

**Location**: Hybrid (README + `docs/how/`)

**Rationale**: Add-folder is a discoverable user-facing feature that benefits from a short README hook so existing users notice it; the trust-model and CloudStorage caveats need depth that doesn't belong in a README.

**Deliverables**:
- README: one-paragraph "Multi-folder workspaces" entry in the features list, linking to the how-doc.
- `docs/how/multi-folder-tree.md`: trust-model (single OS user; what each root grants); CloudStorage caveats and the per-root manual Refresh affordance; system-tuning hints (`ulimit -n` / `fs.inotify.max_user_watches`); known limitations (no Windows, no cross-root search in v1).
- `docs/domains/workspace/domain.md` — History row + Concepts entry for "Pin extra folder to workspace" + Contracts table row for `addExtraFolder` / `removeExtraFolder`.
- `docs/domains/file-browser/domain.md` — History row + dependencies update.
- `docs/domains/_platform/events/domain.md` — History row noting the substrate swap.

---

## Clarifications

### Session 2026-05-12

The four standard clarifications were resolved together; four spec-specific clarifications followed. Three were directly answered, four were left at dossier-recommended defaults (no controversial trade-off surfaced), and one was deferred to plan-3.

#### Resolved (user-confirmed)

| # | Question | Answer | Implication for spec / plan |
|---|---|---|---|
| C-1 | Workflow Mode | Full | Multi-phase plan with all gates; no `Mode: Simple` shortcut |
| C-2 | Testing Strategy | Hybrid | Full TDD for harden pass + watcher swap; Lightweight for UI; Manual for CloudStorage. See § Testing Strategy. |
| C-3 | Mock Usage | Targeted | External systems only; real git in tmpdir; real fs fixtures for path validation; no mocking of `node:child_process` or `node:fs`. |
| C-4 | Documentation Strategy | Hybrid (README + docs/how/) | One paragraph in README; full detail at `docs/how/multi-folder-tree.md`. See § Documentation Strategy. |
| C-5 | Number-of-extras policy | Soft warning at 10 (no hard cap) | No refusal logic for the 11th root; toast warning past the threshold. Watcher pre-flight check + scale baseline remain AC-12 / AC-14. |
| C-6 | "Copy Relative Path" semantics | Relative to that file's root (today's behavior naturally extended) | No new menu item; existing behavior generalized; `OQ-4` resolved. |
| C-7 | Reorder UX | Move Up / Move Down context menu (primary) + drag (secondary) | Plan-3 must spec both. Move Up/Move Down are keyboard-accessible and address the documented VS Code complaint pattern. `OQ-5` resolved. |

#### Defaulted (no user pushback expected; locked at dossier recommendation)

| # | Question | Default applied | Why this is the right default |
|---|---|---|---|
| C-8 | Removal confirmation | Instant + undo toast (5s in-session) | VS Code precedent; dossier rec; matches "trust the operator" posture. |
| C-9 | Field naming | `extraFolders` | Matches user's "add other folders" language; dossier rec. |
| C-10 | Custom aliases | Yes, supported from day 1 | Trivial storage cost; VS Code precedent; avoids future migration. |
| C-11 | Undo persistence | In-session only (5s toast) | Across-reload undo requires a shadow-copy mechanism; deferred unless real demand surfaces. |
| C-12 | Visual indicator scope | Text badge ([Git] / [Cloud] / [Local]) + icon | Dossier recommendation; redundancy aids accessibility. |
| C-13 | Existing worktrees as extras | Clean separation — worktrees are git-managed and auto-discovered; extras are user-pinned via `+` | Reduces consumer-side filter burden; preserves FX007's git-typed assumption on `worktrees[]`. |

#### Deferred (left in § Open Questions)

| # | Question | Why deferred | Recommended default (plan-3 may lock) |
|---|---|---|---|
| C-14 | CloudStorage default refresh behavior | User did not select an option; no signal either way | Auto-poll silently (5–10s) for prefix-matched CloudStorage paths, with per-root manual Refresh button always available. Lowest user friction; resource budget is acceptable (~5–10% CPU on one core for ten cloud folders). Plan-3 should treat this as resolved unless user revisits. |

### Domain Review (snapshot)

| Domain | Confirmation |
|---|---|
| `workspace` | Boundary acceptable; `extraFolders[]` is workspace-state, not global-user. Additive schema change, no migration. |
| `file-browser` | Boundary acceptable; consumes new contract from workspace; renders + manages the multi-root UI. |
| `_platform/events` | Substrate swap is in-domain (consumers depend on the contract, not the underlying library). Migration risk acknowledged in § Risks. |
| `_platform/git` | Pure consume; no contract changes; FX007 contract preserved. |

### Harness Readiness (snapshot)

- Harness exists at `docs/project-rules/harness.md` (L3+ per FX007's `harness-verify` recipe addition).
- Sufficient for this work: yes. The `harness-verify` recipe is exactly the failure mode this plan needs to catch (`@parcel/watcher` is a native addon — Turbopack-style chunking surprises are real).
- Required check after every phase that touches the watcher service or the file-browser route boundary: `just harness-verify "/workspaces/<slug>/browser"`.
