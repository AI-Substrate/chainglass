/**
 * Test Doc:
 * - Why: OrchestrationRequest is the contract between ONBAS (decision) and ODS (execution).
 *   Every possible orchestrator action is one of 4 variants in a closed discriminated union.
 * - Contract: Zod schemas validate at runtime, type guards narrow safely, and the exhaustive
 *   never check proves the set is closed. Each variant is self-contained — ODS needs no
 *   secondary lookups.
 * - Usage Notes: Schemas parse raw objects into validated request types. Type guards narrow
 *   the union for switch-based dispatch. getNodeId() returns string | undefined — after
 *   narrowing, prefer request.nodeId directly (DYK-I7).
 * - Quality Contribution: Catches regressions in schema validation, type guard narrowing,
 *   and union exhaustiveness. Prevents accidental variant additions or field changes.
 * - Worked Example: { type: 'start-node', graphSlug: 'my-graph', nodeId: 'n1', inputs: { ok: true, inputs: {} } }
 *   → parses through StartNodeRequestSchema, isStartNodeRequest returns true, getNodeId returns 'n1'.
 */

import { describe, expect, it } from 'vitest';
import {
  getNodeId,
  isNoActionRequest,
  isNodeLevelRequest,
  isQuestionPendingRequest,
  isResumeNodeRequest,
  isStartNodeRequest,
} from '../../../../../packages/positional-graph/src/features/030-orchestration/orchestration-request.guards.js';
import {
  NoActionReasonSchema,
  type NoActionRequest,
  NoActionRequestSchema,
  type OrchestrationRequest,
  OrchestrationRequestSchema,
  type QuestionPendingRequest,
  QuestionPendingRequestSchema,
  type ResumeNodeRequest,
  ResumeNodeRequestSchema,
  type StartNodeRequest,
  StartNodeRequestSchema,
} from '../../../../../packages/positional-graph/src/features/030-orchestration/orchestration-request.schema.js';

// ============================================
// Test Fixtures
// ============================================

const validStartNode: StartNodeRequest = {
  type: 'start-node',
  graphSlug: 'my-pipeline',
  nodeId: 'node-001',
  inputs: { ok: true, inputs: { prompt: 'hello' } },
};

const validResumeNode: ResumeNodeRequest = {
  type: 'resume-node',
  graphSlug: 'my-pipeline',
  nodeId: 'node-002',
  questionId: 'q-001',
  answer: 'yes',
};

const validQuestionPending: QuestionPendingRequest = {
  type: 'question-pending',
  graphSlug: 'my-pipeline',
  nodeId: 'node-003',
  questionId: 'q-002',
  questionText: 'What do you prefer?',
  questionType: 'single',
  options: ['option-a', 'option-b'],
  defaultValue: 'option-a',
};

const validNoAction: NoActionRequest = {
  type: 'no-action',
  graphSlug: 'my-pipeline',
  reason: 'graph-complete',
};

const allRequests: OrchestrationRequest[] = [
  validStartNode,
  validResumeNode,
  validQuestionPending,
  validNoAction,
];

// ============================================
// Schema Validation Tests
// ============================================

