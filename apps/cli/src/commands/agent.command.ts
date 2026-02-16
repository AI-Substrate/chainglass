/**
 * Agent command group for the CLI.
 *
 * Per Plan 034: Uses AgentManagerService / AgentInstance instead of AgentService.
 * Per DYK-P3#1: Default output is JSON result (no event handler).
 * Per DYK-P3#2: --stream, --verbose, --quiet are mutually exclusive.
 * Per DYK-P3#3: No timeout enforcement (intentional, agents run for hours).
 *
 * Commands:
 * - cg agent run    - Invoke an agent with a prompt
 * - cg agent compact - Reduce session context via /compact command
 */

import type { IAgentManagerService, IFileSystem, IPathResolver } from '@chainglass/shared';
import { SHARED_DI_TOKENS } from '@chainglass/shared';
import type { Command } from 'commander';
import { handleAgentCompact } from '../features/034-agentic-cli/agent-compact-handler.js';
import { handleAgentRun } from '../features/034-agentic-cli/agent-run-handler.js';
import { CLI_DI_TOKENS, createCliProductionContainer } from '../lib/container.js';

/**
 * Register the agent command group with the Commander program.
 */
export function registerAgentCommands(program: Command): void {
  const agent = program.command('agent').description('Invoke AI coding agents');

  // cg agent run
  agent
    .command('run')
    .description('Invoke an agent with a prompt')
    .requiredOption('-t, --type <type>', 'Agent type: claude-code or copilot')
    .option('-p, --prompt <text>', 'Prompt text')
    .option('-f, --prompt-file <path>', 'Path to file containing prompt')
    .option('-s, --session <id>', 'Session ID for resumption')
    .option('-c, --cwd <path>', 'Working directory for the agent')
    .option('--name <name>', 'Human-readable instance name')
    .option('--meta <key=value...>', 'Set metadata (repeatable)')
    .option('--stream', 'Stream events as NDJSON to stdout')
    .option('--verbose', 'Show agent events in human-readable format')
    .option('--quiet', 'Suppress all output')
    .action(async (options) => {
      try {
        const container = createCliProductionContainer();
        const agentManager = container.resolve<IAgentManagerService>(CLI_DI_TOKENS.AGENT_MANAGER);
        const fileSystem = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
        const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);

        const { exitCode } = await handleAgentRun(options, {
          agentManager,
          fileSystem,
          pathResolver,
        });
        process.exit(exitCode);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // cg agent compact
  agent
    .command('compact')
    .description('Reduce session context via /compact command')
    .requiredOption('-t, --type <type>', 'Agent type: claude-code or copilot')
    .requiredOption('-s, --session <id>', 'Session ID (required)')
    .option('-c, --cwd <path>', 'Working directory for the agent')
    .option('--quiet', 'Suppress all output')
    .action(async (options) => {
      try {
        const container = createCliProductionContainer();
        const agentManager = container.resolve<IAgentManagerService>(CLI_DI_TOKENS.AGENT_MANAGER);

        const { exitCode } = await handleAgentCompact(options, { agentManager });
        process.exit(exitCode);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
