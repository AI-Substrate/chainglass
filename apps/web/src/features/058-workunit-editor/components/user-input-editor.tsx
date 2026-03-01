'use client';

import { useAutoSave } from '@/features/_platform/hooks/use-auto-save';
import { useCallback, useState } from 'react';
import { saveUnitContent } from '../../../../app/actions/workunit-actions';
import { SaveIndicator } from './save-indicator';

interface UserInputOption {
  key: string;
  label: string;
  description?: string;
}

interface UserInputConfig {
  question_type: 'text' | 'single' | 'multi' | 'confirm';
  prompt: string;
  options?: UserInputOption[];
  default?: string | boolean;
}

interface UserInputEditorProps {
  workspaceSlug: string;
  unitSlug: string;
  initialConfig: UserInputConfig;
  worktreePath?: string;
}

const QUESTION_TYPES = [
  { value: 'text', label: 'Text Input' },
  { value: 'single', label: 'Single Choice' },
  { value: 'multi', label: 'Multiple Choice' },
  { value: 'confirm', label: 'Confirm (Yes/No)' },
] as const;

/**
 * User-input configuration editor — form controls for question setup.
 * Auto-saves via unified saveUnitContent (routes to update type_config).
 * Mirrors Plan 054 HumanInputModal config structure.
 */
export function UserInputEditor({
  workspaceSlug,
  unitSlug,
  initialConfig,
  worktreePath,
}: UserInputEditorProps) {
  const [config, setConfig] = useState<UserInputConfig>(initialConfig);

  const saveFn = useCallback(
    (value: string) => saveUnitContent(workspaceSlug, unitSlug, 'user-input', value, worktreePath),
    [workspaceSlug, unitSlug, worktreePath]
  );

  const { status, error, trigger } = useAutoSave(saveFn, { delay: 500 });

  const updateConfig = useCallback(
    (patch: Partial<UserInputConfig>) => {
      setConfig((prev) => {
        const next = { ...prev, ...patch };
        trigger(JSON.stringify(next));
        return next;
      });
    },
    [trigger]
  );

  const needsOptions = config.question_type === 'single' || config.question_type === 'multi';

  const updateOption = useCallback(
    (index: number, patch: Partial<UserInputOption>) => {
      setConfig((prev) => {
        const options = [...(prev.options ?? [])];
        options[index] = { ...options[index], ...patch };
        const next = { ...prev, options };
        trigger(JSON.stringify(next));
        return next;
      });
    },
    [trigger]
  );

  const addOption = useCallback(() => {
    setConfig((prev) => {
      const options = [...(prev.options ?? []), { key: '', label: '' }];
      const next = { ...prev, options };
      trigger(JSON.stringify(next));
      return next;
    });
  }, [trigger]);

  const removeOption = useCallback(
    (index: number) => {
      setConfig((prev) => {
        const options = (prev.options ?? []).filter((_, i) => i !== index);
        const next = { ...prev, options };
        trigger(JSON.stringify(next));
        return next;
      });
    },
    [trigger]
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-muted-foreground">Question Configuration</h3>
        <SaveIndicator status={status} error={error} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Question Type */}
        <div>
          <label htmlFor="ui-question-type" className="block text-sm font-medium mb-1">
            Question Type
          </label>
          <select
            id="ui-question-type"
            value={config.question_type}
            onChange={(e) =>
              updateConfig({
                question_type: e.target.value as UserInputConfig['question_type'],
                // Seed options when switching to choice types
                options:
                  (e.target.value === 'single' || e.target.value === 'multi') &&
                  (!config.options || config.options.length < 2)
                    ? [
                        { key: 'option-1', label: 'Option 1' },
                        { key: 'option-2', label: 'Option 2' },
                      ]
                    : config.options,
              })
            }
            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
          >
            {QUESTION_TYPES.map((qt) => (
              <option key={qt.value} value={qt.value}>
                {qt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Prompt */}
        <div>
          <label htmlFor="ui-prompt" className="block text-sm font-medium mb-1">
            Prompt
          </label>
          <textarea
            id="ui-prompt"
            value={config.prompt}
            onChange={(e) => updateConfig({ prompt: e.target.value })}
            rows={3}
            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
            placeholder="What question should be asked?"
          />
        </div>

        {/* Options (for single/multi only) */}
        {needsOptions && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">
                Options <span className="text-muted-foreground font-normal">(min 2)</span>
              </span>
              <button
                type="button"
                onClick={addOption}
                className="text-xs px-2 py-1 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900"
              >
                + Add Option
              </button>
            </div>
            <div className="space-y-2">
              {(config.options ?? []).map((opt, i) => (
                <div
                  key={opt.key || `new-option-${i}`}
                  className="flex gap-2 items-start p-2 rounded border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex-1 space-y-1">
                    <input
                      value={opt.key}
                      onChange={(e) => updateOption(i, { key: e.target.value })}
                      placeholder="key"
                      className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs"
                    />
                    <input
                      value={opt.label}
                      onChange={(e) => updateOption(i, { label: e.target.value })}
                      placeholder="Label"
                      className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
                    />
                    <input
                      value={opt.description ?? ''}
                      onChange={(e) =>
                        updateOption(i, { description: e.target.value || undefined })
                      }
                      placeholder="Description (optional)"
                      className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-muted-foreground"
                    />
                  </div>
                  {(config.options?.length ?? 0) > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="text-red-500 hover:text-red-700 text-sm px-1 mt-1"
                      title="Remove option"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Default value */}
        {config.question_type === 'confirm' ? (
          <div>
            <label htmlFor="ui-default-confirm" className="block text-sm font-medium mb-1">
              Default
            </label>
            <select
              id="ui-default-confirm"
              value={config.default === true ? 'true' : config.default === false ? 'false' : ''}
              onChange={(e) =>
                updateConfig({
                  default: e.target.value === '' ? undefined : e.target.value === 'true',
                })
              }
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
            >
              <option value="">No default</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
        ) : config.question_type === 'text' ? (
          <div>
            <label htmlFor="ui-default-text" className="block text-sm font-medium mb-1">
              Default Value
            </label>
            <input
              id="ui-default-text"
              value={typeof config.default === 'string' ? config.default : ''}
              onChange={(e) => updateConfig({ default: e.target.value || undefined })}
              placeholder="Optional default"
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
