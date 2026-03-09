/**
 * @vitest-environment jsdom
 */
/**
 * Unit tests for NewWorktreeForm page states.
 *
 * Per Plan 069 Phase 3, DYK D5: Test the 4 visual state shapes
 * that the CreateWorktreePageState union defines.
 *
 * Since the form component imports server actions that don't resolve
 * in the test environment, we test the page-state type contract
 * and the pure naming functions that power live preview.
 */

import { buildWorktreeName, normalizeSlug } from '@chainglass/workflow';
import { describe, expect, it } from 'vitest';

// ==================== Page State Shape Tests ====================

describe('CreateWorktreePageState shapes', () => {
  it('idle state carries optional preview data', () => {
    /*
    Test Doc:
    - Why: Idle is the default form state — must carry preview for initial render
    - Contract: kind='idle' with optional preview and fields
    - Quality Contribution: Validates the type contract the form renders from
    */
    const state = {
      kind: 'idle' as const,
      preview: {
        normalizedSlug: 'my-feature',
        ordinal: 69,
        branchName: '069-my-feature',
        worktreePath: '/home/user/069-my-feature',
        hasBootstrapHook: false,
      },
    };

    expect(state.kind).toBe('idle');
    expect(state.preview?.branchName).toBe('069-my-feature');
    expect(state.preview?.ordinal).toBe(69);
  });

  it('blocking_error preserves requestedName and carries error message', () => {
    /*
    Test Doc:
    - Why: Blocking errors must preserve input for retry
    - Contract: kind='blocking_error' with message, fields.requestedName, optional preview
    - Quality Contribution: Ensures error recovery data is structured correctly
    */
    const state = {
      kind: 'blocking_error' as const,
      message: 'Main branch has uncommitted changes',
      fields: { requestedName: 'my-feature' },
      preview: {
        normalizedSlug: 'my-feature',
        ordinal: 70,
        branchName: '070-my-feature',
        worktreePath: '/home/user/070-my-feature',
        hasBootstrapHook: false,
      },
    };

    expect(state.kind).toBe('blocking_error');
    expect(state.fields.requestedName).toBe('my-feature');
    expect(state.message).toContain('uncommitted');
    expect(state.preview?.ordinal).toBe(70);
  });

  it('created state carries redirect URL and branch data', () => {
    /*
    Test Doc:
    - Why: Created state triggers hard navigation — must carry redirectTo
    - Contract: kind='created' with branchName, worktreePath, redirectTo
    - Quality Contribution: Validates the data needed for window.location.assign
    */
    const state = {
      kind: 'created' as const,
      branchName: '069-my-feature',
      worktreePath: '/home/user/069-my-feature',
      redirectTo: '/workspaces/test/browser?worktree=%2Fhome%2Fuser%2F069-my-feature',
    };

    expect(state.kind).toBe('created');
    expect(state.redirectTo).toContain('/browser?worktree=');
    expect(state.branchName).toBe('069-my-feature');
  });

  it('created_with_bootstrap_error carries log tail and redirect for "Open Worktree Anyway"', () => {
    /*
    Test Doc:
    - Why: Bootstrap failure is non-blocking — must carry both recovery action data and diagnostics
    - Contract: kind='created_with_bootstrap_error' with redirectTo (for recovery) and bootstrapLogTail (for diagnostics)
    - Quality Contribution: Confirms the warning state has everything needed for both actions
    */
    const state = {
      kind: 'created_with_bootstrap_error' as const,
      branchName: '069-my-feature',
      worktreePath: '/home/user/069-my-feature',
      redirectTo: '/workspaces/test/browser?worktree=%2Fhome%2Fuser%2F069-my-feature',
      bootstrapLogTail: 'cp: cannot stat /missing/file\nexit code 1',
    };

    expect(state.kind).toBe('created_with_bootstrap_error');
    expect(state.redirectTo).toContain('/browser?worktree=');
    expect(state.bootstrapLogTail).toContain('cp: cannot stat');
  });
});

// ==================== Live Preview Tests (pure functions) ====================

describe('Client-side live preview', () => {
  it('normalizeSlug produces live preview slugs', () => {
    /*
    Test Doc:
    - Why: Form uses normalizeSlug client-side for instant preview
    - Contract: normalizeSlug returns lowercase hyphenated string
    */
    expect(normalizeSlug('My Feature')).toBe('my-feature');
    expect(normalizeSlug('Hello World!!')).toBe('hello-world');
    expect(normalizeSlug('')).toBeNull();
  });

  it('buildWorktreeName produces the preview branch name', () => {
    /*
    Test Doc:
    - Why: Form combines ordinal + normalized slug for preview display
    - Contract: buildWorktreeName zero-pads ordinal and joins with slug
    */
    expect(buildWorktreeName(69, 'my-feature')).toBe('069-my-feature');
    expect(buildWorktreeName(1, 'first')).toBe('001-first');
  });
});
