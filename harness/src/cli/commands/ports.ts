import type { Command } from 'commander';
import { computePorts, describeAllocation } from '../../ports/allocator.js';
import { exitWithEnvelope, formatSuccess } from '../output.js';

export function registerPortsCommand(program: Command): void {
  program
    .command('ports')
    .description('Show the port allocation for this worktree')
    .action(async () => {
      const ports = computePorts();
      process.stderr.write(`${describeAllocation(ports)}\n`);
      exitWithEnvelope(formatSuccess('ports', ports));
    });
}
