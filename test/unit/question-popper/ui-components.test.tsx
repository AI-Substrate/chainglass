/**
 * Plan 067 Phase 5: Question Popper — UI Component Tests
 *
 * Lightweight tests for the overlay UI components using @testing-library/react.
 * Tests real rendered components and their interactions.
 *
 * Testing approach: Lightweight per plan (business logic in service,
 * these verify UI wiring and rendered behavior).
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AlertOut, AnswerPayload, QuestionOut } from '@chainglass/shared/question-popper';

import {
  type EventPopperItem,
  isAlertItem,
  isQuestionItem,
} from '../../../apps/web/src/features/067-question-popper/hooks/use-question-popper';
import { AnswerForm } from '../../../apps/web/src/features/067-question-popper/components/answer-form';
import { AlertCard } from '../../../apps/web/src/features/067-question-popper/components/alert-card';

afterEach(cleanup);

// ── Test Fixtures ──

function makeQuestion(overrides: Partial<QuestionOut> & { question?: Partial<QuestionOut['question']> } = {}): QuestionOut {
  const { question: qOverrides, ...rest } = overrides;
  return {
    questionId: 'q-001',
    status: 'pending',
    question: {
      questionType: 'text',
      text: 'What is your name?',
      description: null,
      options: null,
      default: null,
      ...qOverrides,
    },
    source: 'test-agent',
    createdAt: '2026-03-07T10:00:00.000Z',
    ...rest,
  };
}

function makeAlert(overrides: Partial<AlertOut> = {}): AlertOut {
  return {
    alertId: 'a-001',
    status: 'unread',
    alert: { text: 'Deployment complete', description: null },
    source: 'deploy-bot',
    createdAt: '2026-03-07T10:00:00.000Z',
    acknowledgedAt: null,
    acknowledgedBy: null,
    ...overrides,
  };
}

// ── Type Guards ──

describe('EventPopperItem type guards', () => {
  it('isQuestionItem distinguishes questions from alerts', () => {
    /**
     * Test Doc:
     * - Why: Type guards are the only safe way to discriminate the QuestionOut | AlertOut union in rendering code.
     * - Contract: isQuestionItem returns true iff `questionId` key present; isAlertItem iff `alertId` present.
     * - Usage Notes: Used in overlay panel, notification bridge, and outstanding filter.
     * - Quality Contribution: Catches field rename or union changes at compile+runtime.
     * - Worked Example: QuestionOut with questionId → true; AlertOut with alertId → false.
     */
    const q = makeQuestion();
    const a = makeAlert();
    expect(isQuestionItem(q)).toBe(true);
    expect(isQuestionItem(a as unknown as EventPopperItem)).toBe(false);
    expect(isAlertItem(a)).toBe(true);
    expect(isAlertItem(q as unknown as EventPopperItem)).toBe(false);
  });
});

// ── Outstanding Item Filtering ──

describe('Outstanding item filtering', () => {
  function isOutstanding(item: EventPopperItem): boolean {
    if (isQuestionItem(item)) return item.status === 'pending';
    if (isAlertItem(item)) return item.status === 'unread';
    return false;
  }

  it('correctly identifies outstanding items from mixed list', () => {
    /**
     * Test Doc:
     * - Why: Outstanding count drives the indicator glow and badge — wrong filtering breaks the core UX signal.
     * - Contract: pending questions and unread alerts are outstanding; answered/dismissed/acknowledged are not.
     * - Usage Notes: Mirrors the isOutstanding() helper in use-question-popper.tsx.
     * - Quality Contribution: Catches status enum changes or filter logic regressions.
     * - Worked Example: [pending, answered, dismissed, unread, acknowledged] → outstanding = [pending, unread].
     */
    const items: EventPopperItem[] = [
      makeQuestion({ questionId: 'q-1', status: 'pending' }),
      makeQuestion({ questionId: 'q-2', status: 'answered' }),
      makeQuestion({ questionId: 'q-3', status: 'dismissed' }),
      makeAlert({ alertId: 'a-1', status: 'unread' }),
      makeAlert({ alertId: 'a-2', status: 'acknowledged' }),
    ];
    const outstanding = items.filter(isOutstanding);
    expect(outstanding).toHaveLength(2);
    expect(isQuestionItem(outstanding[0]) && outstanding[0].questionId).toBe('q-1');
    expect(isAlertItem(outstanding[1]) && outstanding[1].alertId).toBe('a-1');
  });
});

// ── AnswerForm ──

