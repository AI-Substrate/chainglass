'use client';

/**
 * SettingsPage — Domain-organised settings UI.
 *
 * Reads sdk.settings.list(), groups by section, renders SettingControl per setting.
 * DYK-P5-01: Demo settings registered in bootstrap for dogfooding.
 * DYK-P5-05: Conditional worktree section when workspace context available.
 *
 * Per Plan 047 Phase 5, Task T004. AC-21, AC-23.
 */

import type { SDKSetting } from '@chainglass/shared/sdk';
import { Settings } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useSDK } from '@/lib/sdk/sdk-provider';

import { SettingControl } from './setting-control';
import { SettingsSearch } from './settings-search';

interface SettingsPageProps {
  slug: string;
}

/** Group settings by section (falls back to domain name). */
function groupBySection(settings: SDKSetting[]): Map<string, SDKSetting[]> {
  const groups = new Map<string, SDKSetting[]>();
  for (const setting of settings) {
    const section = setting.section ?? setting.domain;
    const group = groups.get(section) ?? [];
    group.push(setting);
    groups.set(section, group);
  }
  // Sort sections alphabetically
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

/** Filter settings by search query (label or description, case-insensitive). */
function filterSettings(settings: SDKSetting[], query: string): SDKSetting[] {
  if (!query) return settings;
  const lower = query.toLowerCase();
  return settings.filter(
    (s) =>
      s.label.toLowerCase().includes(lower) ||
      (s.description?.toLowerCase().includes(lower) ?? false)
  );
}

export function SettingsPage({ slug: _slug }: SettingsPageProps) {
  const sdk = useSDK();
  const [search, setSearch] = useState('');

  const allSettings = useMemo(() => sdk.settings.list(), [sdk]);
  const filtered = useMemo(() => filterSettings(allSettings, search), [allSettings, search]);
  const grouped = useMemo(() => groupBySection(filtered), [filtered]);

  return (
    <div className="h-[calc(100vh-4rem)] overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Settings</h1>
        </div>

        <div className="mb-6">
          <SettingsSearch
            value={search}
            onChange={setSearch}
            matchCount={filtered.length}
            totalCount={allSettings.length}
          />
        </div>

        {grouped.size === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            {search ? 'No settings match your search' : 'No settings available'}
          </div>
        ) : (
          <div className="space-y-8">
            {[...grouped.entries()].map(([section, settings]) => (
              <div key={section}>
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2 border-b pb-2">
                  {section}
                </h2>
                <div className="divide-y">
                  {settings.map((setting) => (
                    <SettingControl key={setting.key} setting={setting} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
