'use client';

import type { WorkUnitSummary } from '@chainglass/positional-graph';

import { AgentEditor } from './agent-editor';
import { CodeUnitEditor } from './code-unit-editor';
import { MetadataPanel } from './metadata-panel';
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
}

function safeParseUserInputConfig(content: string) {
  try {
    return JSON.parse(content);
  } catch {
    return { question_type: 'text' as const, prompt: '', options: [] };
  }
}

/**
 * Main work unit editor — 3-panel layout with type-dispatched content editor.
 * Server Component loads data, this Client Component renders the full editor.
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
}: WorkUnitEditorProps) {
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
      main={mainEditor}
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
