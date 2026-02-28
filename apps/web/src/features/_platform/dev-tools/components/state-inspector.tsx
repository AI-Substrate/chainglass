'use client';

/**
 * Plan 056: StateInspector Main Panel
 *
 * Tabs: Domains / Snapshot / Stream (DYK-35).
 * 50/50 split with detail panel. Diagnostics footer.
 * AC-16, AC-17: live diagnostics. AC-21, AC-22: throttled, no perf degradation.
 */

import { Pause, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStateInspector } from '../hooks/use-state-inspector';
import { DomainOverview } from './domain-overview';
import { type DetailItem, EntryDetail } from './entry-detail';
import { EventStream } from './event-stream';
import { StateEntriesTable } from './state-entries-table';

export function StateInspector() {
  const inspector = useStateInspector();
  const [selectedItem, setSelectedItem] = useState<DetailItem | null>(null);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2 shrink-0">
        <h1 className="text-sm font-semibold">State Inspector</h1>

        <div className="flex items-center gap-1">
          {/* Domain filter chips */}
          <div className="flex items-center gap-1 mr-2">
            <button
              type="button"
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                inspector.domainFilter === null
                  ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
              onClick={() => inspector.setDomainFilter(null)}
            >
              all
            </button>
            {inspector.domains.map((d) => (
              <button
                type="button"
                key={d.domain}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                  inspector.domainFilter === d.domain
                    ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
                onClick={() =>
                  inspector.setDomainFilter(inspector.domainFilter === d.domain ? null : d.domain)
                }
              >
                {d.domain}
              </button>
            ))}
          </div>

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
          <Tabs defaultValue="stream" className="flex flex-col flex-1 min-h-0">
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
              <DomainOverview domains={inspector.domains} />
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
