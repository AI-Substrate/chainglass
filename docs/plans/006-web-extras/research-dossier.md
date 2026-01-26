# Research Report: Enhanced Markdown Rendering and Mobile Templates

**Generated**: 2026-01-24
**Research Query**: "Enhanced capabilities for web site: Markdown rendering with code fences and Mermaid diagrams, mobile/tablet/phone templates with platform-adaptive components"
**Mode**: Pre-Plan
**FlowSpace**: Available
**Findings**: 46 codebase findings + 2 external research dossiers

---

## Executive Summary

### What It Does
The Chainglass web application is a Next.js 15 + React 19 + Tailwind CSS 4 dashboard with sophisticated component architecture, real-time SSE updates, and a theme system using `next-themes`. This research explores adding enhanced Markdown rendering and multi-tier responsive templates.

### Business Purpose
- **Markdown Rendering**: Enable rich content display (workflow descriptions, documentation, task details) with syntax highlighting and diagrams
- **Responsive Templates**: Improve UX across devices by adapting layouts appropriately for phones, tablets, and desktops

### Key Insights
1. **Architecture Ready**: Existing patterns (headless hooks, CVA variants, composable components) provide solid foundation
2. **Server Components Preferred**: Next.js 15 App Router favors processing Markdown server-side via Shiki/unified
3. **Container Queries Available**: Tailwind v4 native support enables component-level responsiveness
4. **Theme Integration Simple**: `next-themes` already configured; extends naturally to syntax highlighting themes

### Quick Stats
- **Web Components**: 35+ files in `apps/web/src/components/`
- **Dependencies**: React 19, Next.js 15.1.6, Tailwind 4.1.18, Radix UI, dnd-kit, ReactFlow
- **Test Coverage**: ~80% target for hooks; integration tests exist for main features
- **Breakpoint**: Single 768px breakpoint (needs extension for tablet support)
- **Prior Learnings**: 8 relevant documents in docs/plans/ and docs/adr/

---

## Current Web Application Architecture

### Entry Points

| Entry Point | Type | Location | Purpose |
|------------|------|----------|---------|
| Root Layout | Server | `apps/web/app/layout.tsx` | ThemeProvider, global CSS |
| Dashboard Layout | Server | `apps/web/app/(dashboard)/layout.tsx` | DashboardShell wrapper |
| Home Page | Server | `apps/web/app/(dashboard)/page.tsx` | Dashboard home |
| Workflow Page | Server | `apps/web/app/(dashboard)/workflow/page.tsx` | ReactFlow visualization |
| Kanban Page | Server | `apps/web/app/(dashboard)/kanban/page.tsx` | Drag-drop board |

### Current Responsive System

```typescript
// apps/web/src/hooks/use-mobile.ts
const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);
  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    // ... event listener setup
  }, []);
  return !!isMobile;
}
```

**Current Limitation**: Binary mobile/desktop only. No tablet tier or component-level adaptation.

### Theme System
- `next-themes` with class-based switching (`class="dark"` on html)
- CSS custom properties in OKLCH color space
- Semantic variables: `--background`, `--foreground`, `--primary`, `--status-*`
- Typography via Tailwind utilities (`text-sm`, `text-muted-foreground`)

### Component Patterns

| Pattern | Location | Usage |
|---------|----------|-------|
| CVA Variants | `button.tsx`, `sidebar.tsx` | Size/color variants via `class-variance-authority` |
| Context Providers | `SidebarContext`, `ContainerContext` | State sharing without prop drilling |
| Composable Parts | `Card`, `CardHeader`, `CardContent` | Slot-based composition |
| Headless Hooks | `useBoardState`, `useFlowState` | Pure logic, injectable dependencies |
| cn() Utility | All components | Tailwind class merging via `clsx` + `tailwind-merge` |

---

## Codebase Research Findings

### IA-01: Entry Points and Layout Architecture
**Node ID**: `file:apps/web/app/layout.tsx`, `file:apps/web/app/(dashboard)/layout.tsx`

The web application uses Next.js 15 with a route group pattern `(dashboard)` organizing three main pages. Root layout applies global CSS imports, Theme Provider, and critical styling setup.

### IA-02: Responsive Mobile Hook
**Node ID**: `file:apps/web/src/hooks/use-mobile.ts`

`useIsMobile()` hook with 768px breakpoint using `window.matchMedia()`. Includes event listeners for real-time viewport changes.

### IA-03: Responsive Sidebar with Mobile Adaptation
**Node ID**: `file:apps/web/src/components/ui/sidebar.tsx` (695 lines)

Sidebar implements three collapsible modes: `offcanvas`, `icon`, `none`. Mobile uses Sheet component overlay; desktop uses fixed positioning.

