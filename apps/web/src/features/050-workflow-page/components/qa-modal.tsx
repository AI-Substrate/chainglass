'use client';

/**
 * QAModal — Question/Answer modal for nodes in `waiting-question` status.
 *
 * Supports 4 question types (text, single, multi, confirm) with an
 * always-on freeform text area. Consumes the question protocol owned
 * by `_platform/positional-graph` — this modal only adds UX.
 *
 * Phase 5: Q&A + Node Properties Modal + Undo/Redo — Plan 050
 */

import type { NodeStatusResult } from '@chainglass/positional-graph';
import { useState } from 'react';

type PendingQuestion = NonNullable<NodeStatusResult['pendingQuestion']>;

export interface QAModalProps {
  question: PendingQuestion;
  nodeId: string;
  onAnswer: (answer: { structured: unknown; freeform: string }) => void;
  onClose: () => void;
}

export function QAModal({ question, nodeId, onAnswer, onClose }: QAModalProps) {
  const [freeform, setFreeform] = useState('');
  const [textValue, setTextValue] = useState(typeof question.options === 'undefined' ? '' : '');
  const [singleValue, setSingleValue] = useState<string>(question.options?.[0]?.key ?? '');
  const [multiValues, setMultiValues] = useState<Set<string>>(new Set());
  const [confirmValue, setConfirmValue] = useState<boolean | null>(null);

  const canSubmit = (() => {
    switch (question.questionType) {
      case 'text':
        return textValue.trim().length > 0 || freeform.trim().length > 0;
      case 'single':
        return singleValue.length > 0;
      case 'multi':
        return multiValues.size > 0;
      case 'confirm':
        return confirmValue !== null;
    }
  })();

  const handleSubmit = () => {
    if (!canSubmit) return;
    let structured: unknown;
    switch (question.questionType) {
      case 'text':
        structured = textValue || freeform;
        break;
      case 'single':
        structured = singleValue;
        break;
      case 'multi':
        structured = [...multiValues];
        break;
      case 'confirm':
        structured = confirmValue;
        break;
    }
    onAnswer({ structured, freeform });
  };

  const toggleMulti = (key: string) => {
    setMultiValues((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <dialog
      open
      data-testid="qa-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 m-0 p-0 w-full h-full border-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-violet-500 text-lg">?</span>
              <h2 className="text-base font-semibold tracking-tight">Question</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-muted-foreground/50 mt-1">Node: {nodeId}</p>
        </div>

        {/* Question text */}
        <div className="px-6 py-4">
          <p className="text-sm font-medium mb-4">{question.text}</p>

          {/* Structured input by type */}
          {question.questionType === 'text' && (
            <div data-testid="qa-text-input">
              <input
                type="text"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                placeholder="Type your answer..."
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400"
                // biome-ignore lint/a11y/noAutofocus: modal input should auto-focus
                autoFocus
              />
            </div>
          )}

          {question.questionType === 'single' && question.options && (
            <div className="space-y-2" data-testid="qa-single-input">
              {question.options.map((opt) => (
                <label
                  key={opt.key}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                    singleValue === opt.key
                      ? 'border-violet-400 bg-violet-50 dark:bg-violet-950'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <input
                    type="radio"
                    name={`qa-single-${question.questionId}`}
                    value={opt.key}
                    checked={singleValue === opt.key}
                    onChange={() => setSingleValue(opt.key)}
                    className="accent-violet-500"
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          )}

          {question.questionType === 'multi' && question.options && (
            <div className="space-y-2" data-testid="qa-multi-input">
              {question.options.map((opt) => (
                <label
                  key={opt.key}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                    multiValues.has(opt.key)
                      ? 'border-violet-400 bg-violet-50 dark:bg-violet-950'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={multiValues.has(opt.key)}
                    onChange={() => toggleMulti(opt.key)}
                    className="accent-violet-500"
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          )}

          {question.questionType === 'confirm' && (
            <div className="flex gap-3" data-testid="qa-confirm-input">
              <button
                type="button"
                onClick={() => setConfirmValue(true)}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  confirmValue === true
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmValue(false)}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  confirmValue === false
                    ? 'border-red-400 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                No
              </button>
            </div>
          )}

          {/* Always-on freeform text area */}
          <div className="mt-4" data-testid="qa-freeform">
            <label
              className="block text-xs font-medium text-muted-foreground/60 mb-1.5"
              htmlFor="qa-freeform-input"
            >
              Additional notes (optional)
            </label>
            <textarea
              id="qa-freeform-input"
              value={freeform}
              onChange={(e) => setFreeform(e.target.value)}
              placeholder="Add any additional context..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            data-testid="qa-submit"
            className="px-4 py-2 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Submit Answer
          </button>
        </div>
      </div>
    </dialog>
  );
}
