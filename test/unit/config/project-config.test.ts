import { existsSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getProjectConfigDir } from '../../../packages/shared/src/config/paths/project-config.js';

/**
 * Unit tests for getProjectConfigDir() - Git-style walk-up project config discovery.
 *
 * Per Critical Discovery 06 and DYK-06, this function must:
 * - Walk up from CWD until finding .chainglass/ directory
 * - Return null if no .chainglass/ found (not an error)
 * - NOT cache results (each call walks fresh for test isolation)
 * - Stop at filesystem root
 */
describe('getProjectConfigDir', () => {
  let tempRoot: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    const { mkdtemp, realpath } = await import('node:fs/promises');
    // Use realpath to resolve symlinks (macOS /var → /private/var)
    tempRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), 'chainglass-project-test-')));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    const { rm } = await import('node:fs/promises');
    await rm(tempRoot, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  describe('discovery', () => {
    it('should find .chainglass in current directory', () => {
      /*
      Test Doc:
      - Why: Simplest case - .chainglass in CWD
      - Contract: getProjectConfigDir() returns CWD/.chainglass when present
      - Usage Notes: Returns directory path, not config file path
      - Quality Contribution: Catches basic discovery logic errors
      - Worked Example: CWD=/project with /project/.chainglass/ → /project/.chainglass
      */
      const projectDir = path.join(tempRoot, 'project');
      const configDir = path.join(projectDir, '.chainglass');
      mkdirSync(configDir, { recursive: true });
      process.chdir(projectDir);

      const result = getProjectConfigDir();

      expect(result).toBe(configDir);
    });

    it('should walk up to find .chainglass in parent directory', () => {
      /*
      Test Doc:
      - Why: Config at project root, CWD in subdirectory
      - Contract: getProjectConfigDir() walks up parent chain to find .chainglass
      - Usage Notes: Like git - config applies to entire tree
      - Quality Contribution: Catches walk-up logic errors
      - Worked Example: CWD=/project/src/deep → /project/.chainglass
      */
      const projectDir = path.join(tempRoot, 'project');
      const configDir = path.join(projectDir, '.chainglass');
      const deepDir = path.join(projectDir, 'src', 'components', 'deep');
      mkdirSync(configDir, { recursive: true });
      mkdirSync(deepDir, { recursive: true });
      process.chdir(deepDir);

      const result = getProjectConfigDir();

      expect(result).toBe(configDir);
    });

    it('should return null at filesystem root when no .chainglass found', () => {
      /*
      Test Doc:
      - Why: No .chainglass anywhere in tree - valid scenario
      - Contract: getProjectConfigDir() returns null (not throws) when not found
      - Usage Notes: Caller should check for null and use user config only
      - Quality Contribution: Ensures graceful handling of no-project-config
      - Worked Example: CWD=/tmp/no-project → null
      */
      // Create directory without .chainglass
      const noConfigDir = path.join(tempRoot, 'no-config-here');
      mkdirSync(noConfigDir, { recursive: true });
      process.chdir(noConfigDir);

      const result = getProjectConfigDir();

      expect(result).toBeNull();
    });

    it('should check root directory for .chainglass', () => {
      /*
      Test Doc:
      - Why: Edge case - .chainglass at filesystem root level
      - Contract: Walk-up includes root directory in search
      - Usage Notes: Unlikely but should not crash
      - Quality Contribution: Boundary condition coverage
      - Worked Example: Root-level project config is found
      */
      // This test verifies the algorithm checks root before returning null
      // We can't actually create .chainglass at root, so we verify the walk
      // reaches tempRoot and finds .chainglass there
      const configDir = path.join(tempRoot, '.chainglass');
      const deepDir = path.join(tempRoot, 'a', 'b', 'c');
      mkdirSync(configDir, { recursive: true });
      mkdirSync(deepDir, { recursive: true });
      process.chdir(deepDir);

      const result = getProjectConfigDir();

      expect(result).toBe(configDir);
    });
  });

  describe('caching behavior (DYK-06)', () => {
    it('should return fresh result on each call (no cache)', () => {
      /*
      Test Doc:
      - Why: Caching causes test isolation issues in parallel Vitest (DYK-06)
      - Contract: Each call walks up fresh - different CWD yields different result
      - Usage Notes: One-time startup call, microsecond perf acceptable
      - Quality Contribution: Ensures test isolation, no flaky tests
      - Worked Example: Call from dirA → A's config; chdir to dirB; call → B's config
      */
      // Create two separate projects
      const projectA = path.join(tempRoot, 'projectA');
      const projectB = path.join(tempRoot, 'projectB');
      const configA = path.join(projectA, '.chainglass');
      const configB = path.join(projectB, '.chainglass');
      mkdirSync(configA, { recursive: true });
      mkdirSync(configB, { recursive: true });

      // First call from projectA
      process.chdir(projectA);
      const resultA = getProjectConfigDir();
      expect(resultA).toBe(configA);

      // Second call from projectB (should NOT return cached projectA result)
      process.chdir(projectB);
      const resultB = getProjectConfigDir();
      expect(resultB).toBe(configB);

      // Results should be different (no cache)
      expect(resultA).not.toBe(resultB);
    });
  });

  describe('edge cases', () => {
    it('should handle .chainglass as file (not directory) gracefully', () => {
      /*
      Test Doc:
      - Why: User might accidentally create file named .chainglass
      - Contract: Only directories named .chainglass are valid config dirs
      - Usage Notes: Files are skipped, search continues upward
      - Quality Contribution: Robustness against user mistakes
      - Worked Example: /project/.chainglass (file) → continues to parent
      */
      const { writeFileSync } = require('node:fs');
      const projectDir = path.join(tempRoot, 'file-project');
      mkdirSync(projectDir, { recursive: true });
      // Create .chainglass as a FILE, not directory
      writeFileSync(path.join(projectDir, '.chainglass'), 'not a directory');
      process.chdir(projectDir);

      // Should return null because .chainglass is not a directory
      const result = getProjectConfigDir();

      expect(result).toBeNull();
    });
  });
});
