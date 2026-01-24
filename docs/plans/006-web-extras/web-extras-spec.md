# Web Extras: File Viewers (Code, Markdown, Diff) and Responsive Infrastructure

**Specification Version**: 1.2.0
**Created**: 2026-01-24
**Status**: Clarified
**Branch**: 006-web-extras
**Builds On**: 005-web-slick (Professional Dashboard)

---

## Research Context

This specification incorporates findings from extensive codebase research conducted via `/plan-1a-explore` and external research via Perplexity.

### Components Affected
- `apps/web/src/components/` - New markdown and responsive component families
- `apps/web/src/hooks/` - New `useResponsive()` hook extending `useIsMobile()`
- `apps/web/src/lib/` - New `markdownToHtml.ts` processing pipeline
- `apps/web/app/globals.css` - Extended typography and prose styles

### Critical Dependencies
- **Markdown Stack**: react-markdown, remark-gfm, rehype-pretty-code, shiki
- **Mermaid**: isomorphic-mermaid (server-side) or react-x-mermaid (client-side)
- **Diff Viewer**: @git-diff-view/react, @git-diff-view/shiki
- **Existing**: next-themes (already integrated), Tailwind v4 with container queries

### Modification Risks
- **Safe**: Adding new components, hooks, dependencies
- **Caution**: Extending globals.css without breaking existing theme
- **Danger**: Don't break SSE infrastructure or existing sidebar responsive behavior

### Research Reference
- Codebase analysis: 46 findings across 7 research domains
- External research: Perplexity deep research on Markdown (Shiki, Mermaid) and Responsive patterns (container queries, platform variants)

---

## Summary

Extend the Chainglass web dashboard with three viewer components and responsive infrastructure:

