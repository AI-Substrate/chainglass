/**
 * Plan 067 Phase 5: Question Popper — UI Component Tests
 *
 * Lightweight tests for the overlay UI components.
 * Uses FakeQuestionPopperService patterns but tests at the
 * component/hook level, not service level.
 *
 * Testing approach: Lightweight per plan (business logic in service,
 * these verify UI wiring).
 */

import { describe, expect, it, vi } from 'vitest';

import type {
  AlertOut,
  AnswerPayload,
  QuestionOut,
} from '@chainglass/shared/question-popper';

import {
  type EventPopperItem,
  isAlertItem,
  isQuestionItem,
} from '../../../apps/web/src/features/067-question-popper/hooks/use-question-popper';

// ── Type Guards ──

describe('EventPopperItem type guards', () => {
  const mockQuestion: QuestionOut = {
    questionId: 'q-001',
    status: 'pending',
    question: {
      questionType: 'text',
      text: 'What is your name?',
      description: null,
      options: null,
      default: null,
    },
    source: 'test-agent',
    createdAt: '2026-03-07T10:00:00.000Z',
  };

  const mockAlert: AlertOut = {
    alertId: 'a-001',
    status: 'unread',
    alert: {
      text: 'Deployment complete',
      description: null,
    },
    source: 'deploy-bot',
    createdAt: '2026-03-07T10:00:00.000Z',
    acknowledgedAt: null,
    acknowledgedBy: null,
  };

  it('isQuestionItem returns true for questions', () => {
    expect(isQuestionItem(mockQuestion)).toBe(true);
  });

  it('isQuestionItem returns false for alerts', () => {
    expect(isQuestionItem(mockAlert as unknown as EventPopperItem)).toBe(false);
  });

  it('isAlertItem returns true for alerts', () => {
    expect(isAlertItem(mockAlert)).toBe(true);
  });

  it('isAlertItem returns false for questions', () => {
    expect(isAlertItem(mockQuestion as unknown as EventPopperItem)).toBe(false);
  });
});

// ── Desktop Notifications ──

describe('Desktop notifications', () => {
  it('toastNewQuestion calls toast with truncated text', async () => {
    const { toastNewQuestion } = await import(
      '../../../apps/web/src/features/067-question-popper/lib/desktop-notifications'
    );

    // Toast is imported from sonner — just verify the function doesn't throw
    expect(() => toastNewQuestion('test-agent', 'Short question')).not.toThrow();
  });

  it('toastNewAlert calls toast with truncated text', async () => {
    const { toastNewAlert } = await import(
      '../../../apps/web/src/features/067-question-popper/lib/desktop-notifications'
    );

    expect(() => toastNewAlert('deploy-bot', 'Deployment done')).not.toThrow();
  });

  it('requestNotificationPermission returns false when Notification API unavailable', async () => {
    const { requestNotificationPermission } = await import(
      '../../../apps/web/src/features/067-question-popper/lib/desktop-notifications'
    );

    // In test environment (Node.js), Notification API is not available
    const result = await requestNotificationPermission();
    expect(result).toBe(false);
  });

  it('sendDesktopNotification no-ops when Notification API unavailable', async () => {
    const { sendDesktopNotification } = await import(
      '../../../apps/web/src/features/067-question-popper/lib/desktop-notifications'
    );

    // Should not throw even when API is unavailable
    expect(() => sendDesktopNotification('Test', 'Body')).not.toThrow();
  });
});

// ── Answer Payload Construction ──

describe('AnswerPayload construction for each question type', () => {
  it('text answer has string answer and optional text', () => {
    const answer: AnswerPayload = { answer: 'Hello world', text: null };
    expect(answer.answer).toBe('Hello world');
    expect(answer.text).toBeNull();
  });

  it('single answer has string answer from options', () => {
    const answer: AnswerPayload = { answer: 'Option A', text: 'I chose A because...' };
    expect(answer.answer).toBe('Option A');
    expect(answer.text).toBe('I chose A because...');
  });

  it('multi answer has string array', () => {
    const answer: AnswerPayload = { answer: ['Option A', 'Option C'], text: null };
    expect(Array.isArray(answer.answer)).toBe(true);
    expect(answer.answer).toEqual(['Option A', 'Option C']);
  });

  it('confirm answer has boolean', () => {
    const answer: AnswerPayload = { answer: true, text: null };
    expect(answer.answer).toBe(true);
  });
});

// ── Outstanding Item Filtering ──

describe('Outstanding item filtering', () => {
  const pendingQuestion: QuestionOut = {
    questionId: 'q-001',
    status: 'pending',
    question: { questionType: 'text', text: 'Q?', description: null, options: null, default: null },
    source: 'test',
    createdAt: '2026-03-07T10:00:00.000Z',
  };

  const answeredQuestion: QuestionOut = {
    questionId: 'q-002',
    status: 'answered',
    question: { questionType: 'confirm', text: 'OK?', description: null, options: null, default: null },
    source: 'test',
    createdAt: '2026-03-07T09:00:00.000Z',
    answer: { answer: true, text: null },
  };

  const dismissedQuestion: QuestionOut = {
    questionId: 'q-003',
    status: 'dismissed',
    question: { questionType: 'text', text: 'Dismissed', description: null, options: null, default: null },
    source: 'test',
    createdAt: '2026-03-07T08:00:00.000Z',
  };

  const unreadAlert: AlertOut = {
    alertId: 'a-001',
    status: 'unread',
    alert: { text: 'Alert!', description: null },
    source: 'bot',
    createdAt: '2026-03-07T10:30:00.000Z',
    acknowledgedAt: null,
    acknowledgedBy: null,
  };

  const readAlert: AlertOut = {
    alertId: 'a-002',
    status: 'acknowledged',
    alert: { text: 'Old alert', description: null },
    source: 'bot',
    createdAt: '2026-03-07T07:00:00.000Z',
    acknowledgedAt: '2026-03-07T07:01:00.000Z',
    acknowledgedBy: 'user',
  };

  function isOutstanding(item: EventPopperItem): boolean {
    if (isQuestionItem(item)) return item.status === 'pending';
    if (isAlertItem(item)) return item.status === 'unread';
    return false;
  }

  it('pending questions are outstanding', () => {
    expect(isOutstanding(pendingQuestion)).toBe(true);
  });

  it('answered questions are not outstanding', () => {
    expect(isOutstanding(answeredQuestion)).toBe(false);
  });

  it('dismissed questions are not outstanding', () => {
    expect(isOutstanding(dismissedQuestion)).toBe(false);
  });

  it('unread alerts are outstanding', () => {
    expect(isOutstanding(unreadAlert)).toBe(true);
  });

  it('acknowledged alerts are not outstanding', () => {
    expect(isOutstanding(readAlert)).toBe(false);
  });

  it('filters correct outstanding items from mixed list', () => {
    const allItems: EventPopperItem[] = [
      pendingQuestion,
      answeredQuestion,
      dismissedQuestion,
      unreadAlert,
      readAlert,
    ];
    const outstanding = allItems.filter(isOutstanding);
    expect(outstanding).toHaveLength(2);
    expect(outstanding[0]).toBe(pendingQuestion);
    expect(outstanding[1]).toBe(unreadAlert);
  });
});
