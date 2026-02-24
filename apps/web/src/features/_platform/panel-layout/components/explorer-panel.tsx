'use client';

/**
 * ExplorerPanel — Top utility bar with composable input handler chain.
 *
 * Displays the current file path with a copy button. Clicking the path
 * enters edit mode where typing a path and pressing Enter triggers a
 * handler chain. Supports forwardRef for Ctrl+P integration.
 *
 * Phase 1: Panel Infrastructure — Plan 043
 * DYK-03: ASCII spinner during handler processing
 * DYK-04: forwardRef + useImperativeHandle for focusInput()
 */

import { ClipboardCopy } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

import type { BarContext, BarHandler, ExplorerPanelHandle } from '../types';

export interface ExplorerPanelProps {
  filePath: string;
  handlers: BarHandler[];
  context: BarContext;
  onCopy: () => void;
  placeholder?: string;
}

const SPINNER_FRAMES = ['|', '/', '—', '\\'];
const SPINNER_INTERVAL = 80;

export const ExplorerPanel = forwardRef<ExplorerPanelHandle, ExplorerPanelProps>(
  function ExplorerPanel({ filePath, handlers, context, onCopy, placeholder }, ref) {
    const [editing, setEditing] = useState(false);
    const [inputValue, setInputValue] = useState(filePath);
    const [processing, setProcessing] = useState(false);
    const [spinnerFrame, setSpinnerFrame] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const prevFilePathRef = useRef(filePath);

    // Sync: when filePath changes externally, exit edit mode and update input value
    useEffect(() => {
      if (filePath !== prevFilePathRef.current) {
        prevFilePathRef.current = filePath;
        if (!processing) {
          setEditing(false);
        }
        setInputValue(filePath);
      }
    }, [filePath, processing]);

    // ASCII spinner animation
    useEffect(() => {
      if (!processing) return;
      const id = setInterval(() => {
        setSpinnerFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
      }, SPINNER_INTERVAL);
      return () => clearInterval(id);
    }, [processing]);

    // Expose focusInput for Ctrl+P
    useImperativeHandle(ref, () => ({
      focusInput: () => {
        setEditing(true);
        setInputValue(filePath);
        // Focus after state update
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 0);
      },
    }));

    const enterEditMode = useCallback(() => {
      setEditing(true);
      setInputValue(filePath);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }, [filePath]);

    const exitEditMode = useCallback(() => {
      setEditing(false);
      setInputValue(filePath);
    }, [filePath]);

    const handleKeyDown = useCallback(
      async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
          exitEditMode();
          return;
        }

        if (e.key === 'Enter') {
          e.preventDefault();
          const value = inputValue.trim();
          if (!value) return;

          setProcessing(true);
          try {
            for (const handler of handlers) {
              const handled = await handler(value, context);
              if (handled) {
                setEditing(false);
                return;
              }
            }
            // No handler matched
            context.showError(`Not found: ${value}`);
          } finally {
            setProcessing(false);
          }
        }
      },
      [inputValue, handlers, context, exitEditMode]
    );

    const handleBlur = useCallback(() => {
      if (!processing) {
        exitEditMode();
      }
    }, [processing, exitEditMode]);

    // Always show input when no file path (placeholder mode)
    const showInput = editing || !filePath;

    return (
      <div className="flex items-center gap-1.5 border-b px-3 py-1.5 bg-muted/30 shrink-0">
        {processing ? (
          <span className="shrink-0 w-5 text-center font-mono text-sm text-muted-foreground">
            {SPINNER_FRAMES[spinnerFrame]}
          </span>
        ) : (
          <button
            type="button"
            onClick={onCopy}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Copy file path"
            disabled={!filePath}
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
          </button>
        )}

        {showInput ? (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={placeholder}
            className="flex-1 bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground"
            aria-label="File path"
          />
        ) : (
          <button
            type="button"
            onClick={enterEditMode}
            className="flex-1 text-left font-mono text-sm text-muted-foreground truncate"
          >
            {filePath}
          </button>
        )}
      </div>
    );
  }
);
