'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { createUnit } from '../../../../app/actions/workunit-actions';

interface UnitCreationModalProps {
  workspaceSlug: string;
  open: boolean;
  onClose: () => void;
}

const UNIT_TYPES = [
  { type: 'agent' as const, label: 'Agent', description: 'Prompt template for AI agents' },
  { type: 'code' as const, label: 'Code', description: 'Script to execute (bash, python, etc.)' },
  {
    type: 'user-input' as const,
    label: 'User Input',
    description: 'Question for human input during workflow execution',
  },
];

const SLUG_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Modal for creating new work units — type picker + slug naming.
 * Per W002 + clarification Q6: scaffold with boilerplate.
 */
export function UnitCreationModal({ workspaceSlug, open, onClose }: UnitCreationModalProps) {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<'agent' | 'code' | 'user-input' | null>(null);
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const slugValid = SLUG_PATTERN.test(slug);

  const handleCreate = useCallback(async () => {
    if (!selectedType || !slugValid) return;
    setCreating(true);
    setError(null);

    const result = await createUnit(workspaceSlug, {
      slug,
      type: selectedType,
      description: description || undefined,
    });

    if (result.errors.length > 0) {
      setError(result.errors[0].message);
      setCreating(false);
      return;
    }

    onClose();
    router.push(`/workspaces/${workspaceSlug}/work-units/${slug}`);
    router.refresh();
  }, [selectedType, slug, slugValid, description, workspaceSlug, onClose, router]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold mb-4">Create Work Unit</h2>

        {/* Type selection */}
        <div className="space-y-2 mb-4">
          <span className="block text-sm font-medium">Type</span>
          <div className="grid grid-cols-3 gap-2">
            {UNIT_TYPES.map((ut) => (
              <button
                key={ut.type}
                type="button"
                onClick={() => setSelectedType(ut.type)}
                className={`p-3 rounded border text-left text-sm transition-colors ${
                  selectedType === ut.type
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'
                }`}
              >
                <div className="font-medium">{ut.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{ut.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Slug input */}
        <div className="mb-4">
          <label htmlFor="create-unit-slug" className="block text-sm font-medium mb-1">
            Slug
          </label>
          <input
            id="create-unit-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="my-unit-name"
            className={`w-full rounded border px-3 py-2 text-sm bg-white dark:bg-gray-800 ${
              slug && !slugValid ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
          />
          {slug && !slugValid && (
            <p className="text-xs text-red-500 mt-1">
              Must start with a letter, lowercase letters, numbers, and hyphens only
            </p>
          )}
        </div>

        {/* Description */}
        <div className="mb-4">
          <label htmlFor="create-unit-desc" className="block text-sm font-medium mb-1">
            Description <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <input
            id="create-unit-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this unit do?"
            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 p-2 rounded">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!selectedType || !slugValid || creating}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
