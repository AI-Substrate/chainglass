/**
 * MRU Tracker — Tracks most-recently-used command IDs for palette ordering.
 *
 * Maintains an ordered list of recently executed command IDs.
 * Capped at 20 entries. Persisted to sdkMru in WorkspacePreferences.
 *
 * Per Plan 047 Phase 3, Task T004. OQ-3: MRU first, then alphabetical.
 */

const MAX_MRU = 20;

export class MruTracker {
  private items: string[];

  constructor(initial: string[] = []) {
    this.items = initial.slice(0, MAX_MRU);
  }

  /** Record a command execution — moves it to front, deduplicates, caps at 20. */
  recordExecution(commandId: string): void {
    this.items = [commandId, ...this.items.filter((id) => id !== commandId)].slice(0, MAX_MRU);
  }

  /** Get the ordered list of MRU command IDs (most recent first). */
  getOrder(): string[] {
    return [...this.items];
  }

  /** Get the raw list for persistence. */
  toArray(): string[] {
    return [...this.items];
  }
}
