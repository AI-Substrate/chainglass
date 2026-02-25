# Fix Tasks: Binary File Viewers

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Fix React Hooks Violation in FileViewerPanel
- **Severity**: HIGH
- **Finding**: F001
- **File(s)**: /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx
- **Issue**: React hooks (useRef, useState, useCallback, useEffect on lines 113-128) are called after conditional early returns (lines 89-96 for errorType, lines 99-109 for isBinary). Violates Rules of Hooks — switching from text to binary file will crash React.
- **Fix**: Move all hooks above the early returns. The hooks are unused in the early return paths, so this is purely a reorder.
- **Patch hint**:
  ```diff
    }: FileViewerPanelProps) {
  +   const isMarkdown = language === 'markdown';
  +   const currentContent = editContent ?? content ?? '';
  +   const scrollRef = useRef<HTMLDivElement>(null);
  +   const [scrolledDown, setScrolledDown] = useState(false);
  +
  +   const handleScroll = useCallback(() => {
  +     const el = scrollRef.current;
  +     if (el) setScrolledDown(el.scrollTop > 100);
  +   }, []);
  +
  +   // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset scroll state when file changes
  +   useEffect(() => {
  +     setScrolledDown(false);
  +   }, [filePath]);
  +
  +   const scrollToTop = useCallback(() => {
  +     scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  +   }, []);
  +
      // Error states
      if (errorType === 'file-too-large') { ... }
      if (isBinary && rawFileUrl) { ... }
  -
  -   const isMarkdown = language === 'markdown';
  -   const currentContent = editContent ?? content ?? '';
  -   const scrollRef = useRef<HTMLDivElement>(null);
  -   const [scrolledDown, setScrolledDown] = useState(false);
  -   ...etc...
  ```

### FT-002: Use IPathResolver in Raw Route
- **Severity**: HIGH
- **Finding**: F002
- **File(s)**: /home/jak/substrate/041-file-browser/apps/web/app/api/workspaces/[slug]/files/raw/route.ts
- **Issue**: Route reimplements path security manually instead of using IPathResolver from DI container. Plan requires IPathResolver; sibling routes use it.
- **Fix**: Import and resolve IPathResolver from DI container. Replace manual `file.includes('..')` + `realpath` checks with `pathResolver.resolvePath(worktree, file)`. Keep `fs.createReadStream` for streaming (documented deviation). See existing `file-actions.ts` for the pattern.
- **Patch hint**:
  ```diff
  + import { getContainer } from '@/lib/di-container';
  + import { SHARED_DI_TOKENS } from '@chainglass/shared';
  + import type { IPathResolver } from '@chainglass/shared';

    export async function GET(request: NextRequest, { params }: ...) {
      await params; // consume async params (required by Next.js 16)
      ...
  -   if (file.includes('..') || file.startsWith('/')) {
  -     return new Response('Path traversal not allowed', { status: 403 });
  -   }
  -   const absolutePath = path.join(worktree, file);
  -   try {
  -     const realPath = await fsPromises.realpath(absolutePath);
  -     if (!realPath.startsWith(worktree) || ...) { ... }
  -   } catch { return 404; }
  +   const container = getContainer();
  +   const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
  +   const resolved = await pathResolver.resolvePath(worktree, file);
  +   if (!resolved.ok) {
  +     return new Response(resolved.error, { status: resolved.error === 'not-found' ? 404 : 403 });
  +   }
  +   const absolutePath = resolved.path;
  ```

### FT-003: Update viewer/domain.md
- **Severity**: HIGH
- **Finding**: F003
- **File(s)**: /home/jak/substrate/041-file-browser/docs/domains/_platform/viewer/domain.md
- **Issue**: Missing detectContentType() and isBinaryExtension() contracts, content-type-detection.ts source location, Plan 046 history entry.
- **Fix**: Add to Contracts table: `detectContentType()` Function and `isBinaryExtension()` Function (consumers: file-browser). Add to Source Location: `apps/web/src/lib/content-type-detection.ts`. Add History: `Plan 046 | Added detectContentType() and isBinaryExtension() content type utilities`.

### FT-004: Update panel-layout/domain.md
- **Severity**: HIGH
- **Finding**: F004
- **File(s)**: /home/jak/substrate/041-file-browser/docs/domains/_platform/panel-layout/domain.md
- **Issue**: Missing AsciiSpinner contract, composition entry, source location, Plan 046 history entry.
- **Fix**: Add to Contracts: `AsciiSpinner` Component (consumers: file-browser). Add to Composition: `AsciiSpinner | ASCII character spinner`. Add Source Location: `ascii-spinner.tsx`. Add History: `Plan 046 | Extracted AsciiSpinner from ExplorerPanel as reusable component, exported via barrel`.

