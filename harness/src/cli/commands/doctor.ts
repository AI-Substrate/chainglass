import type { Command } from 'commander';
import { diagnose, formatStderr } from '../../doctor/diagnose.js';
import { exitWithEnvelope, formatSuccess, formatError, ErrorCodes } from '../output.js';

const DEFAULT_WAIT_TIMEOUT = 300;
const POLL_INTERVAL_MS = 3_000;

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Run diagnostic checks and report actionable fixes (like flutter doctor)')
    .option('--wait [seconds]', 'Wait for harness to become healthy (default: 300s)')
    .action(async (opts: { wait?: string | true }) => {
      const waitMode = opts.wait !== undefined;
      const timeoutSec = typeof opts.wait === 'string' ? Number(opts.wait) : DEFAULT_WAIT_TIMEOUT;

      if (waitMode) {
        const startMs = Date.now();
        const deadlineMs = startMs + timeoutSec * 1000;
        let result = await diagnose();

        process.stderr.write(`${formatStderr(result)}\n`);

        while (!result.healthy && Date.now() < deadlineMs) {
          const elapsed = Math.round((Date.now() - startMs) / 1000);
          process.stderr.write(`\n⏳ Waiting for harness... (${elapsed}s/${timeoutSec}s)\n`);
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          result = await diagnose();
          process.stderr.write(`${formatStderr(result)}\n`);
        }

        if (result.healthy) {
          exitWithEnvelope(formatSuccess('doctor', result));
        } else {
          exitWithEnvelope(
            formatError('doctor', ErrorCodes.TIMEOUT, `Harness not healthy after ${timeoutSec}s`, result),
          );
        }
      } else {
        const result = await diagnose();
        process.stderr.write(`${formatStderr(result)}\n`);

        if (result.healthy) {
          exitWithEnvelope(formatSuccess('doctor', result));
        } else {
          exitWithEnvelope(
            formatError('doctor', ErrorCodes.HEALTH_FAILED, result.summary, result),
          );
        }
      }
    });
}
