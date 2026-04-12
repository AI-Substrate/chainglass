# Folder Content Preview

**Mode**: Simple

📚 This specification incorporates findings from `research-dossier.md` and `external-research/gallery-ux-patterns.md`.

## Research Context

Extensive research across 8 parallel subagents (56 findings) and external deep research (54K chars) established:

- **No folder preview exists** — clicking a folder only expands the tree; the viewer panel shows "Select a file to view"
- **Heavy infrastructure reuse** — raw file streaming API, binary viewers (Image/Video/Audio/PDF), content type detection, themed icons, and responsive grid patterns all exist
- **Zero new API routes needed** — existing `/api/workspaces/[slug]/files/raw` serves any file with correct MIME types, Range support, and `?download=true`
- **Directory listing API supports recursive** — `?tree=true` param already returns full subtree
- **UX research recommends** uniform card grid over masonry, hover-to-play video with 300ms delay, tap-to-play on mobile, glassmorphism action overlays, staggered card entrance animations
- **Approved mockup** — static HTML design mockup at `mockups/folder-preview-mockup.html` demonstrates all card types, 3 states (gallery/loading/empty), dark/light themes, and mobile layout

## Summary

When a user selects a folder in the file browser, the right-side viewer panel shows a responsive media gallery grid previewing the folder's contents — images as thumbnails, videos with hover-to-play, audio with waveform cards, text/code with syntax-highlighted excerpts, markdown rendered inline, and subfolders as navigable cards. Each card has hover-revealed copy-path and download buttons. The gallery works recursively (clicking a subfolder card navigates into it), supports dark/light themes, and is fully responsive down to mobile viewports.

**Why**: Folders currently show nothing — users must click individual files one-by-one to understand what's in a directory. This is tedious for media-heavy directories (assets, screenshots, uploads). A visual gallery makes folder contents immediately scannable, supports drag-and-drop mental models users expect from modern file managers, and makes the product feel polished and complete.

## Goals

- **Instant folder scanning** — users see all folder contents at a glance without clicking each file
- **Media-first preview** — images render as thumbnails, videos show poster frames with hover-to-play, audio shows waveform cards
- **Text/code preview** — first ~10 lines with syntax highlighting visible in a card, markdown rendered as formatted prose
- **One-click actions** — copy file path and download file available per card without opening the file first
- **Recursive navigation** — subfolder cards show item count and content type summary; clicking navigates deeper with breadcrumb trail
- **Theme-aware** — gallery cards, overlays, and skeletons adapt to dark/light theme using existing CSS variable system
- **Mobile-responsive** — gallery works on mobile viewports (1-2 columns, always-visible action buttons, tap-to-play video)
- **Polished feel** — staggered card entrance animations, hover lift effects, skeleton loading states, empty folder state with upload affordance

## Non-Goals

- **Image editing or cropping** — this is a preview, not an editor
- **Video transcoding or thumbnail generation** — use poster frame from `<video>` element or raw file directly
- **Full-text search within folder preview** — existing file search in the tree panel handles this
- **Drag-and-drop file reordering** — files display in a fixed order (folders first, then by type, then alphabetical)
- **Infinite scroll / virtualization** — cap at a reasonable limit (e.g., 100 items) with "show more" affordance; virtualization is a future enhancement if needed
- **New API endpoints** — all data comes from existing directory listing and raw file APIs
- **Office document preview in cards** — Plan 055 covers document preview; folder cards for docx/xlsx show icon + metadata only
- **Modifying the FileTree expand/collapse behavior** — folder click in the tree continues to expand/collapse as today; the gallery appears in the viewer panel based on current directory context

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `file-browser` | existing | **modify** | Add FolderPreviewPanel, all card components, integrate into BrowserClient viewer panel |
| `_platform/viewer` | existing | **consume** | Use `detectContentType()`, `isBinaryExtension()` for card type routing |
| `_platform/themes` | existing | **consume** | Use `FileIcon`, `FolderIcon` for themed icons in cards |
| `_platform/file-ops` | existing | **consume** | Underlying directory listing via `readDir()` (no changes) |
| `_platform/panel-layout` | existing | **consume** | Use `PanelShell`, `MainPanel` container (no changes) |

