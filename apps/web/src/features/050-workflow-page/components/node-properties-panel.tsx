'use client';

/**
 * NodePropertiesPanel — Right panel showing selected node detail.
 *
 * Replaces toolbox when a node is selected. Shows unit info, status,
 * context source, inputs, outputs, downstream consumers.
 *
 * Phase 4: Context Indicators — Plan 050
 */

import type { NodeStatusResult } from '@chainglass/positional-graph';
import type { NodeRelationship } from '../lib/related-nodes';
import { computeGates } from './gate-chip';

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
}

export function NodePropertiesPanel({
  node,
  contextColor,
  related,
  onBack,
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
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Status</h4>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 capitalize">{node.status}</div>
      </section>

      {/* Context Source */}
      <section>
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Context</h4>
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
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Gates</h4>
        <div className="space-y-1">
          {gates.map((gate) => (
            <div key={gate.name} className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${gate.passing ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <span className={`${gate.passing ? 'text-muted-foreground/50' : 'font-medium'}`}>{gate.name}</span>
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
          <div className="space-y-1">
            {Object.entries(node.inputPack.inputs).map(([name, entry]) => (
              <div key={name} className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  entry.status === 'available' ? 'bg-emerald-400' : entry.status === 'waiting' ? 'bg-amber-400' : 'bg-red-400'
                }`} />
                <span className="font-medium">{name}</span>
                <span className="text-muted-foreground/40 ml-auto">{entry.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Upstream */}
      {upstream.length > 0 && (
        <section>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Upstream ({upstream.length})</h4>
          <div className="space-y-1">
            {upstream.map((r, i) => (
              <div key={`${r.nodeId}-${r.inputName}-${i}`} className="text-muted-foreground/60 flex items-center gap-1.5">
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
              <div key={`${r.nodeId}-${r.inputName}-${i}`} className="text-muted-foreground/60 flex items-center gap-1.5">
                <span className="text-blue-400">→</span> {r.nodeId}
                <span className="text-muted-foreground/30">({r.inputName})</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Edit button placeholder */}
      <div className="mt-auto pt-3 border-t border-border/20">
        <button
          type="button"
          disabled
          className="w-full px-3 py-2 text-xs font-medium rounded-lg bg-foreground/5 text-muted-foreground/40 cursor-not-allowed border border-border/20"
          title="Coming in Phase 5"
        >
          Edit Properties...
        </button>
      </div>
    </div>
  );
}
