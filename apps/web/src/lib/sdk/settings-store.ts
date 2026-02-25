/**
 * SettingsStore — Real implementation of ISDKSettings.
 *
 * In-memory store backed by hydrate() for persistence loading.
 * DYK-02: get() returns stable references for useSyncExternalStore.
 *
 * Per Plan 047 Phase 1, Task T007. Per Workshop 003 §4.
 */

import type { ISDKSettings } from '@chainglass/shared/sdk';
import type { SDKSetting } from '@chainglass/shared/sdk';

interface SettingsEntry {
  definition: SDKSetting;
  value: unknown;
  isOverridden: boolean;
}

export class SettingsStore implements ISDKSettings {
  private readonly entries = new Map<string, SettingsEntry>();
  private readonly listeners = new Map<string, Set<(value: unknown) => void>>();
  private persistedValues: Record<string, unknown> = {};

  hydrate(sdkSettings: Record<string, unknown>): void {
    this.persistedValues = { ...sdkSettings };

    for (const [key, entry] of this.entries) {
      if (key in this.persistedValues) {
        const result = entry.definition.schema.safeParse(this.persistedValues[key]);
        if (result.success) {
          entry.value = result.data;
          entry.isOverridden = true;
        }
      }
    }
  }

  contribute(setting: SDKSetting): void {
    const defaultValue = setting.schema.parse(undefined);

    const persisted = this.persistedValues[setting.key];
    let value = defaultValue;
    let isOverridden = false;

    if (persisted !== undefined) {
      const result = setting.schema.safeParse(persisted);
      if (result.success) {
        value = result.data;
        isOverridden = true;
      }
    }

    this.entries.set(setting.key, { definition: setting, value, isOverridden });
  }

  // DYK-02: Returns the EXACT same reference stored in the entry.
  // No defensive copies — required for useSyncExternalStore.
  get(key: string): unknown {
    return this.entries.get(key)?.value;
  }

  set(key: string, value: unknown): void {
    const entry = this.entries.get(key);
    if (!entry) throw new Error(`Unknown setting: ${key}`);

    const parsed = entry.definition.schema.parse(value);
    entry.value = parsed;
    entry.isOverridden = true;

    {
      const cbs = this.listeners.get(key);
      if (cbs) {
        for (const cb of cbs) cb(parsed);
      }
    }
  }

  reset(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;

    const defaultValue = entry.definition.schema.parse(undefined);
    entry.value = defaultValue;
    entry.isOverridden = false;

    {
      const cbs = this.listeners.get(key);
      if (cbs) {
        for (const cb of cbs) cb(defaultValue);
      }
    }
  }

  onChange(key: string, callback: (value: unknown) => void): { dispose: () => void } {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)?.add(callback);
    return {
      dispose: () => {
        this.listeners.get(key)?.delete(callback);
      },
    };
  }

  list(): SDKSetting[] {
    return [...this.entries.values()].map((e) => e.definition);
  }

  toPersistedRecord(): Record<string, unknown> {
    const record: Record<string, unknown> = {};
    for (const [key, entry] of this.entries) {
      if (entry.isOverridden) {
        record[key] = entry.value;
      }
    }
    return record;
  }
}
