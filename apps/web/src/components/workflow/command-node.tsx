'use client';

/**
 * CommandNode - ReactFlow node for phase prompts/commands
 *
 * Represents the prompt files (main.md, etc.) that configure what a phase does.
 * These are part of the workflow template definition (not user-provided at runtime).
 *
 * @see Plan 011: UI Mockups
 */

import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { FileCode, Settings, Terminal } from 'lucide-react';
import { memo } from 'react';

import { cn } from '@/lib/utils';

import type { PhaseCommandDefinition } from '@/data/fixtures/workflows.fixture';

/**
 * Data shape for command nodes
 */
export interface CommandNodeData extends PhaseCommandDefinition {
  /** Which phase this command belongs to */
  phaseId: string;
  [key: string]: unknown;
}

type CommandNodeType = Node<CommandNodeData, 'command'>;

function CommandNodeComponent({ data, selected }: NodeProps<CommandNodeType>) {
  const isMainPrompt = data.name === 'main.md';

  return (
    <>
      {/* Input handle at top (for visual consistency) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-transparent !w-0 !h-0 !border-0"
      />

      <div
        className={cn(
          'px-2 py-1.5 rounded border',
          'bg-amber-50 dark:bg-amber-900/20',
          'border-amber-300 dark:border-amber-700',
          'flex items-center gap-1.5 text-xs',
          'min-w-[100px] max-w-[180px]',
          selected && 'ring-2 ring-primary ring-offset-1'
        )}
      >
        {/* Workflow icon - prompts are part of the workflow template */}
        <Settings className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />

        {/* Type icon */}
        {isMainPrompt ? (
          <Terminal className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
        ) : (
          <FileCode className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
        )}

        <div className="flex flex-col min-w-0">
          <code className="truncate text-[10px] font-mono">{data.name}</code>
        </div>
      </div>

      {/* Output handle at bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-amber-400 !w-2 !h-2 !border !border-background"
      />
    </>
  );
}

export const CommandNode = memo(CommandNodeComponent);

/**
 * Node type configuration for ReactFlow
 */
export const COMMAND_NODE_TYPES = {
  command: CommandNode,
} as const;
