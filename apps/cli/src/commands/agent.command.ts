/**
 * Agent command group for the CLI.
 *
 * Per Subtask 001: Creates cg agent <subcommand> commands for the manual test harness.
 *
 * Commands:
 * - cg agent run    - Invoke an agent with a prompt
 * - cg agent compact - Reduce session context via /compact command
 *
 * Per ADR-0004: Uses DI container, not direct instantiation.
 * Per DYK #2: Always outputs AgentResult JSON (not IOutputAdapter pattern).
 * Per DYK #3: --prompt-file validated via pathResolver.resolvePath().
 * Per DYK #5: No --timeout option (uses config-based timeout).
 */

import type { AgentResult, AgentService, IFileSystem, IPathResolver } from '@chainglass/shared';
import { SHARED_DI_TOKENS } from '@chainglass/shared';
import type { Command } from 'commander';
import { CLI_DI_TOKENS, createCliProductionContainer } from '../lib/container.js';

/**
 * Valid agent types.
 * Per Invariant: Only claude-code and copilot are accepted.
 */
const VALID_AGENT_TYPES = ['claude-code', 'copilot'] as const;
type AgentType = (typeof VALID_AGENT_TYPES)[number];

/**
 * Options for agent run command.
 */
interface RunOptions {
  /** Agent type: claude-code or copilot (required) */
  type: string;
  /** Prompt text (required unless --prompt-file) */
  prompt?: string;
  /** Path to file containing prompt (alternative to --prompt) */
  promptFile?: string;
  /** Session ID for resumption */
  session?: string;
  /** Working directory for the agent */
  cwd?: string;
}

/**
 * Options for agent compact command.
 */
interface CompactOptions {
  /** Agent type: claude-code or copilot (required) */
  type: string;
  /** Session ID (required) */
  session: string;
}

/**
 * Get the AgentService from DI container.
 * Per ADR-0004: Services resolved from containers, not instantiated directly.
 */
function getAgentService(): AgentService {
  const container = createCliProductionContainer();
  return container.resolve<AgentService>(CLI_DI_TOKENS.AGENT_SERVICE);
}

/**
 * Get the filesystem adapter from DI container.
 */
function getFileSystem(): IFileSystem {
  const container = createCliProductionContainer();
  return container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
}

/**
 * Get the path resolver from DI container.
 */
function getPathResolver(): IPathResolver {
  const container = createCliProductionContainer();
  return container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
}

/**
 * Validate agent type.
 * @throws Error if type is invalid
 */
function validateAgentType(type: string): AgentType {
  if (!VALID_AGENT_TYPES.includes(type as AgentType)) {
    throw new Error(`Invalid agent type '${type}'. Valid types: ${VALID_AGENT_TYPES.join(', ')}`);
  }
  return type as AgentType;
}

/**
 * Output AgentResult as JSON.
 * Per DYK #2: Always output AgentResult JSON structure.
 */
function outputResult(result: AgentResult): void {
  // Single-line JSON for NDJSON compatibility with log output
  console.log(JSON.stringify(result));
}

/**
 * Output error as AgentResult JSON with status='failed'.
 * Per DYK #2: Errors use AgentResult structure with status='failed'.
 */
function outputError(message: string): void {
  const errorResult: AgentResult = {
    output: '',
    sessionId: '',
    status: 'failed',
    exitCode: 1,
    tokens: null,
    stderr: message,
  };
  // Single-line JSON for NDJSON compatibility with log output
  console.log(JSON.stringify(errorResult));
}

/**
 * Handle cg agent run command.
 *
 * Per DYK #3: --prompt-file validated via pathResolver.resolvePath().
 * Per DYK #5: No --timeout option (uses config-based 10min default).
 */
async function handleAgentRun(options: RunOptions): Promise<void> {
  try {
    // Validate agent type
    const agentType = validateAgentType(options.type);

    // Resolve prompt - either from --prompt or --prompt-file
    let prompt: string;
    if (options.prompt && options.promptFile) {
      outputError('Cannot specify both --prompt and --prompt-file. Use one or the other.');
      process.exit(1);
    } else if (options.prompt) {
      prompt = options.prompt;
    } else if (options.promptFile) {
      // Per DYK #3: Validate path within workspace using pathResolver
      const pathResolver = getPathResolver();
      const cwd = options.cwd ?? process.cwd();

      let resolvedPath: string;
      try {
        resolvedPath = pathResolver.resolvePath(cwd, options.promptFile);
      } catch (error) {
        outputError(
          `Path security error: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }

      // Read prompt file
      const fs = getFileSystem();
      const exists = await fs.exists(resolvedPath);
      if (!exists) {
        outputError(`Prompt file not found: ${resolvedPath}`);
        process.exit(1);
      }
      prompt = await fs.readFile(resolvedPath);
    } else {
      outputError('Either --prompt or --prompt-file is required.');
      process.exit(1);
    }

    // Get service and run
    const service = getAgentService();
    const result = await service.run({
      prompt,
      agentType,
      sessionId: options.session,
      cwd: options.cwd,
    });

    outputResult(result);
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Handle cg agent compact command.
 *
 * Per Invariant: --session is required.
 */
async function handleAgentCompact(options: CompactOptions): Promise<void> {
  try {
    // Validate agent type
    const agentType = validateAgentType(options.type);

    // Get service and compact
    const service = getAgentService();
    const result = await service.compact(options.session, agentType);

    outputResult(result);
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Register the agent command group with the Commander program.
 *
 * Creates the cg agent command group with subcommands:
 * - cg agent run    - Invoke an agent with a prompt
 * - cg agent compact - Reduce session context
 *
 * @param program - Commander.js program instance
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
    .action(async (options: RunOptions) => {
      await handleAgentRun(options);
    });

  // cg agent compact
  agent
    .command('compact')
    .description('Reduce session context via /compact command')
    .requiredOption('-t, --type <type>', 'Agent type: claude-code or copilot')
    .requiredOption('-s, --session <id>', 'Session ID (required)')
    .action(async (options: CompactOptions) => {
      await handleAgentCompact(options);
    });
}
