/**
 * Agent Event Schema Tests
 *
 * TDD RED phase tests for AgentEventSchema SSE extension.
 * Per dossier T003: Tests cover agent_text_delta, agent_session_status,
 * agent_usage_update, agent_error events; validates all required fields.
 *
 * Per Critical Insights: These schemas will be defined in agent-events.schema.ts
 * and imported into sse-events.schema.ts union.
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