1. **File Viewers**: Read-only viewer components for displaying source files, Markdown, and diffs:
   - **FileViewer**: Generic code/file viewer with line numbers and syntax highlighting for 20+ languages (Python, C#, TypeScript, JavaScript, Go, Rust, Java, YAML, JSON, SQL, Bash, etc.). Cross-language support is critical.
   - **MarkdownViewer**: Extends FileViewer with source/preview toggle. Source mode shows raw markdown with line numbers; Preview mode renders formatted content with code blocks, tables, Mermaid diagrams.
   - **DiffViewer**: Git diff viewer showing changes for a file. Uses `@git-diff-view/react` with Shiki integration for GitHub-like split/unified diff display. Shows "Not in git" or "No changes" when appropriate.
   - All highlighting occurs server-side via Shiki for VS Code-quality output.
   - Line numbers always visible; selectable independently from code (CSS counter approach).

2. **Multi-Tier Responsive Templates**: Platform-adaptive component infrastructure for all future features:
   - Three-tier breakpoint system (mobile/tablet/desktop)
   - Container queries for component-level responsiveness
   - Mobile navigation template components

These capabilities enable rich content display (source files, documentation, workflow descriptions) and establish **foundational responsive infrastructure for all future features**. Existing Kanban and ReactFlow components are not being updated—they work as-is and any responsive enhancements would be separate future work.

---

## Goals

### Primary Goals

1. **FileViewer Component**: Generic read-only viewer for any source file with:
   - Accepts `ViewerFile` object: `{ path, filename, content }` (future tree browser ready)
   - Language auto-detected from filename extension (`.ts` → typescript, `.py` → python, `.cs` → csharp)
   - Line numbers always visible (CSS counter approach, not copied with code)
   - Syntax highlighting for 20+ languages via Shiki (server-side)
   - Theme-aware (matches application light/dark mode)
   - Keyboard navigation (arrow keys, Home/End)
   - Headless hook (`useFileViewerState`) for TDD

2. **MarkdownViewer Component**: Extended viewer for .md files with:
   - Same `ViewerFile` input as FileViewer
   - **Source mode**: Raw markdown with line numbers + syntax highlighting (like FileViewer)
   - **Preview mode**: Rendered markdown with formatting, code blocks, tables, Mermaid diagrams
   - Toggle button to switch between modes
   - Extensible for future preview formats
   - Headless hook (`useMarkdownViewerState`) for TDD

3. **DiffViewer Component**: Git diff viewer for any file with:
   - Same `ViewerFile` input as FileViewer (uses `path` to run `git diff`)
   - **Split view**: Side-by-side old/new (GitHub-style)
   - **Unified view**: Single column with +/- markers
   - Toggle between split/unified views
   - Syntax highlighting via `@git-diff-view/shiki` (consistent with FileViewer)
   - Light/dark theme support (matches application theme)
   - Graceful handling: "Not in git repository" or "No changes" messages
   - Headless hook (`useDiffViewerState`) for TDD

5. **Cross-Language Support**: Language auto-detected from extension for:
   - TypeScript (.ts, .tsx), JavaScript (.js, .jsx), Python (.py), C# (.cs)
   - Go (.go), Rust (.rs), Java (.java), Kotlin (.kt)
   - YAML (.yaml, .yml), JSON (.json), TOML (.toml), XML (.xml)
   - SQL (.sql), Bash (.sh), PowerShell (.ps1)
   - HTML (.html), CSS (.css), Markdown (.md)
   - And more via Shiki's 100+ language support

6. **Device-Adaptive Infrastructure**: Foundational responsive system for all future features:
   - Three-tier breakpoints: phone (<768px), tablet (768-1023px), desktop (≥1024px)
   - **Tablets use desktop patterns** by default; mobile/phone patterns for <768px only
   - Container queries for component-level responsiveness
   - Phone navigation: bottom tab bar (thumb-friendly)
   - Desktop/tablet navigation: sidebar (existing pattern)

7. **Headless-First Architecture**: All viewer logic must be separable from UI for:
   - Full unit testing without DOM rendering
   - TDD workflow with user reviewing at the last stage
   - Potential CLI reuse of viewer logic

### Secondary Goals

- Establish viewer patterns reusable across the application
- **Create foundational responsive infrastructure for ALL future features** (not retrofitting existing components)
- Document viewer and responsive patterns for future development
- Maintain server-side Shiki processing to minimize client-side JavaScript (~20KB only)

---

## Non-Goals

The following are explicitly **not** in scope:

1. **Markdown editing/WYSIWYG**: Rendering only; no live editing capabilities
2. **User-generated Markdown from untrusted sources**: Content assumed to be from trusted sources (application content, not user input)
3. **Full MDX support**: Not embedding React components in Markdown; plain Markdown only
4. **Print optimization**: Screen-first; print styles out of scope
5. **Native mobile apps**: Responsive web only; no React Native or similar
6. **Retrofitting existing Kanban/ReactFlow components**: These work; responsive updates would be separate future work
7. **Offline-first PWA**: Standard web application without offline capabilities

---

## Complexity Assessment

**Score**: CS-3 (Medium)

### Breakdown

| Factor | Score | Rationale |
|--------|-------|-----------|
| **S** - Surface Area | 2 | New component families (viewers/, responsive/), 3 viewer components, hooks, lib utilities |
| **I** - Integration Breadth | 2 | 7+ new dependencies (react-markdown, shiki, remark-gfm, rehype-pretty-code, isomorphic-mermaid, @git-diff-view/*) |
| **D** - Data/State | 0 | No schema changes; processing transforms only |
| **N** - Novelty | 1 | Well-researched; some integration unknowns (Mermaid + React 19) |
| **F** - Non-Functional | 1 | Performance (server-side processing), accessibility (code blocks, diagrams) |
| **T** - Testing/Rollout | 1 | Unit tests for processing; integration tests for rendering |

**Total**: 7 points → **CS-3 (Medium)**

### Confidence
**0.85** - High confidence due to comprehensive external research and clear implementation patterns from Perplexity deep research.

### Assumptions
1. Shiki works correctly in Next.js 15 server components
2. isomorphic-mermaid renders common diagram types server-side
3. Container queries have sufficient browser support (95%+ as of 2026)
4. Existing useIsMobile() hook can be extended without breaking sidebar

### Dependencies
- **005-web-slick complete**: Theme system, dashboard layout, component patterns
- **Tailwind v4 configured**: Already in place with container query support
- **next-themes integrated**: Already in place for light/dark mode

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Mermaid React 19 compatibility | Medium | Medium | Test early; fallback to client-side rendering if needed |
| Shiki bundle size impact | Low | Medium | Server-side only; verify no client leakage |
| Container query browser support | Low | Low | Progressive enhancement; fallback to media queries |
| Responsive breakpoint conflicts | Low | Medium | New hook; don't modify existing MOBILE_BREAKPOINT |

### Suggested Phases

1. **Phase 1: Headless Viewer Hooks** - `useFileViewerState` + `useMarkdownViewerState` + `useDiffViewerState` with full TDD
2. **Phase 2: FileViewer Component** - Shiki integration + line numbers + theme support + server-side processing
3. **Phase 3: MarkdownViewer Component** - Source/preview toggle + react-markdown + prose styling
4. **Phase 4: Mermaid Integration** - Diagram rendering in preview mode + error handling
5. **Phase 5: DiffViewer Component** - @git-diff-view/react + Shiki integration + split/unified views + git detection
6. **Phase 6: Responsive Infrastructure** - `useResponsive` hook + container queries + patterns
7. **Phase 7: Mobile Templates & Documentation** - Navigation templates + usage patterns for future development

---

## Acceptance Criteria

### FileViewer Component

- [ ] **AC-1**: FileViewer displays any text file with line numbers always visible
- [ ] **AC-2**: Line numbers use CSS counter approach (not copied when selecting code)
- [ ] **AC-3**: Syntax highlighting works for: TypeScript, JavaScript, Python, C#, Go, Rust, Java, YAML, JSON, SQL, Bash, HTML, CSS (minimum 15 languages)
- [ ] **AC-4**: Syntax highlighting theme matches application theme (light/dark mode via next-themes)
- [ ] **AC-5**: Highlighting occurs server-side (Shiki bundle not on client)
- [ ] **AC-6**: Keyboard navigation: arrow keys scroll, Home/End jump to start/end
- [ ] **AC-7**: FileViewer is accessible (ARIA labels, proper focus management)

### MarkdownViewer Component

- [ ] **AC-8**: MarkdownViewer has Source and Preview mode toggle buttons
- [ ] **AC-9**: Source mode displays raw markdown with line numbers + syntax highlighting (same as FileViewer)
- [ ] **AC-10**: Preview mode renders formatted markdown (headings, paragraphs, lists, links, emphasis)
- [ ] **AC-11**: Preview mode supports GFM: tables, task lists (`- [x]`), strikethrough, autolinks
- [ ] **AC-12**: Code fences in preview render with syntax highlighting (consistent with FileViewer)
- [ ] **AC-13**: Toggle state persists within session (doesn't reset on re-render)

### Mermaid Diagrams (in MarkdownViewer Preview)

- [ ] **AC-14**: Mermaid code fences (` ```mermaid `) render as SVG diagrams in preview mode
- [ ] **AC-15**: Flowcharts, sequence diagrams, and state diagrams render correctly
- [ ] **AC-16**: Diagrams respect light/dark theme
- [ ] **AC-17**: Invalid Mermaid syntax displays helpful error message instead of crashing
- [ ] **AC-18**: Diagram rendering does not block page load (async or server-side)

### DiffViewer Component

- [ ] **AC-19**: DiffViewer accepts same `ViewerFile` input as FileViewer
- [ ] **AC-20**: DiffViewer runs `git diff` on file path to get changes
- [ ] **AC-21**: Split view displays side-by-side old/new content (GitHub-style)
- [ ] **AC-22**: Unified view displays single column with +/- change markers
- [ ] **AC-23**: Toggle button switches between split and unified views
- [ ] **AC-24**: Syntax highlighting uses Shiki via `@git-diff-view/shiki` (consistent with FileViewer)
- [ ] **AC-25**: Theme matches application light/dark mode
- [ ] **AC-26**: Shows "Not in git repository" message when file is not in a git repo
- [ ] **AC-27**: Shows "No changes" message when file has no uncommitted changes
- [ ] **AC-28**: Large diffs render smoothly (virtual scrolling built into @git-diff-view)

### Headless Hooks (TDD)

- [ ] **AC-29**: `useFileViewerState` hook accepts `ViewerFile` object: `{ path, filename, content }`
- [ ] **AC-30**: Language is auto-detected internally from filename extension (not a parameter)
- [ ] **AC-31**: `useMarkdownViewerState` hook extends with: isPreviewMode, toggleMode, setMode
- [ ] **AC-32**: `useDiffViewerState` hook manages: viewMode (split/unified), diffData, isLoading, error
- [ ] **AC-33**: Hooks are fully testable without DOM rendering
- [ ] **AC-34**: Hooks have comprehensive unit tests (>90% coverage)

### Responsive Breakpoints

- [ ] **AC-35**: Three-tier breakpoint system: mobile/phone (<768px), tablet (768-1023px), desktop (≥1024px)
- [ ] **AC-36**: `useResponsive()` hook provides `isMobile`, `isTablet`, `isDesktop`, `isPhone`, and `deviceType` properties
- [ ] **AC-37**: `useResponsive()` provides `useMobilePatterns` convenience boolean (true only for phones, not tablets)
- [ ] **AC-38**: Existing `useIsMobile()` hook continues to work unchanged (backward compatibility)
- [ ] **AC-39**: Breakpoint changes trigger re-renders appropriately

### Container Queries

- [ ] **AC-40**: Components can use `@container` utility for container-based responsiveness
- [ ] **AC-41**: Container query breakpoints work independently of viewport size
- [ ] **AC-42**: At least one example component demonstrates container query usage

### Platform-Adaptive Infrastructure

- [ ] **AC-43**: Mobile navigation template uses bottom tab bar pattern (thumb-friendly, phone-only)
- [ ] **AC-44**: Tablet defaults to desktop patterns; mobile patterns reserved for phones (<768px)
- [ ] **AC-45**: Navigation pattern utilities support phone (bottom bar) and desktop (sidebar) paradigms
- [ ] **AC-46**: Mobile template components have touch targets at least 48x48px
- [ ] **AC-47**: Component variant pattern documented for creating platform-specific alternatives in future features

### Performance

- [ ] **AC-48**: Shiki highlighting occurs server-side (no 905KB bundle on client)
- [ ] **AC-49**: Client bundle increase ≤50KB for viewer components
- [ ] **AC-50**: Large files (1000+ lines) render without visible delay (virtualization if needed)

### Integration

- [ ] **AC-51**: FileViewer can display source files in NodeDetailPanel
- [ ] **AC-52**: MarkdownViewer can display .md content with source/preview toggle
- [ ] **AC-53**: DiffViewer can display git diff for any file
- [ ] **AC-54**: Responsive hooks are available for use (not required to update existing components)
- [ ] **AC-55**: All existing tests continue to pass (no breaking changes to existing components)

### Quality Gates

- [ ] **AC-56**: All new tests pass (`just test`)
- [ ] **AC-57**: Type check passes (`just typecheck`)
- [ ] **AC-58**: Lint passes (`just lint`)
- [ ] **AC-59**: Build succeeds (`just build`)

---

## Risks & Assumptions

### Assumptions

1. **Trusted Content**: All Markdown content is from application sources, not user input. No XSS sanitization required beyond react-markdown defaults.

2. **Server Component Processing**: Next.js 15 server components can run Shiki and Mermaid processing without issues.

3. **Browser Support**: Target browsers support CSS container queries (Chrome 105+, Firefox 110+, Safari 16+).

4. **Existing Patterns**: Dashboard patterns from 005-web-slick (headless hooks, CVA variants, cn() utility) apply directly.

5. **Theme Compatibility**: Shiki themes can be mapped to next-themes light/dark state.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Mermaid server-side rendering limitations | Medium | Medium | Test complex diagrams early; document supported types |
| Shiki large language pack | Low | Low | Use dynamic imports; only load languages on demand |
| Responsive hook API design | Low | Medium | Follow existing patterns; ensure backward compatibility with useIsMobile |
| Performance regression from Markdown processing | Low | Medium | Cache processed content; monitor bundle analyzer |
| @git-diff-view React 19 compatibility | Low | Medium | Test early; library has RSC support, actively maintained |
| Git not available in deployment | Low | Low | Graceful "Not in git" message; git expected in dev environments |

---

## Open Questions

### Resolved Questions

1. **Q: Mobile navigation pattern?** → A: **Bottom tab bar** (thumb-friendly, iOS-style)

2. **Q: Tablet default behavior?** → A: **Tablet closer to desktop** - tablets use desktop patterns by default, with specific mobile patterns reserved for phone-sized devices

3. **Q: What are we building?** → A: FileViewer (generic code viewer with line numbers) and MarkdownViewer (source/preview toggle for .md files)

2. **Q: Client or server-side processing?** → A: Server-side via Shiki (keeps 905KB bundle off client)

3. **Q: Which syntax highlighter?** → A: Shiki (VS Code quality, theme support, 100+ languages)

4. **Q: How to handle line numbers?** → A: CSS counter approach (not copied when selecting code)

5. **Q: Container queries or media queries?** → A: Both - container queries for components, media queries for layouts

6. **Q: Extend useIsMobile or create new hook?** → A: New `useResponsive()` hook; preserve backward compatibility

7. **Q: Architecture for viewers?** → A: Headless hooks (`useFileViewerState`, `useMarkdownViewerState`, `useDiffViewerState`) with TDD, user reviews UI at end

8. **Q: Which diff viewer library?** → A: `@git-diff-view/react` with `@git-diff-view/shiki` - Shiki integration matches FileViewer, RSC/SSR support, virtual scrolling, GitHub-like appearance

---

## ADR Seeds (Optional)

### ADR-005: Markdown Rendering Architecture

**Decision Drivers**:
- Performance: minimize client-side JavaScript
- Quality: VS Code-level syntax highlighting
- Theming: must match light/dark mode
- Flexibility: support for Mermaid diagrams

**Candidate Alternatives**:
- A: react-markdown + Shiki server-side (recommended)
- B: MDX with @next/mdx
- C: marked + Prism.js client-side

**Stakeholders**: Web developers, content authors

### ADR-006: Responsive Component Strategy

**Decision Drivers**:
- Device diversity: phones, tablets, desktops
- Component reusability: same components in different contexts
- Performance: minimize JS-based layout calculations
- Developer experience: clear patterns for new components

**Candidate Alternatives**:
- A: Three-tier hook + container queries (recommended)
- B: CSS-only with Tailwind responsive prefixes
- C: Separate mobile and desktop component trees

**Stakeholders**: Web developers, UX designers

---

## External Research Summary

### FileViewer & MarkdownViewer Architecture (Perplexity Deep Research 2026-01-24)

**Key Findings**:
1. **Shiki server-side rendering** eliminates client-side highlighting overhead (905KB stays on server)
2. **CSS counter approach** for line numbers - not copied when selecting code
3. **Headless hooks pattern** separates state management from presentation for TDD
4. **Virtualization** (react-window) for large files (1000+ lines)
5. **Dual-theme pre-rendering** - generate both light/dark versions server-side

**ViewerFile Interface** (input to both viewers):
```typescript
interface ViewerFile {
  path: string;      // e.g., "src/components/Button.tsx"
  filename: string;  // e.g., "Button.tsx"
  content: string;   // The actual file content
}
// Language auto-detected from filename extension (not a parameter)
```

**Headless Hook Pattern**:
```typescript
// useFileViewerState(file: ViewerFile) - manages file, detected language, theme, lineNumbers
// useMarkdownViewerState(file: ViewerFile) - extends with isPreviewMode, toggleMode

interface FileViewerState {
  file: ViewerFile;
  language: string;  // Auto-detected from filename
  theme: 'light' | 'dark';
  showLineNumbers: boolean;
  highlightedLines: number[];
}

interface MarkdownViewerState extends FileViewerState {
  isPreviewMode: boolean;
}
```

**Line Numbers (CSS Counter)**:
```css
code .line::before {
  counter-increment: line;
  content: counter(line);
  user-select: none;  /* Not copied with code */
}
```

**Shiki Server-Side Pattern**:
```typescript
// Server Component - no client JS for highlighting
const html = await codeToHtml(code, {
  lang: language,
  theme: theme === 'dark' ? 'github-dark' : 'github-light',
});
```

### DiffViewer Architecture (Perplexity Search 2026-01-24)

**Library Comparison**:
| Feature | @git-diff-view/react | react-diff-view | react-diff-viewer |
|---------|---------------------|-----------------|-------------------|
| Shiki integration | ✅ `@git-diff-view/shiki` | ❌ refractor only | ❌ Prism only |
| RSC/SSR support | ✅ Full Next.js 15 | ❌ Client only | ❌ Client only |
| Git diff input | ✅ Native | ✅ Native | ❌ Text strings only |
| Light/dark theme | ✅ Built-in | ✅ CSS vars | ✅ Prop |
| Virtual scrolling | ✅ Large diffs | ❌ | ❌ |
| Split/Unified views | ✅ | ✅ | ✅ |

**Chosen: `@git-diff-view/react`** because:
1. Shiki integration matches FileViewer (consistent highlighting)
2. RSC support fits Next.js 15 architecture
3. Virtual scrolling for large diffs
4. GitHub-like professional appearance

**Headless Hook Pattern**:
```typescript
interface DiffViewerState {
  file: ViewerFile;
  viewMode: 'split' | 'unified';
  diffData: string | null;     // Raw git diff output
  isLoading: boolean;
  error: 'not-git' | 'no-changes' | 'error' | null;
  toggleViewMode: () => void;
}
```

**Git Integration**:
```typescript
// Server action to get diff
async function getGitDiff(filePath: string): Promise<{
  diff: string | null;
  error: 'not-git' | 'no-changes' | null;
}> {
  // Check if in git repo: git rev-parse --git-dir
  // Get diff: git diff <filePath>
  // Return appropriate result
}
```

### Responsive Design (Perplexity Deep Research 2026-01-24)

**Key Recommendations**:
1. **Media queries** for page-level layout (sidebar visibility, grid columns)
2. **Container queries** for component-level adaptation (card layouts in different contexts)
3. **Device detection** only for fundamentally different interactions (not just styling)
4. **Touch targets** minimum 48x48px on mobile

**Breakpoint Strategy**:
```typescript
const BREAKPOINTS = {
  sm: 480,   // Phones
  md: 768,   // Tablets (portrait)
  lg: 1024,  // Tablets (landscape) / small desktops
  xl: 1280,  // Desktops
};
```

**Pattern for Platform Variants**:
- CSS-only: Use `hidden md:block` / `md:hidden` for simple show/hide
- Component branching: Use `useResponsive()` for different component trees
- Container queries: Use `@container` for component-level responsiveness

---

## Dependencies

### On Other Chainglass Components

- **005-web-slick**: Theme system, dashboard layout, shadcn/ui components, SSE infrastructure
- **@chainglass/shared**: Interfaces, fakes for testing
- **Existing hooks**: DI container patterns, useSSE

### New External Dependencies

| Package | Version | Purpose | Bundle Impact |
|---------|---------|---------|---------------|
| `react-markdown` | ^9.0.0 | Markdown to React components | ~20KB client |
| `remark-gfm` | ^4.0.0 | GitHub Flavored Markdown | Server only |
| `rehype-pretty-code` | ^0.15.0 | Shiki integration for rehype | Server only |
| `shiki` | ^3.0.0 | Syntax highlighting engine | ~905KB server only |
| `isomorphic-mermaid` | ^2.0.0 | Server-side Mermaid rendering | Server only |
| `@tailwindcss/typography` | ^0.5.0 | Prose styling for Markdown | CSS only |
| `@git-diff-view/react` | ^1.0.0 | Git diff viewer component | ~30KB client |
| `@git-diff-view/shiki` | ^1.0.0 | Shiki syntax highlighting for diff | Server only |

**Note**: Most packages are server-only; client bundle impact is minimal (~50KB total for react-markdown + diff viewer).

---

## Success Metrics

### Qualitative

- Code blocks "look professional" with proper syntax highlighting
- Mermaid diagrams "render correctly" for common diagram types
- Diff viewer "looks like GitHub" with clear change visualization
- Responsive infrastructure "easy to use" for future feature development
- Mobile navigation template "feels native" with appropriate touch targets

### Quantitative

- Lighthouse performance score ≥90 on pages with Markdown
- Lighthouse accessibility score ≥90 on responsive layouts
- Client bundle increase ≤50KB for Markdown capability
- No client-side JavaScript for syntax highlighting (server-only)
- Touch targets ≥48px on mobile verified via accessibility audit

---

## Testing Strategy

**Approach**: Headless-first TDD - hooks tested first, UI components tested with user review at end

### Focus Areas

| Priority | Area | Approach |
|----------|------|----------|
| **Critical** | `useFileViewerState` hook | Unit tests for all state transitions, >90% coverage |
| **Critical** | `useMarkdownViewerState` hook | Unit tests for mode toggle, state persistence |
| **Critical** | `useDiffViewerState` hook | Unit tests for view mode toggle, git detection, error states |
| High | `useResponsive` hook | Unit tests with mocked matchMedia |
| High | Shiki server-side processing | Unit tests for language detection, theme switching |
| High | Mermaid error handling | Unit tests for invalid syntax, fallback rendering |
| High | Git diff server action | Unit tests for git detection, diff parsing, error handling |
| Medium | FileViewer component | Integration tests with fixtures |
| Medium | MarkdownViewer component | Integration tests for source/preview toggle |
| Medium | DiffViewer component | Integration tests with mock git diff output |
| Standard | Responsive navigation templates | Integration tests with viewport mocking |

### Test Fixtures

Create fixtures in `apps/web/src/data/fixtures/`:
- `sample-code.ts` - TypeScript sample for FileViewer
- `sample-code.py` - Python sample for cross-language testing
- `sample-code.cs` - C# sample for cross-language testing
- `sample-markdown.md` - Basic formatting for MarkdownViewer
- `code-heavy-markdown.md` - Markdown with multiple code blocks
- `mermaid-diagrams.md` - Common diagram types
- `large-file.ts` - 1000+ lines for performance testing
- `sample-diff.patch` - Sample git diff output for DiffViewer testing

### Mock Usage

**Allowed**:
- `window.matchMedia` for responsive hook testing
- `ResizeObserver` for container query testing

**Prohibited**:
- Mocking Shiki/Mermaid internals
- Mocking react-markdown behavior
- Mocking headless hook internals (test the real hooks)

---

*Specification Version 1.2.0 - Clarified 2026-01-24*

### Clarifications Log

| # | Question | Answer | Sections Updated |
|---|----------|--------|------------------|
| Q1 | Mobile navigation pattern | **Bottom tab bar** - thumb-friendly, phone-only | AC-43, Goals §6 |
| Q2 | Tablet default behavior | **Closer to desktop** - tablets use desktop patterns | AC-37, AC-44, Goals §6 |
| Q3 | DiffViewer component | **Added** - @git-diff-view/react with Shiki for git diff display | Goals §3, AC-19 to AC-28, Dependencies |

*Next Step: Run `/plan-3-architect` to create implementation plan*
