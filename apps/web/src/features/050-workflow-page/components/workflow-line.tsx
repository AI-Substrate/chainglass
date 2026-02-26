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
      className={`rounded-lg border border-l-4 ${borderClass} bg-card p-3 ${
        isDragging && editable ? 'ring-1 ring-primary/30' : ''
      }`}
    >
      {/* Line header */}
      <div className="flex items-center gap-2 mb-2" data-testid={`line-header-${line.lineId}`}>
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-bold">
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
            className="text-sm font-medium bg-transparent border-b border-primary outline-none px-1"
            data-testid={`line-label-input-${line.lineId}`}
          />
        ) : (
          <button
            type="button"
            onClick={() => editable && setEditingLabel(true)}
            className={`text-sm font-medium ${editable ? 'hover:text-primary cursor-text' : ''}`}
            data-testid={`line-label-${line.lineId}`}
          >
            {line.label ?? `Line ${lineIndex + 1}`}
          </button>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-muted-foreground">
            {line.transition === 'auto' ? '↓ auto' : '🔒 manual'}
          </span>
          <button
            type="button"
            disabled={!canDelete}
            onClick={() => canDelete && onRemoveLine?.(line.lineId)}
            className={`text-xs ${canDelete ? 'text-muted-foreground hover:text-destructive cursor-pointer' : 'text-muted-foreground/30 cursor-not-allowed'}`}
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
          className="flex gap-1 overflow-x-auto py-1 items-stretch"
          data-testid={`line-nodes-${line.lineId}`}
        >
          {line.nodes.map((node, idx) => (
            <div key={node.nodeId} className="flex items-stretch items-center gap-1">
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
  );
}
