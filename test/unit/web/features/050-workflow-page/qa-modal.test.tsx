import { QAModal } from '@/features/050-workflow-page/components/qa-modal';
import type { NodeStatusResult } from '@chainglass/positional-graph';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

type PendingQuestion = NonNullable<NodeStatusResult['pendingQuestion']>;

function makeQuestion(overrides: Partial<PendingQuestion> = {}): PendingQuestion {
  return {
    questionId: 'q-001',
    text: 'What color?',
    questionType: 'text',
    askedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('QAModal', () => {
  it('renders text question type', () => {
    render(
      <QAModal
        question={makeQuestion({ questionType: 'text' })}
        nodeId="n-001"
        onAnswer={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByTestId('qa-modal')).toBeTruthy();
    expect(screen.getByTestId('qa-text-input')).toBeTruthy();
    expect(screen.getByText('What color?')).toBeTruthy();
  });

  it('renders single-choice question type', () => {
    render(
      <QAModal
        question={makeQuestion({
          questionType: 'single',
          options: [
            { key: 'red', label: 'Red' },
            { key: 'blue', label: 'Blue' },
          ],
        })}
        nodeId="n-001"
        onAnswer={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByTestId('qa-single-input')).toBeTruthy();
    expect(screen.getByText('Red')).toBeTruthy();
    expect(screen.getByText('Blue')).toBeTruthy();
  });

  it('renders multi-choice question type', () => {
    render(
      <QAModal
        question={makeQuestion({
          questionType: 'multi',
          options: [
            { key: 'a', label: 'Option A' },
            { key: 'b', label: 'Option B' },
          ],
        })}
        nodeId="n-001"
        onAnswer={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByTestId('qa-multi-input')).toBeTruthy();
  });

  it('renders confirm question type', () => {
    render(
      <QAModal
        question={makeQuestion({ questionType: 'confirm' })}
        nodeId="n-001"
        onAnswer={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByTestId('qa-confirm-input')).toBeTruthy();
    expect(screen.getByText('Yes')).toBeTruthy();
    expect(screen.getByText('No')).toBeTruthy();
  });

  it('always shows freeform text area', () => {
    render(
      <QAModal
        question={makeQuestion({ questionType: 'confirm' })}
        nodeId="n-001"
        onAnswer={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByTestId('qa-freeform')).toBeTruthy();
  });

  it('calls onAnswer with confirm value on submit', () => {
    const onAnswer = vi.fn();
    render(
      <QAModal
        question={makeQuestion({ questionType: 'confirm' })}
        nodeId="n-001"
        onAnswer={onAnswer}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Yes'));
    fireEvent.click(screen.getByTestId('qa-submit'));
    expect(onAnswer).toHaveBeenCalledWith({ structured: true, freeform: '' });
  });

  it('calls onClose on cancel', () => {
    const onClose = vi.fn();
    render(
      <QAModal question={makeQuestion()} nodeId="n-001" onAnswer={vi.fn()} onClose={onClose} />
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
