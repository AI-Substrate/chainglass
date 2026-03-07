'use client';

import { useEffect, useRef, useState } from 'react';
import { validateFileName } from '../lib/validate-filename';

export interface InlineEditInputProps {
  /** Pre-filled value for rename mode */
  initialValue?: string;
  /** Placeholder text when input is empty */
  placeholder?: string;
  /** Called when user confirms (Enter or blur-commit) with a valid name */
  onConfirm: (value: string) => void;
  /** Called when user cancels (Escape or blur-cancel) */
  onCancel: () => void;
  /** If true, blur commits the value (for rename). If false, blur cancels (for create). Default: false */
  commitOnBlur?: boolean;
  /** Whether to select all text on mount (for rename pre-fill) */
  selectOnMount?: boolean;
}

/**
 * Inline text input for file/folder creation and rename in the FileTree.
 *
 * - Auto-focuses on mount (via requestAnimationFrame to avoid Radix focus race)
 * - Validates name on every keystroke via validateFileName()
 * - Enter confirms, Escape cancels
 * - Blur behavior is configurable (commit for rename, cancel for create)
 * - Shows inline error message for invalid names
 *
 * Plan 068 Phase 2 — DYK-P2-01, DYK-P2-03
 */
export function InlineEditInput({
  initialValue = '',
  placeholder = 'Name',
  onConfirm,
  onCancel,
  commitOnBlur = false,
  selectOnMount = false,
}: InlineEditInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  // Track whether we've already committed/cancelled to avoid double-fire
  const settledRef = useRef(false);

  // Auto-focus on mount — use requestAnimationFrame to win the race
  // against Radix ContextMenu's focus restore (DYK-P2-01)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const input = inputRef.current;
      if (input) {
        input.focus();
        if (selectOnMount && initialValue) {
          input.select();
        }
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [selectOnMount, initialValue]);

  const validate = (name: string): boolean => {
    const result = validateFileName(name);
    if (!result.ok) {
      switch (result.error) {
        case 'empty':
          setError('Name cannot be empty');
          break;
        case 'reserved':
          setError(`"${name}" is a reserved name`);
          break;
        case 'invalid-char':
          setError(`Character "${result.char}" is not allowed`);
          break;
      }
      return false;
    }
    setError(null);
    return true;
  };

  const handleConfirm = () => {
    if (settledRef.current) return;
    const trimmed = value.trim();
    if (!validate(trimmed)) return;
    settledRef.current = true;
    onConfirm(trimmed);
  };

  const handleCancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleCancel();
    }
  };

  const handleBlur = () => {
    if (settledRef.current) return;
    if (commitOnBlur) {
      const trimmed = value.trim();
      if (trimmed && validate(trimmed)) {
        handleConfirm();
      } else {
        handleCancel();
      }
    } else {
      handleCancel();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    // Validate on change but don't block typing — just show/clear error
    if (newValue.trim().length > 0) {
      validate(newValue);
    } else {
      setError(null);
    }
  };

  return (
    <div className="flex flex-col">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="h-6 w-full min-w-0 flex-1 rounded-sm border border-ring bg-background px-1 text-sm outline-none focus:ring-1 focus:ring-ring"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'inline-edit-error' : undefined}
      />
      {error && (
        <span id="inline-edit-error" className="mt-0.5 text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
