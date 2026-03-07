'use client';

/**
 * Plan 067 Phase 5: Question Popper — Answer Form
 *
 * Type-appropriate input for answering questions:
 * - text: textarea
 * - single: radio buttons from options
 * - multi: checkboxes from options
 * - confirm: Yes / No buttons
 *
 * Always includes a freeform text field for additional context.
 * Buttons: Submit Answer | Needs More Info | Dismiss
 *
 * AC-21: Answer form matches question type
 * AC-22: "Needs More Information" option on every question
 * AC-31: Dismiss question without answering
 */

import { type FormEvent, useCallback, useState } from 'react';

import type { AnswerPayload, QuestionOut } from '@chainglass/shared/question-popper';

interface AnswerFormProps {
  question: QuestionOut;
  onAnswer: (id: string, answer: AnswerPayload) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
  onClarify: (id: string, text: string) => Promise<void>;
}

export function AnswerForm({ question, onAnswer, onDismiss, onClarify }: AnswerFormProps) {
  const questionType = question.question.questionType;
  const options = question.question.options ?? [];
  const defaultValue = question.question.default;

  // Typed answer state
  const [textAnswer, setTextAnswer] = useState<string>(
    questionType === 'text' && typeof defaultValue === 'string' ? defaultValue : ''
  );
  const [singleAnswer, setSingleAnswer] = useState<string>(
    questionType === 'single' && typeof defaultValue === 'string' ? defaultValue : ''
  );
  const [multiAnswer, setMultiAnswer] = useState<string[]>([]);
  const [confirmAnswer, setConfirmAnswer] = useState<boolean | null>(
    questionType === 'confirm' && typeof defaultValue === 'boolean' ? defaultValue : null
  );

  // Freeform text (always available alongside typed answer)
  const [freeformText, setFreeformText] = useState('');

  // Needs more info state
  const [showClarify, setShowClarify] = useState(false);
  const [clarifyText, setClarifyText] = useState('');

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleMultiToggle = useCallback((option: string) => {
    setMultiAnswer((prev) =>
      prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]
    );
  }, []);

  const buildAnswer = useCallback((): AnswerPayload | null => {
    switch (questionType) {
      case 'text':
        if (!textAnswer.trim()) return null;
        return { answer: textAnswer.trim(), text: freeformText.trim() || null };
      case 'single':
        if (!singleAnswer) return null;
        return { answer: singleAnswer, text: freeformText.trim() || null };
      case 'multi':
        if (multiAnswer.length === 0) return null;
        return { answer: multiAnswer, text: freeformText.trim() || null };
      case 'confirm':
        if (confirmAnswer === null) return null;
        return { answer: confirmAnswer, text: freeformText.trim() || null };
      default:
        return null;
    }
  }, [questionType, textAnswer, singleAnswer, multiAnswer, confirmAnswer, freeformText]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const answer = buildAnswer();
      if (!answer) return;

      setIsSubmitting(true);
      setSubmitError(null);
      try {
        await onAnswer(question.questionId, answer);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Failed to submit answer');
      } finally {
        setIsSubmitting(false);
      }
    },
    [buildAnswer, onAnswer, question.questionId]
  );

  const handleConfirmClick = useCallback(
    async (value: boolean) => {
      setConfirmAnswer(value);
      setIsSubmitting(true);
      setSubmitError(null);
      try {
        await onAnswer(question.questionId, {
          answer: value,
          text: freeformText.trim() || null,
        });
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Failed to submit answer');
      } finally {
        setIsSubmitting(false);
      }
    },
    [onAnswer, question.questionId, freeformText]
  );

  const handleDismiss = useCallback(async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onDismiss(question.questionId);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to dismiss');
    } finally {
      setIsSubmitting(false);
    }
  }, [onDismiss, question.questionId]);

  const handleClarify = useCallback(async () => {
    if (!clarifyText.trim()) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onClarify(question.questionId, clarifyText.trim());
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to request clarification');
    } finally {
      setIsSubmitting(false);
    }
  }, [onClarify, question.questionId, clarifyText]);

  // Already resolved — show status, no form
  if (question.status !== 'pending') {
    return (
      <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
        {question.status === 'answered' && (
          <span>
            Answered: <code className="text-xs">{JSON.stringify(question.answer?.answer)}</code>
          </span>
        )}
        {question.status === 'needs-clarification' && (
          <span>Clarification requested: {question.clarification?.text}</span>
        )}
        {question.status === 'dismissed' && <span>Dismissed</span>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Type-specific input */}
      {questionType === 'text' && (
        <textarea
          value={textAnswer}
          onChange={(e) => setTextAnswer(e.target.value)}
          placeholder="Type your answer..."
          rows={3}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
          disabled={isSubmitting}
        />
      )}

      {questionType === 'single' && (
        <div className="space-y-1.5">
          {options.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700"
            >
              <input
                type="radio"
                name={`q-${question.questionId}`}
                value={option}
                checked={singleAnswer === option}
                onChange={() => setSingleAnswer(option)}
                disabled={isSubmitting}
                className="accent-blue-500"
              />
              <span className="dark:text-neutral-200">{option}</span>
            </label>
          ))}
        </div>
      )}

      {questionType === 'multi' && (
        <div className="space-y-1.5">
          {options.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700"
            >
              <input
                type="checkbox"
                checked={multiAnswer.includes(option)}
                onChange={() => handleMultiToggle(option)}
                disabled={isSubmitting}
                className="accent-blue-500"
              />
              <span className="dark:text-neutral-200">{option}</span>
            </label>
          ))}
        </div>
      )}

      {questionType === 'confirm' && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleConfirmClick(true)}
            disabled={isSubmitting}
            className="flex-1 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => handleConfirmClick(false)}
            disabled={isSubmitting}
            className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            No
          </button>
        </div>
      )}

      {/* Freeform text — always available regardless of question type (AC-21) */}
      <textarea
        value={freeformText}
        onChange={(e) => setFreeformText(e.target.value)}
        placeholder={questionType === 'text' ? 'Additional context (optional)...' : 'Additional context (optional)...'}
        rows={2}
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
        disabled={isSubmitting}
      />

      {/* Error display */}
      {submitError && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {submitError}
        </div>
      )}

      {/* Clarification input (shown when "Needs More Info" clicked) */}
      {showClarify && (
        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/20">
          <textarea
            value={clarifyText}
            onChange={(e) => setClarifyText(e.target.value)}
            placeholder="What additional information do you need?"
            rows={2}
            className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-amber-600 dark:bg-neutral-800 dark:text-neutral-100"
            disabled={isSubmitting}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClarify}
              disabled={isSubmitting || !clarifyText.trim()}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Send Clarification Request
            </button>
            <button
              type="button"
              onClick={() => setShowClarify(false)}
              className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-700">
        {questionType !== 'confirm' && (
          <button
            type="submit"
            disabled={isSubmitting || !buildAnswer()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Answer'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowClarify(!showClarify)}
          disabled={isSubmitting}
          className="rounded-md border border-amber-300 px-3 py-2 text-sm text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-900/20"
        >
          Needs More Info
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={isSubmitting}
          className="ml-auto rounded-md px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-700"
        >
          Dismiss
        </button>
      </div>
    </form>
  );
}
