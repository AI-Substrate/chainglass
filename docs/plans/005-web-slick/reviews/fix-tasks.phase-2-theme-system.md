# Phase 2: Theme System – Fix Tasks

**Generated**: 2026-01-22T19:47  
**Review**: [review.phase-2-theme-system.md](./review.phase-2-theme-system.md)  
**Priority**: HIGH (blocking merge)

---

## Priority 1: BLOCKING (Must Fix Before Merge)

### FIX-001: Establish Bidirectional Graph Links

**Severity**: HIGH  
**Category**: Graph Integrity  
**Blocking**: Yes (breaks plan-6a automation)

**Problem**: All 24 Task↔Log bidirectional links are missing, preventing graph traversability.

**Violations**:
- 8 tasks missing log anchors in Notes column
- 8 log entries missing Dossier Task backlinks
- 8 log entries missing Plan Task backlinks

**Fix Steps**:
```bash
# Automated fix via plan-6a
plan-6a-update-progress \
  --plan "/home/jak/substrate/005-web-slick/docs/plans/005-web-slick/web-slick-plan.md" \
  --phase "Phase 2: Theme System" \
  --sync-links

# Verify links created
grep "log#task-t00" docs/plans/005-web-slick/tasks/phase-2-theme-system/tasks.md
# Should show 8 log anchors in Notes column

grep "Dossier Task" docs/plans/005-web-slick/tasks/phase-2-theme-system/execution.log.md
# Should show 8 backlinks to tasks.md

grep "Plan Task" docs/plans/005-web-slick/tasks/phase-2-theme-system/execution.log.md
# Should show 8 backlinks to plan

# Re-run quality gates
just typecheck && just lint && just test && just build
```

**Expected Outcome**: All 24 links established; graph integrity score ✅ INTACT

**Time Estimate**: 2 minutes (automated)

---

## Priority 2: RECOMMENDED (Fix Before Production)

### FIX-002: Add Mounted State Check to ThemeToggle

**Severity**: MEDIUM  
**Category**: Correctness / Observability  
**Blocking**: No (UX improvement)

**Problem**: resolvedTheme is undefined during SSR, causing incorrect icon to render briefly before hydration completes.

**Violations**:
- CORRECT-001: Hydration mismatch
- OBS-001: Undefined handling not logged
- PERF-002: Conditional rendering without mounted check

**File**: `apps/web/src/components/theme-toggle.tsx`

**Current Code** (lines 17-32):
```tsx
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const currentTheme = resolvedTheme ?? theme;
  const isDark = currentTheme === 'dark';

  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
      {isDark ? (
        <Sun className="size-5" data-testid="sun-icon" />
      ) : (
        <Moon className="size-5" data-testid="moon-icon" />
      )}
    </Button>
  );
}
```

**Fixed Code**:
```tsx
export function ThemeToggle() {
  const [mounted, setMounted] = React.useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  React.useEffect(() => {
    setMounted(true);
    if (process.env.NODE_ENV === 'development') {
      console.debug('[ThemeToggle] Mounted, resolved theme:', resolvedTheme);
    }
  }, [resolvedTheme]);

  const currentTheme = resolvedTheme ?? theme;
  const isDark = currentTheme === 'dark';

  const toggleTheme = React.useCallback(() => {
    const newTheme = isDark ? 'light' : 'dark';
    if (process.env.NODE_ENV === 'development') {
      console.debug('[ThemeToggle] Switching theme:', currentTheme, '->', newTheme);
    }
    setTheme(newTheme);
  }, [isDark, setTheme, currentTheme]);

  // Avoid hydration mismatch by not rendering theme-dependent content until mounted
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Toggle theme">
        <span className="size-5 animate-pulse" />
      </Button>
    );
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
      {isDark ? (
        <Sun className="size-5" data-testid="sun-icon" />
      ) : (
        <Moon className="size-5" data-testid="moon-icon" />
      )}
    </Button>
  );
}
```

