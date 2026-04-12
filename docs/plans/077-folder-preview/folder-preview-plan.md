# Folder Content Preview Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-04-08
**Spec**: [folder-preview-spec.md](folder-preview-spec.md)
**Mockup**: [folder-preview-mockup.html](mockups/folder-preview-mockup.html)
**Status**: IN PROGRESS

## Summary

Folders in the file browser currently show nothing in the viewer panel — just "Select a file to view". This plan adds a responsive media gallery grid that appears when a folder is the current directory context. The gallery shows image thumbnails, video hover-to-play cards, audio waveform cards, text/code preview cards with syntax highlighting, markdown rendered excerpts, and subfolder navigation cards. Each card has copy-path and download actions. The implementation composes entirely over existing infrastructure (raw file API, content type detection, FileIcon/FolderIcon, directory listing API) with zero new API routes. The `dir` URL param already exists and will drive gallery state.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| `file-browser` | existing | **modify** | Add FolderPreviewPanel + card components, integrate into BrowserClient |
| `_platform/viewer` | existing | consume | `detectContentType()`, `isBinaryExtension()` for card type routing |
| `_platform/themes` | existing | consume | `FileIcon`, `FolderIcon` for themed icons in cards |
| `_platform/file-ops` | existing | consume | `readDir()` via directory listing service (no changes) |
| `_platform/panel-layout` | existing | consume | `PanelShell`, `MainPanel` container (no changes) |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/src/features/041-file-browser/components/folder-preview-panel.tsx` | file-browser | internal | Main gallery orchestrator — fetches dir contents, routes to card types, manages loading/empty/warning states |
| `apps/web/src/features/041-file-browser/components/folder-preview-grid.tsx` | file-browser | internal | Responsive grid layout with type-grouped sections |
| `apps/web/src/features/041-file-browser/components/preview-cards/image-card.tsx` | file-browser | internal | Image thumbnail with lazy loading via IntersectionObserver |
| `apps/web/src/features/041-file-browser/components/preview-cards/video-card.tsx` | file-browser | internal | Video poster + hover-to-play / tap-to-play |
| `apps/web/src/features/041-file-browser/components/preview-cards/audio-card.tsx` | file-browser | internal | Audio waveform visualization card |
| `apps/web/src/features/041-file-browser/components/preview-cards/generic-card.tsx` | file-browser | internal | Fallback for text, markdown, PDF, binary, and all non-media file types — shows FileIcon + filename + size |
| `apps/web/src/features/041-file-browser/components/preview-cards/card-actions.tsx` | file-browser | internal | Shared hover-revealed copy-path + download buttons |
| `apps/web/src/features/041-file-browser/components/preview-cards/card-skeleton.tsx` | file-browser | internal | Shimmer skeleton for loading state |
| `apps/web/src/features/041-file-browser/lib/sort-gallery-items.ts` | file-browser | internal | Sort entries by type group (folders → media → documents → other), then alphabetical |
| `apps/web/src/features/041-file-browser/hooks/use-lazy-load.ts` | file-browser | internal | IntersectionObserver hook for lazy image/video loading |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | file-browser | internal | **Modified** — wire FolderPreviewPanel into viewer area when no file selected and dir is set |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | No `currentDir` state exists — `useFileNavigation` has `childEntries` keyed by path but no explicit "which folder is being viewed" state. The `dir` URL param exists but isn't read by BrowserClient. | Wire `dir` URL param to drive gallery: when `dir` is set and no `file` selected, show FolderPreviewPanel. Update `dir` param when folders are expanded. |
| 02 | Critical | `FileEntry` only has `{ name, type, path }` — no `size`, `mtime`, or child count. Gallery cards showing "1.2 MB" or "24 items" need this data. | Extend directory listing response to include `size` (from existing stat call) for files. For subfolder item count, do a lightweight `readDir` count on the server. |
| 03 | ~~Removed~~ | ~~Text preview requires full file read~~ | Scope reduced — text/md files use generic-card (icon + filename + size), no content fetching. |
| 04 | ~~Removed~~ | ~~Markdown excerpt rendering~~ | Scope reduced — markdown files use generic-card, no rendering. |
| 05 | High | Directory listing is O(n) stat calls — `listDirectory()` calls `stat` per item sequentially. A 100-item folder = 100+ stat calls. | Accept current perf for now. The >50 item warning gate (AC-15) means users opt-in to loading large folders. Future optimization: parallelize stats with `Promise.all`. |
| 06 | Medium | `useClipboard` already has `handleCopyFullPath`, `handleCopyRelativePath`, `handleDownload` — fully reusable for card actions. | Wire existing clipboard hook into CardActions component. Zero new clipboard/download logic needed. |
| 07 | Medium | Raw file API uses session cookies for auth — `<img src>` works same-origin because browser sends cookies automatically. Already proven by existing ImageViewer. | No action needed — confirm during implementation that gallery thumbnails load correctly. |

## Implementation

**Objective**: Add a responsive folder content preview gallery to the file browser viewer panel, with all card types, actions, loading/empty/warning states, responsive mobile layout, and polished animations.

**Testing Approach**: Lightweight — verify existing tests pass, minimal new tests only for complex logic (sort/grouping). No mocks.

**Complexity**: CS-3 (medium)

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Create `sort-gallery-items.ts` — sort entries into type groups (folders → media → documents → other), alphabetical within each group. Use `detectContentType()` for categorization. | file-browser | `apps/web/src/features/041-file-browser/lib/sort-gallery-items.ts` | Entries sorted correctly by group + alpha; called from FolderPreviewPanel | Per AC-17. Pure function, easily testable. |
| [ ] | T002 | Create `use-lazy-load.ts` — IntersectionObserver hook returning a `ref` and `isVisible` boolean. Used by image/video cards to defer loading until in viewport. | file-browser | `apps/web/src/features/041-file-browser/hooks/use-lazy-load.ts` | Hook returns ref + isVisible; elements only load when scrolled into view | Per AC-15, R1. |
| [ ] | T003 | Create `card-actions.tsx` — shared overlay component with copy-path and download buttons. Uses existing `useClipboard` hook. Glassmorphism backdrop, hover-revealed on desktop, always visible on mobile. | file-browser | `apps/web/src/features/041-file-browser/components/preview-cards/card-actions.tsx` | Buttons render, copy works, download works; hidden on desktop until hover, visible on mobile | Per AC-08, AC-13. Reuse `handleCopyFullPath` and `handleDownload` from useClipboard. |
| [ ] | T004 | Create `card-skeleton.tsx` — skeleton shimmer card matching gallery card dimensions. Used during loading state. | file-browser | `apps/web/src/features/041-file-browser/components/preview-cards/card-skeleton.tsx` | Skeleton cards render with shimmer animation matching mockup | Per AC-10. |
| [ ] | T005 | Create `image-card.tsx` — thumbnail card using raw file API URL as `<img src>`. Uses `use-lazy-load` hook. `object-cover` with `aspect-video`. Includes CardActions. | file-browser | `apps/web/src/features/041-file-browser/components/preview-cards/image-card.tsx` | Images render as thumbnails, lazy-loaded, with hover actions | Per AC-02. |
| [ ] | T006 | Create `video-card.tsx` — poster frame + hover-to-play. `<video>` with `muted loop` attrs. `onMouseEnter` starts play after 300ms delay, `onMouseLeave` pauses and resets. Play badge + duration badge overlays. Tap-to-play on mobile via touch event detection. | file-browser | `apps/web/src/features/041-file-browser/components/preview-cards/video-card.tsx` | Video shows poster, plays on hover (desktop) or tap (mobile), pauses on leave | Per AC-03, AC-14. |
| [ ] | T007 | Create `audio-card.tsx` — waveform visualization (CSS bars), audio icon, duration display. Compact card matching mockup style. | file-browser | `apps/web/src/features/041-file-browser/components/preview-cards/audio-card.tsx` | Audio card renders with waveform visualization and duration | Per AC-04. |
| [ ] | T008 | ~~REMOVED~~ — Text/code files use generic-card with FileIcon instead of fetching content. | — | — | — | Scope reduction: focus on media previews. |
| [ ] | T009 | ~~REMOVED~~ — Markdown files use generic-card with FileIcon instead of rendering excerpts. | — | — | — | Scope reduction: focus on media previews. |
| [ ] | T010 | Create `folder-card.tsx` — shows FolderIcon, folder name. No item counts or content tags (avoids extra readDir calls). Click navigates into folder by updating `dir` URL param. | file-browser | `apps/web/src/features/041-file-browser/components/preview-cards/folder-card.tsx` | Subfolder cards show icon + name; click navigates deeper | Per AC-07. Simplified — no counts. |
| [ ] | T011 | Create `generic-card.tsx` — fallback card for text, markdown, PDF, binary, and all non-media file types. Shows FileIcon, filename, file size. No content fetching — just metadata from directory listing. | file-browser | `apps/web/src/features/041-file-browser/components/preview-cards/generic-card.tsx` | Generic cards render with appropriate icon and metadata | Handles text, md, PDF, zip, fonts, etc. |
| [ ] | T012 | Create `folder-preview-grid.tsx` — responsive CSS grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`). Renders section labels (Folders, Media, Documents, Other) when items exist in that group. Maps sorted entries to appropriate card components via `detectContentType()`. Staggered card entrance animation via CSS `animation-delay`. | file-browser | `apps/web/src/features/041-file-browser/components/folder-preview-grid.tsx` | Grid renders responsive columns, grouped by type, with section labels and staggered animation | Per AC-16, AC-17. |
| [ ] | T013 | Create `folder-preview-panel.tsx` — main orchestrator. Receives current dir path + workspace context. Fetches directory entries from existing `/api/workspaces/${slug}/files?dir=...` API. Manages 3 states: loading (skeleton grid), empty (empty state with upload button), large-folder warning (>50 items gate), and gallery (FolderPreviewGrid). Breadcrumb header showing folder path with clickable segments. | file-browser | `apps/web/src/features/041-file-browser/components/folder-preview-panel.tsx` | Panel shows correct state (loading/empty/warning/gallery) based on directory contents | Per AC-01, AC-09, AC-10, AC-11, AC-15. |
| [ ] | T014 | Extend directory listing to include `size` — modify `listDirectory()` to include `size` from the existing `stat` call (already happening per item). Return `FileEntry` as `{ name, type, path, size }`. | file-browser | `apps/web/src/features/041-file-browser/services/directory-listing.ts`, `apps/web/app/api/workspaces/[slug]/files/route.ts` | API response includes `size` field per entry | Per Finding 02. Minimal change — stat result already has size. |
| [ ] | T015 | Wire `dir` URL param into BrowserClient — read the `dir` param. When `dir` is set and no `file` is selected, render `<FolderPreviewPanel>` instead of the "Select a file" placeholder. When a folder is expanded in FileTree, update the `dir` param via `setParams({ dir }, { history: 'push' })` so back button works. When a gallery card is clicked, set `file` param with `history: 'push'`. When a subfolder card is clicked, update `dir` param with `history: 'push'` and use existing `expandPaths`/`navigateToDirectory` to sync tree expansion. Pass clipboard handlers to FolderPreviewPanel for card actions. | file-browser | `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | Expanding a folder shows gallery; back button restores previous view; tree stays in sync | Per AC-01, Finding 01. Key integration point at lines 824-889. |
| [ ] | T016 | Theme + mobile polish — ensure all cards use CSS variable tokens (`var(--card)`, `var(--border)`, `var(--muted)`, etc.). Verify dark/light rendering. On mobile (≤768px), card actions always visible, grid 1-2 columns, video uses tap-to-play. | file-browser | All preview-cards/ components | Cards render correctly in both themes; mobile layout works per mockup | Per AC-12, AC-13, AC-14. |
| [ ] | T017 | Run `just fft` — verify all existing tests pass, lint clean, no type errors. | file-browser | — | `just fft` passes with zero failures | Pre-commit gate. |
| [ ] | T018 | Update `file-browser` domain.md — add FolderPreviewPanel and preview card components to the Boundary → Owns section, Composition table, and Source Location table. | file-browser | `docs/domains/file-browser/domain.md` | Domain doc reflects new components | Domain bookkeeping. |

### Progress

| Metric | Count |
|--------|-------|
| Total tasks | 16 (2 removed) |
| Done | 0 |
| In progress | 0 |
| Blocked | 0 |

### Acceptance Criteria

- [ ] AC-01: Expanding a folder shows responsive preview grid in viewer panel
- [ ] AC-02: Image thumbnails render via `object-cover`
- [ ] AC-03: Video hover-to-play with 300ms delay
- [ ] AC-04: Audio waveform cards with duration
- [ ] AC-05: ~~Removed~~ — text/code files use generic card (icon + filename + size)
- [ ] AC-06: ~~Removed~~ — markdown files use generic card (icon + filename + size)
- [ ] AC-07: Subfolder cards with icon + name; click navigates deeper
- [ ] AC-08: Hover-revealed copy-path + download per card
- [ ] AC-09: Breadcrumb navigation in gallery header
- [ ] AC-10: Skeleton shimmer loading state
- [ ] AC-11: Empty folder state with upload affordance
- [ ] AC-12: Dark/light theme support via CSS variables
- [ ] AC-13: Mobile 1-2 columns, always-visible actions
- [ ] AC-14: Mobile tap-to-play for video
- [ ] AC-15: >50 items warning gate, up to 100 items on click
- [ ] AC-16: Staggered card entrance + hover lift animations
- [ ] AC-17: Grouped by type: folders → media → docs → other
- [ ] AC-18: Harness mobile-ux-audit passes at 375×812

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Image-heavy folders cause jank | Medium | Medium | IntersectionObserver lazy loading (T002, T005) |
| Video memory accumulation | Low | Medium | Pause + unload off-screen videos; limited concurrent plays (T006) |
| Directory listing O(n) stats slow for 100+ items | Low | Low | >50 item warning gate means user opts in; accept current perf (Finding 05) |

### Task Dependency Graph

```
T001 (sort) ──────────────────────────────────────┐
T002 (lazy load) ─────────────────────────────────┤
T003 (card actions) ──────────────────────────────┤
T004 (skeleton) ──────────────────────────────────┤
                                                   ├──► T012 (grid) ──► T013 (panel) ──► T015 (wire) ──► T016 (polish) ──► T017 (fft)
T005 (image card) ← T002, T003 ──────────────────┤                                                                          │
T006 (video card) ← T002, T003 ──────────────────┤                                                                          ▼
T007 (audio card) ← T003 ────────────────────────┤                                                                       T018 (domain)
T010 (folder card) ← T003 ───────────────────────┤
T011 (generic card) ← T003 ──────────────────────┤
T014 (extend listing) ────────────────────────────┘
```

**T008, T009 REMOVED** — text/markdown files use generic-card (icon + filename + size). No content fetching.

**Implementation order**: T001-T004 (foundations) → T005-T007, T010-T011 (card types, parallelizable) → T012 (grid) → T013 (panel) → T014 (listing extension) → T015 (BrowserClient wiring) → T016 (polish) → T017 (fft) → T018 (domain docs)
