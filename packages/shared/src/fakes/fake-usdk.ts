/**
 * FakeUSDK — Test double for the IUSDK interface.
 *
 * Per Constitution P2: Fake before real implementation.
 * Per Constitution P4: Fakes over mocks.
 * Per Workshop 001 §8.1: FakeUSDK with inspection methods.
 *
 * Provides:
 * - FakeCommandRegistry, FakeSettingsStore, FakeContextKeyService
 * - createFakeUSDK() factory with inspection methods
 */

import type { z } from 'zod';

import type {
  ICommandRegistry,
  IContextKeyService,
  ISDKSettings,
  IUSDK,
} from '../interfaces/sdk.interface.js';
import type { SDKCommand, SDKSetting } from '../sdk/types.js';

// ==================== FakeCommandRegistry ====================

export class FakeCommandRegistry implements ICommandRegistry {
  private readonly commands = new Map<string, SDKCommand>();
  private readonly executionLog: Array<{ id: string; params: unknown }> = [];
  private readonly contextKeys?: IContextKeyService;

  constructor(contextKeys?: IContextKeyService) {
    this.contextKeys = contextKeys;
  }

  register(command: SDKCommand): { dispose: () => void } {
    if (this.commands.has(command.id)) {
      throw new Error(
        `SDK command '${command.id}' is already registered. Each command ID must have a single owner.`
      );
    }
    this.commands.set(command.id, command);
    return {
      dispose: () => {
        this.commands.delete(command.id);
      },
    };
  }

  async execute(id: string, params?: unknown): Promise<void> {
    const cmd = this.commands.get(id);
    if (!cmd) {
      throw new Error(`SDK command '${id}' is not registered.`);
    }

    const validated = cmd.params.parse(params ?? {});
    this.executionLog.push({ id, params: validated });

    try {
      await cmd.handler(validated);
    } catch (error) {
      console.error(`[SDK] Command '${id}' failed:`, error);
    }
  }

  list(filter?: { domain?: string }): SDKCommand[] {
    const all = [...this.commands.values()];
    if (filter?.domain) {
      return all.filter((c) => c.domain === filter.domain);
    }
    return all;
  }

  isAvailable(id: string): boolean {
    const cmd = this.commands.get(id);
    if (!cmd) return false;
    if (this.contextKeys) {
      return this.contextKeys.evaluate(cmd.when);
    }
    return true;
  }

  // === Inspection methods (test helpers) ===

  getRegisteredCommands(): SDKCommand[] {
    return [...this.commands.values()];
  }

  getExecutionLog(): Array<{ id: string; params: unknown }> {
    return [...this.executionLog];
  }

  clear(): void {
    this.commands.clear();
    this.executionLog.length = 0;
  }
}

// ==================== FakeSettingsStore ====================

interface SettingsEntry {
  definition: SDKSetting;
  value: unknown;
  isOverridden: boolean;
}

export class FakeSettingsStore implements ISDKSettings {
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

  // === Inspection methods ===

  getContributedSettings(): SDKSetting[] {
    return [...this.entries.values()].map((e) => e.definition);
  }

  getEntry(key: string): { value: unknown; isOverridden: boolean } | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    return { value: entry.value, isOverridden: entry.isOverridden };
  }

  clear(): void {
    this.entries.clear();
    this.listeners.clear();
    this.persistedValues = {};
  }
}

// ==================== FakeContextKeyService ====================

export class FakeContextKeyService implements IContextKeyService {
  private readonly keys = new Map<string, unknown>();
  private readonly changeListeners = new Set<(key: string, value: unknown) => void>();

  set(key: string, value: unknown): void {
    this.keys.set(key, value);
    for (const cb of this.changeListeners) cb(key, value);
  }

  get(key: string): unknown {
    return this.keys.get(key);
  }

  evaluate(expression: string | undefined): boolean {
    if (!expression || expression.trim() === '') return true;

    const expr = expression.trim();

    // Negation: !key
    if (expr.startsWith('!')) {
      const key = expr.slice(1).trim();
      return !this.keys.get(key);
    }

    // Equality: key == value
    if (expr.includes('==')) {
      const [key, val] = expr.split('==').map((s) => s.trim());
      const current = this.keys.get(key);
      if (current === undefined) return false;
      return String(current) === val;
    }

    // Simple truthy: key
    return !!this.keys.get(expr);
  }

  onChange(callback: (key: string, value: unknown) => void): { dispose: () => void } {
    this.changeListeners.add(callback);
    return {
      dispose: () => {
        this.changeListeners.delete(callback);
      },
    };
  }

  // === Inspection methods ===

  getContextKeys(): Map<string, unknown> {
    return new Map(this.keys);
  }

  clear(): void {
    this.keys.clear();
    this.changeListeners.clear();
  }
}

// ==================== FakeUSDK Factory ====================

export interface FakeUSDKInstance extends IUSDK {
  /** Inspect registered commands */
  getRegisteredCommands(): SDKCommand[];
  /** Inspect executed commands */
  getExecutionLog(): Array<{ id: string; params: unknown }>;
  /** Inspect contributed settings */
  getContributedSettings(): SDKSetting[];
  /** Inspect set context keys */
  getContextKeys(): Map<string, unknown>;
  /** Reset all state */
  clear(): void;
}

/**
 * Create a FakeUSDK instance for testing.
 * Provides the full IUSDK interface plus inspection methods.
 */
export function createFakeUSDK(): FakeUSDKInstance {
  const context = new FakeContextKeyService();
  const commands = new FakeCommandRegistry(context);
  const settings = new FakeSettingsStore();

  return {
    commands,
    settings,
    context,
    toast: {
      success: (msg) => {
        commands
          .getExecutionLog()
          .push({ id: 'toast.show', params: { message: msg, type: 'success' } });
      },
      error: (msg) => {
        commands
          .getExecutionLog()
          .push({ id: 'toast.show', params: { message: msg, type: 'error' } });
      },
      info: (msg) => {
        commands
          .getExecutionLog()
          .push({ id: 'toast.show', params: { message: msg, type: 'info' } });
      },
      warning: (msg) => {
        commands
          .getExecutionLog()
          .push({ id: 'toast.show', params: { message: msg, type: 'warning' } });
      },
    },
    getRegisteredCommands: () => commands.getRegisteredCommands(),
    getExecutionLog: () => commands.getExecutionLog(),
    getContributedSettings: () => settings.getContributedSettings(),
    getContextKeys: () => context.getContextKeys(),
    clear: () => {
      commands.clear();
      settings.clear();
      context.clear();
    },
  };
}
