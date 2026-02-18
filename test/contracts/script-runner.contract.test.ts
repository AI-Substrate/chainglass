/*
Test Doc:
- Why: IScriptRunner contract — proves FakeScriptRunner and real ScriptRunner have parity (R-TEST-008)
- Contract: Both implementations return ScriptRunResult with exitCode, stdout, stderr
- Usage Notes: Real runner needs temp script files on disk. Fake returns canned results.
- Quality Contribution: Catches fake/real drift when ScriptRunner changes
- Worked Example: run({script:'echo hello'}) → {exitCode:0, stdout contains 'hello'}
*/

import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ScriptRunner } from '../../packages/positional-graph/src/features/030-orchestration/script-runner.js';
import { FakeScriptRunner } from '../../packages/positional-graph/src/features/030-orchestration/script-runner.types.js';

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'contract-sr-'));
  await writeFile(join(tmpDir, 'ok.sh'), '#!/bin/bash\necho "contract-ok"\n');
  await writeFile(join(tmpDir, 'fail.sh'), '#!/bin/bash\necho "contract-err" >&2\nexit 1\n');
  await chmod(join(tmpDir, 'ok.sh'), 0o755);
  await chmod(join(tmpDir, 'fail.sh'), 0o755);
});

afterAll(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe('IScriptRunner contract', () => {
  it('real: exitCode 0 + stdout for successful script', async () => {
    const runner = new ScriptRunner();
    const result = await runner.run({
      script: join(tmpDir, 'ok.sh'),
      cwd: tmpDir,
      env: {},
      timeout: 10,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('contract-ok');
  });

  it('real: non-zero exitCode + stderr for failing script', async () => {
    const runner = new ScriptRunner();
    const result = await runner.run({
      script: join(tmpDir, 'fail.sh'),
      cwd: tmpDir,
      env: {},
      timeout: 10,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('contract-err');
  });

  it('fake: exitCode 0 + stdout for successful script', async () => {
    const runner = new FakeScriptRunner({ exitCode: 0, stdout: 'contract-ok\n' });
    const result = await runner.run({
      script: join(tmpDir, 'ok.sh'),
      cwd: tmpDir,
      env: {},
      timeout: 10,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('contract-ok');
  });

  it('fake: non-zero exitCode + stderr for failing script', async () => {
    const runner = new FakeScriptRunner({ exitCode: 1, stderr: 'contract-err\n' });
    const result = await runner.run({
      script: join(tmpDir, 'fail.sh'),
      cwd: tmpDir,
      env: {},
      timeout: 10,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('contract-err');
  });
});
