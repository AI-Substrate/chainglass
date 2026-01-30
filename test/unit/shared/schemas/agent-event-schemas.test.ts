/**
 * Agent Event Schema Tests
 *
 * TDD RED phase tests for new agent event Zod schemas in shared package.
 * Per DYK-03: Single source of truth - Zod schemas in shared, derive TS types via z.infer<>
 *
 * Part of Plan 015: Agent Activity Fidelity Enhancement (Phase 1)
 */

import { describe, expect, it } from 'vitest';
// Import from schema file that doesn't exist yet - this SHOULD fail in RED phase
import {
  type AgentThinkingEvent,
  AgentThinkingEventSchema,
  type AgentToolCallEvent,
  AgentToolCallEventSchema,
  type AgentToolResultEvent,
  AgentToolResultEventSchema,
} from '../../../../packages/shared/src/schemas/agent-event.schema';

// Helper to create valid ISO timestamp
const timestamp = () => new Date().toISOString();

describe('AgentToolCallEventSchema', () => {
  it('should validate tool_call event with all required fields', () => {
    /*
    Test Doc:
    - Why: Tool calls need structured data for UI display (tool name, input, ID)
    - Contract: Has type 'tool_call', timestamp, toolName, input, toolCallId
    - Usage Notes: toolCallId links to corresponding tool_result
    - Quality Contribution: Ensures tool visibility pipeline has correct data shape
    - Worked Example: { type: 'tool_call', data: { toolName: 'Bash', input: {...} } } → success
    */
    const event = {
      type: 'tool_call',
      timestamp: timestamp(),
      data: {
        toolName: 'Bash',
        input: { command: 'ls -la' },
        toolCallId: 'toolu_abc123',
      },
    };
    const result = AgentToolCallEventSchema.safeParse(event);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('tool_call');
      expect(result.data.data.toolName).toBe('Bash');
      expect(result.data.data.toolCallId).toBe('toolu_abc123');
    }
  });

  it('should reject missing toolName', () => {
    /*
    Test Doc:
    - Why: toolName is required to display what tool is being executed
    - Contract: data.toolName is required string
    - Usage Notes: Comes from Claude tool_use.name or Copilot tool.execution_start.toolName
    - Quality Contribution: Catches incomplete tool call events
    - Worked Example: { data: { input: {...}, toolCallId: 'x' } } without toolName → failure
    */
    const event = {
      type: 'tool_call',
      timestamp: timestamp(),
      data: {
        // Missing toolName
        input: { command: 'ls' },
        toolCallId: 'toolu_abc123',
      },
    };
    const result = AgentToolCallEventSchema.safeParse(event);

    expect(result.success).toBe(false);
  });

  it('should reject missing toolCallId', () => {
    /*
    Test Doc:
    - Why: toolCallId links tool_call to tool_result
    - Contract: data.toolCallId is required string
    - Usage Notes: Without ID, cannot correlate call with result
    - Quality Contribution: Ensures tool call/result pairing works
    - Worked Example: { data: { toolName: 'Bash', input: {...} } } without toolCallId → failure
    */
    const event = {
      type: 'tool_call',
      timestamp: timestamp(),
      data: {
        toolName: 'Bash',
        input: { command: 'ls' },
        // Missing toolCallId
      },
    };
    const result = AgentToolCallEventSchema.safeParse(event);

    expect(result.success).toBe(false);
  });

  it('should accept any input shape (unknown)', () => {
    /*
    Test Doc:
    - Why: Different tools have different input schemas
    - Contract: data.input accepts any value (unknown)
    - Usage Notes: Bash has command, Read has file_path, etc.
    - Quality Contribution: Ensures flexibility for all tool types
    - Worked Example: input can be object, string, array, etc.
    */
    const events = [
      {
        type: 'tool_call',
        timestamp: timestamp(),
        data: { toolName: 'Bash', input: { command: 'ls' }, toolCallId: 't1' },
      },
      {
        type: 'tool_call',
        timestamp: timestamp(),
        data: { toolName: 'Read', input: '/path/to/file', toolCallId: 't2' },
      },
      {
        type: 'tool_call',
        timestamp: timestamp(),
        data: { toolName: 'Multi', input: ['a', 'b'], toolCallId: 't3' },
      },
    ];

    for (const event of events) {
      const result = AgentToolCallEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    }
  });
});

