/**
 * @vitest-environment node
 */
/**
 * Test Doc:
 * - Why: FX004-1 — verify intent extraction from all agent event types
 * - Contract: extractIntent maps tool_call/thinking to intent strings, skips others
 * - Usage Notes: Pure function, no mocks needed
 * - Quality Contribution: Covers varied input shapes per adapter (DYK-FX004-02)
 * - Worked Example: tool_call "Read" with path → "Reading auth.ts"
 */

import type { AgentEvent } from '@chainglass/shared';
import { describe, expect, it } from 'vitest';
import { extractIntent } from '../../../../packages/shared/src/features/019-agent-manager-refactor/intent-extractor';

describe('extractIntent', () => {
  it('returns null for text_delta events (fast-path)', () => {
    const event: AgentEvent = { type: 'text_delta', timestamp: '', data: { content: 'hello' } };
    expect(extractIntent(event)).toBeNull();
  });

  it('returns null for user_prompt events', () => {
    const event: AgentEvent = { type: 'user_prompt', timestamp: '', data: { content: 'fix it' } };
    expect(extractIntent(event)).toBeNull();
  });

  it('returns null for usage events', () => {
    const event: AgentEvent = {
      type: 'usage',
      timestamp: '',
      data: { inputTokens: 100, outputTokens: 50 },
    };
    expect(extractIntent(event)).toBeNull();
  });

  describe('tool_call events', () => {
    it('Bash with string command', () => {
      const event: AgentEvent = {
        type: 'tool_call',
        timestamp: '',
        data: { toolName: 'Bash', input: 'git status', toolCallId: 'tc-1' },
      };
      expect(extractIntent(event)).toBe('Running: git status');
    });

    it('Bash with object command (Claude Code)', () => {
      const event: AgentEvent = {
        type: 'tool_call',
        timestamp: '',
        data: { toolName: 'Bash', input: { command: 'npm test' }, toolCallId: 'tc-2' },
      };
      expect(extractIntent(event)).toBe('Running: npm test');
    });

    it('Read with string path', () => {
      const event: AgentEvent = {
        type: 'tool_call',
        timestamp: '',
        data: { toolName: 'Read', input: 'src/auth.ts', toolCallId: 'tc-3' },
      };
      expect(extractIntent(event)).toBe('Reading auth.ts');
    });

    it('read_file with object path', () => {
      const event: AgentEvent = {
        type: 'tool_call',
        timestamp: '',
        data: {
          toolName: 'read_file',
          input: { path: '/Users/me/project/lib/utils.ts' },
          toolCallId: 'tc-4',
        },
      };
      expect(extractIntent(event)).toBe('Reading utils.ts');
    });

    it('Write with file_path', () => {
      const event: AgentEvent = {
        type: 'tool_call',
        timestamp: '',
        data: { toolName: 'Write', input: { file_path: 'src/index.ts' }, toolCallId: 'tc-5' },
      };
      expect(extractIntent(event)).toBe('Editing index.ts');
    });

    it('Edit with string path', () => {
      const event: AgentEvent = {
        type: 'tool_call',
        timestamp: '',
        data: { toolName: 'Edit', input: 'src/components/app.tsx', toolCallId: 'tc-6' },
      };
      expect(extractIntent(event)).toBe('Editing app.tsx');
    });

    it('Search/Grep with query', () => {
      const event: AgentEvent = {
        type: 'tool_call',
        timestamp: '',
        data: { toolName: 'Grep', input: 'useAuth', toolCallId: 'tc-7' },
      };
      expect(extractIntent(event)).toBe('Searching: useAuth');
    });

    it('unknown tool with input value', () => {
      const event: AgentEvent = {
        type: 'tool_call',
        timestamp: '',
        data: { toolName: 'CustomTool', input: 'some input', toolCallId: 'tc-8' },
      };
      expect(extractIntent(event)).toBe('CustomTool: some input');
    });

    it('unknown tool without input', () => {
      const event: AgentEvent = {
        type: 'tool_call',
        timestamp: '',
        data: { toolName: 'CustomTool', input: {}, toolCallId: 'tc-9' },
      };
      expect(extractIntent(event)).toBe('Using CustomTool');
    });

    it('truncates long commands to 60 chars', () => {
      const longCmd = 'npm run build && npm run test && npm run lint && npm run format -- --check';
      const event: AgentEvent = {
        type: 'tool_call',
        timestamp: '',
        data: { toolName: 'Bash', input: longCmd, toolCallId: 'tc-10' },
      };
      const result = extractIntent(event);
      expect(result).not.toBeNull();
      expect(result?.length).toBeLessThanOrEqual(60);
      expect(result?.endsWith('…')).toBe(true);
    });
  });

  describe('thinking events', () => {
    it('returns null — thinking never sets intent', () => {
      const event: AgentEvent = {
        type: 'thinking',
        timestamp: '',
        data: { content: 'Let me analyze the code structure' },
      };
      expect(extractIntent(event)).toBeNull();
    });
  });
});
