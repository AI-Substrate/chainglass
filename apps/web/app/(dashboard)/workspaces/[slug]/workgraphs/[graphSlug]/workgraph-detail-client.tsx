/**
 * WorkGraph Detail Client Component
 *
 * Part of Plan 022: WorkGraph UI - Phase 2 + Phase 3 + Phase 4
 *
 * Client component that renders the React Flow canvas with editing support.
 * Per DYK#3: Client component receives serialized data from Server Component.
 *
 * Phase 4: SSE subscription for real-time updates.
 */

'use client';

import type { Connection } from '@xyflow/react';
import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useWorkGraphAPI } from '../../../../../../src/features/022-workgraph-ui/use-workgraph-api';
import type { WorkGraphFlowData } from '../../../../../../src/features/022-workgraph-ui/use-workgraph-flow';
import { useWorkGraphSSE } from '../../../../../../src/features/022-workgraph-ui/use-workgraph-sse';
import { WorkGraphCanvas } from '../../../../../../src/features/022-workgraph-ui/workgraph-canvas';
import { WorkGraphNodeActionsProvider } from '../../../../../../src/features/022-workgraph-ui/workgraph-node-actions-context';
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
  const [isRefreshing, startRefresh] = useTransition();
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set());

  const handleRefresh = useCallback(() => {
    startRefresh(() => {
      router.refresh();
    });
  }, [router]);

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

  // Handle node removal with loading state
  const handleRemoveNode = useCallback(
    async (nodeId: string): Promise<void> => {
      // Add to loading set (immutable update)
      setLoadingNodes((prev) => new Set(prev).add(nodeId));
      try {
        const result = await instance.removeNode(nodeId);
        if (result.errors && result.errors.length > 0) {
          handleError(result.errors[0].message);
        }
      } catch (err) {
        handleError(err instanceof Error ? err.message : 'Failed to remove node');
      } finally {
        // Remove from loading set (immutable update)
        setLoadingNodes((prev) => {
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
        });
      }
    },
    [instance, handleError]
  );

  // Create a minimal instance wrapper for SSE hook that uses router.refresh()
  const sseInstance = useMemo(
    () => ({
      refresh: async () => {
        router.refresh();
      },
    }),
    [router]
  );

  // Phase 4: SSE subscription for real-time updates
  const { isConnected } = useWorkGraphSSE({
    graphSlug,
    instance: sseInstance,
    onExternalChange: () => {
      toast.info('Graph updated from external change');
    },
    enablePolling: true, // Fallback to polling if SSE fails
    pollingInterval: 5000, // Poll every 5s as fallback
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

      if (result.errors && result.errors.length > 0) {
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
        {/* Connection indicator + Refresh button */}
        <div className="absolute top-4 left-4 z-50 flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`}
            title={isConnected ? 'Connected to real-time updates' : 'Not connected'}
          />
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-50"
            title="Refresh graph"
          >
            <RefreshCw
              className={`w-4 h-4 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`}
            />
          </button>
        </div>
        {/* Error toast */}
        {error && (
          <div className="absolute top-4 right-4 z-50 bg-destructive text-destructive-foreground px-4 py-2 rounded-md shadow-lg">
            {error}
          </div>
        )}
        <WorkGraphNodeActionsProvider removeNode={handleRemoveNode} loadingNodes={loadingNodes}>
          <WorkGraphCanvas
            data={data}
            className="h-full w-full"
            editable={true}
            instance={instance}
            onError={handleError}
            onConnect={handleConnect}
          />
        </WorkGraphNodeActionsProvider>
      </div>
    </div>
  );
}
