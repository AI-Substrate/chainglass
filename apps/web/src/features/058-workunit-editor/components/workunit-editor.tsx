'use client';

import type { WorkUnitInput, WorkUnitOutput } from '@chainglass/positional-graph';
import type { WorkUnitSummary } from '@chainglass/positional-graph';

import { useAutoSave } from '@/features/_platform/hooks/use-auto-save';
import { useCallback, useEffect, useState } from 'react';
import { updateUnit } from '../../../../app/actions/workunit-actions';
import { AgentEditor } from './agent-editor';
import { CodeUnitEditor } from './code-unit-editor';
import type { InputOutputItem } from './input-output-card';
import {
  InputOutputCardList,
  type ListValidationErrors,
  hydrateClientIds,
  stripClientIds,
  validateItems,
} from './input-output-card-list';
import type { ReservedParam } from './input-output-card-list';
import { MetadataPanel } from './metadata-panel';
import { SaveIndicator } from './save-indicator';
import { UnitCatalogSidebar } from './unit-catalog-sidebar';
import { UserInputEditor } from './user-input-editor';
import { WorkUnitEditorLayout } from './workunit-editor-layout';

interface WorkUnitEditorProps {
  workspaceSlug: string;
  unitSlug: string;
  unitType: 'agent' | 'code' | 'user-input';
  content: string;
  description: string;
  version: string;
  scriptFilename?: string;
  allUnits: WorkUnitSummary[];
  inputs: WorkUnitInput[];
  outputs: WorkUnitOutput[];
}

function safeParseUserInputConfig(content: string) {
  try {
    return JSON.parse(content);
  } catch {
    return { question_type: 'text' as const, prompt: '', options: [] };
  }
}

/**
 * Reserved input param names per unit type.
 * Mirrors RESERVED_INPUT_PARAMS from positional-graph but defined inline
 * because client components can't import the server-only package (pulls in Node.js fs).
 */
const RESERVED_PARAMS_BY_TYPE: Record<string, ReservedParam[]> = {
  agent: [{ name: 'main-prompt', description: 'Routes to prompt template content' }],
  code: [{ name: 'main-script', description: 'Routes to script file content' }],
  'user-input': [],
};

function getReservedParams(unitType: 'agent' | 'code' | 'user-input'): ReservedParam[] {
  return RESERVED_PARAMS_BY_TYPE[unitType] ?? [];
}

/**
 * Main work unit editor — 3-panel layout with type-dispatched content editor
 * and inputs/outputs configuration below.
 */
