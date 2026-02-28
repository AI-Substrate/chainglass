'use client';

import Link from 'next/link';
import { useState } from 'react';
import { UnitCreationModal } from './unit-creation-modal';

interface UnitSummary {
  slug: string;
  type: 'agent' | 'code' | 'user-input';
  version: string;
}

interface UnitListProps {
  workspaceSlug: string;
  units: UnitSummary[];
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  agent: {
    label: 'Agent',
    color: 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300',
  },
  code: {
    label: 'Code',
    color: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
  },
  'user-input': {
    label: 'Input',
    color: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300',
  },
};

/**
 * Work unit catalog list — grouped by type with create button.
 * Click navigates to editor. Server Component loads data, this renders.
 */
export function UnitList({ workspaceSlug, units }: UnitListProps) {
  const [showCreate, setShowCreate] = useState(false);

  // Group by type
  const grouped = {
    agent: units.filter((u) => u.type === 'agent'),
    code: units.filter((u) => u.type === 'code'),
    'user-input': units.filter((u) => u.type === 'user-input'),
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Work Units</h1>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          Create Unit
        </button>
      </div>

      {units.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg mb-2">No work units yet</p>
          <p className="text-sm">Create your first unit to get started.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {(['agent', 'code', 'user-input'] as const).map((type) => {
            const items = grouped[type];
            if (items.length === 0) return null;
            const typeInfo = TYPE_LABELS[type];

            return (
              <div key={type}>
                <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                  {typeInfo.label} ({items.length})
                </h2>
                <div className="grid gap-2">
                  {items.map((unit) => (
                    <Link
                      key={unit.slug}
                      href={`/workspaces/${workspaceSlug}/work-units/${unit.slug}`}
                      className="flex items-center gap-3 p-3 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <span className={`text-xs px-2 py-0.5 rounded ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                      <span className="font-mono text-sm">{unit.slug}</span>
                      <span className="text-xs text-muted-foreground ml-auto">v{unit.version}</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <UnitCreationModal
        workspaceSlug={workspaceSlug}
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </div>
  );
}
