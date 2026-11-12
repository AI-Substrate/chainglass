/**
 * Test: Verify `cg` CLI binary is linked to this repository.
 *
 * The global `cg` command is installed via `pnpm link --global` from apps/cli.
 * If it points at a different branch checkout or stale repo, agent tests will
 * fail with cryptic schema errors (e.g., E157 "Unrecognized key: agentType").
 *
 * This test catches that early with an actionable error message.
 */

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { SPAWN_WAIT_MS } from '../../load-bounds';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

describe('cg CLI binary linkage', () => {
  it('cg resolves to this repository (not a stale branch checkout)', async () => {
    // Find the cg binary — skip in CI where cg isn't globally linked
    let cgPath: string;
    try {
      cgPath = (await execFileAsync('which', ['cg'], { encoding: 'utf-8' })).stdout.trim();
    } catch {
      console.log('  [skip] `cg` not globally linked — run `just install` for local dev');
      return;
    }

    // Read the shim to find which cli.cjs it points at
    const shimContent = fs.readFileSync(cgPath, 'utf-8');
    const cliEntryMatch = shimContent.match(/substrate\/([^/]+)\/apps\/cli\/dist\/cli\.cjs/);

    if (!cliEntryMatch) {
      // Non-standard shim — try running cg and checking it works
      try {
        // `cg` is a Node CLI: at nice 19 on a loaded machine its start-up alone took over the
        // old 5 s budget, which then read as a broken shim.
        await execFileAsync('cg', ['--version'], { encoding: 'utf-8', timeout: SPAWN_WAIT_MS });
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
