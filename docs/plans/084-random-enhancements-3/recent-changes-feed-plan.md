# Recent Changes Feed Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-05-03
**Spec**: [recent-changes-feed-spec.md](./recent-changes-feed-spec.md)
**Research**: [recent-changes-feed-research.md](./recent-changes-feed-research.md)
**UI Workshop**: [workshops/005-recent-changes-feed-ui.md](./workshops/005-recent-changes-feed-ui.md) — authoritative design
**Status**: DRAFT

## Summary

A new main-panel view in the file browser that shows a vertical, scrolling stack of the most-recently-changed files repo-wide, each rendered with a type-specific media-rich preview (images inline, videos with native controls, audio controls, markdown excerpts, code excerpts). The newest change is always at the top; live updates promote files into place via the **existing** `_platform/events` `file-changes` SSE channel — no new channel, no new domain. The plan composes ~90% of its primitives from existing contracts (`useFileChanges`, `getRecentFiles`, preview-cards, Shiki, raw-file API, `FileIcon`) and adds: a virtualized feed view, two new excerpt cards (markdown + code), an extended `CardActions` action set (copy-rel + copy-abs + open + overflow), a `view` URL-param branch in the main-panel decision, and a settings section. Workshop 005 is the binding design — do not contradict it during implementation.

## Target Domains

| Domain | Status | Relationship | Role |
|---|---|---|---|
| `file-browser` | existing | **modify** | Hosts the new feed view, extended `CardActions`, `view` URL-param branch, settings entry, entry-point button |
| `_platform/viewer` | existing | **consume** | `detectContentType`, `MarkdownServer`, `highlightCode`, `image-url.ts`. `truncateMarkdown` utility stays local to file-browser per Q5 clarification (promote later if a second consumer surfaces) |
| `_platform/events` | existing | **consume** (no contract changes) | `useFileChanges`, `FileChangeProvider`, existing `file-changes` multiplexed SSE channel. **Strictly consumed unchanged** (spec § I1 — binding constraint) |
| `_platform/panel-layout` | existing | **modify (small)** | `ExplorerPanel` adds an entry-point button; otherwise consumed unchanged |
| `_platform/themes` | existing | **consume** | `FileIcon`, `resolveFileIcon` |
| `_platform/workspace-url` | existing | **consume** | `fileBrowserParams` (additively extended with `view` enum) |
| `_platform/settings` | existing | **modify (cross-domain — drop section file at extension point)** | Adds `recent-feed-settings.tsx` under `_platform/settings/sections/` per the settings-section drop-in convention (Plan 047 USDK Phase 5; Plan 073 file-icons precedent) |
| `_platform/sdk` | existing | **consume** | `IUSDK` (open-feed command + keybinding), `ISDKSettings` / `useSDKSetting` (persisted feed settings) |

**Zero new domains.** No new SSE channels. **Two cross-domain modifications** (both small, additive, follow established precedent): `_platform/panel-layout/components/explorer-panel.tsx` (entry-point button) and `_platform/settings/sections/recent-feed-settings.tsx` (settings section drop-in).

## Domain Manifest

