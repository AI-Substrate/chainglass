# Recent Changes Feed

**Mode**: Simple
**Created**: 2026-05-03
**Plan Folder**: `docs/plans/084-random-enhancements-3/` (multi-feature bundle)
**Status**: CLARIFIED — ready for `/plan-3-v2-architect`

📚 This specification incorporates findings from [`recent-changes-feed-research.md`](./recent-changes-feed-research.md) and the UI design locked in [`workshops/005-recent-changes-feed-ui.md`](./workshops/005-recent-changes-feed-ui.md). Both are authoritative — do not contradict them.

---

## Research Context

The research dossier and UI workshop together establish:

- **~90% of the primitives already exist** in the codebase: live file-change SSE channel (`file-changes`), `useFileChanges` hook, `getRecentFiles()` git-log seed, `detectContentType()` dispatcher, type-specific preview cards (image/video/audio/generic), Shiki code highlighter, raw-file API with Range support, `useLazyLoad` IntersectionObserver, `FileIcon` resolver.
- **The feature is genuinely new code in only a few places**: a feed-view component (virtualized vertical stack), markdown- and code-excerpt cards, a small markdown excerpt utility, an extended action-button set, a new `?view` URL param branch in the main-panel decision tree, and a settings page entry.
- **The UI is already workshopped**: card anatomy, action set (with copy-rel and copy-abs as inline-pinned for media), feed chrome (header + filter chips + live indicator + pause + refresh), promotion animations, empty/loading/error states, keyboard model, and settings panel — all designed in workshop 005.

---

## Summary

The Recent Changes Feed is a new main-panel view in the file browser that shows a vertical, scrolling stack of the most-recently-changed files repo-wide, each rendered with a type-specific preview (images inline, videos with native controls, markdown excerpts, code excerpts, etc.). The newest change is always at the top, and the feed updates live as files change. It exists primarily for **media-review flows** — generating a batch of images or videos and wanting to scan the outputs without click-back-click-back round trips through the file tree — and secondarily as a high-bandwidth "what's been happening in this repo" view.

---

## Goals

- **Review generated media at a glance**: when an external tool generates many images and/or videos into the workspace (e.g., a batch image generator, a screenshot run, a video render), the user can scroll a single view that shows each output rendered, in chronological order, without per-file navigation.
- **Triage screenshots / artifacts in time order**: capture-heavy debugging sessions surface their outputs as a timeline of previews instead of a tree of filenames.
- **See "what's been changing" repo-wide at high bandwidth**: returning to a project after time away, the user opens one view and sees the actual content of recently-edited files (markdown excerpts, code excerpts, media renders) — not just file names.
- **Copy paths quickly into other contexts**: every card surfaces both copy-relative-path and copy-absolute-path actions in one click, plus copy-as-markdown-link for media — addressing the real ergonomic friction of pasting outputs into AI prompts, docs, scripts, and chats.
- **Coexist with existing browser surfaces**: the tree (left panel) stays intact; the feed is a swappable main-panel view that does not replace or hide the existing folder/file viewers.

---

## Non-Goals

- **NOT a git history viewer.** No diffs, no commit messages, no authors, no SHAs. The feed uses `git log` only as a seed source for initial ordering — it does not surface git-domain concepts to the user.
- **NOT a notification/unread-count surface.** No badges, no toasts on every change, no push behavior. The feed is a passive, opt-in view; users navigate to it when they want to look.
- **NOT folder-scoped.** It is repo-wide. `FolderPreviewPanel` already does folder-scoped media review and is unchanged by this work.
- **NOT a bulk-action / multi-select surface in v1.** One file → one card → one set of buttons. Multi-select stays a v2 conversation.
- **NOT a new event channel.** The feature MUST consume the existing `_platform/events` `file-changes` multiplexed SSE channel via `useFileChanges`. It must not add a new SSE route, channel name, or broadcaster. (See Constraints in Acceptance Criteria.)
- **NOT a new domain.** The feature lives inside the existing `file-browser` domain and consumes other existing domains' contracts.

