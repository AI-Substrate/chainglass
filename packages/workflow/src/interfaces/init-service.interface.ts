/**
 * Init service interface for initializing Chainglass projects.
 *
 * Per Phase 4 DYK-04: Service layer pattern for init command.
 * Per Phase 4 DYK-07: Initialization guard for existing commands.
 * Per Phase 4 DYK-08: Force flag for development/testing.
 *
 * Implementations:
 * - InitService: Real implementation using IFileSystem, IPathResolver, IYamlParser
 * - FakeInitService: Configurable implementation for testing with call capture
 */

import type { ResultError } from '@chainglass/shared';

/**
 * Options for project initialization.
 *
 * Per DYK-08: Force flag enables overwriting existing templates.
 */
export interface InitOptions {
  /**
   * If true, overwrite existing workflow templates.
   * Default: false (skip existing, safe for production)
   */
  force?: boolean;
}

/**
 * Result of project initialization.
 *
 * Per DYK-08: Tracks both skipped and overwritten templates.
 */
export interface InitResult {
  /** Errors encountered during initialization */
  errors: ResultError[];
  /** Directories that were created */
  createdDirs: string[];
  /** Templates that were successfully hydrated (new) */
  hydratedTemplates: string[];
  /** Templates that were overwritten (when force=true) */
  overwrittenTemplates: string[];
  /** Templates that were skipped (existing, when force=false) */
  skippedTemplates: string[];
}

/**
 * Status of project initialization.
 *
 * Per DYK-07: Enables graceful errors for uninitialized projects.
 */
export interface InitializationStatus {
  /** Whether the project is initialized */
  initialized: boolean;
  /** Directories that are missing (if not initialized) */
  missingDirs: string[];
  /** Suggested action for the user */
  suggestedAction: string;
}

/**
 * Interface for project initialization operations.
 *
 * Handles creating the `.chainglass/` directory structure and
 * hydrating bundled starter templates.
 */
export interface IInitService {
  /**
   * Initialize a Chainglass project.
   *
   * Creates the required directory structure:
   * - `.chainglass/workflows/` - Workflow templates
   * - `.chainglass/runs/` - Workflow run data
   *
   * Copies bundled starter templates to `.chainglass/workflows/<slug>/current/`
   * and generates `workflow.json` metadata for each.
   *
   * @param projectDir - Absolute path to project root directory
   * @param options - Initialization options
   * @returns InitResult with created dirs, hydrated templates, skipped/overwritten templates
   *
   * @example
   * ```typescript
   * const result = await initService.init('/path/to/project');
   * if (result.errors.length === 0) {
   *   console.log('Created:', result.createdDirs);
   *   console.log('Hydrated:', result.hydratedTemplates);
   *   if (result.skippedTemplates.length > 0) {
   *     console.log('Skipped (existing):', result.skippedTemplates);
   *   }
   * }
   * ```
   */
  init(projectDir: string, options?: InitOptions): Promise<InitResult>;

  /**
   * Check if a project is initialized.
   *
   * Per DYK-07: Used by existing commands to provide graceful errors.
   *
   * @param projectDir - Absolute path to project root directory
   * @returns true if project has required .chainglass structure
   *
   * @example
   * ```typescript
   * if (!await initService.isInitialized('/path/to/project')) {
   *   console.error('Project not initialized. Run "cg init" first.');
   *   process.exit(1);
   * }
   * ```
   */
  isInitialized(projectDir: string): Promise<boolean>;

  /**
   * Get detailed initialization status.
   *
   * Per DYK-07: Provides specific information about what's missing.
   *
   * @param projectDir - Absolute path to project root directory
   * @returns InitializationStatus with details about what's missing
   *
   * @example
   * ```typescript
   * const status = await initService.getInitializationStatus('/path/to/project');
   * if (!status.initialized) {
   *   console.error('Missing directories:', status.missingDirs.join(', '));
   *   console.error(status.suggestedAction);
   * }
   * ```
   */
  getInitializationStatus(projectDir: string): Promise<InitializationStatus>;
}
