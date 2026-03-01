'use client';

import { useAutoSave } from '@/features/_platform/hooks/use-auto-save';
import { CodeEditor } from '@/features/_platform/viewer';
import { useCallback, useState } from 'react';
import { saveUnitContent } from '../../../../app/actions/workunit-actions';
import { SaveIndicator } from './save-indicator';

interface AgentEditorProps {
  workspaceSlug: string;
  unitSlug: string;
  initialContent: string;
}

/**
 * Agent prompt editor — CodeMirror with markdown highlighting.
 * Auto-saves via unified saveUnitContent action with 500ms debounce.
 */
export function AgentEditor({ workspaceSlug, unitSlug, initialContent }: AgentEditorProps) {
  const [content, setContent] = useState(initialContent);

  const saveFn = useCallback(
    (value: string) => saveUnitContent(workspaceSlug, unitSlug, 'agent', value),
    [workspaceSlug, unitSlug]
  );

  const { status, error, trigger } = useAutoSave(saveFn, { delay: 500 });

  const handleChange = useCallback(
    (value: string) => {
      setContent(value);
      trigger(value);
    },
    [trigger]
  );

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-muted-foreground">Prompt Template</h3>
        <SaveIndicator status={status} error={error} />
      </div>
      <div className="min-h-[400px]">
        <CodeEditor value={content} language="markdown" onChange={handleChange} />
      </div>
    </div>
  );
}
