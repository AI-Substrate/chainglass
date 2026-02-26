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
    <div data-testid="node-properties-panel" className="flex flex-col h-full p-3 gap-3 text-xs">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground"
          data-testid="properties-back"
        >
          ← Back
        </button>
        <span className="font-semibold">Node Properties</span>
      </div>

      {/* Unit Info */}
      <section>
        <h4 className="font-medium text-muted-foreground mb-1">Unit</h4>
        <div className="flex items-center gap-1.5">
          <span>{TYPE_ICONS[node.unitType]}</span>
          <span className="font-medium">{node.unitSlug}</span>
        </div>
        <div className="text-muted-foreground mt-0.5">{node.unitType}</div>
      </section>

      {/* Status */}
      <section>
        <h4 className="font-medium text-muted-foreground mb-1">Status</h4>
        <div>{node.status}</div>
      </section>

      {/* Context Source */}
      <section>
        <h4 className="font-medium text-muted-foreground mb-1">Context</h4>
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2.5 h-2.5 rounded-sm bg-${contextColor === 'blue' ? 'blue' : contextColor === 'purple' ? 'violet' : contextColor === 'green' ? 'green' : 'gray'}-500`}
          />
          <span>{CONTEXT_LABELS[contextColor]}</span>
          {node.noContext && <span className="text-muted-foreground">🔒 Isolated</span>}
          {node.contextFrom && (
            <span className="text-muted-foreground">from {node.contextFrom}</span>
          )}
        </div>
      </section>

      {/* Readiness Gates */}
      <section>
        <h4 className="font-medium text-muted-foreground mb-1">Readiness Gates</h4>
        <div className="space-y-0.5">
          {gates.map((gate) => (
            <div key={gate.name} className="flex items-center gap-1">
              <span>{gate.passing ? '✅' : '⛔'}</span>
              <span className={gate.passing ? 'text-muted-foreground' : ''}>{gate.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Inputs */}
      <section>
        <h4 className="font-medium text-muted-foreground mb-1">
          Inputs ({Object.keys(node.inputPack.inputs).length})
        </h4>
        {Object.keys(node.inputPack.inputs).length === 0 ? (
          <div className="text-muted-foreground">No inputs declared</div>
        ) : (
          <div className="space-y-0.5">
            {Object.entries(node.inputPack.inputs).map(([name, entry]) => (
              <div key={name} className="flex items-center gap-1">
                <span>
                  {entry.status === 'available' ? '🟢' : entry.status === 'waiting' ? '🟡' : '🔴'}
                </span>
                <span>{name}</span>
                <span className="text-muted-foreground">({entry.status})</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Upstream */}
      {upstream.length > 0 && (
        <section>
          <h4 className="font-medium text-muted-foreground mb-1">Upstream ({upstream.length})</h4>
          <div className="space-y-0.5">
            {upstream.map((r, i) => (
              <div key={`${r.nodeId}-${r.inputName}-${i}`} className="text-muted-foreground">
                ← {r.nodeId} ({r.inputName})
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Downstream */}
      {downstream.length > 0 && (
        <section>
          <h4 className="font-medium text-muted-foreground mb-1">
            Downstream ({downstream.length})
          </h4>
          <div className="space-y-0.5">
            {downstream.map((r, i) => (
              <div key={`${r.nodeId}-${r.inputName}-${i}`} className="text-muted-foreground">
                → {r.nodeId} ({r.inputName})
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Edit button placeholder */}
      <div className="mt-auto pt-2 border-t">
        <button
          type="button"
          disabled
          className="w-full px-3 py-1.5 text-xs rounded border text-muted-foreground cursor-not-allowed"
          title="Coming in Phase 5"
        >
          Edit Properties...
        </button>
      </div>
    </div>
  );
}
