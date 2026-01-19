#!/usr/bin/env node
/**
 * cg - Chainglass CLI entry point
 *
 * This is the main entry point for the Chainglass CLI.
 * It sets up Commander.js with commands for web and mcp.
 *
 * Usage:
 *   cg              - Show help (default behavior)
 *   cg web          - Start production web server
 *   cg mcp          - Start MCP server (Phase 5)
 *   cg --help       - Show help
 *   cg --version    - Show version
 */
import { Command } from 'commander';
import { registerWebCommand } from '../commands/web.command.js';
import { registerMcpCommand } from '../commands/mcp.command.js';

// Read version from package.json at build time
// For now, hardcode as we'll update build process later
const VERSION = '0.0.1';

interface CreateProgramOptions {
  /**
   * When true, enables test-safe behavior:
   * - exitOverride(): Throws CommanderError instead of process.exit()
   * - configureOutput(): Suppresses output to prevent test pollution
   *
   * Critical Insight #1: Commander.js --version and --help call process.exit(0),
   * which terminates the test runner. testMode prevents this.
   */
  testMode?: boolean;
}

/**
 * Create the Commander.js program instance.
 *
 * @param options - Configuration options
 * @param options.testMode - Enable test-safe behavior (exitOverride + configureOutput)
 * @returns Configured Commander program
 */
export function createProgram(options: CreateProgramOptions = {}): Command {
  const program = new Command();

  // Configure test mode if enabled
  if (options.testMode) {
    program.exitOverride(); // Throw CommanderError instead of process.exit()
    program.configureOutput({
      writeOut: () => {}, // Suppress stdout
      writeErr: () => {}, // Suppress stderr
    });
  }

  program
    .name('cg')
    .version(VERSION, '-V, --version', 'Show version number')
    .description('Chainglass - Agentic workflow orchestrator')
    .addHelpText(
      'after',
      `
Examples:
  $ cg web                  Start web UI on http://localhost:3000
  $ cg web --port 8080      Start web UI on custom port

Quick Start:
  $ npx @chainglass/cli web

Run 'cg <command> --help' for detailed command information.`
    );

  // Register commands
  registerWebCommand(program);
  registerMcpCommand(program);

  // Default behavior: show help when no command provided
  if (!options.testMode) {
    program.action(() => {
      program.help();
    });
  }

  return program;
}

// Run CLI if this is the main entry point
// Check if we're being executed directly (not imported)
// Note: When invoked via npm link/npx, argv[1] may be the bin name without extension
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('/cg') ||
    process.argv[1].endsWith('/chainglass') ||
    process.argv[1].endsWith('cg.ts') ||
    process.argv[1].endsWith('cg.js') ||
    process.argv[1].endsWith('cli.js') ||
    process.argv[1].endsWith('cli.cjs'));

if (isMain) {
  const program = createProgram();

  // Handle no arguments -> show help
  if (process.argv.length <= 2) {
    program.help();
  } else {
    program.parse(process.argv);
  }
}