describe('OrchestrationRequest Schemas', () => {
  describe('StartNodeRequestSchema', () => {
    it('parses valid start-node request', () => {
      const result = StartNodeRequestSchema.parse(validStartNode);
      expect(result.type).toBe('start-node');
      expect(result.graphSlug).toBe('my-pipeline');
      expect(result.nodeId).toBe('node-001');
      expect(result.inputs.ok).toBe(true);
    });

    it('rejects extra properties (strict mode)', () => {
      expect(() => StartNodeRequestSchema.parse({ ...validStartNode, extra: 'field' })).toThrow();
    });

    it('rejects empty nodeId', () => {
      expect(() => StartNodeRequestSchema.parse({ ...validStartNode, nodeId: '' })).toThrow();
    });

    it('rejects invalid graphSlug format', () => {
      expect(() =>
        StartNodeRequestSchema.parse({ ...validStartNode, graphSlug: 'Invalid-Slug' })
      ).toThrow();
    });
  });

  describe('ResumeNodeRequestSchema', () => {
    it('parses valid resume-node request', () => {
      const result = ResumeNodeRequestSchema.parse(validResumeNode);
      expect(result.type).toBe('resume-node');
      expect(result.nodeId).toBe('node-002');
      expect(result.questionId).toBe('q-001');
      expect(result.answer).toBe('yes');
    });

    it('accepts undefined answer (DYK-I8: z.unknown() accepts undefined, ONBAS enforces)', () => {
      const withUndefined = { ...validResumeNode, answer: undefined };
      const result = ResumeNodeRequestSchema.parse(withUndefined);
      expect(result.answer).toBeUndefined();
    });

    it('rejects extra properties (strict mode)', () => {
      expect(() => ResumeNodeRequestSchema.parse({ ...validResumeNode, extra: 'field' })).toThrow();
    });
  });

  describe('QuestionPendingRequestSchema', () => {
    it('parses valid question-pending request', () => {
      const result = QuestionPendingRequestSchema.parse(validQuestionPending);
      expect(result.type).toBe('question-pending');
      expect(result.questionText).toBe('What do you prefer?');
      expect(result.questionType).toBe('single');
      expect(result.options).toEqual(['option-a', 'option-b']);
      expect(result.defaultValue).toBe('option-a');
    });

    it('parses without optional fields', () => {
      const minimal: QuestionPendingRequest = {
        type: 'question-pending',
        graphSlug: 'my-pipeline',
        nodeId: 'node-003',
        questionId: 'q-002',
        questionText: 'Confirm?',
        questionType: 'confirm',
      };
      const result = QuestionPendingRequestSchema.parse(minimal);
      expect(result.options).toBeUndefined();
      expect(result.defaultValue).toBeUndefined();
    });

    it('accepts boolean defaultValue', () => {
      const withBool = { ...validQuestionPending, defaultValue: true };
      const result = QuestionPendingRequestSchema.parse(withBool);
      expect(result.defaultValue).toBe(true);
    });

    it('rejects extra properties (strict mode)', () => {
      expect(() =>
        QuestionPendingRequestSchema.parse({ ...validQuestionPending, extra: 'field' })
      ).toThrow();
    });
  });

  describe('NoActionRequestSchema', () => {
    it('parses valid no-action request with reason', () => {
      const result = NoActionRequestSchema.parse(validNoAction);
      expect(result.type).toBe('no-action');
      expect(result.reason).toBe('graph-complete');
    });

    it('parses without optional fields', () => {
      const minimal = { type: 'no-action', graphSlug: 'my-pipeline' };
      const result = NoActionRequestSchema.parse(minimal);
      expect(result.reason).toBeUndefined();
      expect(result.lineId).toBeUndefined();
    });

    it('parses with lineId for transition-blocked', () => {
      const withLineId = {
        type: 'no-action',
        graphSlug: 'my-pipeline',
        reason: 'transition-blocked' as const,
        lineId: 'line-002',
      };
      const result = NoActionRequestSchema.parse(withLineId);
      expect(result.lineId).toBe('line-002');
    });

    it('rejects extra properties (strict mode)', () => {
      expect(() => NoActionRequestSchema.parse({ ...validNoAction, extra: 'field' })).toThrow();
    });
  });

  describe('OrchestrationRequestSchema (discriminated union)', () => {
    it('parses all 4 variant types', () => {
      for (const request of allRequests) {
        const result = OrchestrationRequestSchema.parse(request);
        expect(result.type).toBe(request.type);
      }
    });

    it('rejects unknown type value', () => {
      expect(() =>
        OrchestrationRequestSchema.parse({
          type: 'unknown-type',
          graphSlug: 'my-pipeline',
        })
      ).toThrow();
    });

    it('rejects object without type field', () => {
      expect(() => OrchestrationRequestSchema.parse({ graphSlug: 'my-pipeline' })).toThrow();
    });
  });
});

// ============================================
// Type Guard Tests
// ============================================

