'use client';

/**
 * NodePropertiesPanel — Right panel showing selected node detail.
 *
 * Replaces toolbox when a node is selected. Shows unit info, status,
 * context source, inputs, outputs, downstream consumers.
 *
 * Phase 4: Context Indicators — Plan 050
 */

import type { InputEntry, NodeStatusResult } from '@chainglass/positional-graph';
import type { NodeRelationship } from '../lib/related-nodes';
import { computeGates } from './gate-chip';

function InputSourceDetail({ entry, inputName }: { entry: InputEntry; inputName: string }) {
  if (entry.status === 'available') {
    const sources = entry.detail.sources;
    if (sources.length === 0) return null;
    return (
      <div className="ml-4 mt-0.5 text-muted-foreground/60">
        {sources.map((s) => (
          <div key={s.sourceNodeId} className="text-[11px]">
            ← from <span className="font-medium text-foreground/60">{s.sourceNodeId}</span>
            {s.sourceOutput !== 'default' && (
              <span className="text-muted-foreground/40">.{s.sourceOutput}</span>
            )}
          </div>
        ))}
      </div>
    );
  }
  if (entry.status === 'waiting') {
    const waiting = entry.detail.waiting;
    if (waiting.length === 0) return null;
    return (
      <div className="ml-4 mt-0.5 text-muted-foreground/60">
        {waiting.map((nodeId) => (
          <div key={nodeId} className="text-[11px]">
            ⏳ waiting on <span className="font-medium text-foreground/60">{nodeId}</span>
          </div>
        ))}
      </div>
    );
  }
  if (entry.status === 'error') {
    const isUnwired = entry.detail.code === 'E160';
    return (
      <div className="ml-4 mt-1 text-[11px] text-red-500 space-y-0.5">
        {isUnwired ? (
          <>
            <div>
              Input <span className="font-semibold">"{inputName}"</span> is not wired to any source
              node.
            </div>
            <div className="text-muted-foreground/60">
              This input expects <span className="font-medium">"{entry.detail.inputName}"</span>{' '}
              data from an upstream node. Wire it in the node config or connect a node that outputs
              a matching value.
            </div>
          </>
        ) : (
          <div>{entry.detail.message}</div>
        )}
      </div>
    );
  }
  return null;
}

const TYPE_ICONS: Record<string, string> = {
  agent: '🤖',
  code: '⚙️',
  'user-input': '👤',
};

const CONTEXT_LABELS: Record<string, string> = {
  green: 'New/Global',
  blue: 'Inherited (left)',
  purple: 'Explicit',
  gray: 'N/A',
};

export interface NodePropertiesPanelProps {
  node: NodeStatusResult;
  contextColor: 'green' | 'blue' | 'purple' | 'gray';
  related: NodeRelationship[];
  onBack: () => void;
  onEditProperties?: () => void;
  onProvideInput?: () => void;
  onEditTemplate?: () => void;
}

