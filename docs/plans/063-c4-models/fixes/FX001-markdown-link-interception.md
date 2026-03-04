# Fix FX001: Intercept relative markdown links in viewer preview

**Created**: 2026-03-02
**Status**: Proposed
**Plan**: [c4-models-plan.md](../c4-models-plan.md)
**Source**: User testing of C4 diagram navigation — relative `.md` links in markdown preview navigate to wrong URL
**Domain(s)**: `_platform/viewer` (modify), `file-browser` (consume)

---

## Problem

Clicking a relative markdown link (e.g., `[overview.md](containers/overview.md)`) in MarkdownViewer preview navigates to `http://host/workspaces/chainglass/containers/overview.md` — a non-existent route. It should navigate to the file browser with the correct file path: `http://host/workspaces/chainglass/browser?worktree=...&file=docs/c4/containers/overview.md`.

This breaks C4 diagram inter-level navigation (L1 → L2 → L3) and any markdown documentation that cross-references other files. The fix enables the "zoom in/zoom out" C4 navigation pattern to work as clickable links.

## Proposed Fix

Add a custom `a` component override to MarkdownServer (same pattern as the existing mermaid `div` override) that intercepts relative `.md` links and transforms them to file browser URLs. The component needs the current file's directory path to resolve relative links correctly. This requires threading `currentFilePath` through MarkdownViewer → MarkdownServer, and using `workspaceHref()` to build the correct browser URL.

The markdown-preview.tsx click handler (which currently only handles `#anchor` links) should be extended OR replaced by the MarkdownServer component-level approach.

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| `_platform/viewer` | **modify** | MarkdownServer gets custom `a` component override + new `currentFilePath` prop. MarkdownViewer threads file path to MarkdownServer. |
| `file-browser` | **consume** | FileViewerPanel passes file path context when rendering markdown preview (may already have it via `file.path`). |
| `_platform/workspace-url` | **consume** | Uses `workspaceHref()` to build correct browser URLs. No changes needed. |

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | FX001-1 | Add `currentFilePath` prop to MarkdownServer | _platform/viewer | `apps/web/src/components/viewers/markdown-server.tsx` | MarkdownServer accepts optional `currentFilePath: string` prop alongside existing `content` prop | New prop, backward compatible (optional) |
| [ ] | FX001-2 | Add custom `a` component override in MarkdownServer | _platform/viewer | `apps/web/src/components/viewers/markdown-server.tsx` | Relative `.md` links (not `#anchor`, not `http://`) are transformed to file browser URLs when `currentFilePath` is provided. Absolute and anchor links pass through unchanged. | Follow existing `div` override pattern for mermaid. Use `path.join(dirname(currentFilePath), href)` to resolve relative paths. |
| [ ] | FX001-3 | Thread `currentFilePath` through MarkdownViewer | _platform/viewer | `apps/web/src/components/viewers/markdown-viewer.tsx` | MarkdownViewer passes `file.path` to MarkdownServer's `currentFilePath` prop when rendering preview | MarkdownViewer already has `file: ViewerFile` with `path` field |
| [ ] | FX001-4 | Build workspace-aware link URL | _platform/viewer | `apps/web/src/components/viewers/markdown-server.tsx` | Relative `.md` links resolve to `workspaceHref(slug, '/browser', { file: resolvedPath })` format. Links like `containers/overview.md` from `docs/c4/system-context.md` resolve to `?file=docs/c4/containers/overview.md`. | Needs workspace slug + worktree path from context. Consider whether to use props or React context. |
| [ ] | FX001-5 | Verify C4 inter-level links work | _platform/viewer | — | Clicking "Container Overview" link in `docs/c4/system-context.md` preview navigates to `docs/c4/containers/overview.md` in the file browser. Clicking domain links in `web-app.md` navigates to L3 component files. | Manual verification in dev server |

## Workshops Consumed

- [Workshop 001: C4 Design and Layout](../workshops/001-c4-design-and-layout.md) — established the cross-reference link pattern that this fix enables

## Acceptance

- [ ] Relative `.md` links in markdown preview navigate to the correct file in the file browser
- [ ] Anchor links (`#heading`) continue to scroll within the page (no regression)
- [ ] Absolute URLs (`http://...`) open normally (no regression)
- [ ] Links in non-workspace contexts (e.g., demo page) degrade gracefully (render as plain links)

## Design Notes

### Option A: MarkdownServer component override (Recommended)

```typescript
// In markdown-server.tsx components prop:
a: ({ href, children, ...props }) => {
  if (!href || href.startsWith('#') || href.startsWith('http')) {
    return <a href={href} {...props}>{children}</a>;
  }
  if (currentFilePath && href.endsWith('.md')) {
    const dir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));
    const resolved = normalizePath(dir + '/' + href);
    const browserHref = buildFileBrowserUrl(resolved);
    return <a href={browserHref} {...props}>{children}</a>;
  }
  return <a href={href} {...props}>{children}</a>;
}
```

### Option B: Client-side click handler in markdown-preview.tsx

Extend the existing anchor click handler to also handle relative `.md` links. Requires passing file context and using `router.push()` for SPA navigation.

**Recommendation**: Option A (server-side) is cleaner — transforms links at render time, works with SSR, follows the existing mermaid pattern. Option B requires client-side path resolution and router access.

### Context Threading Challenge

MarkdownServer needs workspace context (slug, worktree) to build URLs. Options:
1. **Props** — thread slug + worktree through MarkdownViewer → MarkdownServer (cleanest, explicit)
2. **React Context** — read from WorkspaceContext (available in file browser layout)
3. **URL parsing** — extract from current page URL (fragile)

Recommendation: Props for the file path, WorkspaceContext or URL params for slug/worktree since MarkdownServer is a Server Component and can read searchParams.

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
