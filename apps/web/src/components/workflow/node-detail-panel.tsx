'use client';

/**
 * NodeDetailPanel - Sheet panel for displaying workflow node details
 *
 * Shows node information when a node is selected in the workflow graph.
 * Uses shadcn Sheet component sliding in from the right.
 *
 * Extended for Plan 011: Supports QuestionInput for blocked phases.
 */

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { StatusBadge } from '@/components/ui/status-badge';
import { QuestionInput } from '@/components/phases/question-input';
import { cn } from '@/lib/utils';

import type { WorkflowNode } from '@/data/fixtures/flow.fixture';
import type { PhaseJSON, PhaseRunStatus } from '@/data/fixtures/workflows.fixture';

// Extended status labels to include Plan 010 PhaseRunStatus values
const statusLabels: Record<string, string> = {
  pending: 'Pending',
  ready: 'Ready',
  running: 'Running',
  active: 'Active',
  blocked: 'Needs Input',
  accepted: 'Accepted',
  completed: 'Completed',
  complete: 'Complete',
  failed: 'Failed',
};

const statusStyles: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  ready: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  running: 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
  active: 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
  blocked: 'bg-orange-500/20 text-orange-700 dark:text-orange-300',
  accepted: 'bg-lime-500/20 text-lime-700 dark:text-lime-300',
  completed: 'bg-green-500/20 text-green-700 dark:text-green-300',
  complete: 'bg-green-500/20 text-green-700 dark:text-green-300',
  failed: 'bg-red-500/20 text-red-700 dark:text-red-300',
};

export interface NodeDetailPanelProps {
  /** The selected node to display, null when closed */
  node: WorkflowNode | null;
  /** Callback when the panel should close */
  onClose: () => void;
  /** Optional phase data for extended functionality (Plan 011) */
  phase?: PhaseJSON | null;
  /** Callback when a question is answered (Plan 011) */
  onAnswerSubmit?: (questionId: string, answer: string | string[] | boolean) => void;
}

/**
 * NodeDetailPanel displays detailed information about a selected workflow node.
 *
 * Extended for Plan 011 to support:
 * - PhaseRunStatus (7 values) with StatusBadge
 * - QuestionInput for blocked phases
 *
 * @example
 * // Basic usage (original)
 * <NodeDetailPanel
 *   node={selectedNode}
 *   onClose={() => setSelectedNode(null)}
 * />
 *
 * // With phase data and question support (Plan 011)
 * <NodeDetailPanel
 *   node={selectedNode}
 *   phase={selectedPhase}
 *   onClose={() => setSelectedNode(null)}
 *   onAnswerSubmit={(id, answer) => handleAnswer(id, answer)}
 * />
 */
export function NodeDetailPanel({ node, onClose, phase, onAnswerSubmit }: NodeDetailPanelProps) {
  const isOpen = node !== null;
  const status = phase?.status ?? node?.data.status ?? 'pending';
  const isBlocked = status === 'blocked';
  const hasQuestion = isBlocked && phase?.question;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span>{node?.data.label}</span>
            {phase ? (
              <StatusBadge status={status as PhaseRunStatus} size="sm" />
            ) : (
              <span
                className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusStyles[status])}
              >
                {statusLabels[status]}
              </span>
            )}
          </SheetTitle>
          {(phase?.description ?? node?.data.description) && (
            <SheetDescription>{phase?.description ?? node?.data.description}</SheetDescription>
          )}
        </SheetHeader>

        {node && (
          <div className="p-4 space-y-4">
            {/* Phase-specific details (Plan 011) */}
            {phase && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Order</h4>
                    <p className="text-sm">Phase {phase.order + 1}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Facilitator</h4>
                    <p className="text-sm capitalize">{phase.facilitator}</p>
                  </div>
                </div>

                {phase.startedAt && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Started</h4>
                    <p className="text-sm">{new Date(phase.startedAt).toLocaleString()}</p>
                  </div>
                )}

                {phase.duration !== null && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Duration</h4>
                    <p className="text-sm">
                      {phase.duration < 60
                        ? `${phase.duration}s`
                        : `${Math.floor(phase.duration / 60)}m ${phase.duration % 60}s`}
                    </p>
                  </div>
                )}

                {/* Question Input for blocked phases */}
                {hasQuestion && onAnswerSubmit && (
                  <div className="pt-4 border-t">
                    <QuestionInput
                      question={phase.question!}
                      onSubmit={onAnswerSubmit}
                    />
                  </div>
                )}
              </>
            )}

            {/* Original node details (shown when no phase data) */}
            {!phase && (
              <>
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
                          (status === 'running' || status === 'active') && 'bg-blue-500 animate-pulse',
                          status === 'blocked' && 'bg-orange-500 animate-pulse',
                          (status === 'completed' || status === 'complete') && 'bg-green-500',
                          status === 'failed' && 'bg-red-500'
                        )}
                      />
                      <span className="text-sm">{statusLabels[status]}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
