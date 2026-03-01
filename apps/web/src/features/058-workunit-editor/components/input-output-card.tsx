'use client';

import { cn } from '@/lib/utils';
import type { WorkUnitInput } from '@chainglass/positional-graph';
import { ChevronRight, GripVertical, Lock, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';

/** Card item with synthetic client ID for SortableContext. */
export interface InputOutputItem extends WorkUnitInput {
  _clientId: string;
}

/** Validation error for a specific field. */
export interface FieldValidationError {
  field: string;
  message: string;
}

interface InputOutputCardProps {
  item: InputOutputItem;
  expanded: boolean;
  onToggleExpand: () => void;
  onChange: (updated: InputOutputItem) => void;
  onDelete?: () => void;
  /** Whether this is a reserved/locked param (display-only). */
  locked?: boolean;
  /** Whether delete is blocked (e.g. last output). */
  deleteBlocked?: boolean;
  /** Validation errors for this card's fields. */
  errors?: FieldValidationError[];
  /** Ref callback for dnd-kit sortable node. */
  sortableRef?: (node: HTMLElement | null) => void;
  /** Ref callback for drag handle activator (dnd-kit v10). */
  activatorRef?: (node: HTMLElement | null) => void;
  /** dnd-kit sortable style. */
  sortableStyle?: React.CSSProperties;
  /** dnd-kit listeners for the drag handle. */
  dragListeners?: Record<string, unknown>;
  /** Whether the card is currently being dragged. */
  isDragging?: boolean;
}

const TYPE_OPTIONS = [
  { value: 'data', label: 'Data' },
  { value: 'file', label: 'File' },
] as const;

const DATA_TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'json', label: 'JSON' },
] as const;

function getFieldError(errors: FieldValidationError[] | undefined, field: string) {
  return errors?.find((e) => e.field === field);
}

/**
 * Expandable card for a single input/output definition.
 *
 * Collapsed: shows name, type badge, required indicator, drag handle, delete.
 * Expanded: form with name, type, data_type (conditional), required, description.
 *
 * ARIA: adapt from ToolCallCard pattern (aria-expanded, aria-controls, ChevronRight rotate-90).
 * Plan 058, Phase 3, T001.
 */
