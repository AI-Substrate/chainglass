/**
 * Integration test for `harness screenshot` CLI command.
 * Requires a running harness container with CDP available.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { describe, expect, it, afterAll } from 'vitest';
import { HarnessEnvelopeSchema } from '../../../src/cli/output.js';

const execFileAsync = promisify(execFile);
const CLI = path.resolve(import.meta.dirname ?? '.', '../../../src/cli/index.ts');
const RESULTS_DIR = path.resolve(import.meta.dirname ?? '.', '../../../results');

const cleanupFiles: string[] = [];

async function runCli(...args: string[]) {
  const { stdout } = await execFileAsync(
    'npx',
    ['tsx', CLI, ...args],
    { cwd: path.resolve(import.meta.dirname ?? '.', '../../..'), timeout: 30_000 },
  );
  return JSON.parse(stdout.trim());
}

afterAll(() => {
  for (const f of cleanupFiles) {
    try { unlinkSync(f); } catch {}
  }
});

describe('harness screenshot (integration)', () => {
  it('captures a screenshot and returns a valid envelope', async () => {
    /*
    Test Doc:
    - Why: Prove the CLI screenshot command connects to CDP and produces a real .png file.
    - Contract: harness screenshot <name> → HarnessEnvelope with data.filename, file exists on disk.
    - Usage Notes: Requires running container + CDP. Cleanup deletes the test file.
    - Quality Contribution: End-to-end proof of CDP connect → page load → screenshot pipeline.
    - Worked Example: `harness screenshot integ-test` → {"command":"screenshot","status":"ok","data":{"filename":"integ-test-desktop-lg.png",...}}
    */
    const result = await runCli('screenshot', 'integ-test');
    const parsed = HarnessEnvelopeSchema.parse(result);
    expect(parsed.command).toBe('screenshot');
    expect(parsed.status).toBe('ok');
    const data = parsed.data as Record<string, string>;
    expect(data.filename).toBe('integ-test-desktop-lg.png');
    const filePath = path.join(RESULTS_DIR, data.filename);
    cleanupFiles.push(filePath);
    expect(existsSync(filePath)).toBe(true);
  });

  it('rejects path-traversal names', async () => {
    /*
    Test Doc:
    - Why: Verify the screenshot command rejects names containing path traversal characters.
    - Contract: harness screenshot "../escape" → exit 1 with error envelope.
    - Usage Notes: This tests the FT-003 security fix.
    - Quality Contribution: Prevents agents from writing files outside results/.
    - Worked Example: `harness screenshot "../bad"` → {"command":"screenshot","status":"error","error":{"code":"E108",...}}
    */
    try {
      await execFileAsync(
        'npx',
        ['tsx', CLI, 'screenshot', '../escape'],
        { cwd: path.resolve(import.meta.dirname ?? '.', '../../..'), timeout: 10_000 },
      );
      // Should not reach here
      expect.unreachable('Should have exited with error');
    } catch (err: unknown) {
      const e = err as { stdout?: string; code?: number };
      const result = JSON.parse(e.stdout?.trim() ?? '{}');
      expect(result.status).toBe('error');
      expect(result.error.code).toBe('E108');
    }
  });
});
