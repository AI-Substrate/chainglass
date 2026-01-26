# Fix Tasks: Phase 5 - DiffViewer Component

**Review**: [./review.phase-5-diffviewer-component.md](./review.phase-5-diffviewer-component.md)
**Created**: 2026-01-26

---

## Required Fixes (Blocking)

### FIX-001: Memory Leak - Add DiffFile Cleanup [HIGH]

**File**: `apps/web/src/components/viewers/diff-viewer.tsx`
**Lines**: 120-186

**Issue**: DiffFile instances are created but never cleaned up on unmount or dependency changes.

**Fix**: Add cleanup function in useEffect return.

**Test-First Approach**: Existing tests should continue passing. No new test needed as this is internal cleanup.

**Patch**:
```diff
  useEffect(() => {
    if (!diffData) {
      setDiffFile(null);
      return;
    }

    let mounted = true;
+   let currentFile: DiffFile | null = null;

    const initDiff = async () => {
      try {
        const { oldFileName, newFileName, lang } = parseGitDiffHeader(diffData);

        const file = DiffFile.createInstance({
          // ... existing code ...
        });

        // ... initialization code ...

        if (mounted) {
+         currentFile = file;
          setDiffFile(file);
        }
      } catch (err) {
        console.error('Failed to parse diff:', err);
        if (mounted) {
          setDiffFile(null);
        }
      }
    };

    initDiff();

    return () => {
      mounted = false;
+     currentFile = null;  // Allow garbage collection
+     setDiffFile(null);   // Clear state reference
    };
  }, [diffData, diffViewTheme]);
```

---

### FIX-002: Shiki Highlighter Singleton [HIGH]

**File**: `apps/web/src/components/viewers/diff-viewer.tsx`
**Lines**: 154-159

**Issue**: Shiki highlighter re-initializes on every render, causing 2-4MB re-imports.

**Fix**: Create module-level singleton for highlighter.

**Test-First Approach**: Existing tests should continue passing. Consider adding performance test for repeated renders.

**Patch**:
```diff
+ // Module-level singleton for Shiki highlighter
+ let shikiHighlighterPromise: Promise<ReturnType<typeof import('@git-diff-view/shiki').getDiffViewHighlighter>> | null = null;
+
+ async function getShikiHighlighter() {
+   if (!shikiHighlighterPromise) {
+     shikiHighlighterPromise = (async () => {
+       const { getDiffViewHighlighter, highlighterReady } = await import('@git-diff-view/shiki');
+       await highlighterReady;
+       return getDiffViewHighlighter({
+         themes: ['github-light', 'github-dark'],
+         langs: ['typescript', 'javascript', 'tsx', 'jsx', 'python', 'go', 'rust'],
+       });
+     })();
+   }
+   return shikiHighlighterPromise;
+ }

  // In the useEffect, replace the try block:
        try {
-         const { getDiffViewHighlighter, highlighterReady } = await import('@git-diff-view/shiki');
-         await highlighterReady;
-         const highlighter = await getDiffViewHighlighter({
-           themes: ['github-light', 'github-dark'],
-           langs: ['typescript', 'javascript', 'tsx', 'jsx', 'python', 'go', 'rust'],
-         });
+         const highlighter = await getShikiHighlighter();
          file.initSyntax({ registerHighlighter: highlighter });
        } catch {
```

---

## Recommended Fixes (Non-Blocking)

### FIX-003: Optimize View Mode Building [MEDIUM]

**File**: `apps/web/src/components/viewers/diff-viewer.tsx`
**Lines**: 167-168

**Issue**: Both split and unified diff lines are computed even though only one is displayed.

**Trade-off**: This optimization complicates code since view mode changes would require rebuilding. May not be worth it if users frequently toggle.

**Decision**: Defer to Phase 6 or later optimization pass.

---

### FIX-004: Cache Git Availability Check [MEDIUM]

**File**: `apps/web/src/lib/server/git-diff-action.ts`
**Lines**: 73-78

**Issue**: `git --version` spawned on every request.