export function InputOutputCard({
  item,
  expanded,
  onToggleExpand,
  onChange,
  onDelete,
  locked = false,
  deleteBlocked = false,
  errors,
  sortableRef,
  activatorRef,
  sortableStyle,
  dragListeners,
  isDragging = false,
}: InputOutputCardProps) {
  const generatedId = useId();
  const panelId = `io-panel-${generatedId}`;
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const nameError = getFieldError(errors, 'name');
  const dataTypeError = getFieldError(errors, 'data_type');

  return (
    <div
      ref={sortableRef}
      style={sortableStyle}
      data-sortable="true"
      data-dragging={isDragging}
      className={cn(
        'border rounded-md bg-white dark:bg-gray-900 transition-shadow',
        isDragging && 'opacity-50 shadow-lg',
        locked && 'opacity-60 bg-gray-50 dark:bg-gray-800/50'
      )}
    >
      {/* Collapsed header — click to expand */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        {/* Drag handle — only for non-locked cards */}
        {!locked ? (
          <button
            type="button"
            ref={activatorRef}
            className="cursor-grab text-muted-foreground hover:text-foreground shrink-0 p-0.5"
            aria-label="Drag to reorder"
            tabIndex={-1}
            {...(dragListeners as React.HTMLAttributes<HTMLButtonElement>)}
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : (
          <span className="shrink-0 p-0.5 text-muted-foreground">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}

        {/* Expand/collapse toggle */}
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          aria-controls={panelId}
          disabled={locked}
          className={cn(
            'flex-1 flex items-center gap-2 text-left min-w-0',
            'hover:bg-muted/30 rounded px-1 py-0.5 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            locked && 'cursor-default hover:bg-transparent'
          )}
        >
          {!locked && (
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0',
                expanded && 'rotate-90'
              )}
              aria-hidden="true"
            />
          )}

          {/* Name */}
          <span
            className={cn(
              'text-sm font-medium truncate',
              !item.name && 'text-muted-foreground italic'
            )}
          >
            {item.name || 'unnamed'}
          </span>

          {/* Type badge */}
          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
            {item.type}
          </span>

          {/* Required indicator */}
          {item.required && (
            <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">req</span>
          )}
        </button>

        {/* Delete button with confirmation */}
        {!locked && onDelete && !confirmingDelete && (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={deleteBlocked}
            className={cn(
              'opacity-0 group-hover/card:opacity-100 focus:opacity-100 transition-opacity',
              'text-muted-foreground hover:text-red-500 p-0.5 shrink-0',
              deleteBlocked && 'cursor-not-allowed opacity-30'
            )}
            aria-label={deleteBlocked ? 'Cannot delete last output' : 'Delete'}
            title={deleteBlocked ? 'At least one output is required' : 'Delete'}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        {!locked && onDelete && confirmingDelete && (
          <span className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                onDelete();
                setConfirmingDelete(false);
              }}
              className="text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="text-xs px-1.5 py-0.5 rounded text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
          </span>
        )}
      </div>

      {/* Expandable form panel */}
      {expanded && !locked && (
        <div id={panelId} className="px-3 pb-3 pt-1 border-t border-border/50 space-y-3">
          {/* Name field */}
          <div>
            <label htmlFor={`${generatedId}-name`} className="block text-xs font-medium mb-1">
              Name
            </label>
            <input
              id={`${generatedId}-name`}
              value={item.name}
              onChange={(e) => onChange({ ...item, name: e.target.value.toLowerCase() })}
              placeholder="parameter_name"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={cn(
                'w-full rounded border px-2 py-1 text-sm bg-white dark:bg-gray-800',
                nameError
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-300 dark:border-gray-600'
              )}
            />
            {nameError && <p className="text-xs text-red-500 mt-0.5">{nameError.message}</p>}
          </div>

          {/* Type select */}
          <div>
            <label htmlFor={`${generatedId}-type`} className="block text-xs font-medium mb-1">
              Type
            </label>
            <select
              id={`${generatedId}-type`}
              value={item.type}
              onChange={(e) => {
                const newType = e.target.value as 'data' | 'file';
                onChange({
                  ...item,
                  type: newType,
                  // Clear data_type when switching to file
                  data_type: newType === 'file' ? undefined : (item.data_type ?? 'text'),
                });
              }}
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Data type select — shown only when type='data' */}
          {item.type === 'data' && (
            <div>
              <label htmlFor={`${generatedId}-datatype`} className="block text-xs font-medium mb-1">
                Data Type
              </label>
              <select
                id={`${generatedId}-datatype`}
                value={item.data_type ?? 'text'}
                onChange={(e) =>
                  onChange({
                    ...item,
                    data_type: e.target.value as 'text' | 'number' | 'boolean' | 'json',
                  })
                }
                className={cn(
                  'w-full rounded border px-2 py-1 text-sm bg-white dark:bg-gray-800',
                  dataTypeError
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-gray-300 dark:border-gray-600'
                )}
              >
                {DATA_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {dataTypeError && (
                <p className="text-xs text-red-500 mt-0.5">{dataTypeError.message}</p>
              )}
            </div>
          )}

          {/* Required checkbox */}
          <div className="flex items-center gap-2">
            <input
              id={`${generatedId}-required`}
              type="checkbox"
              checked={item.required}
              onChange={(e) => onChange({ ...item, required: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            <label htmlFor={`${generatedId}-required`} className="text-xs font-medium">
              Required
            </label>
          </div>

          {/* Description */}
          <div>
            <label htmlFor={`${generatedId}-desc`} className="block text-xs font-medium mb-1">
              Description
            </label>
            <input
              id={`${generatedId}-desc`}
              value={item.description ?? ''}
              onChange={(e) => onChange({ ...item, description: e.target.value || undefined })}
              placeholder="Optional description"
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
            />
          </div>
        </div>
      )}

      {/* Hidden panel target for aria-controls when collapsed */}
      {(!expanded || locked) && <div id={panelId} className="hidden" aria-hidden="true" />}
    </div>
  );
}
