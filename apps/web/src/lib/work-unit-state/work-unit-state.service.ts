/**
 * Plan 059 Phase 2: WorkUnitStateService — Real Implementation
 *
 * Centralized in-memory registry for work unit status, backed by JSON
 * persistence and CentralEventNotifier SSE emission.
 *
 * Lifecycle:
 * 1. Constructed with workspace path + CEN
 * 2. Hydrates from JSON on first access (lazy)
 * 3. register/unregister/updateStatus mutate in-memory + persist + emit
 * 4. tidyUp called on hydration + register
 *
 * State paths: `work-unit-state:{id}:status`, `work-unit-state:{id}:intent`,
 * `work-unit-state:{id}:name`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ICentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events';
import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events';
import type { IWorkUnitStateService } from '@chainglass/shared/interfaces/work-unit-state.interface';
import type {
  RegisterWorkUnitInput,
  UpdateWorkUnitInput,
  WorkUnitEntry,
  WorkUnitFilter,
} from '@chainglass/shared/work-unit-state';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const DATA_FILE = 'work-unit-state.json';

interface PersistedData {
  entries: WorkUnitEntry[];
}

export class WorkUnitStateService implements IWorkUnitStateService {
  private readonly entries = new Map<string, WorkUnitEntry>();
  private hydrated = false;

  constructor(
    private readonly worktreePath: string,
    private readonly notifier: ICentralEventNotifier
  ) {}

  register(input: RegisterWorkUnitInput): void {
    this.ensureHydrated();
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
    this.persist();
    this.notifier.emit(WorkspaceDomain.WorkUnitState, 'registered', {
      type: 'registered',
      id: entry.id,
      name: entry.name,
      status: entry.status,
      creatorType: entry.creator.type,
      creatorLabel: entry.creator.label,
    });
  }

  unregister(id: string): void {
    this.ensureHydrated();
    if (!this.entries.has(id)) return;
    this.entries.delete(id);
    this.persist();
    this.notifier.emit(WorkspaceDomain.WorkUnitState, 'removed', {
      type: 'removed',
      id,
    });
  }

  updateStatus(id: string, input: UpdateWorkUnitInput): void {
    this.ensureHydrated();
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.status = input.status;
    if (input.intent !== undefined) {
      entry.intent = input.intent;
    }
    entry.lastActivityAt = new Date().toISOString();
    this.persist();
    this.notifier.emit(WorkspaceDomain.WorkUnitState, 'status-changed', {
      type: 'status-changed',
      id: entry.id,
      status: entry.status,
      intent: entry.intent,
      name: entry.name,
    });
  }

  getUnit(id: string): WorkUnitEntry | undefined {
    this.ensureHydrated();
    return this.entries.get(id);
  }

  getUnits(filter?: WorkUnitFilter): WorkUnitEntry[] {
    this.ensureHydrated();
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
    this.ensureHydrated();
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

  // ── Private ──

  private ensureHydrated(): void {
    if (this.hydrated) return;
    this.hydrated = true;
    this.loadFromDisk();
    this.tidyUp();
    this.persist();
  }

  private getDataPath(): string {
    return path.join(this.worktreePath, '.chainglass', 'data', DATA_FILE);
  }

  private loadFromDisk(): void {
    try {
      const filePath = this.getDataPath();
      if (!fs.existsSync(filePath)) return;
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data: PersistedData = JSON.parse(raw);
      if (Array.isArray(data.entries)) {
        for (const entry of data.entries) {
          this.entries.set(entry.id, entry);
        }
      }
    } catch {
      // Corrupt or missing file — start fresh
    }
  }

  private persist(): void {
    try {
      const filePath = this.getDataPath();
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      const data: PersistedData = {
        entries: Array.from(this.entries.values()),
      };
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // Best-effort persistence — don't crash on write failures
    }
  }
}
