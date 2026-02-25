# Code Review: Binary File Viewers

**Plan**: /home/jak/substrate/041-file-browser/docs/plans/046-binary-file-viewers/binary-file-viewers-plan.md
**Spec**: /home/jak/substrate/041-file-browser/docs/plans/046-binary-file-viewers/binary-file-viewers-spec.md
**Phase**: Simple Mode (single phase)
**Date**: 2026-02-24
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Lightweight

## A) Verdict

**REQUEST_CHANGES**

Two implementation correctness issues (hooks violation, missing IPathResolver) and three domain documentation gaps require fixes before approval.

**Key failure areas**:
- **Implementation**: React hooks called after conditional early returns in FileViewerPanel — will crash when switching between text and binary files. Raw route reimplements path security instead of using IPathResolver.
- **Domain compliance**: Three domain.md files (viewer, panel-layout, file-browser) missing Plan 046 history, new contracts, and source locations. Domain map not updated.
- **Testing**: AC-05 (missing params → 400) has zero test coverage.

## B) Summary

The implementation delivers the core feature well — content type detection, raw file streaming with Range support, and five viewer components are clean and well-structured. However, the FileViewerPanel has a pre-existing React hooks violation that Plan 046 perpetuated by adding a new early return path before hook calls. The raw file route reimplements path security manually instead of using IPathResolver from the DI container as specified in the plan and as the sibling routes do. Domain documentation (three domain.md files and domain-map.md) needs updating to reflect new contracts and components. Testing evidence is solid for the Lightweight approach (74% confidence), with one gap at AC-05.

## C) Checklist

**Testing Approach: Lightweight**

- [x] Core validation tests present (detectContentType: 123 lines, raw route: 182 lines)
- [x] Critical paths covered (path traversal, symlink escape, content type mapping)
- [ ] Key verification points documented (execution.log.md is empty)
- [x] Only in-scope files changed
- [x] Linters/type checks clean
- [ ] Domain compliance checks pass (3 domain.md files + domain-map.md need updates)

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | file-viewer-panel.tsx:89-128 | correctness | Hooks after conditional early returns | Move hooks above returns or extract sub-components |
| F002 | HIGH | raw/route.ts:37-58 | security/pattern | Manual path security instead of IPathResolver | Use IPathResolver from DI container |
| F003 | HIGH | docs/domains/_platform/viewer/domain.md | domain-md | Missing detectContentType contract, Plan 046 history | Update Contracts, Source Location, History |
| F004 | HIGH | docs/domains/_platform/panel-layout/domain.md | domain-md | Missing AsciiSpinner contract, Plan 046 history | Update Contracts, Composition, Source Location, History |
| F005 | HIGH | docs/domains/file-browser/domain.md | domain-md | Missing Plan 046 history, 6 new components, raw route | Update History, Composition, Source Location, Boundary |
| F006 | MEDIUM | pdf-viewer.tsx:25-38 | correctness | Fetch missing AbortController — stale fetch memory leak | Add AbortController + cancelled guard |
| F007 | MEDIUM | raw/route.ts:73 | security | Filename in Content-Disposition not sanitized | Strip/escape double-quotes in filename |
| F008 | MEDIUM | docs/domains/domain-map.md | map-nodes/edges | Nodes, edges, health table missing new contracts | Update viewer, panel-layout, file-browser nodes/edges |
| F009 | MEDIUM | raw-file-route.test.ts | testing | AC-05 (missing params → 400) has zero test coverage | Add test case for missing worktree/file params |
| F010 | MEDIUM | raw/route.ts:27 | pattern | `await params` with no comment — looks like a bug | Add comment matching sibling route pattern |
| F011 | LOW | file-viewer-panel.test.tsx | testing | AC-24 test doesn't verify Edit/Diff hidden for binary | Add assertions for hidden Edit/Diff buttons |

## E) Detailed Findings

### E.1) Implementation Quality

**F001 — React Hooks After Conditional Returns** (HIGH)

File: `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx:89-128`

React hooks (`useRef`, `useState`, `useCallback`, `useEffect` on lines 113-128) are called AFTER two conditional early returns (lines 89-96 for `errorType` and lines 99-109 for `isBinary`). This violates the Rules of Hooks. When a user switches from a text file (hooks run) to a binary file (early return, hooks skipped), React will throw "Rendered fewer hooks than expected" and crash.

