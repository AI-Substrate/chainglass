/**
 * Fake init service for testing.
 *
 * Per Phase 4 T006b: Test double for IInitService.
 * Follows the FakeWorkflowRegistry pattern with:
 * - Call capture for assertions
 * - Preset configuration for deterministic results
 * - Error injection for failure testing
 */

import type {
  IInitService,
  InitOptions,
  InitResult,
  InitializationStatus,
} from '../interfaces/init-service.interface.js';

/**
 * Recorded init() call for test inspection.
 */
export interface InitCall {
  /** Project directory passed to init() */
  projectDir: string;
  /** Options passed to init() */
  options?: InitOptions;
  /** Result returned from init() */
  result: InitResult;
  /** Timestamp when init() was called */
  timestamp: string;
}

/**
 * Recorded isInitialized() call for test inspection.
 */
export interface IsInitializedCall {
  /** Project directory passed to isInitialized() */
  projectDir: string;
  /** Result returned from isInitialized() */
  result: boolean;
  /** Timestamp when isInitialized() was called */
  timestamp: string;
}

/**
 * Recorded getInitializationStatus() call for test inspection.
 */
export interface GetInitializationStatusCall {
  /** Project directory passed to getInitializationStatus() */
  projectDir: string;
  /** Result returned from getInitializationStatus() */
  result: InitializationStatus;
  /** Timestamp when getInitializationStatus() was called */
  timestamp: string;
}

/**
 * Fake init service for testing.
 *
 * Captures all method calls for inspection.
 * Can be configured with preset results or use default responses.
 */
export class FakeInitService implements IInitService {
  /** Recorded init calls */
  private initCalls: InitCall[] = [];

  /** Recorded isInitialized calls */
  private isInitializedCalls: IsInitializedCall[] = [];

  /** Recorded getInitializationStatus calls */
  private statusCalls: GetInitializationStatusCall[] = [];

  /** Preset init results (keyed by projectDir) */
  private initResults = new Map<string, InitResult>();

  /** Preset isInitialized results (keyed by projectDir) */
  private isInitializedResults = new Map<string, boolean>();

  /** Preset status results (keyed by projectDir) */
  private statusResults = new Map<string, InitializationStatus>();

  /** Default init result to return if no preset matches */
  private defaultInitResult: InitResult | null = null;

  /** Default isInitialized result to return if no preset matches */
  private defaultIsInitialized = false;

  /** Default status result to return if no preset matches */
  private defaultStatus: InitializationStatus | null = null;

  // ==================== Test Helpers: State Setup ====================

  /**
   * Set a preset init result for a specific project directory (test helper).
   *
   * @param projectDir - Project directory to match
   * @param result - InitResult to return
   */
  setInitResult(projectDir: string, result: InitResult): void {
    this.initResults.set(projectDir, result);
  }

  /**
   * Set a default init result to return for all init calls (test helper).
   *
   * @param result - Default InitResult to return
   */
  setDefaultInitResult(result: InitResult): void {
    this.defaultInitResult = result;
  }

  /**
   * Set a preset isInitialized result for a specific project directory (test helper).
   *
   * @param projectDir - Project directory to match
   * @param result - boolean to return
   */
  setIsInitialized(projectDir: string, result: boolean): void {
    this.isInitializedResults.set(projectDir, result);
  }

  /**
   * Set a default isInitialized result to return (test helper).
   *
   * @param result - Default boolean to return
   */
  setDefaultIsInitialized(result: boolean): void {
    this.defaultIsInitialized = result;
  }

  /**
   * Set a preset status result for a specific project directory (test helper).
   *
   * @param projectDir - Project directory to match
   * @param result - InitializationStatus to return
   */
  setStatusResult(projectDir: string, result: InitializationStatus): void {
    this.statusResults.set(projectDir, result);
  }

  /**
   * Set a default status result to return (test helper).
   *
   * @param result - Default InitializationStatus to return
   */
  setDefaultStatusResult(result: InitializationStatus): void {
    this.defaultStatus = result;
  }

  // ==================== Test Helpers: State Inspection ====================

  /**
   * Get the last init call (test helper).
   *
   * @returns Last InitCall, or null if no calls made
   */
  getLastInitCall(): InitCall | null {
    return this.initCalls.length > 0 ? this.initCalls[this.initCalls.length - 1] : null;
  }

  /**
   * Get all init calls in order (test helper).
   *
   * @returns Array of all recorded init calls
   */
  getInitCalls(): InitCall[] {
    return [...this.initCalls];
  }

  /**
   * Get the number of init calls (test helper).
   */
  getInitCallCount(): number {
    return this.initCalls.length;
  }

  /**
   * Get the last isInitialized call (test helper).
   *
   * @returns Last IsInitializedCall, or null if no calls made
   */
  getLastIsInitializedCall(): IsInitializedCall | null {
    return this.isInitializedCalls.length > 0
      ? this.isInitializedCalls[this.isInitializedCalls.length - 1]
      : null;
  }

  /**
   * Get all isInitialized calls in order (test helper).
   *
   * @returns Array of all recorded isInitialized calls
   */
  getIsInitializedCalls(): IsInitializedCall[] {
    return [...this.isInitializedCalls];
  }

  /**
   * Get the number of isInitialized calls (test helper).
   */
  getIsInitializedCallCount(): number {
    return this.isInitializedCalls.length;
  }

  /**
   * Get the last getInitializationStatus call (test helper).
   *
   * @returns Last GetInitializationStatusCall, or null if no calls made
   */
  getLastStatusCall(): GetInitializationStatusCall | null {
    return this.statusCalls.length > 0 ? this.statusCalls[this.statusCalls.length - 1] : null;
  }

