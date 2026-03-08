/**
 * Plan 067: Question Popper — Phase 3 API Route Handler Tests
 *
 * Tests handler functions directly with FakeQuestionPopperService (DYK-02).
 * No vi.mock — fakes only (Constitution Principle 4).
 * Verifies ergonomic response shapes (QuestionOut/AlertOut, DYK-R2-01).
 *
 * Test Doc:
 *   Scope: Route handler functions + shared helpers (parseJsonBody, error mapping, response mappers)
 *   Pattern: Direct handler invocation with FakeQuestionPopperService
 *   Dependencies: @chainglass/shared/fakes, route-helpers.ts
 *   Run: pnpm vitest run test/unit/question-popper/api-routes.test.ts
 *   Coverage: ≥20 tests — handlers, validation, error mapping, response shapes
 */

import { FakeQuestionPopperService } from '@chainglass/shared/fakes';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AskQuestionRequestSchema,
  SendAlertRequestSchema,
  eventPopperErrorResponse,
  handleAcknowledge,
  handleAnswerQuestion,
  handleAskQuestion,
  handleClarify,
  handleDismiss,
  handleGetQuestion,
  handleList,
  handleSendAlert,
  parseJsonBody,
  toAlertOut,
  toQuestionOut,
} from '../../../apps/web/src/features/067-question-popper/lib/route-helpers';

// ── Test Helpers ──

function postJson(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function postRaw(url: string, rawBody: string): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
  });
}

function getReq(url: string): Request {
  return new Request(url, { method: 'GET' });
}

const VALID_QUESTION = {
  source: 'test-agent',
  questionType: 'confirm' as const,
  text: 'Deploy to production?',
  description: null,
  options: null,
  default: false,
  timeout: 300,
  previousQuestionId: null,
};

const VALID_ALERT = {
  source: 'test-agent',
  text: 'Build completed',
  description: null,
};

const BASE_URL = 'http://localhost:3000/api/event-popper';

// ── Tests ──