Note: The `errorType` early return was pre-existing from Plan 041. Plan 046 added the `isBinary` early return, perpetuating the violation. The fix should address both.

**Fix**: Move all hooks above the early returns, or extract the text-file viewer into a separate component (`TextFileView`) so hook counts are stable within each component.

```diff
  // In FileViewerPanel:
+ const isMarkdown = language === 'markdown';
+ const currentContent = editContent ?? content ?? '';
+ const scrollRef = useRef<HTMLDivElement>(null);
+ const [scrolledDown, setScrolledDown] = useState(false);
+ const handleScroll = useCallback(() => { ... }, []);
+ useEffect(() => { setScrolledDown(false); }, [filePath]);
+ const scrollToTop = useCallback(() => { ... }, []);
+
  // Error states
  if (errorType === 'file-too-large') { return ...; }
  if (isBinary && rawFileUrl) { return ...; }

- const isMarkdown = language === 'markdown';
- const currentContent = editContent ?? content ?? '';
- const scrollRef = useRef<HTMLDivElement>(null);
- // ... etc
```

---

**F006 — PdfViewer Fetch Missing AbortController** (MEDIUM)

File: `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/pdf-viewer.tsx:25-38`

No AbortController for the fetch in useEffect. When `src` changes rapidly, the old fetch continues in flight. It can resolve after cleanup, calling `setBlobUrl` with a stale URL (never revoked → memory leak).

**Fix**: Add AbortController and cancelled guard:
```diff
  useEffect(() => {
-   let revoke: string | null = null;
-   fetch(src)
+   const controller = new AbortController();
+   let revoke: string | null = null;
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

---

**F007 — Content-Disposition Filename Not Sanitized** (MEDIUM)

File: `/home/jak/substrate/041-file-browser/apps/web/app/api/workspaces/[slug]/files/raw/route.ts:73`

A filename containing double-quotes (e.g., `test"inject.png`) produces a malformed Content-Disposition header. While CRLF injection is prevented by the runtime, malformed headers can break downloads.

**Fix**:
```diff
- const disposition = download ? `attachment; filename="${filename}"` : 'inline';
+ const sanitizedFilename = filename.replace(/"/g, '');
+ const disposition = download ? `attachment; filename="${sanitizedFilename}"` : 'inline';
```

---

**F002 — Raw Route Reimplements Path Security** (HIGH)

File: `/home/jak/substrate/041-file-browser/apps/web/app/api/workspaces/[slug]/files/raw/route.ts:37-58`

The route implements its own path traversal checks (`file.includes('..')`, `realpath` containment) instead of using `IPathResolver.resolvePath()` from the DI container. The plan explicitly states "Security via IPathResolver.resolvePath()" and the sibling `/files/route.ts` uses `IPathResolver` via DI. The JSDoc even claims IPathResolver usage but the code doesn't import or use it.

This creates two separate security implementations that can diverge. The manual implementation may miss edge cases that IPathResolver handles (e.g., URL-encoded traversal, null-byte injection).

**Fix**: Resolve IPathResolver from DI container and use `pathResolver.resolvePath(worktree, file)` for path validation, matching the pattern in `file-actions.ts`. Keep `fs.createReadStream` for streaming (documented deviation) but use IPathResolver for security.

---

**F010 — Bare `await params` Without Comment** (MEDIUM)

File: `/home/jak/substrate/041-file-browser/apps/web/app/api/workspaces/[slug]/files/raw/route.ts:27`

The `await params;` line with no comment or destructuring looks like dead code or a bug. Sibling routes have the same pattern with an explanatory comment.

**Fix**: Add comment: `await params; // consume async params (required by Next.js 16)`

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | All new files are under their declared domain's source tree |
| Contract-only imports | ✅ | Binary viewers import AsciiSpinner from barrel, detectContentType from lib path |
| Dependency direction | ✅ | file-browser → viewer, file-browser → panel-layout (business → infrastructure) |
| Domain.md updated | ❌ | F003, F004, F005: Three domain.md files missing Plan 046 updates |
| Registry current | ✅ | No new domains created |
| No orphan files | ✅ | All changed files map to a domain in the manifest |
| Map nodes current | ❌ | F008: Viewer, panel-layout, file-browser nodes missing new contracts |
| Map edges current | ❌ | F008: file-browser→viewer missing detectContentType label, file-browser→panels missing AsciiSpinner label |
| No circular business deps | ✅ | No circular dependencies |

