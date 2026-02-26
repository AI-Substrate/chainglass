'use client';

/**
 * WorkflowEditor — Client component composing the workflow editor UI.
 *
 * Composes: WorkflowEditorLayout + WorkflowTempBar + WorkflowCanvas + WorkUnitToolbox.
 *
 * Phase 2: Canvas Core + Layout — Plan 050
 */

import type { GraphStatusResult, PGLoadResult } from '@chainglass/positional-graph';
import type { WorkUnitSummary } from '@chainglass/positional-graph';
import { WorkUnitToolbox } from './work-unit-toolbox';
import { WorkflowCanvas } from './workflow-canvas';
import { WorkflowEditorLayout } from './workflow-editor-layout';
import { WorkflowTempBar } from './workflow-temp-bar';

export interface WorkflowEditorProps {
  graphSlug: string;
  graphStatus: GraphStatusResult;
  definition: NonNullable<PGLoadResult['definition']>;
  units: WorkUnitSummary[];
  templateSource?: string;
}

export function WorkflowEditor({
  graphSlug,
  graphStatus,
  units,
  templateSource,
}: WorkflowEditorProps) {
  return (
    <WorkflowEditorLayout
      topBar={<WorkflowTempBar graphSlug={graphSlug} templateSource={templateSource} />}
      main={<WorkflowCanvas graphStatus={graphStatus} />}
      right={<WorkUnitToolbox units={units} />}
    />
  );
}
