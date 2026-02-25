# Fix Tasks: Phase 2 — Browser-Side Event Hub

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Fix debounce + accumulate data loss
- **Severity**: HIGH
- **File(s)**: `/home/jak/substrate/041-file-browser/apps/web/src/features/045-live-file-events/use-file-changes.ts`
- **Issue**: When two batches arrive within the debounce window in accumulate mode, clearTimeout cancels the first timer and the new closure only captures the latest `incoming`. The first batch's changes are permanently lost.
- **Fix**: Add a `bufferRef` to accumulate incoming changes across debounce resets. Drain the buffer when the timer fires.
- **Patch hint**:
  ```diff
   export function useFileChanges(
     pattern: string,
     options: UseFileChangesOptions = {}
   ): UseFileChangesReturn {
     const { debounce = 100, mode = 'replace' } = options;
     const hub = useFileChangeHub();
     const [changes, setChanges] = useState<FileChange[]>([]);
     const timerRef = useRef<ReturnType<typeof setTimeout>>();
  +  const bufferRef = useRef<FileChange[]>([]);
   
     useEffect(() => {
       const unsubscribe = hub.subscribe(pattern, (incoming) => {
         if (timerRef.current) clearTimeout(timerRef.current);
   
  +      if (mode === 'accumulate') {
  +        bufferRef.current.push(...incoming);
  +      } else {
  +        bufferRef.current = [...incoming];
  +      }
  +
         if (debounce === 0) {
  -        setChanges((prev) => (mode === 'accumulate' ? [...prev, ...incoming] : incoming));
  +        setChanges((prev) => (mode === 'accumulate' ? [...prev, ...bufferRef.current] : bufferRef.current));
  +        bufferRef.current = [];
         } else {
           timerRef.current = setTimeout(() => {
  -          setChanges((prev) => (mode === 'accumulate' ? [...prev, ...incoming] : incoming));
  +          setChanges((prev) => (mode === 'accumulate' ? [...prev, ...bufferRef.current] : bufferRef.current));
  +          bufferRef.current = [];
           }, debounce);
         }
       });
   
       return () => {
         unsubscribe();
         if (timerRef.current) clearTimeout(timerRef.current);
  +      bufferRef.current = [];
       };
     }, [hub, pattern, debounce, mode]);
  ```

### FT-002: Add regression test for accumulate + debounce
- **Severity**: HIGH
- **File(s)**: `/home/jak/substrate/041-file-browser/test/unit/web/features/045-live-file-events/use-file-changes.test.tsx`
- **Issue**: No test exercises accumulate mode with debounce > 0. The bug in FT-001 goes undetected.
- **Fix**: Add a test that sends two batches within the debounce window and verifies both batches are accumulated after the timer fires.
- **Patch hint**:
  ```diff
  +  it('should accumulate changes across debounce resets', () => {
  +    const { result } = renderHook(
  +      () => useFileChanges('*', { debounce: 100, mode: 'accumulate' }),
  +      { wrapper: createWrapper() }
  +    );
  +
  +    const fakeES = getLastES();
  +    act(() => {
  +      fakeES.simulateOpen();
  +      simulateSSEMessage(fakeES, [
  +        { path: 'src/a.tsx', eventType: 'add', worktreePath: '/repo', timestamp: 1000 },
  +      ]);
  +    });
  +
  +    // Second batch within debounce window
  +    act(() => {
  +      simulateSSEMessage(fakeES, [
  +        { path: 'src/b.tsx', eventType: 'change', worktreePath: '/repo', timestamp: 2000 },
  +      ]);
  +    });
  +
  +    // Not yet — debounce pending
  +    expect(result.current.hasChanges).toBe(false);
  +
  +    act(() => {
  +      vi.advanceTimersByTime(100);
  +    });
  +
  +    // Both batches should be accumulated
  +    expect(result.current.changes).toHaveLength(2);
  +    expect(result.current.changes[0].path).toBe('src/a.tsx');
  +    expect(result.current.changes[1].path).toBe('src/b.tsx');
  +  });
  ```

### FT-003: Add R-TEST-002 Test Doc to hub unit tests
- **Severity**: HIGH
- **File(s)**: `/home/jak/substrate/041-file-browser/test/unit/web/features/045-live-file-events/file-change-hub.test.ts`
- **Issue**: All 18 `it()` blocks missing mandatory 5-field Test Doc comment per R-TEST-002.
- **Fix**: Add Test Doc block comment to each test. Format per idioms.md §7:
  ```typescript
  it('should match exact file path', () => {
    /**
     * Why: Verifies the most basic subscription pattern — exact path match.
     * Contract: FileChangeHub.subscribe(exactPath) dispatches only when path === exactPath.
     * Usage Notes: Used by FileViewerPanel to watch the currently open file.
     * Quality Contribution: Prevents false-positive dispatches to unrelated subscribers.
     * Worked Example: subscribe('src/app.tsx') + dispatch('src/app.tsx') → callback fires.
     */
    // ...test body...
  });
  ```

### FT-004: Add R-TEST-002 Test Doc to hook unit tests
- **Severity**: HIGH
- **File(s)**: `/home/jak/substrate/041-file-browser/test/unit/web/features/045-live-file-events/use-file-changes.test.tsx`
- **Issue**: All 10 `it()` blocks missing mandatory Test Doc comment.
- **Fix**: Same format as FT-003, applied to all hook tests.

### FT-005: Add R-TEST-002 Test Doc to contract tests
- **Severity**: HIGH
- **File(s)**: `/home/jak/substrate/041-file-browser/test/contracts/file-change-hub.contract.ts`
- **Issue**: All 8 `it()` blocks missing mandatory Test Doc comment.
- **Fix**: Same format as FT-003. For contract tests, see idioms.md §6 for examples.

## Medium / Low Fixes

### FT-006: Extract createMatcher to shared module
- **Severity**: MEDIUM
- **File(s)**: `/home/jak/substrate/041-file-browser/apps/web/src/features/045-live-file-events/file-change-hub.ts`, `fake-file-change-hub.ts`
- **Issue**: createMatcher() duplicated verbatim (26 lines) between real and fake hub. Drift risk.
- **Fix**: Create `path-matcher.ts` in the feature folder, export `createMatcher`, import from both files.

### FT-007: Add IFileChangeHub interface
- **Severity**: MEDIUM
- **File(s)**: `/home/jak/substrate/041-file-browser/apps/web/src/features/045-live-file-events/file-change.types.ts`
- **Issue**: No formal interface per R-ARCH-002 (Interface-First Design). Real and fake share shape via duck typing.
- **Fix**: Add `IFileChangeHub` interface with `subscribe`, `dispatch`, `subscriberCount`. Both FileChangeHub and FakeFileChangeHub implement it. Update contract test's `HubUnderTest` to use it.

### FT-008: Remove unused imports
- **Severity**: LOW
- **File(s)**: `file-change-hub.test.ts` (line 8: `vi`), `use-file-changes.test.tsx` (line 11: `FakeFileChangeHub`)
- **Issue**: Unused imports.
- **Fix**: Remove `vi` from hub test imports. Remove `FakeFileChangeHub` import and stale comments from hook test.

## Re-Review Checklist

- [ ] FT-001 applied: bufferRef in useFileChanges accumulate path
- [ ] FT-002 applied: regression test for accumulate + debounce
- [ ] FT-003/004/005 applied: Test Doc on all 36 test cases
- [ ] All tests pass: `pnpm vitest run test/unit/web/features/045-live-file-events/ test/contracts/file-change-hub.contract.test.ts`
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
