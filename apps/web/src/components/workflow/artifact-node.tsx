'use client';

/**
 * ArtifactNode - ReactFlow node for file artifacts in workflow graphs
 *
 * Represents inputs/outputs (files/messages) that flow between phases.
 * Shows file name, type icon, and source (orchestrator/agent) when applicable.
 *
 * @see Plan 011: UI Mockups
 */

import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { Bot, File, FileJson, FileText, Folder, MessageSquare, User } from 'lucide-react';
import { memo } from 'react';

import { cn } from '@/lib/utils';

import type { PhaseIODefinition } from '@/data/fixtures/workflows.fixture';

/**
 * Data shape for artifact nodes
 */
export interface ArtifactNodeData extends PhaseIODefinition {
  /** Which phase this artifact belongs to */
  phaseId: string;
  /** Whether this is an input or output */
  direction: 'input' | 'output';
  [key: string]: unknown;
}

type ArtifactNodeType = Node<ArtifactNodeData, 'artifact'>;

/**
 * File type icons
 */
const typeIcons = {
  json: FileJson,
  markdown: FileText,
  file: File,
  directory: Folder,
  message: MessageSquare,
};

/**
 * Source icons (who created this)
 * - user: Person who initiates/provides input to the workflow
 * - agent: AI that generates outputs during execution
 * - workflow: Static content that's part of the template
 */
const fromIcons = {
  user: User,
  agent: Bot,
  workflow: File,
};

function ArtifactNodeComponent({ data, selected }: NodeProps<ArtifactNodeType>) {
  const TypeIcon = typeIcons[data.type ?? 'file'] ?? File;
  const FromIcon = data.from ? fromIcons[data.from] : null;
  const isMessage = data.type === 'message';
  const isInput = data.direction === 'input';
  const isFromUser = data.from === 'user';
  const isFromAgent = data.from === 'agent';

  return (
    <>
      {/* Input handle at top */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-slate-400 !w-2 !h-2 !border !border-background"
      />

      <div
        className={cn(
          'px-2 py-1.5 rounded border bg-white dark:bg-slate-900',
          'flex items-center gap-1.5 text-xs',
          'min-w-[100px] max-w-[180px]',
          // User input styling (purple)
          isFromUser &&
            'border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20',
          // Agent output styling (cyan)
          isFromAgent &&
            'border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-900/20',
          // Default file styling (blue for input, green for output)
          !isFromUser && !isFromAgent && isInput && 'border-blue-300 dark:border-blue-700',
          !isFromUser && !isFromAgent && !isInput && 'border-emerald-300 dark:border-emerald-700',
          selected && 'ring-2 ring-primary ring-offset-1'
        )}
      >
        {/* Source indicator */}
        {FromIcon && (
          <FromIcon
            className={cn(
              'h-3 w-3 shrink-0',
              isFromUser && 'text-purple-500',
              isFromAgent && 'text-cyan-500'
            )}
          />
        )}

        {/* Type icon */}
        <TypeIcon
          className={cn(
            'h-3 w-3 shrink-0',
            isFromUser && 'text-purple-500',
            isFromAgent && 'text-cyan-500',
            !isFromUser && !isFromAgent && isInput && 'text-blue-500',
            !isFromUser && !isFromAgent && !isInput && 'text-emerald-500'
          )}
        />

        <div className="flex flex-col min-w-0">
          <code className="truncate text-[10px] font-mono">{data.name}</code>
          {isMessage && data.messageType && (
            <span className="text-[9px] text-muted-foreground capitalize">{data.messageType}</span>
          )}
        </div>
      </div>

      {/* Output handle at bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-slate-400 !w-2 !h-2 !border !border-background"
      />
    </>
  );
}

export const ArtifactNode = memo(ArtifactNodeComponent);

/**
 * Node type configuration for ReactFlow
 */
export const ARTIFACT_NODE_TYPES = {
  artifact: ArtifactNode,
} as const;
