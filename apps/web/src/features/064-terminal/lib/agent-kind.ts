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
export function findAgent(
  table: ProcessTable,
  rootPid: number
): { kind: AgentKind; pid: number } | null {
  const queue = [rootPid];
  const seen = new Set<number>();
  while (queue.length > 0) {
    const pid = queue.shift() as number;
    if (seen.has(pid)) continue;
    seen.add(pid);
    const kind = agentKindOfCommand(table.args.get(pid) ?? '');
    if (kind) return { kind, pid };
    queue.push(...(table.children.get(pid) ?? []));
  }
  return null;
}

export function detectAgentKind(table: ProcessTable, rootPid: number): AgentKind | null {
  return findAgent(table, rootPid)?.kind ?? null;
}

/** Short human label for a process: `vite` for `pnpm exec vite …`, `shell` for `zsh -c …`. */
export function processLabel(commandLine: string): string {
  const tokens = commandLine.trim().split(/\s+/);
  const name = basename(tokens[0] ?? '').replace(/^-/, '');
  if (['zsh', 'bash', 'sh', 'fish'].includes(name)) return shellLabel(commandLine, tokens);
  if (['nice', 'nohup', 'time', 'caffeinate', 'env'].includes(name)) {
    // Wrappers: label what they run (skipping flags and env assignments).
    const inner = tokens
      .slice(1)
      .findIndex((token) => !token.startsWith('-') && !token.includes('='));
    if (inner >= 0) return processLabel(tokens.slice(1 + inner).join(' '));
  }
  let rest = tokens.slice(1);
  let label = name;
  if (INTERPRETERS.has(name)) {
    const scriptIndex = rest.findIndex((token) => !token.startsWith('-'));
    if (scriptIndex < 0) return name;
    const parts = rest[scriptIndex].split('/').filter(Boolean);
    label = (parts.at(-1) ?? name).replace(/\.(c|m)?[jt]s$/, '');
    rest = rest.slice(scriptIndex + 1);
    // Generic entry files say nothing; name the package directory (…/vite/bin/vite.js → vite).
    if (['cli', 'index', 'main', 'bin', 'server'].includes(label)) {
      label =
        parts
          .slice(0, -1)
          .reverse()
          .find((part) => !['bin', 'dist', 'lib', 'src', '..', '.'].includes(part)) ?? label;
    }
  }
  // Package runners name the tool they run: `pnpm exec vite` → vite, `npx tsc` → tsc.
  if (['pnpm', 'npm', 'npx', 'yarn', 'bunx', 'uvx'].includes(label)) {
    const tool = rest.find(
      (token) => !token.startsWith('-') && !['exec', 'run', 'dlx', 'x'].includes(token)
    );
    if (tool) return basename(tool);
  }
  if (label === 'just' && rest[0] && !rest[0].startsWith('-')) return `just ${rest[0]}`;
  return label;
}

/**
 * Shells say little on their own. Claude runs each command as
 * `zsh -c source <snapshot> && … && eval '<command>' …`, so label the eval'd command (skipping a
 * leading `cd`); a shell running a script is labelled by the script.
 */
function shellLabel(commandLine: string, tokens: string[]): string {
  const evaluated = /\beval '([^']*)'/.exec(commandLine)?.[1];
  if (evaluated) {
    const step = evaluated
      .split(/&&|;|\|\|/)
      .map((part) => part.trim())
      .find((part) => part.length > 0 && !/^cd(\s|$)/.test(part));
    if (step) return processLabel(step);
  }
  const script = tokens.slice(1).find((token) => !token.startsWith('-'));
  return script && script !== 'source' && tokens[1] !== '-c' ? basename(script) : 'shell';
}