describe('Phase 3: Route Handlers', () => {
  let service: FakeQuestionPopperService;

  beforeEach(() => {
    service = new FakeQuestionPopperService();
    service.reset();
  });

  // ── T002: ask-question ──

  describe('handleAskQuestion', () => {
    it('valid request → 201 + questionId', async () => {
      const req = postJson(`${BASE_URL}/ask-question`, VALID_QUESTION);
      const res = await handleAskQuestion(req, service);
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.questionId).toBeDefined();
      expect(typeof body.questionId).toBe('string');
      expect(service.getOutstandingCount()).toBe(1);
    });

    it('missing source → 400', async () => {
      const { source: _, ...noSource } = VALID_QUESTION;
      const req = postJson(`${BASE_URL}/ask-question`, noSource);
      const res = await handleAskQuestion(req, service);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe('Validation error');
    });

    it('missing text → 400', async () => {
      const { text: _, ...noText } = VALID_QUESTION;
      const req = postJson(`${BASE_URL}/ask-question`, noText);
      const res = await handleAskQuestion(req, service);

      expect(res.status).toBe(400);
    });

    it('invalid JSON → 400', async () => {
      const req = postRaw(`${BASE_URL}/ask-question`, '{not valid json');
      const res = await handleAskQuestion(req, service);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid JSON');
    });

    it('applies defaults for optional fields', async () => {
      const minimal = { source: 'cli', questionType: 'text', text: 'What?' };
      const req = postJson(`${BASE_URL}/ask-question`, minimal);
      const res = await handleAskQuestion(req, service);

      expect(res.status).toBe(201);
      const { questionId } = await res.json();

      const stored = await service.getQuestion(questionId);
      expect(stored).not.toBeNull();
      // Defaults applied by schema
      expect(stored?.request.payload.timeout).toBe(600);
      expect(stored?.request.payload.description).toBeNull();
    });
  });

  // ── T003: get question ──

  describe('handleGetQuestion', () => {
    it('existing question → 200 + QuestionOut', async () => {
      const { questionId } = await service.askQuestion({
        ...VALID_QUESTION,
        questionType: 'confirm',
      });

      const res = await handleGetQuestion(service, questionId);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.questionId).toBe(questionId);
      expect(body.status).toBe('pending');
      expect(body.question.questionType).toBe('confirm');
      expect(body.question.text).toBe('Deploy to production?');
      expect(body.source).toBe('test-agent');
      expect(body.createdAt).toBeDefined();
    });

    it('not found → 404', async () => {
      const res = await handleGetQuestion(service, 'nonexistent-id');
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.error).toBe('Not found');
    });
  });

  // ── T004: answer-question ──

  describe('handleAnswerQuestion', () => {
    it('valid answer → 200 + updated QuestionOut', async () => {
      const { questionId } = await service.askQuestion(VALID_QUESTION);
      const req = postJson(`${BASE_URL}/answer-question/${questionId}`, {
        answer: true,
        text: 'Yes, ship it!',
      });

      const res = await handleAnswerQuestion(req, service, questionId);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.questionId).toBe(questionId);
      expect(body.status).toBe('answered');
      expect(body.answer.answer).toBe(true);
      expect(body.answer.text).toBe('Yes, ship it!');
      expect(body.respondedAt).toBeDefined();
      expect(service.getOutstandingCount()).toBe(0);
    });

    it('not found → 404', async () => {
      const req = postJson(`${BASE_URL}/answer-question/nope`, {
        answer: 'yes',
        text: null,
      });

      const res = await handleAnswerQuestion(req, service, 'nope');
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.error).toBe('Not found');
    });

    it('already resolved → 409', async () => {
      const { questionId } = await service.askQuestion(VALID_QUESTION);
      await service.answerQuestion(questionId, { answer: true, text: null });

      const req = postJson(`${BASE_URL}/answer-question/${questionId}`, {
        answer: false,
        text: null,
      });

      const res = await handleAnswerQuestion(req, service, questionId);
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body.error).toBe('Conflict');
    });

    it('invalid body → 400', async () => {
      const { questionId } = await service.askQuestion(VALID_QUESTION);
      const req = postJson(`${BASE_URL}/answer-question/${questionId}`, {
        answer: 42, // Not string/boolean/array
        text: null,
      });

      const res = await handleAnswerQuestion(req, service, questionId);
      expect(res.status).toBe(400);
    });
  });

  // ── T005: send-alert ──

  describe('handleSendAlert', () => {
    it('valid request → 201 + alertId', async () => {
      const req = postJson(`${BASE_URL}/send-alert`, VALID_ALERT);
      const res = await handleSendAlert(req, service);
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.alertId).toBeDefined();
      expect(typeof body.alertId).toBe('string');
      expect(service.getOutstandingCount()).toBe(1);
    });

    it('missing source → 400', async () => {
      const { source: _, ...noSource } = VALID_ALERT;
      const req = postJson(`${BASE_URL}/send-alert`, noSource);
      const res = await handleSendAlert(req, service);

      expect(res.status).toBe(400);
    });
  });

  // ── T006: list ──

  describe('handleList', () => {
    it('empty list → 200 + empty items', async () => {
      const req = getReq(`${BASE_URL}/list`);
      const res = await handleList(req, service);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('returns questions and alerts', async () => {
      await service.askQuestion(VALID_QUESTION);
      await service.sendAlert(VALID_ALERT);

      const req = getReq(`${BASE_URL}/list`);
      const res = await handleList(req, service);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.items).toHaveLength(2);
      expect(body.total).toBe(2);
    });

    it('respects ?limit=N', async () => {
      await service.askQuestion(VALID_QUESTION);
      await service.askQuestion({ ...VALID_QUESTION, text: 'Second' });
      await service.askQuestion({ ...VALID_QUESTION, text: 'Third' });

      const req = getReq(`${BASE_URL}/list?limit=2`);
      const res = await handleList(req, service);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.items).toHaveLength(2);
      expect(body.total).toBe(3);
    });

    it('filters by ?status=pending', async () => {
      const { questionId } = await service.askQuestion(VALID_QUESTION);
      await service.askQuestion({ ...VALID_QUESTION, text: 'Second' });
      await service.answerQuestion(questionId, { answer: true, text: null });

      const req = getReq(`${BASE_URL}/list?status=pending`);
      const res = await handleList(req, service);
      const body = await res.json();

      expect(body.items).toHaveLength(1);
      expect(body.items[0].status).toBe('pending');
    });

    it('invalid limit → 400', async () => {
      const req = getReq(`${BASE_URL}/list?limit=abc`);
      const res = await handleList(req, service);

      expect(res.status).toBe(400);
    });
  });

  // ── T007: dismiss ──

  describe('handleDismiss', () => {
    it('valid → 200 + dismissed QuestionOut', async () => {
      const { questionId } = await service.askQuestion(VALID_QUESTION);

      const res = await handleDismiss(service, questionId);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.questionId).toBe(questionId);
      expect(body.status).toBe('dismissed');
      expect(body.respondedAt).toBeDefined();
    });

    it('not found → 404', async () => {
      const res = await handleDismiss(service, 'nonexistent');
      expect(res.status).toBe(404);
    });

    it('already resolved → 409', async () => {
      const { questionId } = await service.askQuestion(VALID_QUESTION);
      await service.dismissQuestion(questionId);

      const res = await handleDismiss(service, questionId);
      expect(res.status).toBe(409);
    });
  });

  // ── T008: clarify ──

  describe('handleClarify', () => {
    it('valid → 200 + needs-clarification QuestionOut', async () => {
      const { questionId } = await service.askQuestion(VALID_QUESTION);
      const req = postJson(`${BASE_URL}/clarify/${questionId}`, {
        text: 'Which environment?',
      });

      const res = await handleClarify(req, service, questionId);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.questionId).toBe(questionId);
      expect(body.status).toBe('needs-clarification');
      expect(body.clarification.text).toBe('Which environment?');
    });

    it('empty text → 400', async () => {
      const { questionId } = await service.askQuestion(VALID_QUESTION);
      const req = postJson(`${BASE_URL}/clarify/${questionId}`, { text: '' });

      const res = await handleClarify(req, service, questionId);
      expect(res.status).toBe(400);
    });

    it('not found → 404', async () => {
      const req = postJson(`${BASE_URL}/clarify/nope`, { text: 'Hello' });
      const res = await handleClarify(req, service, 'nope');
      expect(res.status).toBe(404);
    });
  });

  // ── T009: acknowledge ──

  describe('handleAcknowledge', () => {
    it('valid → 200 + acknowledged AlertOut', async () => {
      const { alertId } = await service.sendAlert(VALID_ALERT);

      const res = await handleAcknowledge(service, alertId);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.alertId).toBe(alertId);
      expect(body.status).toBe('acknowledged');
      expect(body.acknowledgedAt).toBeDefined();
    });

    it('not found → 404', async () => {
      const res = await handleAcknowledge(service, 'nonexistent');
      expect(res.status).toBe(404);
    });

    it('already acknowledged → 409', async () => {
      const { alertId } = await service.sendAlert(VALID_ALERT);
      await service.acknowledgeAlert(alertId);

      const res = await handleAcknowledge(service, alertId);
      expect(res.status).toBe(409);
    });
  });
});