describe('AnswerForm', () => {
  const noop = async () => {};

  it('renders text input with freeform field and submits both values', async () => {
    /**
     * Test Doc:
     * - Why: Protect AC-21's dual-field text-question behavior — primary answer + freeform must both be present.
     * - Contract: text questions show a primary textarea AND a separate freeform context textarea.
     * - Usage Notes: Render the real component and assert callback receives both fields.
     * - Quality Contribution: Catches regressions where freeform is hidden for text type (FT-002).
     * - Worked Example: typing "Ship it" + "because CI is green" submits { answer: 'Ship it', text: 'because CI is green' }.
     */
    const onAnswer = vi.fn().mockResolvedValue(undefined);
    const q = makeQuestion({ question: { questionType: 'text', text: 'Describe', description: null, options: null, default: null } });
    render(<AnswerForm question={q} onAnswer={onAnswer} onDismiss={noop} onClarify={noop} />);

    const textareas = screen.getAllByRole('textbox');
    expect(textareas.length).toBeGreaterThanOrEqual(2); // primary + freeform

    await userEvent.type(textareas[0], 'Ship it');
    await userEvent.type(textareas[1], 'because CI is green');
    fireEvent.click(screen.getByText('Submit Answer'));

    expect(onAnswer).toHaveBeenCalledWith('q-001', {
      answer: 'Ship it',
      text: 'because CI is green',
    });
  });

  it('renders radio buttons for single-choice questions', async () => {
    /**
     * Test Doc:
     * - Why: AC-21 requires radio buttons for single-choice questions.
     * - Contract: single type renders one radio per option; selecting one and submitting sends the option string.
     * - Usage Notes: Options come from question.options array.
     * - Quality Contribution: Verifies correct input type rendering and value extraction.
     * - Worked Example: options ["A","B","C"], select "B" → answer: "B".
     */
    const onAnswer = vi.fn().mockResolvedValue(undefined);
    const q = makeQuestion({
      question: { questionType: 'single', text: 'Pick one', description: null, options: ['Alpha', 'Beta', 'Gamma'], default: null },
    });
    render(<AnswerForm question={q} onAnswer={onAnswer} onDismiss={noop} onClarify={noop} />);

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);

    await userEvent.click(screen.getByLabelText('Beta'));
    fireEvent.click(screen.getByText('Submit Answer'));

    expect(onAnswer).toHaveBeenCalledWith('q-001', { answer: 'Beta', text: null });
  });

  it('renders checkboxes for multi-choice questions', async () => {
    /**
     * Test Doc:
     * - Why: AC-21 requires checkboxes for multi-choice questions.
     * - Contract: multi type renders one checkbox per option; selecting multiple sends string[].
     * - Usage Notes: Answer is an array of selected option strings.
     * - Quality Contribution: Verifies array construction from checkbox state.
     * - Worked Example: options ["X","Y","Z"], check X and Z → answer: ["X","Z"].
     */
    const onAnswer = vi.fn().mockResolvedValue(undefined);
    const q = makeQuestion({
      question: { questionType: 'multi', text: 'Pick many', description: null, options: ['X', 'Y', 'Z'], default: null },
    });
    render(<AnswerForm question={q} onAnswer={onAnswer} onDismiss={noop} onClarify={noop} />);

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);

    await userEvent.click(screen.getByLabelText('X'));
    await userEvent.click(screen.getByLabelText('Z'));
    fireEvent.click(screen.getByText('Submit Answer'));

    expect(onAnswer).toHaveBeenCalledWith('q-001', { answer: ['X', 'Z'], text: null });
  });

  it('renders Yes/No buttons for confirm questions and submits immediately', async () => {
    /**
     * Test Doc:
     * - Why: AC-21 requires Yes/No buttons for confirm type with immediate submission on click.
     * - Contract: confirm type shows Yes and No buttons; clicking either submits boolean answer immediately.
     * - Usage Notes: No separate Submit button for confirm — the Yes/No IS the submit.
     * - Quality Contribution: Verifies boolean coercion and immediate submission pattern.
     * - Worked Example: click "Yes" → answer: true.
     */
    const onAnswer = vi.fn().mockResolvedValue(undefined);
    const q = makeQuestion({
      question: { questionType: 'confirm', text: 'Deploy?', description: null, options: null, default: null },
    });
    render(<AnswerForm question={q} onAnswer={onAnswer} onDismiss={noop} onClarify={noop} />);

    expect(screen.getByText('Yes')).toBeDefined();
    expect(screen.getByText('No')).toBeDefined();

    await userEvent.click(screen.getByText('Yes'));
    expect(onAnswer).toHaveBeenCalledWith('q-001', { answer: true, text: null });
  });

  it('dismiss button calls onDismiss', async () => {
    /**
     * Test Doc:
     * - Why: AC-31 requires dismiss without answering.
     * - Contract: clicking Dismiss calls onDismiss with the question ID.
     * - Usage Notes: Dismiss is available on all pending questions.
     * - Quality Contribution: Verifies the dismiss action path is wired correctly.
     * - Worked Example: click Dismiss → onDismiss('q-001').
     */
    const onDismiss = vi.fn().mockResolvedValue(undefined);
    const q = makeQuestion();
    render(<AnswerForm question={q} onAnswer={noop} onDismiss={onDismiss} onClarify={noop} />);

    await userEvent.click(screen.getByText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledWith('q-001');
  });

  it('needs-more-info sends clarification text', async () => {
    /**
     * Test Doc:
     * - Why: AC-22 requires "Needs More Information" on every question.
     * - Contract: clicking NMI reveals text input; typing + sending calls onClarify with question ID and text.
     * - Usage Notes: Clarification is a two-step flow: click NMI → type → send.
     * - Quality Contribution: Verifies the full NMI flow renders and wires correctly.
     * - Worked Example: click NMI, type "What version?", send → onClarify('q-001', 'What version?').
     */
    const onClarify = vi.fn().mockResolvedValue(undefined);
    const q = makeQuestion();
    render(<AnswerForm question={q} onAnswer={noop} onDismiss={noop} onClarify={onClarify} />);

    await userEvent.click(screen.getByText('Needs More Info'));

    const clarifyInput = screen.getByPlaceholderText('What additional information do you need?');
    await userEvent.type(clarifyInput, 'What version?');
    await userEvent.click(screen.getByText('Send Clarification Request'));

    expect(onClarify).toHaveBeenCalledWith('q-001', 'What version?');
  });

  it('shows resolved status instead of form for answered questions', () => {
    /**
     * Test Doc:
     * - Why: Answered questions must show their answer, not a re-answerable form.
     * - Contract: When status !== 'pending', AnswerForm renders status text, not inputs.
     * - Usage Notes: Covers answered, needs-clarification, dismissed statuses.
     * - Quality Contribution: Prevents re-submission on already-resolved questions.
     * - Worked Example: status 'answered', answer true → shows "Answered: true".
     */
    const q = makeQuestion({ status: 'answered', answer: { answer: true, text: null } });
    render(<AnswerForm question={q} onAnswer={noop} onDismiss={noop} onClarify={noop} />);

    expect(screen.getByText(/Answered/)).toBeDefined();
    expect(screen.queryByText('Submit Answer')).toBeNull();
  });
});

