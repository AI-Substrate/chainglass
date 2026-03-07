import type { Command } from 'commander';
import { dockerUp, isDockerAvailable } from '../../docker/lifecycle.js';
import { probeAll } from '../../health/probe.js';
import { computePorts, describeAllocation } from '../../ports/allocator.js';
import { ErrorCodes, exitWithEnvelope, formatError, formatSuccess } from '../output.js';

const MAX_HEALTH_WAIT_MS = 120_000;
const POLL_INTERVAL_MS = 2_000;

export function registerDevCommand(program: Command): void {
  program
    .command('dev')
    .description('Start the harness container and wait for health')
    .action(async () => {
      if (!(await isDockerAvailable())) {
        exitWithEnvelope(formatError('dev', ErrorCodes.DOCKER_UNAVAILABLE, 'Docker is not available'));
      }

      const ports = computePorts();
      process.stderr.write(`${describeAllocation(ports)}\n`);

      const upResult = await dockerUp();
      if (upResult.exitCode !== 0) {
        exitWithEnvelope(
          formatError('dev', ErrorCodes.BUILD_FAILED, 'Failed to start container', {
            stderr: upResult.stderr.slice(-500),
          }),
        );
      }

      // Poll for health
      const start = Date.now();
      let lastHealth = await probeAll(ports);

      while (lastHealth.status !== 'ok' && Date.now() - start < MAX_HEALTH_WAIT_MS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        lastHealth = await probeAll(ports);
      }

      if (lastHealth.status === 'down') {
        exitWithEnvelope(
          formatError('dev', ErrorCodes.HEALTH_FAILED, 'Harness did not become healthy', {
            health: lastHealth,
          }),
        );
      }

      const elapsed = Math.round((Date.now() - start) / 1000);
      exitWithEnvelope(
        formatSuccess(
          'dev',
          {
            message: `Harness ready in ${elapsed}s`,
            endpoints: {
              app: `http://127.0.0.1:${ports.app}`,
              cdp: `http://127.0.0.1:${ports.cdp}`,
              terminal: `ws://127.0.0.1:${ports.terminal}`,
            },
            health: lastHealth,
          },
          lastHealth.status,
        ),
      );
    });
}
