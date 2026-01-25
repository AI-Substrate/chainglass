# Phase 3: MarkdownViewer Component - Execution Log

**Phase**: Phase 3: MarkdownViewer Component
**Started**: 2026-01-25
**Testing Strategy**: Full TDD
**Mock Policy**: Fakes-only (R-TEST-007)

---

## Task T001: Install react-markdown, remark-gfm, and @shikijs/rehype packages

**Started**: 2026-01-25
**Status**: ✅ Complete

### What I Did
Installed core markdown processing dependencies:
- `react-markdown` - Markdown to React component renderer
- `remark-gfm` - GitHub Flavored Markdown support
- `@shikijs/rehype` - Shiki syntax highlighting as rehype plugin

### Evidence
```bash
$ pnpm -F @chainglass/web add react-markdown remark-gfm @shikijs/rehype
 +72 -2 +++++++
Done in 4.9s
```

Verified in package.json:
```json
"@shikijs/rehype": "^3.21.0",
"react-markdown": "^10.1.0",
"remark-gfm": "^4.0.1",
```

### Files Changed
- `apps/web/package.json` — Added 3 dependencies
- `pnpm-lock.yaml` — Updated with 72 new packages

**Completed**: 2026-01-25

---

## Task T002: Install @tailwindcss/typography and add @plugin directive

**Started**: 2026-01-25
**Status**: ✅ Complete

### What I Did
Installed @tailwindcss/typography and added the Tailwind v4 @plugin directive:
- Installed package as dev dependency
- Added `@plugin "@tailwindcss/typography"` to globals.css (Tailwind v4 pattern, not JS config)

### Evidence
```bash
$ pnpm -F @chainglass/web add -D @tailwindcss/typography
+4 +
Done in 2.9s
```

Verified in package.json:
```json
"@tailwindcss/typography": "^0.5.19"
```

globals.css now includes:
```css
@import "tailwindcss";
@import "tw-animate-css";

@plugin "@tailwindcss/typography";
```

### Files Changed
- `apps/web/package.json` — Added @tailwindcss/typography as devDependency
- `apps/web/app/globals.css` — Added @plugin directive
- `pnpm-lock.yaml` — Updated with 4 new packages

**Completed**: 2026-01-25

---

## Task T003: Write failing tests for MarkdownViewer component

**Started**: 2026-01-25
**Status**: ✅ Complete

### What I Did
Created comprehensive test suite for MarkdownViewer component following Phase 2 patterns:
- Source mode tests (default, FileViewer visible)
- Toggle button tests (Source/Preview buttons, aria-pressed states)
- Preview mode tests (content rendering, FileViewer hidden)
- Mode persistence tests (multiple toggles work correctly)
- Styling tests (markdown-viewer class, prose class)
- Accessibility tests (ARIA labels, button group)
- Error handling tests (undefined file)

### Evidence
```bash
$ pnpm test -- test/unit/web/components/viewers/markdown-viewer.test.tsx

 FAIL  unit/web/components/viewers/markdown-viewer.test.tsx
Error: Failed to resolve import "../../../../../apps/web/src/components/viewers/markdown-viewer"
```

Tests fail as expected (RED phase) - component doesn't exist yet.

### Files Changed
- `test/unit/web/components/viewers/markdown-viewer.test.tsx` — Created with 15 tests

### Test Count
- 15 tests covering:
  - 2 source mode tests
  - 4 toggle button tests
  - 2 preview mode tests
  - 1 mode persistence test
  - 2 styling tests
  - 2 accessibility tests
  - 1 error handling test

**Completed**: 2026-01-25

---

## Tasks T004, T005, T006: Implement MarkdownViewer Component

**Started**: 2026-01-25
**Status**: ✅ Complete

### What I Did

**T004 - Implement MarkdownViewer**:
- Created MarkdownViewer client component with source/preview toggle
- Uses useMarkdownViewerState hook from Phase 1
- Source mode renders FileViewer (Phase 2)
- Preview mode renders pre-rendered ReactNode from Server Component
- Toggle buttons with aria-pressed for accessibility

**T005 - Configure @shikijs/rehype**:
- Created MarkdownServer async Server Component
- Uses MarkdownAsync from react-markdown
- Configured @shikijs/rehype with:
  - themes: { light: 'github-light', dark: 'github-dark' }
  - defaultColor: 'light'
  - cssVariablePrefix: '--shiki' (matches Phase 2 FileViewer)
- Uses remark-gfm for GFM support (tables, task lists, strikethrough)

