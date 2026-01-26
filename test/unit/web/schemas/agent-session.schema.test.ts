/**
 * Agent Session Schema Tests
 *
 * TDD RED phase tests for AgentSessionSchema Zod validation.
 * Per dossier T001: Tests cover valid session, missing fields, invalid status enum,
 * invalid agentType, message array validation, timestamp fields.
 *
 * Uses direct instantiation pattern (per DYK #4 from Plan 010).
 */

import { describe, expect, it } from 'vitest';
// Import from schema file that doesn't exist yet - this SHOULD fail in RED phase
import {
  type AgentMessage,
  AgentMessageSchema,
  type AgentSession,
  AgentSessionSchema,
  type AgentType,
  AgentTypeSchema,
  type SessionStatus,
  SessionStatusSchema,
} from '../../../../apps/web/src/lib/schemas/agent-session.schema';

describe('AgentSessionSchema', () => {
  // Helper to create a valid session for modification
  const createValidSession = (overrides?: Partial<AgentSession>): Record<string, unknown> => ({
    id: 'abc-123',
    name: 'My Claude Session',
    agentType: 'claude-code',
    status: 'idle',
    messages: [],
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    ...overrides,
  });

  it('should validate a complete session', () => {
    /*
    Test Doc:
    - Why: Ensures valid session data roundtrips correctly through localStorage
    - Contract: Valid sessions have id, name, agentType, status, messages array, timestamps
    - Usage Notes: Use schema.safeParse() for validation
    - Quality Contribution: Catches malformed session data before it corrupts state
    - Worked Example: { id: 'uuid', name: 'Session 1', ... } → { success: true }
    */
    const validSession = createValidSession();
    const result = AgentSessionSchema.safeParse(validSession);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('abc-123');
      expect(result.data.name).toBe('My Claude Session');
      expect(result.data.agentType).toBe('claude-code');
      expect(result.data.status).toBe('idle');
      expect(result.data.messages).toEqual([]);
    }
  });

  it('should reject missing required fields', () => {
    /*
    Test Doc:
    - Why: Catches incomplete data from corrupted localStorage or API errors
    - Contract: Sessions without required fields (id, name, agentType, status) fail validation
    - Usage Notes: Check result.success before accessing data
    - Quality Contribution: Prevents undefined access on malformed data
    - Worked Example: { name: 'Test' } (missing id) → { success: false }
    */
    const incompleteSession = { name: 'Test Session' };
    const result = AgentSessionSchema.safeParse(incompleteSession);

    expect(result.success).toBe(false);
    if (!result.success) {
      // Should have errors for missing required fields
      const errorPaths = result.error.issues.map((i) => i.path[0]);
      expect(errorPaths).toContain('id');
      expect(errorPaths).toContain('agentType');
      expect(errorPaths).toContain('status');
    }
  });

  it('should reject invalid status enum', () => {
    /*
    Test Doc:
    - Why: Prevents invalid states from corrupting session state machine
    - Contract: status must be one of: 'idle', 'running', 'waiting_input', 'completed', 'archived'
    - Usage Notes: Invalid status returns { success: false } with ZodError
    - Quality Contribution: Catches typos and integration errors with status values
    - Worked Example: { status: 'unknown' } → { success: false }
    */
    const invalidSession = createValidSession({ status: 'unknown' as SessionStatus });
    const result = AgentSessionSchema.safeParse(invalidSession);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('status');
    }
  });

  it('should reject invalid agent type', () => {
    /*
    Test Doc:
    - Why: Prevents unknown agent types from corrupting session state
    - Contract: agentType must be 'claude-code' or 'copilot'
    - Usage Notes: Invalid types return { success: false } with ZodError
    - Quality Contribution: Catches integration errors with new agent types
    - Worked Example: { agentType: 'gpt-4' } → { success: false }
    */
    const invalidSession = createValidSession({ agentType: 'gpt-4' as AgentType });
    const result = AgentSessionSchema.safeParse(invalidSession);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('agentType');
    }
  });

  it('should validate messages array with valid messages', () => {
    /*
    Test Doc:
    - Why: Ensures message structure is correct for chat display
    - Contract: messages array contains AgentMessage objects with role, content, timestamp
    - Usage Notes: Empty messages array is valid; each message needs all fields
    - Quality Contribution: Catches malformed messages that would break chat UI
    - Worked Example: { messages: [{ role: 'user', content: 'hi', timestamp: 123 }] } → success
    */
    const sessionWithMessages = createValidSession({
      messages: [
        { role: 'user', content: 'Hello', timestamp: Date.now() },
        { role: 'assistant', content: 'Hi there!', timestamp: Date.now() },
      ],
    });
    const result = AgentSessionSchema.safeParse(sessionWithMessages);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.messages).toHaveLength(2);
      expect(result.data.messages[0].role).toBe('user');
      expect(result.data.messages[1].role).toBe('assistant');
    }
  });

  it('should reject messages with missing fields', () => {
    /*
    Test Doc:
    - Why: Catches corrupted messages that would cause runtime errors in chat display
    - Contract: Each message must have role, content, and timestamp
    - Usage Notes: Partial messages fail validation
    - Quality Contribution: Prevents undefined access on message properties
    - Worked Example: { messages: [{ content: 'hi' }] } (missing role) → { success: false }
    */
    const sessionWithBadMessages = createValidSession({
      messages: [{ content: 'Hello' }], // Missing role and timestamp
    });
    const result = AgentSessionSchema.safeParse(sessionWithBadMessages);

    expect(result.success).toBe(false);
    if (!result.success) {
      const errorPaths = result.error.issues.map((i) => i.path.join('.'));
      expect(errorPaths.some((p) => p.includes('messages'))).toBe(true);
    }
  });

  it('should require timestamp fields', () => {
    /*
    Test Doc:
    - Why: Timestamps enable sorting sessions by activity and showing relative times
    - Contract: createdAt and lastActiveAt are required number fields (epoch ms)
    - Usage Notes: Use Date.now() for current timestamp
    - Quality Contribution: Catches missing timestamps that would break session sorting
    - Worked Example: session without createdAt → { success: false }
    */
    const sessionWithoutTimestamps = {
      id: 'abc-123',
      name: 'Test',
      agentType: 'claude-code',
      status: 'idle',
      messages: [],
      // Missing createdAt and lastActiveAt
    };
    const result = AgentSessionSchema.safeParse(sessionWithoutTimestamps);

    expect(result.success).toBe(false);
    if (!result.success) {
      const errorPaths = result.error.issues.map((i) => i.path[0]);
      expect(errorPaths).toContain('createdAt');
      expect(errorPaths).toContain('lastActiveAt');
    }
  });
});

