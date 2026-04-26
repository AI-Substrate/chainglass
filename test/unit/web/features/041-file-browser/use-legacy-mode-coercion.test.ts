/**
 * useLegacyModeCoercion Hook Tests
 *
 * Purpose: Verify bookmarked `?mode=edit` URLs are normalised to `?mode=source`
 *          on mount via `setParams({ mode: 'source' }, { history: 'replace' })`.
 *
 * Quality Contribution: Closes F002 from the Phase 5 code review
 *          (AC-02 automation gap). Prior to this test, the coercion was only
 *          verified via manual browser load + grep on the execution log; now
 *          a regression in the effect body or dependency array would fail
 *          this suite.
 *
 * Acceptance Criteria: AC-02 (Plan 083 Phase 5)
 *
 * Plan 083 Phase 5 follow-up — Finding F002.
 */

import { useLegacyModeCoercion } from '@/features/041-file-browser/hooks/use-legacy-mode-coercion';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * Fake setParams recorder (Constitution §4 / R-TEST-007 — no vi.fn allowed).
 * Records every invocation so tests can assert call shape + count.
 */
class FakeSetParams {
  readonly calls: Array<{
    update: { mode: 'source' | 'rich' | 'preview' | 'diff' };
    options?: { history?: 'push' | 'replace' };
  }> = [];

  readonly fn = (
    update: { mode: 'source' | 'rich' | 'preview' | 'diff' },
    options?: { history?: 'push' | 'replace' }
  ): void => {
    this.calls.push({ update, options });
  };
}

describe('useLegacyModeCoercion', () => {
  /*
  Test Doc:
  - Why: AC-02 — bookmarked `?mode=edit` URLs from before the Plan 083 rename must
    silently normalise to `?mode=source` so users don't see a broken mode on load.
  - Contract: when `currentMode === 'edit'`, the hook calls `setParams` exactly once
    with `{ mode: 'source' }` and `{ history: 'replace' }`.
  - Usage Notes: `FakeSetParams` is a full call-recorder class (no `vi.fn` per
    R-TEST-007). Assertions read `fake.calls` directly.
  - Quality Contribution: pins both halves of the coercion — the mode value and
    the `history: 'replace'` option — so a future refactor cannot silently push a
    new history entry (which would pollute back-button navigation).
  - Worked Example: renderHook with `currentMode='edit'` → `fake.calls` contains
    exactly one entry `{ update: { mode: 'source' }, options: { history: 'replace' } }`.
  */
  it('coerces legacy mode="edit" to "source" with history.replace on mount', () => {
    const fake = new FakeSetParams();
    renderHook(() => useLegacyModeCoercion('edit', fake.fn));

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toEqual({
      update: { mode: 'source' },
      options: { history: 'replace' },
    });
  });

  /*
  Test Doc:
  - Why: Non-legacy modes must be left alone so the hook is a no-op on the hot
    path. A stray setParams call here would trigger an infinite render loop via
    the effect's dependency array.
  - Contract: for any mode that is NOT the literal string `'edit'`, `setParams`
    must not be called.
  - Usage Notes: parametrised via `it.each` across the current ViewerMode union
    plus `null`/`undefined` (URL param unset on first render).
  - Quality Contribution: guards against a typo'd equality flip (e.g. `!==` vs
    `===`) that would call setParams on every render for every mode.
  - Worked Example: renderHook with `currentMode='source'` → `fake.calls.length === 0`.
  */
  it.each([['source'], ['rich'], ['preview'], ['diff'], [null], [undefined]])(
    'does not call setParams for non-legacy mode=%p',
    (mode) => {
      const fake = new FakeSetParams();
      renderHook(() => useLegacyModeCoercion(mode, fake.fn));

      expect(fake.calls).toHaveLength(0);
    }
  );

  /*
  Test Doc:
  - Why: Effect must re-fire if the URL flips to edit mid-session (e.g. user
    pastes a bookmarked `?mode=edit` URL into the address bar while the tab is
    open). The dependency array must include `currentMode`.
  - Contract: rerendering the hook with a changed `currentMode='edit'` after an
    initial non-edit mount triggers exactly one coercion call.
  - Usage Notes: uses `rerender` with a stable `setParams` reference so the
    effect's dependency-array boundary (not identity) is what drives re-fires.
  - Quality Contribution: catches a regression where the effect's deps were
    shortened to `[]` (mount-only), which would break back/forward navigation.
  - Worked Example: mount with mode='source' → rerender with mode='edit' →
    `fake.calls` contains exactly one `{ mode: 'source', history: 'replace' }` entry.
  */
  it('re-fires when currentMode changes to "edit" after mount', () => {
    const fake = new FakeSetParams();
    const { rerender } = renderHook(
      ({ mode }: { mode: string | null }) => useLegacyModeCoercion(mode, fake.fn),
      { initialProps: { mode: 'source' as string | null } }
    );

    expect(fake.calls).toHaveLength(0);

    rerender({ mode: 'edit' });

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toEqual({
      update: { mode: 'source' },
      options: { history: 'replace' },
    });
  });
});
