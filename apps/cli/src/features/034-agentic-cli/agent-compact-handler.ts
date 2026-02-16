/**
 * Plan 034: Agentic CLI — Agent Compact Handler
 *
 * Pure function implementing `cg agent compact` logic.
 * Accepts dependencies as parameters for testability.
 */

import type { AgentResult, IAgentManagerService } from '@chainglass/shared';

const VALID_AGENT_TYPES = ['claude-code', 'copilot'] as const;
type AgentType = (typeof VALID_AGENT_TYPES)[number];

export interface AgentCompactOptions {
  type: string;
  session: string;
  cwd?: string;
  quiet?: boolean;
}

export interface AgentCompactDeps {
  agentManager: IAgentManagerService;
  write?: (s: string) => void;
}

function validateAgentType(type: string): AgentType {
  if (!VALID_AGENT_TYPES.includes(type as AgentType)) {
    throw new Error(`Invalid agent type '${type}'. Valid types: ${VALID_AGENT_TYPES.join(', ')}`);
  }
  return type as AgentType;
}

export async function handleAgentCompact(
  options: AgentCompactOptions,
  deps: AgentCompactDeps
): Promise<{ exitCode: number; result: AgentResult }> {
  const agentType = validateAgentType(options.type);

  const params = {
    name: `compact-${agentType}`,
    type: agentType,
    workspace: options.cwd ?? process.cwd(),
  };

  const instance = deps.agentManager.getWithSessionId(options.session, params);
  const result = await instance.compact();

  if (!options.quiet) {
    const write = deps.write ?? ((s: string) => process.stdout.write(s));
    write(`${JSON.stringify(result)}\n`);
  }

  return {
    exitCode: result.status === 'completed' ? 0 : 1,
    result,
  };
}
