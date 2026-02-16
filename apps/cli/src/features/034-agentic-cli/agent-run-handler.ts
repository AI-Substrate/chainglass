/**
 * Plan 034: Agentic CLI — Agent Run Handler
 *
 * Pure function implementing `cg agent run` logic.
 * Accepts dependencies as parameters for testability.
 *
 * Per DYK-P3#1: Default output is JSON result only (no event handler).
 * Per DYK-P3#2: --stream, --verbose, --quiet are mutually exclusive.
 */

import type {
  AgentResult,
  IAgentManagerService,
  IFileSystem,
  IPathResolver,
} from '@chainglass/shared';
import { parseMetaOptions } from './parse-meta-options.js';
import { createTerminalEventHandler, ndjsonEventHandler } from './terminal-event-handler.js';

const VALID_AGENT_TYPES = ['claude-code', 'copilot'] as const;
type AgentType = (typeof VALID_AGENT_TYPES)[number];

export interface AgentRunOptions {
  type: string;
  prompt?: string;
  promptFile?: string;
  session?: string;
  cwd?: string;
  name?: string;
  meta?: string[];
  stream?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface AgentRunDeps {
  agentManager: IAgentManagerService;
  fileSystem?: IFileSystem;
  pathResolver?: IPathResolver;
  write?: (s: string) => void;
}

function validateAgentType(type: string): AgentType {
  if (!VALID_AGENT_TYPES.includes(type as AgentType)) {
    throw new Error(`Invalid agent type '${type}'. Valid types: ${VALID_AGENT_TYPES.join(', ')}`);
  }
  return type as AgentType;
}

function validateOutputMode(options: {
  stream?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}): void {
  const modes = [options.stream, options.verbose, options.quiet].filter(Boolean);
  if (modes.length > 1) {
    throw new Error('Cannot combine --stream, --verbose, and --quiet. Use only one.');
  }
}

export async function handleAgentRun(
  options: AgentRunOptions,
  deps: AgentRunDeps
): Promise<{ exitCode: number; result: AgentResult }> {
  const agentType = validateAgentType(options.type);
  validateOutputMode(options);

  // Resolve prompt
  let prompt: string;
  if (options.prompt && options.promptFile) {
    throw new Error('Cannot specify both --prompt and --prompt-file. Use one or the other.');
  }
  if (options.prompt) {
    prompt = options.prompt;
  } else if (options.promptFile) {
    if (!deps.pathResolver || !deps.fileSystem) {
      throw new Error('File system dependencies required for --prompt-file');
    }
    const cwd = options.cwd ?? process.cwd();
    const resolvedPath = deps.pathResolver.resolvePath(cwd, options.promptFile);
    const exists = await deps.fileSystem.exists(resolvedPath);
    if (!exists) throw new Error(`Prompt file not found: ${resolvedPath}`);
    prompt = await deps.fileSystem.readFile(resolvedPath);
  } else {
    throw new Error('Either --prompt or --prompt-file is required.');
  }

  const workspace = options.cwd ?? process.cwd();
  const metadata = parseMetaOptions(options.meta);

  // Create instance
  const params = {
    name: options.name ?? `agent-${agentType}`,
    type: agentType,
    workspace,
    metadata,
  };

  const instance = options.session
    ? deps.agentManager.getWithSessionId(options.session, params)
    : deps.agentManager.getNew(params);

  // Attach event handler based on output mode
  const write = deps.write ?? ((s: string) => process.stdout.write(s));
  if (options.stream) {
    instance.addEventHandler(ndjsonEventHandler);
  } else if (options.verbose) {
    instance.addEventHandler(createTerminalEventHandler(instance.name, { verbose: true, write }));
  }
  // Default and --quiet: no event handler (JSON result only)

  // Run
  const result = await instance.run({ prompt, cwd: workspace });

  // Output result as JSON
  if (!options.quiet) {
    const resultWrite = deps.write ?? ((s: string) => process.stdout.write(s));
    resultWrite(`${JSON.stringify(result)}\n`);
  }

  return {
    exitCode: result.status === 'completed' ? 0 : 1,
    result,
  };
}
