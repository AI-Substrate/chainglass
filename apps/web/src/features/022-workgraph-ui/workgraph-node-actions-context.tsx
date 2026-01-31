/**
 * WorkGraph Node Actions Context
 *
 * Part of Plan 022: WorkGraph UI - Phase 4 (Subtask 003)
 *
 * Provides action callbacks and dynamic state to WorkGraph node components.
 * React Flow's nodeTypes registration doesn't forward custom props, so we use
 * context to pass callbacks like removeNode() to individual node components.
 *
 * Pattern follows SidebarContext (apps/web/src/components/ui/sidebar.tsx).
 *
 * Designed for extensibility: future actions (run, cancel, openModal, etc.)
 * can be added to WorkGraphNodeActions without breaking existing consumers.
 *
 * @module features/022-workgraph-ui/workgraph-node-actions-context
 */

'use client';

import * as React from 'react';

/**
 * Actions and state available to WorkGraph node components.
 *
 * Extensible interface - add new actions here as needed:
 * - removeNode: Delete a single node (non-cascading)
 * - loadingNodes: Set of nodeIds currently being operated on
 *
 * Future additions might include:
 * - runNode: (nodeId: string) => Promise<void>
 * - cancelNode: (nodeId: string) => Promise<void>
 * - openQuestionModal: (nodeId: string) => void
 * - selectNode: (nodeId: string) => void
 */
export type WorkGraphNodeActions = {
  /** Remove a node from the graph (non-cascading) */
  removeNode: (nodeId: string) => Promise<void>;
  /** Set of node IDs currently undergoing an operation (show spinner) */
  loadingNodes: Set<string>;
};

/**
 * Context for WorkGraph node actions.
 * null when outside provider (hook will throw).
 */
const WorkGraphNodeActionsContext = React.createContext<WorkGraphNodeActions | null>(null);

/**
 * Hook to access WorkGraph node actions from within a node component.
 *
 * @throws Error if used outside of WorkGraphNodeActionsProvider
 *
 * @example
 * ```tsx
 * function WorkGraphNode({ data }: NodeProps) {
 *   const { removeNode, loadingNodes } = useWorkGraphNodeActions();
 *   const isLoading = loadingNodes.has(data.id);
 *
 *   return (
 *     <button onClick={() => removeNode(data.id)} disabled={isLoading}>
 *       {isLoading ? <Spinner /> : <Trash2 />}
 *     </button>
 *   );
 * }
 * ```
 */
export function useWorkGraphNodeActions(): WorkGraphNodeActions {
  const context = React.useContext(WorkGraphNodeActionsContext);
  if (!context) {
    throw new Error('useWorkGraphNodeActions must be used within a WorkGraphNodeActionsProvider.');
  }
  return context;
}

/**
 * Props for WorkGraphNodeActionsProvider.
 * Parent component provides the actual implementations.
 */
export interface WorkGraphNodeActionsProviderProps {
  children: React.ReactNode;
  /** Callback to remove a node - typically wired to useWorkGraphAPI.removeNode */
  removeNode: (nodeId: string) => Promise<void>;
  /** Set of node IDs currently loading - managed by parent */
  loadingNodes: Set<string>;
}

/**
 * Provider component for WorkGraph node actions.
 * Wrap around WorkGraphCanvas to make actions available to all nodes.
 *
 * @example
 * ```tsx
 * <WorkGraphNodeActionsProvider
 *   removeNode={handleRemoveNode}
 *   loadingNodes={loadingNodes}
 * >
 *   <WorkGraphCanvas ... />
 * </WorkGraphNodeActionsProvider>
 * ```
 */
export function WorkGraphNodeActionsProvider({
  children,
  removeNode,
  loadingNodes,
}: WorkGraphNodeActionsProviderProps) {
  // Memoize context value to prevent unnecessary re-renders
  const contextValue = React.useMemo<WorkGraphNodeActions>(
    () => ({
      removeNode,
      loadingNodes,
    }),
    [removeNode, loadingNodes]
  );

  return (
    <WorkGraphNodeActionsContext.Provider value={contextValue}>
      {children}
    </WorkGraphNodeActionsContext.Provider>
  );
}

// Display name for React DevTools
WorkGraphNodeActionsProvider.displayName = 'WorkGraphNodeActionsProvider';
