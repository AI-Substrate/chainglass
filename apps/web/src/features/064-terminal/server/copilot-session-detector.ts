/**
 * Copilot Session Detector — detects Copilot CLI processes in tmux panes
 * and reads session metadata from ~/.copilot/ on-disk artifacts.
 *
 * Data sources: tmux list-panes (TTYs), ps (copilot PIDs), lock files
 * (session IDs), config.json (model, effort), process logs (token counts),
 * events.jsonl mtime (last activity).
 *
 * All deps are injected for testability. No JSONL content parsing.
 *
 * Plan 075: tmux Copilot Status Bar
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface CopilotSessionInfo {
  /** tmux pane identifier (e.g. "1.0") */
  pane: string;
  /** tmux window index (e.g. "1") */
  windowIndex: string;
  /** tmux window name (e.g. "node") */
  windowName: string;
  /** Copilot process PID */
  pid: number;
  /** Copilot CLI session ID (UUID) */
  sessionId: string;
  /** Model name (e.g. "claude-opus-4.6-1m") */
  model: string | null;
  /** Reasoning effort (e.g. "high", "xhigh") */
  reasoningEffort: string | null;
  /** Latest prompt token count from process log */
  promptTokens: number | null;
  /** Context window size derived from model */
  contextWindow: number | null;
  /** Usage percentage (promptTokens / contextWindow * 100) */
  pct: number | null;
  /** Last activity time as ISO string (events.jsonl mtime) */
  lastActivityTime: string | null;
}

/** Known model context window sizes */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-opus-4.6': 200_000,
  'claude-opus-4.6-1m': 1_000_000,
  'claude-opus-4.5': 200_000,
  'claude-sonnet-4.6': 200_000,
  'claude-sonnet-4.5': 200_000,
  'claude-sonnet-4': 200_000,
  'claude-haiku-4.5': 200_000,
  'gpt-5.4': 200_000,
  'gpt-5.2': 200_000,
  'gpt-5.1': 200_000,
  'gpt-5-mini': 128_000,
  'gpt-4.1': 128_000,
};

const SESSION_ID_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

/** Injected dependencies for testability */
export interface DetectorDeps {
  exec: (command: string, args: string[]) => string;
  readFile: (filePath: string) => Promise<string>;
  stat: (filePath: string) => Promise<{ mtimeMs: number }>;
  readdir: (dirPath: string) => Promise<string[]>;
  exists: (filePath: string) => Promise<boolean>;
  homeDir: string;
}

/** Create real dependencies from Node.js APIs */
export function createRealDeps(exec: (command: string, args: string[]) => string): DetectorDeps {
  return {
    exec,
    readFile: (p) => fs.promises.readFile(p, 'utf-8'),
    stat: (p) => fs.promises.stat(p),
    readdir: (p) => fs.promises.readdir(p),
    exists: async (p) => {
      try {
        await fs.promises.access(p);
        return true;
      } catch {
        return false;
      }
    },
    homeDir: os.homedir(),
  };
}

/**
 * Detect all Copilot CLI sessions running in tmux panes for a given session.
 *
 * Returns one CopilotSessionInfo per detected copilot process, sorted by window index.
 * Gracefully returns empty array on any failure (missing files, exec errors, etc.)
 */
export async function detectCopilotSessions(
  sessionName: string,
  deps: DetectorDeps
): Promise<CopilotSessionInfo[]> {
  const copilotDir = path.join(deps.homeDir, '.copilot');

  // Early exit if ~/.copilot/ doesn't exist (Docker, no Copilot installed)
  if (!(await deps.exists(copilotDir))) {
    return [];
  }

  // Step 1: Get all pane TTYs from tmux
  const paneInfos = getPaneTTYs(sessionName, deps);
  if (paneInfos.length === 0) return [];

  // Step 2: Get copilot PIDs by TTY
  const pidsByTty = getCopilotPidsByTty(deps);
  if (Object.keys(pidsByTty).length === 0) return [];

  // Step 3: Read global config as fallback (model, effort)
  const config = await readCopilotConfig(copilotDir, deps);

  // Step 4: For each pane, check if copilot is running and resolve session
  const results: CopilotSessionInfo[] = [];

  for (const pane of paneInfos) {
    const shortTty = pane.tty.replace('/dev/', '');
    const pid = pidsByTty[shortTty];
    if (!pid) continue;

    const sessionId = await resolveSessionId(copilotDir, pid, deps);
    if (!sessionId) continue;

    const sessionDir = path.join(copilotDir, 'session-state', sessionId);

    // Get model + tokens from process log (per-session, not global config)
    const logData = getProcessLogData(copilotDir, pid, deps);

    // Get last activity from events.jsonl mtime
    const lastActivityTime = await getLastActivityTime(sessionDir, deps);

    // Per-session model from log, fall back to global config
    const model = logData.model ?? config.model;
    const contextWindow = model ? (MODEL_CONTEXT_WINDOWS[model] ?? null) : null;
    const promptTokens = logData.promptTokens;
    const pct =
      promptTokens !== null && contextWindow !== null
        ? Math.round((promptTokens / contextWindow) * 1000) / 10
        : null;

    results.push({
      pane: pane.pane,
      windowIndex: pane.windowIndex,
      windowName: pane.windowName,
      pid,
      sessionId,
      model,
      reasoningEffort: logData.reasoningEffort ?? config.reasoningEffort,
      promptTokens,
      contextWindow,
      pct,
      lastActivityTime,
    });
  }

  return results.sort((a, b) => Number(a.windowIndex) - Number(b.windowIndex));
}

// ── Internal helpers ─────────────────────────────────────────────────

