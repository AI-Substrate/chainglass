import {
  type DetectorDeps,
  detectCopilotSessions,
} from '@/features/064-terminal/server/copilot-session-detector';
import { describe, expect, it } from 'vitest';

/**
 * Fake dependencies for copilot-session-detector tests.
 * All methods are configurable via the builder pattern.
 */
function createFakeDeps(overrides: Partial<DetectorDeps> = {}): DetectorDeps {
  const files: Record<string, string> = {};
  const stats: Record<string, { mtimeMs: number }> = {};
  const dirs: Record<string, string[]> = {};
  const existsSet = new Set<string>();
  const execResults: Record<string, string> = {};

  const deps: DetectorDeps = {
    homeDir: '/fake/home',
    exec: (command, args) => {
      const key = `${command} ${args.join(' ')}`;
      for (const [pattern, result] of Object.entries(execResults)) {
        if (key.includes(pattern)) return result;
      }
      throw new Error(`exec not configured: ${key}`);
    },
    readFile: async (p) => {
      if (p in files) return files[p];
      throw new Error(`ENOENT: ${p}`);
    },
    stat: async (p) => {
      if (p in stats) return stats[p];
      throw new Error(`ENOENT: ${p}`);
    },
    readdir: async (p) => {
      if (p in dirs) return dirs[p];
      throw new Error(`ENOENT: ${p}`);
    },
    exists: async (p) => existsSet.has(p),
    ...overrides,
  };

  return Object.assign(deps, {
    _files: files,
    _stats: stats,
    _dirs: dirs,
    _existsSet: existsSet,
    _execResults: execResults,
  });
}

function getFakeInternals(deps: DetectorDeps) {
  return deps as DetectorDeps & {
    _files: Record<string, string>;
    _stats: Record<string, { mtimeMs: number }>;
    _dirs: Record<string, string[]>;
    _existsSet: Set<string>;
    _execResults: Record<string, string>;
  };
}