No new domains needed — this feature is a new capability within the `file-browser` domain boundary, composing existing infrastructure contracts.

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=0, D=0, N=1, F=1, T=1 → Total P=5
- **Confidence**: 0.85
- **Assumptions**:
  - Existing raw file API handles all media types without modification
  - Directory listing API performance is acceptable for folders up to 100 items
  - No server-side thumbnail generation needed (browser renders from raw files)
  - Existing mobile patterns (Sheet, bottom tabs) provide sufficient responsive foundation
- **Dependencies**:
  - Plan 046 binary viewers (completed — ImageViewer, VideoViewer, AudioViewer exist)
  - Plan 073 file icons (completed — FileIcon, FolderIcon exist)
  - Existing raw file streaming API with MIME types
- **Risks**:
  - Performance with many images loading simultaneously (mitigated by lazy loading with IntersectionObserver)
  - Video memory leaks from hover-to-play (mitigated by pausing/unloading off-screen videos)
  - Mobile hover impossibility for video preview (mitigated by tap-to-play fallback)
- **Phases**:
  1. Core gallery grid + image/folder cards
  2. Video, audio, text/code, markdown, PDF cards
  3. Actions (copy path, download), loading/empty states
  4. Mobile responsive + harness mobile-ux-audit validation
  5. Polish (animations, theme refinement, breadcrumb navigation)

## Acceptance Criteria

1. **AC-01**: When a folder is expanded in the file tree, the viewer panel displays a responsive grid of preview cards for the folder's contents
2. **AC-02**: Image files (png, jpg, svg, webp, gif, avif) render as thumbnail cards with the image visible, scaled to fit the card via `object-cover`
3. **AC-03**: Video files (mp4, webm, mov) render with a poster frame; hovering on desktop starts muted playback after ~300ms delay; leaving the card pauses playback
4. **AC-04**: Audio files (mp3, wav, ogg, flac) render as cards with a waveform visualization and duration display
5. **AC-05**: Text/code files render as cards showing the first ~10 lines with syntax highlighting (using existing Shiki infrastructure) and a fade-out gradient
6. **AC-06**: Markdown files render as cards showing formatted prose excerpt (headings, lists, inline code) with a fade-out gradient
7. **AC-07**: Subfolder cards show the folder icon, folder name, total item count, and content type summary tags (e.g., "8 images · 3 videos"); clicking navigates into that folder
8. **AC-08**: Each card shows hover-revealed action buttons: copy file path (to clipboard) and download file
9. **AC-09**: The gallery header shows a breadcrumb trail for the current folder path; clicking breadcrumb segments navigates to that level
10. **AC-10**: Gallery displays a skeleton shimmer loading state while directory contents are being fetched
11. **AC-11**: Empty folders display an empty state with icon, message, and upload affordance
12. **AC-12**: Gallery cards adapt to dark/light theme using existing CSS variable tokens — no flash or incorrect colors
13. **AC-13**: On mobile viewports (≤768px), the gallery renders in 1-2 columns with action buttons always visible (no hover dependency)
14. **AC-14**: On mobile, video cards use tap-to-play instead of hover-to-play
15. **AC-15**: Folders with >50 items show a "Large folder — X items" warning with a "Show contents" button; clicking loads up to 100 items with lazy-loaded thumbnails. Folders ≤50 items load automatically.
16. **AC-16**: Cards animate in with a staggered entrance effect; hovering a card produces a subtle lift + shadow increase
17. **AC-17**: Content is grouped by type: folders first, then media (images, video, audio), then documents (markdown, code, text), then other files
18. **AC-18**: Harness mobile-ux-audit agent validates the gallery at 375×812 viewport with no critical issues

