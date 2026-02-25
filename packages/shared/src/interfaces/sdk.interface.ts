/**
 * SDK interfaces for the USDK (Us SDK) framework.
 *
 * Per Plan 047: USDK — Internal SDK System for Chainglass.
 * Per R-ARCH-002: Interfaces in packages/shared/src/interfaces/.
 * Per R-CODE-003: File uses .interface.ts suffix.
 *
 * These interfaces define the public contract for the SDK framework.
 * Implementations live in apps/web/src/lib/sdk/ (app-specific, client-only).
 * FakeUSDK lives in packages/shared/src/fakes/ (test double).
 */

import type { z } from 'zod';

// Re-export value types used in signatures
import type { SDKCommand, SDKKeybinding, SDKSetting } from '../sdk/types.js';

// ==================== Command Registry ====================

/**
 * Registry for SDK commands.
 *
 * Commands are registered by domains at bootstrap time and executed
 * by consumers (command palette, keyboard shortcuts, programmatic calls).
 *
 * DYK-01: register() throws if command ID is already registered.
 * DYK-05: execute() wraps handler in try/catch — never crashes caller.
 */
export interface ICommandRegistry {
  /**
   * Register a command. Throws if ID is already registered (single-owner, fail-fast).
   * @returns Disposable to unregister the command.
   */
  register(command: SDKCommand): { dispose: () => void };

  /**
   * Execute a command by ID. Validates params with Zod schema.
   * Wraps handler in try/catch — on error, logs and shows toast (never propagates).
   * Throws ZodError if params are invalid (before handler is called).
   * @throws Error if command ID is not registered.
   */
  execute(id: string, params?: unknown): Promise<void>;

  /**
   * List all registered commands, optionally filtered by domain.
   */
  list(filter?: { domain?: string }): SDKCommand[];

  /**
   * Check if a command is available (registered and when-clause passes).
   */
  isAvailable(id: string): boolean;
}

// ==================== Settings Store ====================

/**
 * Store for domain-contributed SDK settings.
 *
 * Settings are contributed at bootstrap time with Zod schemas and defaults.
 * Values are read/written in-memory; persistence is handled externally
 * via onSettingsPersist callback.
 *
 * DYK-02: get() MUST return stable object references (same identity when
 * value unchanged). Required for useSyncExternalStore in React hooks.
 */
export interface ISDKSettings {
  /**
   * Seed the store with persisted values from server (before domain contributions).
   */
  hydrate(sdkSettings: Record<string, unknown>): void;

  /**
   * Contribute a setting definition from a domain.
   * If a persisted override exists (from hydrate), it's applied immediately.
   */
  contribute(setting: SDKSetting): void;

  /**
   * Get current value for a setting key. Returns undefined if not contributed.
   *
   * DYK-02: Returns the EXACT same reference stored in the entry.
   * Callers MUST NOT mutate the returned value. Consecutive calls with
   * no intervening set() return Object.is-equal references.
   */
  get(key: string): unknown;

  /**
   * Set a value. Validates against Zod schema, updates in-memory, fires onChange.
   * Does NOT persist — caller must persist separately.
   * @throws ZodError if value fails schema validation.
   */
  set(key: string, value: unknown): void;

  /**
   * Reset a setting to its schema default. Fires onChange listeners.
   */
  reset(key: string): void;

  /**
   * Subscribe to changes for a specific setting key.
   * Callback receives the new value after validation.
   * @returns Disposable to unsubscribe.
   */
  onChange(key: string, callback: (value: unknown) => void): { dispose: () => void };

  /**
   * List all contributed setting definitions.
   */
  list(): SDKSetting[];

  /**
   * Export only overridden values (not defaults) for persistence.
   */
  toPersistedRecord(): Record<string, unknown>;
}

// ==================== Context Key Service ====================

/**
 * In-memory context key store for when-clause evaluation.
 *
 * Context keys are ephemeral UI state set by components (e.g., "file-browser.hasOpenFile").
 * Commands and shortcuts use when-clauses to conditionally enable based on context.
 */
export interface IContextKeyService {
  /**
   * Set a context key value. Fires onChange listeners.
   */
  set(key: string, value: unknown): void;

  /**
   * Get a context key value. Returns undefined if not set.
   */
  get(key: string): unknown;

  /**
   * Evaluate a when-clause expression against current context.
   * Supported expressions:
   * - 'key' — truthy check (key is set and truthy)
   * - '!key' — negation (key is not set or falsy)
   * - 'key == value' — equality check
   * Returns true if expression evaluates true, false otherwise.
   * Returns true if expression is undefined/empty (no condition = always available).
   */
  evaluate(expression: string | undefined): boolean;

  /**
   * Subscribe to changes for any context key.
   * @returns Disposable to unsubscribe.
   */
  onChange(callback: (key: string, value: unknown) => void): { dispose: () => void };
}

// ==================== Keybinding Service ====================

/**
 * Service for registering and resolving keyboard shortcuts.
 *
 * Bindings map key combinations to command IDs with optional when-clauses.
 * Chord sequences (e.g., Ctrl+K Ctrl+C) are supported via space-separated keys.
 * DYK-P4-01: tinykeys owns chord resolution; this service manages registration
 * and when-clause filtering.
 * DYK-P4-05: Bindings are static (key→commandId). Command existence not checked
 * at registration — checked at fire time via isAvailable().
 */
export interface IKeybindingService {
  /**
   * Register a keybinding. Throws if key combination is already registered.
   * @returns Disposable to unregister the binding.
   */
  register(binding: SDKKeybinding): { dispose: () => void };

  /**
   * Get all registered keybindings.
   */
  getBindings(): SDKKeybinding[];

  /**
   * Build a tinykeys-compatible binding map.
   * Each entry maps a key string to a handler that checks when-clause
   * and executes the bound command.
   */
  buildTinykeysMap(
    execute: (commandId: string, args?: Record<string, unknown>) => Promise<void>,
    isAvailable: (commandId: string) => boolean
  ): Record<string, (event: KeyboardEvent) => void>;
}

// ==================== Top-Level SDK Facade ====================

/**
 * Top-level USDK facade — the single entry point for SDK consumers and publishers.
 *
 * DYK-03: SDKProvider is global (not workspace-scoped). Settings persistence
 * is lazy via onSettingsPersist callback — only active when workspace context
 * is available.
 */
export interface IUSDK {
  /** Command registry — register and execute SDK commands */
  readonly commands: ICommandRegistry;

  /** Settings store — contribute, read, write domain settings */
  readonly settings: ISDKSettings;

  /** Context key service — set and evaluate when-clause context */
  readonly context: IContextKeyService;

  /** Keybinding service — register and resolve keyboard shortcuts */
  readonly keybindings: IKeybindingService;

  /** Toast convenience methods (delegates to toast.show command) */
  readonly toast: {
    success(message: string): void;
    error(message: string): void;
    info(message: string): void;
    warning(message: string): void;
  };
}
