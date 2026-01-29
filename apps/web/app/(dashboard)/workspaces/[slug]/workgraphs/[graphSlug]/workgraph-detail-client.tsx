/**
 * WorkGraph Detail Client Component
 *
 * Part of Plan 022: WorkGraph UI - Phase 2
 *
 * Client component that renders the React Flow canvas.
 * Per DYK#3: Client component receives serialized data from Server Component.
 */

'use client';

import type { WorkGraphFlowData } from '../../../../../../src/features/022-workgraph-ui/use-workgraph-flow';
import { WorkGraphCanvas } from '../../../../../../src/features/022-workgraph-ui/workgraph-canvas';

interface WorkGraphDetailClientProps {
  data: WorkGraphFlowData;
}

export function WorkGraphDetailClient({ data }: WorkGraphDetailClientProps) {
  return <WorkGraphCanvas data={data} className="h-full w-full" />;
}
