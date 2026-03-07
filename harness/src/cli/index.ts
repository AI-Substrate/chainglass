#!/usr/bin/env node
/**
 * Harness CLI entry point.
 *
 * Agents invoke: `harness <command> [options]`
 * All commands return a HarnessEnvelope JSON to stdout.
 */

import { Command } from 'commander';
import { registerBuildCommand } from './commands/build.js';
import { registerDevCommand } from './commands/dev.js';
import { registerStopCommand } from './commands/stop.js';
import { registerHealthCommand } from './commands/health.js';
import { registerTestCommand } from './commands/test.js';
import { registerScreenshotCommand } from './commands/screenshot.js';
import { registerResultsCommand } from './commands/results.js';
import { registerPortsCommand } from './commands/ports.js';

export function createCli(): Command {
  const program = new Command()
    .name('harness')
    .version('0.1.0')
    .description('Agentic development harness for Chainglass');

  registerBuildCommand(program);
  registerDevCommand(program);
  registerStopCommand(program);
  registerHealthCommand(program);
  registerTestCommand(program);
  registerScreenshotCommand(program);
  registerResultsCommand(program);
  registerPortsCommand(program);

  return program;
}

// Run if executed directly (not imported for testing)
const isDirectRun = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js');
if (isDirectRun) {
  const program = createCli();
  program.parseAsync(process.argv);
}
