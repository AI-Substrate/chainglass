/**
 * WorkUnitToolbox Component - Phase 3 (T003)
 *
 * Sidebar component that displays available WorkUnits grouped by type.
 * Users can drag units from this toolbox onto the canvas to add them to the graph.
 *
 * Per CD-09: Fetches units dynamically via API
 * Per DYK#1: Dropped nodes start as 'disconnected'
 *
 * @module features/022-workgraph-ui/workunit-toolbox
 */

'use client';

import { cn } from '@/lib/utils';
import type { WorkUnitSummary } from '@chainglass/workgraph';
import type React from 'react';
import { useEffect, useState } from 'react';

// ============================================
// Types
// ============================================

/**
 * Props for WorkUnitToolbox component.
 */
export interface WorkUnitToolboxProps {
  /** Workspace slug for API calls */
  workspaceSlug: string;
  /** Optional worktree path */
  worktreePath?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Grouped units by type.
 */
interface UnitGroups {
  agent: WorkUnitSummary[];
  'user-input': WorkUnitSummary[];
  code: WorkUnitSummary[];
}

/**
 * Drag data format for WorkUnit items.
 */
export interface WorkUnitDragData {
  unitSlug: string;
  unitType: 'agent' | 'user-input' | 'code';
}

/** MIME type for drag data */
export const WORKUNIT_DRAG_TYPE = 'application/workgraph-unit';

// ============================================
// Helper Functions
// ============================================

/**
 * Group units by their type.
 */
function groupUnitsByType(units: WorkUnitSummary[]): UnitGroups {
  const groups: UnitGroups = {
    agent: [],
    'user-input': [],
    code: [],
  };

  for (const unit of units) {
    if (unit.type in groups) {
      groups[unit.type].push(unit);
    }
  }

  return groups;
}

/**
 * Get human-readable label for unit type.
 */
function getTypeLabel(type: keyof UnitGroups): string {
  switch (type) {
    case 'agent':
      return 'Agent Units';
    case 'user-input':
      return 'User Input Units';
    case 'code':
      return 'Code Units';
    default:
      return type;
  }
}

/**
 * Get icon for unit type.
 */
function TypeIcon({ type, className }: { type: keyof UnitGroups; className?: string }) {
  switch (type) {
    case 'agent':
      return (
        <svg
          className={className}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      );
    case 'user-input':
      return (
        <svg
          className={className}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
          />
        </svg>
      );
    case 'code':
      return (
        <svg
          className={className}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
          />
        </svg>
      );
    default:
      return null;
  }
}

// ============================================
// Component
// ============================================

/**
 * WorkUnitToolbox - Sidebar with draggable WorkUnit items.
 *
 * Fetches available units from the API and displays them grouped by type.
 * Each unit item is draggable and can be dropped onto the canvas.
 *
 * @example
 * ```tsx
 * <WorkUnitToolbox
 *   workspaceSlug="my-workspace"
 *   className="w-64"
 * />
 * ```
 */
export function WorkUnitToolbox({
  workspaceSlug,
  worktreePath,
  className,
}: WorkUnitToolboxProps): React.ReactElement {
  const [units, setUnits] = useState<WorkUnitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch units on mount and when workspaceSlug changes
  useEffect(() => {
    async function fetchUnits() {
      setLoading(true);
      setError(null);

      try {
        const url = new URL(`/api/workspaces/${workspaceSlug}/units`, window.location.origin);
        if (worktreePath) {
          url.searchParams.set('worktree', worktreePath);
        }

        const response = await fetch(url.toString());
        const data = await response.json();

        if (!response.ok || (data.errors && data.errors.length > 0)) {
          setError(data.errors?.[0]?.message ?? 'Failed to load units');
          setUnits([]);
        } else {
          setUnits(data.units ?? []);
        }
      } catch (err) {
        setError('Failed to load units');
        setUnits([]);
      } finally {
        setLoading(false);
      }
    }

    fetchUnits();
  }, [workspaceSlug, worktreePath]);

  // Handle drag start - set transfer data
  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, unit: WorkUnitSummary): void => {
    const dragData: WorkUnitDragData = {
      unitSlug: unit.slug,
      unitType: unit.type,
    };
    event.dataTransfer.setData(WORKUNIT_DRAG_TYPE, JSON.stringify(dragData));
    event.dataTransfer.effectAllowed = 'copy';
  };

  // Group units
  const groups = groupUnitsByType(units);

  // Loading state
  if (loading) {
    return (
      <section
        data-testid="workunit-toolbox"
        aria-label="WorkUnit Toolbox"
        className={cn('flex flex-col p-4', className)}
      >
        <div data-testid="toolbox-loading" className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      </section>
    );
  }

  // Error state
  if (error) {
    return (
      <section
        data-testid="workunit-toolbox"
        aria-label="WorkUnit Toolbox"
        className={cn('flex flex-col p-4', className)}
      >
        <div
          data-testid="toolbox-error"
          className="text-destructive text-sm p-4 bg-destructive/10 rounded-md"
        >
          {error}
        </div>
      </section>
    );
  }

  // Empty state
  if (units.length === 0) {
    return (
      <section
        data-testid="workunit-toolbox"
        aria-label="WorkUnit Toolbox"
        className={cn('flex flex-col p-4', className)}
      >
        <div data-testid="toolbox-empty" className="text-muted-foreground text-sm text-center py-8">
          No WorkUnits available
        </div>
      </section>
    );
  }

  // Render grouped units
  return (
    <section
      data-testid="workunit-toolbox"
      aria-label="WorkUnit Toolbox"
      className={cn('flex flex-col gap-4 p-4 overflow-y-auto', className)}
    >
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        WorkUnits
      </h2>

      {/* Render each group */}
      {(['agent', 'user-input', 'code'] as const).map((type) => {
        const groupUnits = groups[type];
        if (groupUnits.length === 0) return null;

        return (
          <div key={type} data-testid={`group-${type}`} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <TypeIcon type={type} className="w-4 h-4" />
              <span>{getTypeLabel(type)}</span>
            </div>

            <div className="flex flex-col gap-1">
              {groupUnits.map((unit) => (
                <div
                  key={unit.slug}
                  data-testid={`unit-item-${unit.slug}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, unit)}
                  className={cn(
                    'flex flex-col gap-1 p-2 rounded-md',
                    'bg-card border cursor-grab',
                    'hover:bg-accent hover:border-accent-foreground/20',
                    'active:cursor-grabbing'
                  )}
                >
                  <span className="text-sm font-medium">{unit.slug}</span>
                  {unit.description && (
                    <span className="text-xs text-muted-foreground line-clamp-2">
                      {unit.description}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
