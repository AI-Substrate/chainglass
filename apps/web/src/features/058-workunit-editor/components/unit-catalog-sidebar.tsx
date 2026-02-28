'use client';

import type { WorkUnitSummary } from '@chainglass/positional-graph';
import Link from 'next/link';

interface UnitCatalogSidebarProps {
  workspaceSlug: string;
  units: WorkUnitSummary[];
  currentSlug: string;
}

const TYPE_COLORS: Record<string, string> = {
  agent: 'text-purple-500',
  code: 'text-green-500',
  'user-input': 'text-amber-500',
};

/**
 * Left sidebar showing all units for quick navigation.
 * Current unit is highlighted.
 */
export function UnitCatalogSidebar({ workspaceSlug, units, currentSlug }: UnitCatalogSidebarProps) {
  return (
    <div className="p-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Units
      </h3>
      <nav className="space-y-0.5">
        {units.map((unit) => (
          <Link
            key={unit.slug}
            href={`/workspaces/${workspaceSlug}/work-units/${unit.slug}`}
            className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
              unit.slug === currentSlug
                ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <span className={`text-xs ${TYPE_COLORS[unit.type] ?? ''}`}>●</span>
            <span className="font-mono text-xs truncate">{unit.slug}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
