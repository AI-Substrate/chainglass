/**
 * WorkGraph Detail Client Component
 *
 * Part of Plan 022: WorkGraph UI - Phase 2 + Phase 3
 *
 * Client component that renders the React Flow canvas with editing support.
 * Per DYK#3: Client component receives serialized data from Server Component.
 */

'use client';

import { useCallback, useState } from 'react';
import type { WorkGraphFlowData } from '../../../../../../src/features/022-workgraph-ui/use-workgraph-flow';
import { WorkGraphCanvas } from '../../../../../../src/features/022-workgraph-ui/workgraph-canvas';
import { WorkUnitToolbox } from '../../../../../../src/features/022-workgraph-ui/workunit-toolbox';

interface WorkGraphDetailClientProps {
  data: WorkGraphFlowData;
  workspaceSlug: string;
  worktreePath?: string;
}

export function WorkGraphDetailClient({ data, workspaceSlug, worktreePath }: WorkGraphDetailClientProps) {
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((message: string) => {
    setError(message);
    // Auto-clear after 5 seconds
    setTimeout(() => setError(null), 5000);
  }, []);

  return (
    <div className="flex h-full w-full">
      {/* Toolbox sidebar */}
      <div className="w-64 border-r bg-background shrink-0">
        <WorkUnitToolbox
          workspaceSlug={workspaceSlug}
          worktreePath={worktreePath}
          className="h-full"
        />
      </div>

      {/* Canvas area */}
      <div className="flex-1 relative">
        {error && (
          <div className="absolute top-4 right-4 z-50 bg-destructive text-destructive-foreground px-4 py-2 rounded-md shadow-lg">
            {error}
          </div>
        )}
        <WorkGraphCanvas
          data={data}
          className="h-full w-full"
          editable={true}
          onError={handleError}
        />
      </div>
    </div>
  );
}
