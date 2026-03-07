import type { Command } from 'commander';
import { probeAll } from '../../health/probe.js';
import { computePorts } from '../../ports/allocator.js';
import { exitWithEnvelope, formatSuccess } from '../output.js';

export function registerHealthCommand(program: Command): void {
  program
    .command('health')
    .description('Probe all harness endpoints and return structured status')
    .action(async () => {
      const ports = computePorts();
      const health = await probeAll(ports);
      exitWithEnvelope(formatSuccess('health', health, health.status === 'ok' ? 'ok' : 'degraded'));
    });
}
