'use client';

/**
 * NodeDetailPanel - Sheet panel for displaying workflow node details
 *
 * Shows node information when a node is selected in the workflow graph.
 * Uses shadcn Sheet component sliding in from the right.
 */

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

import type { WorkflowNode } from '@/data/fixtures/flow.fixture';

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
};

const statusStyles: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  running: 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
  completed: 'bg-green-500/20 text-green-700 dark:text-green-300',
  failed: 'bg-red-500/20 text-red-700 dark:text-red-300',
};

export interface NodeDetailPanelProps {
  /** The selected node to display, null when closed */
  node: WorkflowNode | null;
  /** Callback when the panel should close */
  onClose: () => void;
}

/**
 * NodeDetailPanel displays detailed information about a selected workflow node.
 *
 * @example
 * <NodeDetailPanel
 *   node={selectedNode}
 *   onClose={() => setSelectedNode(null)}
 * />
 */
export function NodeDetailPanel({ node, onClose }: NodeDetailPanelProps) {
  const isOpen = node !== null;
  const status = node?.data.status ?? 'pending';

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span>{node?.data.label}</span>
            <span
              className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusStyles[status])}
            >
              {statusLabels[status]}
            </span>
          </SheetTitle>
          {node?.data.description && <SheetDescription>{node.data.description}</SheetDescription>}
        </SheetHeader>

        {node && (
          <div className="p-4 space-y-4">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">Node ID</h4>
              <p className="text-sm font-mono bg-muted px-2 py-1 rounded">{node.id}</p>
            </div>

            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">Node Type</h4>
              <p className="text-sm capitalize">{node.type}</p>
            </div>

            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">Position</h4>
              <p className="text-sm font-mono">
                x: {node.position.x}, y: {node.position.y}
              </p>
            </div>

            {node.data.status && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Status</h4>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full',
                      status === 'pending' && 'bg-muted-foreground',
                      status === 'running' && 'bg-blue-500 animate-pulse',
                      status === 'completed' && 'bg-green-500',
                      status === 'failed' && 'bg-red-500'
                    )}
                  />
                  <span className="text-sm">{statusLabels[status]}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
