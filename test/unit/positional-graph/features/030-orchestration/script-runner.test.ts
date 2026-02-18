/*
Test Doc:
- Why: ScriptRunner is the real subprocess executor for code work units — must prove spawn/exit/stdout/stderr/kill
- Contract: spawn bash script, capture exit code + stdout + stderr; kill() terminates process
- Usage Notes: Tests create temp script files on disk. Use short scripts (echo, exit) for fast tests.
- Quality Contribution: Catches subprocess execution bugs, signal handling issues, env var propagation
- Worked Example: ScriptRunner.run({script:'echo hello'}) → {exitCode:0, stdout:'hello\n', stderr:''}
*/

import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ScriptRunner } from '../../../../../packages/positional-graph/src/features/030-orchestration/script-runner.js';

describe('ScriptRunner', () => {
  let tmpDir: string;
  let runner: ScriptRunner;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'script-runner-test-'));
    runner = new ScriptRunner();
  });

  afterEach(async () => {
    runner.kill();
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function writeScript(name: string, content: string): Promise<string> {
    const path = join(tmpDir, name);
    await writeFile(path, `#!/bin/bash\n${content}\n`);
    await chmod(path, 0o755);
    return path;
  }

  it('executes bash script and captures stdout', async () => {
    const script = await writeScript('hello.sh', 'echo "hello world"');

    const result = await runner.run({
      script,
      cwd: tmpDir,
      env: {},
      timeout: 10,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello world');
    expect(result.stderr).toBe('');
  });

  it('captures non-zero exit code', async () => {
    const script = await writeScript('fail.sh', 'exit 42');

    const result = await runner.run({
      script,
      cwd: tmpDir,
      env: {},
      timeout: 10,
    });

    expect(result.exitCode).toBe(42);
  });

  it('captures stderr', async () => {
    const script = await writeScript('err.sh', 'echo "oops" >&2\nexit 1');

    const result = await runner.run({
      script,
      cwd: tmpDir,
      env: {},
      timeout: 10,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.trim()).toBe('oops');
  });

  it('passes environment variables to script', async () => {
    const script = await writeScript('env.sh', 'echo "$MY_VAR"');

    const result = await runner.run({
      script,
      cwd: tmpDir,
      env: { MY_VAR: 'test-value' },
      timeout: 10,
    });

    expect(result.stdout.trim()).toBe('test-value');
  });

  it('kill() terminates running process', async () => {
    const script = await writeScript('slow.sh', 'sleep 30\necho "done"');

    const promise = runner.run({
      script,
      cwd: tmpDir,
      env: {},
      timeout: 30,
    });

    // Give it a moment to start
    await new Promise((r) => setTimeout(r, 100));
    runner.kill();

    const result = await promise;
    // Killed process returns non-zero
    expect(result.exitCode).not.toBe(0);
  });

  it('times out and kills process after timeout seconds', async () => {
    const script = await writeScript('hang.sh', 'sleep 30');

    const result = await runner.run({
      script,
      cwd: tmpDir,
      env: {},
      timeout: 1,
    });

    expect(result.exitCode).toBe(124);
    expect(result.stderr).toContain('timed out');
  });
});
