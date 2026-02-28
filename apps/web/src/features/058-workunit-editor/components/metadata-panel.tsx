'use client';

import { useAutoSave } from '@/features/_platform/hooks/use-auto-save';
import { useCallback, useState } from 'react';
import { updateUnit } from '../../../../app/actions/workunit-actions';
import { SaveIndicator } from './save-indicator';

interface MetadataPanelProps {
  workspaceSlug: string;
  unitSlug: string;
  unitType: 'agent' | 'code' | 'user-input';
  initialDescription: string;
  initialVersion: string;
}

/**
 * Right-panel metadata editor — description and version fields.
 * Uses useAutoSave with immediate (0ms) debounce for instant persistence.
 */
export function MetadataPanel({
  workspaceSlug,
  unitSlug,
  unitType,
  initialDescription,
  initialVersion,
}: MetadataPanelProps) {
  const [description, setDescription] = useState(initialDescription);
  const [version, setVersion] = useState(initialVersion);

  const saveFn = useCallback(
    (value: string) => {
      const patch = JSON.parse(value);
      return updateUnit(workspaceSlug, unitSlug, patch);
    },
    [workspaceSlug, unitSlug]
  );

  const { status, error, trigger } = useAutoSave(saveFn, { delay: 0 });

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setDescription(val);
      trigger(JSON.stringify({ description: val }));
    },
    [trigger]
  );

  const handleVersionChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setVersion(val);
      trigger(JSON.stringify({ version: val }));
    },
    [trigger]
  );

  const TYPE_LABELS: Record<string, string> = {
    agent: 'Agent',
    code: 'Code',
    'user-input': 'User Input',
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-3">Metadata</h3>
        <SaveIndicator status={status} error={error} />
      </div>

      {/* Unit type badge */}
      <div>
        <span className="block text-xs font-medium text-muted-foreground mb-1">Type</span>
        <span className="inline-block text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
          {TYPE_LABELS[unitType] ?? unitType}
        </span>
      </div>

      {/* Slug (read-only) */}
      <div>
        <span className="block text-xs font-medium text-muted-foreground mb-1">Slug</span>
        <span className="text-sm font-mono">{unitSlug}</span>
      </div>

      {/* Version */}
      <div>
        <label
          htmlFor="unit-version"
          className="block text-xs font-medium text-muted-foreground mb-1"
        >
          Version
        </label>
        <input
          id="unit-version"
          value={version}
          onChange={handleVersionChange}
          className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm"
          placeholder="1.0.0"
        />
      </div>

      {/* Description */}
      <div>
        <label
          htmlFor="unit-description"
          className="block text-xs font-medium text-muted-foreground mb-1"
        >
          Description
        </label>
        <textarea
          id="unit-description"
          value={description}
          onChange={handleDescriptionChange}
          rows={4}
          className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm"
          placeholder="Describe what this unit does..."
        />
      </div>
    </div>
  );
}