  /**
   * Get all getInitializationStatus calls in order (test helper).
   *
   * @returns Array of all recorded status calls
   */
  getStatusCalls(): GetInitializationStatusCall[] {
    return [...this.statusCalls];
  }

  /**
   * Get the number of getInitializationStatus calls (test helper).
   */
  getStatusCallCount(): number {
    return this.statusCalls.length;
  }

  /**
   * Reset all state (test helper).
   */
  reset(): void {
    this.initCalls = [];
    this.isInitializedCalls = [];
    this.statusCalls = [];
    this.initResults.clear();
    this.isInitializedResults.clear();
    this.statusResults.clear();
    this.defaultInitResult = null;
    this.defaultIsInitialized = false;
    this.defaultStatus = null;
  }

  // ==================== Test Helpers: Factory Methods ====================

  /**
   * Create a success InitResult for testing (static helper).
   *
   * @param options - Options for creating the result
   * @returns InitResult with no errors
   */
  static createInitResult(options?: {
    createdDirs?: string[];
    hydratedTemplates?: string[];
    overwrittenTemplates?: string[];
    skippedTemplates?: string[];
  }): InitResult {
    return {
      errors: [],
      createdDirs: options?.createdDirs ?? [],
      hydratedTemplates: options?.hydratedTemplates ?? [],
      overwrittenTemplates: options?.overwrittenTemplates ?? [],
      skippedTemplates: options?.skippedTemplates ?? [],
    };
  }

  /**
   * Create an error InitResult for testing (static helper).
   *
   * @param code - Error code
   * @param message - Error message
   * @param action - Suggested fix action
   * @returns InitResult with error
   */
  static createInitError(code: string, message: string, action?: string): InitResult {
    return {
      errors: [{ code, message, action }],
      createdDirs: [],
      hydratedTemplates: [],
      overwrittenTemplates: [],
      skippedTemplates: [],
    };
  }

  /**
   * Create an InitializationStatus for testing (static helper).
   *
   * @param initialized - Whether initialized
   * @param missingDirs - Missing directories
   * @param suggestedAction - Suggested action
   * @returns InitializationStatus
   */
  static createStatus(
    initialized: boolean,
    missingDirs: string[] = [],
    suggestedAction = ''
  ): InitializationStatus {
    return {
      initialized,
      missingDirs,
      suggestedAction: suggestedAction || (initialized ? '' : "Run 'cg init' to initialize."),
    };
  }

  // ==================== IInitService Implementation ====================

  /**
   * Initialize a Chainglass project.
   *
   * Returns preset result if configured, otherwise default or success.
   *
   * @param projectDir - Path to project directory
   * @param options - Init options
   * @returns InitResult (preset or default)
   */
  async init(projectDir: string, options?: InitOptions): Promise<InitResult> {
    const timestamp = new Date().toISOString();

    // Check for preset result
    const presetResult = this.initResults.get(projectDir);
    if (presetResult !== undefined) {
      this.initCalls.push({
        projectDir,
        options,
        result: presetResult,
        timestamp,
      });
      return presetResult;
    }

    // Check for default result
    if (this.defaultInitResult) {
      this.initCalls.push({
        projectDir,
        options,
        result: this.defaultInitResult,
        timestamp,
      });
      return this.defaultInitResult;
    }

    // Return default success
    const result: InitResult = {
      errors: [],
      createdDirs: ['.chainglass/workflows', '.chainglass/runs'],
      hydratedTemplates: ['hello-workflow'],
      overwrittenTemplates: [],
      skippedTemplates: [],
    };

    this.initCalls.push({
      projectDir,
      options,
      result,
      timestamp,
    });

    return result;
  }

  /**
   * Check if a project is initialized.
   *
   * Returns preset result if configured, otherwise default.
   *
   * @param projectDir - Path to project directory
   * @returns boolean (preset or default)
   */
  async isInitialized(projectDir: string): Promise<boolean> {
    const timestamp = new Date().toISOString();

    // Check for preset result
    const presetResult = this.isInitializedResults.get(projectDir);
    if (presetResult !== undefined) {
      this.isInitializedCalls.push({
        projectDir,
        result: presetResult,
        timestamp,
      });
      return presetResult;
    }

    // Return default
    this.isInitializedCalls.push({
      projectDir,
      result: this.defaultIsInitialized,
      timestamp,
    });

    return this.defaultIsInitialized;
  }

  /**
   * Get detailed initialization status.
   *
   * Returns preset result if configured, otherwise default.
   *
   * @param projectDir - Path to project directory
   * @returns InitializationStatus (preset or default)
   */
  async getInitializationStatus(projectDir: string): Promise<InitializationStatus> {
    const timestamp = new Date().toISOString();

    // Check for preset result
    const presetResult = this.statusResults.get(projectDir);
    if (presetResult !== undefined) {
      this.statusCalls.push({
        projectDir,
        result: presetResult,
        timestamp,
      });
      return presetResult;
    }

    // Check for default result
    if (this.defaultStatus) {
      this.statusCalls.push({
        projectDir,
        result: this.defaultStatus,
        timestamp,
      });
      return this.defaultStatus;
    }

    // Return default (not initialized)
    const result: InitializationStatus = {
      initialized: this.defaultIsInitialized,
      missingDirs: this.defaultIsInitialized ? [] : ['.chainglass/workflows', '.chainglass/runs'],
      suggestedAction: this.defaultIsInitialized ? '' : "Run 'cg init' to initialize.",
    };

    this.statusCalls.push({
      projectDir,
      result,
      timestamp,
    });

    return result;
  }
}
