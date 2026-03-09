/**
 * Plan 067: Question Popper — Contract Tests
 *
 * Contract tests for IQuestionPopperService.
 * Defines behavior contracts that BOTH Fake and Real implementations must satisfy.
 *
 * These tests verify:
 * - AC-03: Two event types (question + alert)
 * - AC-04: Four question variants, answer statuses
 *
 * Phase 2: Runs against FakeQuestionPopperService.
 * Phase 3+: Adds QuestionPopperService (real) to the runner.
 */

import type { IQuestionPopperService } from '@chainglass/shared/interfaces';
import { beforeEach, describe, expect, it } from 'vitest';

export type QuestionPopperFactory = () => { service: IQuestionPopperService };

export function questionPopperContractTests(name: string, factory: QuestionPopperFactory): void {
  describe(`IQuestionPopperService Contract: ${name}`, () => {
    let service: IQuestionPopperService;

    beforeEach(() => {
      const harness = factory();
      service = harness.service;
    });

    // ── Question Lifecycle ──

    it('C01: askQuestion returns a questionId and status is pending', async () => {
      /*
      Test Doc:
      - Why: Core lifecycle — asking creates a pending question
      - Contract: askQuestion(input) → { questionId } and getQuestion(id).status === 'pending'
      - Usage Notes: questionId is opaque — callers must not parse or assume format
      - Quality Contribution: Guards the creation path that every other test depends on
      - Worked Example: askQuestion({ text:'Deploy?', type:'text' }) → { questionId:'abc' }, getQuestion('abc').status === 'pending'
      */
      const { questionId } = await service.askQuestion({
        questionType: 'text',
        text: 'What should I deploy?',
        source: 'test-agent',
      });

      expect(questionId).toBeTruthy();
      const stored = await service.getQuestion(questionId);
      expect(stored).not.toBeNull();
      expect(stored?.status).toBe('pending');
      expect(stored?.type).toBe('question');
    });

    it('C02: answerQuestion transitions status to answered with answer stored', async () => {
      /*
      Test Doc:
      - Why: Core lifecycle — answering resolves the question
      - Contract: answerQuestion(id, answer) → status becomes 'answered', response contains answer
      - Usage Notes: response.payload mirrors the exact answer object passed in
      - Quality Contribution: Verifies both status transition and answer persistence in one assertion
      - Worked Example: ask confirm 'Deploy?' → answer { answer:true, text:'Confirmed' } → stored.response.payload === { answer:true, text:'Confirmed' }
      */
      const { questionId } = await service.askQuestion({
        questionType: 'confirm',
        text: 'Deploy to production?',
        source: 'test-agent',
      });

      await service.answerQuestion(questionId, { answer: true, text: 'Confirmed' });

      const stored = await service.getQuestion(questionId);
      expect(stored?.status).toBe('answered');
      expect(stored?.response).not.toBeNull();
      expect(stored?.response?.status).toBe('answered');
      expect(stored?.response?.payload).toEqual({ answer: true, text: 'Confirmed' });
    });

    it('C03: dismissQuestion transitions status to dismissed', async () => {
      /*
      Test Doc:
      - Why: Core lifecycle — dismissing skips without answering
      - Contract: dismissQuestion(id) → status becomes 'dismissed'
      - Usage Notes: Dismissed questions have response.status='dismissed' but no answer payload
      - Quality Contribution: Ensures dismiss is a distinct terminal state, not confused with answered
      - Worked Example: askQuestion('Which env?') → dismissQuestion(id) → status='dismissed', response.status='dismissed'
      */
      const { questionId } = await service.askQuestion({
        questionType: 'text',
        text: 'Which environment?',
        source: 'test-agent',
      });

      await service.dismissQuestion(questionId);

      const stored = await service.getQuestion(questionId);
      expect(stored?.status).toBe('dismissed');
      expect(stored?.response?.status).toBe('dismissed');
    });

    it('C04: requestClarification transitions status to needs-clarification', async () => {
      /*
      Test Doc:
      - Why: Core lifecycle — user can request more info instead of answering
      - Contract: requestClarification(id, text) → status becomes 'needs-clarification'
      - Usage Notes: Clarification text is stored in response.payload — question remains actionable
      - Quality Contribution: Validates the non-terminal transition path (question can still be answered later)
      - Worked Example: ask single ['A','B','C'] → requestClarification('Explain B?') → status='needs-clarification', payload={ text:'Explain B?' }
      */
      const { questionId } = await service.askQuestion({
        questionType: 'single',
        text: 'Pick an option',
        options: ['A', 'B', 'C'],
        source: 'test-agent',
      });

      await service.requestClarification(questionId, 'Can you explain option B?');

      const stored = await service.getQuestion(questionId);
      expect(stored?.status).toBe('needs-clarification');
      expect(stored?.response?.payload).toEqual({ text: 'Can you explain option B?' });
    });

    // ── Alert Lifecycle ──

    it('C05: sendAlert creates an unread alert', async () => {
      /*
      Test Doc:
      - Why: Core alert lifecycle — sending creates an unread alert
      - Contract: sendAlert(input) → { alertId } and getAlert(id).status === 'unread'
      - Usage Notes: Alerts use type='alert' to distinguish from questions in listAll()
      - Quality Contribution: Confirms alert creation path is independent of the question path
      - Worked Example: sendAlert({ text:'Deploy complete' }) → { alertId:'x' }, getAlert('x').status='unread', type='alert'
      */
      const { alertId } = await service.sendAlert({
        text: 'Deployment complete',
        source: 'test-agent',
      });

      expect(alertId).toBeTruthy();
      const stored = await service.getAlert(alertId);
      expect(stored).not.toBeNull();
      expect(stored?.status).toBe('unread');
      expect(stored?.type).toBe('alert');
    });

    it('C06: acknowledgeAlert transitions status to acknowledged', async () => {
      /*
      Test Doc:
      - Why: Core alert lifecycle — acknowledging marks as read
      - Contract: acknowledgeAlert(id) → status becomes 'acknowledged'
      - Usage Notes: Acknowledged is the only terminal state for alerts (no dismiss/clarify)
      - Quality Contribution: Ensures alert lifecycle is simpler than question lifecycle by design
      - Worked Example: sendAlert('Build failed') → acknowledgeAlert(id) → status='acknowledged'
      */
      const { alertId } = await service.sendAlert({
        text: 'Build failed',
        source: 'test-agent',
      });

      await service.acknowledgeAlert(alertId);

      const stored = await service.getAlert(alertId);
      expect(stored?.status).toBe('acknowledged');
    });

    // ── Outstanding Count ──

    it('C07: outstanding count reflects pending questions + unread alerts', async () => {
      /*
      Test Doc:
      - Why: Badge count must be accurate
      - Contract: getOutstandingCount() = pending questions + unread alerts
      - Usage Notes: Count is synchronous — no async needed, suitable for reactive UI bindings
      - Quality Contribution: Validates increment on create, decrement on resolve across both event types
      - Worked Example: 0 → askQuestion → 1 → sendAlert → 2 → answerQuestion → 1
      */
      expect(service.getOutstandingCount()).toBe(0);

      const { questionId: q1 } = await service.askQuestion({
        questionType: 'text',
        text: 'Q1',
        source: 'test',
      });
      expect(service.getOutstandingCount()).toBe(1);

      await service.sendAlert({ text: 'A1', source: 'test' });
      expect(service.getOutstandingCount()).toBe(2);

      await service.answerQuestion(q1, { answer: 'done', text: null });
      expect(service.getOutstandingCount()).toBe(1);
    });

    // ── List / Filter ──

    it('C08: listQuestions filters by status', async () => {
      /*
      Test Doc:
      - Why: UI needs to filter questions by status
      - Contract: listQuestions({ status }) returns only matching questions
      - Usage Notes: Filter applies server-side — callers receive only matching items, not the full set
      - Quality Contribution: Catches bugs where answered questions leak into the pending list
      - Worked Example: ask Q1 + Q2, answer Q1 → listQuestions({ status:'pending' }) → [Q2] only
      */
      const { questionId: q1 } = await service.askQuestion({
        questionType: 'text',
        text: 'Q1',
        source: 'test',
      });
      await service.askQuestion({ questionType: 'text', text: 'Q2', source: 'test' });

      await service.answerQuestion(q1, { answer: 'yes', text: null });

      const pending = await service.listQuestions({ status: 'pending' });
      expect(pending).toHaveLength(1);
      expect(pending[0]?.request.payload.text).toBe('Q2');

      const answered = await service.listQuestions({ status: 'answered' });
      expect(answered).toHaveLength(1);
    });

    // ── Edge Cases ──

    it('C09: getQuestion returns null for unknown ID', async () => {
      /*
      Test Doc:
      - Why: Must handle missing questions gracefully
      - Contract: getQuestion('nonexistent') → null
      - Usage Notes: Callers must null-check — service never throws for missing IDs on reads
      - Quality Contribution: Prevents 500 errors when UI references a stale or invalid questionId
      - Worked Example: getQuestion('nonexistent-id') → null (not throw)
      */
      const result = await service.getQuestion('nonexistent-id');
      expect(result).toBeNull();
    });

    it('C10: previousQuestionId is preserved for chaining', async () => {
      /*
      Test Doc:
      - Why: Question chaining requires previousQuestionId to be stored and retrievable
      - Contract: askQuestion with previousQuestionId → stored in request payload
      - Usage Notes: previousQuestionId is optional — omitting it creates a root question
      - Quality Contribution: Ensures follow-up context is not silently dropped during persistence
      - Worked Example: ask Q1 → ask Q2(previousQuestionId=Q1) → getQuestion(Q2).request.payload.previousQuestionId === Q1
      */
      const { questionId: q1 } = await service.askQuestion({
        questionType: 'confirm',
        text: 'First question',
        source: 'test',
      });

      const { questionId: q2 } = await service.askQuestion({
        questionType: 'text',
        text: 'Follow-up question',
        previousQuestionId: q1,
        source: 'test',
      });

      const stored = await service.getQuestion(q2);
      expect(stored?.request.payload.previousQuestionId).toBe(q1);
    });

    it('C11: answerQuestion throws for already-answered question', async () => {
      /*
      Test Doc:
      - Why: Prevents double-answer (first-write-wins at service level)
      - Contract: answerQuestion on resolved question → throws
      - Usage Notes: All terminal states (answered, dismissed) reject further mutations
      - Quality Contribution: Catches race conditions where two UI clients answer simultaneously
      - Worked Example: answer(id, 'first') → ok; answer(id, 'second') → throws Error
      */
      const { questionId } = await service.askQuestion({
        questionType: 'text',
        text: 'Q',
        source: 'test',
      });
      await service.answerQuestion(questionId, { answer: 'first', text: null });

      await expect(
        service.answerQuestion(questionId, { answer: 'second', text: null })
      ).rejects.toThrow();
    });

    it('C12: listAll returns questions and alerts sorted newest first', async () => {
      /*
      Test Doc:
      - Why: UI overlay needs combined list
      - Contract: listAll() returns all events, newest first
      - Usage Notes: Interleaves questions and alerts — type field distinguishes them
      - Quality Contribution: Validates sort order across mixed event types (not just within one type)
      - Worked Example: ask Q1, sendAlert A1, ask Q2 → listAll() → [Q2, A1, Q1] newest first
      */
      await service.askQuestion({ questionType: 'text', text: 'Q1', source: 'test' });
      await service.sendAlert({ text: 'A1', source: 'test' });
      await service.askQuestion({ questionType: 'confirm', text: 'Q2', source: 'test' });

      const all = await service.listAll();
      expect(all).toHaveLength(3);
      // Newest first — Q2 was created last
      expect(all[0]?.request.payload.text).toBe('Q2');
    });

    // ── AC-03 / AC-04 Gap Coverage ──

    it('C13: multi questions persist string[] answers', async () => {
      /*
      Test Doc:
      - Why: AC-04 requires all 4 question types work — multi was untested
      - Contract: askQuestion(multi) + answerQuestion(string[]) → answer stored as array
      - Usage Notes: multi answers are always string[], never single string
      - Quality Contribution: Catches union type serialization issues
      - Worked Example: ask multi ['A','B','C'] → answer ['A','C'] → stored as ['A','C']
      */
      const { questionId } = await service.askQuestion({
        questionType: 'multi',
        text: 'Select features',
        options: ['A', 'B', 'C'],
        source: 'test',
      });

      await service.answerQuestion(questionId, { answer: ['A', 'C'], text: null });

      const stored = await service.getQuestion(questionId);
      expect(stored?.status).toBe('answered');
      expect(stored?.response?.payload.answer).toEqual(['A', 'C']);
    });

    it('C14: timeout defaults to 600 and preserves explicit overrides', async () => {
      /*
      Test Doc:
      - Why: AC-04 requires timeout field with 600 default
      - Contract: omitted timeout → 600; explicit timeout → preserved
      - Usage Notes: timeout=0 means fire-and-forget (no CLI blocking)
      - Quality Contribution: Catches default value bugs in schema/service
      - Worked Example: ask(timeout omitted) → 600; ask(timeout=30) → 30
      */
      const { questionId: q1 } = await service.askQuestion({
        questionType: 'text',
        text: 'Default timeout',
        source: 'test',
      });
      const { questionId: q2 } = await service.askQuestion({
        questionType: 'text',
        text: 'Custom timeout',
        timeout: 30,
        source: 'test',
      });

      const s1 = await service.getQuestion(q1);
      const s2 = await service.getQuestion(q2);
      expect(s1?.request.payload.timeout).toBe(600);
      expect(s2?.request.payload.timeout).toBe(30);
    });

    it('C15: unread alerts have no response before acknowledgeAlert', async () => {
      /*
      Test Doc:
      - Why: Alerts are fire-and-forget — response should be null until acknowledged
      - Contract: sendAlert → getAlert.response === null; acknowledgeAlert → response exists
      - Usage Notes: Unlike questions, alerts never have an answer payload
      - Quality Contribution: Catches premature response initialization
      - Worked Example: sendAlert → response=null, status='unread'; ack → response exists, status='acknowledged'
      */
      const { alertId } = await service.sendAlert({
        text: 'Build complete',
        source: 'test',
      });

      const before = await service.getAlert(alertId);
      expect(before?.response).toBeNull();
      expect(before?.status).toBe('unread');

      await service.acknowledgeAlert(alertId);

      const after = await service.getAlert(alertId);
      expect(after?.response).not.toBeNull();
      expect(after?.status).toBe('acknowledged');
    });
  });
}
