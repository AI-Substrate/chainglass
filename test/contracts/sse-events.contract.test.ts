/**
 * SSE Events Contract Test
 *
 * Verifies backward compatibility: all 7 existing SSE event types still parse
 * correctly after Plan 012 agent event extensions.
 *
 * Per Critical Finding CF-03: This test serves as a backward compatibility gate.
 * If this test fails, it means the SSE schema extension broke existing consumers.
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 1: Foundation)
 */

import { describe, expect, it } from 'vitest';
import { sseEventSchema } from '../../apps/web/src/lib/schemas/sse-events.schema';

// Helper to create valid ISO timestamp
const timestamp = () => new Date().toISOString();

describe('SSE Events Contract Test', () => {
  describe('Original Event Types (Backward Compatibility)', () => {
    it('should parse workflow_status event', () => {
      /*
      Test Doc:
      - Why: Workflow status events drive workflow progress UI
      - Contract: { type: 'workflow_status', data: { workflowId, phase, progress? } }
      - Usage Notes: phase is enum: pending, running, completed, failed
      - Quality Contribution: Regression gate for workflow features
      - Worked Example: Workflow dashboard uses this to show phase indicators
      */
      const event = {
        type: 'workflow_status',
        timestamp: timestamp(),
        data: {
          workflowId: 'wf-123',
          phase: 'running',
          progress: 50,
        },
      };

      const result = sseEventSchema.safeParse(event);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('workflow_status');
      }
    });

    it('should parse task_update event', () => {
      /*
      Test Doc:
      - Why: Task updates drive Kanban board position changes
      - Contract: { type: 'task_update', data: { taskId, columnId, position } }
      - Usage Notes: position is 0-indexed within column
      - Quality Contribution: Regression gate for Kanban features
      - Worked Example: Drag-and-drop task move broadcasts this event
      */
      const event = {
        type: 'task_update',
        timestamp: timestamp(),
        data: {
          taskId: 'task-123',
          columnId: 'in-progress',
          position: 0,
        },
      };

      const result = sseEventSchema.safeParse(event);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('task_update');
      }
    });

    it('should parse heartbeat event', () => {
      /*
      Test Doc:
      - Why: Heartbeats keep SSE connection alive through proxies
      - Contract: { type: 'heartbeat', data: {} }
      - Usage Notes: Empty data object is required (not undefined)
      - Quality Contribution: Regression gate for connection health
      - Worked Example: Server sends every 30s to prevent timeout
      */
      const event = {
        type: 'heartbeat',
        timestamp: timestamp(),
        data: {},
      };

      const result = sseEventSchema.safeParse(event);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('heartbeat');
      }
    });

    it('should parse run_status event', () => {
      /*
      Test Doc:
      - Why: Run status drives workflow run progress tracking (Plan 011)
      - Contract: { type: 'run_status', data: { runId, workflowSlug, status, currentPhase, completedPhases, totalPhases } }
      - Usage Notes: status enum: pending, active, complete, failed
      - Quality Contribution: Regression gate for run tracking features
      - Worked Example: Run detail page shows real-time progress
      */
      const event = {
        type: 'run_status',
        timestamp: timestamp(),
        data: {
          runId: 'run-123',
          workflowSlug: 'my-workflow',
          status: 'active',
          currentPhase: 'Phase 2',
          completedPhases: 1,
          totalPhases: 5,
        },
      };

      const result = sseEventSchema.safeParse(event);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('run_status');
      }
    });

    it('should parse phase_status event', () => {
      /*
      Test Doc:
      - Why: Phase status drives individual phase indicators (Plan 011)
      - Contract: { type: 'phase_status', data: { runId, phaseName, status, previousStatus?, duration? } }
      - Usage Notes: status has 7 values: pending, ready, active, blocked, accepted, complete, failed
      - Quality Contribution: Regression gate for phase tracking features
      - Worked Example: Phase card shows status badge color
      */
      const event = {
        type: 'phase_status',
        timestamp: timestamp(),
        data: {
          runId: 'run-123',
          phaseName: 'Phase 1',
          status: 'complete',
          previousStatus: 'active',
          duration: 300000,
        },
      };

      const result = sseEventSchema.safeParse(event);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('phase_status');
      }
    });

    it('should parse question event', () => {
      /*
      Test Doc:
      - Why: Question events trigger user input dialogs (Plan 011)
      - Contract: { type: 'question', data: { runId, phaseName, questionId, questionType, prompt, choices?, required? } }
      - Usage Notes: questionType: single_choice, multi_choice, free_text, confirm
      - Quality Contribution: Regression gate for interactive workflow features
      - Worked Example: Phase blocks until user answers the question
      */
      const event = {
        type: 'question',
        timestamp: timestamp(),
        data: {
          runId: 'run-123',
          phaseName: 'Phase 2',
          questionId: 'q-1',
          questionType: 'single_choice',
          prompt: 'Choose an option',
          choices: ['Option A', 'Option B'],
          required: true,
        },
      };

      const result = sseEventSchema.safeParse(event);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('question');
      }
    });

    it('should parse answer event', () => {
      /*
      Test Doc:
      - Why: Answer events confirm question responses (Plan 011)
      - Contract: { type: 'answer', data: { runId, phaseName, questionId, answer, answeredBy? } }
      - Usage Notes: answer can be string, string[], or boolean
      - Quality Contribution: Regression gate for interactive workflow features
      - Worked Example: Shows confirmation that answer was received
      */
      const event = {
        type: 'answer',
        timestamp: timestamp(),
        data: {
          runId: 'run-123',
          phaseName: 'Phase 2',
          questionId: 'q-1',
          answer: 'Option A',
          answeredBy: 'user@example.com',
        },
      };

      const result = sseEventSchema.safeParse(event);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('answer');
      }
    });
  });

  describe('New Agent Event Types (Plan 012)', () => {
    it('should parse agent_text_delta event', () => {
      /*
      Test Doc:
      - Why: Verifies new agent events integrate with existing schema
      - Contract: { type: 'agent_text_delta', data: { sessionId, delta } }
      - Usage Notes: Part of Plan 012 extension
      - Quality Contribution: Validates union extension works
      - Worked Example: Streaming token arrives via SSE
      */
      const event = {
        type: 'agent_text_delta',
        timestamp: timestamp(),
        data: {
          sessionId: 'session-123',
          delta: 'Hello',
        },
      };

      const result = sseEventSchema.safeParse(event);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('agent_text_delta');
      }
    });

    it('should parse all 4 agent event types through extended union', () => {
      /*
      Test Doc:
      - Why: Confirms all agent events work in combined schema
      - Contract: Extended union accepts all 11 event types (7 original + 4 agent)
      - Usage Notes: Order in union doesn't affect parsing (discriminated by 'type')
      - Quality Contribution: Validates CF-03 additive extension strategy
      - Worked Example: All event types coexist without conflict
      */
      const agentEvents = [
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

      for (const event of agentEvents) {
        const result = sseEventSchema.safeParse(event);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Schema Integrity', () => {
    it('should reject unknown event types', () => {
      /*
      Test Doc:
      - Why: Schema strictness prevents garbage data from slipping through
      - Contract: Unknown 'type' values fail validation
      - Usage Notes: Add new event types to schema before using
      - Quality Contribution: Catches typos and integration errors
      - Worked Example: { type: 'invalid_type' } → failure
      */
      const event = {
        type: 'unknown_event_type',
        timestamp: timestamp(),
        data: {},
      };

      const result = sseEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('should require timestamp field', () => {
      /*
      Test Doc:
      - Why: All events need timestamps for ordering and debugging
      - Contract: timestamp is required ISO 8601 datetime string
      - Usage Notes: Use new Date().toISOString() for timestamp
      - Quality Contribution: Catches events without temporal context
      - Worked Example: Event without timestamp → failure
      */
      const event = {
        type: 'heartbeat',
        // Missing timestamp
        data: {},
      };

      const result = sseEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });
  });
});
