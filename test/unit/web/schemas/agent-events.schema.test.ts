/**
 * Agent Event Schema Tests
 *
 * TDD RED phase tests for AgentEventSchema SSE extension.
 * Per dossier T003: Tests cover agent_text_delta, agent_session_status,
 * agent_usage_update, agent_error events; validates all required fields.
 *
 * Per Critical Insights: These schemas will be defined in agent-events.schema.ts
 * and imported into sse-events.schema.ts union.
 *
 * Plan 015 Phase 1 (T006): Extended with tests for new SSE event types
 * (agent_tool_call, agent_tool_result, agent_thinking) that wrap shared schemas.
 */

import { describe, expect, it } from 'vitest';
// Import from schema file that doesn't exist yet - this SHOULD fail in RED phase
import {
  type AgentErrorEvent,
  AgentErrorEventSchema,
  type AgentEvent,
  AgentEventSchema,
  type AgentSessionStatusEvent,
  AgentSessionStatusEventSchema,
  type AgentTextDeltaEvent,
  AgentTextDeltaEventSchema,
  // Plan 015 Phase 1: New SSE event types for tool visibility
  AgentThinkingBroadcastEventSchema,
  AgentToolCallBroadcastEventSchema,
  AgentToolResultBroadcastEventSchema,
  type AgentUsageUpdateEvent,
  AgentUsageUpdateEventSchema,
} from '../../../../apps/web/src/lib/schemas/agent-events.schema';

// Helper to create valid ISO timestamp
const timestamp = () => new Date().toISOString();

describe('AgentTextDeltaEventSchema', () => {
  it('should validate agent_text_delta event', () => {
    /*
    Test Doc:
    - Why: Core streaming event - carries incremental response text
    - Contract: Has type 'agent_text_delta', timestamp, sessionId, and delta text
    - Usage Notes: Used by StreamingMessage component to append text
    - Quality Contribution: Ensures streaming data integrity
    - Worked Example: { type: 'agent_text_delta', data: { delta: 'Hello' } } → success
    */
    const event = {
      type: 'agent_text_delta',
      timestamp: timestamp(),
      data: {
        sessionId: 'session-123',
        delta: 'Hello, ',
      },
    };
    const result = AgentTextDeltaEventSchema.safeParse(event);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('agent_text_delta');
      expect(result.data.data.delta).toBe('Hello, ');
    }
  });

  it('should reject missing sessionId', () => {
    /*
    Test Doc:
    - Why: sessionId is required to route delta to correct session
    - Contract: data.sessionId is required string
    - Usage Notes: Always include sessionId from agent response
    - Quality Contribution: Catches misconfigured SSE broadcasts
    - Worked Example: { data: { delta: 'x' } } without sessionId → failure
    */
    const event = {
      type: 'agent_text_delta',
      timestamp: timestamp(),
      data: {
        delta: 'Hello',
        // Missing sessionId
      },
    };
    const result = AgentTextDeltaEventSchema.safeParse(event);

    expect(result.success).toBe(false);
  });
});

describe('AgentSessionStatusEventSchema', () => {
  it('should validate agent_session_status event', () => {
    /*
    Test Doc:
    - Why: Status changes drive UI updates (running, idle, error states)
    - Contract: Has type 'agent_session_status', sessionId, status enum
    - Usage Notes: Triggers status indicator color changes
    - Quality Contribution: Ensures state machine transitions are valid
    - Worked Example: { status: 'running' } → success
    */
    const event = {
      type: 'agent_session_status',
      timestamp: timestamp(),
      data: {
        sessionId: 'session-123',
        status: 'running',
      },
    };
    const result = AgentSessionStatusEventSchema.safeParse(event);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data.status).toBe('running');
    }
  });

  it('should accept all valid session statuses', () => {
    /*
    Test Doc:
    - Why: Documents complete set of valid statuses for SSE events
    - Contract: Valid statuses: idle, running, waiting_input, completed, error
    - Usage Notes: 'error' is SSE-specific (different from 'archived' in storage)
    - Quality Contribution: Validates status enum completeness
    - Worked Example: Each status value parses successfully
    */
    const statuses = ['idle', 'running', 'waiting_input', 'completed', 'error'];

    for (const status of statuses) {
      const event = {
        type: 'agent_session_status',
        timestamp: timestamp(),
        data: {
          sessionId: 'session-123',
          status,
        },
      };
      const result = AgentSessionStatusEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    }
  });
});