### IA-04: UI Component System
**Node ID**: `file:apps/web/src/components/ui/`

shadcn/ui components built on Radix UI primitives with CVA for variant management. All components use `cn()` utility for class merging.

### IA-05: Theme System with next-themes
**Node ID**: `file:apps/web/src/components/theme-toggle.tsx`, `file:apps/web/app/globals.css`

`next-themes` for light/dark/system modes. CSS custom properties in OKLCH color space with FOUC prevention via `suppressHydrationWarning`.

### IA-10: Typography and Content Rendering
**Node ID**: `file:apps/web/src/components/ui/card.tsx`, `file:apps/web/src/components/workflow/node-detail-panel.tsx`

No dedicated Markdown rendering. Text uses basic HTML with Tailwind utilities. NodeDetailPanel shows formatted content patterns.

---

## Dependency Analysis

### Current Stack

| Dependency | Version | Purpose |
|------------|---------|---------|
| React | 19.0.0 | UI library |
| Next.js | 15.1.6 | Framework |
| Tailwind CSS | 4.1.18 | Styling |
| @radix-ui/* | Various | Accessible primitives |
| @dnd-kit/* | 6.x/10.x | Drag and drop |
| @xyflow/react | 12.10.0 | ReactFlow |
| next-themes | 0.4.6 | Theme switching |
| lucide-react | 0.562.0 | Icons |

### Recommended New Dependencies

| Package | Version | Purpose | Bundle Impact |
|---------|---------|---------|---------------|
| `react-markdown` | ^9.0.0 | Markdown rendering | ~20KB client |
| `remark-gfm` | ^4.0.0 | GitHub Flavored Markdown | Server only |
| `rehype-pretty-code` | ^0.15.0 | Shiki integration | Server only |
| `shiki` | ^3.0.0 | Syntax highlighting | ~905KB server only |
| `isomorphic-mermaid` | ^2.0.0 | Server-side Mermaid | Server only |
| `@tailwindcss/typography` | ^0.5.0 | Prose styling | CSS only |

---

## External Research: FileViewer & MarkdownViewer Architecture

### Component Architecture (Perplexity Deep Research 2026-01-24)

**FileViewer** - Generic read-only code/file viewer:
- Line numbers always visible (CSS counter approach)
- Syntax highlighting for 20+ languages via Shiki
- Server-side processing (905KB Shiki stays off client)
- Theme-aware (light/dark via next-themes)
- Keyboard navigation (arrows, Home/End)

**MarkdownViewer** - Extended viewer for .md files:
- **Source mode**: Raw markdown with line numbers + syntax highlighting
- **Preview mode**: Rendered markdown with formatting
- Toggle button to switch modes
- Extensible for future preview formats

### ViewerFile Interface (Input to Viewers)

```typescript
// Clean interface - future tree browser ready
interface ViewerFile {
  path: string;      // e.g., "src/components/Button.tsx"
  filename: string;  // e.g., "Button.tsx" (for display + language detection)
  content: string;   // The actual file content
}

// Language auto-detected internally from filename extension
function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    'ts': 'typescript', 'tsx': 'tsx',
    'js': 'javascript', 'jsx': 'jsx',
    'py': 'python', 'cs': 'csharp',
    'go': 'go', 'rs': 'rust', 'java': 'java',
    'yaml': 'yaml', 'yml': 'yaml', 'json': 'json',
    'sql': 'sql', 'sh': 'bash', 'md': 'markdown',
    // ... 100+ languages via Shiki
  };
  return map[ext || ''] || 'text';
}
```

### Headless Hooks Pattern (TDD-First)

```typescript
// useFileViewerState(file: ViewerFile) - pure logic, no UI
interface FileViewerState {
  file: ViewerFile;
  language: string;  // Auto-detected from filename
  theme: 'light' | 'dark';
  showLineNumbers: boolean;
  highlightedLines: number[];
}

interface FileViewerActions {
  setFile: (file: ViewerFile) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleLineNumbers: () => void;
  setHighlightedLines: (lines: number[]) => void;
}

// useMarkdownViewerState(file: ViewerFile) - extends FileViewer
interface MarkdownViewerState extends FileViewerState {
  isPreviewMode: boolean;
}

interface MarkdownViewerActions extends FileViewerActions {
  toggleMode: () => void;
  setMode: (mode: 'source' | 'preview') => void;
}
```

### Line Numbers (CSS Counter Approach)

```css
pre {
  counter-reset: line;
}

code .line::before {
  counter-increment: line;
  content: counter(line);
  display: inline-block;
  width: 3rem;
  margin-right: 1rem;
  text-align: right;
  color: rgb(156, 163, 175);
  user-select: none;       /* Not copied with code */
  -webkit-user-select: none;
}
```

**Key benefit**: Line numbers are not included when user copies code.

### Shiki Server-Side Processing

```typescript
// Server Component - Shiki runs on server only
import { codeToHtml } from 'shiki';

