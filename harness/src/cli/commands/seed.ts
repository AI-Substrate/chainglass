import type { Command } from 'commander';
import { seedWorkspace } from '../../seed/seed-workspace.js';
import { ErrorCodes, exitWithEnvelope, formatError, formatSuccess } from '../output.js';

export function registerSeedCommand(program: Command): void {
  program
    .command('seed')
    .description('Create a test workspace for harness integration testing')
    .action(async () => {
      try {
        const result = await seedWorkspace();

        if (!result.registered) {
          exitWithEnvelope(
            formatError('seed', ErrorCodes.CONTAINER_NOT_RUNNING, 'Failed to register workspace in container. Is the container running?'),
          );
        }

        exitWithEnvelope(
          formatSuccess('seed', {
            ...result,
            message: result.created
              ? 'Test workspace created and registered'
              : 'Test workspace already exists, re-registered',
          }),
        );
      } catch (err: unknown) {
        exitWithEnvelope(
          formatError('seed', ErrorCodes.UNKNOWN, 'Seed failed', {
            message: (err as Error).message,
          }),
        );
      }
    });
}