---

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|---|---|---|---|
| `file-browser` | existing | **modify** | Hosts the new view component, action set, settings entry, URL param branch, and entrypoint button |
| `_platform/viewer` | existing | **consume** (additive small extension permitted) | Provides `detectContentType`, `MarkdownServer`, `highlightCode`, `image-url` resolver, and the existing preview-card primitives. A small markdown-excerpt utility may be added either here or kept local to file-browser — to be decided in plan-3 |
| `_platform/events` | existing | **consume** (strict; no contract changes) | Provides `useFileChanges`, `FileChangeProvider`, and the `file-changes` multiplexed SSE channel. **Consumed unchanged** — no new channel, no new route |
| `_platform/panel-layout` | existing | **consume** | Provides the `MainPanel` / `LeftPanel` / `PanelShell` composition the feed plugs into |
| `_platform/themes` | existing | **consume** | Provides `FileIcon` and `resolveFileIcon` for card chrome |
| `_platform/workspace-url` | existing | **consume** | Provides `fileBrowserParams` (extended with a `view` enum) and `workspaceHref` for click→file-viewer navigation |
| `_platform/settings` | existing | **modify (cross-domain — drop section file at extension point)** | Adds `recent-feed-settings.tsx` under `_platform/settings/sections/` per the established settings-section drop-in convention (Plan 047 USDK Phase 5; precedent: Plan 073 file-icons) |
| `_platform/sdk` | existing | **consume** | Provides `IUSDK` for the open-feed command + `ISDKSettings` / `useSDKSetting` for persisted feed settings |

**No new domains are created.** All capabilities compose from existing contracts.

---

## Complexity

- **Score**: **CS-3 (medium)**
- **Breakdown**: S=1, I=1, D=0, N=1, F=1, T=1 → P=5 → CS-3
  - **S=1** — multiple files inside `file-browser`, plus small additive touches in viewer / panel-layout / themes consumers; bounded surface area, no cross-cutting changes.
  - **I=1** — depends on existing internal contracts (file-change SSE, git-log helper, raw-file API, Shiki action); no new external services.
  - **D=0** — no schemas, no migrations, no persistence beyond user preferences (settings page; same mechanism as Plan 073 icon-theme).
  - **N=1** — UI workshop locked card anatomy, action set, chrome, and animations; some operational defaults (excerpt sizing, default feed size, deleted-display window) remain open and will be settled in `/plan-2-v2-clarify`.
  - **F=1** — memory ceiling under stacked media is the primary NFR; virtualization or `content-visibility: auto` keeps in-flight previews bounded. Accessibility and reduced-motion are also requirements.
  - **T=1** — unit tests for the merge state and excerpt utility, integration tests for SSE-driven feed updates and burst coalescing, harness exercise for the visual feed at multiple viewports.
- **Confidence**: 0.80 — the workshop and research dossier resolve most architectural unknowns; remaining variance is in UX polish defaults and the entrypoint set.
- **Assumptions**:
  - The existing `file-changes` SSE channel surfaces `add` / `change` / `unlink` events with timestamps — confirmed in research dossier FC-04.
  - `getRecentFiles(worktreePath, limit)` is sufficient as a seed source — confirmed in research dossier FC-06.
  - Stacking 50+ stacked media previews without virtualization will OOM — confirmed in research workshop PL-04.
- **Dependencies**:
  - Existing `_platform/events` file-change pipeline (Plans 045, 060, 084 — already in production).
  - Existing `_platform/viewer` Shiki + Markdown rendering.
  - Existing raw-file API route with Range support.
  - Existing settings page composition (Plan 047 USDK Phase 5).
