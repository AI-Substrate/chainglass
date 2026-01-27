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
import chalk from 'chalk';
import { Command, Help } from 'commander';
import { registerAgentCommands } from '../commands/agent.command.js';
import { registerInitCommand } from '../commands/init.command.js';
import { registerMcpCommand } from '../commands/mcp.command.js';
import { registerPhaseCommands } from '../commands/phase.command.js';
import { registerRunsCommands } from '../commands/runs.command.js';
import { registerSampleCommands } from '../commands/sample.command.js';
import { registerWebCommand } from '../commands/web.command.js';
import { registerWorkflowCommands } from '../commands/workflow.command.js';
import { registerWorkspaceCommands } from '../commands/workspace.command.js';

const BANNER = `${chalk.white.bold('chain')}${chalk.cyan.bold('glass')}`;
const TAGLINE = chalk.dim('Orchestrate AI workflows with elegance');

// Read version from package.json at build time
// For now, hardcode as we'll update build process later
const VERSION = '0.0.1';

// Section header styling
const section = (title: string) => chalk.yellow.bold(title);

/**
 * Custom help formatter with colorized output
 */
class ColoredHelp extends Help {
  formatHelp(cmd: Command, helper: Help): string {
    const indent = '  ';
    const lines: string[] = [];
    const isRootCommand = cmd.name() === 'cg';

    // Tagline (only for root)
    if (isRootCommand) {
      lines.push(`${indent}${TAGLINE}`);
      lines.push('');
    }

    // Usage section
    lines.push(section('USAGE'));
    if (isRootCommand) {
      lines.push(
        `${indent}${chalk.dim('$')} ${chalk.white.bold('cg')} ${chalk.cyan('<command>')} ${chalk.green('[options]')}`
      );
    } else {
      lines.push(
        `${indent}${chalk.dim('$')} ${chalk.white.bold('cg')} ${chalk.cyan(cmd.name())} ${chalk.green('[options]')}`
      );
    }
    lines.push('');

    // Description for subcommands
    if (!isRootCommand) {
      const desc = cmd.description();
      if (desc) {
        lines.push(section('DESCRIPTION'));
        lines.push(`${indent}${chalk.white(desc)}`);
        lines.push('');
      }
    }

    // Commands section (only for root)
    if (isRootCommand) {
      const visibleCommands = helper.visibleCommands(cmd);
      if (visibleCommands.length > 0) {
        const realCommands = visibleCommands.filter((c) => c.name() !== 'help');
        if (realCommands.length > 0) {
          lines.push(section('COMMANDS'));
          lines.push('');
          for (const subCmd of realCommands) {
            const name = subCmd.name();
            const cmdDesc = subCmd.description() || '';
            const hint =
              subCmd.name() === 'web'
                ? ' → localhost:3000'
                : subCmd.name() === 'mcp'
                  ? ' → stdio/sse'
                  : '';
            lines.push(
              `${indent}${chalk.cyan.bold(name.padEnd(10))}  ${chalk.white(cmdDesc)}${chalk.dim(hint)}`
            );
          }
          lines.push('');
        }
      }
    }

    // Options section
    const visibleOptions = helper.visibleOptions(cmd);
    if (visibleOptions.length > 0) {
      lines.push(section('OPTIONS'));
      lines.push('');
      for (const opt of visibleOptions) {
        const short = opt.short || '  ';
        const long = opt.long || '';
        const separator = opt.short && opt.long ? ', ' : '  ';
        const flagStr = `${short}${separator}${long}`;
        const optDesc = opt.description || '';
        // Show default value if present
        const defaultVal =
          opt.defaultValue !== undefined ? chalk.dim(` (default: ${opt.defaultValue})`) : '';
        lines.push(
          `${indent}${chalk.green(flagStr.padEnd(18))}  ${chalk.white(optDesc)}${defaultVal}`
        );
      }
      lines.push('');
    }

    // Examples section
    lines.push(section('EXAMPLES'));
    lines.push('');
    if (isRootCommand) {
      lines.push(
        `${indent}${chalk.dim('$')} ${chalk.cyan('cg web')}                    ${chalk.dim('# Start web UI on default port')}`
      );
      lines.push(
        `${indent}${chalk.dim('$')} ${chalk.cyan('cg web')} ${chalk.green('--port')} ${chalk.yellow('8080')}      ${chalk.dim('# Start on custom port')}`
      );
      lines.push(
        `${indent}${chalk.dim('$')} ${chalk.cyan('cg mcp')} ${chalk.green('--stdio')}            ${chalk.dim('# Start MCP server for Claude')}`
      );
    } else if (cmd.name() === 'web') {
      lines.push(
        `${indent}${chalk.dim('$')} ${chalk.cyan('cg web')}                    ${chalk.dim('# Start on default port 3000')}`
      );
      lines.push(
        `${indent}${chalk.dim('$')} ${chalk.cyan('cg web')} ${chalk.green('--port')} ${chalk.yellow('8080')}      ${chalk.dim('# Start on port 8080')}`
      );
      lines.push(
        `${indent}${chalk.dim('$')} ${chalk.cyan('cg web')} ${chalk.green('-p')} ${chalk.yellow('4000')}          ${chalk.dim('# Start on port 4000')}`
      );
    } else if (cmd.name() === 'mcp') {
      lines.push(
        `${indent}${chalk.dim('$')} ${chalk.cyan('cg mcp')} ${chalk.green('--stdio')}            ${chalk.dim('# Use with Claude Desktop')}`
      );
      lines.push(
        `${indent}${chalk.dim('$')} ${chalk.cyan('cg mcp')} ${chalk.green('--sse')}              ${chalk.dim('# Use SSE transport')}`
      );
    }
    lines.push('');

    // Quick start (only for root)
    if (isRootCommand) {
      lines.push(section('QUICK START'));
      lines.push('');
      lines.push(`${indent}${chalk.dim('$')} ${chalk.cyan('npx @chainglass/cli web')}`);
      lines.push('');
    }

    // Footer
    if (isRootCommand) {
      lines.push(
        chalk.dim(
          `${indent}Run ${chalk.cyan("'cg <command> --help'")} for detailed command information.`
        )
      );
    } else {
      lines.push(chalk.dim(`${indent}Run ${chalk.cyan("'cg --help'")} for all commands.`));
    }
    lines.push('');

    return lines.join('\n');
  }
}

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
    .description(`${BANNER} ${chalk.dim('—')} ${chalk.white('Agentic workflow orchestrator')}`)
    .addHelpText('beforeAll', `\n${BANNER} ${chalk.dim(`v${VERSION}`)}\n`);

  // Use custom colored help formatter (must be after program setup)
  program.configureHelp({
    formatHelp: (cmd, helper) => new ColoredHelp().formatHelp(cmd, helper),
  });

  // Register commands
  registerInitCommand(program);
  registerWebCommand(program);
  registerMcpCommand(program);
  registerPhaseCommands(program);
  registerWorkflowCommands(program);
  registerWorkspaceCommands(program);
  registerSampleCommands(program);
  registerRunsCommands(program);
  registerAgentCommands(program);

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
