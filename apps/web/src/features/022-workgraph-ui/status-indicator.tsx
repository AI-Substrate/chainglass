/**
 * StatusIndicator Component - Phase 2 (T006)
 *
 * Visual indicator for WorkGraph node status.
 * Per AC-5: Status visualization with distinct visual treatments.
 *
 * Statuses:
 * - pending: Gray, no icon
 * - ready: Blue, play icon
 * - running: Yellow, spinning loader
 * - waiting-question: Purple, question mark
 * - blocked-error: Red, X icon
 * - complete: Green, checkmark
 *
 * @module features/022-workgraph-ui/status-indicator
 */

'use client';

import { cn } from '@/lib/utils';
import type { NodeStatus } from './workgraph-ui.types';

/**
 * Status indicator size variants.
 */
export type StatusIndicatorSize = 'sm' | 'md' | 'lg';

/**
 * Props for StatusIndicator component.
 */
export interface StatusIndicatorProps {
  /** Node status to display */
  status: NodeStatus;
  /** Size variant */
  size?: StatusIndicatorSize;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Color mapping for each status.
 */
const statusColors: Record<NodeStatus, string> = {
  pending: 'bg-gray-500',
  ready: 'bg-blue-500',
  running: 'bg-yellow-500',
  'waiting-question': 'bg-purple-500',
  'blocked-error': 'bg-red-500',
  complete: 'bg-green-500',
};

/**
 * Size classes for each size variant.
 */
const sizeClasses: Record<StatusIndicatorSize, { container: string; icon: string }> = {
  sm: { container: 'w-4 h-4', icon: 'w-2.5 h-2.5' },
  md: { container: 'w-6 h-6', icon: 'w-3.5 h-3.5' },
  lg: { container: 'w-8 h-8', icon: 'w-5 h-5' },
};

/**
 * Play icon for ready status.
 */
function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      data-testid="status-icon"
      className={className}
      fill="currentColor"
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * Spinner icon for running status.
 */
function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      data-testid="spinner-icon"
      className={cn(className, 'animate-spin')}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

/**
 * Question mark icon for waiting-question status.
 */
function QuestionIcon({ className }: { className?: string }) {
  return (
    <svg
      data-testid="question-icon"
      className={className}
      fill="currentColor"
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * X/Error icon for blocked-error status.
 */
function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg
      data-testid="error-icon"
      className={className}
      fill="currentColor"
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * Checkmark icon for complete status.
 */
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      data-testid="check-icon"
      className={className}
      fill="currentColor"
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * Get the icon component for a status.
 */
function getStatusIcon(status: NodeStatus, iconClassName: string): React.ReactNode {
  switch (status) {
    case 'ready':
      return <PlayIcon className={iconClassName} />;
    case 'running':
      return <SpinnerIcon className={iconClassName} />;
    case 'waiting-question':
      return <QuestionIcon className={iconClassName} />;
    case 'blocked-error':
      return <ErrorIcon className={iconClassName} />;
    case 'complete':
      return <CheckIcon className={iconClassName} />;
    default:
      return null;
  }
}

/**
 * Visual indicator for WorkGraph node status.
 *
 * Renders a colored circle with an optional icon based on status.
 * Supports size variants and custom className for composition.
 *
 * @example
 * ```tsx
 * <StatusIndicator status="running" size="md" />
 * <StatusIndicator status="complete" className="mr-2" />
 * ```
 */
export function StatusIndicator({
  status,
  size = 'md',
  className,
}: StatusIndicatorProps): React.ReactElement {
  const colorClass = statusColors[status];
  const { container: containerClass, icon: iconClass } = sizeClasses[size];
  const icon = getStatusIcon(status, cn(iconClass, 'text-white'));

  return (
    <div
      data-testid="status-indicator"
      className={cn(
        'inline-flex items-center justify-center rounded-full',
        containerClass,
        colorClass,
        className
      )}
    >
      {icon}
    </div>
  );
}
