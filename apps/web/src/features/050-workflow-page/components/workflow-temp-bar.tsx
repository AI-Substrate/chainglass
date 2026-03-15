'use client';

/**
 * WorkflowTempBar — Top bar for the workflow editor.
 *
 * Shows graph name, template/instance breadcrumb, undo/redo buttons,
 * execution controls (Run/Stop/Restart), and live execution progress.
 *
 * Phase 2+5: Canvas Core + Layout, Undo/Redo — Plan 050
 * Phase 4: Execution controls + progress — Plan 074
 */

import type { ExecutionButtonState } from '../../074-workflow-execution/execution-button-state';
import type { ManagerExecutionStatus } from '../../074-workflow-execution/workflow-execution-manager.types';

export interface WorkflowTempBarProps {
  graphSlug: string;
  templateSource?: string;
  undoDepth?: number;
  redoDepth?: number;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  // Execution controls (Plan 074 Phase 4)
  executionStatus?: ManagerExecutionStatus;
  buttonState?: ExecutionButtonState;
  iterations?: number;
  lastMessage?: string;
  hydrating?: boolean;
  onRun?: () => void;
  onStop?: () => void;
  onRestart?: () => void;
}

// Status badge styling
function statusBadgeClass(status: ManagerExecutionStatus): string {
  switch (status) {
    case 'running':
      return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    case 'starting':
      return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
    case 'stopping':
      return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
    case 'stopped':
      return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    case 'completed':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    case 'failed':
      return 'bg-red-500/20 text-red-300 border-red-500/30';
    default:
      return '';
  }
}

function statusLabel(status: ManagerExecutionStatus): string {
  switch (status) {
    case 'starting':
      return 'Starting…';
    case 'running':
      return 'Running';
    case 'stopping':
      return 'Stopping…';
    case 'stopped':
      return 'Stopped';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return '';
  }
}

export function WorkflowTempBar({
  graphSlug,
  templateSource,
  undoDepth = 0,
  redoDepth = 0,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  executionStatus = 'idle',
  buttonState,
  iterations = 0,
  lastMessage = '',
  hydrating = false,
  onRun,
  onStop,
  onRestart,
}: WorkflowTempBarProps) {
  const showStatus = executionStatus !== 'idle' && !hydrating;

  return (
    <div
      data-testid="workflow-temp-bar"
      className="flex items-center justify-between px-6 py-3.5 rounded-t-xl bg-gray-800 dark:bg-gray-950 text-white shrink-0"
    >
      {/* Left: graph name + breadcrumb + execution status */}
      <div className="flex items-center gap-2.5">
        <span className="text-base font-semibold tracking-tight">{graphSlug}</span>
        {templateSource && (
          <>
            <span className="text-white/30">·</span>
            <span className="text-white/50 text-sm">
              from <span className="font-medium text-white/70">{templateSource}</span>
            </span>
          </>
        )}
        {/* Execution status badge + progress */}
        {showStatus && (
          <>
            <span className="text-white/20">|</span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusBadgeClass(executionStatus)}`}
              data-testid="execution-status-badge"
            >
              {statusLabel(executionStatus)}
            </span>
            {iterations > 0 && (
              <span className="text-xs text-white/40" data-testid="execution-iterations">
                iter {iterations}
              </span>
            )}
            {lastMessage && (
              <span
                className="text-xs text-white/30 max-w-[200px] truncate"
                title={lastMessage}
                data-testid="execution-last-message"
              >
                {lastMessage}
              </span>
            )}
          </>
        )}
      </div>

      {/* Right: undo/redo + execution buttons */}
      <div className="flex items-center gap-2">
        {/* Undo button */}
        <button
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          data-testid="undo-button"
          className="relative px-2.5 py-1.5 text-sm rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed border border-white/10 transition-colors"
          title="Undo"
        >
          ↶
          {undoDepth > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-violet-500 text-white rounded-full px-1">
              {undoDepth}
            </span>
          )}
        </button>

        {/* Redo button */}
        <button
          type="button"
          disabled={!canRedo}
          onClick={onRedo}
          data-testid="redo-button"
          className="relative px-2.5 py-1.5 text-sm rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed border border-white/10 transition-colors"
          title="Redo"
        >
          ↷
          {redoDepth > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-violet-500 text-white rounded-full px-1">
              {redoDepth}
            </span>
          )}
        </button>

        {/* Execution button group (Plan 074 Phase 4) */}
        {buttonState?.run.visible && (
          <button
            type="button"
            disabled={!buttonState.run.enabled}
            onClick={onRun}
            data-testid="execution-run-button"
            className="px-4 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed border border-emerald-500/30 text-white transition-colors"
            title={buttonState.run.label ?? 'Run'}
          >
            {!buttonState.run.enabled && executionStatus === 'starting' ? (
              <span className="flex items-center gap-1.5">
                <span className="animate-spin text-[10px]">⟳</span>
                {buttonState.run.label ?? 'Run'}
              </span>
            ) : (
              <span>▶ {buttonState.run.label ?? 'Run'}</span>
            )}
          </button>
        )}

        {buttonState?.stop.visible && (
          <button
            type="button"
            disabled={!buttonState.stop.enabled}
            onClick={onStop}
            data-testid="execution-stop-button"
            className="px-4 py-1.5 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed border border-red-500/30 text-white transition-colors"
            title="Stop"
          >
            {!buttonState.stop.enabled && executionStatus === 'stopping' ? (
              <span className="flex items-center gap-1.5">
                <span className="animate-spin text-[10px]">⟳</span>
                Stop
              </span>
            ) : (
              <span>⏹ Stop</span>
            )}
          </button>
        )}

        {buttonState?.restart.visible && (
          <button
            type="button"
            disabled={!buttonState.restart.enabled}
            onClick={onRestart}
            data-testid="execution-restart-button"
            className="px-4 py-1.5 text-xs font-medium rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 text-white transition-colors"
            title="Restart"
          >
            ↺ Restart
          </button>
        )}
      </div>
    </div>
  );
}