**F003** (HIGH): `/home/jak/substrate/041-file-browser/docs/domains/_platform/viewer/domain.md` — Missing: detectContentType() and isBinaryExtension() in Contracts table. content-type-detection.ts in Source Location. Plan 046 entry in History.

**F004** (HIGH): `/home/jak/substrate/041-file-browser/docs/domains/_platform/panel-layout/domain.md` — Missing: AsciiSpinner in Contracts and Composition. ascii-spinner.tsx in Source Location. Plan 046 entry in History.

**F005** (HIGH): `/home/jak/substrate/041-file-browser/docs/domains/file-browser/domain.md` — Missing: Plan 046 entry in History. Raw file API route + 5 viewer components in Composition and Source Location. Binary file viewing in Boundary > Owns.

**F008** (MEDIUM): `/home/jak/substrate/041-file-browser/docs/domains/domain-map.md` — Node labels, edge labels, and health summary table need updating for detectContentType, AsciiSpinner, and binary viewer contracts.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| content-type-detection.ts | MIME_TO_EXT in upload-file.ts (partial, reverse map) | file-browser | ✅ Proceed — detectContentType is the canonical replacement |
| raw/route.ts path security | IPathResolver from _platform/file-ops | _platform/file-ops | ❌ Should reuse IPathResolver (see F002) |
| AsciiSpinner | SpinnerIcon SVG in workgraph-ui (different approach) | workgraph-ui | ✅ Proceed — ASCII vs SVG, different use cases |
| formatFileSize() | formatFileSize() in positional-graph CLI package | CLI package | ✅ Proceed — different packages, CLI can't be imported in web |
| ImageViewer | None | N/A | ✅ Proceed |
| PdfViewer | None | N/A | ✅ Proceed |
| VideoViewer | None | N/A | ✅ Proceed |
| AudioViewer | None | N/A | ✅ Proceed |
| BinaryPlaceholder | None | N/A | ✅ Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 74%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-01 | 70% | raw-file-route.test.ts tests Content-Type via detectContentType, not HTTP response header |
| AC-02 | 75% | raw-file-route.test.ts + file-actions.test.ts path traversal logic checks |
| AC-03 | 80% | raw-file-route.test.ts real symlink + realpath check + file-actions.test.ts FakeFileSystem.setSymlink |
| AC-04 | 55% | file-actions.test.ts not-found test; no raw route 404 test |
| AC-05 | 0% | **No test validates missing worktree/file parameter → 400** |
| AC-06 | 100% | content-type-detection.test.ts all 9 image extensions |
| AC-07 | 100% | content-type-detection.test.ts pdf exact match |
| AC-08 | 100% | content-type-detection.test.ts mp4 + webm |
| AC-09 | 100% | content-type-detection.test.ts mp3 + wav + ogg |
| AC-10 | 100% | content-type-detection.test.ts exe + bin → application/octet-stream |
| AC-11 | 95% | file-actions.test.ts null-byte + extension-based binary metadata |
| AC-12 | 95% | file-actions.test.ts text file returns ok:true with content |
| AC-13–15 | 0% | Visual/manual — excluded per spec |
| AC-16–17 | 0% | Visual/manual — excluded per spec |
| AC-18–21 | 0–50% | detectContentType maps extensions; rendering visual/manual |
| AC-22–23 | 0% | Visual/manual — excluded per spec |
| AC-24 | 40% | Test renders isBinary=true but doesn't verify Edit/Diff hidden |
| AC-25 | 20% | Refresh tested for text files only |
| AC-26 | 0% | Deep-link is integration concern |
| AC-27 | 70% | Range parsing + streaming logic tested, not HTTP 206 response |
| AC-28 | 65% | Invalid range logic tested, not HTTP 416 response |

**F009** (MEDIUM): AC-05 has zero test coverage. Add a test in raw-file-route.test.ts validating that missing query params produce rejection.