async function highlightCode(code: string, language: string, theme: 'light' | 'dark') {
  return await codeToHtml(code, {
    lang: language,
    theme: theme === 'dark' ? 'github-dark' : 'github-light',
  });
}
```

**Supported Languages** (critical subset):
- TypeScript, JavaScript, Python, C#, Go, Rust, Java
- YAML, JSON, TOML, XML
- SQL, Bash, PowerShell
- HTML, CSS, Markdown
- And 100+ more via Shiki

### MarkdownViewer Preview Mode

```typescript
// Preview mode uses react-markdown with custom code renderer
import Markdown from 'react-markdown';

const CodeBlockRenderer = ({ className, children }) => {
  const language = className?.replace(/language-/, '') || 'text';
  // Use pre-highlighted HTML from server
  return <div dangerouslySetInnerHTML={{ __html: highlightedCode }} />;
};

<Markdown components={{ code: CodeBlockRenderer }}>
  {rawMarkdown}
</Markdown>
```

### Library Stack

| Package | Version | Purpose | Bundle Impact |
|---------|---------|---------|---------------|
| `shiki` | ^3.0.0 | Syntax highlighting | 905KB server-only |
| `react-markdown` | ^9.0.0 | Markdown rendering | ~20KB client |
| `remark-gfm` | ^4.0.0 | GFM features | Server only |
| `isomorphic-mermaid` | ^2.0.0 | Mermaid diagrams | Server only |
| `@tailwindcss/typography` | ^0.5.0 | Prose styling | CSS only |

### Performance: Large Files (1000+ lines)

**Virtualization with react-window**:
```typescript
import { FixedSizeList as List } from 'react-window';

function VirtualCodeViewer({ lines, height, itemSize }) {
  return (
    <List
      height={height}
      itemCount={lines.length}
      itemSize={itemSize}
      itemData={lines}
    >
      {LineRenderer}
    </List>
  );
}
```

### Accessibility

- ARIA labels: `aria-label="TypeScript code viewer"`
- Keyboard navigation: Arrow keys, Home/End
- Focus management: Tab into viewer, arrow keys to navigate
- Screen reader: Code content readable, line numbers hidden (`aria-hidden`)

---

## External Research: Responsive Mobile Templates

### Breakpoint Strategy

```typescript
export const BREAKPOINTS = {
  xs: 320,    // Small phones
  sm: 480,    // Phones
  md: 768,    // Tablets (portrait)
  lg: 1024,   // Tablets (landscape) / small desktops
  xl: 1280,   // Desktops
  '2xl': 1536 // Large desktops
};

