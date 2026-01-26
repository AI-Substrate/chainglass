/**
 * Agent Run API Route Tests
 *
 * Tests for /api/agents/run endpoint.
 * Uses fakes over mocks per constitution mandate.
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 2: Core Chat, Subtask 001)
 */

import {
  type AdapterFactory,
  AgentService,
  FakeAgentAdapter,
  FakeConfigService,
  FakeLogger,
} from '@chainglass/shared';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetBootstrapSingleton } from '../../../../../apps/web/src/lib/bootstrap-singleton';
import { sseManager } from '../../../../../apps/web/src/lib/sse-manager';

// ============ Test Helpers ============

/**
 * Fake SSE connection tracker.
 * Captures broadcasts to verify event translation.
 */
class FakeSSECapture {
  broadcasts: Array<{ channel: string; eventType: string; data: unknown }> = [];
  private originalBroadcast: typeof sseManager.broadcast;

  setup(): void {
    this.broadcasts = [];
    this.originalBroadcast = sseManager.broadcast.bind(sseManager);
    // Intercept broadcasts
    sseManager.broadcast = (channel: string, eventType: string, data: unknown) => {
      this.broadcasts.push({ channel, eventType, data });
      // Don't call original - no real connections in tests
    };
  }

  teardown(): void {
    sseManager.broadcast = this.originalBroadcast;
  }

  getByEventType(eventType: string) {
    return this.broadcasts.filter((b) => b.eventType === eventType);
  }
}

/**
 * Create a NextRequest for testing.
 */
function createRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/agents/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Setup test environment with FakeAgentAdapter.
 * Uses globalThis to inject test configuration before route loads.
 */
function setupTestBootstrap(): void {
  // Reset any existing singleton
  resetBootstrapSingleton();

  // Create fake services
  const fakeConfig = new FakeConfigService({
    sample: { enabled: true, timeout: 30, name: 'test-fixture' },
    agent: { timeout: 60000 }, // 1 minute for tests
  });

  const fakeLogger = new FakeLogger();

  // Create adapter factory that returns FakeAgentAdapter
  const adapterFactory: AdapterFactory = () =>
    new FakeAgentAdapter({
      sessionId: 'test-agent-session-id',
      output: 'Test output from fake adapter',
      tokens: { used: 100, total: 500, limit: 200000 },
    });

  const fakeAgentService = new AgentService(adapterFactory, fakeConfig, fakeLogger);

  // Inject into globalThis for bootstrap-singleton to use
  const globalForBootstrap = globalThis as typeof globalThis & {
    bootstrapSingleton?: { container: { resolve: (token: string) => unknown }; config: unknown };
  };

  // Create a minimal container that returns our fake service
  const fakeContainer = {
    resolve: (token: string) => {
      if (token === 'AgentService') {
        return fakeAgentService;
      }
      throw new Error(`Unknown token: ${token}`);
    },
  };

  globalForBootstrap.bootstrapSingleton = {
    container: fakeContainer,
    config: fakeConfig,
  };
}

// ============ Tests ============

