'use client';

/**
 * WorkUnitToolbox — Right sidebar showing available work units grouped by type.
 * Items are draggable into the workflow canvas via dnd-kit.
 *
 * Phase 2+3 — Plan 050
 */

import type { WorkUnitSummary } from '@chainglass/positional-graph';
import { useDraggable } from '@dnd-kit/core';
import { useState } from 'react';
import type { ToolboxDragData } from '../types';

const TYPE_ICONS: Record<string, string> = {
  agent: '🤖',
  code: '⚙️',
  'user-input': '👤',
};

const TYPE_LABELS: Record<string, string> = {
  agent: 'Agents',
  code: 'Code',
  'user-input': 'Human Input',
};

const TYPE_ORDER = ['agent', 'code', 'user-input'] as const;

function DraggableUnit({ unit }: { unit: WorkUnitSummary }) {
  const dragData: ToolboxDragData = {
    type: 'toolbox-unit',
    unitSlug: unit.slug,
    unitType: unit.type,
  };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `toolbox-${unit.slug}`,
    data: dragData,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-testid={`toolbox-unit-${unit.slug}`}
      style={{ touchAction: 'none' }}
      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800 hover:bg-blue-50/50 dark:hover:bg-gray-700/50 hover:border-gray-400 dark:hover:border-gray-500 hover:shadow-sm transition-all duration-150 cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-40 scale-95' : ''
      }`}
    >
      <span className="text-sm">{TYPE_ICONS[unit.type]}</span>
      <span className="truncate font-medium text-foreground/80 text-sm">{unit.slug}</span>
    </div>
  );
}

export interface WorkUnitToolboxProps {
  units: WorkUnitSummary[];
  isDragging?: boolean;
}

export function WorkUnitToolbox({ units }: WorkUnitToolboxProps) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = search
    ? units.filter((u) => u.slug.toLowerCase().includes(search.toLowerCase()))
    : units;

  const grouped = TYPE_ORDER.map((type) => ({
    type,
    label: TYPE_LABELS[type],
    icon: TYPE_ICONS[type],
    items: filtered.filter((u) => u.type === type),
  }));

  return (
    <div data-testid="work-unit-toolbox" className="flex flex-col h-full p-4 gap-3">
      <h3 className="text-sm font-semibold tracking-tight text-foreground/80">Work Units</h3>

      <input
        type="text"
        placeholder="Search..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/30 transition-all"
        data-testid="toolbox-search"
      />

      {units.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-4" data-testid="toolbox-empty">
          No work units found.
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-4">
          No matches for &quot;{search}&quot;
        </div>
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto">
          {grouped.map((group) => (
            <div key={group.type}>
              <button
                type="button"
                onClick={() =>
                  setCollapsed((prev) => ({ ...prev, [group.type]: !prev[group.type] }))
                }
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 w-full text-left py-2 hover:text-muted-foreground transition-colors"
                data-testid={`toolbox-group-${group.type}`}
              >
                <span className="text-[9px]">{collapsed[group.type] ? '▸' : '▾'}</span>
                <span>{group.icon}</span>
                <span>
                  {group.label} ({group.items.length})
                </span>
              </button>
              {!collapsed[group.type] && (
                <div className="flex flex-col gap-1.5 ml-4 mt-1">
                  {group.items.map((unit) => (
                    <DraggableUnit key={unit.slug} unit={unit} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
