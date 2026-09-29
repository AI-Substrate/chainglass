import type { AgentKind } from './agent-kind';

/**
 * The agents the "+" menu can start in a new tmux window. The client only ever sends the key;
 * the server looks the command up here, so a crafted frame cannot run an arbitrary command.
 */
export const NEW_WINDOW_AGENTS = {
  claude: {
    label: 'Claude Code',
    command: 'claude --dangerously-skip-permissions',
    kind: 'claude',
  },
  omp: { label: 'omp', command: 'omp', kind: 'pi' },
  copilot: { label: 'Copilot CLI', command: 'copilot --yolo', kind: 'copilot' },
} as const satisfies Record<string, { label: string; command: string; kind: AgentKind }>;

export type NewWindowAgent = keyof typeof NEW_WINDOW_AGENTS;

export function isNewWindowAgent(value: unknown): value is NewWindowAgent {
  return typeof value === 'string' && Object.hasOwn(NEW_WINDOW_AGENTS, value);
}
