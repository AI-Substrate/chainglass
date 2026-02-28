# Fix Tasks: Simple Mode (Built-in Content Search)

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Unblock `#` mode from FlowSpace availability gates
- **Severity**: HIGH
- **File(s)**:  
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx
- **Issue**: Grep (`#`) mode is currently blocked by `codeSearchAvailability` checks meant for FlowSpace, causing incorrect "FlowSpace not installed"/"Run fs2 scan" messages.
- **Fix**: Branch UI behavior by `mode`; apply availability checks only for semantic (`$`) mode, and allow grep mode to render loading/error/results independently.
- **Patch hint**:
  ```diff
  - {isFlowspaceMode && (codeSearchAvailability === 'not-installed' ? ... )}
  + {isFlowspaceMode && (mode === 'semantic' && codeSearchAvailability === 'not-installed' ? ... )}
  + {isFlowspaceMode && mode !== 'semantic' && codeSearchLoading ? ... }
  + {isFlowspaceMode && mode !== 'semantic' && hasFlowspaceQuery && !showFlowspaceResults ? <...>No matches</...> : null}
  ```

### FT-002: Prevent stale results in `useGitGrepSearch`
- **Severity**: HIGH
- **File(s)**:  
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/041-file-browser/hooks/use-git-grep-search.ts
- **Issue**: `fetchInProgressRef` early-return can drop updated debounced queries during in-flight requests; latest query may never execute.
- **Fix**: Replace boolean short-circuit with request versioning or abortable requests. Only apply response for latest request id.
- **Patch hint**:
  ```diff
  - if (fetchInProgressRef.current) return;
  - fetchInProgressRef.current = true;
  + const requestId = ++latestRequestIdRef.current;
  ...
  - .then((result) => { setResults(...) })
  + .then((result) => {
  +   if (requestId !== latestRequestIdRef.current) return;
  +   setResults(...);
  + })
  ```

### FT-003: Resolve Domain Manifest orphan-file violations
- **Severity**: HIGH
- **File(s)**:  
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/052-built-in-text-search/built-in-text-search-plan.md
- **Issue**: Three changed files are not listed in `## Domain Manifest`.
- **Fix**: Add rows for:
  - `apps/web/src/features/041-file-browser/hooks/use-flowspace-search.ts`
  - `apps/web/src/lib/server/flowspace-search-action.ts`
  - `apps/web/src/features/_platform/panel-layout/index.ts`
- **Patch hint**:
  ```diff
   | `apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx` | _platform/panel-layout | contract | ... |
  +| `apps/web/src/features/041-file-browser/hooks/use-flowspace-search.ts` | file-browser | internal | Supporting mode dispatch/type alignment |
  +| `apps/web/src/lib/server/flowspace-search-action.ts` | file-browser | internal | FlowSpace path alignment with shared code-search types |
  +| `apps/web/src/features/_platform/panel-layout/index.ts` | _platform/panel-layout | contract | Re-export updated code-search types |
   | `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | file-browser | internal | ... |
  ```

### FT-004: Add missing test and run evidence artifacts
- **Severity**: HIGH
- **File(s)**:  
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/041-file-browser/git-grep-action.test.ts  
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/052-built-in-text-search/execution.log.md
- **Issue**: Planned lightweight testing task (T007) has no evidence; no execution log exists.
- **Fix**: Add tests for parser/grouping/errors/limits and record exact command outputs in execution log.
- **Patch hint**:
  ```diff
  + describe('gitGrepSearch', () => {
  +   it('parses filepath:line:content output', ...);
  +   it('groups matches and caps to 20 files', ...);
  +   it('returns repo-required error outside git repo', ...);
  +   it('maps invalid regex to user-facing error', ...);
  + });
  ```

## Medium / Low Fixes

### FT-005: Harden git-grep query argument handling
- **Severity**: MEDIUM
- **File(s)**:  
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/server/git-grep-action.ts
- **Issue**: Query is passed positionally; leading `-` may be interpreted as an option.
- **Fix**: Pass query with `-e` in args list.
- **Patch hint**:
  ```diff
   const args = [
     'grep',
     '-n',
     '-i',
     ...(useRegex ? [] : ['-F']),
     '--untracked',
     '--max-count=5',
     '-I',
  -  query,
  +  '-e',
  +  query,
     '--',
     ...SOURCE_GLOBS,
   ];
  ```

### FT-006: Align empty-state wording and AC evidence
- **Severity**: MEDIUM
- **File(s)**:  
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx  
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/052-built-in-text-search/execution.log.md
- **Issue**: Empty-state copy is `"No results"` instead of AC-12 `"No matches"`, and AC-01 timing evidence is missing.
- **Fix**: Update string and include timing evidence in execution log.
- **Patch hint**:
  ```diff
  - <div className="...">No results</div>
  + <div className="...">No matches</div>
  ```

### FT-007: Refresh domain docs/map for Plan 052
- **Severity**: MEDIUM
- **File(s)**:  
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/file-browser/domain.md  
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/panel-layout/domain.md  
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md
- **Issue**: Domain artifacts still reference prior FlowSpace-only contract names and omit Plan 052 updates.
- **Fix**: Add Plan 052 history entries and update contracts/node/edge labels to `CodeSearch*` and grep-inclusive surfaces.
- **Patch hint**:
  ```diff
  - FlowSpaceSearchResult, FlowSpaceAvailability, FlowSpaceSearchMode
  + CodeSearchResult, CodeSearchAvailability, CodeSearchMode, GrepSearchResult, FlowSpaceSearchResult
  ```

### FT-008: Evaluate helper reuse for git preflight checks
- **Severity**: LOW
- **File(s)**:  
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/server/git-grep-action.ts  
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/server/git-diff-action.ts
- **Issue**: `isGitAvailable`/repo checks duplicate nearby server action logic.
- **Fix**: Prefer reusing existing helper or extracting shared module if divergence is not intentional.
- **Patch hint**:
  ```diff
  - let gitAvailableCache: boolean | null = null;
  - async function isGitAvailable() { ... }
  + import { isGitAvailable, isGitRepository } from './git-preflight';
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