describe('AgentUsageUpdateEventSchema', () => {
  it('should validate agent_usage_update event', () => {
    /*
    Test Doc:
    - Why: Token usage drives context window warning UI
    - Contract: Has sessionId, tokensUsed, tokensTotal (optional limit)
    - Usage Notes: Used for context window percentage calculation
    - Quality Contribution: Ensures usage data is parseable
    - Worked Example: { tokensUsed: 1000, tokensTotal: 200000 } → 0.5%
    */
    const event = {
      type: 'agent_usage_update',
      timestamp: timestamp(),
      data: {
        sessionId: 'session-123',
        tokensUsed: 1000,
        tokensTotal: 100000,
        tokensLimit: 200000,
      },
    };
    const result = AgentUsageUpdateEventSchema.safeParse(event);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data.tokensUsed).toBe(1000);
      expect(result.data.data.tokensTotal).toBe(100000);
    }
  });

  it('should allow optional tokensLimit', () => {
    /*
    Test Doc:
    - Why: Not all agents provide limit (Copilot doesn't)
    - Contract: tokensLimit is optional number
    - Usage Notes: UI shows "unavailable" when limit missing
    - Quality Contribution: Handles partial usage data gracefully
    - Worked Example: { tokensUsed: 1000 } without limit → success
    */
    const event = {
      type: 'agent_usage_update',
      timestamp: timestamp(),
      data: {
        sessionId: 'session-123',
        tokensUsed: 1000,
        tokensTotal: 100000,
        // No tokensLimit
      },
    };
    const result = AgentUsageUpdateEventSchema.safeParse(event);

    expect(result.success).toBe(true);
  });
});

describe('AgentErrorEventSchema', () => {
  it('should validate agent_error event', () => {
    /*
    Test Doc:
    - Why: Errors need structured display with code and message
    - Contract: Has sessionId, message (string), optional code
    - Usage Notes: Displayed in chat with error styling
    - Quality Contribution: Ensures error details are captured
    - Worked Example: { message: 'Timeout', code: 'TIMEOUT' } → success
    */
    const event = {
      type: 'agent_error',
      timestamp: timestamp(),
      data: {
        sessionId: 'session-123',
        message: 'Agent timeout after 600s',
        code: 'TIMEOUT',
      },
    };
    const result = AgentErrorEventSchema.safeParse(event);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data.message).toBe('Agent timeout after 600s');
      expect(result.data.data.code).toBe('TIMEOUT');
    }
  });

  it('should allow optional error code', () => {
    /*
    Test Doc:
    - Why: Not all errors have codes (generic errors)
    - Contract: code is optional string
    - Usage Notes: UI displays message without code when absent
    - Quality Contribution: Handles unstructured errors gracefully
    - Worked Example: { message: 'Unknown error' } without code → success
    */
    const event = {
      type: 'agent_error',
      timestamp: timestamp(),
      data: {
        sessionId: 'session-123',
        message: 'Something went wrong',
        // No code
      },
    };
    const result = AgentErrorEventSchema.safeParse(event);

    expect(result.success).toBe(true);
  });
});

describe('AgentEventSchema (Union)', () => {
  it('should validate all agent event types', () => {
    /*
    Test Doc:
    - Why: Union schema used by useSSE for event validation
    - Contract: Accepts any of the 4 agent event types
    - Usage Notes: Use AgentEventSchema.safeParse() for generic handling
    - Quality Contribution: Validates discriminated union works correctly
    - Worked Example: All 4 event types parse successfully
    */
    const events = [
      {
        type: 'agent_text_delta',
        timestamp: timestamp(),
        data: { sessionId: 's1', delta: 'hi' },
      },
      {
        type: 'agent_session_status',
        timestamp: timestamp(),
        data: { sessionId: 's1', status: 'running' },
      },
      {
        type: 'agent_usage_update',
        timestamp: timestamp(),
        data: { sessionId: 's1', tokensUsed: 100, tokensTotal: 1000 },
      },
      {
        type: 'agent_error',
        timestamp: timestamp(),
        data: { sessionId: 's1', message: 'Error' },
      },
    ];

    for (const event of events) {
      const result = AgentEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    }
  });

  it('should reject unknown agent event type', () => {
    /*
    Test Doc:
    - Why: Ensures schema strictness - unknown types don't slip through
    - Contract: Unknown 'type' values fail validation
    - Usage Notes: Add new event types to both schema and union
    - Quality Contribution: Catches typos and integration mismatches
    - Worked Example: { type: 'agent_unknown' } → failure
    */
    const event = {
      type: 'agent_unknown',
      timestamp: timestamp(),
      data: { sessionId: 's1' },
    };
    const result = AgentEventSchema.safeParse(event);

    expect(result.success).toBe(false);
  });
});

// ============ Plan 015 Phase 1: New SSE Event Types for Tool Visibility ============