describe('detectCopilotSessions', () => {
  it('should return empty when ~/.copilot/ does not exist', async () => {
    /*
    Test Doc:
    - Why: Graceful degradation in Docker or when Copilot not installed
    - Contract: Returns [] when copilot directory missing
    - Usage Notes: No exec calls should be made
    - Quality Contribution: Prevents crash in environments without Copilot
    - Worked Example: ~/.copilot/ missing → []
    */
    const deps = createFakeDeps();
    const result = await detectCopilotSessions('test-session', deps);
    expect(result).toEqual([]);
  });

  it('should return empty when no copilot processes found', async () => {
    /*
    Test Doc:
    - Why: Normal case — no Copilot running in any pane
    - Contract: Returns [] when ps finds no copilot processes
    - Usage Notes: tmux panes exist but none running copilot
    - Quality Contribution: Clean empty state
    - Worked Example: ps output has no @github/copilot → []
    */
    const deps = createFakeDeps();
    const internals = getFakeInternals(deps);
    internals._existsSet.add('/fake/home/.copilot');
    internals._execResults['list-panes'] = '0.0\tdev\t/dev/ttys003\n1.0\tnode\t/dev/ttys004';
    internals._execResults.ps =
      '  PID TTY      COMMAND\n  100 ttys003  just dev\n  200 ttys004  node server.js';

    const result = await detectCopilotSessions('test-session', deps);
    expect(result).toEqual([]);
  });

  it('should detect copilot session and resolve metadata', async () => {
    /*
    Test Doc:
    - Why: Core happy path — copilot running, session resolved, metadata extracted
    - Contract: Returns CopilotSessionInfo with model, tokens, pct, lastActivityTime
    - Usage Notes: Uses @github/copilot pattern matching (cross-platform)
    - Quality Contribution: Validates full detection chain
    - Worked Example: copilot PID 500 on ttys004 → session abc-123 → opus4.6 105k/1M
    */
    const deps = createFakeDeps();
    const internals = getFakeInternals(deps);
    const sessionId = 'abcd1234-ef56-7890-abcd-ef1234567890';

    internals._existsSet.add('/fake/home/.copilot');
    internals._existsSet.add(`/fake/home/.copilot/session-state/${sessionId}/inuse.500.lock`);

    internals._execResults['list-panes'] = '0.0\tdev\t/dev/ttys003\n1.0\tnode\t/dev/ttys004';
    internals._execResults.ps =
      '  PID TTY      COMMAND\n  100 ttys003  just dev\n  500 ttys004  /Users/me/.npm-global/lib/node_modules/@github/copilot/copilot --yolo';
    internals._execResults.tac = '  "prompt_tokens_count": 105000,';

    internals._files['/fake/home/.copilot/config.json'] = JSON.stringify({
      model: 'claude-opus-4.6-1m',
      reasoning_effort: 'high',
    });

    internals._dirs['/fake/home/.copilot/session-state'] = [sessionId];
    internals._stats[`/fake/home/.copilot/session-state/${sessionId}/events.jsonl`] = {
      mtimeMs: Date.now() - 120_000,
    };

    const result = await detectCopilotSessions('test-session', deps);
    expect(result).toHaveLength(1);
    expect(result[0].windowIndex).toBe('1');
    expect(result[0].pid).toBe(500);
    expect(result[0].sessionId).toBe(sessionId);
    expect(result[0].model).toBe('claude-opus-4.6-1m');
    expect(result[0].reasoningEffort).toBe('high');
    expect(result[0].promptTokens).toBe(105000);
    expect(result[0].contextWindow).toBe(1_000_000);
    expect(result[0].pct).toBe(10.5);
    expect(result[0].lastActivityTime).toBeTruthy();
  });

  it('should handle exec failures gracefully', async () => {
    /*
    Test Doc:
    - Why: tmux or ps might fail (not installed, permission denied)
    - Contract: Returns [] on exec failure, no throw
    - Usage Notes: All exec calls wrapped in try-catch
    - Quality Contribution: Prevents sidecar crash from broken shell commands
    - Worked Example: tmux list-panes throws → []
    */
    const deps = createFakeDeps();
    const internals = getFakeInternals(deps);
    internals._existsSet.add('/fake/home/.copilot');
    // No exec results configured → exec will throw

    const result = await detectCopilotSessions('test-session', deps);
    expect(result).toEqual([]);
  });

  it('should handle missing config.json gracefully', async () => {
    /*
    Test Doc:
    - Why: config.json might not exist or be malformed
    - Contract: Returns session with null model/effort when config missing
    - Usage Notes: Other fields (pid, sessionId) still populated
    - Quality Contribution: Partial data better than no data
    - Worked Example: config.json missing → model: null, effort: null
    */
    const deps = createFakeDeps();
    const internals = getFakeInternals(deps);
    const sessionId = 'abcd1234-ef56-7890-abcd-ef1234567890';

    internals._existsSet.add('/fake/home/.copilot');
    internals._existsSet.add(`/fake/home/.copilot/session-state/${sessionId}/inuse.500.lock`);

    internals._execResults['list-panes'] = '1.0\tnode\t/dev/ttys004';
    internals._execResults.ps =
      '  PID TTY      COMMAND\n  500 ttys004  /node_modules/@github/copilot/copilot';
    internals._execResults.tac = '';

    // No config.json file configured → readFile will throw
    internals._dirs['/fake/home/.copilot/session-state'] = [sessionId];
    internals._stats[`/fake/home/.copilot/session-state/${sessionId}/events.jsonl`] = {
      mtimeMs: Date.now(),
    };

    const result = await detectCopilotSessions('test-session', deps);
    expect(result).toHaveLength(1);
    expect(result[0].model).toBeNull();
    expect(result[0].reasoningEffort).toBeNull();
    expect(result[0].promptTokens).toBeNull();
  });
});
