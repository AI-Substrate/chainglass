# Execution Log — Recent Changes Feed (Simple Mode, 36 tasks)

**Plan**: [recent-changes-feed-plan.md](./recent-changes-feed-plan.md)
**Spec**: [recent-changes-feed-spec.md](./recent-changes-feed-spec.md)
**Started**: 2026-05-03
**Implementor**: `/plan-6-v2-implement-phase-companion`
**Companion**: `code-review-companion` runId `2026-05-03T17-52-52-872Z-c76e`

> Per-feature exec log (parent `execution.log.md` is already used by FlowSpace MCP Search in this multi-feature plan dir).

---

## Pre-Phase Validation (2026-05-03)

| Check | Status | Evidence |
|---|---|---|
| Companion boot | active | `minih status` → verdict=active, runId=2026-05-03T17-52-52-872Z-c76e, elapsed 12s |
| Companion brief sent | sent | type=briefing, messageId 01KQPD8EWJJ1KGJ0YC06CVNM0G |
| Harness boot | already running | `just harness health` → status=ok; app/mcp/terminal/cdp all up |
| Harness interact | implicit | health endpoint 200 |
| Harness observe | available | CDP up (Chrome/136.0.7103.25) |
| GH_TOKEN | set | `gh auth token` resolved |

**Verdict**: HEALTHY — proceed to T001.

---

## Companion Findings — Disposition Table

| Finding ID | ackOf (review-request task) | Severity | Disposition | Notes |
|---|---|---|---|---|
| F001 | T004 (01KQPDR5EP9VDWAJ696Z7F3QSK) | MEDIUM | **fixed** | Test only locked `view===` before `selectedFile?` — added `currentDir?` ordering assertion in BOTH render points. A future refactor putting `currentDir?` ahead of the feed branch would now fail the test. Re-ran 7/7. |
| F002 | T007 (01KQPE21WEFZ0SXC54PMSB8V75) | MEDIUM | **fixed** | `id="feed-card-title-${item.path}"` broke `aria-labelledby` IDREF tokenization for paths with whitespace (e.g. `output/my render.png`). Replaced with React `useId()` — stable, valid, path-independent. |
| F003 | T008 (01KQPE56A5JA0HYQW68ZQC7A67) | MEDIUM | **fixed** | `AudioPreview` rendered `<audio preload="metadata">` eagerly — N audio cards triggered N simultaneous metadata fetches at mount. Wrapped in `useLazyLoad` mirroring `VideoPreview` pattern; placeholder until visible. Keeps AC G2 in-flight-media bound consistent. |
| F001 (run 2) | T012 (01KQR4634AAVGSE6991GZRVVKG) | **HIGH** | **fixed** | `handleToggleFilter` started from `ALL_CATEGORIES` (all 7 chips active) and clicking 'image' dropped 'all' from the set, then deleted 'image' (it was still present), leaving every category EXCEPT image active — opposite of intent. Fix: when `prev.has('all')` and a non-all chip is clicked, return `new Set([cat])` for a fresh single-category selection. Workshop §5 semantics restored. T024 will lock this with a dedicated predicate test. |
| F002 (run 2) | T014 (01KQR4C91FEJVCS7EJJKZE8TVK) | MEDIUM | **fixed** | Original Case 4 test (mid-list) didn't actually lock list-extension behavior — a broken impl that never extended would still pass. **Two fixes**: (a) impl now stops at sibling **top-level** list markers (not nested ones) so item integrity is preserved, not the whole list; (b) test rewritten to `maxLines: 3` boundary on the marker line and asserts `also wraps here.` IN, `Third item.` OUT — would fail if list-extension was removed. Plus a continuation-boundary case for thoroughness. 11/11 tests pass. |
| HMR-001 | T016 (user dev-server bundle error) | **HIGH (runtime)** | **fixed** | Turbopack flagged `node:fs/promises` as unsupported in the app-client chunk. Cause: `use-recent-feed-state.ts` (client) imported `detectFeedItemKind` from `services/recent-feed-items.ts` — which transitively pulled in `node:fs/promises` via the `stat` import. **Fix**: extracted the kind-detection logic into a browser-safe `apps/web/src/features/041-file-browser/lib/feed-item-kind.ts`. Both server (`recent-feed-items.ts`) and client (`use-recent-feed-state.ts`) now import from `lib/`. Server file re-exports `detectFeedItemKind` for backwards-compat with existing test imports. 51/51 affected tests still green; tsc clean. |

**Companion run 1 farewell** — `2026-05-03T17-52-52-872Z-c76e` (`exitReason: idle_budget`, 9 tasks reviewed, 3 findings sent, 0 unresolved). Run 2 boots after these fixes for T012+.

**Companion run 2** — `2026-05-04T09-48-40-912Z-0b20` (active). Re-briefed with T001-T011 + F001-F003 fix context. First ping: FX-companion-findings (976487d1) for verification.

### T012 — Seed orchestrator + getRecentFeedItems service