- **Risks**:
  - **Memory exhaustion** when many video cards stack — mitigated by virtualization and poster-only-until-clicked playback (workshop §6 decision).
  - **Markdown excerpt edge cases** — front matter, code fences, mid-list truncation. Mitigated by a server-side truncator with explicit boundary detection (workshop opportunity).
  - **Shiki cold-start latency** on first feed load — accept the latency or pre-warm the highlighter; decision deferred to architect.
  - **Rename detection** — file system surfaces a rename as `unlink` + `add` pair; without coalescing the feed shows two entries. Workshop deferred this as polish.
  - **Non-git workspaces** — `getRecentFiles` fails on workspaces with no git. Spec requires error-state fallback while live updates remain functional.
- **Implementation slices (Simple Mode → single phase, inline tasks)**: The architect produces a single-phase plan with a 7-column task table. The natural ordering of task groups within that phase:
  1. **Card shell + extended `CardActions`** — header strip, action set with copy-abs/copy-rel/open/overflow, icon, title, path, meta line. Type-agnostic. Testable with mock data.
  2. **Image + Video card variants** — cover the headline higgs-jordo flow. Native video controls (NOT autoplay-loop in feed). Lazy-load via existing `useLazyLoad`.
  3. **Feed view skeleton** — header bar (title, live indicator, pause, refresh, settings), virtualized list, empty/loading/error states; wire to `getRecentFiles` seed only.
  4. **Live merge** — subscribe to existing `file-changes` SSE via `useFileChanges('**')`, merge into feed state with promotion animation and burst coalescing.
  5. **Markdown excerpt + Code excerpt cards** — server-side truncator, excerpt fetch action, both card variants.
  6. **Filters, settings, polish** — type filter chips, settings page entry, keyboard shortcuts, ARIA pass, reduced-motion, color-contrast verification.
  7. **Entrypoints** — `ExplorerPanel` button, USDK command (`fileBrowser.openRecentFeed`) + default keybinding, "open feed on workspace launch" setting.

---

## Acceptance Criteria

### A. View entry & layout

- **A1.** Navigating to `/{slug}/browser?view=recent-feed` swaps the main panel to the feed view while the left panel (file tree) remains rendered with its current state.
- **A2.** Three concurrent entrypoints exist for opening the feed: (a) a button in the `ExplorerPanel` top bar (mouse), (b) a USDK command `fileBrowser.openRecentFeed` registered with a default keybinding (keyboard), and (c) a setting `fileBrowser.recentFeed.openOnLaunch` (default off) that makes the feed the default landing view for the file browser when enabled. All three set `?view=recent-feed`.
- **A3.** Initial render shows a loading state (skeleton placeholders) until the seed completes.

### B. Initial seed

- **B1.** On mount, the feed populates with the most recently changed files using git history as the ordering source. The single newest file is at the top of the list.
- **B2.** The default seed size is **50 entries** and the hard ceiling is **200 entries**. Both are configurable via settings (`fileBrowser.recentFeed.feedSize`).
- **B3.** If git history is unavailable (non-git workspace, missing .git, etc.), the feed renders an error state with a clear explanation and remains operational for live updates that arrive subsequently.

### C. Live updates

- **C1.** New file-change events delivered via the existing `_platform/events` `file-changes` SSE channel cause matching entries to promote to the top, or insert as new entries at the top, without a page refresh.
- **C2.** The feature MUST NOT register a new SSE channel, broadcaster, server route, or watcher pipeline for file-change events. All live updates flow through `useFileChanges` consuming the existing `file-changes` channel.
- **C3.** A burst of updates (e.g., a `git checkout` touching ≥ 50 files in < 1s) results in a single batched update to feed state, not one update per file.
- **C4.** A pause toggle in the feed header stops promoting new entries; while paused, a sticky "N new changes — click to show" pill is visible at the top of the scroll area. Clicking unpauses, prepends buffered changes, and scrolls to top.
- **C5.** When the SSE connection drops and reconnects, existing feed items remain in place; only new events arriving after reconnection are merged.

### D. Cards & previews

