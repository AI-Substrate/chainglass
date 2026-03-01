'use client';

import { useAutoSave } from '@/features/_platform/hooks/use-auto-save';
import { CodeEditor } from '@/features/_platform/viewer';
import { detectLanguage } from '@/lib/language-detection';
import { useCallback, useState } from 'react';
import { saveUnitContent } from '../../../../app/actions/workunit-actions';
import { SaveIndicator } from './save-indicator';

interface CodeUnitEditorProps {
  workspaceSlug: string;
  unitSlug: string;
  initialContent: string;
  /** Script filename for language detection (e.g., "code.sh", "script.py") */
  scriptFilename?: string;
}

/**
 * Code script editor — CodeMirror with language detection from filename.
 * Auto-saves via unified saveUnitContent action with 500ms debounce.
 */
export function CodeUnitEditor({
  workspaceSlug,
  unitSlug,
  initialContent,
  scriptFilename,
}: CodeUnitEditorProps) {
  const [content, setContent] = useState(initialContent);
  const language = detectLanguage(scriptFilename ?? 'script.sh');

  const saveFn = useCallback(
    (value: string) => saveUnitContent(workspaceSlug, unitSlug, 'code', value),
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
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">Script</h3>
          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {language}
          </span>
        </div>
        <SaveIndicator status={status} error={error} />
      </div>
      <div className="min-h-[400px]">
        <CodeEditor value={content} language={language} onChange={handleChange} />
      </div>
    </div>
  );
}
