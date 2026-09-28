import type { ProcessTable } from './process-cpu';

/** Coding-agent harnesses the window strip marks with a corner colour. */
export type AgentKind = 'claude' | 'copilot' | 'pi' | 'codex';

/** Executable (or node script) basename → harness. omp is the pi fork, so both read as `pi`. */
const KIND_BY_NAME: Record<string, AgentKind> = {
  claude: 'claude',
  copilot: 'copilot',
  omp: 'pi',
  pi: 'pi',
  codex: 'codex',
};

const INTERPRETERS = new Set(['node', 'bun', 'deno']);

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Classify one command line; node-launched CLIs are classified by their script name. */
export function agentKindOfCommand(commandLine: string): AgentKind | null {
  const [executable, script] = commandLine.trim().split(/\s+/);
  if (!executable) return null;
  const name = basename(executable);
  const direct = KIND_BY_NAME[name];
  if (direct) return direct;
  if (INTERPRETERS.has(name) && script) return KIND_BY_NAME[basename(script)] ?? null;
  return null;
}

/**
 * The harness nearest the pane's root process, searched breadth-first so the agent itself wins
 * over anything it spawns (a Claude session running `codex` as a tool is still Claude).
 */
export function detectAgentKind(table: ProcessTable, rootPid: number): AgentKind | null {
  const queue = [rootPid];
  const seen = new Set<number>();
  while (queue.length > 0) {
    const pid = queue.shift() as number;
    if (seen.has(pid)) continue;
    seen.add(pid);
    const kind = agentKindOfCommand(table.args.get(pid) ?? '');
    if (kind) return kind;
    queue.push(...(table.children.get(pid) ?? []));
  }
  return null;
}
