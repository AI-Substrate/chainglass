/**
 * CLI Drive Handler — Maps DriveEvent → terminal output, DriveResult → exit code.
 *
 * Consumer-domain (ADR-0012). Thin wrapper that calls handle.drive() with
 * the onEvent callback wired to console output.
 *
 * @packageDocumentation
 */

import type { DriveEvent, IGraphOrchestration } from '@chainglass/positional-graph';

export interface CliDriveOptions {
  readonly maxIterations?: number;
  readonly verbose?: boolean;
}

/**
 * Drive a graph to completion, printing status to terminal.
 * Returns exit code: 0 for complete, 1 for failed/max-iterations.
 */
export async function cliDriveGraph(
  handle: IGraphOrchestration,
  options: CliDriveOptions
): Promise<number> {
  const result = await handle.drive({
    maxIterations: options.maxIterations,
    actionDelayMs: 100,
    idleDelayMs: 10_000,
    onEvent: async (event: DriveEvent) => {
      switch (event.type) {
        case 'status':
          console.log(event.message);
          break;
        case 'iteration':
          if (options.verbose) {
            console.log(`  [iteration] ${event.message}`);
          }
          break;
        case 'idle':
          if (options.verbose) {
            console.log(`  [idle] ${event.message}`);
          }
          break;
        case 'error':
          console.error(`  [error] ${event.message}`);
          break;
      }
    },
  });

  return result.exitReason === 'complete' ? 0 : 1;
}
