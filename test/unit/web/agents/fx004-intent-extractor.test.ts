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
        data: { toolName: 'Bash', input: 'git status' },
      };
      expect(extractIntent(event)).toBe('Running: git status');
    });

    it('Bash with object command (Claude Code)', () => {
      const event: AgentEvent = {
        type: 'tool_call',
        timestamp: '',
        data: { toolName: 'Bash', input: { command: 'npm test' } },
      };
      expect(extractIntent(event)).toBe('Running: npm test');
    });

    it('Read with string path', () => {
      const event: AgentEvent = {
        type: 'tool_call',
        timestamp: '',
        data: { toolName: 'Read', input: 'src/auth.ts' },
      };
      expect(extractIntent(event)).toBe('Reading auth.ts');
    });

    it('read_file with object path', () => {
      const event: AgentEvent = {
        type: 'tool_call',
        timestamp: '',
        data: { toolName: 'read_file', input: { path: '/Users/me/project/lib/utils.ts' } },
      };
      expect(extractIntent(event)).toBe('Reading utils.ts');
    });

    it('Write with file_path', () => {
      const event: AgentEvent = {
        type: 'tool_call',
        timestamp: '',
        data: { toolName: 'Write', input: { file_path: 'src/index.ts' } },
      };
      expect(extractIntent(event)).toBe('Editing index.ts');
    });

    it('Edit with string path', () => {
      const event: AgentEvent = {
        type: 'tool_call',
        timestamp: '',
        data: { toolName: 'Edit', input: 'src/components/app.tsx' },
      };
      expect(extractIntent(event)).toBe('Editing app.tsx');
    });

    it('Search/Grep with query', () => {
      const event: AgentEvent = {
        type: 'tool_call',
        timestamp: '',
        data: { toolName: 'Grep', input: 'useAuth' },
      };
      expect(extractIntent(event)).toBe('Searching: useAuth');
    });

    it('unknown tool with input value', () => {
      const event: AgentEvent = {
        type: 'tool_call',
        timestamp: '',
        data: { toolName: 'CustomTool', input: 'some input' },
      };
      expect(extractIntent(event)).toBe('CustomTool: some input');
    });

    it('unknown tool without input', () => {
      const event: AgentEvent = {
        type: 'tool_call',
        timestamp: '',
        data: { toolName: 'CustomTool', input: {} },
      };
      expect(extractIntent(event)).toBe('Using CustomTool');
    });

    it('truncates long commands to 60 chars', () => {
      const longCmd = 'npm run build && npm run test && npm run lint && npm run format -- --check';
      const event: AgentEvent = {
        type: 'tool_call',
        timestamp: '',
        data: { toolName: 'Bash', input: longCmd },
      };
      const result = extractIntent(event);
      expect(result).not.toBeNull();
      expect(result?.length).toBeLessThanOrEqual(60);
      expect(result?.endsWith('…')).toBe(true);
    });
  });

  describe('thinking events', () => {
    it('extracts thinking content', () => {
      const event: AgentEvent = {
        type: 'thinking',
        timestamp: '',
        data: { content: 'Let me analyze the code structure' },
      };
      expect(extractIntent(event)).toBe('Thinking: Let me analyze the code structure');
    });

    it('truncates long thinking to 60 chars', () => {
      const longThought =
        'I need to carefully consider the implications of changing the authentication middleware because it affects all routes';
      const event: AgentEvent = {
        type: 'thinking',
        timestamp: '',
        data: { content: longThought },
      };
      const result = extractIntent(event);
      expect(result?.length).toBeLessThanOrEqual(60);
      expect(result?.endsWith('…')).toBe(true);
    });

    it('returns null for empty thinking', () => {
      const event: AgentEvent = {
        type: 'thinking',
        timestamp: '',
        data: { content: '' },
      };
      expect(extractIntent(event)).toBeNull();
    });
  });
});
