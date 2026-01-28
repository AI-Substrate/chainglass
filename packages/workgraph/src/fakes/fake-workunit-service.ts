/**
 * FakeWorkUnitService for testing.
 *
 * Per Discovery 08: Fakes need call capture for CLI testing.
 * This fake captures all list(), load(), create(), validate() calls
 * for test assertions and can be configured with preset results.
 */

import type {
  IWorkUnitService,
  UnitCreateResult,
  UnitListResult,
  UnitLoadResult,
  UnitValidateResult,
  WorkUnitSummary,
} from '../interfaces/index.js';

// ============================================
// Call Types
// ============================================

export interface ListCall {
  timestamp: string;
  result: UnitListResult;
}

export interface LoadCall {
  slug: string;
  timestamp: string;
  result: UnitLoadResult;
}

export interface CreateCall {
  slug: string;
  type: 'agent' | 'code' | 'user-input';
  timestamp: string;
  result: UnitCreateResult;
}

export interface ValidateCall {
  slug: string;
  timestamp: string;
  result: UnitValidateResult;
}

// ============================================
// Fake Implementation
// ============================================

/**
 * Fake WorkUnit service for testing.
 */
export class FakeWorkUnitService implements IWorkUnitService {
  private listCalls: ListCall[] = [];
  private loadCalls: LoadCall[] = [];
  private createCalls: CreateCall[] = [];
  private validateCalls: ValidateCall[] = [];

  private presetListResult: UnitListResult | null = null;
  private presetLoadResults = new Map<string, UnitLoadResult>();
  private presetCreateResults = new Map<string, UnitCreateResult>();
  private presetValidateResults = new Map<string, UnitValidateResult>();

  private defaultUnits: WorkUnitSummary[] = [];

  // ==================== List ====================

  getListCalls(): ListCall[] {
    return [...this.listCalls];
  }

  getLastListCall(): ListCall | null {
    return this.listCalls.length > 0 ? this.listCalls[this.listCalls.length - 1] : null;
  }

  setPresetListResult(result: UnitListResult): void {
    this.presetListResult = result;
  }

  setDefaultUnits(units: WorkUnitSummary[]): void {
    this.defaultUnits = units;
  }

  async list(): Promise<UnitListResult> {
    const result = this.presetListResult ?? {
      units: this.defaultUnits,
      errors: [],
    };

    this.listCalls.push({
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

  setPresetLoadResult(slug: string, result: UnitLoadResult): void {
    this.presetLoadResults.set(slug, result);
  }

  async load(slug: string): Promise<UnitLoadResult> {
    const result = this.presetLoadResults.get(slug) ?? {
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

  setPresetCreateResult(slug: string, result: UnitCreateResult): void {
    this.presetCreateResults.set(slug, result);
  }

  async create(slug: string, type: 'agent' | 'code' | 'user-input'): Promise<UnitCreateResult> {
    const result = this.presetCreateResults.get(slug) ?? {
      slug,
      path: `.chainglass/units/${slug}`,
      errors: [],
    };

    this.createCalls.push({
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

  setPresetValidateResult(slug: string, result: UnitValidateResult): void {
    this.presetValidateResults.set(slug, result);
  }

  async validate(slug: string): Promise<UnitValidateResult> {
    const result = this.presetValidateResults.get(slug) ?? {
      slug,
      valid: true,
      issues: [],
      errors: [],
    };

    this.validateCalls.push({
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
    this.presetListResult = null;
    this.presetLoadResults.clear();
    this.presetCreateResults.clear();
    this.presetValidateResults.clear();
    this.defaultUnits = [];
  }
}