**Changes**:
1. Add mounted state to track client-side hydration
2. Return skeleton button (pulsing animation) until mounted
3. Add dev-mode logging for hydration timing and theme transitions
4. Wrap toggleTheme in useCallback for performance

**Test Strategy** (Full TDD):
```typescript
// test/integration/web/theme-toggle.test.tsx

it('should render skeleton during SSR/hydration', () => {
  /*
  Test Doc:
  - Why: Prevent hydration mismatch icon flash
  - Contract: Returns skeleton button when resolvedTheme undefined
  - Usage Notes: Mock useTheme to return undefined resolvedTheme
  - Quality Contribution: Catches hydration bugs before production
  - Worked Example: resolvedTheme=undefined → skeleton button, no icons
  */
  vi.mocked(useTheme).mockReturnValue({
    theme: 'system',
    setTheme: vi.fn(),
    resolvedTheme: undefined,
  });

  const { container } = render(<ThemeToggle />, { wrapper: TestWrapper });

  // Should render skeleton, not sun/moon icons
  expect(screen.queryByTestId('sun-icon')).not.toBeInTheDocument();
  expect(screen.queryByTestId('moon-icon')).not.toBeInTheDocument();
  expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
});
```

**Verification**:
```bash
# Run tests
just test

# Manual verification (dev server)
pnpm --filter @chainglass/web dev
# Open http://localhost:3000
# Check browser console for [ThemeToggle] logs
# Toggle theme, verify no icon flash on hard refresh
```

**Time Estimate**: 20 minutes (code + test)

---

### FIX-003: Remove @ts-expect-error from TDD RED Phase

**Severity**: LOW  
**Category**: TDD Cleanup  
**Blocking**: No (technical debt)

**Problem**: @ts-expect-error comment left from TDD RED phase when component didn't exist. Now that component exists, suppression is unnecessary and may mask future type errors.

**File**: `test/integration/web/theme-toggle.test.tsx`

**Current Code** (lines 17-20):
```tsx
// Import will fail until component exists (TDD RED phase)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error - Component doesn't exist yet (TDD RED)
import { ThemeToggle } from '@/components/theme-toggle';
```

**Fixed Code**:
```tsx
import { ThemeToggle } from '@/components/theme-toggle';
```

**Verification**:
```bash
just typecheck  # Should still pass
just lint       # Should still pass
just test       # Should still pass
```

**Time Estimate**: 1 minute

---

## Priority 3: OPTIONAL (Quality Improvements)

### FIX-004: Create FakeMatchMedia for Mock Consistency

**Severity**: MEDIUM  
**Category**: Mock Policy Consistency  
**Blocking**: No (acceptable as-is, but inconsistent with FakeLocalStorage pattern)

**Problem**: Tests use vi.fn() for window.matchMedia instead of a fake class, which is inconsistent with the FakeLocalStorage pattern.

**Violations**:
- MOCK-001: use-theme.test.tsx uses vi.fn()
- MOCK-002: theme-toggle.test.tsx uses vi.fn()

**Current Pattern** (both test files):
```tsx
window.matchMedia = vi.fn().mockImplementation((query) => ({
  matches: query === '(prefers-color-scheme: dark)',
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));
```

**Proposed Solution**: Create FakeMatchMedia fake

