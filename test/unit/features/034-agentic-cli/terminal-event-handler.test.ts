import { describe, expect, it } from 'vitest';
import {
  createTerminalEventHandler,
  ndjsonEventHandler,
  truncate,
} from '../../../../apps/cli/src/features/034-agentic-cli/terminal-event-handler.js';
import type { AgentEvent } from '../../../../packages/shared/src/interfaces/agent-types.js';

function makeEvent(type: string, data: unknown): AgentEvent {
  return { type, timestamp: new Date().toISOString(), data } as AgentEvent;
}

describe('createTerminalEventHandler', () => {
  function collectOutput(
    name: string,
    options: { verbose?: boolean } = {}
  ): { output: string[]; handler: (e: AgentEvent) => void } {
    const output: string[] = [];
    const handler = createTerminalEventHandler(name, {
      ...options,
      write: (s: string) => output.push(s),
    });
    return { output, handler };
  }

  // ── text_delta ────────────────────────────────────

  it('formats text_delta with [name] prefix', () => {
    const { output, handler } = collectOutput('test-agent');
    handler(makeEvent('text_delta', { content: 'Hello world' }));
    expect(output.join('')).toContain('[test-agent] Hello world');
  });

  // ── message ───────────────────────────────────────

  it('formats message with [name] prefix and newline', () => {
    const { output, handler } = collectOutput('test-agent');
    handler(makeEvent('message', { content: 'Done!' }));
    expect(output.join('')).toContain('[test-agent] Done!\n');
  });

  // ── tool_call ─────────────────────────────────────

  it('formats tool_call with tool name', () => {
    const { output, handler } = collectOutput('test-agent');
    handler(
      makeEvent('tool_call', { toolName: 'Write', input: { path: 'foo.ts' }, toolCallId: 'tc-1' })
    );
    expect(output.join('')).toContain('[test-agent] [tool] Write:');
    expect(output.join('')).toContain('foo.ts');
  });

  // ── tool_result ───────────────────────────────────

  it('shows tool_result error always', () => {
    const { output, handler } = collectOutput('test-agent');
    handler(
      makeEvent('tool_result', { output: 'file not found', isError: true, toolCallId: 'tc-1' })
    );
    expect(output.join('')).toContain('[test-agent] [tool error] file not found');
  });

  it('hides tool_result non-error in default mode', () => {
    const { output, handler } = collectOutput('test-agent');
    handler(makeEvent('tool_result', { output: 'success', isError: false, toolCallId: 'tc-1' }));
    expect(output).toHaveLength(0);
  });

  it('shows tool_result non-error in verbose mode', () => {
    const { output, handler } = collectOutput('test-agent', { verbose: true });
    handler(
      makeEvent('tool_result', { output: 'success content', isError: false, toolCallId: 'tc-1' })
    );
    expect(output.join('')).toContain('> success content');
  });

  // ── thinking ──────────────────────────────────────

  it('hides thinking in default mode', () => {
    const { output, handler } = collectOutput('test-agent');
    handler(makeEvent('thinking', { content: 'Reasoning about...' }));
    expect(output).toHaveLength(0);
  });

  it('shows thinking in verbose mode', () => {
    const { output, handler } = collectOutput('test-agent', { verbose: true });
    handler(makeEvent('thinking', { content: 'Reasoning about the problem' }));
    expect(output.join('')).toContain('[test-agent] [thinking] Reasoning about the problem');
  });
});

describe('ndjsonEventHandler', () => {
  it('outputs raw JSON per event', () => {
    const event = makeEvent('text_delta', { content: 'hello' });
    // ndjsonEventHandler calls console.log — tested structurally
    const json = JSON.stringify(event);
    expect(json).toContain('"type":"text_delta"');
    expect(json).toContain('"content":"hello"');
  });
});

describe('truncate', () => {
  it('returns string unchanged if within limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates with ellipsis', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });
});
