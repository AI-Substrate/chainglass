/**
 * Plan 053: GlobalStateSystem — IStateService Interface
 *
 * Core interface for the centralized ephemeral runtime state system.
 * Domains publish runtime values to colon-delimited state paths;
 * consumers subscribe by path or pattern without coupling to publishers.
 *
 * Per Workshop 002: Consumers are read-only (useGlobalState returns a value,
 * not a tuple). Only publishers call publish().
 *
 * Per PL-01: Store is updated BEFORE subscribers are notified.
 * Per PL-07: Subscriber errors are isolated (try/catch per callback).
 * Per PL-08: Dispatch is strictly unidirectional — never calls back into publishers.
 */

import type {
  StateChange,
  StateChangeCallback,
  StateDomainDescriptor,
  StateEntry,
  StateEntrySource,
} from '../state/types.js';

export interface IStateService {
  // ── Domain Registration ──

  /**
   * Register a state domain descriptor. Call at bootstrap time.
   * Throws if the domain name is already registered (fail-fast, single-owner).
   */
  registerDomain(descriptor: StateDomainDescriptor): void;

  /**
   * List all registered domain descriptors.
   * Useful for introspection and devtools.
   */
  listDomains(): StateDomainDescriptor[];

  // ── Publishing (for domain publishers) ──

  /**
   * Set state at a path. Creates entry if new, updates if exists.
   * Notifies matching subscribers synchronously after updating the store.
   *
   * Throws if the domain is not registered (AC-08).
   * Throws if a singleton domain path has an instance ID (AC-13).
   * Throws if a multi-instance domain path lacks an instance ID (AC-14).
   *
   * Per PL-01: Store-first — value is stored BEFORE subscribers are notified.
   *
   * @param source Optional origin metadata for debugging (Workshop 005).
   *               ServerEventRoute passes `{ origin: 'server', channel, eventType }`.
   *               Omit for client-originated publishes (defaults to undefined).
   */
  publish<T>(path: string, value: T, source?: StateEntrySource): void;

  /**
   * Remove a specific state entry.
   * Notifies subscribers with `removed: true` in the StateChange.
   */
  remove(path: string): void;

  /**
   * Remove all state for a domain instance.
   * Removes all entries matching `domain:instanceId:*` and notifies
   * subscribers for each removed entry.
   */
  removeInstance(domain: string, instanceId: string): void;

  // ── Reading (for consumers) ──

  /**
   * Get current value at path. Returns undefined if not published.
   *
   * Returns stable object references — consecutive calls with no
   * intervening publish() return Object.is-equal values (AC-03).
   */
  get<T>(path: string): T | undefined;

  /**
   * List all entries matching a pattern.
   *
   * Returns a stable array reference when no matching values have
   * changed since the last call (AC-26). Uses internal version tracking.
   */
  list(pattern: string): StateEntry[];

  /**
   * List all known instance IDs for a multi-instance domain.
   */
  listInstances(domain: string): string[];

  // ── Subscriptions ──

  /**
   * Subscribe to state changes matching a pattern.
   * Returns an unsubscribe function.
   *
   * Pattern types:
   * - Exact: `'workflow:wf-1:status'` — matches only that path
   * - Domain wildcard: `'workflow:*:status'` — any instance, one property
   * - Instance wildcard: `'workflow:wf-1:*'` — one instance, all properties
   * - Domain-all: `'workflow:**'` — everything in the domain
   * - Global: `'*'` — all state changes
   *
   * Per PL-07: Subscriber errors are isolated — one throwing subscriber
   * does not prevent others from receiving the change.
   */
  subscribe(pattern: string, callback: StateChangeCallback): () => void;

  // ── Diagnostics ──

  /** Total number of active subscriptions. */
  readonly subscriberCount: number;

  /** Total number of stored state entries. */
  readonly entryCount: number;
}
