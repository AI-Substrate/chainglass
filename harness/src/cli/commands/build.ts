import type { Command } from 'commander';
import { dockerBuild, isDockerAvailable } from '../../docker/lifecycle.js';
import { ErrorCodes, exitWithEnvelope, formatError, formatSuccess } from '../output.js';

export function registerBuildCommand(program: Command): void {
  program
    .command('build')
    .description('Build the harness Docker image')
    .action(async () => {
      if (!(await isDockerAvailable())) {
        exitWithEnvelope(formatError('build', ErrorCodes.DOCKER_UNAVAILABLE, 'Docker is not available'));
      }

      const result = await dockerBuild();

      if (result.exitCode !== 0) {
        exitWithEnvelope(
          formatError('build', ErrorCodes.BUILD_FAILED, 'Docker build failed', {
            stderr: result.stderr.slice(-500),
          }),
        );
      }

      exitWithEnvelope(formatSuccess('build', { message: 'Build complete' }));
    });
}
