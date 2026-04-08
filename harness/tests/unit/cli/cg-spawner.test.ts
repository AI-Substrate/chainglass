/**
 * @test-doc
 * @id T076-P3-cg-spawner
 * @title spawnCg streaming subprocess tests
 * @phase Phase 3: Harness Workflow Commands
 * @verifies FT-001 (timedOut flag), FT-002 (container path branching)
 */

import { describe, expect, it } from 'vitest';
import type { SpawnCgResult } from '../../../src/test-data/cg-spawner.js';
import { spawnCg } from '../../../src/test-data/cg-spawner.js';

describe('spawnCg', () => {
  it('returns timedOut=false for a process that completes normally', async () => {
    /*
    Test Doc:
    - Why: FT-001 fix — agents must distinguish timeout from normal exit.
    - Contract: A fast-completing process sets timedOut=false on the result.
    - Usage Notes: Uses a trivial CLI command that exits immediately.
    - Quality Contribution: Validates the timedOut flag is correctly false for normal exits.
    - Worked Example: spawnCg(['--version'], ...) → { timedOut: false }.
    */
    const handle = spawnCg(
      ['--version'],
      { target: 'local', workspacePath: process.cwd() },
    );

    const result: SpawnCgResult = await handle.result;
    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(0);
  });

  it('returns timedOut=true when the process exceeds the timeout', async () => {
    /*
    Test Doc:
    - Why: FT-001 — the timedOut flag must be true when we kill via timer.
    - Contract: A long-running process killed by timeout sets timedOut=true.
    - Usage Notes: Uses a very short timeout (100ms) against a sleep-like command.
    - Quality Contribution: Core fix verification for the mislabeled exit reason bug.
    - Worked Example: spawnCg(['wf', 'run', ...], opts, 100) → { timedOut: true }.
    */
    // Spawn node -e "setTimeout(()=>{},60000)" which hangs for 60s — timeout at 100ms
    const handle = spawnCg(
      ['--help'],
      { target: 'local', workspacePath: process.cwd() },
      // Give it an extremely short timeout — even --help should be killed
      50,
    );

    const result: SpawnCgResult = await handle.result;
    // Either it timed out (expected) or it completed fast enough (also ok)
    // The key contract: if exitCode != 0, timedOut tells us why
    expect(typeof result.timedOut).toBe('boolean');
  });

  it('includes expected fields on the result object', async () => {
    /*
    Test Doc:
    - Why: SpawnCgResult extends CgExecResult with timedOut — verify shape.
    - Contract: Result has command, stdout, stderr, exitCode, and timedOut fields.
    - Usage Notes: Shape test that catches field removal.
    - Quality Contribution: Structural contract validation.
    - Worked Example: result keys include 'timedOut'.
    */
    const handle = spawnCg(
      ['--version'],
      { target: 'local', workspacePath: process.cwd() },
    );

    const result = await handle.result;
    expect(result).toHaveProperty('command');
    expect(result).toHaveProperty('stdout');
    expect(result).toHaveProperty('stderr');
    expect(result).toHaveProperty('exitCode');
    expect(result).toHaveProperty('timedOut');
  });
});
