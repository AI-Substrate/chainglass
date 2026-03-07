/**
 * Integration test for `harness health` CLI command.
 * Requires a running harness container (docker compose up -d).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HarnessEnvelopeSchema } from '../../../src/cli/output.js';

const execFileAsync = promisify(execFile);
const CLI = path.resolve(import.meta.dirname ?? '.', '../../../src/cli/index.ts');

async function runCli(...args: string[]) {
  const { stdout } = await execFileAsync(
    'npx',
    ['tsx', CLI, ...args],
    { cwd: path.resolve(import.meta.dirname ?? '.', '../../..'), timeout: 30_000 },
  );
  return JSON.parse(stdout.trim());
}

describe('harness health (integration)', () => {
  it('returns a valid envelope with command=health', async () => {
    /*
    Test Doc:
    - Why: Prove the CLI health command produces a parseable, schema-valid envelope against the real harness.
    - Contract: harness health → HarnessEnvelope with command="health", status in {ok,degraded}, data.app/mcp/terminal/cdp present.
    - Usage Notes: Requires a running container. Skip if Docker is unavailable.
    - Quality Contribution: End-to-end proof that the CLI + SDK helpers + live runtime produce correct output.
    - Worked Example: `harness health` → {"command":"health","status":"ok","data":{"status":"ok","app":{"status":"up",...},...}}
    */
    const result = await runCli('health');
    const parsed = HarnessEnvelopeSchema.parse(result);
    expect(parsed.command).toBe('health');
    expect(['ok', 'degraded']).toContain(parsed.status);
    const data = parsed.data as Record<string, unknown>;
    expect(data).toHaveProperty('app');
    expect(data).toHaveProperty('mcp');
    expect(data).toHaveProperty('terminal');
    expect(data).toHaveProperty('cdp');
  });

  it('reports app as up when container is healthy', async () => {
    /*
    Test Doc:
    - Why: Verify the health command correctly detects the running Next.js dev server.
    - Contract: data.app.status === 'up' when the container is healthy.
    - Usage Notes: Requires the app to be responding on :3000.
    - Quality Contribution: Catches broken health probe logic before agents rely on it.
    - Worked Example: health.data.app → {"status":"up","code":"200"}
    */
    const result = await runCli('health');
    const data = result.data as Record<string, Record<string, string>>;
    expect(data.app.status).toBe('up');
  });
});