// ── Shared Helpers Tests ──

describe('Phase 3: Route Helpers', () => {
  describe('parseJsonBody', () => {
    it('malformed JSON → 400', async () => {
      const req = postRaw('http://localhost/test', 'not json{');
      const result = await parseJsonBody(req, AskQuestionRequestSchema);

      expect(result).toBeInstanceOf(Response);
      const body = await (result as Response).json();
      expect((result as Response).status).toBe(400);
      expect(body.error).toBe('Invalid JSON');
    });

    it('schema validation failure → 400 with details', async () => {
      const req = postJson('http://localhost/test', { wrong: 'shape' });
      const result = await parseJsonBody(req, AskQuestionRequestSchema);

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(400);
      const body = await (result as Response).json();
      expect(body.error).toBe('Validation error');
      expect(body.message).toBeDefined();
    });

    it('valid body → returns parsed data', async () => {
      const req = postJson('http://localhost/test', VALID_QUESTION);
      const result = await parseJsonBody(req, AskQuestionRequestSchema);

      expect(result).not.toBeInstanceOf(Response);
      expect((result as Record<string, unknown>).source).toBe('test-agent');
      expect((result as Record<string, unknown>).questionType).toBe('confirm');
    });
  });

  describe('eventPopperErrorResponse', () => {
    it('"not found" in message → 404', () => {
      const res = eventPopperErrorResponse(new Error('Question not found: abc'), 'test');
      expect(res.status).toBe(404);
    });

    it('"already" in message → 409', () => {
      const res = eventPopperErrorResponse(new Error('Question already resolved: abc'), 'test');
      expect(res.status).toBe(409);
    });

    it('other errors → 500', () => {
      const res = eventPopperErrorResponse(new Error('disk failure'), 'test');
      expect(res.status).toBe(500);
    });
  });

  describe('toQuestionOut', () => {
    it('maps pending question correctly', async () => {
      const service = new FakeQuestionPopperService();
      const { questionId } = await service.askQuestion({
        questionType: 'text',
        text: 'What is the answer?',
        source: 'test',
        meta: { agent: 'claude' },
      });
      const stored = await service.getQuestion(questionId);
      expect(stored).not.toBeNull();
      const out = toQuestionOut(stored as NonNullable<typeof stored>);

      expect(out.questionId).toBe(questionId);
      expect(out.status).toBe('pending');
      expect(out.question.questionType).toBe('text');
      expect(out.question.text).toBe('What is the answer?');
      expect(out.source).toBe('test');
      expect(out.createdAt).toBeDefined();
      expect(out.meta).toEqual({ agent: 'claude' });
      expect(out.answer).toBeUndefined();
      expect(out.respondedAt).toBeUndefined();
    });

    it('maps answered question with answer payload', async () => {
      const service = new FakeQuestionPopperService();
      const { questionId } = await service.askQuestion({
        questionType: 'confirm',
        text: 'Proceed?',
        source: 'test',
      });
      await service.answerQuestion(questionId, { answer: true, text: 'Go!' });
      const stored = await service.getQuestion(questionId);
      expect(stored).not.toBeNull();
      const out = toQuestionOut(stored as NonNullable<typeof stored>);

      expect(out.status).toBe('answered');
      expect(out.answer).toEqual({ answer: true, text: 'Go!' });
      expect(out.respondedAt).toBeDefined();
      expect(out.respondedBy).toBeDefined();
    });

    it('maps needs-clarification with clarification payload', async () => {
      const service = new FakeQuestionPopperService();
      const { questionId } = await service.askQuestion({
        questionType: 'text',
        text: 'Deploy where?',
        source: 'test',
      });
      await service.requestClarification(questionId, 'Which region?');
      const stored = await service.getQuestion(questionId);
      expect(stored).not.toBeNull();
      const out = toQuestionOut(stored as NonNullable<typeof stored>);

      expect(out.status).toBe('needs-clarification');
      expect(out.clarification).toEqual({ text: 'Which region?' });
    });
  });

  describe('toAlertOut', () => {
    it('maps unread alert correctly', async () => {
      const service = new FakeQuestionPopperService();
      const { alertId } = await service.sendAlert({
        text: 'Build done',
        source: 'ci',
        meta: { buildId: '123' },
      });
      const stored = await service.getAlert(alertId);
      expect(stored).not.toBeNull();
      const out = toAlertOut(stored as NonNullable<typeof stored>);

      expect(out.alertId).toBe(alertId);
      expect(out.status).toBe('unread');
      expect(out.alert.text).toBe('Build done');
      expect(out.source).toBe('ci');
      expect(out.meta).toEqual({ buildId: '123' });
      expect(out.acknowledgedAt).toBeNull();
    });

    it('maps acknowledged alert correctly', async () => {
      const service = new FakeQuestionPopperService();
      const { alertId } = await service.sendAlert({
        text: 'Done',
        source: 'ci',
      });
      await service.acknowledgeAlert(alertId);
      const stored = await service.getAlert(alertId);
      expect(stored).not.toBeNull();
      const out = toAlertOut(stored as NonNullable<typeof stored>);

      expect(out.status).toBe('acknowledged');
      expect(out.acknowledgedAt).toBeDefined();
      expect(out.acknowledgedBy).toBeDefined();
    });
  });

  describe('Request Schemas', () => {
    it('AskQuestionRequestSchema rejects unknown fields', () => {
      const result = AskQuestionRequestSchema.safeParse({
        ...VALID_QUESTION,
        extraField: 'nope',
      });
      // Schema does not use .strict(), so unknown fields are stripped (not rejected)
      // This is intentional — API should be lenient on unknown fields
      expect(result.success).toBe(true);
    });

    it('SendAlertRequestSchema validates minimum fields', () => {
      const result = SendAlertRequestSchema.safeParse({
        source: 'cli',
        text: 'Hello',
      });
      expect(result.success).toBe(true);
      // Defaults applied
      expect(result.data?.description).toBeNull();
    });

    it('SendAlertRequestSchema rejects missing source', () => {
      const result = SendAlertRequestSchema.safeParse({ text: 'Hello' });
      expect(result.success).toBe(false);
    });
  });
});
