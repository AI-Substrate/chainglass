/**
 * Stub Handlers Tests
 *
 * Plan 047 Phase 3: Original tests for createSymbolSearchStub.
 * Plan 051: Stub removed — # prefix now handled by FlowSpace search.
 */

import { describe, expect, it } from 'vitest';

describe('stub-handlers (Plan 051: stub removed)', () => {
  it('does not export createSymbolSearchStub from panel-layout barrel', async () => {
    /*
    Test Doc:
    - Why: Verify stub was fully removed and no consumer can accidentally import it
    - Contract: Panel-layout barrel no longer exports createSymbolSearchStub
    - Usage Notes: Dynamic import to test export surface
    - Quality Contribution: Prevents regression of removed stub handler
    - Worked Example: import panel-layout → 'createSymbolSearchStub' not in exports
    */
    const panelLayout = await import(
      '../../../../../apps/web/src/features/_platform/panel-layout/index'
    );
    expect('createSymbolSearchStub' in panelLayout).toBe(false);
  });
});
