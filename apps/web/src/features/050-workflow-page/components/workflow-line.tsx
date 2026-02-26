'use client';

/**
 * WorkflowLine — A single line in the workflow canvas.
 *
 * Renders as a horizontal row with numbered header, label, node cards,
 * drop zones (during drag), and restriction logic for running/complete lines.
 *
 * Phase 2+3 — Plan 050
 */

import type { LineStatusResult } from '@chainglass/positional-graph';
import { useState } from 'react';
import { ContextFlowIndicator } from './context-flow-indicator';
import { DropZone } from './drop-zone';
import { EmptyLinePlaceholder } from './empty-states';
import { WorkflowNodeCard, nodeStatusToCardProps } from './workflow-node-card';

export interface WorkflowLineProps {
  line: LineStatusResult;
  lineIndex: number;
  isDragging?: boolean;
  selectedNodeId?: string | null;
  relatedNodeIds?: Set<string>;
  onSelectNode?: (nodeId: string | null) => void;
  onDeleteNode?: (nodeId: string) => void;
  onSetLineLabel?: (lineId: string, label: string) => void;
  onRemoveLine?: (lineId: string) => void;
}

function lineStateBorder(line: LineStatusResult): string {
  if (line.complete) return 'border-l-green-500';
  if (line.runningNodes.length > 0) return 'border-l-blue-500';
  if (line.blockedNodes.length > 0) return 'border-l-red-500';
  return 'border-l-muted-foreground/20';
}

function isLineEditable(line: LineStatusResult): boolean {
  // Empty lines are always editable (trivially "complete" but need nodes added)
  if (line.nodes.length === 0) return true;
  return !line.complete && line.runningNodes.length === 0;
}

export function WorkflowLine({
  line,
  lineIndex,
  isDragging = false,
  selectedNodeId,
  relatedNodeIds,
  onSelectNode,
  onDeleteNode,
  onSetLineLabel,
  onRemoveLine,
}: WorkflowLineProps) {
  const borderClass = lineStateBorder(line);
  const editable = isLineEditable(line);
  const showDropZones = isDragging && editable;
  const hasDimming = selectedNodeId != null && relatedNodeIds != null;
  // Drop zones always rendered (for dnd-kit registration), isActive controls visibility
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState(line.label ?? '');

  const handleLabelBlur = () => {
    setEditingLabel(false);
    if (labelValue.trim() && labelValue !== line.label) {
      onSetLineLabel?.(line.lineId, labelValue.trim());
    }
  };

  const canDelete = editable && line.nodes.length === 0;

  return (
    <div
      data-testid={`workflow-line-${line.lineId}`}
      className={`rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-800/80 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)] dark:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.3)] overflow-visible transition-all duration-200 ${
        isDragging && editable ? 'ring-2 ring-blue-300/50 bg-blue-200/50 dark:ring-blue-500/30' : ''
      }`}
    >
      {/* Line header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-300/50 dark:bg-gray-700/60 border-b border-gray-300/70 dark:border-gray-600/50 rounded-t-xl" data-testid={`line-header-${line.lineId}`}>
        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold ${
          line.complete
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
            : line.runningNodes.length > 0
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
              : 'bg-muted text-muted-foreground'
        }`}>
          {lineIndex + 1}
        </span>
        {editingLabel ? (
          <input
            type="text"
            value={labelValue}
            onChange={(e) => setLabelValue(e.target.value)}
            onBlur={handleLabelBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleLabelBlur();
            }}
            className="text-sm font-semibold bg-transparent border-b border-primary outline-none px-1"
            data-testid={`line-label-input-${line.lineId}`}
          />
        ) : (
          <button
            type="button"
            onClick={() => editable && setEditingLabel(true)}
            className={`text-sm font-semibold tracking-tight ${editable ? 'hover:text-primary cursor-text' : ''}`}
            data-testid={`line-label-${line.lineId}`}
          >
            {line.label ?? `Line ${lineIndex + 1}`}
          </button>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground/60 font-medium px-2 py-0.5 rounded-md bg-muted/50">
            {line.transition === 'auto' ? '↓ auto' : '🔒 manual'}
          </span>
          <button
            type="button"
            disabled={!canDelete}
            onClick={() => canDelete && onRemoveLine?.(line.lineId)}
            className={`text-xs transition-colors ${canDelete ? 'text-muted-foreground/40 hover:text-destructive cursor-pointer' : 'text-muted-foreground/20 cursor-not-allowed'}`}
            title={
              canDelete
                ? 'Delete empty line'
                : line.nodes.length > 0
                  ? 'Remove all nodes first'
                  : 'Line is locked'
            }
            data-testid={`line-delete-${line.lineId}`}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Nodes with drop zones — always rendered so useDroppable stays registered */}
      <div className="p-3 pb-2">
      {line.nodes.length === 0 ? (
        <>
          <DropZone
            id={`drop-${line.lineId}-0`}
            lineId={line.lineId}
            position={0}
            isActive={showDropZones}
            fullWidth={true}
          />
          {!showDropZones && <EmptyLinePlaceholder />}
        </>
      ) : (
        <div
          className="flex gap-2 overflow-x-auto pb-1 items-start"
          data-testid={`line-nodes-${line.lineId}`}
        >
          {line.nodes.map((node, idx) => (
            <div key={node.nodeId} className="flex items-center gap-1 shrink-0">
              <DropZone
                id={`drop-${line.lineId}-${idx}`}
                lineId={line.lineId}
                position={idx}
                isActive={showDropZones}
              />
              {idx > 0 && <ContextFlowIndicator rightNode={node} />}
              <WorkflowNodeCard
                {...nodeStatusToCardProps(node, lineIndex)}
                isSelected={selectedNodeId === node.nodeId}
                isEditable={editable}
                isDimmed={hasDimming && !relatedNodeIds.has(node.nodeId)}
                onSelect={() => onSelectNode?.(node.nodeId)}
                onDelete={() => onDeleteNode?.(node.nodeId)}
              />
            </div>
          ))}
          <DropZone
            id={`drop-${line.lineId}-${line.nodes.length}`}
            lineId={line.lineId}
            position={line.nodes.length}
            isActive={showDropZones}
          />
        </div>
      )}
      </div>
    </div>
  );
}
