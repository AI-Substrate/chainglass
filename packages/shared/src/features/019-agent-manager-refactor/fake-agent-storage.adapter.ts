/**
 * Plan 019: Agent Manager Refactor - Fake Agent Storage Adapter
 *
 * In-memory test double for IAgentStorageAdapter.
 * Provides test helpers for state inspection and error injection.
 *
 * Per AC-28: Test double design with helpers pattern.
 * Per DYK-05: Used in contract tests alongside Real implementation.
 */

import type { AgentStoredEvent } from './agent-instance.interface.js';
import type {
  AgentInstanceData,
  AgentRegistryEntry,
  IAgentStorageAdapter,
} from './agent-storage.interface.js';

/**
 * FakeAgentStorageAdapter is the in-memory test double for agent storage.
 *
 * Provides:
 * - Full IAgentStorageAdapter implementation backed by Maps
 * - Test helpers for state inspection (getSavedInstances, getAppendedEvents)
 * - Test helpers for state setup (setAgents, setInstance, setEvents)
 * - Error injection via setError()
 * - reset() for test isolation
 *
 * Usage:
 * ```typescript
 * const fake = new FakeAgentStorageAdapter();
 *
 * // Test setup
 * fake.setAgents([{ id: 'a1', workspace: '/proj', createdAt: '2026-01-01T00:00:00Z' }]);
 * fake.setInstance({ id: 'a1', name: 'chat', ... });
 *
 * // Use via interface
 * const agents = await fake.listAgents();
 *
 * // Inspect state
 * const saved = fake.getSavedInstances();
 * expect(saved.get('a1')).toBeDefined();
 *
 * // Error injection
 * fake.setError(new Error('disk full'));
 * await expect(fake.saveInstance(data)).rejects.toThrow('disk full');
 *
 * // Reset between tests
 * fake.reset();
 * ```
 */
export class FakeAgentStorageAdapter implements IAgentStorageAdapter {
  private _registry = new Map<string, AgentRegistryEntry>();
  private _instances = new Map<string, AgentInstanceData>();
  private _events = new Map<string, AgentStoredEvent[]>();
  private _error: Error | null = null;

  // ===== IAgentStorageAdapter Implementation =====

  async registerAgent(entry: AgentRegistryEntry): Promise<void> {
    this._throwIfError();
    this._registry.set(entry.id, { ...entry });
  }

  async unregisterAgent(agentId: string): Promise<void> {
    this._throwIfError();
    this._registry.delete(agentId);
    this._instances.delete(agentId);
    this._events.delete(agentId);
  }

  async listAgents(): Promise<AgentRegistryEntry[]> {
    this._throwIfError();
    return Array.from(this._registry.values());
  }

  async saveInstance(data: AgentInstanceData): Promise<void> {
    this._throwIfError();
    this._instances.set(data.id, { ...data });
  }

  async loadInstance(agentId: string): Promise<AgentInstanceData | null> {
    this._throwIfError();
    const data = this._instances.get(agentId);
    return data ? { ...data } : null;
  }

  async appendEvent(agentId: string, event: AgentStoredEvent): Promise<void> {
    this._throwIfError();
    const events = this._events.get(agentId) ?? [];
    events.push({ ...event });
    this._events.set(agentId, events);
  }

  async getEvents(agentId: string): Promise<AgentStoredEvent[]> {
    this._throwIfError();
    const events = this._events.get(agentId) ?? [];
    return events.map((e) => ({ ...e }));
  }

  async getEventsSince(agentId: string, sinceId: string): Promise<AgentStoredEvent[]> {
    this._throwIfError();
    const events = this._events.get(agentId) ?? [];
    const sinceIndex = events.findIndex((e) => e.eventId === sinceId);
    if (sinceIndex === -1) {
      // sinceId not found - return all events (per AC-10 graceful handling)
      return events.map((e) => ({ ...e }));
    }
    return events.slice(sinceIndex + 1).map((e) => ({ ...e }));
  }

  // ===== Test Helpers: State Setup =====

  /**
   * Set registry entries directly for test setup.
   */
  setAgents(entries: AgentRegistryEntry[]): void {
    this._registry.clear();
    for (const entry of entries) {
      this._registry.set(entry.id, { ...entry });
    }
  }

  /**
   * Set instance data directly for test setup.
   */
  setInstance(data: AgentInstanceData): void {
    this._instances.set(data.id, { ...data });
  }

  /**
   * Set events directly for test setup.
   */
  setEvents(agentId: string, events: AgentStoredEvent[]): void {
    this._events.set(
      agentId,
      events.map((e) => ({ ...e }))
    );
  }

  // ===== Test Helpers: State Inspection =====

  /**
   * Get all saved instances for assertions.
   * Returns the internal Map (read-only use recommended).
   */
  getSavedInstances(): Map<string, AgentInstanceData> {
    return new Map(Array.from(this._instances.entries()).map(([k, v]) => [k, { ...v }]));
  }

  /**
   * Get all appended events for assertions.
   * Returns the internal Map (read-only use recommended).
   */
  getAppendedEvents(): Map<string, AgentStoredEvent[]> {
    return new Map(
      Array.from(this._events.entries()).map(([k, v]) => [k, v.map((e) => ({ ...e }))])
    );
  }

  /**
   * Get registry entries for assertions.
   */
  getRegistry(): Map<string, AgentRegistryEntry> {
    return new Map(Array.from(this._registry.entries()).map(([k, v]) => [k, { ...v }]));
  }

  // ===== Test Helpers: Error Injection =====

  /**
   * Set an error to be thrown on next operation.
   * Pass null to clear.
   */
  setError(error: Error | null): void {
    this._error = error;
  }

  private _throwIfError(): void {
    if (this._error) {
      const err = this._error;
      // Don't clear error automatically - caller must call setError(null)
      throw err;
    }
  }

  // ===== Test Helpers: Reset =====

  /**
   * Reset all state for test isolation.
   */
  reset(): void {
    this._registry.clear();
    this._instances.clear();
    this._events.clear();
    this._error = null;
  }
}