export function useResponsive() {
  const [windowWidth, setWindowWidth] = useState<number | undefined>(undefined);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    isMobile: windowWidth !== undefined && windowWidth < BREAKPOINTS.md,
    isTablet: windowWidth !== undefined && windowWidth >= BREAKPOINTS.md && windowWidth < BREAKPOINTS.lg,
    isDesktop: windowWidth !== undefined && windowWidth >= BREAKPOINTS.lg,
    deviceType: windowWidth === undefined ? undefined :
      windowWidth < BREAKPOINTS.md ? 'mobile' :
      windowWidth < BREAKPOINTS.lg ? 'tablet' : 'desktop'
  };
}
```

### Platform-Specific Patterns

**Pattern 1: CSS-Only (Simple layout changes)**
```tsx
export function ResponsiveCard({ children }) {
  return (
    <div className="flex flex-col md:flex-row gap-4">
      {children}
    </div>
  );
}
```

**Pattern 2: Component Branching (Different implementations)**
```tsx
export function Navigation() {
  const { isMobile } = useResponsive();

  if (isMobile) {
    return <MobileBottomNav />;
  }
  return <DesktopSidebar />;
}
```

**Pattern 3: Container Queries (Component-level responsiveness)**
```tsx
export function ProductCard() {
  return (
    <div className="@container">
      <div className="flex flex-col @sm:flex-row gap-4">
        <img className="w-full @sm:w-40" />
        <div className="flex-1">...</div>
      </div>
    </div>
  );
}
```

### Container Queries vs Media Queries

| Use Case | Solution |
|----------|----------|
| Page-level layout (sidebar, grid) | Media queries |
| Component in different contexts | Container queries |
| Fundamentally different interactions | Device detection hook |

### Mobile-First Best Practices

1. **Touch targets**: Minimum 48x48px
2. **Bottom navigation**: Thumb-friendly placement
3. **Progressive disclosure**: Show less on mobile
4. **Adaptive data**: Smaller images, fewer details
5. **Touch events**: Support both pointer and touch

---

## Testing Patterns

### Current Test Infrastructure

| Utility | Location | Purpose |
|---------|----------|---------|
| `FakeLocalStorage` | `test/fakes/fake-local-storage.ts` | Theme persistence testing |
| `FakeEventSource` | `test/fakes/fake-event-source.ts` | SSE testing |
| `DndTestWrapper` | `test/fakes/dnd-test-wrapper.tsx` | Drag-drop testing |

### Recommended Testing Approach

**Markdown Processing**:
- Unit tests for remark/rehype transforms
- Fixtures for various Markdown content
- Error handling for invalid Mermaid syntax

**Responsive Hooks**:
- Mock `window.matchMedia` for breakpoint testing
- Test all three tiers (mobile, tablet, desktop)
- Verify resize event handling

**Integration Tests**:
- MarkdownContent with real fixtures
- Responsive navigation with viewport mocking

---

## Prior Learnings

### PL-01: RSC Decorator Incompatibility
**Source**: docs/plans/001-project-setup/
**Action**: Always use `useFactory` pattern in DI container registrations.

### PL-02: Config Pre-Loading Pattern
**Source**: docs/plans/004-config/
**Action**: New services should receive `IConfigService` via constructor.

### PL-03: Test Isolation with Child Containers
**Source**: docs/plans/001-project-setup/
**Action**: All tests must create fresh containers via `createTestContainer()`.

### PL-04: ReactFlow CSS Order
**Source**: docs/plans/005-web-slick/
**Action**: ReactFlow CSS must load BEFORE Tailwind in layout.

---

## Modification Considerations

### Safe to Modify
1. Add new components: `components/markdown/`, `components/responsive/`
2. Extend hooks: Create `useResponsive()` alongside `useIsMobile()`
3. Add dependencies: Markdown/Mermaid packages are non-breaking
4. Extend CSS: Add container query utilities, prose styles

### Modify with Caution
1. `globals.css`: Add markdown styles without breaking existing theming
2. Existing components: Wrap with responsive behavior, don't refactor internals
3. Test utilities: Add new fakes, don't modify existing patterns

### Danger Zones
1. Don't break SSE infrastructure
2. Don't bloat client bundle (keep Shiki/Mermaid server-side)
3. Don't change existing MOBILE_BREAKPOINT (would break sidebar)

---

## External Research Opportunities

### 1. Accessibility for Markdown Rendering

**Why Needed**: Ensure code blocks and diagrams are accessible to screen readers.

**Ready-to-use prompt**:
```
/deepresearch "WCAG compliance for rendered markdown content including:
- Screen reader compatibility for code blocks and syntax highlighting
- Keyboard navigation for interactive diagrams
- Color contrast requirements for light/dark themes"
```

### 2. Performance Optimization for Large Documents

**Why Needed**: Handle large Markdown documents (10k+ lines) efficiently.

**Ready-to-use prompt**:
```
/deepresearch "Performance optimization for rendering large markdown documents in React 19 with:
- Virtual scrolling approaches
- Progressive rendering strategies
- Memoization patterns for partial updates"
```

---

## Recommended Implementation Order

1. **Phase 1: Headless Viewer Hooks (TDD)**
   - Create `useFileViewerState` hook with full test coverage
   - Create `useMarkdownViewerState` hook extending FileViewer
   - Test all state transitions without DOM
   - User reviews hook API design

2. **Phase 2: FileViewer Component**
   - Add Shiki for server-side syntax highlighting
   - Implement CSS counter line numbers
   - Integrate with next-themes for light/dark
   - Test with multiple languages (TS, Python, C#, etc.)
   - User reviews FileViewer UI

3. **Phase 3: MarkdownViewer Component**
   - Add react-markdown for preview mode
   - Implement source/preview toggle
   - Add prose styling via @tailwindcss/typography
   - User reviews MarkdownViewer UI

4. **Phase 4: Mermaid Integration**
   - Add isomorphic-mermaid for server-side rendering
   - Integrate with MarkdownViewer preview mode
   - Handle diagram errors gracefully
   - User reviews diagram rendering

5. **Phase 5: Responsive Infrastructure**
   - Create `useResponsive()` hook with tablet tier
   - Add container query patterns
   - Create mobile navigation template
   - User reviews responsive behavior

6. **Phase 6: Documentation & Examples**
   - Document viewer usage patterns
   - Document responsive patterns for future features
   - Create example components

---

**Research Complete**: 2026-01-24
**Report Location**: docs/plans/006-web-extras/research-dossier.md
**Next Step**: Run `/plan-1b-specify` to create specification