interface PaneInfo {
  pane: string;
  windowIndex: string;
  windowName: string;
  tty: string;
}

function getPaneTTYs(sessionName: string, deps: DetectorDeps): PaneInfo[] {
  try {
    const output = deps.exec('tmux', [
      'list-panes',
      '-t',
      sessionName,
      '-s',
      '-F',
      '#{window_index}.#{pane_index}\t#{window_name}\t#{pane_tty}',
    ]);
    return output
      .trim()
      .split('\n')
      .filter((line) => line.includes('\t'))
      .map((line) => {
        const parts = line.split('\t');
        const pane = parts[0] ?? '';
        return {
          pane,
          windowIndex: pane.split('.')[0] ?? '',
          windowName: parts[1] ?? '',
          tty: parts[2] ?? '',
        };
      });
  } catch {
    return [];
  }
}

function getCopilotPidsByTty(deps: DetectorDeps): Record<string, number> {
  try {
    const output = deps.exec('ps', ['-eo', 'pid,tty,command']);
    const result: Record<string, number> = {};
    for (const line of output.split('\n')) {
      // Match @github/copilot in the command — cross-platform
      if (!line.includes('@github/copilot') && !line.includes('github-copilot')) continue;
      const trimmed = line.trim();
      const match = trimmed.match(/^(\d+)\s+(\S+)\s+/);
      if (!match) continue;
      const pid = Number.parseInt(match[1], 10);
      const tty = match[2];
      if (tty === '?' || tty === '??') continue;
      // Keep highest PID per TTY (the actual worker process, not the node wrapper)
      if (!result[tty] || pid > result[tty]) {
        result[tty] = pid;
      }
    }
    return result;
  } catch {
    return {};
  }
}

interface CopilotConfig {
  model: string | null;
  reasoningEffort: string | null;
}

async function readCopilotConfig(copilotDir: string, deps: DetectorDeps): Promise<CopilotConfig> {
  try {
    const configPath = path.join(copilotDir, 'config.json');
    const content = await deps.readFile(configPath);
    const config = JSON.parse(content);
    return {
      model: config.model ?? null,
      reasoningEffort: config.reasoning_effort ?? null,
    };
  } catch {
    return { model: null, reasoningEffort: null };
  }
}

/**
 * Find the most recently active session for a PID by scanning lock files.
 * Multiple sessions can share a PID (--resume). Pick newest by events.jsonl mtime.
 */
async function resolveSessionId(
  copilotDir: string,
  pid: number,
  deps: DetectorDeps
): Promise<string | null> {
  const sessionStateDir = path.join(copilotDir, 'session-state');
  try {
    const dirs = await deps.readdir(sessionStateDir);
    let bestSession: string | null = null;
    let bestMtime = 0;

    for (const dir of dirs) {
      if (!SESSION_ID_REGEX.test(dir)) continue;
      const lockFile = path.join(sessionStateDir, dir, `inuse.${pid}.lock`);
      if (!(await deps.exists(lockFile))) continue;

      // Use events.jsonl mtime to pick the most recent session
      const eventsFile = path.join(sessionStateDir, dir, 'events.jsonl');
      try {
        const stat = await deps.stat(eventsFile);
        if (stat.mtimeMs > bestMtime) {
          bestMtime = stat.mtimeMs;
          bestSession = dir;
        }
      } catch {
        // No events.jsonl — still valid if it's the only match
        if (!bestSession) bestSession = dir;
      }
    }
    return bestSession;
  } catch {
    return null;
  }
}

interface ProcessLogData {
  model: string | null;
  reasoningEffort: string | null;
  promptTokens: number | null;
}

function getProcessLogData(copilotDir: string, pid: number, deps: DetectorDeps): ProcessLogData {
  const result: ProcessLogData = { model: null, reasoningEffort: null, promptTokens: null };
  try {
    // Grab model, reasoning effort, and token count from the process log in one pass
    // tac reads backwards so we get the most recent values first
    const output = deps.exec('bash', [
      '-c',
      `tac "${copilotDir}/logs/"process-*-${pid}.log 2>/dev/null | grep -m1 -E '"model"|"prompt_tokens_count"|"reasoning_effort"' || true`,
    ]);
    const tokenMatch = output.match(/"prompt_tokens_count":\s*(\d+)/);
    if (tokenMatch) result.promptTokens = Number.parseInt(tokenMatch[1], 10);

    // Model and effort need separate greps since they're on different lines
    const modelOutput = deps.exec('bash', [
      '-c',
      `tac "${copilotDir}/logs/"process-*-${pid}.log 2>/dev/null | grep -m1 '"model"' || true`,
    ]);
    const modelMatch = modelOutput.match(/"model":\s*"([^"]+)"/);
    if (modelMatch) {
      // Strip internal routing prefixes (e.g. "capi-noe-ptuc-h200-ib-gpt-5-mini-2025-08-07" -> use as-is)
      result.model = modelMatch[1];
    }

    const effortOutput = deps.exec('bash', [
      '-c',
      `tac "${copilotDir}/logs/"process-*-${pid}.log 2>/dev/null | grep -m1 '"reasoning_effort"' || true`,
    ]);
    const effortMatch = effortOutput.match(/"reasoning_effort":\s*"([^"]+)"/);
    if (effortMatch) result.reasoningEffort = effortMatch[1];
  } catch {
    // Return partial data
  }
  return result;
}

async function getLastActivityTime(sessionDir: string, deps: DetectorDeps): Promise<string | null> {
  try {
    const eventsFile = path.join(sessionDir, 'events.jsonl');
    const stat = await deps.stat(eventsFile);
    return new Date(stat.mtimeMs).toISOString();
  } catch {
    return null;
  }
}