- **D1.** Each card shows the filename (semibold title), the workspace-relative path (muted, truncated from the left so trailing path segments stay visible), a relative timestamp, the file size, and an event-type badge (`added` / `changed` / `deleted`).
- **D2.** Hovering the path shows a tooltip with the full absolute path.
- **D3.** Cards render type-specific previews:
  - **Images**: rendered inline (`object-contain`, max-height bounded — recommended ≤ 60vh).
  - **Videos**: native HTML5 `<video>` with controls and a poster frame. Videos MUST NOT autoplay-loop in the feed (workshop §6 decision).
  - **Audio**: native HTML5 `<audio>` with controls.
  - **Markdown**: server-truncated excerpt rendered through the existing markdown renderer, with a fade-out gradient hinting more content. Default excerpt sizing: **first 8 non-empty lines OR first 600 chars, whichever is shorter**. Configurable via settings.
  - **Code** (Shiki-supported language): server-rendered, syntax-highlighted excerpt with a fade-out gradient. Default excerpt sizing: **first 12 lines**. Configurable via settings.
  - **Generic / binary**: file icon + size + "Binary file — preview not available."
  - **Deleted**: strikethrough mini-card with relative time. Default display window: **5 seconds** before auto-removal. Configurable via settings (Never / 5s / 30s / Until dismissed).

### E. Actions

- **E1.** Each card exposes the following inline-pinned actions where applicable to the type:
  - **Open** (image/video/markdown/code) — opens the file in the existing `FileViewerPanel`.
  - **Copy relative path** (all types) — copies workspace-relative path.
  - **Copy absolute path** (image/video; in overflow for other types) — copies the full system path.
  - **Download** (image/video/audio/binary) — triggers the raw-file API with `?download=true`.
- **E2.** Each card exposes an overflow menu with at minimum: Copy filename, Copy as Markdown link (image/video/markdown), Reveal in tree (sets `?dir={parent}&file={path}`), Copy file contents (markdown/code only), Dismiss (in-memory hide for this session).
- **E3.** Clipboard actions surface a toast confirmation on success (existing toast pattern from `_platform/events`).
- **E4.** Download saves the file with its original filename (not a generated name).
- **E5.** Click on the card title or preview area opens the file in `FileViewerPanel` (sets `?file={path}`, clears `?view`).
- **E6.** Click on the path text does NOT navigate (only shows the absolute-path tooltip).

### F. Filters & settings

- **F1.** A filter chip row in the feed header supports toggling visibility by content category: All, Images, Videos, Audio, Markdown, Code, Other. Multi-select is supported (e.g., Images + Videos active simultaneously).
- **F2.** A settings panel — accessible from the feed header and from the main settings page — exposes at minimum: feed size, default filters, markdown excerpt sizing, code excerpt sizing, autoplay-video policy (off / on hover / on, default off), deleted-file display window. Settings persist via `_platform/sdk` (`ISDKSettings`) under a `fileBrowser.recentFeed.*` namespace.

### G. Performance & scale

- **G1.** The feed remains responsive (≥ 30 fps scroll, < 200 ms input latency) when displaying ≥ 50 entries with mixed media types — verified by an integration test or harness exercise at default viewport.
- **G2.** At most **5 media previews** hold buffered media at any time. Entries outside the viewport release decoded image/video buffers. Bound is configurable via settings (`fileBrowser.recentFeed.inFlightMediaBound`).
- **G3.** A burst of ≥ 50 file-change events in < 1s does not cause more than a small number of React renders (target: ≤ 3 renders for the burst).

### H. Accessibility

- **H1.** The feed root uses ARIA `role="feed"`; each card is `role="article"` with `aria-labelledby` pointing at the card title.
- **H2.** Roving focus moves between cards via Arrow Up / Arrow Down. Enter opens the focused card. Per-card letter shortcuts: `c` copies relative path, `Shift+C` copies absolute path, `d` downloads, `r` reveals in tree, `m` copies as markdown link.
- **H3.** New live items are announced via a polite live region.
- **H4.** Color contrast meets WCAG AA in both light and dark themes for title, path, meta line, and badges.
- **H5.** `prefers-reduced-motion: reduce` disables slide/translate animations; promotion uses an instant swap with a brief opacity flash instead.

