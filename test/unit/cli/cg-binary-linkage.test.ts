/**
 * Test: Verify `cg` CLI binary is linked to this repository.
 *
 * The global `cg` command is installed via `pnpm link --global` from apps/cli.
 * If it points at a different branch checkout or stale repo, agent tests will
 * fail with cryptic schema errors (e.g., E157 "Unrecognized key: agentType").
 *
 * This test catches that early with an actionable error message.
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

describe('cg CLI binary linkage', () => {
  it('cg resolves to this repository (not a stale branch checkout)', () => {
    // Find the cg binary
    let cgPath: string;
    try {
      cgPath = execSync('which cg', { encoding: 'utf-8' }).trim();
    } catch {
      throw new Error(
        [
          'SETUP ERROR: `cg` command not found on PATH.',
          '',
          'Fix: Run from the repo root:',
          '  just install',
          '',
          'This builds the CLI and links it globally so `cg` is available.',
        ].join('\n')
      );
    }

    // Read the shim to find which cli.cjs it points at
    const shimContent = fs.readFileSync(cgPath, 'utf-8');
    const cliEntryMatch = shimContent.match(/substrate\/([^/]+)\/apps\/cli\/dist\/cli\.cjs/);

    if (!cliEntryMatch) {
      // Non-standard shim — try running cg and checking it works
      try {
        execSync('cg --version', { encoding: 'utf-8', timeout: 5000 });
        return; // cg works, just not a standard pnpm shim — pass
      } catch {
        throw new Error(
          [
            'SETUP ERROR: `cg` shim does not point at a recognized CLI entrypoint.',
            '',
            'Fix: Run from the repo root:',
            '  just install',
          ].join('\n')
        );
      }
    }

    // Extract the folder name from the shim path
    const shimFolder = cliEntryMatch[1];
    const repoFolder = path.basename(REPO_ROOT);

    expect(
      shimFolder,
      [
        `STALE CLI: \`cg\` points at "${shimFolder}" but this repo is "${repoFolder}".`,
        '',
        `  cg shim: ${cgPath}`,
        `  points at: substrate/${shimFolder}/apps/cli/dist/cli.cjs`,
        `  expected:  substrate/${repoFolder}/apps/cli/dist/cli.cjs`,
        '',
        'This causes agent tests to fail with schema errors (E157) because',
        'the old CLI does not recognize fields added in this branch.',
        '',
        'Fix: Run from this repo root:',
        '  just install',
        '',
        'This rebuilds and relinks `cg` to the current branch.',
      ].join('\n')
    ).toBe(repoFolder);
  });
});
