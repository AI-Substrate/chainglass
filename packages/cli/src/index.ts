/**
 * @chainglass/cli entry point
 *
 * Exports the CLI program factory and command utilities.
 */

// Main program factory
export { createProgram } from './bin/cg.js';

// Command exports (for testing)
export {
  registerWebCommand,
  runWebCommand,
  findStandaloneAssets,
  validateStandaloneAssets,
} from './commands/web.command.js';
export { registerMcpCommand, runMcpCommand } from './commands/mcp.command.js';