describe('AgentToolResultEventSchema', () => {
  it('should validate tool_result event with all required fields', () => {
    /*
    Test Doc:
    - Why: Tool results show execution outcome (output, success/error)
    - Contract: Has type 'tool_result', toolCallId, output, isError
    - Usage Notes: toolCallId links back to originating tool_call
    - Quality Contribution: Ensures tool result data is complete
    - Worked Example: { type: 'tool_result', data: { output: '...', isError: false } } → success
    */
    const event = {
      type: 'tool_result',
      timestamp: timestamp(),
      data: {
        toolCallId: 'toolu_abc123',
        output: 'total 48\ndrwxr-xr-x 2 user user 4096 Jan 27 12:00 .',
        isError: false,
      },
    };
    const result = AgentToolResultEventSchema.safeParse(event);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('tool_result');
      expect(result.data.data.isError).toBe(false);
    }
  });

  it('should validate tool_result with error state', () => {
    /*
    Test Doc:
    - Why: Error results need to be distinguishable for UI styling
    - Contract: isError=true indicates tool execution failed
    - Usage Notes: UI auto-expands card on error (AC12a)
    - Quality Contribution: Ensures error state is captured
    - Worked Example: { isError: true, output: 'ENOENT...' } → success with error flag
    */
    const event = {
      type: 'tool_result',
      timestamp: timestamp(),
      data: {
        toolCallId: 'toolu_abc123',
        output: 'Error: ENOENT: no such file or directory',
        isError: true,
      },
    };
    const result = AgentToolResultEventSchema.safeParse(event);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data.isError).toBe(true);
    }
  });

  it('should reject missing toolCallId', () => {
    /*
    Test Doc:
    - Why: toolCallId is required to link result to call
    - Contract: data.toolCallId is required string
    - Usage Notes: Without ID, cannot update correct ToolCallCard
    - Quality Contribution: Ensures tool pairing integrity
    - Worked Example: { data: { output: '...', isError: false } } without toolCallId → failure
    */
    const event = {
      type: 'tool_result',
      timestamp: timestamp(),
      data: {
        // Missing toolCallId
        output: 'some output',
        isError: false,
      },
    };
    const result = AgentToolResultEventSchema.safeParse(event);

    expect(result.success).toBe(false);
  });

  it('should accept empty output string', () => {
    /*
    Test Doc:
    - Why: Some tools produce no output (e.g., mkdir, touch)
    - Contract: output can be empty string
    - Usage Notes: UI should handle empty output gracefully
    - Quality Contribution: Ensures no-output tools work
    - Worked Example: { output: '', isError: false } → success
    */
    const event = {
      type: 'tool_result',
      timestamp: timestamp(),
      data: {
        toolCallId: 'toolu_abc123',
        output: '',
        isError: false,
      },
    };
    const result = AgentToolResultEventSchema.safeParse(event);

    expect(result.success).toBe(true);
  });
});

describe('AgentThinkingEventSchema', () => {
  it('should validate thinking event with content', () => {
    /*
    Test Doc:
    - Why: Thinking blocks show Claude's reasoning process
    - Contract: Has type 'thinking', content string, optional signature
    - Usage Notes: Displayed as collapsible "Thinking..." section (AC5)
    - Quality Contribution: Ensures thinking visibility pipeline works
    - Worked Example: { type: 'thinking', data: { content: '...' } } → success
    */
    const event = {
      type: 'thinking',
      timestamp: timestamp(),
      data: {
        content: 'Let me analyze this step by step. First, I need to check...',
      },
    };
    const result = AgentThinkingEventSchema.safeParse(event);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('thinking');
      expect(result.data.data.content).toContain('step by step');
    }
  });

  it('should accept optional signature field (Claude only)', () => {
    /*
    Test Doc:
    - Why: Claude extended thinking includes cryptographic signature
    - Contract: data.signature is optional string
    - Usage Notes: Copilot reasoning doesn't have signatures
    - Quality Contribution: Supports Claude's extended thinking feature
    - Worked Example: { data: { content: '...', signature: 'sig_xyz' } } → success
    */
    const event = {
      type: 'thinking',
      timestamp: timestamp(),
      data: {
        content: 'Let me think about this...',
        signature: 'sig_xyz789abc',
      },
    };
    const result = AgentThinkingEventSchema.safeParse(event);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data.signature).toBe('sig_xyz789abc');
    }
  });

  it('should reject missing content', () => {
    /*
    Test Doc:
    - Why: Thinking without content is meaningless
    - Contract: data.content is required string
    - Usage Notes: Empty thinking should not be emitted
    - Quality Contribution: Catches empty thinking events
    - Worked Example: { data: {} } without content → failure
    */
    const event = {
      type: 'thinking',
      timestamp: timestamp(),
      data: {
        // Missing content
        signature: 'sig_xyz',
      },
    };
    const result = AgentThinkingEventSchema.safeParse(event);

    expect(result.success).toBe(false);
  });

  it('should accept thinking without signature', () => {
    /*
    Test Doc:
    - Why: Copilot reasoning doesn't include signatures
    - Contract: signature is optional
    - Usage Notes: Works for both Claude and Copilot
    - Quality Contribution: Ensures cross-agent compatibility
    - Worked Example: { data: { content: '...' } } without signature → success
    */
    const event = {
      type: 'thinking',
      timestamp: timestamp(),
      data: {
        content: 'Analyzing the problem...',
        // No signature
      },
    };
    const result = AgentThinkingEventSchema.safeParse(event);

    expect(result.success).toBe(true);
  });
});