### I. Constraints (binding)

- **I1.** The feature MUST NOT add a new SSE channel, broadcaster, server route, or watcher pipeline for file-change events. All live updates flow through `useFileChanges` consuming the existing `file-changes` multiplexed channel.
- **I2.** The feature MUST NOT introduce a new domain.
- **I3.** The feature MUST NOT modify any contracts of `_platform/events`, `_platform/viewer`, or `_platform/themes` — it consumes them as-is. (Optional minor utility additions to viewer are permitted only if they introduce a new contract, never modify existing ones.)
- **I4.** The feature MUST NOT block initial page render on the seed query — the page paints with skeletons and the seed resolves asynchronously.

---

## Risks & Assumptions

### Assumptions

- The existing `file-changes` SSE channel surfaces `add` / `change` / `unlink` events with timestamps and worktree-relative paths (validated in research dossier FC-04).
- `getRecentFiles(worktreePath, limit)` is fast enough (sub-100 ms typical per FC-06) for the initial seed.
- Stacked media previews (images + videos) without virtualization exceed reasonable memory ceilings (workshop PL-04).
- Users will accept native video controls in the feed (workshop §6 — autoplay-loop is rejected).
- The existing settings page composition (Plan 047 USDK Phase 5) supports adding a new section.

### Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Memory exhaustion under heavy media stack | Medium | High | Virtualize via `content-visibility: auto` or `react-window`; bound in-flight media (G2) |
| R2 | Non-git workspaces fail seed | Medium | Low | Error-state fallback; live updates still work (B3) |
| R3 | Markdown excerpt extraction breaks on front-matter / code fences | Medium | Medium | Server-side truncator with explicit boundary detection — workshop opportunity below |
| R4 | Shiki cold-start latency on first feed load | Low | Low | Accept latency on first load OR pre-warm at app boot (architect decision) |
| R5 | Rename surfaces as two entries (unlink + add) | Medium | Low | Coalesce within 200 ms window — defer as polish (workshop PL-10) |
| R6 | SSE reconnect blanks the feed | Low | Medium | Verify existing reconnect logic preserves feed state; integration test |
| R7 | New users do not discover the entry point | Medium | Medium | Multiple entrypoints (top-bar button + USDK command + optional default-landing setting) — see Open Questions |

---

## Open Questions

All `/plan-2-v2-clarify` questions resolved — see § Clarifications below. Remaining unknowns are operational details the architect can settle inline (or via optional W2/W3 workshops):

- Coalescence window for rename pairs (`unlink` + `add` for same basename) — workshop opportunity W3 covers this; defer to architect or workshop.
- Whether bootstrap merges `git log` results with `git status` working-tree changes, or only `git log` — workshop opportunity W2.
- USDK command default keybinding choice — pick during plan-3 task-table authoring; verify no conflict with existing keybindings registry.

The following are already resolved by workshop 005 and the clarify session — no re-asks:

- ✅ Card anatomy and action set (workshop §2, §3).
- ✅ No autoplay-loop for videos in feed (workshop §6).
- ✅ Notification-fetch pattern — SSE carries paths only (research PL-05; workshop §10 danger zones).
- ✅ Bulk multi-select is out of scope for v1 (Goals / Non-Goals).
- ✅ No new SSE channel (Constraints I1).
- ✅ Tree stays put on feed entry (workshop §1, A1).
- ✅ Per-tab independence — no cross-tab feed sync (workshop §11 Q3).
- ✅ Filter `addDir` / `unlinkDir` events from feed by default (workshop §11 Q6).
- ✅ All 5 operational defaults locked (feed size, md excerpt, code excerpt, deleted window, in-flight media bound).
- ✅ Last-seen marker — deferred to v2.
- ✅ Pinning — deferred to v2.
- ✅ Entrypoint set — top-bar button + USDK command + default keybinding + open-on-launch setting (default off).

