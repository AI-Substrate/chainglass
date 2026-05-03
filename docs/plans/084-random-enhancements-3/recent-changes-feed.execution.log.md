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
| _none yet_ | | | | |

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