export function NodePropertiesPanel({
  node,
  contextColor,
  related,
  onBack,
  onEditProperties,
  onProvideInput,
  onEditTemplate,
}: NodePropertiesPanelProps) {
  const upstream = related.filter((r) => r.relation === 'upstream');
  const downstream = related.filter((r) => r.relation === 'downstream');
  const gates = computeGates(node);

  return (
    <div data-testid="node-properties-panel" className="flex flex-col h-full p-4 gap-4 text-xs">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground/60 hover:text-foreground transition-colors text-[11px] font-medium"
          data-testid="properties-back"
        >
          ← Back
        </button>
        <span className="text-[13px] font-semibold tracking-tight">Properties</span>
      </div>

      {/* Unit Info */}
      <section className="rounded-lg bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          <span className="text-base">{TYPE_ICONS[node.unitType]}</span>
          <div>
            <div className="font-semibold text-[13px] tracking-tight">{node.unitSlug}</div>
            <div className="text-muted-foreground/60 text-[11px]">{node.unitType}</div>
          </div>
        </div>
      </section>

      {/* Status */}
      <section>
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">
          Status
        </h4>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 capitalize">
          {node.status}
        </div>
        {node.startedAt && (
          <div className="text-[10px] text-muted-foreground/50 mt-1">
            Started: {new Date(node.startedAt).toLocaleTimeString()}
            {node.completedAt && (
              <span> · Completed: {new Date(node.completedAt).toLocaleTimeString()}</span>
            )}
          </div>
        )}
      </section>

      {/* Error Details */}
      {node.error && (
        <section>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-red-500 mb-1.5">
            Error
          </h4>
          <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 p-3 space-y-1.5">
            <div className="text-[11px] font-mono font-semibold text-red-700 dark:text-red-300">
              {node.error.code}
            </div>
            <div className="text-[11px] text-red-600 dark:text-red-400 break-words whitespace-pre-wrap">
              {node.error.message}
            </div>
            {node.error.occurredAt && (
              <div className="text-[10px] text-red-400 dark:text-red-600">
                {new Date(node.error.occurredAt).toLocaleString()}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Context Source */}
      <section>
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">
          Context
        </h4>
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full bg-${contextColor === 'blue' ? 'blue' : contextColor === 'purple' ? 'violet' : contextColor === 'green' ? 'green' : 'gray'}-500`}
          />
          <span className="font-medium">{CONTEXT_LABELS[contextColor]}</span>
          {node.noContext && <span className="text-muted-foreground/50">🔒 Isolated</span>}
          {node.contextFrom && (
            <span className="text-muted-foreground/50">from {node.contextFrom}</span>
          )}
        </div>
      </section>

      {/* Readiness Gates */}
      <section>
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">
          Gates
        </h4>
        <div className="space-y-1">
          {gates.map((gate) => (
            <div key={gate.name} className="flex items-center gap-2">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${gate.passing ? 'bg-emerald-400' : 'bg-red-400'}`}
              />
              <span className={`${gate.passing ? 'text-muted-foreground/50' : 'font-medium'}`}>
                {gate.name}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Inputs */}
      <section>
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">
          Inputs ({Object.keys(node.inputPack.inputs).length})
        </h4>
        {Object.keys(node.inputPack.inputs).length === 0 ? (
          <div className="text-muted-foreground/40 italic">No inputs declared</div>
        ) : (
          <div className="space-y-2">
            {Object.entries(node.inputPack.inputs).map(([name, entry]) => (
              <div key={name}>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      entry.status === 'available'
                        ? 'bg-emerald-400'
                        : entry.status === 'waiting'
                          ? 'bg-amber-400'
                          : 'bg-red-400'
                    }`}
                  />
                  <span className="font-medium">{name}</span>
                  <span className="text-muted-foreground/40 ml-auto">{entry.status}</span>
                </div>
                <InputSourceDetail entry={entry} inputName={name} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Upstream */}
      {upstream.length > 0 && (
        <section>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">
            Upstream ({upstream.length})
          </h4>
          <div className="space-y-1">
            {upstream.map((r, i) => (
              <div
                key={`${r.nodeId}-${r.inputName}-${i}`}
                className="text-muted-foreground/60 flex items-center gap-1.5"
              >
                <span className="text-blue-400">←</span> {r.nodeId}
                <span className="text-muted-foreground/30">({r.inputName})</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Downstream */}
      {downstream.length > 0 && (
        <section>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">
            Downstream ({downstream.length})
          </h4>
          <div className="space-y-1">
            {downstream.map((r, i) => (
              <div
                key={`${r.nodeId}-${r.inputName}-${i}`}
                className="text-muted-foreground/60 flex items-center gap-1.5"
              >
                <span className="text-blue-400">→</span> {r.nodeId}
                <span className="text-muted-foreground/30">({r.inputName})</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Action buttons */}
      <div className="mt-auto pt-3 border-t border-border/20 flex flex-col gap-2">
        {node.unitType === 'user-input' && onProvideInput && (
          <button
            type="button"
            onClick={onProvideInput}
            className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900 cursor-pointer transition-colors"
            data-testid="provide-input-button"
          >
            Provide Input...
          </button>
        )}
        {node.unitSlug && onEditTemplate && (
          <button
            type="button"
            onClick={onEditTemplate}
            className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900 cursor-pointer transition-colors"
            data-testid="edit-template-button"
          >
            Edit Template...
          </button>
        )}
        <button
          type="button"
          disabled={!onEditProperties}
          onClick={onEditProperties}
          className={`w-full px-3 py-2 text-xs font-medium rounded-lg border border-border/20 transition-colors ${
            onEditProperties
              ? 'bg-foreground/5 text-foreground hover:bg-foreground/10 cursor-pointer'
              : 'bg-foreground/5 text-muted-foreground/40 cursor-not-allowed'
          }`}
          title={onEditProperties ? 'Edit node properties' : 'Not available'}
          data-testid="edit-properties-button"
        >
          Edit Properties...
        </button>
      </div>
    </div>
  );
}
