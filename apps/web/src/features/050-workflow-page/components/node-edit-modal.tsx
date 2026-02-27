'use client';

/**
 * NodeEditModal — Edit node description, orchestrator settings, and input wiring.
 *
 * Phase 5: Q&A + Node Properties Modal + Undo/Redo — Plan 050
 */

import type {
  GraphStatusResult,
  InputResolution,
  NodeStatusResult,
} from '@chainglass/positional-graph';
import { useState } from 'react';
import { computeAvailableSources } from '../lib/compute-available-sources';

export interface NodeEditModalProps {
  node: NodeStatusResult;
  graphStatus: GraphStatusResult;
  onSave: (updates: {
    description?: string;
    orchestratorSettings?: Partial<{
      execution: 'serial' | 'parallel';
      waitForPrevious: boolean;
      noContext: boolean;
      contextFrom: string | undefined;
    }>;
    inputs?: Record<string, InputResolution>;
  }) => void;
  onClose: () => void;
}

export function NodeEditModal({ node, graphStatus, onSave, onClose }: NodeEditModalProps) {
  const [description, setDescription] = useState('');
  const [execution, setExecution] = useState<'serial' | 'parallel'>(node.execution);
  const [noContext, setNoContext] = useState(node.noContext ?? false);
  const [contextFrom, setContextFrom] = useState(node.contextFrom ?? '');

  // Input wiring state: inputName → source config
  const declaredInputs = Object.keys(node.inputPack?.inputs ?? {});
  const currentInputs = node.inputPack?.inputs ?? {};
  const [inputWiring, setInputWiring] = useState<
    Record<string, { fromNode: string; fromOutput: string }>
  >(() => {
    const initial: Record<string, { fromNode: string; fromOutput: string }> = {};
    for (const inputName of declaredInputs) {
      const entry = currentInputs[inputName];
      if (entry?.status === 'available' && entry.detail.sources?.[0]) {
        const src = entry.detail.sources[0];
        initial[inputName] = {
          fromNode: src.sourceNodeId,
          fromOutput: src.sourceOutput ?? inputName,
        };
      }
    }
    return initial;
  });

  const availableSources = computeAvailableSources(node.nodeId, graphStatus);

  const handleSave = () => {
    const updates: Parameters<typeof onSave>[0] = {};

    updates.description = description;
    updates.orchestratorSettings = {
      execution,
      noContext,
      contextFrom: contextFrom || undefined,
    };

    // Build input resolutions
    const inputs: Record<string, InputResolution> = {};
    for (const [inputName, wiring] of Object.entries(inputWiring)) {
      if (wiring.fromNode) {
        inputs[inputName] = {
          from_node: wiring.fromNode,
          from_output: wiring.fromOutput || inputName,
        };
      }
    }
    if (Object.keys(inputs).length > 0) {
      updates.inputs = inputs;
    }

    onSave(updates);
  };

  return (
    <dialog
      open
      data-testid="node-edit-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 m-0 p-0 w-full h-full border-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-xl mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-tight">Edit Node Properties</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-muted-foreground/50 mt-1">
            {node.unitSlug} · {node.nodeId}
          </p>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Unit info (read-only) */}
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-2">
              Unit Info
            </h3>
            <div className="text-sm text-muted-foreground/70 space-y-1">
              <div>
                Type: <span className="font-medium text-foreground">{node.unitType}</span>
              </div>
              <div>
                Unit: <span className="font-medium text-foreground">{node.unitSlug}</span>
              </div>
            </div>
          </section>

          {/* Description */}
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-2">
              Description
            </h3>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Node description..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              data-testid="node-edit-description"
            />
          </section>

          {/* Orchestrator Settings */}
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-2">
              Orchestrator Settings
            </h3>
            <div className="space-y-3">
              {/* Execution mode */}
              <div className="flex items-center justify-between">
                <label className="text-sm" htmlFor="edit-execution">
                  Execution
                </label>
                <select
                  id="edit-execution"
                  value={execution}
                  onChange={(e) => setExecution(e.target.value as 'serial' | 'parallel')}
                  className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                  data-testid="node-edit-execution"
                >
                  <option value="serial">Serial</option>
                  <option value="parallel">Parallel</option>
                </select>
              </div>

              {/* noContext */}
              <label className="flex items-center gap-3 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={noContext}
                  onChange={(e) => setNoContext(e.target.checked)}
                  className="accent-blue-500"
                  data-testid="node-edit-nocontext"
                />
                No context (isolated execution)
              </label>

              {/* contextFrom */}
              <div className="flex items-center justify-between">
                <label className="text-sm" htmlFor="edit-contextfrom">
                  Context from
                </label>
                <input
                  id="edit-contextfrom"
                  type="text"
                  value={contextFrom}
                  onChange={(e) => setContextFrom(e.target.value)}
                  placeholder="Node ID (optional)"
                  className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 w-48"
                  data-testid="node-edit-contextfrom"
                />
              </div>
            </div>
          </section>

          {/* Input Wiring */}
          {declaredInputs.length > 0 && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-2">
                Input Wiring ({declaredInputs.length})
              </h3>
              <div className="space-y-3">
                {declaredInputs.map((inputName) => (
                  <div
                    key={inputName}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                  >
                    <div className="text-xs font-medium mb-2">{inputName}</div>
                    <div className="flex gap-2">
                      <select
                        value={inputWiring[inputName]?.fromNode ?? ''}
                        onChange={(e) => {
                          setInputWiring((prev) => ({
                            ...prev,
                            [inputName]: {
                              fromNode: e.target.value,
                              fromOutput: prev[inputName]?.fromOutput ?? inputName,
                            },
                          }));
                        }}
                        className="flex-1 px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800"
                        data-testid={`input-source-${inputName}`}
                      >
                        <option value="">Not wired</option>
                        {availableSources.map((src) => (
                          <option key={src.nodeId} value={src.nodeId}>
                            {src.unitSlug} ({src.nodeId})
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={inputWiring[inputName]?.fromOutput ?? inputName}
                        onChange={(e) => {
                          setInputWiring((prev) => ({
                            ...prev,
                            [inputName]: {
                              fromNode: prev[inputName]?.fromNode ?? '',
                              fromOutput: e.target.value,
                            },
                          }));
                        }}
                        placeholder="Output name"
                        className="w-28 px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800"
                        data-testid={`input-output-${inputName}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            data-testid="node-edit-save"
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </dialog>
  );
}
