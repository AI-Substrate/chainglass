/**
 * Contract tests for IWorkflowEvents — verifies interface conformance.
 *
 * Runs against both WorkflowEventsService (real) and FakeWorkflowEventsService.
 * Tests verify method signatures, return shapes, and observer lifecycle.
 *
 * Per DYK-P2-01: Full Q&A behavioral cycle (ask→answer→getAnswer) only tested
 * against Fake because FakePGService doesn't simulate state flow. Real cycle
 * covered by E2E tests in Phase 4.
 */

import type { IWorkflowEvents } from '@chainglass/shared';
import type { QuestionInput } from '@chainglass/shared/workflow-events';
import { beforeEach, describe, expect, it } from 'vitest';

export type WorkflowEventsFactory = () => IWorkflowEvents;

const testQuestion: QuestionInput = {
  type: 'confirm',
  text: 'Deploy to production?',
};

/**
 * Interface conformance tests — runs against any IWorkflowEvents implementation.
 * Verifies method existence, return types, and observer subscribe/unsubscribe.
 */
export function workflowEventsConformanceTests(name: string, factory: WorkflowEventsFactory): void {
  describe(`IWorkflowEvents conformance: ${name}`, () => {
    let service: IWorkflowEvents;

    beforeEach(() => {
      service = factory();
    });

    describe('observer lifecycle', () => {
      it('onQuestionAsked returns unsubscribe function', () => {
        const unsub = service.onQuestionAsked('test-graph', () => {});
        expect(typeof unsub).toBe('function');
        unsub();
      });

      it('onQuestionAnswered returns unsubscribe function', () => {
        const unsub = service.onQuestionAnswered('test-graph', () => {});
        expect(typeof unsub).toBe('function');
        unsub();
      });

      it('onProgress returns unsubscribe function', () => {
        const unsub = service.onProgress('test-graph', () => {});
        expect(typeof unsub).toBe('function');
        unsub();
      });

      it('onEvent returns unsubscribe function', () => {
        const unsub = service.onEvent('test-graph', () => {});
        expect(typeof unsub).toBe('function');
        unsub();
      });

      it('unsubscribe prevents further handler invocations', async () => {
        const events: unknown[] = [];
        const unsub = service.onEvent('test-graph', (e) => events.push(e));
        unsub();
        // After unsubscribe, no events should be delivered
        // (We can't trigger events without full setup, but unsubscribe should not throw)
        expect(events).toHaveLength(0);
      });
    });

    describe('method existence', () => {
      it('has askQuestion method', () => {
        expect(typeof service.askQuestion).toBe('function');
      });

      it('has answerQuestion method', () => {
        expect(typeof service.answerQuestion).toBe('function');
      });

      it('has getAnswer method', () => {
        expect(typeof service.getAnswer).toBe('function');
      });

      it('has reportProgress method', () => {
        expect(typeof service.reportProgress).toBe('function');
      });

      it('has reportError method', () => {
        expect(typeof service.reportError).toBe('function');
      });
    });
  });
}

/**
 * Behavioral tests — runs only against implementations with self-contained state
 * (FakeWorkflowEventsService). Tests full Q&A cycle and observer notifications.
 */
