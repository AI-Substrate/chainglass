/**
 * Plan 059 Phase 2: FakeWorkUnitStateService
 *
 * In-memory test double for IWorkUnitStateService with inspection methods.
 * Used in contract tests and any consumer tests that need a work unit registry.
 */

import type { IWorkUnitStateService } from '../interfaces/work-unit-state.interface.js';
import type {
  RegisterWorkUnitInput,
  UpdateWorkUnitInput,
  WorkUnitEntry,
  WorkUnitFilter,
} from '../work-unit-state/types.js';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export class FakeWorkUnitStateService implements IWorkUnitStateService {
  private readonly entries = new Map<string, WorkUnitEntry>();

  register(input: RegisterWorkUnitInput): void {
    const now = new Date().toISOString();
    const entry: WorkUnitEntry = {
      id: input.id,
      name: input.name,
      status: input.status ?? 'idle',
      creator: input.creator,
      intent: input.intent,
      sourceRef: input.sourceRef,
      registeredAt: now,
      lastActivityAt: now,
    };
    this.entries.set(input.id, entry);
    this.tidyUp();
  }

  unregister(id: string): void {
    this.entries.delete(id);
  }

  updateStatus(id: string, input: UpdateWorkUnitInput): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.status = input.status;
    if (input.intent !== undefined) {
      entry.intent = input.intent;
    }
    entry.lastActivityAt = new Date().toISOString();
  }

  getUnit(id: string): WorkUnitEntry | undefined {
    return this.entries.get(id);
  }

  getUnits(filter?: WorkUnitFilter): WorkUnitEntry[] {
    let result = Array.from(this.entries.values());
    if (filter?.status) {
      result = result.filter((e) => e.status === filter.status);
    }
    if (filter?.creatorType) {
      result = result.filter((e) => e.creator.type === filter.creatorType);
    }
    return result;
  }

  getUnitBySourceRef(graphSlug: string, nodeId: string): WorkUnitEntry | undefined {
    for (const entry of this.entries.values()) {
      if (entry.sourceRef?.graphSlug === graphSlug && entry.sourceRef?.nodeId === nodeId) {
        return entry;
      }
    }
    return undefined;
  }

  tidyUp(): void {
    const now = Date.now();
    const protectedStatuses = new Set(['working', 'waiting_input']);
    for (const [id, entry] of this.entries) {
      if (protectedStatuses.has(entry.status)) continue;
      const age = now - new Date(entry.lastActivityAt).getTime();
      if (age > TWENTY_FOUR_HOURS_MS) {
        this.entries.delete(id);
      }
    }
  }

  // ── Inspection Methods (test-only) ──

  /** Get all registered entries (snapshot). */
  getRegistered(): readonly WorkUnitEntry[] {
    return Array.from(this.entries.values());
  }

  /** Get number of registered entries. */
  getRegisteredCount(): number {
    return this.entries.size;
  }

  /** Clear all entries. */
  reset(): void {
    this.entries.clear();
  }
}