**File**: `test/fakes/fake-match-media.ts`
```typescript
/**
 * Fake implementation of window.matchMedia for testing.
 * 
 * Usage:
 * ```typescript
 * const fakeMatchMedia = new FakeMatchMedia();
 * fakeMatchMedia.setPreference('dark'); // Simulate dark mode preference
 * window.matchMedia = fakeMatchMedia.mock.bind(fakeMatchMedia);
 * ```
 */
export class FakeMatchMedia {
  private preference: 'light' | 'dark' = 'light';
  private listeners: Map<string, Set<(e: MediaQueryListEvent) => void>> = new Map();

  setPreference(mode: 'light' | 'dark'): void {
    this.preference = mode;
    // Trigger listeners for color-scheme queries
    const darkQuery = '(prefers-color-scheme: dark)';
    const listeners = this.listeners.get(darkQuery) || new Set();
    listeners.forEach((listener) => {
      listener({
        matches: mode === 'dark',
        media: darkQuery,
      } as MediaQueryListEvent);
    });
  }

  mock(query: string): MediaQueryList {
    const matches = query === '(prefers-color-scheme: dark)' && this.preference === 'dark';
    
    const addEventListener = (type: string, listener: (e: MediaQueryListEvent) => void) => {
      if (type === 'change') {
        if (!this.listeners.has(query)) {
          this.listeners.set(query, new Set());
        }
        this.listeners.get(query)!.add(listener);
      }
    };

    const removeEventListener = (type: string, listener: (e: MediaQueryListEvent) => void) => {
      if (type === 'change') {
        this.listeners.get(query)?.delete(listener);
      }
    };

    return {
      matches,
      media: query,
      onchange: null,
      addEventListener,
      removeEventListener,
      addListener: addEventListener as any, // deprecated but still used
      removeListener: removeEventListener as any, // deprecated but still used
      dispatchEvent: () => true,
    };
  }

  reset(): void {
    this.preference = 'light';
    this.listeners.clear();
  }
}
```

**File**: `test/fakes/index.ts` (add export)
```typescript
export { FakeLocalStorage } from './fake-local-storage';
export { FakeMatchMedia } from './fake-match-media';
```

**Updated Test Usage**:
```typescript
// test/unit/web/hooks/use-theme.test.tsx
import { FakeLocalStorage, FakeMatchMedia } from '@/../../test/fakes';

describe('useTheme hook', () => {
  let fakeLocalStorage: FakeLocalStorage;
  let fakeMatchMedia: FakeMatchMedia;

  beforeEach(() => {
    fakeLocalStorage = new FakeLocalStorage();
    fakeMatchMedia = new FakeMatchMedia();
    window.matchMedia = fakeMatchMedia.mock.bind(fakeMatchMedia);
  });

  afterEach(() => {
    fakeLocalStorage.clear();
    fakeMatchMedia.reset();
  });

  it('should respect system dark mode preference', () => {
    /*
    Test Doc:
    - Why: Users expect theme to match OS preference when set to 'system'
    - Contract: useTheme() returns dark when system preference is dark
    - Usage Notes: Use FakeMatchMedia.setPreference('dark') to simulate OS setting
    - Quality Contribution: Validates system preference detection
    - Worked Example: FakeMatchMedia dark → resolvedTheme === 'dark'
    */
    fakeMatchMedia.setPreference('dark');
    const { result } = renderHook(() => useTheme(), { wrapper });
    
    await waitFor(() => {
      expect(result.current.resolvedTheme).toBe('dark');
    });
  });
});
```

**Benefits**:
- Consistent with FakeLocalStorage pattern
- More realistic (can simulate preference changes)
- Testable event listeners
- Reusable across test files

**Verification**:
```bash
# Run tests
just test

# Should still show 246/246 passing
```

**Time Estimate**: 45 minutes (fake class + update 2 test files)

---

### FIX-005: Add Dev-Mode Observability Logging

**Severity**: LOW  
**Category**: Observability  
**Blocking**: No (developer QoL)

**Problem**: No logging for theme transitions makes debugging harder in development.

**Violations**:
- OBS-002: No hydration timing diagnostics
- OBS-003: No theme transition logging

**Note**: This is already included in FIX-002 patch. If FIX-002 is applied, this is complete.

**Standalone Fix** (if FIX-002 not applied):
```tsx
// apps/web/src/components/theme-toggle.tsx

const toggleTheme = () => {
  const newTheme = isDark ? 'light' : 'dark';
  if (process.env.NODE_ENV === 'development') {
    console.debug('[ThemeToggle] Theme transition:', {
      from: currentTheme,
      to: newTheme,
      timestamp: new Date().toISOString(),
    });
  }
  setTheme(newTheme);
};
```