---

## Testing Strategy

**Approach**: **Hybrid** (mixed depth per task class)

**Rationale**: The feature has a sharp split between subtle logic (live-merge state machine, burst coalescing, pause-buffer drain, markdown/code excerpt boundary detection) and pure presentation (cards composing existing primitives, layout chrome). Hybrid lets us TDD the regression-prone bits without burning cycles on Red→Green→Refactor for component composition.

**Focus Areas (TDD)**:
- Live-merge reducer / state machine: promotion vs. insert vs. delete; burst coalescing; pause-buffer drain order; rename-pair coalescence (when implemented).
- `truncateMarkdown` utility: front-matter handling; code-fence boundary detection; line-vs-char limit selection; empty-input edge.
- Excerpt fetch action / route: input validation, path-traversal safety, MIME mapping, cache headers (if applicable).
- Type-filter membership predicate + filter-chip multi-select state.

**Focus Areas (Lightweight)**:
- Each card variant (image, video, audio, markdown, code, generic, deleted): one render-with-fixture test that asserts title, path, action set, and preview type.
- Feed view skeleton: empty / loading / error state renders.
- Settings page wiring: persistence round-trip via `useSDKSetting`.

**Focus Areas (Harness — visual smoke)**:
- Default + mobile viewport screenshots of the feed with seeded mixed-media fixtures.
- Live-merge animation smoke (drop a fixture file, confirm the card promotes).
- Reduced-motion variant.

**Excluded**:
- No e2e tests for the underlying SSE pipeline (already covered by `_platform/events` integration tests — Plans 045, 060, 084).
- No load testing beyond the burst-coalescing assertion (50 events → ≤ 3 renders).

**Mock Usage**: **Targeted** — see below.

---

## Mock Usage Policy

**Policy**: **Targeted** — mocks at external/system seams only.

**Allowed**:
- Mock `useFileChanges` callback delivery in unit tests for the live-merge reducer (drives event sequences deterministically).
- Mock `getRecentFiles` server-action return in unit tests for the feed-view seed branch.
- Mock `highlightCodeAction` and the markdown renderer in lightweight component tests where Shiki cold-start would dominate test time.

**Required real / no-mock zones**:
- Integration tests for live updates use the **real** `_platform/events` `file-changes` SSE pipeline with `fs.watch` + a temp directory (matches Plan 084 prior-learning patterns). No mocked SSE channel.
- At least one integration test exercises **real** `git log` against a temp git repo (validates seed under realistic conditions).
- No `vi.mock` of own-domain internals (Constitution P4 — same rule that gated Plan 084 Phases 5 + 7).

**Rationale**: This is the exact mock/production-drift class that Plan 084 R3 minih caught (mocked tests passed; production failed). Targeted mocking with hard-line "no mocked SSE in integration" prevents recurrence.

---

## Documentation Strategy

**Location**: **Hybrid (README pointer + `docs/how/recent-changes-feed.md`)**

**README pointer** (`apps/web/README.md` or top-level `README.md` per house style): one paragraph describing the feed + a link to the long-form guide.

**Long-form guide** (`docs/how/recent-changes-feed.md`):
- How to open the feed (top-bar button + keybinding + USDK command + open-on-launch setting).
- Action shortcuts catalog (per workshop §3 / spec § E1–E2 / spec § H2).
- Settings reference (per workshop §9).
- Troubleshooting:
  - Non-git workspaces — feed shows seed-error banner; live updates still arrive.
  - SSE disconnect — banner + auto-reconnect; existing items preserved.
  - Mass-rename / `git checkout` — burst coalescing keeps the feed responsive.
- v2 candidates (last-seen marker, pinning) called out as known gaps with rationale for deferral.

**Rationale**: Matches Plan 071 and Plan 067 doc precedent. The settings + actions + keybindings catalog is too rich for README; the README pointer ensures discoverability.

---

## Clarifications

### Session 2026-05-03