## Risks & Assumptions

### Risks
- **R1: Image-heavy folders cause slow load** — 50+ images loading simultaneously could cause jank. Mitigated by IntersectionObserver lazy loading — only load thumbnails in viewport.
- **R2: Video memory accumulation** — Multiple `<video>` elements on-screen may consume significant memory. Mitigated by limiting concurrent loaded videos and unloading off-screen elements.
- **R3: Raw file API CORS or auth issues** — Thumbnails use `<img src>` pointing at the API. If auth middleware blocks raw file requests from `<img>` tags, thumbnails won't load. Assumption: raw file API works with same-origin requests (already proven by existing ImageViewer).
- **R4: Large text files in preview cards** — Reading full file content to show 10 lines is wasteful. May need a server-side "first N lines" endpoint or accept the overhead for small files.

### Assumptions
- A1: Folder contents are fetched via the existing directory listing API — no new data source needed
- A2: Browser native `<img>` and `<video>` tags are sufficient for media rendering — no external libraries
- A3: The existing raw file API works for `<img src>` and `<video src>` attributes without additional CORS headers
- A4: Code preview cards can use the existing `highlightCodeAction` server action for syntax highlighting
- A5: Mobile responsive behavior can be achieved with Tailwind breakpoint utilities + existing responsive patterns
- A6: FileTree folder expand/collapse behavior is unchanged — gallery appears based on current directory state, not a new "folder select" interaction

## Open Questions

All resolved — see Clarifications below.

## Testing Strategy

- **Approach**: Lightweight
- **Rationale**: Feature is mostly UI composition over existing, well-tested infrastructure (raw file API, content type detection, directory listing). Existing tests for FileTree, FileViewerPanel, and raw file route cover the foundation.
- **Focus Areas**: Verify existing tests pass; minimal new tests only if complex logic emerges (e.g., card type routing)
- **Mock Usage**: Avoid mocks entirely — real data/fixtures only
- **Excluded**: No snapshot tests, no e2e tests, no visual regression tests

## Documentation Strategy

- **Location**: No new documentation
- **Rationale**: Feature is self-explanatory from the UI. Domain.md will be updated with the new boundary entries (FolderPreviewPanel etc.) as part of implementation.

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Text/Code Card Preview Strategy | Integration Pattern | Fetching and highlighting file content for card previews involves multiple existing server actions, caching, and truncation decisions | How to efficiently fetch first N lines? Batch highlight or per-card? Cache strategy for preview content? |

## Clarifications

### Session 2026-04-08

**Q1 — Workflow Mode**: Simple — single-phase plan, inline tasks, quick path.

**Q2 — Testing Strategy**: Lightweight — verify existing tests pass, minimal new tests.

**Q3 — Mock Usage**: Avoid mocks entirely — real data/fixtures only.

**Q4 — Documentation Strategy**: No new documentation — feature is self-explanatory from the UI.

**Q5 — Domain Review**: Confirmed — all existing domains, no boundary changes needed. `file-browser` modified, 4 infrastructure domains consumed without changes.

**Q6 — Folder selection trigger**: Expanding a folder in the tree also shows its preview in the viewer panel — no extra click needed. Tree expand/collapse behavior unchanged; gallery appears automatically when a folder is the current context.
→ Updated AC-01: "When a folder is expanded in the file tree" is the trigger.
→ Updated A6: confirmed.

**Q7 — Sort order & preview depth**: 
- Text/code cards show first 10 lines with fade gradient (matches mockup)
- Sort order: alphabetical within each type group (folders → media → documents → other)
→ Confirmed AC-05 (10 lines) and AC-17 (type grouping + alphabetical within).

**Q8 — Item count cap**: Folders with >50 items show a warning gate ("Large folder — X items") requiring a click to load. Once clicked, loads up to 100 items. Folders ≤50 auto-load.
→ Updated AC-15 with the two-tier approach: auto-load ≤50, warning gate >50, hard cap 100.