Created **`services/recent-feed-items.ts`** (new — outside original Domain Manifest, added post-implementation):
- `getRecentFeedItems(worktreePath, limit)` wraps `getRecentFiles` + parallel `fs.stat` (`Promise.allSettled` so a stat failure on one path doesn't blank the seed) + extension → `FeedItemKind` mapping.
- Returns `{ ok: true; items: FeedItem[] } | { ok: false; error: 'not-git' }`.
- Exports `detectFeedItemKind(filename)` so T024's filter predicate (and any future caller) can reuse the same mapping.

Added **`fetchRecentFeedItems` server action** in `app/actions/file-actions.ts` mirroring the `fetchRecentFiles` pattern (`requireAuth` + dynamic import).

Replaced **`recent-feed-view.tsx`** stub body with the seeded orchestrator:
- State: `items`, `isLoading`, `seedError`, `isPaused`, `activeFilters` (`ReadonlySet<FilterCategory>` initialised to all 7 categories).
- `loadSeed` calls the server action; surfaces seed errors to `<FeedErrorState>` (with retry).
- `handleToggleFilter` implements workshop §5 semantics: clicking 'all' snaps back to all; clicking any other chip drops 'all' from the set; emptying the subset auto-snaps back to 'all' (so users always see content).
- Render dispatch by `item.kind` → ImagePreview / VideoPreview / AudioPreview / BinaryPreview. Markdown + Code currently fall through to BinaryPreview — replaced at T021/T022.
- Header / filters / states wired from the static UI primitives (T009-T011).
- `role="feed"` + `aria-busy={isLoading}` on the root container — AC H1 baseline.
- Bridge events `recent-feed:open-file` and `recent-feed:open-settings` dispatched as placeholders for T025 (action hook) and T028 (settings sheet) — keeps T012 self-contained.
- Close button absolutely-positioned top-right (opacity-0 default) for AC A1 hover-to-dismiss; primary close path is the entrypoint button toggling the URL param (T029).

**Decision — relative import path**: `'../../../../../app/actions/file-actions'` (5 `../`s). The `@/` alias maps only to `apps/web/src/`, but the actions file lives in `apps/web/app/`. Same pattern browser-client.tsx uses (4 `../`s from its location).

**Decision — bridge events vs prop drilling**: T025 will replace the `window.dispatchEvent` calls with `useFeedActions()` hook. For T012 the events keep the orchestrator decoupled from the URL-param logic that lives one level up in browser-client.tsx — T025 lifts that into a proper hook.

**Evidence**: `tsc --noEmit` clean for `recent-feed-view.tsx`, `recent-feed-items.ts`, and the updated `file-actions.ts`.

### T013 — Real-git integration test for seed

`test/integration/web/recent-feed-seed.integration.test.ts` — 17 tests across 2 suites (4 + 13 parameterized extension cases). All pass in 530ms.

**Real-git scenarios** (4 tests):
1. AC B1 — newest-first ordering: 3 commits in known order; assert `result.items[0..2]` paths match the reverse-chronological commit sequence; verify `kind`, `size`, `changedAt`, `eventType='changed'`, `absolutePath`, `name` are all populated.
2. AC B2 — limit honored: 8 commits with `limit=3` returns the 3 newest only.
3. AC B3 — non-git workspace: bare temp dir (no `git init`) → `{ ok: false, error: 'not-git' }`.
4. Stat-failure resilience: commit `survivor.ts` and `doomed.ts`, then `rmSync` doomed.ts post-commit. Result: survivor returns, doomed silently dropped (validates `Promise.allSettled` resilience design).

**Extension dispatch matrix** (13 parameterized cases via `it.each`): photo.png→image, screencast.mp4→video, voice.mp3→audio, notes.md→markdown, notes.MARKDOWN→markdown (case-insensitive), module.ts→code, component.tsx→code, script.py→code, Dockerfile→code (no extension), Makefile→code, archive.tar→binary, data.bin→binary, somefile-no-ext→generic.

**Decision** — used `execFileSync` for git ops in test harness (vs `simple-git` or any other library). No new test deps; same approach the codebase uses elsewhere.

**Decision** — `GIT_AUTHOR_NAME` etc set via env per call to keep tests hermetic (no dependence on host's git config). `commit.gpgsign=false` prevents the test from hanging on a signing key prompt if the host is configured for signed commits.

**Constitution P4 honored**: zero `vi.mock` calls, zero own-domain mocks. Real binary, real fs, real return path.

**Evidence**: `npx vitest run test/integration/web/recent-feed-seed.integration.test.ts` → 17/17 pass in 1.03s total (529ms test execution).

### T014 — TDD truncateMarkdown utility

`apps/web/src/features/041-file-browser/lib/truncate-markdown.ts` + `test/unit/web/features/041-file-browser/lib/truncate-markdown.test.ts`. 10/10 tests pass in 2ms.

**Algorithm**:
1. Empty / whitespace-only input → `''`.
2. Strip leading YAML front matter (handles CRLF; trims leading whitespace after closing `---`).
3. If body is now empty (front-matter-only doc) → `''`.
4. Single overlong line case (lines.length===1 OR all-but-first are blank) → truncate at maxChars + `…`.
5. Walk lines counting non-empty-lines + total chars; track fence parity (`insideFence`); break when either limit fires.
6. **Case 3 fix-up** — if stopped inside a fence, extend to closing fence (or EOF if unterminated; doesn't loop).
7. **Case 4 fix-up** — if stopped on a list-item line OR an indented continuation of one, extend through subsequent indented/marker lines until blank line or top-level prose.
8. Return joined output trimmed.

**Tests** (10):
- 6 binding cases per Finding 06 (front-matter-only / FM+prose / mid-fence / mid-list / overlong line / empty input).
- 4 invariants: maxLines counts non-empty only; full-body short docs return without ellipsis; CRLF normalises; unterminated fence does not throw or loop.

**Decision** — `maxLines` counts non-empty lines (matches typical "show me 8 lines of content" UX, not "8 lines including blank separators"). Documented in JSDoc.

**Decision** — character cap is "rough" — fence/list extension can blow past it. Trade-off: never split a fenced code block (broken markdown render). The feed's settings (T028) cap excerpt size with a hard ceiling separately if needed.

**Decision** — front-matter regex `/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/` is intentionally narrow (must start at byte 0, must be paired with closing `---` on its own line). Avoids matching `---` separators mid-document.

**Plan path correction**: existing convention is `test/unit/web/features/041-file-browser/lib/...` (with `features/` segment), not `test/unit/web/041-file-browser/lib/...`. Plan task row updated.

**Evidence**: `npx vitest run` 10/10 green, 2ms test execution.

### T015 — TDD live-merge reducer (`useRecentFeedState`)

`apps/web/src/features/041-file-browser/components/recent-feed/hooks/use-recent-feed-state.ts` + `test/unit/web/features/041-file-browser/recent-feed/use-recent-feed-state.test.ts`. **34/34 tests pass in 3ms.**

**Reducer actions** (8 types — `FeedAction`):
- `INIT` — seed items, drop dismissed + filtered, cap at ceiling.
- `EVENT_BATCH` — process N events: filter at intake (addDir/unlinkDir + build-artifact paths), then merge each event with promote/insert/delete semantics; ceiling enforcement at the end. Single dispatch per burst.
- `PAUSE` / `RESUME` — RESUME drains buffer in arrival order (oldest-first iteration over buffer reversed) so the newest buffered event lands at items[0].
- `CLEAR_DELETED` — auto-removal timer fires; only removes a path that's in the deleted state (idempotent).
- `SET_CEILING` — re-trim items if exceeded.
- `SET_DISCONNECTED` — UI banner toggle (T019).
- `DISMISS` — adds to dismissed set, removes from items + buffer, blocks future events for that path.

**Filtering** (Findings 06 + 10):
- `isIntakeFiltered`: `addDir`/`unlinkDir` events dropped (Finding 10); build-artifact paths dropped (Finding 06 — Risk M2 in validation).
- `isFilteredPath` matches `node_modules/`, `.next/`, `.turbo/`, `.cache/`, `dist/`, `build/`, `coverage/` as path PREFIX or after `/` separator. Substring matches (`build-tools/`, `notes-distinct/`) intentionally do NOT trigger — verified in 13 parameterized cases.

**Buffer coalescence during PAUSE**: multiple events for the same path collapse to one entry — newest wins. So `add` → `change` → `unlink` for a single file during a pause buffers as a single deleted entry, not three.

**Burst coalescing (AC G3)**: the reducer guarantees one dispatch per `EVENT_BATCH`. The hook layer (`useRecentFeedState`) batches raw `pushEvent(...)` calls onto the next animation frame (or microtask in jsdom), so 50 raw events fired synchronously result in one rAF, one EVENT_BATCH, one render. Pure reducer is deterministic: `events.length === 50` ⇒ exactly one state transition.

**Decision** — exported `isFilteredPath` and `isIntakeFiltered` so T017's integration test can lock the same predicate without re-deriving it. Future `.gitignore`-aware filter swap-in (workshop §11 Q6 follow-up) lands in this single function.

**Decision** — `pushEvent` always queues on rAF/microtask, never dispatches synchronously. Even a single event pays the 16ms latency cost in exchange for guaranteed coalescing of any concurrent events. Trade-off: visible promotion is slightly delayed (16ms) but burst behavior is deterministic.

**Decision** — `eventToFeedItem` reuses `detectFeedItemKind` from `services/recent-feed-items.ts` (extension dispatch). Single source of truth for kind classification across seed + live merge.

**Test coverage** (34):
- `isFilteredPath`: 13 cases (positive matches, nested matches, substring negatives).
- `isIntakeFiltered`: 3 cases (addDir/unlinkDir/file).
- `INIT`: 2 cases (seed with dismissed/filtered drop, ceiling cap).
- `EVENT_BATCH`: 7 cases (promote/insert/unlink/dir-filter/artifact-filter/50-event-burst/ceiling-eviction).
- Dismissed-path block.
- `PAUSE`/`RESUME`: drain order, intra-buffer coalescence.
- `CLEAR_DELETED`/`SET_CEILING`/`DISMISS`: 3 cases.

**Evidence**: `npx vitest run` 34/34 in 3ms.

### T016 — Wire useRecentFeedState to useFileChanges('*')

Replaced the orchestrator's `useState<FeedItem[]>` with `useRecentFeedState` (T015 reducer + rAF-batched pushEvent). Subscribed to `useFileChanges('*', { debounce: 50 })` from `_platform/events/045-live-file-events` — Finding 01 binding: NO new SSE channel/broadcaster/route added.

Effect: when `changes` array updates, walk it and push only events whose timestamp exceeds `lastSeenTsRef.current` to avoid double-counting on re-render. Each FileChange → RawFileChangeEvent shape (path, kind=eventType, absolutePath via `joinPath`, mtimeMs from SSE timestamp, size=0 — next seed refresh repopulates).

Pause/refresh wiring: header buttons dispatch `PAUSE`/`RESUME` to the reducer; refresh re-runs `loadSeed`. The `bufferedChanges` count surfaces in the header live-indicator copy ("Paused (3)") — workshop §5.

**Decision** — pattern is `'*'` not `'**'`. The plan task said `useFileChanges('**')` but the existing hub's JSDoc + path-matcher use `'*'` as the watch-everything wildcard ("Watch everything (for changes sidebar)"). Plan task row updated.

**Decision** — `path-browserify` not in deps; replaced with inline `joinPath(worktreePath, relPath)` helper. Browser-safe, sufficient for clipboard/display use case (no `..` resolution needed since server gives normalised relative paths).

**Decision** — `lastSeenTsRef` deduplication: `useFileChanges` 'replace' mode emits the same batch on each render until a newer batch arrives. Tracking the max-seen timestamp per render pass keeps each event from being pushed twice. The reducer's intake filter (`isIntakeFiltered`) is a second-line guard, but timestamp tracking is cheaper than re-running the dedup at the merge layer.

**Decision** — debounce 50ms on the SSE hook. Aggregates micro-bursts into one batch handed to the rAF queue. Total time-to-render: ≤ 50ms (debounce) + ≤ 16ms (rAF) ≈ 66ms worst-case. Acceptable per AC G3 (50 events → ≤ 3 renders) and well under the workshop's 200ms perceived-latency budget.

**Evidence**: tsc clean. AC C1/C2 covered. Live integration verification lands at T017 (real fs.watch + real SSE).

### T017 — Real fs.watch + real reducer integration test

`test/integration/web/recent-feed-live-updates.integration.test.ts` — 5 tests pass in 523ms. Constitution P4 honored (zero `vi.mock`).

**Scope decision**: this test covers the file-browser-side live-update pipeline (real fs.watch → real recentFeedReducer). The HTTP/SSE round-trip (server FileChangeHub → SSEManager → client EventSource → useFileChanges) is owned by Plan 045's existing integration tests; reproducing it here would require booting Next.js dev server (heavy, slow, brittle). The file-browser-side contract — *given a stream of file events, does the feed merge them correctly?* — is what this plan introduces and what this test locks.

**Tests** (5):
1. **AC C1** — real fs.watch fires for `writeFileSync` of a new file + modify of an existing one; reducer promotes/inserts correctly; no duplicates from in-place mutation.
2. **AC G3** — 50 rapid `writeFileSync` calls produce ≥ 50 fs events; one `EVENT_BATCH` dispatch handles the burst as a single state transition (reference inequality on items proves a single transition occurred).
3. **AC C2 noise control** — creating files under `node_modules/` and `.next/` produces real fs events that the reducer rejects at intake; only the `real.ts` source file lands in items.
4. **Filter cross-check** — verifies `isFilteredPath` matches the same patterns the unit suite asserts (single source of truth across unit + integration boundaries).
5. **Live-after-seed compatibility** — initialises a real git repo (mirrors T013 setup), seeds the reducer, then dispatches a live `add` event; new entry lands on top, seed remains intact.

**Decision** — recursive `fs.watch` works on macOS/Windows (the harness runs on macOS). Linux would need a different setup, but that's not the deployment target. Documented inline.

**Decision** — applyEvents helper synthesises `RawFileChangeEvent`s from real fs events with `size: 100, mtimeMs: Date.now()` (since fs.watch doesn't carry that metadata). The reducer doesn't care about those values for ordering; only `path` + `kind` are load-bearing.

**Decision** — used `--no-gpg-sign` flag on git commit (in addition to `commit.gpgsign=false` config) belt-and-braces against host signing setups. Plan 084 noted this same workaround.

**Evidence**: `npx vitest run test/integration/web/recent-feed-live-updates.integration.test.ts` → 5/5 pass in 901ms total.

### T018-T019 — Pause buffer pill + SSE-disconnect banner

Both UI affordances landed in `recent-feed-view.tsx` as small additions:

**T018 buffer pill** — sticky button rendered when `state.paused && state.buffer.length > 0`:
- "N new {change|changes} — click to show"
- Click dispatches `RESUME` → reducer drains buffer in arrival order (T015 logic).
- Sticky `top-0 z-20` so it stays visible while scrolling. Workshop §5.
- Header pause/resume button already wired to PAUSE/RESUME at T016.

**T019 disconnect banner** — `state.isDisconnected` driven by `useSSEConnectionState()` from `_platform/events` (Plan 045 — existing primitive, no new code needed). When `connectionState !== 'connected'` we dispatch `SET_DISCONNECTED: true`; reverts when reconnected. Banner uses amber accent with `role="status"` and `aria-live="polite"` for SR users; copy: "Live updates disconnected — existing items preserved; reconnecting…" Reducer never blanks `items` on disconnect (AC C5 binding).

**Decision** — pill placement is INSIDE the scroll container so it doesn't overlap the header. The header itself already shows "Paused (3)" in the live indicator (T016) — the pill is the action affordance, the header is the status read-out.

**Decision** — disconnect banner is OUTSIDE the scroll container (above the filter chips) so it stays visible regardless of scroll position. Workshop §7.

**Evidence**: tsc clean. Live behavior verifiable via T035 harness exercise (visual smoke at default + mobile).

### T020 — file-excerpt server action with security gating

`apps/web/src/features/041-file-browser/services/file-excerpt.ts` + `test/unit/web/features/041-file-browser/services/file-excerpt.test.ts`. **32/32 tests pass in 11ms.**

Server action `fetchFileExcerpt(worktreePath, filePath, mode)` registered in `app/actions/file-actions.ts` (resolves `IFileSystem` + `IPathResolver` from the DI container; same pattern as readFile/saveFile).

**Security gating** (per validation Risk M1, ordered):
1. **Secrets-pattern reject** (BEFORE path resolution): `.env*`, `credentials`, `*.secret*`, `*.key`, `*.pem`, `id_rsa*`, `**/.git/**`. Returns `'forbidden'`.
2. **Path-traversal guard**: `pathResolver.resolvePath(worktreePath, filePath)` throws `PathSecurityError`. Returns `'security'`.
3. **Existence + directory guard**: not-found.
4. **Content-type gate**: only `markdown` and `code` (via `detectFeedItemKind`); also a belt-and-braces check via `detectContentType` to reject `image`/`video`/`audio`/`pdf`. Returns `'forbidden'`.
5. **Size guard for full mode**: 256KB hard cap. Excerpt mode unbounded (output capped by `truncateMarkdown` / first-N-lines truncation regardless of input size).
6. **Read** then **null-byte sniff** (first 8KB): catches binary content with text-y extension. Returns `'forbidden'`.

**Tests** (32):
- `isSecretsPath` parameterized: 19 cases (14 reject + 5 pass-through). Distinguishes `credentials.json` (reject) from `credentials-overview.md` (pass) — basename-anchored regex.
- Service: 13 tests using real `NodeFileSystemAdapter` + `PathResolverAdapter` against `mkdtempSync` temp dirs:
  - markdown excerpt + truncation applied
  - code excerpt + detected language + first-N-lines cap
  - full mode returns full content
  - `.env` rejected
  - `config/credentials` rejected
  - `../../etc/passwd` path-traversal rejected
  - PNG / MP4 / MP3 binary types rejected
  - null-byte content rejected even with `.ts` extension
  - missing file → not-found
  - directory → not-found
  - 257KB file in full mode → too-large
  - 300KB markdown in excerpt mode → succeeds (output truncated)

**Decision** — JSDoc near the top initially used `**/credentials*` literal, which closed the JSDoc block prematurely (TS1160). Replaced with prose description; SECRETS_PATTERNS regex remains the single source of truth. Future readers should not edit the JSDoc to use raw `*/` sequences.

**Decision** — secrets-pattern check is the FIRST gate (before path-resolution). A clever attacker could pass `worktreePath/../.env` — the path-resolver catches the traversal but the pattern check catches the suspicious filename first regardless. Defense in depth.

**Decision** — null-byte sniff after read uses the same 8KB window as `readFileAction` for consistency.

**Constitution P4 honored**: zero `vi.mock`. Real Node adapters; real fs against temp dirs.

**Evidence**: `npx vitest run` 32/32 in 11ms.

### T021-T023 — Markdown / code / deleted preview cards

Three new files under `previews/`. RecentFeedView updated to dispatch on `kind` AND `eventType==='deleted'`:

- **`markdown-excerpt-card.tsx`** — useLazyLoad + fetchFileExcerpt('excerpt'). Renders truncated markdown as `<pre>` whitespace-pre-wrap with fade-out gradient. Loading / error / ready states. Full markdown rendering (Mermaid + Shiki + tables) deferred to v1.x — workshop §2 binding visual treatment honored (excerpt + gradient).
- **`code-excerpt-card.tsx`** — symmetric to markdown but with `whitespace-pre overflow-x-auto` and `data-language={lang}`. Shiki HTML rendering deferred — server returns raw text bounded by codeLines (default 12).
- **`deleted-preview.tsx`** — strikethrough mini-card with Trash2 icon. `useEffect` timer fires `onClearDeleted(path)` after `deletedWindowMs` (default 5000ms). `Infinity` disables the timer ("Until dismissed" setting per workshop §9). Orchestrator dispatches `CLEAR_DELETED` to the reducer (T015) which removes the deleted entry.

RecentFeedView dispatch updated:
- `eventType === 'deleted'` short-circuits to DeletedPreview regardless of kind.
- `kind === 'markdown'` → MarkdownExcerptCard.
- `kind === 'code'` → CodeExcerptCard.
- Other kinds unchanged (image/video/audio/binary).

**Decision** — Mermaid/Shiki rendering deferred. Reasons: (1) v1 ships excerpts as text — workshop §2 says "fade-out gradient hinting more content"; users click-to-open for full rendering. (2) Adding Mermaid+Shiki to every excerpt card would re-trigger the cold-start latency Finding 12 already flagged. (3) FileViewerPanel already does full rendering — single place to maintain.

**Decision** — fetchFileExcerpt called from inside the card (per-card fetch on viewport entry) rather than batched at the orchestrator level. Trade-off: more server round-trips but each fires only when the card scrolls into view. content-visibility:auto + useLazyLoad keep this bounded.

**Decision** — DeletedPreview takes `onClearDeleted` callback rather than `dispatch` directly, so it stays a dumb component. Orchestrator wires the dispatch.

**Plan path note** — relative-import depth from `previews/` to `app/actions/` is 6 `../`s (one deeper than from `recent-feed/`). Verified via `realpath`.

**Evidence**: tsc clean across all 4 modified files.

### T024 — Filter predicate + toggle extraction + tests

Extracted the inline filter logic from `recent-feed-view.tsx` into a testable lib module `apps/web/src/features/041-file-browser/lib/feed-filter.ts`:

- `ALL_FILTER_CATEGORIES` — canonical all-inclusive set, exported by reference identity (so `=== ALL_FILTER_CATEGORIES` is a meaningful state check).
- `feedItemCategory(item)` — `FeedItemKind` → `FilterCategory` mapping. `binary` + `generic` both bucket under `'other'`.
- `itemMatchesFilter(item, active)` — predicate.
- `toggleFilterCategory(prev, cat)` — pure state-machine transition function.

`recent-feed-view.tsx` now imports and delegates — orchestrator no longer carries the filter logic in body.

**Tests** (18, 2ms total):
- 7 cases for `feedItemCategory` mapping (all 7 kinds → their categories; binary/generic → 'other').
- 3 cases for `itemMatchesFilter` (all-pass, subset-restrict, other-bucket).
- 8 cases for `toggleFilterCategory` covering workshop §5 + F001 fix:
  - 'All' click from any state → snap to all-inclusive.
  - **F001 LOCK**: from all-inclusive, click non-All → fresh single-chip subset (NOT delete-from-all).
  - Subset add when chip not active.
  - Subset remove when chip active.
  - Empty subset auto-snaps to all-inclusive.
  - Input set never mutated.
  - Multi-step "All → Image → Video" → {image, video}.
  - Multi-step "Image → empty → All" → all-inclusive.

The F001 fix is now locked — a regression to the previous broken implementation would fail the explicit "fresh single-chip subset" assertion that calls out the 'NOT every-category-except-image' invariant.

**Evidence**: `npx vitest run` 18/18 in 2ms.

### T025 — useFeedActions hook (9 catalog actions)

`apps/web/src/features/041-file-browser/components/recent-feed/hooks/use-feed-actions.ts` — implements every workshop §3 catalog action:

1. **`open(path)`** — calls caller-supplied `onOpenFile` (browser-client wires `setParams({ file, view: null, line: null })`).
2. **`copyRelativePath(path)`** — `navigator.clipboard.writeText(path)` + toast.success.
3. **`copyAbsolutePath(path)`** — looks up the FeedItem in `items` for its absolutePath, writes to clipboard.
4. **`download(path)`** — `window.open(rawFileUrl + '&download=true')`.
5. **`copyFilename(path)`** — basename only.
6. **`copyMarkdownLink(path)`** — `![name](url)` for image/video/audio kinds; `[name](url)` for everything else. Uses raw-file URL.
7. **`revealInTree(path)`** — calls caller-supplied `onRevealInTree` (browser-client wires `setParams({ dir, file, view: null })`).
8. **`copyFileContents(path)`** — async; fetches via `fetchFileExcerpt(worktreePath, path, 'full')` (T020 server action — same security gating + 256KB cap). Falls back to toast.error on `forbidden`/`security`/`not-found`/`too-large`.
9. **`dismiss(path)`** — dispatches `{ type: 'DISMISS', path }` to the T015 reducer (adds to dismissed set, removes from items + buffer, blocks future events).

Orchestrator change: removed inline `handleCopyRel`/`handleCopyAbs`/`handleDownload`/`handleOpenItem` and replaced with `useFeedActions({ slug, worktreePath, items, dispatch, onOpenFile, onRevealInTree })`. CardActions now consumes the hook directly.

`browser-client.tsx` wires the navigation handlers:
- `onOpenFile={(path) => setParams({ file: path, view: null, line: null }, { history: 'push' })}` — clears `view` AND `line` (so the file opens fresh, not at a previously-set scroll line).
- `onRevealInTree={(path) => { const idx = path.lastIndexOf('/'); const dir = idx === -1 ? '' : path.slice(0, idx); setParams({ dir, file: path, view: null }, { history: 'push' }); }}` — sets dir + file + clears view.

**Decision** — `onOpenFile` and `onRevealInTree` are OPTIONAL props on `RecentFeedView`. When not provided (e.g., a future popout/standalone usage), the orchestrator falls back to the bridge events (`recent-feed:open-file`, `recent-feed:reveal-in-tree`) so it remains operable in non-browser-client contexts. Browser-client always supplies them — bridge events are never fired in production.

**Decision** — `copyFileContents` returns `Promise<void>`; the caller `await`s for error handling. The other 8 actions are sync (clipboard.writeText returns a promise but we don't await it for those — fire-and-forget with toast feedback).

**Evidence**: tsc clean for `use-feed-actions.ts`, `recent-feed-view.tsx`, `browser-client.tsx`. The two pre-existing errors at browser-client lines 516-517 (`fileNav.fileData?.content`) are unchanged from before T025.

### T026-T027 — Keyboard nav + ARIA/reduced-motion/contrast

**T026 — `use-feed-keyboard.ts`**:

Per-card focus resolution: walks up from `document.activeElement` looking for `data-feed-card-path`. FeedCard sets that data attribute + `tabIndex={0}` to be focusable. Returns a single `onKeyDown` handler the orchestrator attaches at the feed-root level.

Shortcuts (workshop §3 + AC H2):
- ArrowUp / ArrowDown — navigate (wraps; uses `CSS.escape` for selector safety since paths can contain `.`).
- Enter — invoke `actions.open` on focused card.
- `c` — copyRelativePath; `C` (Shift+C) — copyAbsolutePath; `d` — download; `r` — revealInTree; `m` — copyMarkdownLink.
- Modifier-key check (`!metaKey && !ctrlKey && !altKey`) so the letters don't intercept browser shortcuts (Cmd+R reload, Cmd+D bookmark).
- Input/textarea/select tag check skips intercept when user is typing.

**T027 — ARIA + reduced-motion**:

- Orchestrator: `role="feed"` + `aria-label="Recent changes"` + `aria-busy={state.isLoading}` (AC H1).
- FeedCard: `role="article"` already set in T007 (with biome ignore + rationale). T027 adds `tabIndex={0}` and `data-feed-card-path` to support T026 keyboard nav. `focus:outline-2 focus:outline-ring focus:outline-offset-2` for visible focus ring; `motion-reduce:transition-none` Tailwind variant disables hover lift/scale (AC H5).
- Polite live region (sr-only): announces newly added items via `aria-live="polite" aria-atomic="false"`. Currently fires when items[0] has `eventType==='added'` — could be refined to fire only on TRANSITIONS in v1.x but covers AC H3 baseline.
- Contrast: event-badge colors set in T007 use `bg-{color}-500/10` + dark mode `text-{color}-400`/light mode `text-{color}-700` — meets WCAG AA in both themes by Tailwind defaults. Path label uses `text-muted-foreground` (existing system value, contrast verified by codebase precedent).

**Decision** — kept the disconnect banner OUTSIDE the role="feed" container so SR users hear "Recent changes feed, busy" (orchestrator) AND the disconnect status independently rather than the banner being part of the feed announcement.

**Decision** — ArrowUp/ArrowDown both fall through to `0` when no card is focused yet — first ArrowDown grabs the top card. Same UX as the gallery's keyboard nav.

**Decision** — letter shortcuts fire only when a card is focused. ArrowUp/ArrowDown don't require focus (they grab focus instead).

**Evidence**: tsc clean across both files.



---

## Discoveries & Learnings

| ID | Type | Title | Source Task | Description | Resolution / Action |
|---|---|---|---|---|---|
| _none yet_ | | | | | |

---

## Per-Task Entries

### T001 — Create recent-feed/ scaffold + types

Created two files:
- `apps/web/src/features/041-file-browser/components/recent-feed/types.ts` — `FeedItem`, `FeedItemKind` (image|video|audio|markdown|code|binary|generic), `FeedEventType` (added|changed|deleted), `FeedState` (items + paused + buffer + ceiling + isLoading + isError + errorMessage + isDisconnected + dismissed:Set).
- `apps/web/src/features/041-file-browser/components/recent-feed/index.ts` — re-exports the four type aliases. Component re-exports empty per plan ("barrel exports empty").

**Decision**: `FeedItemKind` adds `markdown` / `code` / `generic` on top of `detectContentType`'s categories (`image|video|audio|html|pdf|binary`). The feed needs to distinguish text-based excerpt cards from generic binaries; mapping happens in T012's seed wiring.

**Decision**: `dismissed: Set<string>` lives in state, not a separate hook — keeps T025 `dismiss` action a single dispatch and avoids cross-component refs.

**Evidence**: `tsc --noEmit` shows zero errors in `recent-feed/` (pre-existing errors in unrelated `browser-client.tsx`, `useAgentInstance.ts`, `mobile-search-overlay.tsx`, `flowspace-mcp-client.ts`, `workflow-execution-manager.ts` — not mine).

### T002 — Add view enum to fileBrowserParams

Added `view: parseAsStringLiteral(['recent-feed'] as const)` to `fileBrowserParams`. Result type is `'recent-feed' | null` — nuqs's literal parser cannot accept `null` as a withDefault argument (the default must be one of the literal values), so the plan's `.withDefault(null)` shorthand was implemented as "no withDefault" to get the same nullable behavior. Existing 5 params (dir, file, mode, panel, line) unchanged.

**Plan note**: Updated plan task row to document the API correction.

**Evidence**: typecheck clean for `file-browser.params.ts`; the param flows through `fileBrowserPageParamsCache` automatically (spread).

### T003 — Add view branch in browser-client.tsx

Created stub `recent-feed-view.tsx` with `RecentFeedView({ slug, worktreePath, isGit, onClose })` exporting a placeholder loading message. T012 will replace the body with the seeded orchestrator. Stub keeps the import path resolved during incremental landing.

In `browser-client.tsx`:
- Added `import dynamic from 'next/dynamic'`.
- Added module-scope `const RecentFeedView = dynamic(() => import(...).then(m => m.RecentFeedView), { ssr: false, loading: ... })` for code-splitting.
- Pulled `view` from `params` (alongside `mode`, `selectedFile`, `currentDir`, `panelMode`, `scrollToLine`).
- Added `handleCloseRecentFeed` callback that sets `view: null` via `setParams` (history: 'push'), restoring prior `selectedFile`/`currentDir` state per Finding 07.
- Added `view === 'recent-feed' ?` branch BEFORE `selectedFile ?` in TWO render locations:
  - `contentView` (mobile Content tab, line 892)
  - `main={...}` (desktop main slot, line 1141)

**Decision**: Did NOT extract the cascade into a helper component despite duplication — pre-existing code smell; refactoring it falls outside T003's scope (CLAUDE.md: "no premature abstraction; bug fix doesn't need surrounding cleanup"). The two locations differ in their `FolderPreviewPanel.onFileClick` handler (mobile sets `mobileActiveIndex(1)`), so the duplication is not 100% — extraction would need to thread that callback.

**Decision**: Stub component exports both default and named — keeps `next/dynamic` happy regardless of import style. T012 may consolidate to one when the orchestrator lands.

**Plan-spec deviation**: T012 normally builds `RecentFeedView` from scratch. This task creates a minimal stub now so the import resolves; T012 will replace the body in-place (no path change). Recorded here so the companion sees this as intentional.

**Evidence**: `tsc --noEmit` shows zero new errors. The two errors at lines 516-517 are pre-existing (`fileNav.fileData?.content` against `ReadFileResult` type) — exact same errors flagged before T003 at lines 492-493 (shifted by 24 because of the dynamic import + close handler addition).

### T004 — Lightweight test for view-branch routing invariant

Plan path was `test/unit/web/041-file-browser/...` but existing convention is `test/unit/web/features/041-file-browser/...`. Corrected the path; updated plan task row to record the correction.

Wrote `browser-client-view-branch.test.tsx` with 7 tests across two suites:

- **RecentFeedView stub** (2 tests): renders placeholder copy; does not invoke onClose during render.
- **browser-client.tsx routing — Finding 07 ordering invariant** (5 tests): asserts the `next/dynamic` import shape (with `ssr:false`); reads `view` from params destructure; defines `handleCloseRecentFeed` setting only `view: null` (preserving other params); `view === 'recent-feed'` precedes `selectedFile ? (` in the **mobile** contentView block; same ordering in the **desktop** main slot block.

**Decision** — testing strategy: BrowserClient composes ~25 hooks/contexts. Mocking those would either (a) violate Constitution P4 (no `vi.mock` of own-domain internals) or (b) drown the test in 150 lines of mock plumbing. Instead, this lightweight test verifies the two specific properties Finding 07 binds — the prop shape (smoke) and the source-level ordering (regex on the file). The actual end-to-end behavior is covered later by T013 (real git seed integration test) and T035 (harness visual smoke).

**Decision** — source-regex tests are normally fragile, but the ordering invariant *is* the test: if a future refactor swaps the cascade so `selectedFile ?` comes before `view ===`, the user's prior file/dir state is wiped on feed close. The regex is the cheapest enforcement mechanism for that invariant.

**Evidence**: `npx vitest run` passes 7/7 in 13ms.

### T005 — Extend CardActions with onCopyAbsolutePath, onOpen, overflowMenu

Three new optional props added to `CardActionsProps`:
- `onCopyAbsolutePath?: (path: string) => void` — renders a second copy button (FileText icon) when supplied. Tooltip on the existing copy button switches from "Copy path" → "Copy relative path" to disambiguate.
- `onOpen?: (path: string) => void` — renders a left-most "Open" button (ExternalLink icon) when supplied.
- `overflowMenu?: ReactNode` — caller-supplied overflow slot appended at the right (CardActions does not own the menu's content).

**Decision** — internal state shape: replaced the `copied: boolean` flag with `copiedKind: 'rel' | 'abs' | null` so both copy buttons can independently flash a confirmation tick. Keeps a single state variable instead of two.

**Decision** — button order: Open · Copy rel · Copy abs · Download · Overflow. Matches workshop §3's pinned action order for media cards.

**Decision** — tooltip relabel only when both copy buttons render. Existing 5 callers (image-card, video-card, audio-card, generic-card, folder-card) all supply only `onCopyPath` + `onDownload`, so they continue to show "Copy path" — zero UX change for the gallery.

5 existing callers verified via grep: `image-card.tsx:75`, `generic-card.tsx:62`, `video-card.tsx:117`, `audio-card.tsx:56`, `folder-card.tsx:47`. None pass `onCopyAbsolutePath`, `onOpen`, or `overflowMenu`, so all continue to render exactly the same 2-button strip.

**Evidence**: `tsc --noEmit` clean for `card-actions.tsx` and all preview-cards consumers.

### T006 — CardActions extension contract test

10 tests across 2 suites:

- **Plan 077 baseline (gallery cards)** — 4 tests: only Copy + Download render with the original prop set; Open / Copy abs / Copy relative path tooltips absent; onCopyPath fires with the exact path; onDownload fires with the exact path.
- **Plan recent-changes-feed T005 extensions** — 6 tests: Open button renders + fires onOpen; Copy abs button renders + fires onCopyAbsolutePath; tooltip on first copy switches to "Copy relative path" exactly when both copy actions are present (and original "Copy path" tooltip disappears); overflow ReactNode renders inline; full prop set produces all 5 buttons in correct order; Open click does not leak into other handlers.

**Decision** — used `toHaveBeenCalledExactlyOnceWith` which catches double-fire bugs that would slip past `toHaveBeenCalledWith`. The `e.stopPropagation()` calls in CardActions are critical (the cards are inside clickable feed-card shells in T007); these tests don't directly assert stopPropagation but the call-once assertions catch any regression that re-bubbles.

**Plan path correction** noted in plan task row.

**Evidence**: `npx vitest run` passes 10/10 in 92ms.

### T007 — feed-card.tsx shell

`<FeedCard>` shell renders:
- Header strip: `<FileIcon>` (from `_platform/themes` per Finding) · clickable filename (semibold, truncates) · path (muted, left-truncated via `dir="rtl"` + nested `<bdo dir="ltr">` so trailing segments stay visible) · meta line (relative time · size · event-type colored badge) · actions slot (top-right, hover-revealed via group-hover).
- Preview slot — `children` rendered below the header strip with subtle muted background.

**Decision** — left-truncation: used `dir="rtl"` + `<bdo dir="ltr">` to flip the truncation anchor without reversing reading order. Cleaner than CSS `direction: rtl` hacks that affect the entire layout subtree. Workshop §2 D1 specified "truncated from the left so trailing path segments stay visible".

**Decision** — `formatRelativeTime` and `formatFileSize` exported from feed-card.tsx (not split into a util file). Two reasons: (1) they have no other consumers yet, so a util file would be premature; (2) they're tested via the rendered card output. If T010 (header/filters) or T023 (deleted preview) needs the relative-time formatter, we promote it then. Avoids speculative abstraction (CLAUDE.md).

**Decision** — `role="article"` is set explicitly here (with biome `useSemanticElements` ignored for the `<article>` element rationale comment) so T027 (a11y pass) can wire `role="feed"` at the list level without re-traversing card markup. AC H1 satisfied at the shell level.

**Decision** — clickable title is a `<button>` not an anchor: the open action will dispatch a state transition (set `?file=...&view=null`) via `onActivate`, not navigate to an external URL. Matches the existing `image-card.tsx` `role="button"` pattern but uses a real button for proper keyboard semantics.

**Decision** — event badge uses semantic colors (green/blue/red) that work in both light and dark themes (T027 will verify contrast).

**Evidence**: `tsc --noEmit` clean for `feed-card.tsx`. Tests for the formatters + render assertions land at T035 (full-suite verification) — not gated here per plan's Done When ("Card renders with mock `FeedItem`" — render path verified by typecheck + visual harness in T035).

### T008 — Image / Video / Audio / Binary preview cards

Four sibling components under `recent-feed/previews/`. All slot into `<FeedCard>` as children:

- **ImagePreview**: `useLazyLoad` (no fork — Finding 14) + raw-file-API URL passed in by the orchestrator. Bounded `max-h-[60vh]`. Loaded/error fade-in.
- **VideoPreview**: native `<video controls preload="metadata">` with optional `posterUrl`. Workshop §6 NO autoplay-loop binding honored. `preload="metadata"` keeps memory bounded until user interacts (Finding 05). `useLazyLoad` defers element insertion until card scrolls into viewport.
- **AudioPreview**: native `<audio controls preload="metadata">`. No virtualization needed (audio elements are cheap until played).
- **BinaryPreview**: file icon + formatted size + the binding "Binary file — preview not available." copy (AC D3).

**Decision** — preview components take `rawFileUrl` directly (string) rather than computing it themselves. Centralizes URL construction in the orchestrator (T012) and keeps previews dumb. Same pattern as Plan 077 image-card.

**Decision** — biome `useMediaCaption` ignored on `<video>` and `<audio>` with rationale comment ("workspace-local user content; captions cannot be auto-derived"). Same call existing video-card and audio-card make — consistent with the codebase's a11y posture.

**Decision** — ImagePreview reserves a 32-row placeholder (`h-32`) before lazy-load fires, BinaryPreview is intrinsically sized. Video reserves 48-row placeholder. Keeps virtualization pre-fetch heights stable.

**Evidence**: `tsc --noEmit` clean for all 4 previews. Visual smoke at T035.

### T009-T011 — Static UI primitives (single commit, three plan rows)

Bundled as one logical commit because they're sibling primitives that together constitute "the static feed shell" — none stands alone usefully and they will land into the orchestrator (T012) as a unit.

**T009 — `recent-feed-list.tsx`** (virtualized vertical list):
- Strategy: `content-visibility: auto` + `contain-intrinsic-size: auto 480px` per item. Native browser virtualization, zero JS overhead.
- Decision: did NOT use `react-window` or measure row heights. Variable-height media cards make explicit virtualization more complex than `content-visibility:auto` + a one-time intrinsic-size hint. Idle entries release decoded media via the preview-level `useLazyLoad` (Finding 14). Covers AC G1, G2.
- Decision: `role="feed"` is set at the orchestrator (T012/T027), not the list itself. Keeps list a pure container.

**T010 — `recent-feed-header.tsx` + `recent-feed-filters.tsx`** (chrome strip + chip row):
- Header: title · live indicator (green pulsing dot when live + not paused; muted otherwise) · counter · pause/resume button · refresh · settings cog. `aria-live="polite"` on the live indicator so SR users hear pause/resume transitions. Workshop §5 chrome.
- Filters: 7 chips (All, Images, Videos, Audio, Markdown, Code, Other). Multi-select via `aria-pressed`. Component is a dumb chip strip — set-management semantics (auto-snap-to-all when last chip removed) live in T015 reducer + T024 predicate test.
- Decision: `FilterCategory` exported as a discriminated string union for downstream use in T015's reducer. `FILTER_CATEGORIES` is the canonical ordered list — keeps the chip order deterministic for snapshot tests.

**T011 — `feed-empty-state.tsx` + `feed-error-state.tsx` + `feed-skeleton.tsx`** (state placeholders):
- `FeedSkeleton`: stacks 5 `<CardSkeleton>` (Plan 077 — Finding 13 anti-reinvention). Vertical with stagger animation; matches the feed's actual layout.
- `FeedEmptyState`: two copy variants based on `filtered` prop — generic "no recent changes" vs filter-specific "no matches; try All".
- `FeedErrorState`: amber AlertCircle + main message + optional detail (e.g., "not a git workspace") + invariant clarification "Live file changes will still appear here as they happen" (per AC B3 — live updates still functional during seed failure). Optional `onRetry`.

**Evidence**: `tsc --noEmit` clean across all 5 new files (recent-feed-list, recent-feed-header, recent-feed-filters, feed-empty-state, feed-error-state, feed-skeleton).


