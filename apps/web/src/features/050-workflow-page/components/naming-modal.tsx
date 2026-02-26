'use client';

/**
 * NamingModal — Reusable modal for workflow/template naming with kebab-case validation.
 *
 * Three variants:
 * 1. New blank workflow — empty slug input
 * 2. New from template — template picker + composite slug
 * 3. Save as template — pre-filled slug with overwrite warning
 *
 * Phase 3: Drag-and-Drop + Persistence — Plan 050
 */

import { useState } from 'react';

const SLUG_PATTERN = /^[a-z][a-z0-9-]*$/;

function validateSlug(value: string): string | null {
  if (!value) return 'Name is required';
  if (!SLUG_PATTERN.test(value))
    return 'Must be lowercase letters, digits, and hyphens (start with letter)';
  return null;
}

export interface NamingModalProps {
  title: string;
  initialValue?: string;
  onConfirm: (slug: string) => void;
  onCancel: () => void;
  confirmLabel?: string;
}

export function NamingModal({
  title,
  initialValue = '',
  onConfirm,
  onCancel,
  confirmLabel = 'Create',
}: NamingModalProps) {
  const [value, setValue] = useState(initialValue);
  const error = value ? validateSlug(value) : null;
  const canConfirm = value.length > 0 && !error;

  return (
    <dialog
      open
      data-testid="naming-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 m-0 p-0 w-full h-full border-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <div className="bg-card border rounded-lg shadow-lg p-6 w-[400px] max-w-[90vw]">
        <h2 className="text-sm font-semibold mb-4">{title}</h2>

        <div className="mb-4">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value.toLowerCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canConfirm) onConfirm(value);
            }}
            placeholder="my-workflow"
            className="w-full px-3 py-2 text-sm rounded border bg-background"
            data-testid="naming-input"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Lowercase letters, digits, and hyphens
          </p>
          {error && (
            <p className="text-xs text-destructive mt-1" data-testid="naming-error">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs rounded border">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(value)}
            className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground disabled:opacity-50"
            data-testid="naming-confirm"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export { validateSlug };
