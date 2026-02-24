/**
 * Changed Files Service Tests
 *
 * Purpose: Verify git diff --name-only returns changed file paths.
 * Acceptance Criteria: AC-22
 *
 * Phase 4: File Browser — Plan 041
 */

import {
  type ChangedFilesResult,
  getChangedFiles,
} from '@/features/041-file-browser/services/changed-files';
import { describe, expect, it } from 'vitest';

describe('getChangedFiles', () => {
  it('exports a function that returns a result type', () => {
    expect(typeof getChangedFiles).toBe('function');
  });

  // Note: Real git tests would need a fixture repo.
  // These test the non-git error path and return types.
  it('returns not-git error for non-git workspaces', async () => {
    const result = await getChangedFiles(`/tmp/definitely-not-a-git-repo-${Date.now()}`);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('not-git');
    }
  });
});
