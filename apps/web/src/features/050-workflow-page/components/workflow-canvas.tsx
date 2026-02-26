'use client';

/**
 * WorkflowCanvas — Main canvas rendering workflow lines and node cards.
 *
 * Lines render top-to-bottom as horizontal rows. Transition gates appear between lines.
 * Drop zones appear during drag. Add Line button at the bottom.
 *
 * Phase 2+3 — Plan 050
 */

import type { GraphStatusResult } from '@chainglass/positional-graph';
import { EmptyCanvasPlaceholder } from './empty-states';
import { LineTransitionGate } from './line-transition-gate';
import { WorkflowLine } from './workflow-line';

export interface WorkflowCanvasProps {
  graphStatus: GraphStatusResult;
  isDragging?: boolean;
  selectedNodeId?: string | null;
  relatedNodeIds?: Set<string>;
  onSelectNode?: (nodeId: string | null) => void;
  onDeleteNode?: (nodeId: string) => void;
  onAddLine?: (label?: string) => void;
  onSetLineLabel?: (lineId: string, label: string) => void;
  onRemoveLine?: (lineId: string) => void;
}

export function WorkflowCanvas({
  graphStatus,
  isDragging = false,
  selectedNodeId,
  relatedNodeIds,
  onSelectNode,
  onDeleteNode,
  onAddLine,
  onSetLineLabel,
  onRemoveLine,
}: WorkflowCanvasProps) {
  const { lines } = graphStatus;

  if (lines.length === 0) {
    return <EmptyCanvasPlaceholder onAddLine={() => onAddLine?.()} />;
  }

  return (
    <div
      data-testid="workflow-canvas"
      className="flex flex-col gap-3 p-6 overflow-y-auto h-full"
      style={{
        backgroundColor: 'var(--canvas-bg)',
        backgroundImage: 'radial-gradient(circle, var(--canvas-dot) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
      onClick={(e) => {
        // Deselect unless clicking a node card
        const target = e.target as HTMLElement;
        if (!target.closest('[data-testid^="node-card-"]')) {
          onSelectNode?.(null);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onSelectNode?.(null);
      }}
    >
      {lines.map((line, index) => (
        <div key={line.lineId}>
          {index > 0 && (
            <LineTransitionGate
              transition={line.transition}
              precedingComplete={lines[index - 1].complete}
            />
          )}
          <WorkflowLine
            line={line}
            lineIndex={index}
            isDragging={isDragging}
            selectedNodeId={selectedNodeId}
            relatedNodeIds={relatedNodeIds}
            onSelectNode={onSelectNode}
            onDeleteNode={onDeleteNode}
            onSetLineLabel={onSetLineLabel}
            onRemoveLine={onRemoveLine}
          />
        </div>
      ))}

      <div className="flex justify-end mt-3">
        <button
          type="button"
          onClick={() => onAddLine?.()}
          className="text-[11px] font-medium px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/50 transition-all duration-200 shadow-sm"
          data-testid="add-line-button"
        >
          + Add Line
        </button>
      </div>
    </div>
  );
}