export function WorkUnitEditor({
  workspaceSlug,
  unitSlug,
  unitType,
  content,
  description,
  version,
  scriptFilename,
  allUnits,
  inputs: initialInputs,
  outputs: initialOutputs,
}: WorkUnitEditorProps) {
  const [inputItems, setInputItems] = useState<InputOutputItem[]>(() =>
    hydrateClientIds(initialInputs)
  );
  const [outputItems, setOutputItems] = useState<InputOutputItem[]>(() =>
    hydrateClientIds(initialOutputs)
  );
  const [inputErrors, setInputErrors] = useState<ListValidationErrors>({});
  const [outputErrors, setOutputErrors] = useState<ListValidationErrors>({});

  // Single auto-save instance for inputs
  const inputSaveFn = useCallback(
    (value: string) => {
      const items = JSON.parse(value) as WorkUnitInput[];
      return updateUnit(workspaceSlug, unitSlug, { inputs: items });
    },
    [workspaceSlug, unitSlug]
  );
  const {
    status: inputStatus,
    error: inputError,
    trigger: triggerInputSave,
    flush: flushInputs,
  } = useAutoSave(inputSaveFn, { delay: 500 });

  // Single auto-save instance for outputs
  const outputSaveFn = useCallback(
    (value: string) => {
      const items = JSON.parse(value) as WorkUnitOutput[];
      return updateUnit(workspaceSlug, unitSlug, { outputs: items });
    },
    [workspaceSlug, unitSlug]
  );
  const {
    status: outputStatus,
    error: outputError,
    trigger: triggerOutputSave,
    flush: flushOutputs,
  } = useAutoSave(outputSaveFn, { delay: 500 });

  // Flush pending saves on unmount (DYK R1-#4)
  useEffect(() => () => flushInputs(), [flushInputs]);
  useEffect(() => () => flushOutputs(), [flushOutputs]);

  // Handle input field edits — validate + debounced save
  const handleInputFieldChange = useCallback(
    (items: InputOutputItem[]) => {
      setInputItems(items);
      const errors = validateItems(items);
      setInputErrors(errors);
      if (Object.keys(errors).length === 0) {
        const stripped = stripClientIds(items);
        triggerInputSave(JSON.stringify(stripped));
      }
    },
    [triggerInputSave]
  );

  // Handle output field edits — validate + debounced save
  const handleOutputFieldChange = useCallback(
    (items: InputOutputItem[]) => {
      setOutputItems(items);
      const errors = validateItems(items);
      setOutputErrors(errors);
      if (Object.keys(errors).length === 0) {
        const stripped = stripClientIds(items);
        triggerOutputSave(JSON.stringify(stripped));
      }
    },
    [triggerOutputSave]
  );

  // Handle input structural changes (add/remove/reorder) — trigger supersedes pending, flush saves immediately
  const handleInputStructuralChange = useCallback(
    (items: InputOutputItem[]) => {
      setInputItems(items);
      const errors = validateItems(items);
      setInputErrors(errors);
      if (Object.keys(errors).length === 0) {
        const stripped = stripClientIds(items);
        // trigger() overwrites any stale pending field-edit value, then flush() saves immediately
        triggerInputSave(JSON.stringify(stripped));
        flushInputs();
      }
    },
    [flushInputs, triggerInputSave]
  );

  // Handle output structural changes — trigger supersedes pending, flush saves immediately
  const handleOutputStructuralChange = useCallback(
    (items: InputOutputItem[]) => {
      setOutputItems(items);
      const errors = validateItems(items);
      setOutputErrors(errors);
      if (Object.keys(errors).length === 0) {
        const stripped = stripClientIds(items);
        triggerOutputSave(JSON.stringify(stripped));
        flushOutputs();
      }
    },
    [flushOutputs, triggerOutputSave]
  );

  const reservedParams = getReservedParams(unitType);

  const mainEditor = (() => {
    switch (unitType) {
      case 'agent':
        return (
          <AgentEditor workspaceSlug={workspaceSlug} unitSlug={unitSlug} initialContent={content} />
        );
      case 'code':
        return (
          <CodeUnitEditor
            workspaceSlug={workspaceSlug}
            unitSlug={unitSlug}
            initialContent={content}
            scriptFilename={scriptFilename}
          />
        );
      case 'user-input':
        return (
          <UserInputEditor
            workspaceSlug={workspaceSlug}
            unitSlug={unitSlug}
            initialConfig={safeParseUserInputConfig(content)}
          />
        );
    }
  })();

  return (
    <WorkUnitEditorLayout
      left={
        <UnitCatalogSidebar workspaceSlug={workspaceSlug} units={allUnits} currentSlug={unitSlug} />
      }
      main={
        <div className="flex flex-col">
          {/* Type-specific content editor */}
          {mainEditor}

          {/* Inputs/Outputs configuration */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">Inputs & Outputs</h3>
                <div className="flex items-center gap-3">
                  <SaveIndicator status={inputStatus} error={inputError} />
                  <SaveIndicator status={outputStatus} error={outputError} />
                </div>
              </div>
            </div>

            <InputOutputCardList
              label="Inputs"
              items={inputItems}
              onStructuralChange={handleInputStructuralChange}
              onFieldChange={handleInputFieldChange}
              reservedParams={reservedParams}
              validationErrors={inputErrors}
            />

            <InputOutputCardList
              label="Outputs"
              items={outputItems}
              onStructuralChange={handleOutputStructuralChange}
              onFieldChange={handleOutputFieldChange}
              requireMinOne
              validationErrors={outputErrors}
            />
          </div>
        </div>
      }
      right={
        <MetadataPanel
          workspaceSlug={workspaceSlug}
          unitSlug={unitSlug}
          unitType={unitType}
          initialDescription={description}
          initialVersion={version}
        />
      }
    />
  );
}