**F011** (LOW): AC-24 test renders `isBinary=true` but only asserts "Preview" text is present — does not verify Edit/Diff buttons are absent.

### E.5) Doctrine Compliance

**F002** also applies here: Raw route uses `node:fs` directly instead of resolving via DI container. While IFileSystem bypass for streaming is a documented constitution deviation, the manual path security reimplementation is not documented and violates the pattern used by all other routes.

No project-rules directory found — checked against CLAUDE.md conventions instead:
- ✅ Server Components default; `'use client'` only where needed (viewer components correctly marked)
- ✅ Server Actions in `app/actions/` 
- ✅ Tailwind CSS for styling
- ✅ No mocks in new tests (fakes used per convention)
- ✅ Import aliases use `@/` prefix

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | Raw endpoint correct Content-Type | Logic test (detectContentType) | 70% |
| AC-02 | Path traversal → 403 | Logic test (traversal check) | 75% |
| AC-03 | Symlink escape → 403 | Logic test (realpath + FakeFileSystem) | 80% |
| AC-04 | Not found → 404 | file-actions.test.ts | 55% |
| AC-05 | Missing params → 400 | **NO TEST** | 0% |
| AC-06–10 | detectContentType mappings | Unit tests (100% covered) | 100% |
| AC-11 | Binary → metadata | Unit tests (extension + null-byte) | 95% |
| AC-12 | Text → no regression | Unit test | 95% |
| AC-13–23 | Visual rendering | Excluded per Lightweight spec | 0% (expected) |
| AC-24 | Binary → Preview only | Partial test (missing button assertions) | 40% |
| AC-25 | Refresh reloads binary | No binary-specific test | 20% |
| AC-26 | Deep link works | Integration concern | 0% |
| AC-27 | Range → 206 | Logic tests (parsing + streaming) | 70% |
| AC-28 | Invalid range → 416 | Logic tests (validation) | 65% |

**Overall coverage confidence**: 74%

## G) Commands Executed

