/**
 * Tests for workspaceParams and workspaceParamsCache.
 *
 * Purpose: Verify shared workspace URL param parsing with defaults.
 * Quality Contribution: Ensures worktree param is consistently parsed
 *   across all workspace pages — prevents silent state loss.
 * Acceptance Criteria: AC-16, AC-17
 *
 * Domain: _platform/workspace-url
 * Plan: 041-file-browser Phase 2 (T004)
 */

import { workspaceParamsCache } from '@/lib/params/workspace.params';
import { describe, expect, it } from 'vitest';

describe('workspaceParamsCache', () => {
  it('defaults worktree to empty string when absent', () => {
    const result = workspaceParamsCache.parse({});
    expect(result.worktree).toBe('');
  });

  it('parses populated worktree param', () => {
    const result = workspaceParamsCache.parse({ worktree: '/home/jak/project' });
    expect(result.worktree).toBe('/home/jak/project');
  });

  it('ignores non-string worktree (array)', () => {
    const result = workspaceParamsCache.parse({ worktree: ['a', 'b'] });
    // parseAsString should handle this gracefully
    expect(typeof result.worktree).toBe('string');
  });
});
