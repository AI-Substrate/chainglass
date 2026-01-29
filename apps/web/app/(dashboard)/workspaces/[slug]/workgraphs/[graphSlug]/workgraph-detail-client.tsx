/**
 * WorkGraph Detail Client Component
 *
 * Part of Plan 022: WorkGraph UI - Phase 2 + Phase 3
 *
 * Client component that renders the React Flow canvas with editing support.
 * Per DYK#3: Client component receives serialized data from Server Component.
 */

'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { Connection } from '@xyflow/react';
import type { WorkGraphFlowData } from '../../../../../../src/features/022-workgraph-ui/use-workgraph-flow';
import { useWorkGraphAPI } from '../../../../../../src/features/022-workgraph-ui/use-workgraph-api';
import { WorkGraphCanvas } from '../../../../../../src/features/022-workgraph-ui/workgraph-canvas';
import { WorkUnitToolbox } from '../../../../../../src/features/022-workgraph-ui/workunit-toolbox';

interface WorkGraphDetailClientProps {
  data: WorkGraphFlowData;
  workspaceSlug: string;
  graphSlug: string;
  worktreePath?: string;
}

export function WorkGraphDetailClient({
  data,
  workspaceSlug,
  graphSlug,
  worktreePath,
}: WorkGraphDetailClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((message: string) => {
    setError(message);
    // Auto-clear after 5 seconds
    setTimeout(() => setError(null), 5000);
  }, []);

  // API-backed instance for mutations
  const instance = useWorkGraphAPI({
    workspaceSlug,
    graphSlug,
    worktreePath,
    onMutation: () => router.refresh(),
  });

  // Handle edge connections from React Flow
  const handleConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) {
        handleError('Invalid connection: source and target required');
        return;
      }

      const result = await instance.connectNodes(
        connection.source,
        connection.sourceHandle ?? '',
        connection.target,
        connection.targetHandle ?? ''
      );

      if (!result.success && result.errors.length > 0) {
        handleError(result.errors[0].message);
      }
    },
    [instance, handleError]
  );

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
          instance={instance}
          onError={handleError}
          onConnect={handleConnect}
        />
      </div>
    </div>
  );
}