// ── AlertCard ──

describe('AlertCard', () => {
  it('renders alert text and Mark Read button for unread alerts', async () => {
    /**
     * Test Doc:
     * - Why: AC-23 requires Mark Read button on unread alerts that calls acknowledge API.
     * - Contract: unread alerts show "Mark Read" button; clicking it calls onAcknowledge with alert ID.
     * - Usage Notes: Acknowledged alerts hide the button.
     * - Quality Contribution: Verifies the acknowledge action path and button visibility.
     * - Worked Example: unread alert, click "Mark Read" → onAcknowledge('a-001').
     */
    const onAck = vi.fn().mockResolvedValue(undefined);
    const alert = makeAlert();
    render(<AlertCard alert={alert} onAcknowledge={onAck} />);

    expect(screen.getByText('Deployment complete')).toBeDefined();
    expect(screen.getByText('Mark Read')).toBeDefined();

    await userEvent.click(screen.getByText('Mark Read'));
    expect(onAck).toHaveBeenCalledWith('a-001');
  });

  it('hides Mark Read button for acknowledged alerts', () => {
    /**
     * Test Doc:
     * - Why: Acknowledged alerts must not show the Mark Read button again.
     * - Contract: When status === 'acknowledged', button is absent.
     * - Usage Notes: Alert text and acknowledged time still visible.
     * - Quality Contribution: Prevents double-acknowledge attempts.
     * - Worked Example: acknowledged alert → no "Mark Read" button rendered.
     */
    const alert = makeAlert({ status: 'acknowledged', acknowledgedAt: '2026-03-07T10:01:00.000Z' });
    render(<AlertCard alert={alert} onAcknowledge={async () => {}} />);

    expect(screen.getByText('Deployment complete')).toBeDefined();
    expect(screen.queryByText('Mark Read')).toBeNull();
  });
});

// ── Desktop Notifications ──

describe('Desktop notifications', () => {
  it('requestNotificationPermission returns false when API unavailable', async () => {
    /**
     * Test Doc:
     * - Why: AC-30 desktop notification must degrade gracefully when browser API is absent.
     * - Contract: Returns false when Notification global is undefined (Node.js test env).
     * - Usage Notes: In browsers, would prompt and return based on user choice.
     * - Quality Contribution: Ensures no crash in SSR or test environments.
     * - Worked Example: Node.js env → returns false, no error.
     */
    const { requestNotificationPermission } = await import(
      '../../../apps/web/src/features/067-question-popper/lib/desktop-notifications'
    );
    const result = await requestNotificationPermission();
    expect(result).toBe(false);
  });

  it('sendDesktopNotification no-ops safely when API unavailable', async () => {
    /**
     * Test Doc:
     * - Why: Desktop notification must never crash the app even when API is missing.
     * - Contract: Silently returns without throwing when Notification is undefined.
     * - Usage Notes: Called from notification bridge on every new item.
     * - Quality Contribution: Protects against runtime errors in non-browser environments.
     * - Worked Example: Node.js env → function completes without error.
     */
    const { sendDesktopNotification } = await import(
      '../../../apps/web/src/features/067-question-popper/lib/desktop-notifications'
    );
    expect(() => sendDesktopNotification('Test', 'Body')).not.toThrow();
  });
});
