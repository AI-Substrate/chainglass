/**
 * FakeWorkUnitService for testing.
 *
 * Per Discovery 08: Fakes need call capture for CLI testing.
 * This fake captures all list(), load(), create(), validate() calls
 * for test assertions and can be configured with preset results.
 * Per Plan 021: All methods accept WorkspaceContext as first parameter (ignored by fake).
 */

import type { WorkspaceContext } from '@chainglass/workflow';

import type {
  IWorkUnitService,
  UnitCreateResult,
  UnitListResult,
  UnitLoadResult,
  UnitValidateResult,
  WorkUnitSummary,
} from '../interfaces/index.js';

// ============================================
// Call Types (with ctx for workspace tracking)
// ============================================

export interface ListCall {
  ctx: WorkspaceContext;
  timestamp: string;
  result: UnitListResult;
}

export interface LoadCall {
  ctx: WorkspaceContext;
  slug: string;
  timestamp: string;
  result: UnitLoadResult;
}

export interface CreateCall {
  ctx: WorkspaceContext;
  slug: string;
  type: 'agent' | 'code' | 'user-input';
  timestamp: string;
  result: UnitCreateResult;
}

export interface ValidateCall {
  ctx: WorkspaceContext;
  slug: string;
  timestamp: string;
  result: UnitValidateResult;
}

// ============================================
// Fake Implementation
// ============================================

/**
 * Fake WorkUnit service for testing.
 * Uses composite keys (worktreePath|slug) for workspace isolation.
 */
export class FakeWorkUnitService implements IWorkUnitService {
  private listCalls: ListCall[] = [];
  private loadCalls: LoadCall[] = [];
  private createCalls: CreateCall[] = [];
  private validateCalls: ValidateCall[] = [];

  private presetListResults = new Map<string, UnitListResult>();
  private presetLoadResults = new Map<string, UnitLoadResult>();
  private presetCreateResults = new Map<string, UnitCreateResult>();
  private presetValidateResults = new Map<string, UnitValidateResult>();

  private defaultUnits: WorkUnitSummary[] = [];

  // ==================== Key Helper ====================

  private getKey(ctx: WorkspaceContext, slug?: string): string {
    return slug ? `${ctx.worktreePath}|${slug}` : ctx.worktreePath;
  }

  // ==================== List ====================

  getListCalls(): ListCall[] {
    return [...this.listCalls];
  }

  getLastListCall(): ListCall | null {
    return this.listCalls.length > 0 ? this.listCalls[this.listCalls.length - 1] : null;
  }

  setPresetListResult(ctx: WorkspaceContext, result: UnitListResult): void {
    this.presetListResults.set(this.getKey(ctx), result);
  }

  setDefaultUnits(units: WorkUnitSummary[]): void {
    this.defaultUnits = units;
  }

  async list(ctx: WorkspaceContext): Promise<UnitListResult> {
    const key = this.getKey(ctx);
    const result = this.presetListResults.get(key) ?? {
      units: this.defaultUnits,
      errors: [],
    };

    this.listCalls.push({
      ctx,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== Load ====================

  getLoadCalls(): LoadCall[] {
    return [...this.loadCalls];
  }

  getLastLoadCall(): LoadCall | null {
    return this.loadCalls.length > 0 ? this.loadCalls[this.loadCalls.length - 1] : null;
  }

  setPresetLoadResult(ctx: WorkspaceContext, slug: string, result: UnitLoadResult): void {
    this.presetLoadResults.set(this.getKey(ctx, slug), result);
  }

  async load(ctx: WorkspaceContext, slug: string): Promise<UnitLoadResult> {
    const key = this.getKey(ctx, slug);
    const result = this.presetLoadResults.get(key) ?? {
      unit: undefined,
      errors: [
        {
          code: 'E120',
          message: `Unit '${slug}' not found`,
          action: `Create the unit with: cg unit create ${slug} --type agent`,
        },
      ],
    };

    this.loadCalls.push({
      ctx,
      slug,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== Create ====================

  getCreateCalls(): CreateCall[] {
    return [...this.createCalls];
  }

  getLastCreateCall(): CreateCall | null {
    return this.createCalls.length > 0 ? this.createCalls[this.createCalls.length - 1] : null;
  }

  setPresetCreateResult(ctx: WorkspaceContext, slug: string, result: UnitCreateResult): void {
    this.presetCreateResults.set(this.getKey(ctx, slug), result);
  }

  async create(
    ctx: WorkspaceContext,
    slug: string,
    type: 'agent' | 'code' | 'user-input'
  ): Promise<UnitCreateResult> {
    const key = this.getKey(ctx, slug);
    const result = this.presetCreateResults.get(key) ?? {
      slug,
      path: `.chainglass/data/units/${slug}`,
      errors: [],
    };

    this.createCalls.push({
      ctx,
      slug,
      type,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== Validate ====================

  getValidateCalls(): ValidateCall[] {
    return [...this.validateCalls];
  }

  getLastValidateCall(): ValidateCall | null {
    return this.validateCalls.length > 0 ? this.validateCalls[this.validateCalls.length - 1] : null;
  }

  setPresetValidateResult(ctx: WorkspaceContext, slug: string, result: UnitValidateResult): void {
    this.presetValidateResults.set(this.getKey(ctx, slug), result);
  }

  async validate(ctx: WorkspaceContext, slug: string): Promise<UnitValidateResult> {
    const key = this.getKey(ctx, slug);
    const result = this.presetValidateResults.get(key) ?? {
      slug,
      valid: true,
      issues: [],
      errors: [],
    };

    this.validateCalls.push({
      ctx,
      slug,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== Reset ====================

  reset(): void {
    this.listCalls = [];
    this.loadCalls = [];
    this.createCalls = [];
    this.validateCalls = [];
    this.presetListResults.clear();
    this.presetLoadResults.clear();
    this.presetCreateResults.clear();
    this.presetValidateResults.clear();
    this.defaultUnits = [];
  }
}