describe('OrchestrationRequest Type Guards', () => {
  describe('isStartNodeRequest', () => {
    it('returns true for start-node', () => {
      expect(isStartNodeRequest(validStartNode)).toBe(true);
    });

    it('returns false for other types', () => {
      expect(isStartNodeRequest(validResumeNode)).toBe(false);
      expect(isStartNodeRequest(validQuestionPending)).toBe(false);
      expect(isStartNodeRequest(validNoAction)).toBe(false);
    });
  });

  describe('isResumeNodeRequest', () => {
    it('returns true for resume-node', () => {
      expect(isResumeNodeRequest(validResumeNode)).toBe(true);
    });

    it('returns false for other types', () => {
      expect(isResumeNodeRequest(validStartNode)).toBe(false);
      expect(isResumeNodeRequest(validQuestionPending)).toBe(false);
      expect(isResumeNodeRequest(validNoAction)).toBe(false);
    });
  });

  describe('isQuestionPendingRequest', () => {
    it('returns true for question-pending', () => {
      expect(isQuestionPendingRequest(validQuestionPending)).toBe(true);
    });

    it('returns false for other types', () => {
      expect(isQuestionPendingRequest(validStartNode)).toBe(false);
      expect(isQuestionPendingRequest(validResumeNode)).toBe(false);
      expect(isQuestionPendingRequest(validNoAction)).toBe(false);
    });
  });

  describe('isNoActionRequest', () => {
    it('returns true for no-action', () => {
      expect(isNoActionRequest(validNoAction)).toBe(true);
    });

    it('returns false for other types', () => {
      expect(isNoActionRequest(validStartNode)).toBe(false);
      expect(isNoActionRequest(validResumeNode)).toBe(false);
      expect(isNoActionRequest(validQuestionPending)).toBe(false);
    });
  });

  describe('isNodeLevelRequest', () => {
    it('returns true for all 3 node-level types', () => {
      expect(isNodeLevelRequest(validStartNode)).toBe(true);
      expect(isNodeLevelRequest(validResumeNode)).toBe(true);
      expect(isNodeLevelRequest(validQuestionPending)).toBe(true);
    });

    it('returns false for no-action (graph-level)', () => {
      expect(isNodeLevelRequest(validNoAction)).toBe(false);
    });
  });

  describe('getNodeId', () => {
    it('extracts nodeId from node-level requests', () => {
      expect(getNodeId(validStartNode)).toBe('node-001');
      expect(getNodeId(validResumeNode)).toBe('node-002');
      expect(getNodeId(validQuestionPending)).toBe('node-003');
    });

    it('returns undefined for no-action (DYK-I7: prefer request.nodeId after narrowing)', () => {
      expect(getNodeId(validNoAction)).toBeUndefined();
    });
  });
});

// ============================================
// Exhaustive Switch Test
// ============================================

describe('Exhaustive type checking', () => {
  it('switch covers all 4 types with never in default', () => {
    function handleRequest(request: OrchestrationRequest): string {
      switch (request.type) {
        case 'start-node':
          return 'start';
        case 'resume-node':
          return 'resume';
        case 'question-pending':
          return 'question';
        case 'no-action':
          return 'none';
        default: {
          const _exhaustive: never = request;
          throw new Error(`Unhandled type: ${JSON.stringify(_exhaustive)}`);
        }
      }
    }

    expect(handleRequest(validStartNode)).toBe('start');
    expect(handleRequest(validResumeNode)).toBe('resume');
    expect(handleRequest(validQuestionPending)).toBe('question');
    expect(handleRequest(validNoAction)).toBe('none');
  });
});

// ============================================
// NoActionReason Tests (T005)
// ============================================

describe('NoActionReason', () => {
  const validReasons = [
    'graph-complete',
    'transition-blocked',
    'all-waiting',
    'graph-failed',
  ] as const;

  for (const reason of validReasons) {
    it(`parses valid reason: ${reason}`, () => {
      const result = NoActionReasonSchema.parse(reason);
      expect(result).toBe(reason);
    });
  }

  it('rejects invalid reason value', () => {
    expect(() => NoActionReasonSchema.parse('all-running')).toThrow();
    expect(() => NoActionReasonSchema.parse('empty-graph')).toThrow();
    expect(() => NoActionReasonSchema.parse('unknown')).toThrow();
  });

  it('validates NoActionRequest with each reason', () => {
    for (const reason of validReasons) {
      const request = {
        type: 'no-action' as const,
        graphSlug: 'my-pipeline',
        reason,
      };
      const result = NoActionRequestSchema.parse(request);
      expect(result.reason).toBe(reason);
    }
  });
});
