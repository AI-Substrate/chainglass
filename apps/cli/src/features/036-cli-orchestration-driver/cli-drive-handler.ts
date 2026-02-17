/**
 * CLI Drive Handler — Maps DriveEvent → terminal output, DriveResult → exit code.
 *
 * Consumer-domain (ADR-0012). Thin wrapper that calls handle.drive() with
 * the onEvent callback wired to console output.
 *
 * @packageDocumentation
 */

import type { DriveEvent, IGraphOrchestration } from '@chainglass/positional-graph';

export interface CliOutput {
  log(msg: string): void;
  error(msg: string): void;
}

const defaultOutput: CliOutput = {
  log: (msg: string) => console.log(msg),
  error: (msg: string) => console.error(msg),
};

export interface CliDriveOptions {
  readonly maxIterations?: number;
  readonly verbose?: boolean;
  readonly output?: CliOutput;
}

/**
 * Drive a graph to completion, printing status to terminal.
 * Returns exit code: 0 for complete, 1 for failed/max-iterations.
 */
export async function cliDriveGraph(
  handle: IGraphOrchestration,
  options: CliDriveOptions
): Promise<number> {
  const out = options.output ?? defaultOutput;

  const result = await handle.drive({
    maxIterations: options.maxIterations,
    actionDelayMs: 100,
    idleDelayMs: 10_000,
    onEvent: async (event: DriveEvent) => {
      switch (event.type) {
        case 'status':
          out.log(event.message);
          break;
        case 'iteration':
          if (options.verbose) {
            out.log(`  [iteration] ${event.message}`);
          }
          break;
        case 'idle':
          if (options.verbose) {
            out.log(`  [idle] ${event.message}`);
          }
          break;
        case 'error':
          out.error(`  [error] ${event.message}`);
          break;
        default: {
          const _exhaustive: never = event;
          out.log(`  [unknown] ${(_exhaustive as DriveEvent).type}`);
        }
      }
    },
  });

  return result.exitReason === 'complete' ? 0 : 1;
}
