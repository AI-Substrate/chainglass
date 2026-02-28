'use client';

/**
 * Plan 056: StateInspector Main Panel
 *
 * Tabs: Domains / Snapshot / Stream (DYK-35).
 * 50/50 split with detail panel. Diagnostics footer.
 * AC-16, AC-17: live diagnostics. AC-21, AC-22: throttled, no perf degradation.
 */

import { ChevronDown, Filter, Pause, Play, Trash2, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStateSystem } from '@/lib/state';
import { useStateInspector } from '../hooks/use-state-inspector';
import { DomainOverview } from './domain-overview';
import { type DetailItem, EntryDetail } from './entry-detail';
import { EventStream } from './event-stream';
import { StateEntriesTable } from './state-entries-table';

const DEMO_DOMAINS = ['demo-workflow', 'demo-agents', 'demo-alerts'];
const DEMO_STATUSES = ['idle', 'running', 'complete', 'failed', 'pending'];
const DEMO_PROPERTIES: Record<string, string[]> = {
  'demo-workflow': ['status', 'progress', 'step'],
  'demo-agents': ['heartbeat', 'task-count', 'status'],
  'demo-alerts': ['count', 'severity', 'last-message'],
};

function useDemoGenerator() {
  const system = useStateSystem();
  const [active, setActive] = useState(false);
  const registeredRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const register = useCallback(() => {
    if (registeredRef.current) return;
    for (const domain of DEMO_DOMAINS) {
      const already = system.listDomains().some((d) => d.domain === domain);
      if (!already) {
        system.registerDomain({
          domain,
          description: `Demo domain: ${domain}`,
          multiInstance: true,
          properties: (DEMO_PROPERTIES[domain] ?? []).map((key) => ({
            key,
            description: `Demo property ${key}`,
            typeHint: 'string',
          })),
        });
      }
    }
    registeredRef.current = true;
  }, [system]);

  const toggle = useCallback(() => {
    if (active) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = undefined;
      setActive(false);
    } else {
      register();
      let tick = 0;
      intervalRef.current = setInterval(() => {
        tick++;
        const domain = DEMO_DOMAINS[tick % DEMO_DOMAINS.length];
        const props = DEMO_PROPERTIES[domain] ?? ['value'];
        const prop = props[tick % props.length];
        const instanceId = `inst-${(tick % 3) + 1}`;

        if (prop === 'progress' || prop === 'task-count' || prop === 'count') {
          system.publish(`${domain}:${instanceId}:${prop}`, Math.floor(Math.random() * 100));
        } else if (prop === 'status') {
          system.publish(
            `${domain}:${instanceId}:${prop}`,
            DEMO_STATUSES[tick % DEMO_STATUSES.length]
          );
        } else {
          system.publish(`${domain}:${instanceId}:${prop}`, `value-${tick}`);
        }
      }, 500);
      setActive(true);
    }
  }, [active, register, system]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { active, toggle };
}

export function StateInspector() {
  const inspector = useStateInspector();
  const demo = useDemoGenerator();
  const [selectedItem, setSelectedItem] = useState<DetailItem | null>(null);
  const [activeTab, setActiveTab] = useState('stream');

  const handleDomainSelect = (domain: string) => {
    inspector.clearDomainFilters();
    inspector.toggleDomainFilter(domain);
    setActiveTab('stream');
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2 shrink-0">
        <h1 className="text-sm font-semibold">State Inspector</h1>

        <div className="flex items-center gap-1">
          {/* Domain filter popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                <Filter className="h-3 w-3" />
                {inspector.domainFilters.size === 0
                  ? 'All domains'
                  : `${inspector.domainFilters.size} domain${inspector.domainFilters.size > 1 ? 's' : ''}`}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-0">
              <div className="px-3 py-2 border-b border-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Filter by domain</span>
                  {inspector.domainFilters.size > 0 && (
                    <button
                      type="button"
                      className="text-[10px] text-blue-400 hover:text-blue-300"
                      onClick={() => inspector.clearDomainFilters()}
                    >
                      Clear all
                    </button>
                  )}
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto py-1">
                {inspector.domains.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    No domains registered
                  </div>
                ) : (
                  inspector.domains.map((d) => (
                    <button
                      type="button"
                      key={d.domain}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent/50 cursor-pointer text-xs w-full text-left"
                      onClick={() => inspector.toggleDomainFilter(d.domain)}
                    >
                      <Checkbox checked={inspector.domainFilters.has(d.domain)} tabIndex={-1} />
                      <span className="truncate">{d.domain}</span>
                      <span className="ml-auto text-muted-foreground text-[10px]">
                        {d.multiInstance ? 'multi' : 'single'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Demo generator */}
          <Button
            variant={demo.active ? 'default' : 'ghost'}
            size="icon"
            className={`h-7 w-7 ${demo.active ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' : ''}`}
            onClick={demo.toggle}
            title={demo.active ? 'Stop demo events' : 'Generate demo events'}
          >
            <Zap className="h-3.5 w-3.5" />
          </Button>

          {/* Pause/Resume */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => inspector.setPaused(!inspector.paused)}
            title={inspector.paused ? 'Resume stream' : 'Pause stream'}
          >
            {inspector.paused ? (
              <Play className="h-3.5 w-3.5" />
            ) : (
              <Pause className="h-3.5 w-3.5" />
            )}
          </Button>

          {/* Clear */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              inspector.clearStream();
              setSelectedItem(null);
            }}
            title="Clear stream"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content: tabs + detail split */}
      <div className="flex flex-1 min-h-0 divide-x divide-border">
        {/* Left: tabs */}
        <div className="w-1/2 flex flex-col min-h-0">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex flex-col flex-1 min-h-0"
          >
            <TabsList variant="line" className="px-3 shrink-0">
              <TabsTrigger value="domains">Domains</TabsTrigger>
              <TabsTrigger value="snapshot">Snapshot</TabsTrigger>
              <TabsTrigger value="stream">
                Stream
                {inspector.paused && inspector.bufferedCount > 0 && (
                  <span className="ml-1 text-amber-400">({inspector.bufferedCount})</span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="domains" className="flex-1 overflow-y-auto mt-0">
              <DomainOverview domains={inspector.domains} onSelectDomain={handleDomainSelect} />
            </TabsContent>

            <TabsContent value="snapshot" className="flex-1 overflow-y-auto mt-0">
              <StateEntriesTable entries={inspector.entries} onSelect={setSelectedItem} />
            </TabsContent>

            <TabsContent value="stream" className="flex-1 min-h-0 mt-0">
              <EventStream
                events={inspector.logEntries}
                paused={inspector.paused}
                bufferedCount={inspector.bufferedCount}
                onSelect={setSelectedItem}
                onResume={() => inspector.setPaused(false)}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right: detail */}
        <div className="w-1/2 min-h-0">
          <EntryDetail item={selectedItem} domains={inspector.domains} />
        </div>
      </div>

      {/* Footer: diagnostics */}
      <div className="flex items-center gap-4 px-3 py-1.5 border-t text-[10px] text-muted-foreground font-mono bg-muted/30 shrink-0">
        <span>Domains: {inspector.domainCount}</span>
        <span>Entries: {inspector.entryCount}</span>
        <span>Subscribers: {inspector.subscriberCount}</span>
        <span>
          Log: {inspector.logSize}/{inspector.logCapacity}
        </span>
      </div>
    </div>
  );
}
