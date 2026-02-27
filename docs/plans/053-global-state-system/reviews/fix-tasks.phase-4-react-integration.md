# Fix Tasks: Phase 4: React Integration

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Reconcile AC-31 across implementation and authoritative artifacts
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/state/state-provider.tsx
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-spec.md
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-4-react-integration/tasks.md
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-4-react-integration/tasks.fltplan.md
- **Issue**: AC-31 is still mandatory in spec/plan, but implementation and phase artifacts explicitly drop it.
- **Fix**: Choose one canonical behavior and align all artifacts:
  1) keep AC-31 and implement fallback + tests, or
  2) formally remove AC-31 from authoritative criteria and progress tracking.
- **Patch hint**:
  ```diff
  - - **AC-31**: `GlobalStateProvider` gracefully degrades on bootstrap error — returns a no-op state system instead of crashing the component tree
  + - **AC-31**: (Removed by Phase 4 decision DYK-18; provider is fail-fast on bootstrap errors)
  ```

## Medium / Low Fixes

### FT-002: Use state barrel import from providers.tsx
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/apps/web/src/components/providers.tsx
- **Issue**: Cross-domain consumer imports provider from internal file path.
- **Fix**: Import from `../lib/state` contract barrel.
- **Patch hint**:
  ```diff
  -import { GlobalStateProvider } from '../lib/state/state-provider';
  +import { GlobalStateProvider } from '../lib/state';
  ```

### FT-003: Replace deep fake import with package contract export
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/use-global-state.test.tsx
- **Issue**: Test bypasses package boundary by importing fake from `packages/shared/src/...`.
- **Fix**: Import from `@chainglass/shared/fakes`.
- **Patch hint**:
  ```diff
  -import { FakeGlobalStateSystem } from '../../../../packages/shared/src/fakes/fake-state-system';
  +import { FakeGlobalStateSystem } from '@chainglass/shared/fakes';
  ```

### FT-004: Remove stale Phase 4 note from state domain doc
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/state/domain.md
- **Issue**: Source Location section still states hooks/provider are "not yet created."
- **Fix**: Delete/update stale note so Source Location, Contracts, and History sections are internally consistent.
- **Patch hint**:
  ```diff
  -*Note: Implementation files (apps/web) exist. React hooks + provider (Phase 4) and exemplar (Phase 5) not yet created.*
  +*Note: Phase 4 hooks/provider are implemented. Exemplar wiring remains Phase 5 scope.*
  ```

### FT-005: Add provider singleton test coverage for AC-30
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/use-global-state.test.tsx
- **Issue**: Current tests do not directly prove one-time provider initialization across re-renders.
- **Fix**: Add a provider-level test that re-renders and confirms the same instance is retained.
- **Patch hint**:
  ```diff
  +it('creates GlobalStateSystem once per mount (AC-30)', () => {
  +  // render provider + consumer, trigger rerender, assert service identity is stable
  +});
  ```

### FT-006: Add RED→GREEN evidence to phase execution log
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-4-react-integration/execution.log.md
- **Issue**: Full-TDD process is asserted but not evidenced with concrete failing-first and passing outputs.
- **Fix**: Add per-task command outputs (or CI links/IDs) showing RED then GREEN.
- **Patch hint**:
  ```diff
  +**RED Evidence**:
  +```
  +$ pnpm vitest run test/unit/web/state/use-global-state.test.tsx
  +... failing output before implementation ...
  +```
  +
  +**GREEN Evidence**:
  +```
  +$ pnpm vitest run test/unit/web/state/use-global-state.test.tsx
  +✓ 9 passed
  +```
  ```

### FT-007: Add required Test Doc blocks to two hook tests
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/use-global-state.test.tsx
- **Issue**: Two tests are missing required 5-field Test Doc comments (R-TEST-002).
- **Fix**: Add complete Test Doc blocks for:
  - `returns undefined when no default provided and no value published`
  - `returns empty array when no entries match`
- **Patch hint**:
  ```diff
   it('returns undefined when no default provided and no value published', () => {
  +  /**
  +   * Why: ...
  +   * Contract: ...
  +   * Usage Notes: ...
  +   * Quality Contribution: ...
  +   * Worked Example: ...
  +   */
      const { result } = renderHook(() => useGlobalState<string>('test-domain:wf-1:status'), {
        wrapper,
      });
   ```

### FT-008: Clarify docs/plans artifact handling in domain manifest checks
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md
- **Issue**: Orphan-file validation is ambiguous for changed `docs/plans/**` artifacts.
- **Fix**: Add explicit exemption policy for plan artifacts or include them in manifest with a docs classification.
- **Patch hint**:
  ```diff
  +| `docs/plans/053-global-state-system/tasks/phase-4-react-integration/tasks.md` | `_platform/state` | docs-artifact | Phase dossier tracking for domain-owned implementation |
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