| File | Domain | Classification | Rationale |
|---|---|---|---|
| `apps/web/src/features/041-file-browser/components/recent-feed/recent-feed-view.tsx` | file-browser | internal | Top-level feed orchestrator — header + filters + list |
| `apps/web/src/features/041-file-browser/components/recent-feed/recent-feed-header.tsx` | file-browser | internal | Title + counter + pause/refresh/settings buttons |
| `apps/web/src/features/041-file-browser/components/recent-feed/recent-feed-filters.tsx` | file-browser | internal | Type-chip multi-select row |
| `apps/web/src/features/041-file-browser/components/recent-feed/recent-feed-list.tsx` | file-browser | internal | Virtualized vertical list (`content-visibility: auto`) |
| `apps/web/src/features/041-file-browser/components/recent-feed/feed-card.tsx` | file-browser | internal | Card shell — header strip + actions + preview slot |
| `apps/web/src/features/041-file-browser/components/recent-feed/types.ts` | file-browser | internal | `FeedItem`, `FeedItemKind`, `FeedState` types |
| `apps/web/src/features/041-file-browser/components/recent-feed/previews/image-preview.tsx` | file-browser | internal | Wraps existing `ImageCard` for feed sizing |
| `apps/web/src/features/041-file-browser/components/recent-feed/previews/video-preview.tsx` | file-browser | internal | Native `<video controls>` — NOT autoplay-loop |
| `apps/web/src/features/041-file-browser/components/recent-feed/previews/audio-preview.tsx` | file-browser | internal | Native `<audio controls>` |
| `apps/web/src/features/041-file-browser/components/recent-feed/previews/markdown-excerpt-card.tsx` | file-browser | internal | Truncated markdown rendered via `MarkdownServer` |
| `apps/web/src/features/041-file-browser/components/recent-feed/previews/code-excerpt-card.tsx` | file-browser | internal | Server-rendered Shiki excerpt |
| `apps/web/src/features/041-file-browser/components/recent-feed/previews/binary-preview.tsx` | file-browser | internal | Icon + size + "Binary file" label |
| `apps/web/src/features/041-file-browser/components/recent-feed/previews/deleted-preview.tsx` | file-browser | internal | Strikethrough mini-card with auto-removal timer |
| `apps/web/src/features/041-file-browser/components/recent-feed/feed-empty-state.tsx` | file-browser | internal | Empty state |
| `apps/web/src/features/041-file-browser/components/recent-feed/feed-error-state.tsx` | file-browser | internal | Error state (non-git workspace, seed failure) |
| `apps/web/src/features/041-file-browser/components/recent-feed/feed-skeleton.tsx` | file-browser | internal | Loading skeleton (uses existing `card-skeleton.tsx`) |
| `apps/web/src/features/041-file-browser/components/recent-feed/hooks/use-recent-feed-state.ts` | file-browser | internal | Live-merge reducer + state machine (TDD-target) |
| `apps/web/src/features/041-file-browser/components/recent-feed/hooks/use-feed-actions.ts` | file-browser | internal | Copy abs/rel/markdown-link/filename, download, open, reveal |
| `apps/web/src/features/041-file-browser/components/recent-feed/hooks/use-feed-keyboard.ts` | file-browser | internal | Roving focus + per-card shortcuts |
| `apps/web/src/features/041-file-browser/lib/truncate-markdown.ts` | file-browser | internal | Markdown excerpt utility (TDD-target) |
| `apps/web/src/features/041-file-browser/services/file-excerpt.ts` | file-browser | internal | Server action — returns `{ kind, content, lang? }` for one path, server-truncated |
| `apps/web/src/features/_platform/settings/sections/recent-feed-settings.tsx` | _platform/settings | cross-domain (drop-in section) | Settings page section file dropped at the published extension point. File-browser authors the content; `_platform/settings` hosts the section per the established convention |
| `apps/web/src/features/041-file-browser/components/recent-feed/recent-feed-settings.defaults.ts` | file-browser | internal | Hardcoded default values for all `fileBrowser.recentFeed.*` settings. Single source of truth — consumed by both `recent-feed-settings.tsx` (for first-render fallbacks) and `RecentFeedView` (for runtime defaults when settings store is empty). Per validation Risk M3 |
| `apps/web/src/features/041-file-browser/params/file-browser.params.ts` | file-browser | internal (modify) | Add `view: parseAsStringLiteral(['recent-feed'] as const).withDefault(null)` |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | file-browser | internal (modify) | Add `view === 'recent-feed'` branch BEFORE the `selectedFile`/`currentDir` branches |
| `apps/web/src/features/041-file-browser/components/preview-cards/card-actions.tsx` | file-browser | internal (modify) | Extend with `onCopyAbsolutePath`, `onOpen`, `overflowMenu` props (additive) |
| `apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx` | _platform/panel-layout | cross-domain (modify) | Add entry-point button — small additive change to a domain we otherwise consume |
| `docs/domains/file-browser/domain.md` | file-browser | contract (modify) | Add Concept row "Recent changes feed" + History entry |
| `docs/how/recent-changes-feed.md` | file-browser | doc (new) | Long-form guide per spec § Documentation Strategy |
| `apps/web/README.md` (or top-level README) | — | doc (modify) | One-paragraph signpost to docs/how guide |
| `test/unit/web/041-file-browser/recent-feed/use-recent-feed-state.test.ts` | file-browser | test (new) | TDD — live-merge reducer |
| `test/unit/web/041-file-browser/lib/truncate-markdown.test.ts` | file-browser | test (new) | TDD — excerpt boundary detection |
| `test/unit/web/041-file-browser/recent-feed/feed-filters.test.ts` | file-browser | test (new) | Filter predicate + multi-select state |
| `test/unit/web/041-file-browser/services/file-excerpt.test.ts` | file-browser | test (new) | Server-action input validation, MIME mapping |
| `test/integration/web/recent-feed-live-updates.integration.test.ts` | file-browser | test (new) | Real `fs.watch` + temp dir + real `_platform/events` SSE pipeline |
| `test/integration/web/recent-feed-seed.integration.test.ts` | file-browser | test (new) | Real `git log` against temp git repo + non-git fallback |
| `harness/scenarios/recent-feed-visual.ts` (or equivalent) | — | test (new) | Visual smoke at default + mobile viewports; live-merge animation; reduced-motion |

## Constitution & Architecture Gate

**Constitution review** (binding rules from `docs/project-rules/constitution.md`):

| Principle | Bearing | Disposition |
|---|---|---|
| P4 — No `vi.mock` of own-domain internals | Direct | Plan binds: "no mocked SSE in integration tests"; tests mock external seams only. Same rule that gated Plan 084 R3 minih |
| Domain-import direction (business → infrastructure) | Direct | All cross-domain consumption is business (`file-browser`) → infrastructure (`_platform/*`). No reverse imports |
| Contract changes require ADR | Direct | This plan introduces zero contract changes to consumed domains. No ADR required |
| Workshop is binding | Direct | Workshop 005 locks card anatomy, action set, no-autoplay-loop, no-new-channel — implementation does not deviate |
| Settings namespace LOCKED | Direct | `fileBrowser.recentFeed.*` settings keys (`feedSize`, `feedCeiling`, `defaultFilters`, `mdExcerptLines`, `mdExcerptChars`, `codeExcerptLines`, `autoplayPolicy`, `deletedWindow`, `inFlightMediaBound`, `openOnLaunch`) are user-pref data. **Renaming any key breaks v1 user settings silently.** Future renames require a migration step in the changelog. USDK command name `fileBrowser.openRecentFeed` is similarly locked |

**Architecture review** (`docs/project-rules/architecture.md` — feature-folder layout):

- All new code lives under `apps/web/src/features/041-file-browser/components/recent-feed/` (feature-folder convention).
- The one cross-domain touch (`ExplorerPanel` button) is small, additive, and follows the same pattern Plan 067 / 071 used for their entry-points (precedent).
- Settings section lives under `_platform/settings/sections/` per Plan 047 USDK Phase 5 convention.

No deviations require an ADR.

## Key Findings