### FT-005: Update file-browser/domain.md
- **Severity**: HIGH
- **Finding**: F005
- **File(s)**: /home/jak/substrate/041-file-browser/docs/domains/file-browser/domain.md
- **Issue**: Missing Plan 046 history, 6 new components/routes in composition and source location, binary file viewing in boundary.
- **Fix**: Add History row for Plan 046. Add Composition rows for raw file API route + ImageViewer + PdfViewer + VideoViewer + AudioViewer + BinaryPlaceholder. Add Source Location rows for all new files. Update Boundary > Owns to include raw file streaming and binary viewer components.

## Medium Fixes

### FT-006: Add AbortController to PdfViewer Fetch
- **Severity**: MEDIUM
- **Finding**: F006
- **File(s)**: /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/pdf-viewer.tsx
- **Issue**: Fetch in useEffect has no AbortController. Rapid `src` changes cause stale fetch to resolve after cleanup → memory leak.
- **Fix**: Add AbortController, abort in cleanup, guard setBlobUrl with `controller.signal.aborted`.
- **Patch hint**:
  ```diff
    useEffect(() => {
  +   const controller = new AbortController();
      let revoke: string | null = null;
  -   fetch(src)
  +   fetch(src, { signal: controller.signal })
        .then((res) => res.blob())
        .then((blob) => {
  +       if (controller.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          revoke = url;
          setBlobUrl(url);
        })
  -     .catch(() => setError(true));
  +     .catch((e) => {
  +       if (e instanceof DOMException && e.name === 'AbortError') return;
  +       setError(true);
  +     });
      return () => {
  +     controller.abort();
        if (revoke) URL.revokeObjectURL(revoke);
      };
    }, [src]);
  ```

### FT-007: Sanitize Content-Disposition Filename
- **Severity**: MEDIUM
- **Finding**: F007
- **File(s)**: /home/jak/substrate/041-file-browser/apps/web/app/api/workspaces/[slug]/files/raw/route.ts
- **Issue**: Filename with double-quotes produces malformed Content-Disposition header.
- **Fix**: Strip double-quotes from filename.
- **Patch hint**:
  ```diff
  - const disposition = download ? `attachment; filename="${filename}"` : 'inline';
  + const sanitized = filename.replace(/"/g, '');
  + const disposition = download ? `attachment; filename="${sanitized}"` : 'inline';
  ```

### FT-008: Update domain-map.md
- **Severity**: MEDIUM
- **Finding**: F008
- **File(s)**: /home/jak/substrate/041-file-browser/docs/domains/domain-map.md
- **Issue**: Mermaid node labels, edge labels, and health summary table don't reflect new contracts.
- **Fix**: Update viewer node to include detectContentType. Update panel-layout node to include AsciiSpinner. Update file-browser→viewer edge to add detectContentType. Update file-browser→panel-layout edge to add AsciiSpinner. Update health table Contracts Out/In columns.

### FT-009: Add AC-05 Test Coverage
- **Severity**: MEDIUM
- **Finding**: F009
- **File(s)**: /home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/raw-file-route.test.ts
- **Issue**: AC-05 (missing worktree or file parameter → 400) has zero test coverage.
- **Fix**: Add test case(s) validating that the route's validation logic rejects missing/empty worktree and file parameters.

### FT-010: Add Comment to await params
- **Severity**: MEDIUM
- **Finding**: F010
- **File(s)**: /home/jak/substrate/041-file-browser/apps/web/app/api/workspaces/[slug]/files/raw/route.ts
- **Issue**: Bare `await params;` looks like dead code. Sibling routes have explanatory comments.
- **Fix**: Change to `await params; // consume async params (required by Next.js 16)`

## Re-Review Checklist

- [ ] FT-001: Hooks moved above early returns (or extracted sub-component)
- [ ] FT-002: IPathResolver used for path validation
- [ ] FT-003: viewer/domain.md updated
- [ ] FT-004: panel-layout/domain.md updated
- [ ] FT-005: file-browser/domain.md updated
- [ ] FT-006: PdfViewer fetch has AbortController
- [ ] FT-007: Content-Disposition filename sanitized
- [ ] FT-008: domain-map.md nodes/edges/health updated
- [ ] FT-009: AC-05 test added
- [ ] FT-010: `await params` has comment
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
