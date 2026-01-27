/**
 * Fake sample adapter for testing.
 *
 * Per Phase 3: Sample Domain (Exemplar)
 * Per DYK-P3-05: Uses composite key `${worktreePath}|${slug}` for data isolation.
 * Per DYK Session: Uses three-part API pattern (state setup, inspection, error injection).
 *
 * Follows the established FakeWorkspaceRegistryAdapter pattern with:
 * - In-memory sample storage (Map<compositeKey, Sample>)
 * - Call tracking arrays with spread operator getters
 * - reset() helper for test isolation
 * - Error injection for testing error paths
 *
 * Per DYK-P3-02: Adapter owns updatedAt - overwrites on every save.
 */

import { Sample } from '../entities/sample.js';
import { EntityNotFoundError } from '../errors/entity-not-found.error.js';
import { SampleErrorCodes } from '../errors/sample-errors.js';
import type {
  ISampleAdapter,
  SampleRemoveResult,
  SampleSaveResult,
} from '../interfaces/sample-adapter.interface.js';
import type { WorkspaceContext } from '../interfaces/workspace-context.interface.js';

// ==================== Call Recording Types ====================

/**
 * Recorded load() call for test inspection.
 */
export interface SampleLoadCall {
  /** Workspace context */
  ctx: WorkspaceContext;
  /** Sample slug */
  slug: string;
}

/**
 * Recorded save() call for test inspection.
 */
export interface SampleSaveCall {
  /** Workspace context */
  ctx: WorkspaceContext;
  /** Sample being saved */
  sample: Sample;
}

/**
 * Recorded list() call for test inspection.
 */
export interface SampleListCall {
  /** Workspace context */
  ctx: WorkspaceContext;
  /** Timestamp of the call */
  timestamp: Date;
}

/**
 * Recorded remove() call for test inspection.
 */
export interface SampleRemoveCall {
  /** Workspace context */
  ctx: WorkspaceContext;
  /** Sample slug */
  slug: string;
}

/**
 * Recorded exists() call for test inspection.
 */
export interface SampleExistsCall {
  /** Workspace context */
  ctx: WorkspaceContext;
  /** Sample slug */
  slug: string;
}

// ==================== Fake Implementation ====================

/**
 * Fake sample adapter for testing.
 *
 * Implements ISampleAdapter with in-memory storage and call tracking.
 * Use in unit tests to avoid filesystem I/O and control adapter behavior.
 *
 * Three-part API:
 * 1. State Setup: Add samples via addSample() or save()
 * 2. State Inspection: Read calls via *Calls getters
 * 3. Error Injection: Set inject* flags to simulate errors
 *
 * Per DYK-P3-05: Uses composite key `${worktreePath}|${slug}` for data isolation.
 *
 * @example
 * ```typescript
 * const adapter = new FakeSampleAdapter();
 * const ctx = { worktreePath: '/path/to/worktree', ... };
 *
 * // State setup
 * adapter.addSample(ctx, Sample.create({ name: 'Test', description: 'Test' }));
 *
 * // Use adapter
 * const samples = await adapter.list(ctx);
 * expect(samples).toHaveLength(1);
 *
 * // Inspect calls
 * expect(adapter.listCalls).toHaveLength(1);
 *
 * // Error injection
 * adapter.injectSaveError = { code: 'E084', message: 'Invalid data' };
 * const result = await adapter.save(ctx, sample);
 * expect(result.ok).toBe(false);
 * ```
 */
export class FakeSampleAdapter implements ISampleAdapter {
  // ==================== In-Memory Storage ====================

  /**
   * In-memory sample storage by composite key.
   * Per DYK-P3-05: Key format is `${worktreePath}|${slug}`
   */
  private _samples: Map<string, Sample> = new Map();

  // ==================== Error Injection ====================

  /**
   * Inject a save error. When set, save() will return this error.
   * Set to undefined to disable error injection.
   */
  injectSaveError?: { code: string; message: string };

  /**
   * Inject a remove error. When set, remove() will return this error.
   * Set to undefined to disable error injection.
   */
  injectRemoveError?: { code: string; message: string };

  /**
   * Inject a load error. When set, load() will throw an error.
   * Set to undefined to disable error injection.
   */
  injectLoadError?: { code: string; message: string };

  // ==================== Private Call Tracking ====================

  private _loadCalls: SampleLoadCall[] = [];
  private _saveCalls: SampleSaveCall[] = [];
  private _listCalls: SampleListCall[] = [];
  private _removeCalls: SampleRemoveCall[] = [];
  private _existsCalls: SampleExistsCall[] = [];

  // ==================== Call Tracking Getters (immutable copies) ====================

  /**
   * Get all load() calls (returns a copy to prevent mutation).
   */
  get loadCalls(): SampleLoadCall[] {
    return [...this._loadCalls];
  }

  /**
   * Get all save() calls (returns a copy to prevent mutation).
   */
  get saveCalls(): SampleSaveCall[] {
    return [...this._saveCalls];
  }

  /**
   * Get all list() calls (returns a copy to prevent mutation).
   */
  get listCalls(): SampleListCall[] {
    return [...this._listCalls];
  }

  /**
   * Get all remove() calls (returns a copy to prevent mutation).
   */
  get removeCalls(): SampleRemoveCall[] {
    return [...this._removeCalls];
  }

  /**
   * Get all exists() calls (returns a copy to prevent mutation).
   */
  get existsCalls(): SampleExistsCall[] {
    return [...this._existsCalls];
  }