| # | Impact | Finding | Action |
|---|---|---|---|
| 01 | **CRITICAL** | The `file-changes` multiplexed SSE channel already exists in `_platform/events` with server-side 300ms debounce and last-event-wins coalescing. The spec § I1 binds the feature to consume it via `useFileChanges('**')` — no new channel. | T015–T017 subscribe to `useFileChanges`; integration test asserts SSE pipeline is exercised end-to-end without a new broadcaster |
| 02 | **HIGH** | `getRecentFiles(worktreePath, limit)` already exists at `apps/web/src/features/041-file-browser/services/recent-files.ts` and runs `git log --name-only --no-merges --pretty=format: --diff-filter=AMCR`, deduped over 3× the limit. **Reuse — do not reinvent.** | T012 wires this as the seed source; T013 adds non-git fallback (B3) |
| 03 | **HIGH** | `CardActions` (Plan 077, `card-actions.tsx`) already exists with copy-rel + download. **Extend in place** with `onCopyAbsolutePath`, `onOpen`, and `overflowMenu` props (additive — no breakage to gallery use site). | T005 extends `CardActions`; gallery tests still pass without modification |
| 04 | **HIGH** | The existing `ChangesView` (file-browser § "Track changes" Concept) is a left-panel git-status text list. The feed is a **complementary** main-panel media view, NOT a replacement. domain.md must add a NEW Concept "Recent changes feed" — do not extend "Track changes". | T030 adds Concept row to file-browser/domain.md |
| 05 | **HIGH** | Memory ceiling under stacked media (50+ video cards) will OOM without virtualization. Browsers do NOT lazily decode video. | T009 uses `content-visibility: auto` for the list (cheap, native); spec § G2 caps in-flight media at 5; videos use `preload="metadata"` until in viewport |
| 06 | **HIGH** | Markdown excerpt extraction has subtle edge cases — front matter (`---` block), code fences (`` ``` ``), mid-list truncation. **TDD this**; the boundary detector is the highest-risk new logic in the plan. **Detection patterns (review-companion checklist)**: (1) front-matter-only doc → returns empty excerpt or skips the YAML; (2) doc with front matter then prose → excerpt starts AFTER the `---` close; (3) excerpt boundary lands inside a `` ``` `` block → extend to fence close; (4) excerpt boundary lands inside a list item → extend to list-item end; (5) single line longer than char limit → truncate at char limit, add ellipsis; (6) empty input → returns empty string, never throws. | T021 is RED-GREEN-REFACTOR with all 6 cases above; companion will check each as separate test name |
| 07 | **HIGH** | Main-panel decision lives in `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` (lines ~159–160 + downstream render decision). Add `view === 'recent-feed'` branch BEFORE the `selectedFile`/`currentDir` branches so the feed can be opened with file/dir params still set (returning the user to their previous state on close). | T011 adds the branch; integration test asserts that closing the feed restores `selectedFile`/`currentDir` |
| 08 | **MEDIUM** | **Two** cross-domain modifications, both small and additive, both following established precedent: (a) `_platform/panel-layout/components/explorer-panel.tsx` adds entry-point button (Plan 067 / 071 precedent); (b) `_platform/settings/sections/recent-feed-settings.tsx` drops a section file at the published settings extension point (Plan 047 USDK Phase 5 / Plan 073 precedent). Flag both in code review. | T029 adds the button + cross-domain note (panel-layout must not gain feature-specific state); T028 drops the section + confirms settings-section drop-in convention is followed |
| 09 | **MEDIUM** | USDK command default keybinding choice must be verified against the existing keybindings registry to avoid conflicts (research dossier risk R7). Suggested: `Cmd+Shift+R` — confirm no conflict before assigning. | T027 includes a registry-conflict grep before assignment; fallback to no-default-keybinding if conflict found |
| 10 | **MEDIUM** | `addDir` / `unlinkDir` events from the SSE channel are noise for the feed (workshop §11 Q6 resolved). Filter at the merge-state layer, not at SSE subscription, so the existing channel remains shared. | T015 reducer drops `addDir` / `unlinkDir` events at intake |
| 11 | **MEDIUM** | Rename surfaces as `unlink` + `add` pair for the same basename (workshop PL-10). Coalescing in a 200ms window is polish, not core. **Defer to v2** unless trivially achievable in T015. | T015 documents the gap with a `// TODO(v2): rename pair coalescence` and adds a future-friendly seam (single dispatch point) |
| 12 | **MEDIUM** | Shiki cold-start latency on first feed load (research R4). The highlighter is a server-process singleton with 38 preloaded languages. First call ~ 200-500ms; subsequent calls < 50ms. **Accept the latency** for v1 (skeleton placeholders absorb it); revisit with pre-warm if user reports surface. | No active mitigation — documented in `docs/how/recent-changes-feed.md` under troubleshooting |
| 13 | **LOW** | The existing `card-skeleton.tsx` is already used by the gallery's `FolderPreviewPanel`. **Reuse.** | T009 imports it; no fork |
| 14 | **LOW** | `useLazyLoad` IntersectionObserver hook is shared across preview-cards. **Reuse.** | T006-T008 import it; no fork |
| 15 | **MEDIUM** | **Test boundary locked for v2 phases.** Integration tests use real `_platform/events` SSE pipeline (`fs.watch` + multiplexed channel + real consumers). No v2 phase (multi-select, pinning, last-seen marker, etc.) may add `vi.mock` of `_platform/events` or any own-domain internal in integration tests. Constitution P4. Recurrence trap from Plan 084 R3 minih (mocked tests passed; production failed). | All v2 plans inherit this constraint; document in v2 spec § Mock Usage Policy as "inherited from recent-changes-feed v1" |

## Implementation

**Objective**: Ship a virtualized, live-updating, repo-wide media feed in the file browser's main panel that satisfies the higgs-jordo media-review flow and the "what's been changing" review flow, **without adding a new SSE channel or new domain**.

**Testing Approach**: **Hybrid** (per spec § Testing Strategy)
- **TDD** (RED→GREEN→REFACTOR): live-merge reducer (T015), `truncateMarkdown` (T021), filter predicate (T024).
- **Lightweight** (one render-with-fixture test per component): each card variant, each state (empty/loading/error), settings round-trip.
- **Integration** (real `fs.watch` + real SSE pipeline + real `git log` — no mocked SSE channel): T017, T013.
- **Harness** (visual smoke at default + mobile viewport): T031.
- **Mock policy**: targeted — mocks only at external/system seams (`useFileChanges` callback in unit tests; `getRecentFiles` return; `highlightCodeAction`). No `vi.mock` of own-domain internals (Constitution P4).

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|---|---|---|---|---|---|---|
| [x] | T001 | Create `recent-feed/` scaffold + types | file-browser | `apps/web/src/features/041-file-browser/components/recent-feed/{types.ts,index.ts}` | `FeedItem`, `FeedItemKind`, `FeedState` types defined; barrel exports empty | Foundation for all downstream tasks |
| [x] | T002 | Add `view` enum to `fileBrowserParams` | file-browser | `apps/web/src/features/041-file-browser/params/file-browser.params.ts` | Param `view: parseAsStringLiteral(['recent-feed'] as const)` exported (yields `'recent-feed' \| null`; nuqs literal parsers can't have a non-literal default — omitting `.withDefault` gives the desired nullable type); existing params unchanged | Per Finding 07 |
| [x] | T003 | Add `view === 'recent-feed'` branch in `browser-client.tsx` (before `selectedFile`/`currentDir` branches) | file-browser | `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | Branch present; lazy-imports `RecentFeedView`; closing the feed (clearing `view`) restores prior `selectedFile`/`currentDir` state | Per Finding 07; lightweight render test |
| [x] | T004 | Lightweight test: opening + closing the feed preserves `selectedFile`/`currentDir` | file-browser | `test/unit/web/features/041-file-browser/recent-feed/browser-client-view-branch.test.tsx` (corrected path: existing convention is `test/unit/web/features/041-file-browser/...`, not `test/unit/web/041-file-browser/...`) | Test passes; covers AC A1 | Per Finding 07 |
| [x] | T005 | Extend `CardActions` with `onCopyAbsolutePath`, `onOpen`, `overflowMenu` props (additive) | file-browser | `apps/web/src/features/041-file-browser/components/preview-cards/card-actions.tsx` | New props are optional; existing gallery call site unchanged; new props render only when supplied | Per Finding 03 |
| [x] | T006 | Lightweight test: `CardActions` renders new buttons when props supplied; old behavior unchanged when not | file-browser | `test/unit/web/features/041-file-browser/preview-cards/card-actions.test.tsx` (path corrected to match existing convention) | Test passes for both old + new prop sets | Covers AC E1 |
| [ ] | T007 | Build `feed-card.tsx` shell (header strip — icon, title, path, meta line, actions slot, preview slot) | file-browser | `apps/web/src/features/041-file-browser/components/recent-feed/feed-card.tsx` | Card renders with mock `FeedItem`; uses `FileIcon`; path truncates from left; tooltip shows absolute path on path hover | Workshop §2; uses `_platform/themes` `FileIcon` |
| [ ] | T008 | Build `image-preview.tsx`, `video-preview.tsx`, `audio-preview.tsx`, `binary-preview.tsx` | file-browser | `apps/web/src/features/041-file-browser/components/recent-feed/previews/{image,video,audio,binary}-preview.tsx` | Each renders correctly with a fixture `FeedItem`; video uses `<video controls>` with `preload="metadata"` (NOT autoplay-loop); reuses `useLazyLoad` | Workshop §2, §6; per Finding 14 |
| [ ] | T009 | Build `recent-feed-list.tsx` with `content-visibility: auto` virtualization | file-browser | `apps/web/src/features/041-file-browser/components/recent-feed/recent-feed-list.tsx` | List renders ≥ 50 mock entries; only viewport-visible cards keep media decoded; idle entries release | Per Finding 05; covers AC G1, G2 |
| [ ] | T010 | Build `recent-feed-header.tsx` (title, live indicator, pause/refresh/settings) and `recent-feed-filters.tsx` (chips) | file-browser | `apps/web/src/features/041-file-browser/components/recent-feed/{recent-feed-header,recent-feed-filters}.tsx` | Both render; pause toggles a state callback; filter chips multi-select | Workshop §5 |
| [ ] | T011 | Build empty / loading / error states (`feed-empty-state.tsx`, `feed-error-state.tsx`, `feed-skeleton.tsx`) | file-browser | `apps/web/src/features/041-file-browser/components/recent-feed/{feed-empty-state,feed-error-state,feed-skeleton}.tsx` | All three render with appropriate copy; skeleton reuses existing `card-skeleton.tsx` | Per Finding 13; covers AC A3, B3 |
| [ ] | T012 | Build `recent-feed-view.tsx` orchestrator wired to `getRecentFiles` seed (no live yet) | file-browser | `apps/web/src/features/041-file-browser/components/recent-feed/recent-feed-view.tsx` | View mounts → calls `getRecentFiles(worktreePath, 50)` → renders cards in newest-first order; loading skeletons show during fetch | Per Finding 02; covers AC B1, B2, A3 |
| [ ] | T013 | Integration test (real git): seed populates against a temp git repo; non-git fallback shows error state | file-browser | `test/integration/web/recent-feed-seed.integration.test.ts` | Both cases pass; uses real `git` binary, no mocks | Covers AC B1, B3; per spec Mock Usage Policy |
| [ ] | T014 | TDD `truncateMarkdown` utility — front matter, code fences, mid-list, char vs line limits | file-browser | `apps/web/src/features/041-file-browser/lib/truncate-markdown.ts`, `test/unit/web/041-file-browser/lib/truncate-markdown.test.ts` | Test cases: front-matter-only doc; first-paragraph after front matter; mid-code-fence (do not split fence); mid-list (preserve list-item integrity); single very long line; empty input | Per Finding 06; TDD-target |
| [ ] | T015 | TDD live-merge reducer (`useRecentFeedState`) — promote / insert / delete; burst coalescing; addDir/unlinkDir filtering; gitignored-path filtering; pause-buffer drain | file-browser | `apps/web/src/features/041-file-browser/components/recent-feed/hooks/use-recent-feed-state.ts`, `test/unit/web/041-file-browser/recent-feed/use-recent-feed-state.test.ts` | Test cases: single change promotes existing item; new path inserts at top; `unlink` switches to deleted-state with auto-removal timer; burst of 50 events → 1 dispatch (≤ 3 renders); `addDir`/`unlinkDir` dropped at intake; **paths matching common build-artifact patterns (`node_modules/**`, `.next/**`, `dist/**`, `build/**`, `.cache/**`, `.turbo/**`, `coverage/**`) dropped at intake even if SSE delivers them — verified by integration test in T017 that touches `node_modules/foo.js` and asserts no card appears**; pause buffers, resume drains in order | Per Findings 01, 10, 11; per validation Risk M2 — gitignore noise prevention; TDD-target; covers AC C1–C5, G3 |
| [ ] | T016 | Wire `useRecentFeedState` to `useFileChanges('**')` in `recent-feed-view.tsx` | file-browser | `apps/web/src/features/041-file-browser/components/recent-feed/recent-feed-view.tsx` | Live updates promote/insert into the feed without a refresh; SSE channel name is `file-changes` (existing); no new broadcaster | Per Finding 01; covers AC C1, C2 |
| [ ] | T017 | Integration test (real `fs.watch` + real SSE pipeline): touch a file in a temp worktree, assert the feed promotes it | file-browser | `test/integration/web/recent-feed-live-updates.integration.test.ts` | Test passes end-to-end; no `vi.mock` of `_platform/events` or own-domain internals; assertion includes burst-coalescing case | Per spec Mock Usage Policy + Constitution P4; covers AC C1, C3 |
| [ ] | T018 | Build pause toggle + buffer pill ("N new — click to show") | file-browser | `apps/web/src/features/041-file-browser/components/recent-feed/recent-feed-view.tsx` | Pause stops promotion; pill shows count of buffered changes; click unpauses + drains + scrolls to top | Workshop §5; covers AC C4 |
| [ ] | T019 | SSE-disconnect banner (consumes existing reconnect logic) | file-browser | `apps/web/src/features/041-file-browser/components/recent-feed/recent-feed-view.tsx` | Banner shows on disconnect; auto-recovers; existing items preserved | Workshop §7; covers AC C5 |
| [ ] | T020 | Build `file-excerpt` server action (returns `{ kind: 'code'\|'markdown', content, lang? }`) — ALSO supports a `mode: 'full'` variant for `copyFileContents` action (T025) | file-browser | `apps/web/src/features/041-file-browser/services/file-excerpt.ts`, `test/unit/web/041-file-browser/services/file-excerpt.test.ts` | Action returns server-truncated excerpt OR full file when `mode: 'full'`; **path validated via `IPathResolver` (path-traversal rejected with 403)**; **content type detected via `detectContentType`; only `code` and `markdown` categories returned — `binary`, `image`, `video`, `audio`, and unknown types rejected with 403; secrets-pattern paths (`.env*`, `*.secret*`, `**/credentials*`) rejected even when extension would otherwise pass**; limits enforced (max 256KB for full mode); test cases: `.env` rejected, `secrets.json` rejected, valid markdown returns excerpt, valid TS file returns code+lang, path-traversal `../../etc/passwd` rejected | Per spec § D; per validation Risk M1 — security gating explicit; supports T025 `copyFileContents` |
| [ ] | T021 | Build `markdown-excerpt-card.tsx` (consumes `truncateMarkdown` + `MarkdownServer`) | file-browser | `apps/web/src/features/041-file-browser/components/recent-feed/previews/markdown-excerpt-card.tsx` | Renders excerpt with fade-out gradient; reuses `_platform/viewer` `image-url.ts` for relative-image resolution | Workshop §2 |
| [ ] | T022 | Build `code-excerpt-card.tsx` (consumes `highlightCodeAction`) | file-browser | `apps/web/src/features/041-file-browser/components/recent-feed/previews/code-excerpt-card.tsx` | Renders Shiki HTML for first 12 lines; fade-out gradient; lang detection via `detectContentType` | Workshop §2; per Finding 12 |
| [ ] | T023 | Build `deleted-preview.tsx` (5s auto-removal, configurable) | file-browser | `apps/web/src/features/041-file-browser/components/recent-feed/previews/deleted-preview.tsx` | Shows strikethrough mini-card; auto-removes after configured window (default 5s); covers settings options Never/5s/30s/Until-dismissed | Workshop §2; covers AC D3 |
| [ ] | T024 | Filter predicate + multi-select chip state + tests | file-browser | `apps/web/src/features/041-file-browser/components/recent-feed/recent-feed-filters.tsx`, `test/unit/web/041-file-browser/recent-feed/feed-filters.test.ts` | Multi-select toggles work; predicate maps `FeedItemKind` → category visibility; All/Other handle correctly | Workshop §5; covers AC F1 |
| [ ] | T025 | Build `use-feed-actions.ts` hook covering ALL 9 workshop §3 catalog actions: `open`, `copyRelativePath`, `copyAbsolutePath`, `download`, `copyFilename`, `copyMarkdownLink`, `revealInTree`, `copyFileContents` (markdown/code — fetches via T020 server action), `dismiss` (in-memory hide for session) | file-browser | `apps/web/src/features/041-file-browser/components/recent-feed/hooks/use-feed-actions.ts` | All 9 actions present and exported; clipboard writes surface `toast()` confirmation; download triggers raw-file API with `?download=true`; open routes through `setParams({ file, view: null })`; `copyFileContents` fetches full file text via T020 (not the excerpt); `dismiss` mutates feed state to filter the path for the session only (no persistence) | Workshop §3 binding catalog (all 9 items); covers AC E1–E6; depends on T020 for `copyFileContents` |
| [ ] | T026 | Build `use-feed-keyboard.ts` (roving focus + per-card shortcuts: Enter, c, Shift+C, d, r, m) | file-browser | `apps/web/src/features/041-file-browser/components/recent-feed/hooks/use-feed-keyboard.ts` | Arrow keys navigate; Enter opens; letter shortcuts fire correct actions on focused card | Workshop §3, §8; covers AC H2 |
| [ ] | T027 | ARIA pass + reduced-motion + color-contrast verification | file-browser | `recent-feed-view.tsx`, `feed-card.tsx`, others as needed | `role="feed"` + `role="article"` set; polite live region announces new items; `prefers-reduced-motion: reduce` disables slide; contrast verified in light + dark | Workshop §8; covers AC H1, H3, H4, H5 |
| [ ] | T028 | Build `recent-feed-settings.tsx` section enumerating ALL keys: `feedSize`, `feedCeiling`, `defaultFilters`, `mdExcerptLines`, `mdExcerptChars`, `codeExcerptLines`, `autoplayPolicy`, `deletedWindow`, `inFlightMediaBound` | _platform/settings | `apps/web/src/features/_platform/settings/sections/recent-feed-settings.tsx` | Section renders all 9 settings; each persists via `useSDKSetting` round-trip; ALL settings have hardcoded defaults exported from `recent-feed-settings.defaults.ts` (feedSize=50, feedCeiling=200, defaultFilters=all-true, mdExcerptLines=8, mdExcerptChars=600, codeExcerptLines=12, autoplayPolicy='off', deletedWindow=5000, inFlightMediaBound=5); first-open with empty store renders defaults (no `undefined` flicker) | Workshop §9; covers AC F2; cross-domain drop-in (Finding 08); defaults file consumed by `RecentFeedView` (no in-component magic numbers) |
| [ ] | T029 | Add entry-point button to `ExplorerPanel` | _platform/panel-layout | `apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx` | Button visible in top bar; click sets `?view=recent-feed`; small additive change; no feature-specific state added to panel-layout | Per Finding 08 (cross-domain note); covers AC A2 |
| [ ] | T030 | Register USDK command `fileBrowser.openRecentFeed` + default keybinding (after registry conflict check) | file-browser | wherever USDK commands register for file-browser | Command opens feed; keybinding chosen does not conflict with existing registry (grep verified) | Per Finding 09; covers AC A2 |
| [ ] | T031 | Add `fileBrowser.recentFeed.openOnLaunch` setting + default-landing routing | file-browser | `recent-feed-settings.tsx`, `browser-client.tsx` | Setting is off by default; when enabled, `view=recent-feed` is set on workspace browser landing if no `file`/`dir` already present | Covers AC A2 |
| [ ] | T032 | Update `docs/domains/file-browser/domain.md` — add Concept "Recent changes feed" + History entry | file-browser | `docs/domains/file-browser/domain.md` | Concept row added under § Concepts (entry point: `RecentFeedView`); History row added; `_platform/events` listed as additional dependency for live updates | Per Finding 04 |
| [ ] | T033 | Write `docs/how/recent-changes-feed.md` long-form guide | — | `docs/how/recent-changes-feed.md` | Guide covers: how to open, action shortcuts, settings reference, troubleshooting (non-git, SSE disconnect, mass-rename), v2 candidates | Per spec § Documentation Strategy |
| [ ] | T034 | Add README pointer (one paragraph + link) | — | `apps/web/README.md` (or top-level `README.md` per house style) | One paragraph describing the feed + link to docs/how guide | Per spec § Documentation Strategy |
| [ ] | T035 | Harness visual smoke fixture + tests (default + mobile viewports; live-merge animation; reduced-motion) | — | `harness/scenarios/recent-feed-visual.ts` (or equivalent) | Screenshot evidence at both viewports; live-merge animation captured; reduced-motion variant captured | Per spec § Testing Strategy harness section; uses L3 harness |
| [ ] | T036 | Final verification — run full test suite + harness; confirm all AC checked | — | — | All tests green; AC checklist (§ below) all `[x]`; harness reports 0 regressions | Plan-7 review handover |

### Acceptance Criteria

**A. View entry & layout**
- [ ] A1 — `?view=recent-feed` swaps main panel; tree stays intact (T003, T004)
- [ ] A2 — Three concurrent entrypoints (button + USDK command + open-on-launch setting) (T029, T030, T031)
- [ ] A3 — Loading state shown during initial seed (T011, T012)

**B. Initial seed**
- [ ] B1 — Seed via `git log` orders newest-first (T012, T013)
- [ ] B2 — Default 50, ceiling 200, configurable (T012, T028)
- [ ] B3 — Non-git workspace shows error state; live updates still work (T011, T013, T016)

**C. Live updates**
- [ ] C1 — `file-changes` SSE events promote/insert (T015, T016, T017)
- [ ] C2 — Zero new SSE channels added (T016, T017 — verified by integration test)
- [ ] C3 — Burst of ≥ 50 events → ≤ 3 React renders (T015, T017)
- [ ] C4 — Pause toggle + buffer pill (T018)
- [ ] C5 — SSE reconnect preserves items (T019)

**D. Cards & previews**
- [ ] D1 — Header strip: filename, path, timestamp, size, event badge (T007)
- [ ] D2 — Path tooltip shows absolute path (T007)
- [ ] D3 — Per-type previews (image, video, audio, markdown excerpt, code excerpt, generic, deleted) — videos NOT autoplay-loop (T008, T021, T022, T023)

**E. Actions**
- [ ] E1 — Inline actions (Open, Copy rel, Copy abs for media, Download for media) (T005, T025)
- [ ] E2 — Overflow menu (Copy filename, Copy MD link, Reveal, Copy contents, Dismiss) (T025)
- [ ] E3 — Toast on copy success (T025)
- [ ] E4 — Download saves with original filename (T025)
- [ ] E5 — Click title/preview opens in `FileViewerPanel` (T007, T025)
- [ ] E6 — Click on path shows tooltip only, no navigation (T007)

**F. Filters & settings**
- [ ] F1 — Filter chips (multi-select) (T010, T024)
- [ ] F2 — Settings panel persists via `useSDKSetting` (T028)

**G. Performance & scale**
- [ ] G1 — 50-card mixed-media feed remains responsive (T009, T035)
- [ ] G2 — In-flight media bound ≤ 5 (T009)
- [ ] G3 — Burst of 50 events → ≤ 3 renders (T015, T017)

**H. Accessibility**
- [ ] H1 — `role="feed"` + `role="article"` (T027)
- [ ] H2 — Roving focus + letter shortcuts (T026)
- [ ] H3 — Polite live region announces new items (T027)
- [ ] H4 — WCAG AA contrast in both themes (T027)
- [ ] H5 — `prefers-reduced-motion` disables slide animation (T027)

**I. Constraints**
- [ ] I1 — No new SSE channel / broadcaster / route (T016, T017 — verified)
- [ ] I2 — No new domain (Domain Manifest verified)
- [ ] I3 — No contracts modified in `_platform/events` / `_platform/viewer` / `_platform/themes` (Domain Manifest verified)
- [ ] I4 — Page paints with skeletons; seed resolves async (T011, T012)

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Memory exhaustion under heavy media stack | Medium | High | T009 `content-visibility: auto`; spec G2 ≤ 5 in-flight media; videos `preload="metadata"` until in viewport |
| Markdown excerpt boundary breakage (front matter / code fences) | Medium | Medium | T014 TDD with explicit edge cases; failing test before implementation |
| Non-git workspaces fail seed | Medium | Low | T013 integration test for non-git fallback; live updates still functional |
| Shiki cold-start latency on first feed load | Low | Low | Skeleton placeholders absorb latency; documented in `docs/how/` troubleshooting; pre-warm deferred unless reported |
| Rename surfaces as two cards (`unlink` + `add` pair) | Medium | Low | T015 future-friendly seam; `// TODO(v2)` polish; not blocking v1 |
| SSE reconnect blanks feed | Low | Medium | T019 + integration test; existing reconnect logic preserved |
| New users do not discover the entry point | Medium | Medium | T029 + T030 + T031 — three concurrent entrypoints |
| USDK keybinding conflict with existing command | Low | Low | T030 includes registry-grep before assigning; fallback to no-default-keybinding if conflict |
| Cross-domain edit to `ExplorerPanel` introduces feature coupling | Low | Medium | T029 review note: button must not pull feature-specific state into panel-layout; matches Plan 067 / 071 precedent |
| Cross-domain drop-in to `_platform/settings/sections/` couples settings domain to file-browser internals | Low | Low | T028 follows established drop-in convention (Plan 047, Plan 073); section file imports `useSDKSetting` only; no reverse coupling |

---

## Harness Strategy

- **Current Maturity**: L3 (Docker + Playwright/CDP + structured evidence + CLI SDK)
- **Target Maturity**: L3 (no harness changes needed)
- **Boot Command**: `just harness dev`
- **Health Check**: `just harness health` → JSON envelope
- **Interaction Model**: HTTP API (Next.js routes) + Playwright/CDP for UI assertions
- **Evidence Capture**: JSON responses + screenshots
- **Pre-Phase Validation**: Required at start of implementation (Boot → Interact → Observe). Single-phase plan in Simple Mode means one validation gate at the start of T001.

## Plan Validation Checklist

- [x] All tasks have a Domain column entry
- [x] All tasks have an absolute-path Path(s) entry
- [x] All tasks have a Done When success criterion
- [x] Domain Manifest covers all touched files
- [x] Target domains from spec all addressed
- [x] Key Findings reference affected tasks via Notes
- [x] No time language present (CS 1-5 only)
- [x] No `vi.mock` of own-domain internals required (Constitution P4)
- [x] No new SSE channel / broadcaster (spec § I1 binding)
- [x] Workshop 005 decisions respected (no autoplay-loop, card anatomy, action set)
- [x] Cross-domain modification to `ExplorerPanel` flagged (Finding 08)
- [x] Forward-compatibility: v2 candidates documented in spec § Out-of-Scope; T015 leaves seams for rename-pair coalescence

## Validation Record (2026-05-03 — validate-v2, broad scope, 4 agents)

| Agent | Lenses Covered | Issues | Verdict |
|---|---|---|---|
| Coherence | Hidden Assumptions, Integration & Ripple, Domain Boundaries | 1 HIGH fixed (T028 Domain col) | ⚠️ → ✅ |
| Risk | Edge Cases, Performance & Scale, Security & Privacy, Deployment & Ops, Hidden Assumptions | 3 MEDIUM fixed (T020 security gating, T015 .gitignore filtering, T028 defaults), 2 LOW open | ⚠️ → ✅ |
| Completeness | System Behavior, User Experience, Concept Documentation, Edge Cases | 2 HIGH fixed (T025 actions, T028 settings), 1 MEDIUM fixed (T025 server-action dep), 1 LOW open | ⚠️ → ✅ |
| Forward-Compatibility | Forward-Compatibility, Technical Constraints, Test Boundary | 4 MEDIUM fixed (FC1 settings enumerated, FC2 namespace lock, FC3 detection patterns, FC5 v2 test boundary lock), 1 LOW open | ⚠️ → ✅ |

**Lens coverage**: 12/12 (full sweep — well above the 8-floor). **Forward-Compatibility ENGAGED** (not STANDALONE — 5 named consumers).

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|---|---|---|---|---|
| C1 / `/plan-6-v2-implement-phase-companion` | 7-column inline task table with absolute paths, Done When, Notes | Shape mismatch / Lifecycle | ✅ | Plan task table (T001–T036) provides all 7 columns; Done Whens specific (e.g., T004: "Test passes; covers AC A1"); Notes reference Findings |
| C2 / `/plan-7-v2-code-review` | Domain Manifest + AC checklist mapped to tasks | Lifecycle / Contract drift | ✅ | Domain Manifest covers ~30 files; AC § A1–I4 each map to ≥ 1 task; Constitution Gate confirms zero contract changes; ADRs 0007/0013/0014 aligned |
| C3 / minih `code-review-companion` | Key Findings detail + per-task detection patterns for review prompts | Encapsulation lockout | ✅ (was ⚠️) | **Fixed** — Finding 06 now enumerates 6 detection patterns (front-matter only / front-matter then prose / mid-fence / mid-list / overlong line / empty input); new Finding 15 locks the v2 test boundary (no `vi.mock` of `_platform/events`) |
| C4 / `docs/domains/file-browser/domain.md` | Concept name + entry-point identifier for the new Concepts row | Encapsulation lockout | ✅ | T032 names Concept "Recent changes feed" with entry point `RecentFeedView`; History row + `_platform/events` dependency listed |
| C5 / `docs/how/recent-changes-feed.md` | Settings keys + action names enumerated for documentation | Shape mismatch | ✅ (was ⚠️) | **Fixed** — T028 enumerates all 9 settings keys (`feedSize`, `feedCeiling`, `defaultFilters`, `mdExcerptLines`, `mdExcerptChars`, `codeExcerptLines`, `autoplayPolicy`, `deletedWindow`, `inFlightMediaBound`); T025 enumerates all 9 action names (open / copyRelativePath / copyAbsolutePath / download / copyFilename / copyMarkdownLink / revealInTree / copyFileContents / dismiss); T031 owns `openOnLaunch`; Constitution Gate locks the namespace |

**Outcome alignment**: The plan's position advances the spec's outcome — "a vertical, scrolling stack of the most-recently-changed files repo-wide... primarily for media-review flows... without a new SSE channel, broadcaster, server route, or watcher pipeline" — by committing zero contract changes to consumed domains (`_platform/events`, `_platform/viewer`, `_platform/themes`), consuming the existing `file-changes` multiplexed channel unchanged, and confining all new code to the `file-browser` domain with two small, precedent-following cross-domain touches (`ExplorerPanel` button + settings section drop-in).

**Standalone?**: No — five downstream consumers (C1–C5) named with concrete needs.

### Open MEDIUM/LOW (deferred for user decision — not blocking implementation)

| # | Severity | Issue | Recommended Action |
|---|---|---|---|
| L1 | LOW | T035 harness visual smoke does not assert numeric perf budget (≥30fps, <200ms) — captures screenshots only | Either add `PerformanceObserver` to harness scenario, OR reframe AC G1 as a manual-review observation. User decision. |
| L2 | LOW | Finding 12 cites Shiki cold-start as 200-500ms based on general knowledge, not measured for this codebase | Optional: add a one-shot measurement task before declaring acceptance |
| L3 | LOW | T027 reduced-motion does not explicitly cover autoplay-on-hover (when user enables it) | Optional: add explicit interaction note in T027 |
| L4 | LOW | T033 long-form guide should explicitly include "USDK Command Reference: `fileBrowser.openRecentFeed` (no args)" so users don't expect `recentChanges.open` | Trivial doc inclusion when T033 lands |

Overall: **VALIDATED WITH FIXES** — 3 HIGH + 6 MEDIUM applied; 4 LOW deferred. Plan is ready for `/plan-6-v2-implement-phase-companion`.

---

## Plan-4 Validation Record (2026-05-03)

| Validator | Status | HIGH | MEDIUM | LOW | Notes |
|---|---|---|---|---|---|
| Structure | ✅ PASS | 0 | 0 | 0 | All sections present; cross-references resolve |
| Testing Alignment | ✅ PASS | 0 | 0 | 0 | Hybrid approach reflected; TDD targets present (T014, T015, T024); integration tests use real SSE / git per spec Mock Usage Policy |
| Domain Completeness | ✅ PASS | 0 | 0 | 0 | All 7 (now 8) target domains addressed; manifest covers all task paths |
| Doctrine | ⚠️ ISSUES → fixed | 0 | 2 | 0 | D1 false-positive (validator confused worktree path with separate project) — dismissed. D2 valid (missed `_platform/settings`) — **fixed**: added to Target Domains, Domain Manifest reclassified, Finding 08 expanded to name both cross-domain touches |
| ADR | ✅ PASS | 0 | 0 | 0 | 4 relevant ADRs aligned: 0007 (SSE single-channel), 0013 (USDK), 0014 (harness), 0003 (config) |

**Verdict**: **READY** (0 HIGH; both MEDIUMs disposed). Plan structure, testing alignment, domain manifest, and ADR alignment all clean. The MEDIUM doctrine fix tightened the cross-domain footprint accounting from 1 → 2 (both flagged with precedent references).

---

## Next Steps

1. **`/plan-4-complete-the-plan`** — ✅ done (READY).
2. **Fix HIGH findings** surfaced by plan-4.
3. **`/validate-v2`** — multi-agent forward-compat + cross-reference + completeness sweep.
4. **`/plan-6-v2-implement-phase-companion`** (or standard `/plan-6-v2-implement-phase`) — single-phase implementation with inline 7-column table; consider companion mode for live review per § Companion Mode in `AGENTS.md`.
5. **Auto code-review** after implementation (`just code-review-agent <path>`).
6. **`/plan-7-v2-code-review`** — final sweep and handover.