| # | Question | Answer | Effect on Spec |
|---|---|---|---|
| Q1 | Workflow Mode | **Simple** | Header set to `Mode: Simple`. Plan-3 will produce a single-phase plan with inline tasks (7-column table). The 7 suggested implementation slices in § Complexity become task groups within that single phase, not separate phases |
| Q2 | Testing strategy | **Hybrid** | New § Testing Strategy section added; overrides Simple Mode's default of Lightweight |
| Q3 | Mock policy | **Targeted** | New § Mock Usage Policy section added; explicit "no mocked SSE in integration tests" rule |
| Q4 | Documentation strategy | **Hybrid** (README pointer + `docs/how/recent-changes-feed.md`) | New § Documentation Strategy section added |
| Q5 | Domain Review | **Boundaries OK as-is** | No changes to § Target Domains. `truncateMarkdown` utility stays local to `file-browser` unless a second consumer surfaces |
| Q6 | Harness readiness | **L3 sufficient** | No harness changes; pre-phase validation runs before each plan-6 phase per existing convention. Visual smoke at default + mobile viewports added to § Testing Strategy |
| Q7 | Entrypoint set | **Button + USDK command + keybinding + open-on-launch setting (off by default)** | § Acceptance Criteria E set: A2 expanded (USDK command, keybinding, setting); workshop §11 Q7 resolved |
| Q8 | v2 scope (last-seen marker, pinning) | **Defer both to v2** | Both moved to § Out-of-Scope Follow-Ups; workshop §11 Q5 + Q2 resolved |

**Operational defaults** locked from workshop §9 settings mock — no clarify question needed:

- Default feed size: **50** (hard ceiling: 200)
- Markdown excerpt: **first 8 non-empty lines OR first 600 chars** (whichever is shorter)
- Code excerpt: **first 12 lines**
- Deleted-card visibility window: **5s**
- In-flight media bound: **5**

All five values are user-configurable via settings under the `fileBrowser.recentFeed.*` namespace.

---

## Workshop Opportunities

Workshop 005 already resolved UI design. The following remain candidates for design exploration before `/plan-3-v2-architect`:

| # | Topic | Type | Why Workshop | Key Questions |
|---|---|---|---|---|
| W1 | Excerpt extraction utilities | Data Model | Reusable beyond the feed; affects multiple cards and possibly other future overlay views | `truncateMarkdown` API shape; front-matter / code-fence handling; line-vs-char strategy; code excerpt API shape; whether to live in `_platform/viewer` or `file-browser` |
| W2 | Bootstrap query DTO | API Contract | One round-trip server action consumed by the feed view | Single combined return shape (`{ path, mtime, eventType, kind }[]`?); whether to merge `git log` with `git status` working-tree changes; performance budget; cache strategy |
| W3 | Live ordering & event-merge state machine | State Machine | Several edge cases (rename pair, deleted-then-restored, paused-buffer drain) interact in non-obvious ways | When does a card mutate-in-place vs promote-to-top vs new-insert? When is a card removed (vs strikethrough-then-removed)? How do batches drain during pause? Rename coalescence window? |

Workshops are optional but recommended for W2 (drives the seed contract) and W3 (the merge logic is the most subtle part of the implementation). W1 is small enough that an architect can settle it in `/plan-3` without a separate workshop unless the API surface grows.

---

## Out-of-Scope Follow-Ups (v2 candidates, not v1)

Listed here for forward-compatibility planning, not as commitments:

- Multi-select + bulk actions (delete, copy paths, zip-download).
- "Last seen" marker (Slack-style unread line).
- Pinning (keep card visible regardless of feed rotation).
- Cross-tab synchronization of feed state.
- "Smart feed" filtering (e.g., "only files I created in this session").
- External integration (e.g., posting selected cards to Slack / Discord).
- AI summary cards (e.g., "you generated 12 images in the last 5 minutes — here's the cluster").

---

**Spec status**: CLARIFIED — ready for `/plan-3-v2-architect` (Simple Mode).
