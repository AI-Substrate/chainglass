# Fix FX001: Wire File Browser End-to-End

**Created**: 2026-02-24
**Status**: Proposed
**Plan**: [file-browser-plan.md](../file-browser-plan.md)
**Source**: Phase 4 code review (NEEDS FIXES) + file-viewer-integration workshop
**Domain(s)**: `file-browser` (primary), `_platform/viewer` (consumed), `_platform/file-ops` (consumed)

---

## Problem

Phase 4 built all the backend services and frontend components but left the browser page with placeholder rendering and unwired flows. Files can't be read when selected, edit mode shows raw text instead of CodeMirror, preview mode doesn't use the existing viewer components (no syntax highlighting, no mermaid), diff mode has no data, save is a stub, changed-files filter is broken, and the file tree doesn't auto-expand to show a deep-linked file. The symlink boundary check has a prefix bypass vulnerability.

## Proposed Fix

Wire the browser page end-to-end following the [file-viewer-integration workshop](../workshops/file-viewer-integration.md) decisions:
- `readFile` server action returns `highlightedHtml` + `previewHtml` (D1, D2, D4)
- FileViewerPanel integrates CodeEditor (edit), Shiki HTML + ReactMarkdown (preview), DiffViewer (diff)
- Diff data lazy-loaded on mode switch (D3)
- FileTree auto-expands to selected file on page load
- Changed-files filter wired via API route
- Symlink boundary check fixed with separator-safe containment

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| `file-browser` | primary | Wire BrowserClient flows, update FileViewerPanel rendering, fix changed-files, tree auto-expand |
| `_platform/viewer` | consumed | Import FileViewer for code preview rendering (existing component) |
| `_platform/file-ops` | consumed | realpath boundary check hardened (separator-safe) |

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | FX001-1 | Fix symlink boundary check (separator-safe containment) | file-browser | `apps/web/src/features/041-file-browser/services/file-actions.ts` | `worktreePath/` prefix check, not bare `startsWith` | Review Critical, already fixed in prior commit |
| [x] | FX001-2 | Wire readFile on file select in BrowserClient | file-browser | `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | Clicking file loads content + stores in fileData | Review High #1, already fixed |
| [x] | FX001-3 | Wire save + refresh handlers in BrowserClient | file-browser | `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | Save calls saveFile, refresh re-reads file | Review High #2, already fixed |
| [x] | FX001-4 | Validate worktree against workspace-owned paths in API route | file-browser | `apps/web/app/api/workspaces/[slug]/files/route.ts` | Rejects worktree not in workspace's path list | Review Critical, already fixed |
| [ ] | FX001-5 | Add `highlightedHtml` to readFile server action result | file-browser | `apps/web/app/actions/file-actions.ts`, `apps/web/src/features/041-file-browser/services/file-actions.ts` | readFile returns highlighted HTML via Shiki server-side (D1, D4) | Workshop D1 |
| [ ] | FX001-6 | Add `previewHtml` for markdown files via server-side rendering | file-browser | `apps/web/app/actions/file-actions.ts` | Markdown files get rendered HTML with mermaid + syntax highlighting (D2) | Workshop D2 |
| [ ] | FX001-7 | Integrate real viewer components in FileViewerPanel | file-browser | `apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx` | Edit: CodeEditor. Preview (code): Shiki HTML. Preview (md): previewHtml. Diff: DiffViewer. | Review High #3 |
| [ ] | FX001-8 | Add lazy diff loading on mode switch | file-browser | `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | Switching to Diff mode fetches git diff. Cached per file. | Workshop D3 |
| [ ] | FX001-9 | Auto-expand FileTree to selected file on page load | file-browser | `apps/web/src/features/041-file-browser/components/file-tree.tsx`, `browser-client.tsx` | Deep-linked `?file=docs/a/b/c.md` expands `docs/`, `a/`, `b/` in tree | Already partially implemented |
| [ ] | FX001-10 | Wire changed-files filter in BrowserClient | file-browser | `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | Toggle fetches changed files, filters tree display | Review High #5 |
| [ ] | FX001-11 | Update domain docs (file paths, composition tables) | file-browser | `docs/domains/file-browser/domain.md`, `docs/domains/domain-map.md` | Source Location matches actual file paths | Review High #6, Medium #4 |

## Workshops Consumed

- [file-viewer-integration.md](../workshops/file-viewer-integration.md) — Decisions D1-D4: server-rendered previews, lazy diff, cached highlight data

## Acceptance

- [ ] Clicking a file in the tree loads and displays it with syntax highlighting
- [ ] Markdown files render with mermaid diagrams and code block highlighting in preview mode
- [ ] Edit mode shows CodeMirror with language detection
- [ ] Diff mode shows git diff (lazy-loaded on mode switch)
- [ ] Save detects mtime conflicts
- [ ] File tree auto-expands to deep-linked file
- [ ] Changed-only filter works
- [ ] Symlink boundary check is separator-safe
- [ ] `just fft` passes

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
