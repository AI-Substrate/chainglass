# Web Extras: File Viewers and Responsive Infrastructure - Implementation Plan

**Plan Version**: 1.1.0
**Created**: 2026-01-24
**Spec**: [./web-extras-spec.md](./web-extras-spec.md)
**Status**: REVISED (post-validation fixes)
**Complexity Score**: CS-3 (Medium) - 7 points total

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Phase 1: Headless Viewer Hooks](#phase-1-headless-viewer-hooks)
6. [Phase 2: FileViewer Component](#phase-2-fileviewer-component)
7. [Phase 3: MarkdownViewer Component](#phase-3-markdownviewer-component)
8. [Phase 4: Mermaid Integration](#phase-4-mermaid-integration)
9. [Phase 5: DiffViewer Component](#phase-5-diffviewer-component)
10. [Phase 6: Responsive Infrastructure](#phase-6-responsive-infrastructure)
11. [Phase 7: Mobile Templates & Documentation](#phase-7-mobile-templates--documentation)
12. [Cross-Cutting Concerns](#cross-cutting-concerns)
13. [Complexity Tracking](#complexity-tracking)
14. [Progress Tracking](#progress-tracking)
15. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem Statement**: The Chainglass web dashboard needs rich content display capabilities for source files, documentation, and git diffs, plus responsive infrastructure for multi-device support.

**Solution Approach**:
- Create three viewer components (FileViewer, MarkdownViewer, DiffViewer) with headless-first TDD architecture
- Implement server-side syntax highlighting via Shiki (905KB stays on server)
- Add three-tier responsive breakpoints (phone/tablet/desktop) without breaking existing sidebar
- Establish foundational patterns for all future responsive development

**Expected Outcomes**:
- VS Code-quality syntax highlighting for 20+ languages
- Markdown preview with Mermaid diagram support
- GitHub-style git diff viewing
- Responsive infrastructure reusable by all future features

**Success Metrics**:
- AC-1 through AC-59 all pass
- Client bundle increase ≤50KB
- Lighthouse performance ≥90
- All existing tests continue passing

---

## Technical Context

### Current System State

The Chainglass web app (Next.js 15 + React 19 + Tailwind 4) has:
- **Theme System**: next-themes with OKLCH color space CSS variables
- **Responsive**: Single 768px breakpoint via `useIsMobile()` hook
- **Components**: shadcn/ui foundation with CVA variants and cn() utility
- **Headless Hooks**: `useBoardState`, `useFlowState` patterns established
- **SSE**: Real-time updates for dashboard (must not break)

### Integration Requirements

| Existing System | Integration Approach |
|-----------------|---------------------|
| `useIsMobile()` hook | Create NEW `useResponsive()` hook; keep existing unchanged |
| next-themes | Shiki themes map to light/dark state |
| Sidebar responsive | Uses `useIsMobile()` - must remain functional |
| DI container | Viewer hooks are pure logic; no DI required |
| SSE infrastructure | No modification needed; viewers are display-only |

### Constraints and Limitations

1. **Server Component Boundary**: Shiki must run in Server Components only
2. **No MOBILE_BREAKPOINT Modification**: Would break sidebar (critical)
3. **Git Dependency**: DiffViewer requires git binary; graceful degradation required
4. **React 19 Compatibility**: New dependencies must be tested (Mermaid, @git-diff-view)

### Assumptions

1. 005-web-slick is complete (theme system, dashboard layout)
2. Tailwind v4 with container query support is configured
3. Content is from trusted sources (no XSS sanitization beyond defaults)
4. Shiki themes can map to next-themes light/dark state

---

## Critical Research Findings

### 🚨 Critical Discovery 01: Server Component Boundary for Shiki
**Impact**: Critical
**Sources**: [I1-04, R1-05]
**Problem**: Shiki (905KB) must not reach client bundle; requires Server Component processing
**Solution**: Create `apps/web/src/lib/server/shiki-processor.ts` with async highlighting functions. Only import in Server Components.
**Example**:
```typescript
// ❌ WRONG - importing in client component
'use client';
import { codeToHtml } from 'shiki';

// ✅ CORRECT - server utility only
// apps/web/src/lib/server/shiki-processor.ts
export async function highlightCode(code: string, lang: string, theme: 'light' | 'dark') {
  const { codeToHtml } = await import('shiki');
  return codeToHtml(code, { lang, theme: theme === 'dark' ? 'github-dark' : 'github-light' });
}
```
**Action Required**: Phase 2 must establish server-only utilities before component implementation
**Affects Phases**: Phase 2, Phase 3, Phase 4

---

### 🚨 Critical Discovery 02: useResponsive Cannot Modify MOBILE_BREAKPOINT
**Impact**: Critical
**Sources**: [I1-03, R1-02]
**Problem**: Existing `useIsMobile()` uses hardcoded `MOBILE_BREAKPOINT = 768`. Sidebar depends on this exact value. Changing it breaks layout.
**Solution**: Create NEW `useResponsive()` hook alongside (not replacing) `useIsMobile()`. New hook provides three-tier breakpoints.
**Example**:
```typescript
// ❌ WRONG - modifying existing constant
const MOBILE_BREAKPOINT = 480; // BREAKS SIDEBAR

// ✅ CORRECT - new hook with new constants
// apps/web/src/hooks/useResponsive.ts
const PHONE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

export function useResponsive() {
  // Returns { isPhone, isTablet, isDesktop, useMobilePatterns, deviceType }
  // useMobilePatterns is true ONLY for phones, NOT tablets
}
```
**Action Required**: Phase 6 must create new hook; never modify existing MOBILE_BREAKPOINT
**Affects Phases**: Phase 6

---

### 🚨 Critical Discovery 03: Hydration Mismatch with Responsive Hook
**Impact**: Critical
**Sources**: [R1-09]
**Problem**: Server doesn't know viewport size. Client renders different layout than server during hydration, causing React warnings.
**Solution**: Initialize with undefined, use two-render pattern, add `suppressHydrationWarning` on container.
**Example**:
```typescript
// apps/web/src/hooks/useResponsive.ts
export function useResponsive() {
  const [width, setWidth] = useState<number | undefined>(undefined);

  useEffect(() => {
    setWidth(window.innerWidth);
    // ... matchMedia listeners
  }, []);

  // During SSR/hydration: all booleans are false, deviceType is undefined
  // After hydration: correct values
}
```
**Action Required**: Phase 6 hook implementation must handle SSR correctly
**Affects Phases**: Phase 6

---

### High Discovery 04: Phase Sequence Driven by Shiki Dependency
**Impact**: High
**Sources**: [I1-01]
**Problem**: All viewer components depend on Shiki infrastructure. FileViewer, MarkdownViewer, and DiffViewer all need syntax highlighting.
**Solution**: Strict phase sequence: 1 (hooks) → 2 (FileViewer+Shiki) → 3 (MarkdownViewer) → 4 (Mermaid) → 5 (DiffViewer). Phase 2 must complete before 3-5.
**Action Required**: Do not parallelize viewer implementations
**Affects Phases**: All

---

### High Discovery 05: Headless Hook Pattern Mirrors useBoardState
**Impact**: High
**Sources**: [I1-02, I1-08]
**Problem**: Need consistent hook architecture for testability
**Solution**: Follow existing `useBoardState` pattern: pure state management, `useCallback` for mutations, deep cloning for immutability.
**Example**:
```typescript
// apps/web/src/hooks/useFileViewerState.ts
export function useFileViewerState(initialFile: ViewerFile) {
  const [file, setFile] = useState(initialFile);
  const [showLineNumbers, setShowLineNumbers] = useState(true);

  const toggleLineNumbers = useCallback(() => {
    setShowLineNumbers(prev => !prev);
  }, []);

  return { file, showLineNumbers, toggleLineNumbers, setFile };
}
```
**Action Required**: Phase 1 hooks must follow this exact pattern
**Affects Phases**: Phase 1

---

### High Discovery 06: DiffViewer Requires Git Availability Check
**Impact**: High
**Sources**: [I1-06, R1-07]
**Problem**: DiffViewer needs `git diff` command. Git may not be available in all deployments.
**Solution**: Server action checks git availability; returns appropriate error state.
**Example**:
```typescript
// apps/web/src/actions/get-git-diff.ts
'use server';
export async function getGitDiff(filePath: string): Promise<{
  diff: string | null;
  error: 'not-git' | 'no-changes' | 'git-not-available' | null;
}> {
  try {
    // Check git available: execSync('which git')
    // Check in repo: execSync('git rev-parse --git-dir')
    // Get diff: execSync(`git diff "${filePath}"`)
  } catch (e) {
    return { diff: null, error: 'git-not-available' };
  }
}
```
**Action Required**: Phase 5 must implement graceful error handling
**Affects Phases**: Phase 5

---

### High Discovery 07: Mermaid React 19 Compatibility Risk
**Impact**: High
**Sources**: [I1-07, R1-03]
**Problem**: Mermaid library may have issues with React 19's rendering model
**Solution**: Start Phase 4 with a spike task to verify compatibility. Have fallback ready.
**Action Required**: Phase 4 first task is a compatibility spike
**Affects Phases**: Phase 4

---

### High Discovery 08: Line Numbers CSS Counter Approach
**Impact**: High
**Sources**: [I1-05]
**Problem**: Line numbers must not copy with code selection
**Solution**: Use CSS counter with `user-select: none` on counter pseudo-element
**Example**:
```css
pre { counter-reset: line; }
code .line::before {
  counter-increment: line;
  content: counter(line);
  user-select: none;  /* Not copied with code */
}
```
**Action Required**: Phase 2 must implement CSS counters correctly
**Affects Phases**: Phase 2

---

### Medium Discovery 09: Container Query Fallback Required
**Impact**: Medium
**Sources**: [I1-10, R1-06]
**Problem**: Container queries not supported in older browsers (Safari 15, etc.)
**Solution**: Progressive enhancement - media query fallback first, container query enhancement second
**Action Required**: Phase 6 must include fallback strategies
**Affects Phases**: Phase 6

---

### Medium Discovery 10: Component Directory Structure
**Impact**: Medium
**Sources**: [I1-09]
**Problem**: New viewer components need consistent location
**Solution**: Create `apps/web/src/components/viewers/` following kanban/workflow pattern
**Action Required**: Create directory structure in Phase 2
**Affects Phases**: Phase 2, 3, 5

---

## Testing Philosophy

### Testing Approach

**Selected Approach**: Full TDD
**Rationale**: Headless-first architecture requires comprehensive test coverage. All hooks must be testable without DOM.

### Test-Driven Development

Follow RED-GREEN-REFACTOR cycle per constitution:
- **RED**: Write test first, verify it fails
- **GREEN**: Implement minimal code to pass test
- **REFACTOR**: Improve code quality while keeping tests green

### Test Documentation

Every test must include Test Doc comment block:
```typescript
it('should detect language from filename', () => {
  /*
  Test Doc:
  - Why: Language detection enables correct syntax highlighting
  - Contract: useFileViewerState auto-detects language from file extension
  - Usage Notes: Pass ViewerFile with filename; language field is computed
  - Quality Contribution: Catches incorrect language mapping that breaks highlighting
  - Worked Example: { filename: 'test.ts' } → language: 'typescript'
  */
  // Test implementation
});
```

### Mock Usage

**Policy**: Fakes Only (per Constitution Principle 4)

Per the project constitution, we use **full fake implementations** instead of mocking libraries. This applies to all dependencies including browser APIs.

**Required Fakes**:
- `FakeMatchMedia` - Fake implementation for `window.matchMedia` testing
- `FakeResizeObserver` - Fake implementation for container query testing
- `FakeDiffAction` - Fake implementation for git diff server action testing

**Prohibited**:
- `vi.mock()`, `vi.fn()`, `vi.spyOn()` for any modules
- Mocking Shiki/Mermaid internals
- Mocking react-markdown behavior
- Direct browser API stubbing without fake class

**Fake Pattern Example**:
```typescript
// test/fakes/fake-match-media.ts
export class FakeMatchMedia {
  private width: number;
  private listeners: Map<string, Set<(e: MediaQueryListEvent) => void>> = new Map();

  constructor(initialWidth: number = 1024) {
    this.width = initialWidth;
  }

  // Implement window.matchMedia interface
  matchMedia(query: string): MediaQueryList {
    const matches = this.evaluateQuery(query);
    return {
      matches,
      media: query,
      addEventListener: (type: string, listener: (e: MediaQueryListEvent) => void) => {
        if (!this.listeners.has(query)) this.listeners.set(query, new Set());
        this.listeners.get(query)!.add(listener);
      },
      removeEventListener: (type: string, listener: (e: MediaQueryListEvent) => void) => {
        this.listeners.get(query)?.delete(listener);
      },
    } as MediaQueryList;
  }

  // Test helper: simulate viewport resize
  setWidth(newWidth: number): void {
    this.width = newWidth;
    // Notify all listeners of change
    this.listeners.forEach((listeners, query) => {
      const matches = this.evaluateQuery(query);
      listeners.forEach(listener => listener({ matches, media: query } as MediaQueryListEvent));
    });
  }

  private evaluateQuery(query: string): boolean {
    // Parse min-width/max-width queries
    const minMatch = query.match(/min-width:\s*(\d+)px/);
    const maxMatch = query.match(/max-width:\s*(\d+)px/);
    if (minMatch) return this.width >= parseInt(minMatch[1]);
    if (maxMatch) return this.width <= parseInt(maxMatch[1]);
    return false;
  }
}
```

---

## Phase 1: Headless Viewer Hooks

**Objective**: Create pure logic hooks for all three viewers using TDD, ensuring testability without DOM rendering.

**Deliverables**:
- `useFileViewerState` hook with language detection
- `useMarkdownViewerState` hook with mode toggle
- `useDiffViewerState` hook with view mode and loading state
- Comprehensive unit tests (>90% coverage)

**Dependencies**: None (foundational phase)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Hook API design issues | Low | Medium | Follow useBoardState pattern exactly |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.1 | [ ] | Create ViewerFile interface in shared package | 1 | Interface exported from `@chainglass/shared/interfaces/viewer.interface.ts` | - | `{ path, filename, content }` per Shared by Default principle |
| 1.2 | [ ] | Write tests for `useFileViewerState` | 2 | Tests cover: state init, language detection, theme, lineNumbers toggle | - | RED phase |
| 1.3 | [ ] | Implement `useFileViewerState` to pass tests | 2 | All tests from 1.2 pass | - | GREEN phase |
| 1.4 | [ ] | Write tests for `useMarkdownViewerState` | 2 | Tests cover: extends FileViewer, mode toggle, mode persistence | - | RED phase |
| 1.5 | [ ] | Implement `useMarkdownViewerState` to pass tests | 2 | All tests from 1.4 pass | - | GREEN phase |
| 1.6 | [ ] | Write tests for `useDiffViewerState` | 2 | Tests cover: viewMode toggle, loading state, error states | - | RED phase |
| 1.7 | [ ] | Implement `useDiffViewerState` to pass tests | 2 | All tests from 1.6 pass | - | GREEN phase |
| 1.8 | [ ] | Create language detection utility | 1 | Maps 20+ extensions to Shiki language names | - | Shared by all hooks |
| 1.9 | [ ] | Refactor hooks for code quality | 1 | Consistent patterns, proper memoization | - | REFACTOR phase |

### Test Examples (Write First!)

```typescript
// apps/web/src/hooks/__tests__/useFileViewerState.test.ts
import { renderHook, act } from '@testing-library/react';
import { useFileViewerState } from '../useFileViewerState';
import type { ViewerFile } from '@chainglass/shared';

describe('useFileViewerState', () => {
  const sampleFile: ViewerFile = {
    path: 'src/components/Button.tsx',
    filename: 'Button.tsx',
    content: 'export function Button() { return <button>Click</button>; }',
  };

  test('should auto-detect language from filename', () => {
    /*
    Test Doc:
    - Why: Language detection enables correct Shiki highlighting
    - Contract: Hook derives language from filename extension
    - Usage Notes: No language param needed; computed internally
    - Quality Contribution: Catches mapping errors breaking highlighting
    - Worked Example: Button.tsx → typescript
    */
    const { result } = renderHook(() => useFileViewerState(sampleFile));

    expect(result.current.language).toBe('tsx');
  });

  test('should toggle line numbers', () => {
    /*
    Test Doc:
    - Why: Users may want to hide line numbers
    - Contract: toggleLineNumbers flips showLineNumbers state
    - Usage Notes: Default is true (show line numbers)
    - Quality Contribution: Catches broken toggle logic
    - Worked Example: showLineNumbers: true → toggleLineNumbers() → false
    */
    const { result } = renderHook(() => useFileViewerState(sampleFile));

    expect(result.current.showLineNumbers).toBe(true);

    act(() => {
      result.current.toggleLineNumbers();
    });

    expect(result.current.showLineNumbers).toBe(false);
  });
});
```

### Non-Happy-Path Test Examples

These tests MUST be written during Phase 1 to ensure robust error handling:

```typescript
// Non-happy-path tests for useFileViewerState
describe('useFileViewerState error handling', () => {
  test('should handle undefined file gracefully', () => {
    /*
    Test Doc:
    - Why: Components may receive undefined during async loading
    - Contract: Hook returns safe defaults when file is undefined
    - Usage Notes: Check for undefined before rendering content
    - Quality Contribution: Prevents null pointer exceptions
    - Worked Example: undefined → language: 'text', content: ''
    */
    const { result } = renderHook(() => useFileViewerState(undefined as any));

    expect(result.current.language).toBe('text');
    expect(result.current.file?.content).toBe('');
  });

  test('should default to text for unknown file extensions', () => {
    /*
    Test Doc:
    - Why: Users may load files with unusual extensions
    - Contract: Unknown extensions fall back to 'text' language
    - Usage Notes: Still renders content, just without highlighting
    - Quality Contribution: Prevents crashes from unknown file types
    - Worked Example: .xyz → language: 'text'
    */
    const unknownFile: ViewerFile = {
      path: 'data/config.xyz',
      filename: 'config.xyz',
      content: 'some content',
    };

    const { result } = renderHook(() => useFileViewerState(unknownFile));

    expect(result.current.language).toBe('text');
  });

  test('should handle empty content without error', () => {
    /*
    Test Doc:
    - Why: Empty files are valid and should render
    - Contract: Empty content displays without errors
    - Usage Notes: Line numbers show "1" for empty file
    - Quality Contribution: Catches edge case rendering bugs
    - Worked Example: content: '' → renders empty viewer
    */
    const emptyFile: ViewerFile = {
      path: 'empty.ts',
      filename: 'empty.ts',
      content: '',
    };

    const { result } = renderHook(() => useFileViewerState(emptyFile));

    expect(result.current.file.content).toBe('');
    expect(result.current.language).toBe('typescript');
  });
});

// Non-happy-path tests for useMarkdownViewerState
describe('useMarkdownViewerState edge cases', () => {
  test('should maintain mode consistency after rapid toggles', () => {
    /*
    Test Doc:
    - Why: Rapid clicking could cause state inconsistency
    - Contract: Mode always reflects last toggle action
    - Usage Notes: No debouncing needed; state is synchronous
    - Quality Contribution: Catches race condition bugs
    - Worked Example: toggle 5x rapidly → isPreviewMode stable
    */
    const { result } = renderHook(() => useMarkdownViewerState(sampleFile));

    act(() => {
      for (let i = 0; i < 5; i++) {
        result.current.toggleMode();
      }
    });

    // Odd number of toggles from false → true
    expect(result.current.isPreviewMode).toBe(true);
  });
});
```

### Acceptance Criteria

- [ ] AC-29: useFileViewerState accepts ViewerFile object
- [ ] AC-30: Language auto-detected from filename extension
- [ ] AC-31: useMarkdownViewerState has mode toggle
- [ ] AC-32: useDiffViewerState manages viewMode, diffData, isLoading, error
- [ ] AC-33: All hooks testable without DOM
- [ ] AC-34: >90% test coverage

---

## Phase 2: FileViewer Component

**Objective**: Create the foundational FileViewer component with Shiki server-side syntax highlighting and CSS counter line numbers.

**Deliverables**:
- Server-side Shiki processing utility
- FileViewer React component with line numbers
- Theme integration with next-themes
- Keyboard navigation (arrow keys, Home/End)

**Dependencies**: Phase 1 complete

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Shiki client bundle creep | Medium | High | Strict server-only imports; verify with bundle analyzer |
| CSS counter cross-browser | Low | Low | Test in Safari, Firefox, Chrome |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Create `apps/web/src/components/viewers/` directory | 1 | Directory structure per I1-09 | - | |
| 2.2 | [ ] | Create server-side Shiki utility | 2 | `highlightCode()` async function in `lib/server/` | - | Critical: server-only |
| 2.3 | [ ] | Write integration tests for FileViewer | 2 | Tests cover: rendering, line numbers, theme, languages | - | RED phase |
| 2.4 | [ ] | Implement FileViewer component | 3 | All tests from 2.3 pass; CSS counter line numbers | - | GREEN phase |
| 2.5 | [ ] | Implement keyboard navigation | 2 | Arrow keys scroll, Home/End jump to start/end | - | Accessibility |
| 2.6 | [ ] | Add ARIA labels and focus management | 1 | Screen reader compatible | - | AC-7 |
| 2.7 | [ ] | Verify Shiki not in client bundle | 1 | Run `ANALYZE=true pnpm build` → Shiki shows 0B in client bundle | - | Critical: Shiki must be server-only |
| 2.8 | [ ] | Test with 15+ languages | 2 | TypeScript, Python, C#, Go, Rust, etc. all highlight correctly | - | AC-3 |

### Test Examples

```typescript
// apps/web/src/components/viewers/__tests__/FileViewer.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileViewer } from '../FileViewer';
import type { ViewerFile } from '@chainglass/shared';

describe('FileViewer', () => {
  const typescriptFile: ViewerFile = {
    path: 'src/utils.ts',
    filename: 'utils.ts',
    content: 'export const add = (a: number, b: number): number => a + b;',
  };

  test('should display line numbers', () => {
    /*
    Test Doc:
    - Why: Line numbers help users navigate code
    - Contract: Line numbers visible, use CSS counter approach
    - Usage Notes: Line numbers not copied when selecting code
    - Quality Contribution: Catches line number rendering issues
    - Worked Example: 3-line file shows "1", "2", "3" in gutter
    */
    render(<FileViewer file={typescriptFile} />);

    // Verify line number structure exists
    const codeElement = screen.getByRole('code');
    expect(codeElement).toHaveClass('line-numbers');
  });

  test('should respond to keyboard navigation', async () => {
    /*
    Test Doc:
    - Why: Accessibility requires keyboard navigation
    - Contract: Home jumps to start, End jumps to end
    - Usage Notes: FileViewer must be focused first
    - Quality Contribution: Catches keyboard accessibility regressions
    - Worked Example: Press Home → scrollTop becomes 0
    */
    const user = userEvent.setup();
    render(<FileViewer file={typescriptFile} />);

    const viewer = screen.getByRole('region', { name: /code viewer/i });
    await user.click(viewer); // Focus
    await user.keyboard('{Home}');

    expect(viewer.scrollTop).toBe(0);
  });
});
```

### Acceptance Criteria

- [ ] AC-1: FileViewer displays any text file with line numbers
- [ ] AC-2: Line numbers use CSS counter approach
- [ ] AC-2b: Line numbers not copied when selecting code (verified via CSS `user-select: none`)
- [ ] AC-3: Syntax highlighting for 15+ languages
- [ ] AC-4: Theme matches light/dark mode
- [ ] AC-5: Highlighting occurs server-side
- [ ] AC-6: Keyboard navigation works
- [ ] AC-7: Accessible with ARIA labels

---

## Phase 3: MarkdownViewer Component

**Objective**: Extend FileViewer with source/preview toggle and markdown rendering via react-markdown.

**Deliverables**:
- MarkdownViewer component with mode toggle
- Preview mode with GFM support (tables, task lists)
- Code fence syntax highlighting (reuses Phase 2)
- Prose styling via @tailwindcss/typography

**Dependencies**: Phase 2 complete

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| react-markdown React 19 issues | Low | Medium | Pin version, test early |
| Code fence highlighting mismatch | Low | Low | Reuse Shiki processor from Phase 2 |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Write tests for MarkdownViewer | 2 | Tests cover: source mode, preview mode, toggle, GFM features | - | RED phase |
| 3.2 | [ ] | Implement MarkdownViewer source mode | 2 | Reuses FileViewer for raw markdown display | - | |
| 3.3 | [ ] | Add react-markdown for preview mode | 2 | Renders formatted markdown | - | |
| 3.4 | [ ] | Add remark-gfm for tables and task lists | 2 | GFM features work in preview | - | AC-11 |
| 3.5 | [ ] | Create custom code block renderer | 2 | Uses Shiki highlighting in preview mode | - | AC-12 |
| 3.6 | [ ] | Add prose styling with @tailwindcss/typography | 1 | Beautiful typography in preview | - | |
| 3.7 | [ ] | Implement mode toggle with persistence | 2 | Toggle state persists within session | - | AC-13 |
| 3.8 | [ ] | Add toggle button UI | 1 | Source/Preview buttons visible | - | AC-8 |

### Test Examples

```typescript
describe('MarkdownViewer', () => {
  const markdownFile: ViewerFile = {
    path: 'docs/README.md',
    filename: 'README.md',
    content: '# Hello World\n\nThis is a **test**.\n\n```typescript\nconst x = 1;\n```',
  };

  test('should toggle between source and preview modes', async () => {
    /*
    Test Doc:
    - Why: Users need both raw and rendered views
    - Contract: Toggle button switches between modes
    - Usage Notes: Default is source mode
    - Quality Contribution: Catches mode toggle state issues
    - Worked Example: Click "Preview" → shows rendered markdown
    */
    const user = userEvent.setup();
    render(<MarkdownViewer file={markdownFile} />);

    // Default: source mode (line numbers visible)
    expect(screen.getByRole('code')).toBeInTheDocument();

    // Toggle to preview
    await user.click(screen.getByRole('button', { name: /preview/i }));

    // Now shows rendered content
    expect(screen.getByRole('heading', { name: 'Hello World' })).toBeInTheDocument();
  });

  test('should render GFM tables in preview mode', async () => {
    /*
    Test Doc:
    - Why: GitHub Flavored Markdown includes tables
    - Contract: GFM tables render as HTML tables
    - Usage Notes: Requires remark-gfm plugin
    - Quality Contribution: Catches GFM feature regressions
    - Worked Example: | A | B | renders as <table>
    */
    const tableFile: ViewerFile = {
      path: 'table.md',
      filename: 'table.md',
      content: '| Column A | Column B |\n|----------|----------|\n| Value 1 | Value 2 |',
    };

    render(<MarkdownViewer file={tableFile} initialMode="preview" />);

    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
```

### Acceptance Criteria

- [ ] AC-8: Source and Preview mode toggle buttons
- [ ] AC-9: Source mode shows raw markdown with line numbers
- [ ] AC-10: Preview mode renders formatted markdown
- [ ] AC-11: GFM support (tables, task lists, strikethrough)
- [ ] AC-12: Code fences in preview have syntax highlighting
- [ ] AC-13: Toggle state persists within session

---

## Phase 4: Mermaid Integration

**Objective**: Add Mermaid diagram rendering to MarkdownViewer preview mode with graceful error handling.

**Deliverables**:
- Mermaid code fence detection and rendering
- Flowchart, sequence, and state diagram support
- Theme-aware diagrams (light/dark)
- Error handling for invalid syntax

**Dependencies**: Phase 3 complete

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Mermaid React 19 compatibility | Medium | High | Spike task first; fallback ready |
| Hydration mismatch | Medium | Medium | Static SVG rendering; no client JS |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | **SPIKE**: Test Mermaid React 19 compatibility | 2 | Render simple diagram; verify no errors | - | CRITICAL: Must pass before continuing |
| 4.2 | [ ] | Write tests for Mermaid rendering | 2 | Tests cover: flowchart, sequence, error handling | - | RED phase |
| 4.3 | [ ] | Create Mermaid code fence handler | 2 | Detects ```mermaid fences | - | |
| 4.4 | [ ] | Implement Mermaid to SVG conversion | 2 | Converts Mermaid syntax to SVG | - | AC-14 |
| 4.5 | [ ] | Add theme support for diagrams | 2 | Light/dark diagrams match app theme | - | AC-16 |
| 4.6 | [ ] | Add error boundary for invalid syntax | 2 | Shows helpful error message | - | AC-17 |
| 4.7 | [ ] | Ensure async/non-blocking rendering | 1 | Diagrams don't block page load | - | AC-18 |
| 4.8 | [ ] | Test flowchart, sequence, state diagrams | 2 | Common diagram types render correctly | - | AC-15 |

### Spike Task Details

```typescript
// Phase 4.1 Spike: Verify Mermaid React 19 compatibility
// Create apps/web/src/test-mermaid-spike.tsx (temporary file)

// Success criteria:
// 1. Diagram renders without console errors
// 2. No hydration mismatch warnings
// 3. Theme switching works (light → dark → light)
// 4. Invalid syntax shows error, doesn't crash

const spikeContent = `
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Option 1]
    B -->|No| D[Option 2]
`;
```

**Spike Fallback Strategy**: If Mermaid React 19 is incompatible:
1. Try `mermaid-isomorphic` for server-side SVG generation
2. If that fails, fall back to static image placeholder with link to mermaid.live
3. Document limitation in viewer patterns

### Test Examples

```typescript
describe('MermaidRenderer', () => {
  test('should render flowchart diagram as SVG', () => {
    /*
    Test Doc:
    - Why: Flowcharts are most common Mermaid diagram type
    - Contract: Mermaid syntax → SVG element in DOM
    - Usage Notes: SVG is rendered async; use findBy queries
    - Quality Contribution: Catches Mermaid parsing/rendering failures
    - Worked Example: graph TD A-->B → <svg> element
    */
    const flowchartContent = 'graph TD\n    A[Start] --> B[End]';

    render(<MermaidRenderer content={flowchartContent} />);

    expect(await screen.findByRole('img', { name: /diagram/i })).toBeInTheDocument();
  });

  test('should display error message for invalid Mermaid syntax', () => {
    /*
    Test Doc:
    - Why: Invalid syntax should not crash the application
    - Contract: Invalid Mermaid shows error message, not exception
    - Usage Notes: Error boundary catches rendering failures
    - Quality Contribution: Prevents crashes from user content
    - Worked Example: 'invalid syntax here' → "Unable to render diagram"
    */
    const invalidContent = 'this is not valid mermaid syntax {{{';

    render(<MermaidRenderer content={invalidContent} />);

    expect(await screen.findByText(/unable to render diagram/i)).toBeInTheDocument();
  });

  test('should respect theme changes for diagrams', async () => {
    /*
    Test Doc:
    - Why: Diagrams must match application theme
    - Contract: Theme change → diagram re-renders with new colors
    - Usage Notes: Uses next-themes context for theme detection
    - Quality Contribution: Catches theme synchronization issues
    - Worked Example: dark mode → dark background SVG
    */
    const { rerender } = render(
      <ThemeProvider theme="light">
        <MermaidRenderer content="graph TD\n    A-->B" />
      </ThemeProvider>
    );

    const lightSvg = await screen.findByRole('img');
    expect(lightSvg).toHaveAttribute('data-theme', 'light');

    rerender(
      <ThemeProvider theme="dark">
        <MermaidRenderer content="graph TD\n    A-->B" />
      </ThemeProvider>
    );

    const darkSvg = await screen.findByRole('img');
    expect(darkSvg).toHaveAttribute('data-theme', 'dark');
  });
});
```

### Acceptance Criteria

- [ ] AC-14: Mermaid fences render as SVG diagrams
- [ ] AC-15: Flowcharts, sequence, state diagrams work
- [ ] AC-16: Diagrams respect light/dark theme
- [ ] AC-17: Invalid syntax shows helpful error
- [ ] AC-18: Rendering is async/non-blocking

---

## Phase 5: DiffViewer Component

**Objective**: Create DiffViewer component with GitHub-style split/unified views using @git-diff-view/react.

**Deliverables**:
- DiffViewer component with split and unified modes
- Git diff server action with error handling
- Shiki integration via @git-diff-view/shiki
- Graceful handling of no git / no changes

**Dependencies**: Phase 2 complete (Shiki infrastructure)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| @git-diff-view React 19 | Low | Medium | Test early; wrap in error boundary |
| Git not available | Low | Low | Graceful error messages |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Create IGitDiffService interface + FakeDiffAction | 2 | Interface in `@chainglass/shared`, fake with test helpers | - | Interface-first per constitution |
| 5.2 | [ ] | Create git diff server action | 2 | `getGitDiff()` implements interface, returns diff or error state | - | |
| 5.3 | [ ] | Write tests for DiffViewer using FakeDiffAction | 2 | Tests cover: split, unified, no-git, no-changes | - | RED phase, uses fake not mock |
| 5.4 | [ ] | Install and configure @git-diff-view packages | 1 | @git-diff-view/react and @git-diff-view/shiki installed | - | |
| 5.5 | [ ] | Implement DiffViewer with split mode | 2 | Side-by-side diff display | - | AC-21 |
| 5.6 | [ ] | Add unified mode | 2 | Single column +/- display | - | AC-22 |
| 5.7 | [ ] | Add mode toggle button | 1 | Toggle between split/unified | - | AC-23 |
| 5.8 | [ ] | Integrate Shiki highlighting | 2 | Diff has syntax highlighting | - | AC-24 |
| 5.9 | [ ] | Handle no-git and no-changes states | 2 | Appropriate messages displayed | - | AC-26, AC-27 |
| 5.10 | [ ] | Add theme support | 1 | Matches light/dark mode | - | AC-25 |

### Test Examples

```typescript
// test/fakes/fake-diff-action.ts
import type { DiffResult } from '@chainglass/shared';

/**
 * Fake implementation of git diff server action for testing.
 * Per constitution: use fakes, not vi.mock().
 */
export class FakeDiffAction {
  private result: DiffResult;

  constructor(result: DiffResult = { diff: null, error: null }) {
    this.result = result;
  }

  // Simulates getGitDiff server action
  async getGitDiff(filePath: string): Promise<DiffResult> {
    return this.result;
  }

  // Test helpers
  setNotInGitRepo(): void {
    this.result = { diff: null, error: 'not-git' };
  }

  setNoChanges(): void {
    this.result = { diff: null, error: 'no-changes' };
  }

  setDiff(diff: string): void {
    this.result = { diff, error: null };
  }

  setGitNotAvailable(): void {
    this.result = { diff: null, error: 'git-not-available' };
  }
}

// apps/web/src/components/viewers/__tests__/DiffViewer.test.tsx
describe('DiffViewer', () => {
  const sampleFile: ViewerFile = {
    path: 'src/utils.ts',
    filename: 'utils.ts',
    content: 'const x = 1;',
  };

  test('should show "Not in git repository" when no git', async () => {
    /*
    Test Doc:
    - Why: DiffViewer needs graceful fallback without git
    - Contract: Shows error message instead of crashing
    - Usage Notes: Inject FakeDiffAction via prop; error state renders message
    - Quality Contribution: Prevents crashes in non-git environments
    - Worked Example: No git → "Not in git repository" message
    */
    const fakeDiffAction = new FakeDiffAction();
    fakeDiffAction.setNotInGitRepo();

    render(<DiffViewer file={sampleFile} diffAction={fakeDiffAction} />);

    expect(await screen.findByText(/not in git repository/i)).toBeInTheDocument();
  });

  test('should show "No changes" when file is unchanged', async () => {
    /*
    Test Doc:
    - Why: Unchanged files should show clear status
    - Contract: No diff → "No changes" message displayed
    - Usage Notes: Distinct from error states
    - Quality Contribution: Catches missing empty-diff handling
    - Worked Example: git diff returns empty → "No changes"
    */
    const fakeDiffAction = new FakeDiffAction();
    fakeDiffAction.setNoChanges();

    render(<DiffViewer file={sampleFile} diffAction={fakeDiffAction} />);

    expect(await screen.findByText(/no changes/i)).toBeInTheDocument();
  });

  test('should display split view by default', async () => {
    /*
    Test Doc:
    - Why: Split view is preferred for readability
    - Contract: Default viewMode is 'split'
    - Usage Notes: User can toggle to unified
    - Quality Contribution: Catches default mode regressions
    - Worked Example: Diff data → side-by-side view rendered
    */
    const fakeDiffAction = new FakeDiffAction();
    fakeDiffAction.setDiff('- old line\n+ new line');

    render(<DiffViewer file={sampleFile} diffAction={fakeDiffAction} />);

    expect(await screen.findByTestId('split-view')).toBeInTheDocument();
  });
});
```

### Acceptance Criteria

- [ ] AC-19: DiffViewer accepts ViewerFile input
- [ ] AC-20: Runs git diff on file path
- [ ] AC-21: Split view with side-by-side display
- [ ] AC-22: Unified view with +/- markers
- [ ] AC-23: Toggle between modes
- [ ] AC-24: Shiki syntax highlighting
- [ ] AC-25: Theme matches app mode
- [ ] AC-26: "Not in git" message
- [ ] AC-27: "No changes" message
- [ ] AC-28: Virtual scrolling for large diffs

---

## Phase 6: Responsive Infrastructure

**Objective**: Create three-tier responsive system with useResponsive hook and container query support, without breaking existing sidebar.

**Deliverables**:
- `useResponsive()` hook with phone/tablet/desktop detection
- Container query patterns and utilities
- Documentation of responsive patterns
- Backward compatibility with `useIsMobile()`

**Dependencies**: None (can run in parallel with Phase 3-5)

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Hydration mismatch | High | High | SSR-safe initialization per R1-09 |
| Breaking sidebar | High | Critical | New hook; never touch MOBILE_BREAKPOINT |
| Container query support | Low | Medium | Progressive enhancement fallbacks |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 6.0 | [ ] | Create FakeMatchMedia and FakeResizeObserver | 2 | Fakes in `test/fakes/` with test helpers per constitution | - | Required for testing |
| 6.1 | [ ] | Write tests for useResponsive hook using fakes | 2 | Tests cover: all tiers, SSR handling, resize | - | RED phase; uses FakeMatchMedia |
| 6.2 | [ ] | Implement useResponsive hook with injectable matchMedia | 3 | SSR-safe, three tiers, accepts matchMedia factory | - | GREEN phase; CRITICAL |
| 6.3 | [ ] | Verify useIsMobile unchanged | 1 | Existing tests still pass | - | Backward compat check |
| 6.4 | [ ] | Verify sidebar still works | 1 | Manual test: mobile/desktop sidebar behavior | - | Critical check |
| 6.5 | [ ] | Add container query utilities | 2 | @container variants available | - | AC-40 |
| 6.6 | [ ] | Add progressive enhancement fallbacks | 2 | Media query fallback for old browsers | - | AC-41 |
| 6.7 | [ ] | Create example container query component | 2 | Demonstrates pattern usage | - | AC-42 |
| 6.8 | [ ] | Document responsive patterns | 2 | Patterns documented in docs/how/ | - | AC-47 |

### Test Examples

```typescript
import { FakeMatchMedia } from 'test/fakes/fake-match-media';

describe('useResponsive', () => {
  let fakeMatchMedia: FakeMatchMedia;

  beforeEach(() => {
    fakeMatchMedia = new FakeMatchMedia(1024); // Default to desktop
    // Inject fake into hook via factory (see useResponsive implementation)
  });

  test('should return undefined during SSR', () => {
    /*
    Test Doc:
    - Why: Server doesn't know viewport size
    - Contract: Hook returns undefined values during SSR
    - Usage Notes: Components should handle undefined state
    - Quality Contribution: Catches hydration mismatch bugs
    - Worked Example: SSR → deviceType: undefined
    */
    // Test SSR by not providing matchMedia at all
    const { result } = renderHook(() => useResponsive({ matchMedia: undefined }));

    expect(result.current.deviceType).toBeUndefined();
    expect(result.current.isPhone).toBe(false);
    expect(result.current.isTablet).toBe(false);
    expect(result.current.isDesktop).toBe(false);
  });

  test('should detect phone viewport', () => {
    /*
    Test Doc:
    - Why: Need to identify phone-sized devices
    - Contract: Viewport <768px → isPhone: true
    - Usage Notes: useMobilePatterns is true only for phones
    - Quality Contribution: Catches breakpoint calculation errors
    - Worked Example: 400px width → isPhone: true, useMobilePatterns: true
    */
    fakeMatchMedia.setWidth(400);

    const { result } = renderHook(() =>
      useResponsive({ matchMedia: fakeMatchMedia.matchMedia.bind(fakeMatchMedia) })
    );

    expect(result.current.isPhone).toBe(true);
    expect(result.current.useMobilePatterns).toBe(true);
    expect(result.current.deviceType).toBe('phone');
  });

  test('should detect tablet viewport', () => {
    /*
    Test Doc:
    - Why: Tablets use desktop patterns per spec
    - Contract: Viewport 768-1023px → isTablet: true, useMobilePatterns: false
    - Usage Notes: Tablet defaults to desktop navigation patterns
    - Quality Contribution: Catches incorrect tablet classification
    - Worked Example: 900px width → isTablet: true, useMobilePatterns: false
    */
    fakeMatchMedia.setWidth(900);

    const { result } = renderHook(() =>
      useResponsive({ matchMedia: fakeMatchMedia.matchMedia.bind(fakeMatchMedia) })
    );

    expect(result.current.isTablet).toBe(true);
    expect(result.current.useMobilePatterns).toBe(false); // Tablet uses desktop patterns
    expect(result.current.deviceType).toBe('tablet');
  });

  test('should trigger re-render on viewport resize', async () => {
    /*
    Test Doc:
    - Why: Dynamic viewport changes must update state
    - Contract: Resize triggers listener → state updates
    - Usage Notes: Uses FakeMatchMedia.setWidth() to simulate
    - Quality Contribution: Catches missing resize listeners
    - Worked Example: 400px → 1200px → isDesktop becomes true
    */
    fakeMatchMedia.setWidth(400);

    const { result } = renderHook(() =>
      useResponsive({ matchMedia: fakeMatchMedia.matchMedia.bind(fakeMatchMedia) })
    );

    expect(result.current.isPhone).toBe(true);

    // Simulate resize to desktop
    act(() => {
      fakeMatchMedia.setWidth(1200);
    });

    expect(result.current.isDesktop).toBe(true);
    expect(result.current.isPhone).toBe(false);
  });
});
```

### Acceptance Criteria

- [ ] AC-35: Three-tier breakpoint system
- [ ] AC-36: useResponsive provides all device properties
- [ ] AC-36b: useResponsive initializes with `useState<number | undefined>(undefined)` for SSR safety
- [ ] AC-37: useMobilePatterns true only for phones
- [ ] AC-38: useIsMobile unchanged (backward compat)
- [ ] AC-39: Breakpoint changes trigger re-renders
- [ ] AC-40: Container query utility available
- [ ] AC-41: Container queries work independently
- [ ] AC-42: Example component demonstrates pattern

---

## Phase 7: Mobile Templates & Documentation

**Objective**: Create mobile navigation templates and comprehensive documentation for viewer and responsive patterns.

**Deliverables**:
- Mobile bottom tab bar component
- Navigation pattern utilities
- Documentation for viewer patterns
- Documentation for responsive patterns

**Dependencies**: Phase 6 complete

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Documentation drift | Medium | Low | Include doc updates in PR acceptance |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 7.1 | [ ] | Write tests for bottom tab bar | 2 | Tests cover: touch targets, active state, navigation | - | RED phase |
| 7.2 | [ ] | Implement BottomTabBar component | 2 | Phone-only navigation template | - | AC-43 |
| 7.3 | [ ] | Verify touch targets ≥48px | 1 | All interactive elements meet minimum | - | AC-46 |
| 7.4 | [ ] | Create navigation pattern utilities | 2 | Phone vs desktop paradigm helpers | - | AC-45 |
| 7.5 | [ ] | Document viewer patterns in docs/how/ | 2 | FileViewer, MarkdownViewer, DiffViewer docs | - | |
| 7.6 | [ ] | Document responsive patterns in docs/how/ | 2 | useResponsive, container queries docs | - | AC-47 |
| 7.7 | [ ] | Verify tablet defaults to desktop | 1 | Tablet uses sidebar, not bottom tab | - | AC-44 |

### Test Examples

```typescript
import { FakeMatchMedia } from 'test/fakes/fake-match-media';

describe('BottomTabBar', () => {
  let fakeMatchMedia: FakeMatchMedia;

  beforeEach(() => {
    fakeMatchMedia = new FakeMatchMedia(400); // Phone viewport
  });

  test('should have touch targets at least 48px', () => {
    /*
    Test Doc:
    - Why: Mobile accessibility requires 48px minimum touch targets
    - Contract: All tab buttons have min-width and min-height ≥48px
    - Usage Notes: Check computed styles, not just classes
    - Quality Contribution: Catches accessibility violations
    - Worked Example: Tab button → 48x48px minimum
    */
    render(<BottomTabBar tabs={mockTabs} />);

    const tabButtons = screen.getAllByRole('tab');

    tabButtons.forEach(button => {
      const styles = window.getComputedStyle(button);
      expect(parseInt(styles.minWidth)).toBeGreaterThanOrEqual(48);
      expect(parseInt(styles.minHeight)).toBeGreaterThanOrEqual(48);
    });
  });

  test('should show active state for current tab', () => {
    /*
    Test Doc:
    - Why: Users need visual feedback for current location
    - Contract: Active tab has aria-selected="true" and distinct styling
    - Usage Notes: Use activeTab prop to control state
    - Quality Contribution: Catches missing active state indicators
    - Worked Example: activeTab="home" → home tab highlighted
    */
    render(<BottomTabBar tabs={mockTabs} activeTab="home" />);

    const homeTab = screen.getByRole('tab', { name: /home/i });
    const otherTab = screen.getByRole('tab', { name: /settings/i });

    expect(homeTab).toHaveAttribute('aria-selected', 'true');
    expect(otherTab).toHaveAttribute('aria-selected', 'false');
  });

  test('should call onTabChange when tab is pressed', async () => {
    /*
    Test Doc:
    - Why: Navigation must work via tab bar
    - Contract: Tab press → onTabChange callback with tab id
    - Usage Notes: Callback receives tab identifier string
    - Quality Contribution: Catches broken navigation handlers
    - Worked Example: Press "settings" → onTabChange("settings")
    */
    const onTabChange = vi.fn();
    const user = userEvent.setup();

    render(<BottomTabBar tabs={mockTabs} activeTab="home" onTabChange={onTabChange} />);

    await user.click(screen.getByRole('tab', { name: /settings/i }));

    expect(onTabChange).toHaveBeenCalledWith('settings');
  });

  test('should not render on tablet or desktop viewports', () => {
    /*
    Test Doc:
    - Why: Bottom tab bar is phone-only; tablets use sidebar
    - Contract: useMobilePatterns: false → component returns null
    - Usage Notes: Component internally checks useResponsive
    - Quality Contribution: Catches incorrect viewport rendering
    - Worked Example: 1024px viewport → no bottom tab bar
    */
    fakeMatchMedia.setWidth(1024); // Tablet/desktop

    render(
      <ResponsiveProvider matchMedia={fakeMatchMedia.matchMedia.bind(fakeMatchMedia)}>
        <BottomTabBar tabs={mockTabs} />
      </ResponsiveProvider>
    );

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});

const mockTabs = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'workflows', label: 'Workflows', icon: 'workflow' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
```

### Acceptance Criteria

- [ ] AC-43: Mobile navigation uses bottom tab bar
- [ ] AC-44: Tablet defaults to desktop patterns
- [ ] AC-45: Navigation utilities support both paradigms
- [ ] AC-46: Touch targets ≥48px
- [ ] AC-47: Component variant pattern documented

---

## Cross-Cutting Concerns

### Security Considerations

- **Input Validation**: All viewer content from trusted sources (spec assumption)
- **XSS Prevention**: react-markdown defaults provide sanitization
- **Git Command Injection**: Server action escapes file paths

### Observability

- **Logging**: Use existing ILogger for server actions
- **Error Tracking**: Graceful error states in all viewers
- **Performance**: Bundle analyzer to verify Shiki stays server-side

### Documentation

| Location | Content |
|----------|---------|
| README.md | Quick-start for viewers |
| docs/how/viewers/ | Detailed viewer patterns |
| docs/how/responsive/ | Responsive infrastructure guide |

### Performance

- [ ] AC-48: Shiki server-side only
- [ ] AC-49: Client bundle ≤50KB increase
- [ ] AC-50: Large files render without delay

### Integration

- [ ] AC-51: FileViewer works in NodeDetailPanel
- [ ] AC-52: MarkdownViewer works with source/preview
- [ ] AC-53: DiffViewer shows git diff
- [ ] AC-54: Responsive hooks available
- [ ] AC-55: Existing tests pass

### Quality Gates

**Exact Commands to Run**:
```bash
# AC-56: Run all tests with coverage
just test -- --coverage

# AC-57: TypeScript strict mode check
just typecheck

# AC-58: Biome linter check
just lint

# AC-59: Production build
just build

# Quick pre-commit validation
just fft  # fix, format, test

# Full quality suite
just check  # runs all of the above
```

**Acceptance Criteria**:
- [ ] AC-56: `just test` passes (all tests green, >90% coverage on new code)
- [ ] AC-57: `just typecheck` passes (zero TypeScript errors)
- [ ] AC-58: `just lint` passes (zero Biome errors)
- [ ] AC-59: `just build` passes (production build succeeds)

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| useResponsive hook | 3 | Medium | S=1,I=0,D=0,N=1,F=1,T=1 | SSR hydration complexity | Two-render pattern, extensive tests |
| Shiki integration | 3 | Medium | S=1,I=2,D=0,N=0,F=1,T=0 | External dependency, server boundary | Bundle analyzer verification |
| DiffViewer | 3 | Medium | S=1,I=2,D=0,N=1,F=0,T=1 | Git dependency, error handling | Graceful degradation |

---

## Progress Tracking

### Phase Completion Checklist

- [x] Phase 1: Headless Viewer Hooks - COMPLETE (78 tests passing)
- [ ] Phase 2: FileViewer Component - PENDING
- [ ] Phase 3: MarkdownViewer Component - PENDING
- [ ] Phase 4: Mermaid Integration - PENDING
- [ ] Phase 5: DiffViewer Component - PENDING
- [ ] Phase 6: Responsive Infrastructure - PENDING
- [ ] Phase 7: Mobile Templates & Documentation - PENDING

### STOP Rule

**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Change Footnotes Ledger

**NOTE**: This section tracks implementation changes and will be populated by `/plan-6a-update-progress`.

**Footnote Numbering Authority**: `/plan-6a-update-progress` is the **single source of truth** for footnote numbering across the entire plan.

**Pre-Implementation Revision Log**:

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-24 | Initial plan created |
| 1.1.0 | 2026-01-24 | Validation fixes: replaced vi.mock() with fakes, moved ViewerFile to shared, added test examples for Phase 4/7, added Quality Gate commands |

**Implementation Footnotes** (to be added during implementation):
<!-- Footnotes will be added here by plan-6a-update-progress as implementation progresses -->

---

*Plan Version 1.1.0 - Revised 2026-01-24*
*Next Step: Run `/plan-4-complete-the-plan` to re-validate after fixes*