describe('SessionStatusSchema', () => {
  it('should accept all valid status values', () => {
    /*
    Test Doc:
    - Why: Documents the complete set of valid statuses for agent sessions
    - Contract: Valid statuses are: idle, running, waiting_input, completed, archived
    - Usage Notes: Use schema.parse() when you know data is valid; safeParse() for unknown data
    - Quality Contribution: Serves as living documentation of valid statuses
    - Worked Example: SessionStatusSchema.parse('idle') → 'idle'
    */
    const validStatuses = ['idle', 'running', 'waiting_input', 'completed', 'archived'];

    for (const status of validStatuses) {
      const result = SessionStatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    }
  });
});

describe('AgentTypeSchema', () => {
  it('should accept all valid agent types', () => {
    /*
    Test Doc:
    - Why: Documents the complete set of supported agent types
    - Contract: Valid types are: claude-code, copilot
    - Usage Notes: Extend this schema when adding new agent types
    - Quality Contribution: Single source of truth for supported agents
    - Worked Example: AgentTypeSchema.parse('claude-code') → 'claude-code'
    */
    const validTypes = ['claude-code', 'copilot'];

    for (const agentType of validTypes) {
      const result = AgentTypeSchema.safeParse(agentType);
      expect(result.success).toBe(true);
    }
  });
});

describe('AgentMessageSchema', () => {
  it('should validate a complete message', () => {
    /*
    Test Doc:
    - Why: Messages are the core data structure for chat display
    - Contract: Message has role ('user' | 'assistant'), content (string), timestamp (number)
    - Usage Notes: timestamp is epoch milliseconds (Date.now())
    - Quality Contribution: Ensures message integrity for persistence
    - Worked Example: { role: 'user', content: 'hi', timestamp: 123 } → success
    */
    const validMessage = {
      role: 'user',
      content: 'Hello, Claude!',
      timestamp: Date.now(),
    };
    const result = AgentMessageSchema.safeParse(validMessage);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe('user');
      expect(result.data.content).toBe('Hello, Claude!');
    }
  });

  it('should reject invalid role', () => {
    /*
    Test Doc:
    - Why: Only user and assistant roles are valid in agent conversations
    - Contract: role must be 'user' or 'assistant'
    - Usage Notes: 'system' role is not supported in this UI
    - Quality Contribution: Catches data corruption or API misuse
    - Worked Example: { role: 'system' } → { success: false }
    */
    const invalidMessage = {
      role: 'system', // Invalid - only user/assistant allowed
      content: 'Hello',
      timestamp: Date.now(),
    };
    const result = AgentMessageSchema.safeParse(invalidMessage);

    expect(result.success).toBe(false);
  });
});
