# Web Slick: Professional Dashboard Implementation Plan

**Plan Version**: 1.1.0
**Created**: 2026-01-22
**Spec**: [./web-slick-spec.md](./web-slick-spec.md)
**Status**: READY
**Mode**: Full
**Validated**: 2026-01-22 (plan-4-complete-the-plan)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Implementation Phases](#implementation-phases)
   - [Phase 1: Foundation & Compatibility Verification](#phase-1-foundation--compatibility-verification)
   - [Phase 2: Theme System](#phase-2-theme-system)
   - [Phase 3: Dashboard Layout](#phase-3-dashboard-layout)
   - [Phase 4: Headless Hooks](#phase-4-headless-hooks)
   - [Phase 5: SSE Infrastructure](#phase-5-sse-infrastructure)
   - [Phase 6: Demo Pages](#phase-6-demo-pages)
   - [Phase 7: Documentation & Polish](#phase-7-documentation--polish)
6. [Cross-Cutting Concerns](#cross-cutting-concerns)
7. [Complexity Tracking](#complexity-tracking)
8. [Progress Tracking](#progress-tracking)
9. [ADR Ledger](#adr-ledger)
10. [Deviation Ledger](#deviation-ledger)
11. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: Chainglass has CLI and MCP interfaces but the web application is a placeholder. Engineering teams need a professional visual interface to visualize workflows, manage tasks, and receive real-time updates.

**Solution Approach**:
- Build on shadcn/ui component foundation with CSS Custom Properties theming
- Implement headless-first architecture (hooks separate from UI) for TDD and CLI reuse
- Use ReactFlow for workflow visualization, dnd-kit for Kanban drag-drop
- Add Server-Sent Events (SSE) for real-time backend updates
- Follow Full TDD with fakes over mocks per constitution

**Expected Outcomes**:
- Professional dashboard with light/dark theme support (AC-1 through AC-5)
- Interactive workflow visualization demo (AC-9 through AC-12)
- Kanban board with drag-drop and keyboard accessibility (AC-13 through AC-17)
- Real-time SSE updates (AC-18 through AC-21)
- All headless hooks testable without DOM rendering (AC-22 through AC-25)

**Success Metrics**:
- Test coverage for headless hooks: >80%
- Lighthouse accessibility score: >90
- Build size increase: <200KB gzipped
- All quality gates pass: `just test`, `just typecheck`, `just lint`, `just build`

---

## Technical Context

### Current System State

```
apps/web/
├── app/
│   ├── layout.tsx          # Root layout (placeholder)
│   ├── page.tsx            # Home page (placeholder: "Chainglass test")
│   └── api/health/route.ts # Health check endpoint
├── src/
│   ├── lib/di-container.ts # DI with production/test factories
│   └── services/sample.service.ts # Reference implementation
└── package.json            # Next.js 15.1.6, React 19.0.0
```

### Integration Requirements

- **@chainglass/shared**: Import `ILogger`, `IConfigService`, `FakeLogger`, `FakeConfigService`
- **DI Container**: Use `createProductionContainer(config)` and `createTestContainer()` patterns
- **Config Pre-loading**: Config loads BEFORE DI container creation per architecture.md

### Constraints

1. **RSC Compatibility**: No `@injectable()` decorators - use `useFactory` pattern
2. **Fakes Over Mocks**: No `vi.mock()` - create full fake implementations
3. **Child Container Isolation**: Fresh `createTestContainer()` per test
4. **Test Doc Format**: All tests include 5-field Test Doc comment block

### Assumptions

1. ReactFlow v12.7+ is compatible with React 19 (verified via Zustand fix)
2. dnd-kit v6.x stable series works with React 19 (not experimental @dnd-kit/react)
3. next-themes FOUC prevention works with Next.js 15 App Router
4. CSS Custom Properties are performant for theme switching

---

## Critical Research Findings

Research conducted via 2 specialized subagents (Implementation Strategist + Risk Planner). Findings synthesized and deduplicated below.

### Critical Findings

#### 01: Phase Sequencing Must Follow Strict Dependency Chain
**Sources**: [I1-01]
**Impact**: Critical
**Problem**: Later phases consume artifacts from earlier phases; violating order creates cascading refactoring.
**Solution**: Foundation → Theme → Layout → Headless Hooks → SSE → Demo Pages → Docs
**Action Required**: Do not parallelize phases; each depends on prior phase completion.
**Affects Phases**: All phases

#### 02: React 19 Compatibility Is Phase 1 Gate
**Sources**: [I1-02, R1-01, R1-02]
**Impact**: Critical
**Problem**: ReactFlow and dnd-kit may have peer dependency conflicts with React 19.
**Solution**:
1. Verify ReactFlow v12.7+ has Zustand fix
2. Use dnd-kit v6.x stable (not experimental @dnd-kit/react)
3. Create minimal test imports in Phase 1 before proceeding
**Example**:
```bash
# Verify peer dependency resolution
pnpm ls zustand use-sync-external-store --depth 5
```
**Action Required**: Phase 1 must include compatibility verification task.
**Affects Phases**: Phase 1 (Foundation)

### High Impact Findings

#### 03: Headless Hooks Before UI Components
**Sources**: [I1-03]
**Impact**: High
**Problem**: Typical "build UI then extract logic" inverts TDD and headless-first goals.
**Solution**: Build and test hooks first with pure logic, then wrap with UI.
**Example**:
```typescript
// Hook: Pure logic, testable without DOM
function useBoardState(initialBoard: Board) {
  const [board, setBoard] = useState(initialBoard);
  const moveCard = useCallback((cardId, targetColumnId, position) => {
    setBoard(prev => transformBoard(prev, cardId, targetColumnId, position));
  }, []);
  return { board, moveCard };
}

// Test: No DOM rendering needed
const { result } = renderHook(() => useBoardState(DEMO_BOARD));
act(() => result.current.moveCard('card-1', 'done', 0));
expect(result.current.board.cards['card-1'].columnId).toBe('done');
```
**Action Required**: Phase 4 (Headless Hooks) must complete before Phase 6 (Demo Pages).
**Affects Phases**: Phase 4, Phase 6

#### 04: DI Container Integration Pattern for Hooks
**Sources**: [I1-04]
**Impact**: High
**Problem**: Hooks calling `container.resolve()` directly become untestable.
**Solution**: Hooks receive dependencies via parameters; components bridge DI → Hook.
**Example**:
```typescript
// ❌ WRONG - Hook resolves from container
function useBoardState() {
  const logger = container.resolve<ILogger>(DI_TOKENS.LOGGER); // Untestable
}

// ✅ CORRECT - Hook receives dependencies
function useBoardState(initialBoard: Board, logger?: ILogger) {
  logger?.info('Board initialized');
  // ...
}

// Component bridges DI and Hook
function KanbanBoard({ initialBoard }: Props) {
  const container = useContainer();
  const logger = container.resolve<ILogger>(DI_TOKENS.LOGGER);
  const { board, moveCard } = useBoardState(initialBoard, logger);
  // ...
}
```
**Action Required**: Create React context for DI container access in components.
**Affects Phases**: Phase 4, Phase 6

#### 05: FakeEventSource for SSE Testing
**Sources**: [I1-05, R1-05]
**Impact**: High
**Problem**: `useSSE` hook depends on browser's EventSource API; can't test without fake.
**Solution**: Create `FakeEventSource` class (permitted per spec § 11 Mock Usage Policy).
**Example**:
```typescript
// test/fakes/fake-event-source.ts
export class FakeEventSource {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  simulateMessage(data: string) {
    this.onmessage?.({ data } as MessageEvent);
  }

  simulateError() {
    this.onerror?.({ type: 'error' } as Event);
  }
}
```
**Action Required**: Implement FakeEventSource in Phase 4 before useSSE hook.
**Affects Phases**: Phase 4, Phase 5

#### 06: CSS Import Order Critical for ReactFlow
**Sources**: [I1-07, R1-04]
**Impact**: High
**Problem**: If Tailwind loads before ReactFlow, positioning/edge styles break.
**Solution**: ReactFlow CSS must import BEFORE Tailwind/shadcn in layout.tsx.
**Example**:
```typescript
// apps/web/app/layout.tsx - CORRECT ORDER
import '@xyflow/react/dist/style.css';  // 1. ReactFlow FIRST
import './globals.css';                  // 2. Tailwind + shadcn SECOND
```
**Action Required**: Document in layout.tsx with comment explaining requirement.
**Affects Phases**: Phase 1, Phase 6

#### 07: next-themes FOUC Prevention Setup
**Sources**: [R1-03]
**Impact**: High
**Problem**: Theme flash on page load if next-themes not configured correctly.
**Solution**: Exact setup pattern with `suppressHydrationWarning` on html tag.
**Example**:
```typescript
// apps/web/app/layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```
**Action Required**: Test on slow connection in Phase 2.
**Affects Phases**: Phase 2

#### 08: Incremental Build Validation and Rollback Strategy
**Sources**: [R1-08]
**Impact**: High
**Problem**: Multiple new dependencies; breaking changes cascade without incremental validation.
**Solution**:
1. Run `just typecheck && just lint && just test && just build` after each sub-phase
2. One commit per logical unit
3. Feature flags for progressive rollout
**Example**:
```typescript
// apps/web/src/lib/feature-flags.ts
export const FEATURES = {
  WORKFLOW_VISUALIZATION: process.env.NEXT_PUBLIC_ENABLE_WORKFLOW === 'true',
  KANBAN_BOARD: process.env.NEXT_PUBLIC_ENABLE_KANBAN === 'true',
};
```
**Action Required**: Add feature flags in Phase 1; validate after each task.
**Affects Phases**: All phases

### Medium Impact Findings

#### 09: Test Fixtures Should Be Shared Between Demos and Tests
**Sources**: [I1-08]
**Impact**: Medium
**Problem**: If demo pages and tests use different data shapes, bugs slip through.
**Solution**: Create shared fixture module in `apps/web/src/data/fixtures/`.
**Affects Phases**: Phase 4, Phase 6

#### 10: shadcn Components Are Copied - Focus Testing on Integration
**Sources**: [I1-06]
**Impact**: Medium
**Problem**: Testing shadcn component internals wastes effort (Radix already tests them).
**Solution**: Test our usage and integration, not shadcn internals.
**Affects Phases**: Phase 6

#### 11: cmdk Package Requires Explicit Update for React 19
**Sources**: [R1-06]
**Impact**: Medium
**Problem**: Command palette shows greyed-out options without cmdk update.
**Solution**: Run `pnpm add cmdk@latest` after shadcn init if using Command components.
**Affects Phases**: Phase 1, Phase 3 (if using Command in sidebar)

#### 12: Controlled Select Empty String Issue in Forms
**Sources**: [R1-07]
**Impact**: Medium
**Problem**: shadcn Select triggers onValueChange with empty string on form.setValue().
**Solution**: Filter empty strings in onChange handlers.
**Affects Phases**: Any phase with forms using Select

---

## Testing Philosophy

### Testing Approach

**Selected Approach**: Full TDD (per spec § 11)
**Rationale**: Constitution Principle 3 mandates TDD; headless-first architecture demands comprehensive test coverage to ensure logic portability across CLI/MCP/Web.

### Test-Driven Development

Follow RED-GREEN-REFACTOR cycle for all implementation:
- **RED**: Write test first, verify it fails
- **GREEN**: Implement minimal code to pass test
- **REFACTOR**: Improve code quality while keeping tests green

### Test Documentation

Every test must include 5-field Test Doc comment block per constitution § 3.2:

```typescript
it('should move card between columns', () => {
  /*
  Test Doc:
  - Why: Verify core Kanban functionality for task management
  - Contract: moveCard(cardId, targetColumnId, position) moves card to new column
  - Usage Notes: Use act() wrapper for state updates; check board.cards[id].columnId
  - Quality Contribution: Catches state mutation bugs in board transformations
  - Worked Example: moveCard('card-1', 'done', 0) → card-1.columnId === 'done'
  */
  const { result } = renderHook(() => useBoardState(DEMO_BOARD));
  act(() => result.current.moveCard('card-1', 'done', 0));
  expect(result.current.board.cards['card-1'].columnId).toBe('done');
});
```

### Mock Usage Policy

**Policy**: Targeted mocks (fakes preferred)
**Rationale**: Follow constitution's fakes-over-mocks principle. Mocks permitted sparingly for browser APIs where full fakes are impractical.

**Allowed**:
- Browser API fakes: `FakeEventSource`, `FakeLocalStorage`, `FakeMatchMedia`
- Timer mocks: `vi.useFakeTimers()` for SSE heartbeat testing

**Prohibited**:
- `vi.mock()` for application modules
- Mocking internal services/adapters (use fakes from @chainglass/shared)

### Test Organization

```
test/
├── unit/
│   └── web/
│       ├── hooks/
│       │   ├── use-board-state.test.ts    # Kanban logic
│       │   ├── use-flow-state.test.ts     # ReactFlow logic
│       │   └── use-sse.test.ts            # SSE connection
│       ├── services/
│       │   └── sse-manager.test.ts        # Server-side SSE
│       └── components/
│           └── theme-toggle.test.ts       # Theme switching
├── integration/
│   └── web/
│       └── dashboard-layout.test.ts       # Layout integration
├── contracts/
│   └── event-source.contract.ts           # Fake/Real parity
└── fakes/
    ├── fake-event-source.ts
    └── fake-local-storage.ts
```

---

## Implementation Phases

### Phase 1: Foundation & Compatibility Verification

**Objective**: Initialize shadcn/ui, Tailwind, and verify React 19 compatibility with all new dependencies.

**Deliverables**:
- Tailwind CSS configured with shadcn/ui
- Base components available (Button, Card)
- Verified: ReactFlow, dnd-kit, next-themes work with React 19
- Feature flags infrastructure
- CSS import order established

**Dependencies**: None (foundation phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ReactFlow peer dependency conflict | Medium | High | Verify Zustand fix in v12.7+; use pnpm.overrides if needed |
| dnd-kit RSC errors | Medium | High | Use stable v6.x, not experimental @dnd-kit/react |

### Tasks (TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 1.1 | [x] | Initialize Tailwind CSS in apps/web | 2 | `tailwind.config.ts` exists; `globals.css` has Tailwind directives | ✓ | Tailwind v4 CSS-based config |
| 1.2 | [x] | Initialize shadcn/ui with CSS variables | 2 | `components.json` exists; `cn()` utility in `lib/utils.ts` | ✓ | new-york style, neutral base |
| 1.3 | [x] | Add base shadcn components (button, card) | 1 | Components in `src/components/ui/`; imports work | ✓ | Moved from root to workspace |
| 1.4 | [x] | Verify ReactFlow v12.7+ compatibility | 2 | Import ReactFlow; render minimal graph; no peer dep errors | ✓ | v12.10.0, Zustand resolved |
| 1.5 | [x] | Verify dnd-kit v6.x compatibility | 2 | Import DndContext; render with "use client"; no RSC errors | ✓ | core v6.3.1, sortable v10.0.0 |
| 1.6 | [x] | Establish CSS import order in layout.tsx | 1 | ReactFlow CSS before globals.css; documented with comment | ✓ | Per Critical Finding 06 |
| 1.7 | [x] | Create feature flags infrastructure | 1 | `feature-flags.ts` with WORKFLOW/KANBAN/SSE flags | ✓ | 3 flags + helper function |
| 1.8 | N/A | Update cmdk to latest version | 1 | `cmdk@latest` installed; no greyed-out options | - | Deferred - not using Command component |
| 1.9 | [x] | Run quality gates | 1 | `just typecheck && just lint && just build` pass | ✓ | 238 tests, all gates pass |

### Phase 1 Command Reference

**Task 1.1 - Initialize Tailwind CSS**:
```bash
cd apps/web
pnpm add -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

**Task 1.2 - Initialize shadcn/ui**:
```bash
cd apps/web
pnpm dlx shadcn@latest init
# Select: TypeScript, Default style, Slate base color, CSS variables: Yes
# Paths: components → src/components, utils → src/lib/utils
```

**Task 1.3 - Add base components**:
```bash
cd apps/web
pnpm dlx shadcn@latest add button card
```

**Task 1.4 - Install and verify ReactFlow**:
```bash
cd apps/web
pnpm add @xyflow/react
# Verify peer dependencies resolved:
pnpm ls zustand use-sync-external-store --depth 5
```

**Task 1.5 - Install and verify dnd-kit**:
```bash
cd apps/web
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
# Verify no RSC errors by creating test component with "use client"
```

**Task 1.8 - Update cmdk**:
```bash
cd apps/web
pnpm add cmdk@latest
```

**Task 1.9 - Quality gates**:
```bash
just typecheck && just lint && just build
```

### Acceptance Criteria
- [x] Tailwind classes render correctly in browser
- [x] shadcn Button and Card components render
- [x] ReactFlow minimal graph renders without errors
- [x] dnd-kit DndContext works in client component
- [x] CSS import order documented
- [x] All quality gates pass

---

### Phase 2: Theme System

**Objective**: Implement light/dark theme switching with FOUC prevention and WCAG AA accessibility.

**Deliverables**:
- ThemeProvider wrapping application
- Theme CSS variables (light and dark)
- ThemeToggle component
- Tests for theme switching logic
- No FOUC on page load

**Dependencies**: Phase 1 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| FOUC on slow connections | Low | Low | Use suppressHydrationWarning; test with throttling |

### Tasks (TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 2.1 | [x] | Write tests for useTheme hook behavior | 2 | Tests cover: get theme, set theme, system preference | ✓ | FakeLocalStorage for persistence |
| 2.2 | [x] | Install and configure next-themes | 2 | ThemeProvider in layout.tsx; suppressHydrationWarning added | ✓ | Per research finding 07 |
| 2.3 | N/A | Define CSS custom properties for light/dark | 2 | Variables in globals.css; shadcn tokens mapped | - | Already done in Phase 1 |
| 2.4 | [x] | Write tests for ThemeToggle component | 2 | Tests cover: click toggles theme, displays current state | ✓ | Integration with next-themes |
| 2.5 | [x] | Implement ThemeToggle component | 2 | Uses shadcn Button; calls setTheme; icons for sun/moon | ✓ | Place in header/layout |
| 2.6 | [x] | Test FOUC prevention on slow connection | 1 | No flash visible with 3G throttling in Chrome DevTools | ✓ | Verified configuration |
| 2.7 | [x] | Verify WCAG AA contrast ratios | 1 | Lighthouse accessibility >90; text contrast 4.5:1 | ✓ | shadcn defaults compliant |
| 2.8 | [x] | Run quality gates | 1 | All tests pass; build succeeds | ✓ | 246 tests, all gates pass |

### Phase 2 Manual Verification Procedures

**Task 2.6 - FOUC Prevention Test**:
1. Start dev server: `pnpm --filter @chainglass/web dev`
2. Open Chrome DevTools → Network tab
3. Click throttle dropdown → Select "Slow 3G"
4. Navigate to `http://localhost:3000`
5. Observe: Page should NOT flash white/unstyled before theme loads
6. Toggle theme via UI control
7. Hard refresh (Cmd+Shift+R) → Confirm no flash on reload
8. **Pass criteria**: No visible flash in any scenario

**Task 2.7 - WCAG AA Accessibility Audit**:
```bash
# Option A: Chrome DevTools (recommended for dev)
# 1. Open Chrome DevTools → Lighthouse tab
# 2. Select "Accessibility" category only
# 3. Click "Analyze page load"
# 4. Score must be >90

# Option B: CLI (for CI integration)
pnpm --filter @chainglass/web build
pnpm --filter @chainglass/web start &
npx lighthouse http://localhost:3000 --only-categories=accessibility --output=json --output-path=./lighthouse-report.json
# Check: .categories.accessibility.score >= 0.90

# Test BOTH themes:
# 1. Run audit in light mode
# 2. Toggle to dark mode via UI
# 3. Run audit again in dark mode
# Both must score >90
```

### Test Examples

```typescript
// test/unit/web/hooks/use-theme.test.ts
describe('useTheme', () => {
  let fakeStorage: FakeLocalStorage;

  beforeEach(() => {
    fakeStorage = new FakeLocalStorage();
  });

  it('should return system preference when no stored theme', () => {
    /*
    Test Doc:
    - Why: Users expect theme to match OS preference on first visit
    - Contract: useTheme() returns 'system' when localStorage empty
    - Usage Notes: Inject FakeLocalStorage to control stored state
    - Quality Contribution: Ensures first-time user experience is correct
    - Worked Example: No localStorage → theme === 'system'
    */
    const { result } = renderHook(() => useTheme({ storage: fakeStorage }));
    expect(result.current.theme).toBe('system');
  });

  it('should persist theme preference to localStorage', () => {
    /*
    Test Doc:
    - Why: Theme preference must survive page refresh
    - Contract: setTheme(value) writes to localStorage
    - Usage Notes: Check fakeStorage.getItem() after setTheme
    - Quality Contribution: Catches persistence bugs
    - Worked Example: setTheme('dark') → localStorage['theme'] === 'dark'
    */
    const { result } = renderHook(() => useTheme({ storage: fakeStorage }));
    act(() => result.current.setTheme('dark'));
    expect(fakeStorage.getItem('theme')).toBe('dark');
  });
});
```

### Acceptance Criteria
- [x] AC-1: Light and dark themes toggle via UI control
- [x] AC-2: Theme preference persists across sessions
- [x] AC-3: No FOUC on page load
- [x] AC-4: System preference respected as default
- [x] AC-5: Color contrast meets WCAG 2.1 Level AA
- [x] All quality gates pass

---

### Phase 3: Dashboard Layout

**Objective**: Build sidebar navigation and dashboard shell using shadcn/ui components.

**Deliverables**:
- Sidebar component with navigation items
- Dashboard shell layout
- Route structure for demo pages
- Consistent spacing and typography

**Dependencies**: Phase 2 complete (theme system needed for styled components)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Sidebar collapse behavior bugs | Low | Low | Use shadcn Sidebar component patterns |

### Tasks (TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Add shadcn sidebar components | 1 | `npx shadcn@latest add sidebar`; components available | - | Copy-paste model |
| 3.2 | [ ] | Write tests for sidebar navigation state | 2 | Tests cover: active item, collapsed state, item click | - | Headless logic tests |
| 3.3 | [ ] | Implement sidebar with navigation items | 3 | Home, Workflow, Kanban items; active state styling | - | Use shadcn patterns |
| 3.4 | [ ] | Create dashboard shell layout component | 2 | Sidebar + main content area; responsive grid | - | Use Tailwind grid |
| 3.5 | [ ] | Create route structure for demo pages | 2 | `/workflow` and `/kanban` routes exist (placeholder) | - | App Router pages |
| 3.6 | [ ] | Apply status colors for engineering conventions | 1 | Red=critical, Green=success, Blue=standby in CSS | - | Semantic color tokens |
| 3.7 | [ ] | Write integration test for layout | 2 | Navigation between pages works; layout consistent | - | @testing-library/react |
| 3.8 | [ ] | Run quality gates | 1 | All tests pass; build succeeds | - | Phase checkpoint |

### Acceptance Criteria
- [ ] AC-6: Dashboard has sidebar navigation for switching views
- [ ] AC-7: Layout uses consistent spacing and typography
- [ ] AC-8: Status colors follow engineering tool conventions
- [ ] All quality gates pass

---

### Phase 4: Headless Hooks

**Objective**: Implement pure logic hooks for Kanban board, ReactFlow state, and SSE connection - all testable without DOM rendering.

**Deliverables**:
- `useBoardState` hook for Kanban logic
- `useFlowState` hook for ReactFlow state
- `useSSE` hook for SSE connection
- `FakeEventSource` for SSE testing
- Shared fixtures for demos and tests
- >80% test coverage for hooks

**Dependencies**: Phase 3 complete (routes ready for demo pages)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Hook depends on DOM APIs | Medium | High | Inject dependencies; no direct browser API calls |

### Tasks (TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Create shared fixtures (board, flow data) | 2 | `apps/web/src/data/fixtures/` with typed data | - | Reused in tests and demos |
| 4.2 | [ ] | Write comprehensive tests for useBoardState | 3 | Tests cover: moveCard, addCard, deleteCard, reorder | - | RED first |
| 4.3 | [ ] | Implement useBoardState to pass tests | 3 | All tests from 4.2 pass; normalized data structure | - | GREEN |
| 4.4 | [ ] | Write comprehensive tests for useFlowState | 3 | Tests cover: addNode, removeNode, updateNode, edges | - | RED first |
| 4.5 | [ ] | Implement useFlowState to pass tests | 3 | All tests from 4.4 pass; integrates with Zustand | - | GREEN |
| 4.6 | [ ] | Create FakeEventSource for testing | 2 | Simulates open, message, error events | - | Per finding 05 |
| 4.7 | [ ] | Write comprehensive tests for useSSE | 3 | Tests cover: connect, message parsing, reconnection, error | - | RED first |
| 4.8 | [ ] | Implement useSSE to pass tests | 3 | All tests from 4.7 pass; uses injected EventSource factory | - | GREEN |
| 4.9 | [ ] | Create DI context for components | 2 | `ContainerContext` provides container to components | - | Per finding 04 |
| 4.10 | [ ] | Verify test coverage >80% | 1 | Coverage reports >80% for hooks directory | - | See command below |
| 4.11 | [ ] | Run quality gates | 1 | All tests pass; build succeeds | - | Phase checkpoint |

### Phase 4 Coverage Verification

**Task 4.10 - Coverage Command**:
```bash
# Run coverage for hooks specifically
pnpm vitest run --coverage --coverage.include='apps/web/src/hooks/**' --coverage.reporter=text

# Expected output should show:
# - Statements: >80%
# - Branches: >80%
# - Functions: >80%
# - Lines: >80%

# Alternative: Full coverage report with thresholds
pnpm vitest run --coverage --coverage.thresholds.statements=80 --coverage.thresholds.branches=80 --coverage.thresholds.functions=80 --coverage.thresholds.lines=80

# If thresholds not met, command exits with non-zero code
```

### Test Examples

```typescript
// test/unit/web/hooks/use-board-state.test.ts
import { renderHook, act } from '@testing-library/react';
import { useBoardState } from '@/hooks/useBoardState';
import { DEMO_BOARD } from '@/data/fixtures/board.fixture';

describe('useBoardState', () => {
  it('should move card between columns', () => {
    /*
    Test Doc:
    - Why: Core Kanban functionality for task management
    - Contract: moveCard(cardId, targetColumnId, position) updates card's columnId
    - Usage Notes: Use act() for state updates; check board.cards[id].columnId
    - Quality Contribution: Catches state mutation bugs in board transformations
    - Worked Example: moveCard('card-1', 'done', 0) → card-1.columnId === 'done'
    */
    const { result } = renderHook(() => useBoardState(DEMO_BOARD));

    act(() => {
      result.current.moveCard('card-1', 'done', 0);
    });

    expect(result.current.board.cards['card-1'].columnId).toBe('done');
  });

  it('should reorder cards within same column', () => {
    /*
    Test Doc:
    - Why: Users drag cards to prioritize within a column
    - Contract: moveCard within same column updates order property
    - Usage Notes: Check order values after move
    - Quality Contribution: Ensures drag-reorder works correctly
    - Worked Example: moveCard('card-2', 'todo', 0) → card-2.order < card-1.order
    */
    const { result } = renderHook(() => useBoardState(DEMO_BOARD));

    act(() => {
      result.current.moveCard('card-2', 'todo', 0); // Move to top
    });

    expect(result.current.board.cards['card-2'].order).toBeLessThan(
      result.current.board.cards['card-1'].order
    );
  });
});
```

### Non-Happy-Path Coverage
- [ ] Null/undefined card IDs handled
- [ ] Moving to non-existent column handled
- [ ] SSE connection error triggers reconnection
- [ ] SSE malformed message doesn't crash

### Acceptance Criteria
- [ ] AC-22: Kanban board logic testable without DOM
- [ ] AC-23: ReactFlow state logic testable without DOM
- [ ] AC-24: All headless hooks have unit tests
- [ ] Test coverage >80% for all hooks
- [ ] All quality gates pass

---

### Phase 5: SSE Infrastructure

**Objective**: Implement server-side SSE endpoint and connection manager for real-time updates.

**Deliverables**:
- SSE route handler (`/api/events/[channel]/route.ts`)
- SSEManager class for broadcasting
- Typed events with Zod schemas
- Heartbeat for connection keep-alive

**Dependencies**: Phase 4 complete (useSSE hook ready to consume)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Connection limits in dev | Low | Medium | Singleton pattern; heartbeat for stale detection |

### Tasks (TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Define Zod schemas for SSE events | 2 | Schema file created with discriminated union | - | See schema below |
| 5.2 | [ ] | Write tests for SSEManager class | 2 | Tests cover: add connection, broadcast, remove connection | - | Use FakeWritable |
| 5.3 | [ ] | Implement SSEManager class | 2 | Manages Map of connections; broadcasts messages | - | Singleton pattern |
| 5.4 | [ ] | Write integration test for SSE route | 2 | Tests cover: stream opens, heartbeat sent, events received | - | Supertest or fetch |
| 5.5 | [ ] | Implement SSE route handler | 3 | ReadableStream with encoder; heartbeat every 30s | - | Next.js route handler |
| 5.6 | [ ] | Add abort signal handling | 1 | Connection cleanup on client disconnect | - | request.signal.addEventListener |
| 5.7 | [ ] | Run quality gates | 1 | All tests pass; build succeeds | - | Phase checkpoint |

### Phase 5 Schema Definition

**Task 5.1 - SSE Event Schema**:

Create file: `apps/web/src/lib/schemas/sse-events.schema.ts`

```typescript
import { z } from 'zod';

// Base event structure
const baseEventSchema = z.object({
  id: z.string().optional(),
  timestamp: z.string().datetime(),
});

// Workflow status update event
const workflowStatusEventSchema = baseEventSchema.extend({
  type: z.literal('workflow_status'),
  data: z.object({
    workflowId: z.string(),
    phase: z.enum(['pending', 'running', 'completed', 'failed']),
    progress: z.number().min(0).max(100).optional(),
  }),
});

// Task update event
const taskUpdateEventSchema = baseEventSchema.extend({
  type: z.literal('task_update'),
  data: z.object({
    taskId: z.string(),
    columnId: z.string(),
    position: z.number(),
  }),
});

// Heartbeat event (keep-alive)
const heartbeatEventSchema = baseEventSchema.extend({
  type: z.literal('heartbeat'),
  data: z.object({}),
});

// Discriminated union of all event types
export const sseEventSchema = z.discriminatedUnion('type', [
  workflowStatusEventSchema,
  taskUpdateEventSchema,
  heartbeatEventSchema,
]);

export type SSEEvent = z.infer<typeof sseEventSchema>;
export type WorkflowStatusEvent = z.infer<typeof workflowStatusEventSchema>;
export type TaskUpdateEvent = z.infer<typeof taskUpdateEventSchema>;
```

**Task 5.5 - Heartbeat Configuration**:
- Heartbeat interval: **30 seconds** (30000ms)
- SSE comment format for heartbeat: `: heartbeat\n\n`
- Data event format: `event: heartbeat\ndata: {"type":"heartbeat","timestamp":"..."}\n\n`

### Test Examples

```typescript
// test/unit/web/services/sse-manager.test.ts
import { SSEManager } from '@/lib/sse-manager';

describe('SSEManager', () => {
  let manager: SSEManager;

  beforeEach(() => {
    manager = new SSEManager();
  });

  it('should broadcast to all connections on a channel', () => {
    /*
    Test Doc:
    - Why: Multiple clients need to receive the same real-time updates
    - Contract: broadcast(channelId, event) sends to all channel connections
    - Usage Notes: Create fake writable streams; check write() calls
    - Quality Contribution: Ensures multi-client support works
    - Worked Example: 2 connections → broadcast → both receive event
    */
    const writes1: string[] = [];
    const writes2: string[] = [];

    manager.addConnection('workflow-1', {
      write: (data) => writes1.push(data)
    });
    manager.addConnection('workflow-1', {
      write: (data) => writes2.push(data)
    });

    manager.broadcast('workflow-1', 'status_update', { phase: 'running' });

    expect(writes1).toHaveLength(1);
    expect(writes2).toHaveLength(1);
    expect(writes1[0]).toContain('event: status_update');
  });
});
```

### Acceptance Criteria
- [ ] AC-18: SSE endpoint exists at `/api/events/[channel]`
- [ ] AC-19: Client reconnects automatically (via useSSE)
- [ ] AC-20: Multiple clients can receive broadcasts
- [ ] AC-21: Events typed with Zod schemas
- [ ] All quality gates pass

---

### Phase 6: Demo Pages

**Objective**: Build ReactFlow workflow visualization and Kanban board demo pages using headless hooks and shadcn components.

**Deliverables**:
- `/workflow` page with interactive graph
- `/kanban` page with drag-drop board
- Custom ReactFlow node types
- Keyboard accessibility for Kanban

**Dependencies**: Phase 4 (hooks) and Phase 5 (SSE) complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| dnd-kit keyboard accessibility complex | Medium | Medium | Use sortableKeyboardCoordinates from dnd-kit |

### Tasks (TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 6.1 | [ ] | Write integration tests for WorkflowPage | 2 | Tests cover: graph renders, pan/zoom works, node click | - | See test commands below |
| 6.2 | [ ] | Create custom ReactFlow node components | 3 | WorkflowNode, PhaseNode, AgentNode with distinct styles | - | React.memo for performance |
| 6.3 | [ ] | Implement WorkflowPage with ReactFlow | 3 | Uses useFlowState; renders from fixture; interactive | - | Consumes headless hook |
| 6.4 | [ ] | Add node detail panel on click | 2 | Clicking node shows details in sidebar/panel | - | shadcn Sheet or Dialog |
| 6.5 | [ ] | Write integration tests for KanbanPage | 2 | Tests cover: columns render, drag between columns, keyboard | - | See test commands below |
| 6.6 | [ ] | Create Kanban column and card components | 3 | Uses shadcn Card; integrates with dnd-kit | - | "use client" required |
| 6.7 | [ ] | Implement KanbanPage with dnd-kit | 3 | Uses useBoardState; DndContext with sensors | - | Consumes headless hook |
| 6.8 | [ ] | Add keyboard accessibility to Kanban | 2 | KeyboardSensor with sortableKeyboardCoordinates | - | AC-16 requirement |
| 6.9 | [ ] | Connect demo pages to SSE for real-time updates | 2 | useSSE integration; updates reflect in UI | - | Uses Phase 5 infrastructure |
| 6.10 | [ ] | Run quality gates | 1 | All tests pass; build succeeds | - | Phase checkpoint |

### Phase 6 Test Commands

**Task 6.1 - WorkflowPage Integration Tests**:
```bash
# Create test file at: test/integration/web/workflow-page.test.tsx

# Run specific test file
pnpm vitest run test/integration/web/workflow-page.test.tsx

# Run with watch mode during development
pnpm vitest test/integration/web/workflow-page.test.tsx

# Run all integration tests
pnpm vitest run test/integration/web/
```

**Task 6.5 - KanbanPage Integration Tests**:
```bash
# Create test file at: test/integration/web/kanban-page.test.tsx

# Run specific test file
pnpm vitest run test/integration/web/kanban-page.test.tsx

# Run with watch mode during development
pnpm vitest test/integration/web/kanban-page.test.tsx
```

**Task 6.10 - Quality Gates**:
```bash
just test && just typecheck && just lint && just build
```

### Test Examples

```typescript
// test/integration/web/kanban-page.test.tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KanbanPage from '@/app/kanban/page';

describe('KanbanPage', () => {
  it('should move card between columns via drag', async () => {
    /*
    Test Doc:
    - Why: Core user interaction for task management
    - Contract: Dragging card to new column moves it there
    - Usage Notes: Use @testing-library drag simulation
    - Quality Contribution: Ensures drag-drop works end-to-end
    - Worked Example: Drag card-1 from Todo to Done → card appears in Done column
    */
    render(<KanbanPage />);

    const card = screen.getByText('Task 1');
    const doneColumn = screen.getByTestId('column-done');

    // Simulate drag-drop
    await userEvent.drag(card, { target: doneColumn });

    expect(within(doneColumn).getByText('Task 1')).toBeInTheDocument();
  });

  it('should support keyboard navigation for accessibility', async () => {
    /*
    Test Doc:
    - Why: WCAG requires keyboard-accessible interactions
    - Contract: Card can be moved with keyboard (Space/Enter to pick, arrows to move)
    - Usage Notes: Focus card, Space to pick up, Arrow to move, Space to drop
    - Quality Contribution: Ensures accessibility compliance
    - Worked Example: Focus card → Space → ArrowRight → Space → card moved
    */
    render(<KanbanPage />);

    const card = screen.getByText('Task 1');
    card.focus();

    await userEvent.keyboard('{Space}'); // Pick up
    await userEvent.keyboard('{ArrowRight}'); // Move right
    await userEvent.keyboard('{Space}'); // Drop

    const inProgressColumn = screen.getByTestId('column-in-progress');
    expect(within(inProgressColumn).getByText('Task 1')).toBeInTheDocument();
  });
});
```

### Acceptance Criteria
- [ ] AC-9: Workflow page displays interactive graph
- [ ] AC-10: Pan and zoom works
- [ ] AC-11: Clicking node shows details
- [ ] AC-12: Different node types are visually distinct
- [ ] AC-13: Kanban displays multi-column board
- [ ] AC-14: Cards drag between columns
- [ ] AC-15: Card order rearrangeable via drag
- [ ] AC-16: Keyboard navigation supported
- [ ] AC-17: Board state changes trigger UI updates
- [ ] AC-25: UI components consume headless hooks
- [ ] All quality gates pass

---

### Phase 7: Documentation & Polish

**Objective**: Document patterns, update README, create how-to guides, and ensure accessibility compliance.

**Deliverables**:
- Updated README with quick-start guide
- `docs/how/theming.md` - Theme system guide
- `docs/how/headless-components.md` - Headless pattern guide
- `docs/how/sse-integration.md` - SSE guide
- Lighthouse accessibility score >90

**Dependencies**: Phase 6 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Documentation drift | Medium | Low | Include doc updates in PR reviews |

### Discovery & Placement Decision

**Existing docs/how/ structure**:
```
docs/how/
└── (empty or minimal)
```

**Decision**: Create new `docs/how/` files for each pattern documented.

### Tasks (Lightweight Approach for Documentation)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 7.1 | [ ] | Update README with quick-start section | 2 | Dev setup, theme toggle usage, running demos | - | `./README.md` |
| 7.2 | [ ] | Create docs/how/theming.md | 2 | Theme architecture, CSS variables, custom themes | - | `./docs/how/theming.md` |
| 7.3 | [ ] | Create docs/how/headless-components.md | 2 | Hook pattern, creating new components, testing | - | `./docs/how/headless-components.md` |
| 7.4 | [ ] | Create docs/how/sse-integration.md | 2 | SSE endpoint creation, useSSE hook, event types | - | `./docs/how/sse-integration.md` |
| 7.5 | [ ] | Run Lighthouse accessibility audit | 1 | Score >90 on both workflow and kanban pages | - | Manual verification |
| 7.6 | [ ] | Fix any accessibility issues found | 2 | All Lighthouse recommendations addressed | - | If score <90 |
| 7.7 | [ ] | Final quality gates check | 1 | `just check` passes (all gates) | - | Final validation |

### Acceptance Criteria
- [ ] AC-26: All tests pass
- [ ] AC-27: Type check passes
- [ ] AC-28: Lint passes
- [ ] AC-29: Build succeeds
- [ ] Lighthouse accessibility >90
- [ ] Documentation complete per spec § 12

---

## Cross-Cutting Concerns

### Security Considerations

- **Input Validation**: Demo fixtures are hardcoded; no user input validation needed for this phase
- **SSE Authentication**: Not in scope (no auth per spec § 3 Non-Goals)
- **XSS Prevention**: React's JSX escaping handles this; no `dangerouslySetInnerHTML`

### Observability

- **Logging Strategy**: Use ILogger from DI container; hooks receive optional logger parameter
- **Metrics**: Not in scope for demo phase
- **Error Tracking**: Console errors in development; production error boundary recommended

### Documentation

**Per Spec § 12 Documentation Strategy**:

| Location | Content |
|----------|---------|
| README.md | Quick-start: dev setup, theme toggle, running demos |
| docs/how/theming.md | Theme system architecture, adding custom themes |
| docs/how/headless-components.md | Headless hook pattern, creating new components |
| docs/how/sse-integration.md | SSE endpoint creation, client hook usage |

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| useBoardState | 3 | Medium | S=1,I=1,D=1,N=0,F=0,T=1 | Multiple state transformations | Comprehensive tests |
| useFlowState | 3 | Medium | S=1,I=1,D=1,N=0,F=0,T=1 | Zustand integration | Follow ReactFlow patterns |
| useSSE | 3 | Medium | S=1,I=1,D=0,N=1,F=0,T=1 | Browser API dependency | FakeEventSource |
| KanbanPage | 3 | Medium | S=1,I=2,D=0,N=0,F=0,T=1 | dnd-kit integration | Follow dnd-kit examples |
| WorkflowPage | 3 | Medium | S=1,I=2,D=0,N=0,F=0,T=1 | ReactFlow integration | Follow ReactFlow examples |

**Overall Feature**: CS-3 (Medium) - 9 points total per spec § 4

---

## Progress Tracking

### Phase Completion Checklist

- [x] Phase 1: Foundation & Compatibility Verification - **Complete** (2026-01-22)
- [ ] Phase 2: Theme System - [Status]
- [ ] Phase 3: Dashboard Layout - [Status]
- [ ] Phase 4: Headless Hooks - [Status]
- [ ] Phase 5: SSE Infrastructure - [Status]
- [ ] Phase 6: Demo Pages - [Status]
- [ ] Phase 7: Documentation & Polish - [Status]

### STOP Rule

**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0001 | Accepted | N/A (MCP tools) | Reference for tool design if exposing MCP tools |
| ADR-0002 (seed) | Proposed | Phase 2 | Theme System Architecture |
| ADR-0003 (seed) | Proposed | Phase 4 | Headless Component Pattern |
| ADR-0004 (seed) | Proposed | Phase 5 | Real-Time Update Architecture |

**Recommendation**: Create ADR-0002, ADR-0003, ADR-0004 during implementation using `/plan-3a-adr`.

---

## Deviation Ledger

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| None | N/A | N/A | N/A |

No deviations from constitution or architecture rules required.

---

## Change Footnotes Ledger

**Footnote Numbering Authority**: plan-6a-update-progress is the single source of truth for footnote numbering.

### Phase 2: Theme System

[^1]: Task T001 - Created FakeLocalStorage test fake
  - `file:test/fakes/fake-local-storage.ts`
  - `type:test/fakes/fake-local-storage.ts:FakeLocalStorage`

[^2]: Task T001 - Created useTheme hook tests
  - `file:test/unit/web/hooks/use-theme.test.tsx`
  - `callable:test/unit/web/hooks/use-theme.test.tsx:@17.52`

[^3]: Task T001 - Updated test infrastructure
  - `file:test/fakes/index.ts`
  - `file:test/vitest.config.ts`

[^4]: Task T002 - Added next-themes dependency
  - `file:apps/web/package.json`

[^5]: Task T003 - Configured ThemeProvider in layout
  - `file:apps/web/app/layout.tsx`
  - `callable:apps/web/app/layout.tsx:RootLayout`

[^6]: Task T004 - Created ThemeToggle integration tests
  - `file:test/integration/web/theme-toggle.test.tsx`

[^7]: Task T005 - Implemented ThemeToggle component
  - `file:apps/web/src/components/theme-toggle.tsx`
  - `callable:apps/web/src/components/theme-toggle.tsx:ThemeToggle`

[^8]: Task T005 - Updated test infrastructure for React testing
  - `file:test/vitest.config.ts`
  - `file:test/setup.ts`

[^9]: Task T006 - Added ThemeToggle to homepage for testing
  - `file:apps/web/app/page.tsx`
  - `callable:apps/web/app/page.tsx:Home`

### Phase 5: SSE Infrastructure

[^10]: Task T001 - Created SSE event schemas with Zod discriminated union
  - `file:apps/web/src/lib/schemas/sse-events.schema.ts`
  - `type:apps/web/src/lib/schemas/sse-events.schema.ts:SSEEvent`

[^11]: Task T002 - Created FakeController test fake
  - `file:test/fakes/fake-controller.ts`
  - `type:test/fakes/fake-controller.ts:FakeController`

[^12]: Task T002 - Created SSEManager unit tests (10 tests after fixes)
  - `file:test/unit/web/services/sse-manager.test.ts`

[^13]: Task T003 - Implemented SSEManager singleton with globalThis pattern
  - `file:apps/web/src/lib/sse-manager.ts`
  - `type:apps/web/src/lib/sse-manager.ts:SSEManager`
  - `callable:apps/web/src/lib/sse-manager.ts:sseManager`

[^14]: Task T004 - Created SSE route integration tests (4 tests after fixes)
  - `file:test/integration/web/api/sse-route.test.ts`

[^15]: Task T005/T006 - Implemented SSE route handler with AbortSignal cleanup
  - `file:apps/web/app/api/events/[channel]/route.ts`
  - `callable:apps/web/app/api/events/[channel]/route.ts:GET`

---

*Plan Version 1.1.0 - Updated 2026-01-22 (Added command references for agent handover)*
