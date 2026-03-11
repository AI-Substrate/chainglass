import type { Command } from 'commander';
import { dockerDown, isContainerRunning } from '../../docker/lifecycle.js';
import { ErrorCodes, exitWithEnvelope, formatError, formatSuccess } from '../output.js';

export function registerStopCommand(program: Command): void {
  program
    .command('stop')
    .description('Stop and remove the harness container')
    .action(async () => {
      const wasRunning = await isContainerRunning();
      const result = await dockerDown();

      if (result.exitCode !== 0) {
        exitWithEnvelope(
          formatError('stop', ErrorCodes.UNKNOWN, 'Failed to stop container', {
            stderr: result.stderr.slice(-500),
          }),
        );
      }

      exitWithEnvelope(
        formatSuccess('stop', {
          message: wasRunning ? 'Container stopped' : 'Container was already stopped',
          wasRunning,
        }),
      );
    });
}