  // ==================== Key Generation ====================

  /**
   * Generate composite key for storage.
   * Per DYK-P3-05: Format is `${worktreePath}|${slug}`
   */
  private getKey(ctx: WorkspaceContext, slug: string): string {
    return `${ctx.worktreePath}|${slug}`;
  }

  /**
   * Check if a key belongs to a given context.
   */
  private keyBelongsToContext(key: string, ctx: WorkspaceContext): boolean {
    return key.startsWith(`${ctx.worktreePath}|`);
  }

  // ==================== State Setup Helpers ====================

  /**
   * Add a sample directly to the in-memory storage.
   * Use for test setup without going through save().
   *
   * @param ctx - Workspace context
   * @param sample - Sample to add
   */
  addSample(ctx: WorkspaceContext, sample: Sample): void {
    const key = this.getKey(ctx, sample.slug);
    this._samples.set(key, sample);
  }

  /**
   * Get all samples directly from in-memory storage for a context.
   * Use for test assertions without going through list().
   */
  getSamples(ctx: WorkspaceContext): Sample[] {
    const samples: Sample[] = [];
    for (const [key, sample] of this._samples) {
      if (this.keyBelongsToContext(key, ctx)) {
        samples.push(sample);
      }
    }
    return samples;
  }

  // ==================== Test Helpers ====================

  /**
   * Reset all state (storage, call tracking, error injection).
   * Call in beforeEach for test isolation.
   */
  reset(): void {
    // Clear storage
    this._samples.clear();

    // Clear error injection
    this.injectSaveError = undefined;
    this.injectRemoveError = undefined;
    this.injectLoadError = undefined;

    // Clear call tracking
    this._loadCalls = [];
    this._saveCalls = [];
    this._listCalls = [];
    this._removeCalls = [];
    this._existsCalls = [];
  }

  // ==================== ISampleAdapter Implementation ====================

  /**
   * Load a sample from in-memory storage.
   *
   * @param ctx - Workspace context
   * @param slug - Sample slug
   * @returns Sample if found
   * @throws EntityNotFoundError if sample not in storage
   */
  async load(ctx: WorkspaceContext, slug: string): Promise<Sample> {
    this._loadCalls.push({ ctx, slug });

    // Check for injected error
    if (this.injectLoadError) {
      throw new Error(this.injectLoadError.message);
    }

    const key = this.getKey(ctx, slug);
    const sample = this._samples.get(key);
    if (!sample) {
      throw new EntityNotFoundError(
        'Sample',
        slug,
        `${ctx.worktreePath}/.chainglass/data/samples (fake)`
      );
    }

    return sample;
  }

  /**
   * Save a sample to in-memory storage.
   *
   * Per DYK-P3-02: Overwrites updatedAt with current timestamp.
   *
   * @param ctx - Workspace context
   * @param sample - Sample to save
   * @returns SampleSaveResult with ok=true on success
   */
  async save(ctx: WorkspaceContext, sample: Sample): Promise<SampleSaveResult> {
    this._saveCalls.push({ ctx, sample });

    // Check for injected error
    if (this.injectSaveError) {
      return {
        ok: false,
        errorCode: this.injectSaveError.code as SampleSaveResult['errorCode'],
        errorMessage: this.injectSaveError.message,
      };
    }

    const key = this.getKey(ctx, sample.slug);
    const exists = this._samples.has(key);

    // Per DYK-P3-02: Adapter owns updatedAt - create new sample with fresh timestamp
    const updatedSample = Sample.create({
      name: sample.name,
      description: sample.description,
      slug: sample.slug,
      createdAt: sample.createdAt,
      updatedAt: new Date(), // Fresh timestamp
    });

    this._samples.set(key, updatedSample);
    return { ok: true, sample: updatedSample, created: !exists };
  }

  /**
   * List all samples from in-memory storage for a context.
   *
   * @param ctx - Workspace context
   * @returns Array of all samples in the context
   */
  async list(ctx: WorkspaceContext): Promise<Sample[]> {
    this._listCalls.push({ ctx, timestamp: new Date() });

    return this.getSamples(ctx);
  }

  /**
   * Remove a sample from in-memory storage.
   *
   * @param ctx - Workspace context
   * @param slug - Sample slug to remove
   * @returns SampleRemoveResult with ok=true on success
   */
  async remove(ctx: WorkspaceContext, slug: string): Promise<SampleRemoveResult> {
    this._removeCalls.push({ ctx, slug });

    // Check for injected error
    if (this.injectRemoveError) {
      return {
        ok: false,
        errorCode: this.injectRemoveError.code as SampleRemoveResult['errorCode'],
        errorMessage: this.injectRemoveError.message,
      };
    }

    const key = this.getKey(ctx, slug);

    // Check if sample exists
    if (!this._samples.has(key)) {
      return {
        ok: false,
        errorCode: SampleErrorCodes.SAMPLE_NOT_FOUND,
        errorMessage: `Sample '${slug}' not found`,
      };
    }

    // Remove sample
    this._samples.delete(key);
    return { ok: true };
  }

  /**
   * Check if a sample exists in in-memory storage.
   *
   * @param ctx - Workspace context
   * @param slug - Sample slug to check
   * @returns true if sample exists
   */
  async exists(ctx: WorkspaceContext, slug: string): Promise<boolean> {
    this._existsCalls.push({ ctx, slug });

    const key = this.getKey(ctx, slug);
    return this._samples.has(key);
  }
}