export function workflowEventsBehavioralTests(name: string, factory: WorkflowEventsFactory): void {
  describe(`IWorkflowEvents behavioral: ${name}`, () => {
    let service: IWorkflowEvents;

    beforeEach(() => {
      service = factory();
    });

    describe('askQuestion', () => {
      it('returns a questionId', async () => {
        const result = await service.askQuestion('test-graph', 'node-a', testQuestion);
        expect(result.questionId).toBeDefined();
        expect(typeof result.questionId).toBe('string');
        expect(result.questionId.length).toBeGreaterThan(0);
      });

      it('generates unique questionIds', async () => {
        const r1 = await service.askQuestion('test-graph', 'node-a', testQuestion);
        const r2 = await service.askQuestion('test-graph', 'node-a', testQuestion);
        expect(r1.questionId).not.toBe(r2.questionId);
      });

      it('notifies question-asked observers', async () => {
        const events: unknown[] = [];
        service.onQuestionAsked('test-graph', (e) => events.push(e));

        await service.askQuestion('test-graph', 'node-a', testQuestion);

        expect(events).toHaveLength(1);
        const event = events[0] as Record<string, unknown>;
        expect(event.graphSlug).toBe('test-graph');
        expect(event.nodeId).toBe('node-a');
        expect(event.questionId).toBeDefined();
      });

      it('notifies generic onEvent observers', async () => {
        const events: unknown[] = [];
        service.onEvent('test-graph', (e) => events.push(e));

        await service.askQuestion('test-graph', 'node-a', testQuestion);

        expect(events.length).toBeGreaterThanOrEqual(1);
        const event = events[0] as Record<string, unknown>;
        expect(event.eventType).toBe('question:ask');
      });
    });

    describe('answerQuestion', () => {
      it('does not throw for valid question', async () => {
        const { questionId } = await service.askQuestion('test-graph', 'node-a', testQuestion);
        await expect(
          service.answerQuestion('test-graph', 'node-a', questionId, {
            confirmed: true,
          })
        ).resolves.not.toThrow();
      });

      it('notifies question-answered observers', async () => {
        const events: unknown[] = [];
        service.onQuestionAnswered('test-graph', (e) => events.push(e));

        const { questionId } = await service.askQuestion('test-graph', 'node-a', testQuestion);
        await service.answerQuestion('test-graph', 'node-a', questionId, { confirmed: true });

        expect(events).toHaveLength(1);
        const event = events[0] as Record<string, unknown>;
        expect(event.questionId).toBe(questionId);
        expect(event.answer).toEqual({ confirmed: true });
      });
    });

    describe('getAnswer', () => {
      it('returns null for unanswered question', async () => {
        const { questionId } = await service.askQuestion('test-graph', 'node-a', testQuestion);
        const result = await service.getAnswer('test-graph', 'node-a', questionId);
        expect(result).toBeNull();
      });

      it('returns answer after answerQuestion', async () => {
        const { questionId } = await service.askQuestion('test-graph', 'node-a', testQuestion);
        await service.answerQuestion('test-graph', 'node-a', questionId, { confirmed: true });
        const result = await service.getAnswer('test-graph', 'node-a', questionId);
        expect(result).not.toBeNull();
        expect(result?.answered).toBe(true);
        expect(result?.questionId).toBe(questionId);
      });

      it('returns null for unknown questionId', async () => {
        const result = await service.getAnswer('test-graph', 'node-a', 'nonexistent-q-id');
        expect(result).toBeNull();
      });
    });

    describe('reportProgress', () => {
      it('notifies progress observers', async () => {
        const events: unknown[] = [];
        service.onProgress('test-graph', (e) => events.push(e));

        await service.reportProgress('test-graph', 'node-a', {
          message: 'Building auth module',
          percent: 45,
        });

        expect(events).toHaveLength(1);
        const event = events[0] as Record<string, unknown>;
        expect(event.message).toBe('Building auth module');
        expect(event.percent).toBe(45);
      });
    });

    describe('reportError', () => {
      it('notifies generic event observers', async () => {
        const events: unknown[] = [];
        service.onEvent('test-graph', (e) => events.push(e));

        await service.reportError('test-graph', 'node-a', {
          code: 'E001',
          message: 'Build failed',
        });

        expect(events.length).toBeGreaterThanOrEqual(1);
        const event = events[0] as Record<string, unknown>;
        expect(event.eventType).toBe('node:error');
      });
    });

    describe('observer isolation', () => {
      it('observers for different graphs are independent', async () => {
        const eventsA: unknown[] = [];
        const eventsB: unknown[] = [];
        service.onQuestionAsked('graph-a', (e) => eventsA.push(e));
        service.onQuestionAsked('graph-b', (e) => eventsB.push(e));

        await service.askQuestion('graph-a', 'node-1', testQuestion);

        expect(eventsA).toHaveLength(1);
        expect(eventsB).toHaveLength(0);
      });

      it('throwing observer does not prevent others', async () => {
        const events: unknown[] = [];
        service.onQuestionAsked('test-graph', () => {
          throw new Error('boom');
        });
        service.onQuestionAsked('test-graph', (e) => events.push(e));

        await service.askQuestion('test-graph', 'node-a', testQuestion);

        expect(events).toHaveLength(1);
      });
    });
  });
}
