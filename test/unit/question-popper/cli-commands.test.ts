/**
 * Plan 067: Question Popper — Phase 4 CLI Command Tests
 *
 * Tests handler functions directly with FakeEventPopperClient (Constitution P4).
 * No vi.mock. Captures stdout via console.log spy.
 *
 * Test Doc:
 *   Scope: CLI handler functions + HTTP client helpers
 *   Pattern: Direct handler invocation with FakeEventPopperClient
 *   Dependencies: FakeEventPopperClient, EventPopperClientError
 *   Run: pnpm vitest run test/unit/question-popper/cli-commands.test.ts
 *   Coverage: ≥13 tests — handlers, error mapping, poll loop, coercion
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AlertOut, QuestionOut } from '@chainglass/shared/question-popper';
import { handleAlertSend } from '../../../apps/cli/src/commands/alert.command';
import {
  EventPopperClientError,
  FakeEventPopperClient,
} from '../../../apps/cli/src/commands/event-popper-client';
import {
  handleQuestionAnswer,
  handleQuestionAsk,
  handleQuestionGet,
  handleQuestionList,
} from '../../../apps/cli/src/commands/question.command';

// ── Test Helpers ──

function makeQuestionOut(overrides: Partial<QuestionOut> = {}): QuestionOut {
  return {
    questionId: 'q-001',
    status: 'pending',
    question: {
      questionType: 'confirm',
      text: 'Deploy?',
      description: null,
      options: null,
      default: null,
      timeout: 600,
      previousQuestionId: null,
    },
    source: 'test',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeAlertOut(overrides: Partial<AlertOut> = {}): AlertOut {
  return {
    alertId: 'a-001',
    status: 'unread',
    alert: { text: 'Build done', description: null },
    source: 'test',
    createdAt: new Date().toISOString(),
    acknowledgedAt: null,
    acknowledgedBy: null,
    ...overrides,
  };
}

// ── Tests ──

describe('Phase 4: CLI Command Handlers', () => {
  let client: FakeEventPopperClient;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new FakeEventPopperClient();
    client.reset();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = undefined;
  });

  // ── ask-question ──

  describe('handleQuestionAsk', () => {
    it('--timeout 0 returns immediately with questionId (AC-07)', async () => {
      client.setAskResult({ questionId: 'q-123' });

      await handleQuestionAsk(client, {
        type: 'confirm',
        text: 'Deploy?',
        timeout: '0',
        source: 'test',
      });

      const output = JSON.parse(logSpy.mock.calls[0][0]);
      expect(output).toEqual({ questionId: 'q-123', status: 'pending' });
    });

    it('polls and returns answer when question is resolved', async () => {
      client.setAskResult({ questionId: 'q-poll' });
      const answered = makeQuestionOut({
        questionId: 'q-poll',
        status: 'answered',
        answer: { answer: true, text: 'Ship it' },
      });
      client.setQuestionResponse('q-poll', answered);

      await handleQuestionAsk(client, {
        type: 'confirm',
        text: 'Deploy?',
        timeout: '10',
        source: 'test',
      });

      const output = JSON.parse(logSpy.mock.calls[0][0]);
      expect(output.status).toBe('answered');
      expect(output.answer.answer).toBe(true);
    });

    it('returns pending on timeout (AC-06)', async () => {
      client.setAskResult({ questionId: 'q-timeout' });
      // Question stays pending (no response set → 404 from fake)
      // Set a pending response so it doesn't throw 404
      client.setQuestionResponse(
        'q-timeout',
        makeQuestionOut({ questionId: 'q-timeout', status: 'pending' })
      );

      await handleQuestionAsk(client, {
        type: 'text',
        text: 'Hello?',
        timeout: '1', // 1 second timeout
        source: 'test',
      });

      const output = JSON.parse(logSpy.mock.calls[0][0]);
      expect(output.questionId).toBe('q-timeout');
      expect(output.status).toBe('pending');
    });

    it('includes tmux meta in request body', async () => {
      client.setAskResult({ questionId: 'q-tmux' });

      await handleQuestionAsk(client, {
        type: 'text',
        text: 'Test',
        timeout: '0',
        source: 'test',
      });

      const askCall = client.calls.find((c) => c.method === 'askQuestion');
      expect(askCall).toBeDefined();
      const body = askCall?.args[0] as Record<string, unknown>;
      expect(body.meta).toBeDefined();
      // meta should exist (even if tmux is undefined, spread produces {})
      expect(typeof body.meta).toBe('object');
    });

    it('rejects invalid timeout', async () => {
      await handleQuestionAsk(client, {
        type: 'text',
        text: 'Test',
        timeout: 'abc',
        source: 'test',
      });

      expect(process.exitCode).toBe(1);
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  // ── get-question ──

  describe('handleQuestionGet', () => {
    it('prints QuestionOut when found (AC-08)', async () => {
      const q = makeQuestionOut({
        questionId: 'q-found',
        status: 'answered',
        answer: { answer: 'yes', text: null },
      });
      client.setQuestionResponse('q-found', q);

      await handleQuestionGet(client, 'q-found');

      const output = JSON.parse(logSpy.mock.calls[0][0]);
      expect(output.questionId).toBe('q-found');
      expect(output.status).toBe('answered');
    });

    it('exits 1 when not found', async () => {
      await handleQuestionGet(client, 'nonexistent');

      expect(process.exitCode).toBe(1);
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  // ── answer-question ──

  describe('handleQuestionAnswer', () => {
    it('submits answer and prints updated QuestionOut (AC-10)', async () => {
      const q = makeQuestionOut({ questionId: 'q-ans', status: 'pending' });
      client.setQuestionResponse('q-ans', q);
      client.setAnswerResult(
        makeQuestionOut({
          questionId: 'q-ans',
          status: 'answered',
          answer: { answer: true, text: null },
        })
      );

      await handleQuestionAnswer(client, 'q-ans', {
        answer: 'true',
      });

      const output = JSON.parse(logSpy.mock.calls[0][0]);
      expect(output.status).toBe('answered');
    });

    it('coerces "true" to boolean for confirm questions (DYK-04)', async () => {
      const q = makeQuestionOut({
        questionId: 'q-coerce',
        status: 'pending',
        question: {
          questionType: 'confirm',
          text: 'Go?',
          description: null,
          options: null,
          default: null,
          timeout: 600,
          previousQuestionId: null,
        },
      });
      client.setQuestionResponse('q-coerce', q);
      client.setAnswerResult(makeQuestionOut({ questionId: 'q-coerce', status: 'answered' }));

      await handleQuestionAnswer(client, 'q-coerce', { answer: 'true' });

      const answerCall = client.calls.find((c) => c.method === 'answerQuestion');
      expect(answerCall).toBeDefined();
      const body = answerCall?.args[1] as { answer: unknown };
      expect(body.answer).toBe(true); // boolean, not string
    });

    it('coerces comma-separated to array for multi questions (DYK-04)', async () => {
      const q = makeQuestionOut({
        questionId: 'q-multi',
        status: 'pending',
        question: {
          questionType: 'multi',
          text: 'Pick',
          description: null,
          options: ['a', 'b', 'c'],
          default: null,
          timeout: 600,
          previousQuestionId: null,
        },
      });
      client.setQuestionResponse('q-multi', q);
      client.setAnswerResult(makeQuestionOut({ questionId: 'q-multi', status: 'answered' }));

      await handleQuestionAnswer(client, 'q-multi', { answer: 'a, b' });

      const answerCall = client.calls.find((c) => c.method === 'answerQuestion');
      const body = answerCall?.args[1] as { answer: unknown };
      expect(body.answer).toEqual(['a', 'b']); // array, not string
    });

    it('exits 1 on 409 conflict', async () => {
      const q = makeQuestionOut({ questionId: 'q-conflict', status: 'pending' });
      client.setQuestionResponse('q-conflict', q);
      // Override answer to throw conflict
      client.setAnswerResult(null as unknown as QuestionOut);
      // We need to make answerQuestion throw - override with error
      const origAnswer = client.answerQuestion.bind(client);
      client.answerQuestion = async () => {
        throw new EventPopperClientError('Question already resolved', 409);
      };

      await handleQuestionAnswer(client, 'q-conflict', { answer: 'yes' });

      expect(process.exitCode).toBe(1);
      client.answerQuestion = origAnswer;
    });
  });

  // ── list ──

  describe('handleQuestionList', () => {
    it('prints empty message when no items', async () => {
      await handleQuestionList(client, { limit: '20' });

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No questions or alerts'));
    });

    it('prints items in table format (AC-09)', async () => {
      client.setListResult({
        items: [
          makeQuestionOut({ questionId: 'q1', source: 'agent-1' }),
          makeAlertOut({ alertId: 'a1', source: 'ci' }),
        ],
        total: 2,
      });

      await handleQuestionList(client, { limit: '20' });

      // Should have header + separator + 2 data rows
      expect(logSpy.mock.calls.length).toBeGreaterThanOrEqual(4);
    });

    it('--json outputs raw JSON (AC-12)', async () => {
      const listResult = {
        items: [makeQuestionOut()],
        total: 1,
      };
      client.setListResult(listResult);

      await handleQuestionList(client, { limit: '20', json: true });

      const output = JSON.parse(logSpy.mock.calls[0][0]);
      expect(output.items).toHaveLength(1);
      expect(output.total).toBe(1);
    });
  });

  // ── send-alert ──

  describe('handleAlertSend', () => {
    it('sends alert and prints alertId (AC-11)', async () => {
      client.setAlertResult({ alertId: 'a-789' });

      await handleAlertSend(client, {
        text: 'Build complete',
        source: 'ci',
      });

      const output = JSON.parse(logSpy.mock.calls[0][0]);
      expect(output.alertId).toBe('a-789');
    });

    it('includes tmux meta in request body', async () => {
      await handleAlertSend(client, {
        text: 'Test',
        source: 'test',
      });

      const sendCall = client.calls.find((c) => c.method === 'sendAlert');
      const body = sendCall?.args[0] as Record<string, unknown>;
      expect(body.meta).toBeDefined();
    });
  });

  // ── HTTP Client Helpers ──

  describe('EventPopperClientError', () => {
    it('identifies transient errors (status 0)', () => {
      const err = new EventPopperClientError('Connection refused', 0);
      expect(err.isTransient).toBe(true);
      expect(err.isNotFound).toBe(false);
    });

    it('identifies 404 as not found', () => {
      const err = new EventPopperClientError('Not found', 404);
      expect(err.isNotFound).toBe(true);
      expect(err.isTransient).toBe(false);
    });

    it('identifies 409 as conflict', () => {
      const err = new EventPopperClientError('Conflict', 409);
      expect(err.isConflict).toBe(true);
    });
  });

  describe('FakeEventPopperClient', () => {
    it('tracks method calls for inspection', async () => {
      await client.askQuestion({
        source: 'test',
        questionType: 'text',
        text: 'Hello',
      });
      await client.sendAlert({ source: 'test', text: 'Alert' });

      expect(client.calls).toHaveLength(2);
      expect(client.calls[0].method).toBe('askQuestion');
      expect(client.calls[1].method).toBe('sendAlert');
    });

    it('reset clears all state', async () => {
      await client.askQuestion({
        source: 'test',
        questionType: 'text',
        text: 'Hi',
      });
      client.reset();

      expect(client.calls).toHaveLength(0);
    });
  });
});