**Verification**: Check browser console in dev mode when toggling theme

**Time Estimate**: 5 minutes (if standalone)

---

### FIX-006: Add Error Scenario Test Coverage

**Severity**: LOW  
**Category**: Observability  
**Blocking**: No (test coverage improvement)

**Problem**: Tests don't verify error scenarios (ThemeProvider missing, localStorage unavailable, setTheme failure).

**File**: `test/integration/web/theme-toggle.test.tsx` (add test cases)

**Test Cases to Add**:
```typescript
it('should handle missing ThemeProvider gracefully', () => {
  /*
  Test Doc:
  - Why: Component should not crash if ThemeProvider is missing
  - Contract: Renders disabled button when useTheme returns undefined/null
  - Usage Notes: Render without TestWrapper to simulate missing provider
  - Quality Contribution: Ensures graceful degradation in edge cases
  - Worked Example: No provider → disabled button, no crash
  */
  // Mock useTheme to return undefined (simulating missing provider)
  vi.mocked(useTheme).mockReturnValue({
    theme: undefined,
    setTheme: vi.fn(),
    resolvedTheme: undefined,
  });

  const { container } = render(<ThemeToggle />);
  
  const button = container.querySelector('button');
  expect(button).toBeDisabled();
});

it('should handle localStorage unavailable', () => {
  /*
  Test Doc:
  - Why: Some browsers/modes disable localStorage (private browsing)
  - Contract: Component still renders when localStorage throws
  - Usage Notes: Mock localStorage.setItem to throw
  - Quality Contribution: Validates resilience to storage failures
  - Worked Example: localStorage.setItem throws → component renders, uses memory only
  */
  fakeLocalStorage.setItem = vi.fn().mockImplementation(() => {
    throw new Error('QuotaExceededError');
  });

  render(<ThemeToggle />, { wrapper: TestWrapper });
  
  // Should render without crashing
  const button = screen.getByRole('button', { name: /toggle theme/i });
  expect(button).toBeInTheDocument();
});
```

**Verification**:
```bash
just test
# Should show 248/248 passing (2 new tests)
```

**Time Estimate**: 20 minutes

---

## Summary

| Priority | Fix ID | Severity | Time | Blocking |
|----------|--------|----------|------|----------|
| P1 | FIX-001 | HIGH | 2 min | ✅ Yes |
| P2 | FIX-002 | MEDIUM | 20 min | ❌ No |
| P2 | FIX-003 | LOW | 1 min | ❌ No |
| P3 | FIX-004 | MEDIUM | 45 min | ❌ No |
| P3 | FIX-005 | LOW | 5 min | ❌ No |
| P3 | FIX-006 | LOW | 20 min | ❌ No |

**Total Time**:
- **Blocking**: 2 minutes (FIX-001 only)
- **Recommended**: 23 minutes (FIX-001 + FIX-002 + FIX-003)
- **Complete**: 93 minutes (all fixes)

**Recommendation**: Complete P1 (FIX-001) immediately, defer P2/P3 to post-merge refinement phase.

---

## Testing Strategy

All fixes follow **Full TDD** approach:

1. **Write test first** (RED phase)
   - Test should fail before fix applied
   - Test Doc block required (5 fields)

2. **Implement fix** (GREEN phase)
   - Minimal change to make test pass
   - Follow existing code patterns

3. **Verify quality gates** (REFACTOR phase)
   ```bash
   just typecheck && just lint && just test && just build
   ```

4. **Document in execution log**
   - Add entry for each fix applied
   - Include before/after evidence
   - Link to review and fix-tasks

---

*Fix tasks generated: 2026-01-22T19:47*  
*Review: review.phase-2-theme-system.md*