```bash
# Diff computation
git --no-pager diff 4c41923..HEAD --name-status -- ':!docs/plans'
git --no-pager diff cef9a2c~1..HEAD -- ':!docs/plans' ':!*045*' ':!test/contracts' > reviews/_computed.diff

# Pre-implementation state check
git --no-pager show 25fdfd8~1:apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx

# File reads (all 19 changed files)
# Domain docs reads (registry.md, domain-map.md, 3x domain.md)
# Test execution via vitest (all 49 tests passed)
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /home/jak/substrate/041-file-browser/docs/plans/046-binary-file-viewers/binary-file-viewers-plan.md
**Spec**: /home/jak/substrate/041-file-browser/docs/plans/046-binary-file-viewers/binary-file-viewers-spec.md
**Phase**: Simple Mode (single phase)
**Tasks dossier**: /home/jak/substrate/041-file-browser/docs/plans/046-binary-file-viewers/tasks/phase-1-binary-file-viewers/tasks.md
**Execution log**: /home/jak/substrate/041-file-browser/docs/plans/046-binary-file-viewers/tasks/phase-1-binary-file-viewers/execution.log.md
**Review file**: /home/jak/substrate/041-file-browser/docs/plans/046-binary-file-viewers/reviews/review.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx | Modified | file-browser | FIX: Move hooks above early returns (F001) |
| /home/jak/substrate/041-file-browser/apps/web/app/api/workspaces/[slug]/files/raw/route.ts | Created | file-browser | FIX: Use IPathResolver (F002), sanitize filename (F007), add comment (F010) |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/pdf-viewer.tsx | Created | file-browser | FIX: Add AbortController (F006) |
| /home/jak/substrate/041-file-browser/docs/domains/_platform/viewer/domain.md | — | viewer | FIX: Add detectContentType contract + history (F003) |
| /home/jak/substrate/041-file-browser/docs/domains/_platform/panel-layout/domain.md | — | panel-layout | FIX: Add AsciiSpinner contract + history (F004) |
| /home/jak/substrate/041-file-browser/docs/domains/file-browser/domain.md | — | file-browser | FIX: Add Plan 046 components + history (F005) |
| /home/jak/substrate/041-file-browser/docs/domains/domain-map.md | — | — | FIX: Update nodes, edges, health table (F008) |
| /home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/raw-file-route.test.ts | Created | file-browser | FIX: Add AC-05 test (F009) |
| /home/jak/substrate/041-file-browser/apps/web/src/lib/content-type-detection.ts | Created | viewer | OK |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/image-viewer.tsx | Created | file-browser | OK |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/video-viewer.tsx | Created | file-browser | OK |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/audio-viewer.tsx | Created | file-browser | OK |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/binary-placeholder.tsx | Created | file-browser | OK |
| /home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/ascii-spinner.tsx | Created | panel-layout | OK |
| /home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx | Modified | panel-layout | OK |
| /home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/main-panel.tsx | Modified | panel-layout | OK |
| /home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/index.ts | Modified | panel-layout | OK |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/services/file-actions.ts | Modified | file-browser | OK |
| /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/hooks/use-file-navigation.ts | Modified | file-browser | OK |
| /home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx | Modified | file-browser | OK |
| /home/jak/substrate/041-file-browser/test/unit/web/lib/content-type-detection.test.ts | Created | viewer | OK |
| /home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/file-actions.test.ts | Modified | file-browser | OK |
| /home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/file-viewer-panel.test.tsx | Modified | file-browser | OK (LOW: F011) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| FT-001 | /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx | Move hooks above early returns or extract TextFileView sub-component | React hooks violation — will crash when switching between text and binary files (F001) |
| FT-002 | /home/jak/substrate/041-file-browser/apps/web/app/api/workspaces/[slug]/files/raw/route.ts | Use IPathResolver from DI container for path validation | Plan requires IPathResolver; manual reimplementation can diverge from canonical security (F002) |
| FT-003 | /home/jak/substrate/041-file-browser/docs/domains/_platform/viewer/domain.md | Add detectContentType contract, source location, Plan 046 history | Domain doc currency (F003) |
| FT-004 | /home/jak/substrate/041-file-browser/docs/domains/_platform/panel-layout/domain.md | Add AsciiSpinner contract, composition, source location, Plan 046 history | Domain doc currency (F004) |
| FT-005 | /home/jak/substrate/041-file-browser/docs/domains/file-browser/domain.md | Add Plan 046 history, new components, raw route, binary viewing | Domain doc currency (F005) |
| FT-006 | /home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/pdf-viewer.tsx | Add AbortController to fetch in useEffect | Stale fetch memory leak on rapid src changes (F006) |
| FT-007 | /home/jak/substrate/041-file-browser/apps/web/app/api/workspaces/[slug]/files/raw/route.ts | Sanitize filename in Content-Disposition header | Malformed header with special characters (F007) |
| FT-008 | /home/jak/substrate/041-file-browser/docs/domains/domain-map.md | Update node labels, edge labels, health summary table | New contracts not reflected in map (F008) |
| FT-009 | /home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/raw-file-route.test.ts | Add test for missing worktree/file params → rejection | AC-05 has zero test coverage (F009) |
| FT-010 | /home/jak/substrate/041-file-browser/apps/web/app/api/workspaces/[slug]/files/raw/route.ts | Add comment on `await params` line | Pattern consistency with sibling routes (F010) |

### Domain Artifacts to Update

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /home/jak/substrate/041-file-browser/docs/domains/_platform/viewer/domain.md | detectContentType + isBinaryExtension contracts, source location, Plan 046 history |
| /home/jak/substrate/041-file-browser/docs/domains/_platform/panel-layout/domain.md | AsciiSpinner contract + composition, source location, Plan 046 history |
| /home/jak/substrate/041-file-browser/docs/domains/file-browser/domain.md | Plan 046 history, raw route + 5 viewer components in composition/source, binary viewing in Owns |
| /home/jak/substrate/041-file-browser/docs/domains/domain-map.md | Node labels (detectContentType, AsciiSpinner), edge labels, health table |

### Next Step

Apply fixes from fix-tasks file, then re-run review:
```
/plan-6-v2-implement-phase --plan /home/jak/substrate/041-file-browser/docs/plans/046-binary-file-viewers/binary-file-viewers-plan.md --phase "Fix Review Findings"
```
Then:
```
/plan-7-v2-code-review --plan /home/jak/substrate/041-file-browser/docs/plans/046-binary-file-viewers/binary-file-viewers-plan.md
```