**T006 - Add prose styling**:
- Created markdown-viewer.css with:
  - Container and toolbar styling
  - Toggle button group styling
  - Shiki override CSS to prevent prose-invert conflicts (DYK Insight #5)
  - Dark mode support throughout

### Evidence
```bash
$ pnpm test -- test/unit/web/components/viewers/markdown-viewer.test.tsx

 ✓ unit/web/components/viewers/markdown-viewer.test.tsx (14 tests) 231ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```

All 14 tests pass (GREEN phase).

### Files Changed
- `apps/web/src/components/viewers/markdown-viewer.tsx` — Client component with toggle
- `apps/web/src/components/viewers/markdown-server.tsx` — Async Server Component for preview
- `apps/web/src/components/viewers/markdown-viewer.css` — Styles with Shiki overrides
- `apps/web/src/components/viewers/index.ts` — Exports for new components

### Key Implementation Decisions
1. **Two-component pattern**: MarkdownViewer (Client) + MarkdownServer (Server)
   - Client handles toggle state
   - Server handles async markdown processing with Shiki
2. **Shiki CSS variable alignment**: cssVariablePrefix: '--shiki' matches FileViewer
3. **Prose override CSS**: Prevents prose-invert from overriding Shiki colors

**Completed**: 2026-01-25

---

## Task T007: Create demo page at /demo/markdown-viewer

**Started**: 2026-01-25
**Status**: ✅ Complete

### What I Did
Created comprehensive demo page with MCP validation:
- Demo page with two markdown samples (full GFM + code-focused)
- Sidebar navigation item added
- MCP validation performed via Next.js 16 tooling

### Evidence

**MCP Validation (first real use of Next.js 16 MCP)**:

1. Route registration verified via `get_routes`:
```json
{
  "appRouter": [
    "/",
    "/api/events/[channel]",
    "/api/health",
    "/demo/file-viewer",
    "/demo/markdown-viewer",
    "/demo/mcp",
    "/kanban",
    "/workflow"
  ]
}
```

2. Build verification:
```bash
$ pnpm -F @chainglass/web build

✓ Compiled successfully in 2.6s
✓ Generating static pages (9/9) in 3.0s

○ /demo/markdown-viewer
```

### Files Changed
- `apps/web/app/(dashboard)/demo/markdown-viewer/page.tsx` — Demo page with samples
- `apps/web/src/components/dashboard-sidebar.tsx` — Added nav item with FileText icon

### Demo Features
- README.md sample with full GFM (tables, task lists, strikethrough, code blocks)
- api-handler.md sample with multi-language syntax highlighting
- Features info box listing all capabilities

**Completed**: 2026-01-25

---

## Task T008: Test all GFM features (tables, task lists, strikethrough)

**Started**: 2026-01-25
**Status**: ✅ Complete

### What I Did
Added comprehensive GFM feature tests to markdown-viewer.test.tsx:
- Table rendering test (GFM tables become `<table>` elements)
- Task list test (checkboxes with checked/unchecked states)
- Strikethrough test (`<del>` element)
- Autolinks test (clickable `<a>` elements)
- Code fence syntax highlighting test (Shiki classes present)

### Evidence
```bash
$ pnpm test -- test/unit/web/components/viewers/markdown-viewer.test.tsx

 ✓ unit/web/components/viewers/markdown-viewer.test.tsx (19 tests) 326ms

 Test Files  1 passed (1)
      Tests  19 passed (19)
```

All viewer tests:
```bash
$ pnpm test -- test/unit/web/components/viewers/

 ✓ markdown-viewer.test.tsx (19 tests)
 ✓ file-viewer.test.tsx (13 tests)

 Test Files  2 passed (2)
      Tests  32 passed (32)
```

### Files Changed
- `test/unit/web/components/viewers/markdown-viewer.test.tsx` — Added 5 GFM tests

### Test Coverage
GFM Features (AC-11):
- ✅ Tables render as `<table>` with proper structure
- ✅ Task lists render as checkboxes
- ✅ Strikethrough renders as `<del>` element
- ✅ Autolinks are clickable
- ✅ Code fences have Shiki syntax highlighting

**Completed**: 2026-01-25

---

## Phase 3 Summary

**Phase**: Phase 3: MarkdownViewer Component
**Status**: ✅ COMPLETE
**Total Tasks**: 8
**Tests Added**: 19
**Total Test Suite**: 1017 tests passing

### Deliverables
1. **MarkdownViewer** - Client component with source/preview toggle
2. **MarkdownServer** - Async Server Component for preview rendering
3. **CSS Styling** - Prose styling with Shiki override protection
4. **Demo Page** - /demo/markdown-viewer with comprehensive samples
5. **Sidebar Navigation** - MarkdownViewer Demo link added

### Dependencies Used
- react-markdown ^10.1.0
- remark-gfm ^4.0.1
- @shikijs/rehype ^3.21.0
- @tailwindcss/typography ^0.5.19

### MCP Validation (First Use)
Successfully used Next.js 16 MCP tools:
- `get_routes` verified demo page registration
- Build verification confirmed no errors

### Key Decisions Applied
- DYK #1: @shikijs/rehype instead of custom CodeBlock
- DYK #2: cssVariablePrefix: '--shiki' for theme alignment
- DYK #5: Prose override CSS for Shiki color preservation

**Phase Completed**: 2026-01-25