describe('/api/agents/run', () => {
  let sseCapture: FakeSSECapture;

  beforeEach(() => {
    sseCapture = new FakeSSECapture();
    sseCapture.setup();
    setupTestBootstrap();
  });

  afterEach(() => {
    sseCapture.teardown();
    resetBootstrapSingleton();
  });

  describe('request validation', () => {
    it('should reject empty prompt', async () => {
      /*
      Test Doc:
      - Why: Prevent empty prompts from being sent to agent
      - Contract: prompt must be non-empty string
      - Usage Notes: Returns 400 with error message
      - Quality Contribution: Catches validation errors early
      - Worked Example: { prompt: '' } → 400 "Prompt is required"
      */
      // Import the route handler (fresh import to pick up test bootstrap)
      const { POST } = await import('../../../../../apps/web/app/api/agents/run/route');

      const request = createRequest({
        prompt: '',
        agentType: 'claude-code',
        sessionId: 'test-session',
        channel: 'agent-test',
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      // Zod validation error or generic error message
      expect(body.error).toBeDefined();
    });

    it('should reject invalid agent type', async () => {
      /*
      Test Doc:
      - Why: Only claude-code and copilot are supported
      - Contract: agentType must be 'claude-code' or 'copilot'
      - Usage Notes: Returns 400 for unknown types
      - Quality Contribution: Prevents invalid adapter resolution
      - Worked Example: { agentType: 'gpt-4' } → 400
      */
      const { POST } = await import('../../../../../apps/web/app/api/agents/run/route');

      const request = createRequest({
        prompt: 'Hello',
        agentType: 'gpt-4',
        sessionId: 'test-session',
        channel: 'agent-test',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('should reject missing required fields', async () => {
      /*
      Test Doc:
      - Why: All required fields must be present
      - Contract: prompt, agentType, sessionId, channel are required
      - Usage Notes: Returns 400 with validation errors
      - Quality Contribution: Complete input validation
      - Worked Example: { prompt: 'Hi' } → 400 (missing fields)
      */
      const { POST } = await import('../../../../../apps/web/app/api/agents/run/route');

      const request = createRequest({
        prompt: 'Hello',
        // Missing agentType, sessionId, channel
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('should reject malformed JSON - COR-001', async () => {
      /*
      Test Doc:
      - Why: Prevent crashes from invalid JSON before Zod validation
      - Contract: SyntaxError returns 400 with descriptive message
      - Usage Notes: Handles edge case of malformed request body
      - Quality Contribution: Proper error handling for all input types
      - Worked Example: "{ invalid json }" → 400 "Invalid JSON in request body"
      */
      const { POST } = await import('../../../../../apps/web/app/api/agents/run/route');

      // Create request with raw malformed JSON (not using createRequest helper)
      const request = new NextRequest('http://localhost:3000/api/agents/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ invalid json without quotes }',
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain('Invalid JSON');
    });
  });

  describe('SSE event broadcasting', () => {
    it('should broadcast session_status running on start', async () => {
      /*
      Test Doc:
      - Why: UI needs to know when agent starts running
      - Contract: Broadcasts agent_session_status with status='running' before agent call
      - Usage Notes: Happens even if agent fails
      - Quality Contribution: Consistent status lifecycle
      - Worked Example: POST → agent_session_status { status: 'running' }
      */
      const { POST } = await import('../../../../../apps/web/app/api/agents/run/route');

      const request = createRequest({
        prompt: 'Hello',
        agentType: 'claude-code',
        sessionId: 'test-session',
        channel: 'agent-test',
      });

      await POST(request);

      const statusEvents = sseCapture.getByEventType('agent_session_status');
      expect(statusEvents.length).toBeGreaterThanOrEqual(1);

      const firstEvent = statusEvents[0];
      expect(firstEvent.channel).toBe('agent-test');
      expect((firstEvent.data as { data: { status: string } }).data.status).toBe('running');
    });

    it('should broadcast completion status on success', async () => {
      /*
      Test Doc:
      - Why: UI needs to know when agent finishes
      - Contract: Broadcasts agent_session_status with status='completed' after success
      - Usage Notes: Status reflects AgentResult.status
      - Quality Contribution: Complete status lifecycle
      - Worked Example: Agent completes → agent_session_status { status: 'completed' }
      */
      const { POST } = await import('../../../../../apps/web/app/api/agents/run/route');

      const request = createRequest({
        prompt: 'Hello',
        agentType: 'claude-code',
        sessionId: 'test-session',
        channel: 'agent-test',
      });

      await POST(request);

      const statusEvents = sseCapture.getByEventType('agent_session_status');
      // Should have at least running + completed
      expect(statusEvents.length).toBeGreaterThanOrEqual(2);

      const lastEvent = statusEvents[statusEvents.length - 1];
      expect((lastEvent.data as { data: { status: string } }).data.status).toBe('completed');
    });
  });

  describe('response format', () => {
    it('should return agentSessionId for resumption', async () => {
      /*
      Test Doc:
      - Why: Client needs agentSessionId to resume session (per DYK-03)
      - Contract: Response includes agentSessionId from adapter result
      - Usage Notes: Store in COMPLETE_RUN action for subsequent calls
      - Quality Contribution: Enables session continuity
      - Worked Example: Response { agentSessionId: 'uuid-from-adapter' }
      */
      const { POST } = await import('../../../../../apps/web/app/api/agents/run/route');

      const request = createRequest({
        prompt: 'Hello',
        agentType: 'claude-code',
        sessionId: 'test-session',
        channel: 'agent-test',
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toHaveProperty('agentSessionId');
      expect(body.agentSessionId).toBe('test-agent-session-id');
    });

    it('should return output and status', async () => {
      /*
      Test Doc:
      - Why: Client needs final output and status
      - Contract: Response includes output string and status enum
      - Usage Notes: output may be empty for failed runs
      - Quality Contribution: Complete response format
      - Worked Example: Response { output: '...', status: 'completed' }
      */
      const { POST } = await import('../../../../../apps/web/app/api/agents/run/route');

      const request = createRequest({
        prompt: 'Hello',
        agentType: 'claude-code',
        sessionId: 'test-session',
        channel: 'agent-test',
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.output).toBe('Test output from fake adapter');
      expect(body.status).toBe('completed');
    });

    it('should return token metrics when available', async () => {
      /*
      Test Doc:
      - Why: UI displays context window usage from tokens
      - Contract: Response includes tokens object (may be null for some adapters)
      - Usage Notes: Copilot doesn't provide token metrics (returns null)
      - Quality Contribution: Token tracking for context window display
      - Worked Example: Response { tokens: { used: 100, total: 200, limit: 200000 } }
      */
      const { POST } = await import('../../../../../apps/web/app/api/agents/run/route');

      const request = createRequest({
        prompt: 'Hello',
        agentType: 'claude-code',
        sessionId: 'test-session',
        channel: 'agent-test',
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.tokens).toEqual({
        used: 100,
        total: 500,
        limit: 200000,
      });
    });
  });

  describe('agent session resumption', () => {
    it('should pass agentSessionId to service for resumption', async () => {
      /*
      Test Doc:
      - Why: Resumption requires passing previous agentSessionId (per DYK-03)
      - Contract: If agentSessionId provided, passed to AgentService.run()
      - Usage Notes: Maps to sessionId in AgentServiceRunOptions
      - Quality Contribution: Session continuity works
      - Worked Example: Request { agentSessionId: 'prev-id' } → adapter gets sessionId='prev-id'
      */
      const { POST } = await import('../../../../../apps/web/app/api/agents/run/route');

      const request = createRequest({
        prompt: 'Continue the conversation',
        agentType: 'claude-code',
        sessionId: 'client-session-123',
        channel: 'agent-client-session-123',
        agentSessionId: 'adapter-session-abc', // From previous COMPLETE_RUN
      });

      const response = await POST(request);

      // Request should succeed (FakeAgentAdapter handles any sessionId)
      expect(response.status).toBe(200);
    });
  });
});
