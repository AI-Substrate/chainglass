import { type AnswerInput, FakeMessageService } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Tests for FakeMessageService.
 *
 * Per FakePhaseService pattern: Verifies call capture works correctly
 * and preset/default results are returned as expected.
 */

describe('FakeMessageService', () => {
  let fake: FakeMessageService;

  const phase = 'process';
  const runDir = '/runs/run-test-001';

  beforeEach(() => {
    fake = new FakeMessageService();
  });

  describe('create()', () => {
    it('should capture create calls with all parameters', async () => {
      /*
      Test Doc:
      - Why: CLI tests need to verify correct parameters passed
      - Contract: getLastCreateCall() returns all captured params
      */
      const content = { subject: 'Test', body: 'Body' };
      await fake.create(phase, runDir, 'free_text', content, 'agent');

      const call = fake.getLastCreateCall();
      expect(call).not.toBeNull();
      expect(call?.phase).toBe(phase);
      expect(call?.runDir).toBe(runDir);
      expect(call?.type).toBe('free_text');
      expect(call?.content).toEqual(content);
      expect(call?.from).toBe('agent');
      expect(call?.timestamp).toBeDefined();
    });

    it('should auto-generate sequential message IDs', async () => {
      await fake.create(phase, runDir, 'free_text', { subject: 'A', body: 'B' });
      const call1 = fake.getLastCreateCall();
      expect(call1?.result.messageId).toBe('001');

      await fake.create(phase, runDir, 'free_text', { subject: 'C', body: 'D' });
      const call2 = fake.getLastCreateCall();
      expect(call2?.result.messageId).toBe('002');
    });

    it('should return preset result when configured', async () => {
      const preset = FakeMessageService.createSuccessResult(
        phase,
        runDir,
        '999',
        '/custom/path.json'
      );
      fake.setCreateResult(phase, preset);

      const result = await fake.create(phase, runDir, 'free_text', { subject: 'X', body: 'Y' });
      expect(result.messageId).toBe('999');
      expect(result.filePath).toBe('/custom/path.json');
    });

    it('should return default result when no preset matches', async () => {
      const defaultResult = FakeMessageService.createSuccessResult(
        'any',
        runDir,
        '500',
        '/default.json'
      );
      fake.setDefaultCreateResult(defaultResult);

      const result = await fake.create(phase, runDir, 'free_text', { subject: 'X', body: 'Y' });
      expect(result.messageId).toBe('500');
    });

    it('should track call count correctly', async () => {
      expect(fake.getCreateCallCount()).toBe(0);
      await fake.create(phase, runDir, 'free_text', { subject: 'A', body: 'B' });
      expect(fake.getCreateCallCount()).toBe(1);
      await fake.create(phase, runDir, 'confirm', { subject: 'C', body: 'D' });
      expect(fake.getCreateCallCount()).toBe(2);
    });
  });

  describe('answer()', () => {
    it('should capture answer calls with all parameters', async () => {
      const answer: AnswerInput = { selected: ['A'] };
      await fake.answer(phase, runDir, '001', answer, 'orchestrator');

      const call = fake.getLastAnswerCall();
      expect(call).not.toBeNull();
      expect(call?.phase).toBe(phase);
      expect(call?.id).toBe('001');
      expect(call?.answer).toEqual(answer);
      expect(call?.from).toBe('orchestrator');
    });

    it('should return preset result when configured', async () => {
      const preset = FakeMessageService.answerSuccessResult(phase, runDir, '001', {
        answered_at: '2026-01-21T10:00:00Z',
        selected: ['B'],
      });
      fake.setAnswerResult(phase, '001', preset);

      const result = await fake.answer(phase, runDir, '001', { selected: ['A'] });
      expect(result.answer?.selected).toEqual(['B']);
    });

    it('should auto-generate answer result with timestamp', async () => {
      const result = await fake.answer(phase, runDir, '001', { text: 'response' });
      expect(result.errors).toEqual([]);
      expect(result.answer?.answered_at).toBeDefined();
      expect(result.answer?.text).toBe('response');
    });
  });

  describe('list()', () => {
    it('should capture list calls', async () => {
      await fake.list(phase, runDir);

      const call = fake.getLastListCall();
      expect(call).not.toBeNull();
      expect(call?.phase).toBe(phase);
      expect(call?.runDir).toBe(runDir);
    });

    it('should return preset result when configured', async () => {
      const messages = [
        {
          id: '001',
          type: 'free_text' as const,
          subject: 'Test',
          from: 'agent' as const,
          created_at: '2026-01-21T10:00:00Z',
          answered: false,
          answered_at: null,
        },
      ];
      const preset = FakeMessageService.listSuccessResult(phase, runDir, messages);
      fake.setListResult(phase, preset);

      const result = await fake.list(phase, runDir);
      expect(result.messages).toHaveLength(1);
      expect(result.count).toBe(1);
    });

    it('should return empty list by default', async () => {
      const result = await fake.list(phase, runDir);
      expect(result.messages).toEqual([]);
      expect(result.count).toBe(0);
    });
  });

  describe('read()', () => {
    it('should capture read calls', async () => {
      await fake.read(phase, runDir, '001');

      const call = fake.getLastReadCall();
      expect(call).not.toBeNull();
      expect(call?.phase).toBe(phase);
      expect(call?.id).toBe('001');
    });

    it('should return preset result when configured', async () => {
      const message = {
        id: '001',
        created_at: '2026-01-21T10:00:00Z',
        from: 'agent' as const,
        type: 'confirm' as const,
        subject: 'Custom message',
        body: 'Custom body',
      };
      const preset = FakeMessageService.readSuccessResult(phase, runDir, message);
      fake.setReadResult(phase, '001', preset);

      const result = await fake.read(phase, runDir, '001');
      expect(result.message?.subject).toBe('Custom message');
    });

    it('should return auto-generated message by default', async () => {
      const result = await fake.read(phase, runDir, '001');
      expect(result.errors).toEqual([]);
      expect(result.message).not.toBeNull();
      expect(result.message?.id).toBe('001');
    });
  });

  describe('reset()', () => {
    it('should clear all state', async () => {
      await fake.create(phase, runDir, 'free_text', { subject: 'A', body: 'B' });
      await fake.answer(phase, runDir, '001', { text: 'response' });
      await fake.list(phase, runDir);
      await fake.read(phase, runDir, '001');

      expect(fake.getCreateCallCount()).toBe(1);
      expect(fake.getAnswerCallCount()).toBe(1);
      expect(fake.getListCallCount()).toBe(1);
      expect(fake.getReadCallCount()).toBe(1);

      fake.reset();

      expect(fake.getCreateCallCount()).toBe(0);
      expect(fake.getAnswerCallCount()).toBe(0);
      expect(fake.getListCallCount()).toBe(0);
      expect(fake.getReadCallCount()).toBe(0);
    });

    it('should reset message ID counter', async () => {
      await fake.create(phase, runDir, 'free_text', { subject: 'A', body: 'B' });
      expect(fake.getLastCreateCall()?.result.messageId).toBe('001');

      fake.reset();

      await fake.create(phase, runDir, 'free_text', { subject: 'C', body: 'D' });
      expect(fake.getLastCreateCall()?.result.messageId).toBe('001');
    });
  });

  describe('static factory methods', () => {
    it('createErrorResult should create error result', () => {
      const result = FakeMessageService.createErrorResult(
        phase,
        runDir,
        'E064',
        'Validation failed',
        'Fix it'
      );
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E064');
      expect(result.messageId).toBe('');
    });

    it('answerErrorResult should create error result', () => {
      const result = FakeMessageService.answerErrorResult(
        phase,
        runDir,
        '001',
        'E060',
        'Not found',
        'Check ID'
      );
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E060');
      expect(result.answer).toBeNull();
    });

    it('readErrorResult should create error result', () => {
      const result = FakeMessageService.readErrorResult(
        phase,
        runDir,
        'E060',
        'Not found',
        'Check ID'
      );
      expect(result.errors).toHaveLength(1);
      expect(result.message).toBeNull();
    });
  });
});
