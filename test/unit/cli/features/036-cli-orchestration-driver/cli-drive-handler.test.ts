/*
Test Doc:
- Why: Validate CLI drive handler maps DriveEvent → terminal output and DriveResult → exit code
- Contract: cliDriveGraph calls handle.drive() with options, maps events via injectable output, returns 0 on complete, 1 on failed
- Usage Notes: Uses FakeGraphOrchestration with setDriveResult() + setDriveEvents(). Injectable CliOutput captures logs.
- Quality Contribution: Catches event → output mapping errors and exit code bugs before CLI integration
- Worked Example: DriveResult{exitReason:'complete'} → exit code 0; DriveEvent{type:'status'} → output.log(message)
*/

import type { DriveResult } from '@chainglass/positional-graph';
import { FakeGraphOrchestration } from '@chainglass/positional-graph';
import { describe, expect, it } from 'vitest';
import {
  type CliOutput,
  cliDriveGraph,
} from '../../../../../apps/cli/src/features/036-cli-orchestration-driver/cli-drive-handler.js';
import { buildFakeReality } from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-onbas.js';
import type { FakeGraphConfig } from '../../../../../packages/positional-graph/src/features/030-orchestration/orchestration-service.types.js';

function makeConfig(): FakeGraphConfig {
  return {
    runResults: [],
    reality: buildFakeReality({ graphSlug: 'test-graph' }),
  };
}

function makeOutput(): CliOutput & { logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    logs,
    errors,
    log: (msg: string) => logs.push(msg),
    error: (msg: string) => errors.push(msg),
  };
}

const COMPLETE: DriveResult = { exitReason: 'complete', iterations: 3, totalActions: 5 };
const FAILED: DriveResult = { exitReason: 'failed', iterations: 1, totalActions: 0 };
const MAX_ITER: DriveResult = { exitReason: 'max-iterations', iterations: 200, totalActions: 0 };

describe('cliDriveGraph() exit codes', () => {
  it('returns 0 on complete', async () => {
    const fake = new FakeGraphOrchestration('g', makeConfig());
    fake.setDriveResult(COMPLETE);
    expect(await cliDriveGraph(fake, { output: makeOutput() })).toBe(0);
  });

  it('returns 1 on failed', async () => {
    const fake = new FakeGraphOrchestration('g', makeConfig());
    fake.setDriveResult(FAILED);
    expect(await cliDriveGraph(fake, { output: makeOutput() })).toBe(1);
  });

  it('returns 1 on max-iterations', async () => {
    const fake = new FakeGraphOrchestration('g', makeConfig());
    fake.setDriveResult(MAX_ITER);
    expect(await cliDriveGraph(fake, { output: makeOutput() })).toBe(1);
  });
});

describe('cliDriveGraph() options passthrough', () => {
  it('passes maxIterations to drive()', async () => {
    const fake = new FakeGraphOrchestration('g', makeConfig());
    fake.setDriveResult(COMPLETE);
    await cliDriveGraph(fake, { maxIterations: 50, output: makeOutput() });
    expect(fake.getDriveHistory()[0]?.maxIterations).toBe(50);
  });
});

describe('cliDriveGraph() DriveEvent → output mapping', () => {
  it('status event logs message', async () => {
    const fake = new FakeGraphOrchestration('g', makeConfig());
    fake.setDriveResult(COMPLETE);
    fake.setDriveEvents([{ type: 'status', message: 'Graph: test (in_progress)' }]);
    const out = makeOutput();
    await cliDriveGraph(fake, { output: out });
    expect(out.logs).toContain('Graph: test (in_progress)');
  });

  it('iteration event logs in verbose mode', async () => {
    const fake = new FakeGraphOrchestration('g', makeConfig());
    fake.setDriveResult(COMPLETE);
    fake.setDriveEvents([{ type: 'iteration', message: '1 action(s)', data: {} as never }]);
    const out = makeOutput();
    await cliDriveGraph(fake, { verbose: true, output: out });
    expect(out.logs.some((l) => l.includes('[iteration]'))).toBe(true);
  });

  it('iteration event silent without verbose', async () => {
    const fake = new FakeGraphOrchestration('g', makeConfig());
    fake.setDriveResult(COMPLETE);
    fake.setDriveEvents([{ type: 'iteration', message: '1 action(s)', data: {} as never }]);
    const out = makeOutput();
    await cliDriveGraph(fake, { verbose: false, output: out });
    expect(out.logs.some((l) => l.includes('[iteration]'))).toBe(false);
  });

  it('idle event logs in verbose mode', async () => {
    const fake = new FakeGraphOrchestration('g', makeConfig());
    fake.setDriveResult(COMPLETE);
    fake.setDriveEvents([{ type: 'idle', message: 'No actions — polling' }]);
    const out = makeOutput();
    await cliDriveGraph(fake, { verbose: true, output: out });
    expect(out.logs.some((l) => l.includes('[idle]'))).toBe(true);
  });

  it('idle event silent without verbose', async () => {
    const fake = new FakeGraphOrchestration('g', makeConfig());
    fake.setDriveResult(COMPLETE);
    fake.setDriveEvents([{ type: 'idle', message: 'No actions — polling' }]);
    const out = makeOutput();
    await cliDriveGraph(fake, { verbose: false, output: out });
    expect(out.logs.some((l) => l.includes('[idle]'))).toBe(false);
  });

  it('error event logs to stderr', async () => {
    const fake = new FakeGraphOrchestration('g', makeConfig());
    fake.setDriveResult(FAILED);
    fake.setDriveEvents([{ type: 'error', message: 'disk failure' }]);
    const out = makeOutput();
    await cliDriveGraph(fake, { output: out });
    expect(out.errors.some((l) => l.includes('[error]'))).toBe(true);
    expect(out.errors.some((l) => l.includes('disk failure'))).toBe(true);
  });
});