describe('AgentToolCallBroadcastEventSchema', () => {
  it('should validate agent_tool_call SSE event', () => {
    /*
    Test Doc:
    - Why: SSE broadcast needs sessionId for client-side routing (ADR-0007)
    - Contract: Has type 'agent_tool_call', sessionId in data, plus tool details
    - Usage Notes: UI uses sessionId to route to correct session panel
    - Quality Contribution: Ensures tool call broadcasts work with SSE manager
    - Worked Example: { type: 'agent_tool_call', data: { sessionId: 's1', toolName: 'Bash' } } → success
    */
    const event = {
      type: 'agent_tool_call',
      timestamp: timestamp(),
      data: {
        sessionId: 'session-123',
        toolName: 'Bash',
        input: { command: 'ls -la' },
        toolCallId: 'toolu_abc123',
      },
    };
    const result = AgentToolCallBroadcastEventSchema.safeParse(event);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('agent_tool_call');
      expect(result.data.data.sessionId).toBe('session-123');
      expect(result.data.data.toolName).toBe('Bash');
    }
  });

  it('should require sessionId for SSE routing', () => {
    /*
    Test Doc:
    - Why: SSE events require sessionId per ADR-0007 single-channel routing
    - Contract: data.sessionId is required
    - Usage Notes: Without sessionId, event cannot be routed to correct UI
    - Quality Contribution: Ensures ADR-0007 compliance
    - Worked Example: { data: { toolName: 'Bash' } } without sessionId → failure
    */
    const event = {
      type: 'agent_tool_call',
      timestamp: timestamp(),
      data: {
        // Missing sessionId
        toolName: 'Bash',
        input: { command: 'ls' },
        toolCallId: 'toolu_abc123',
      },
    };
    const result = AgentToolCallBroadcastEventSchema.safeParse(event);

    expect(result.success).toBe(false);
  });
});

describe('AgentToolResultBroadcastEventSchema', () => {
  it('should validate agent_tool_result SSE event', () => {
    /*
    Test Doc:
    - Why: Tool result broadcasts update ToolCallCard with output
    - Contract: Has type 'agent_tool_result', sessionId, output, isError
    - Usage Notes: Links to tool_call via toolCallId
    - Quality Contribution: Ensures result routing works
    - Worked Example: { type: 'agent_tool_result', data: { sessionId: 's1', output: '...' } } → success
    */
    const event = {
      type: 'agent_tool_result',
      timestamp: timestamp(),
      data: {
        sessionId: 'session-123',
        toolCallId: 'toolu_abc123',
        output: 'total 48\ndrwxr-xr-x...',
        isError: false,
      },
    };
    const result = AgentToolResultBroadcastEventSchema.safeParse(event);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('agent_tool_result');
      expect(result.data.data.isError).toBe(false);
    }
  });

  it('should require sessionId for SSE routing', () => {
    /*
    Test Doc:
    - Why: SSE events require sessionId per ADR-0007
    - Contract: data.sessionId is required
    - Usage Notes: Used to route result to correct session
    - Quality Contribution: Ensures proper SSE event routing
    - Worked Example: Missing sessionId → failure
    */
    const event = {
      type: 'agent_tool_result',
      timestamp: timestamp(),
      data: {
        // Missing sessionId
        toolCallId: 'toolu_abc123',
        output: 'result',
        isError: false,
      },
    };
    const result = AgentToolResultBroadcastEventSchema.safeParse(event);

    expect(result.success).toBe(false);
  });
});

describe('AgentThinkingBroadcastEventSchema', () => {
  it('should validate agent_thinking SSE event', () => {
    /*
    Test Doc:
    - Why: Thinking broadcasts display Claude reasoning in UI
    - Contract: Has type 'agent_thinking', sessionId, content
    - Usage Notes: Displayed as collapsible section per AC5
    - Quality Contribution: Ensures thinking visibility pipeline works
    - Worked Example: { type: 'agent_thinking', data: { sessionId: 's1', content: '...' } } → success
    */
    const event = {
      type: 'agent_thinking',
      timestamp: timestamp(),
      data: {
        sessionId: 'session-123',
        content: 'Let me analyze this step by step...',
      },
    };
    const result = AgentThinkingBroadcastEventSchema.safeParse(event);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('agent_thinking');
      expect(result.data.data.content).toContain('step by step');
    }
  });

  it('should accept optional signature field', () => {
    /*
    Test Doc:
    - Why: Claude extended thinking includes signature
    - Contract: data.signature is optional
    - Usage Notes: Copilot reasoning doesn't have signatures
    - Quality Contribution: Handles both Claude and Copilot
    - Worked Example: { data: { content: '...', signature: 'sig_xyz' } } → success
    */
    const event = {
      type: 'agent_thinking',
      timestamp: timestamp(),
      data: {
        sessionId: 'session-123',
        content: 'Thinking...',
        signature: 'sig_xyz789',
      },
    };
    const result = AgentThinkingBroadcastEventSchema.safeParse(event);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data.signature).toBe('sig_xyz789');
    }
  });

  it('should require sessionId for SSE routing', () => {
    /*
    Test Doc:
    - Why: SSE events require sessionId per ADR-0007
    - Contract: data.sessionId is required
    - Usage Notes: Routes thinking to correct session panel
    - Quality Contribution: Ensures proper SSE event routing
    - Worked Example: Missing sessionId → failure
    */
    const event = {
      type: 'agent_thinking',
      timestamp: timestamp(),
      data: {
        // Missing sessionId
        content: 'Thinking without session...',
      },
    };
    const result = AgentThinkingBroadcastEventSchema.safeParse(event);

    expect(result.success).toBe(false);
  });
});
