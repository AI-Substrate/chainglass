'use client';

/**
 * Plan 056: DomainOverview Component
 *
 * Displays registered state domains with expandable property schemas.
 * AC-01: domain list with name, description, multiInstance, property count
 * AC-02: expandable property descriptors
 * AC-03: instance count for multi-instance domains
 */

import { useState } from 'react';

import { useStateSystem } from '@/lib/state';
import type { StateDomainDescriptor } from '@chainglass/shared/state';

interface DomainOverviewProps {
  domains: StateDomainDescriptor[];
  onSelectDomain?: (domain: string) => void;
}

export function DomainOverview({ domains, onSelectDomain }: DomainOverviewProps) {
  const system = useStateSystem();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (domain: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  if (domains.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        No domains registered
      </div>
    );
  }

  return (
    <div className="flex flex-col text-sm">
      {domains.map((d) => {
        const isExpanded = expanded.has(d.domain);
        const instances = d.multiInstance ? system.listInstances(d.domain) : [];

        return (
          <div key={d.domain} className="border-b border-border last:border-b-0">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/50 transition-colors text-left"
              onClick={() => toggle(d.domain)}
            >
              <span className="text-muted-foreground text-xs w-4">{isExpanded ? '▾' : '▸'}</span>
              <span className="font-medium">{d.domain}</span>
              <span className="text-muted-foreground text-xs">
                {d.multiInstance ? 'multi' : 'singleton'}
              </span>
              <span className="text-muted-foreground text-xs ml-auto">
                {d.properties.length} props
                {d.multiInstance && instances.length > 0 && ` · ${instances.length} instances`}
              </span>
            </button>

            {isExpanded && (
              <div className="px-3 pb-2 ml-6">
                <p className="text-xs text-muted-foreground mb-2">{d.description}</p>

                <div className="space-y-1">
                  {d.properties.map((p) => (
                    <div key={p.key} className="flex items-center gap-2 text-xs font-mono">
                      <span className="text-blue-400">{p.typeHint}</span>
                      <span className="text-foreground">{p.key}</span>
                      <span className="text-muted-foreground">— {p.description}</span>
                    </div>
                  ))}
                </div>

                {d.multiInstance && instances.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs text-muted-foreground">Instances: </span>
                    <span className="text-xs font-mono">{instances.join(', ')}</span>
                  </div>
                )}

                {onSelectDomain && (
                  <button
                    type="button"
                    className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectDomain(d.domain);
                    }}
                  >
                    View stream →
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
