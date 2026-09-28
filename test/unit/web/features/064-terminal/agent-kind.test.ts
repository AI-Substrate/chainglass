import { describe, expect, it } from 'vitest';
import { detectAgentKind } from '../../../../../apps/web/src/features/064-terminal/lib/agent-kind';
import { parseProcessTable } from '../../../../../apps/web/src/features/064-terminal/lib/process-cpu';

// `ps -A -o pid=,ppid=,time=,args=` rows shaped like the live panes (2026-09-28).
const table = parseProcessTable(
  [
    '  100     1   0:00.10 pij-rs seat pij-a',
    '  101   100   1:02.00 claude --dangerously-skip-permissions',
    '  102   101   0:00.20 /opt/homebrew/bin/codex exec --json',
    '  200     1   0:00.10 -zsh',
    '  201   200   0:03.00 node /Users/me/.npm-global/bin/copilot --resume',
    '  300     1   0:00.10 pij-rs seat pij-b',
    '  301   300   0:05.00 omp',
    '  400     1   0:00.10 -zsh',
    '  401   400   0:00.50 vim notes.md',
  ].join('\n')
);

describe('detectAgentKind', () => {
  it('finds the harness nearest the pane root, including node-launched CLIs', () => {
    expect(detectAgentKind(table, 100)).toBe('claude'); // Claude running codex as a tool is Claude
    expect(detectAgentKind(table, 200)).toBe('copilot');
    expect(detectAgentKind(table, 300)).toBe('pi');
    expect(detectAgentKind(table, 400)).toBeNull();
  });
});