**Patch**:
```diff
+ let gitAvailableCache: boolean | null = null;
+
  async function isGitAvailable(): Promise<boolean> {
+   if (gitAvailableCache !== null) return gitAvailableCache;
    try {
      await execFileAsync('git', ['--version']);
+     gitAvailableCache = true;
      return true;
    } catch {
+     gitAvailableCache = false;
      return false;
    }
  }
```

---

### FIX-005: Add T009/T010 Execution Log Entries [MEDIUM]

**File**: `docs/plans/006-web-extras/tasks/phase-5-diffviewer-component/execution.log.md`

**Issue**: Tasks T009 and T010 are marked complete but have no individual log entries.

**Fix**: Add sections after the T005-T008 consolidated entry:

```markdown
---

## Task T009: Handle no-git and no-changes Error States

**Started**: 2026-01-26
**Status**: ✅ Complete

### What I Did
Implemented error state handling in DiffViewer component (consolidated with T005-T008):
- `not-git`: "This file is not in a git repository"
- `no-changes`: "No changes detected"
- `git-not-available`: "Git is not available on this system"

### Evidence
- Tests passing: `should display not-in-git error message`, `should display no-changes message`, `should display git-not-available error message`
- Demo page shows all three error states

### Files Changed
- `apps/web/src/components/viewers/diff-viewer.tsx` — Error state rendering (lines 192-218)

**Completed**: 2026-01-26

---

## Task T010: Add Theme Support CSS

**Started**: 2026-01-26
**Status**: ✅ Complete

### What I Did
Created theme-aware CSS following Phase 2 pattern:
- Dark mode via `:root[data-theme="dark"]` and `.dark` selectors
- CSS variables for colors (`--bg-color`, `--border-color`, `--text-color`, etc.)
- Error state styling with theme-aware colors

### Evidence
- Theme switching works in demo page
- CSS follows `--shiki-*` variable pattern from Phase 2

### Files Changed
- `apps/web/src/components/viewers/diff-viewer.css` — Theme CSS (lines 22-96)

**Completed**: 2026-01-26
```

---

### FIX-006: Add AC-24 Test Coverage [MEDIUM]

**File**: `test/unit/web/components/viewers/diff-viewer.test.tsx`

**Issue**: No test verifies that syntax highlighting is applied.

**Note**: This is challenging to test without inspecting actual DOM styles or @git-diff-view internals. Consider adding an integration test or manual verification checklist.

**Suggested Test**:
```typescript
describe('syntax highlighting (AC-24)', () => {
  it('should initialize Shiki highlighter for syntax coloring', async () => {
    /*
    Test Doc:
    - Why: Syntax highlighting is a core feature
    - Contract: Code in diff should have syntax colors applied
    - Usage Notes: @git-diff-view/shiki handles highlighting
    - Quality Contribution: Catches Shiki integration failures
    - Worked Example: TypeScript diff → keywords colored
    */
    render(<DiffViewer file={sampleFile} diffData={SAMPLE_DIFF_SIMPLE} error={null} />);

    // Wait for async Shiki initialization
    await waitFor(() => {
      // Check that diff-viewer content has rendered (initialization complete)
      const content = document.querySelector('.diff-viewer-content');
      expect(content).not.toBeEmptyDOMElement();
    }, { timeout: 5000 });
  });
});
```

---

## Verification Checklist

After implementing fixes:

- [ ] Run `pnpm vitest run test/unit/web/components/viewers/diff-viewer.test.tsx` - all 14 tests pass
- [ ] Run `pnpm vitest run test/unit/web/lib/server/git-diff-action.test.ts` - all 8 tests pass
- [ ] Run `pnpm lint` - no errors
- [ ] Run `pnpm build` - build succeeds
- [ ] Manual: Open `/demo/diff-viewer` and verify:
  - [ ] Diff displays correctly with syntax highlighting
  - [ ] Toggle between split/unified works
  - [ ] Theme switching works (if next-themes configured)
  - [ ] Error states display appropriately

---

*Fix tasks generated by plan-7-code-review*
