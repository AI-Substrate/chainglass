/**
 * StatusBadge - Displays status with color and icon
 *
 * Shared component for showing PhaseRunStatus (7 values) and RunStatus (4 values)
 * across WorkflowCard, RunRow, PhaseNode, and detail panels.
 *
 * @see Plan 011: UI Mockups
 */

import {
  AlertCircle,
  CheckCircle,
  Circle,
  Clock,
  FileText,
  Loader2,
  Pause,
  ThumbsUp,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { PhaseRunStatus, PhaseStatus, RunStatus } from '@/data/fixtures/workflows.fixture';

/**
 * Status configuration with colors and icons
 * Based on Plan 010 PhaseRunStatus enum (7 values) + 'defined' for templates
 */
export const STATUS_CONFIG: Record<
  PhaseStatus,
  {
    label: string;
    bgColor: string;
    textColor: string;
    borderColor: string;
    dotColor: string;
    Icon: LucideIcon;
  }
> = {
  defined: {
    label: 'Defined',
    bgColor: 'bg-slate-100 dark:bg-slate-800',
    textColor: 'text-slate-600 dark:text-slate-400',
    borderColor: 'border-slate-300 dark:border-slate-600',
    dotColor: 'bg-slate-400',
    Icon: FileText,
  },
  pending: {
    label: 'Pending',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    textColor: 'text-gray-700 dark:text-gray-300',
    borderColor: 'border-gray-300 dark:border-gray-600',
    dotColor: 'bg-gray-500',
    Icon: Circle,
  },
  ready: {
    label: 'Ready',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    textColor: 'text-amber-700 dark:text-amber-300',
    borderColor: 'border-amber-300 dark:border-amber-600',
    dotColor: 'bg-amber-500',
    Icon: Clock,
  },
  active: {
    label: 'Active',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    textColor: 'text-blue-700 dark:text-blue-300',
    borderColor: 'border-blue-300 dark:border-blue-600',
    dotColor: 'bg-blue-500',
    Icon: Loader2,
  },
  blocked: {
    label: 'Needs Input',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    textColor: 'text-orange-700 dark:text-orange-300',
    borderColor: 'border-orange-300 dark:border-orange-600',
    dotColor: 'bg-orange-500',
    Icon: Pause,
  },
  accepted: {
    label: 'Accepted',
    bgColor: 'bg-lime-100 dark:bg-lime-900/30',
    textColor: 'text-lime-700 dark:text-lime-300',
    borderColor: 'border-lime-300 dark:border-lime-600',
    dotColor: 'bg-lime-500',
    Icon: ThumbsUp,
  },
  complete: {
    label: 'Complete',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    textColor: 'text-emerald-700 dark:text-emerald-300',
    borderColor: 'border-emerald-300 dark:border-emerald-600',
    dotColor: 'bg-emerald-500',
    Icon: CheckCircle,
  },
  failed: {
    label: 'Failed',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    textColor: 'text-red-700 dark:text-red-300',
    borderColor: 'border-red-300 dark:border-red-600',
    dotColor: 'bg-red-500',
    Icon: XCircle,
  },
};

/**
 * Map RunStatus (4 values) to PhaseRunStatus for display
 */
export function mapRunStatus(status: RunStatus): PhaseRunStatus {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'active':
      return 'active';
    case 'complete':
      return 'complete';
    case 'failed':
      return 'failed';
  }
}

/**
 * Badge variant sizes
 */
export type BadgeSize = 'sm' | 'md' | 'lg';

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'text-xs px-1.5 py-0.5 gap-1',
  md: 'text-sm px-2 py-0.5 gap-1.5',
  lg: 'text-base px-3 py-1 gap-2',
};

const iconSizes: Record<BadgeSize, string> = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

export interface StatusBadgeProps {
  /** Status value (PhaseStatus or RunStatus) */
  status: PhaseStatus | RunStatus;
  /** Badge size variant */
  size?: BadgeSize;
  /** Show icon with label */
  showIcon?: boolean;
  /** Show only dot indicator */
  dotOnly?: boolean;
  /** Additional class names */
  className?: string;
  /** Animate active/blocked states */
  animate?: boolean;
}

/**
 * StatusBadge displays a status with appropriate color and optional icon.
 *
 * @example
 * // Full badge with icon
 * <StatusBadge status="active" showIcon />
 *
 * // Small dot only
 * <StatusBadge status="blocked" dotOnly size="sm" />
 *
 * // Large badge for headers
 * <StatusBadge status="complete" size="lg" showIcon />
 */
export function StatusBadge({
  status,
  size = 'md',
  showIcon = false,
  dotOnly = false,
  className,
  animate = true,
}: StatusBadgeProps) {
  // Map RunStatus to PhaseStatus if needed
  const phaseStatus: PhaseStatus =
    status === 'pending' || status === 'active' || status === 'complete' || status === 'failed'
      ? mapRunStatus(status as RunStatus)
      : (status as PhaseStatus);

  const config = STATUS_CONFIG[phaseStatus];
  const { Icon, label, bgColor, textColor, borderColor, dotColor } = config;

  // Dot only mode - just show colored circle
  if (dotOnly) {
    return (
      <span
        className={cn(
          'inline-block rounded-full',
          dotColor,
          size === 'sm' ? 'h-2 w-2' : size === 'md' ? 'h-2.5 w-2.5' : 'h-3 w-3',
          animate && (phaseStatus === 'active' || phaseStatus === 'blocked') && 'animate-pulse',
          className
        )}
        title={label}
        aria-label={label}
      />
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        sizeClasses[size],
        bgColor,
        textColor,
        borderColor,
        className
      )}
    >
      {showIcon && (
        <Icon
          className={cn(
            iconSizes[size],
            animate && phaseStatus === 'active' && 'animate-spin',
            animate && phaseStatus === 'blocked' && 'animate-pulse'
          )}
          aria-hidden
        />
      )}
      <span>{label}</span>
    </span>
  );
}
