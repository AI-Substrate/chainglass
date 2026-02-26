'use client';

/**
 * WorkflowCanvas — Main canvas rendering workflow lines and node cards.
 *
 * Lines render top-to-bottom as horizontal rows. Transition gates appear between lines.
 * Add Line button at the bottom.
 *
 * Phase 2: Canvas Core + Layout — Plan 050
 */

import type { GraphStatusResult } from '@chainglass/positional-graph';
import { EmptyCanvasPlaceholder } from './empty-states';
import { LineTransitionGate } from './line-transition-gate';
import { WorkflowLine } from './workflow-line';

export interface WorkflowCanvasProps {
  graphStatus: GraphStatusResult;
  onAddLine?: () => void;
}

export function WorkflowCanvas({ graphStatus, onAddLine }: WorkflowCanvasProps) {
  const { lines } = graphStatus;

  if (lines.length === 0) {
    return <EmptyCanvasPlaceholder onAddLine={onAddLine} />;
  }

  return (
    <div data-testid="workflow-canvas" className="flex flex-col gap-1 p-4 overflow-y-auto h-full">
      {lines.map((line, index) => (
        <div key={line.lineId}>
          {/* Transition gate between lines */}
          {index > 0 && (
            <LineTransitionGate
              transition={line.transition}
              precedingComplete={lines[index - 1].complete}
            />
          )}
          <WorkflowLine line={line} lineIndex={index} />
        </div>
      ))}

      {/* Add Line button */}
      <div className="flex justify-end mt-2">
        <button
          type="button"
          onClick={onAddLine}
          className="text-xs px-3 py-1 rounded border border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          data-testid="add-line-button"
        >
          + Add Line
        </button>
      </div>
    </div>
  );
}
