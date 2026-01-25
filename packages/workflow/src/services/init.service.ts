/**
 * InitService implementation for project initialization.
 *
 * Per Phase 4: Implements IInitService for the cg init command.
 * Per DYK-01: Uses __dirname equivalent for bundle location (passed via constructor)
 * Per DYK-02: Uses extracted generateWorkflowJson utility
 * Per DYK-03: Uses IFileSystem.copyDirectory for template copying
 * Per DYK-04: Service layer pattern for init command
 * Per DYK-06: Category-based asset structure (assets/templates/workflows/)
 * Per DYK-07: Implements isInitialized() and getInitializationStatus()
 * Per DYK-08: Implements force flag for overwriting existing templates
 */

import type { IFileSystem, IPathResolver } from '@chainglass/shared';
import type {
  IInitService,
  InitializationStatus,
  InitOptions,
  InitResult,
} from '../interfaces/init-service.interface.js';
import type { IYamlParser } from '../interfaces/yaml-parser.interface.js';
import { generateWorkflowJson } from '../utils/generate-workflow-json.js';

/**
 * Required directories for a Chainglass project.
 */
const REQUIRED_DIRS = ['.chainglass/workflows', '.chainglass/runs'];

/**
 * Valid slug pattern for workflow template directories.
 *
 * SEC-01: Prevents path traversal attacks by rejecting directory names
 * that don't match the expected pattern (lowercase letters, numbers, hyphens).
 */
const SLUG_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * InitService implements project initialization functionality.
 */
export class InitService implements IInitService {
  /**
   * Path to the CLI bundle directory (where assets are located).
   * Per DYK-01: In production, this is the dist/ directory.
   */
  private readonly bundleDir: string;

  constructor(
    private readonly fs: IFileSystem,
    private readonly pathResolver: IPathResolver,
    private readonly yamlParser: IYamlParser,
    bundleDir: string
  ) {
    this.bundleDir = bundleDir;
  }

  /**
   * Get the path to bundled assets for a category.
   *
   * Per DYK-06: Category-based structure for future extensibility.
   *
   * @param category - Asset category (e.g., 'workflows', 'configs')
   * @returns Absolute path to the assets directory for that category
   */
  getBundledAssetsPath(category: string): string {
    return this.pathResolver.join(this.bundleDir, 'assets', 'templates', category);
  }

  /**
   * Initialize a Chainglass project.
   *
   * Creates required directory structure and hydrates bundled starter templates.
   *
   * SEC-02: Errors are captured in result.errors instead of throwing,
   * allowing graceful handling and actionable user feedback.
   *
   * @param projectDir - Absolute path to project root
   * @param options - Initialization options (force: true to overwrite existing)
   * @returns InitResult with created dirs, hydrated templates, skipped/overwritten
   */
  async init(projectDir: string, options?: InitOptions): Promise<InitResult> {
    const result: InitResult = {
      errors: [],
      createdDirs: [],
      hydratedTemplates: [],
      overwrittenTemplates: [],
      skippedTemplates: [],
    };

    const force = options?.force ?? false;

    // Step 1: Create directory structure
    try {
      const createdDirs = await this.createDirectoryStructure(projectDir);
      result.createdDirs.push(...createdDirs);
    } catch (error) {
      result.errors.push({
        code: 'E040',
        message: `Failed to create directory structure: ${error instanceof Error ? error.message : String(error)}`,
        action: 'Check filesystem permissions and try again.',
      });
      return result; // Early return on directory creation failure
    }

    // Step 2: Hydrate starter templates
    try {
      const templateResult = await this.hydrateStarterTemplates(projectDir, force);
      result.hydratedTemplates.push(...templateResult.hydrated);
      result.skippedTemplates.push(...templateResult.skipped);
      result.overwrittenTemplates.push(...templateResult.overwritten);
    } catch (error) {
      result.errors.push({
        code: 'E041',
        message: `Failed to hydrate templates: ${error instanceof Error ? error.message : String(error)}`,
        action: 'Check bundled templates and filesystem permissions.',
      });
    }

    return result;
  }

  /**
   * Check if a project is initialized.
   *
   * Per DYK-07: Used by existing commands for graceful errors.
   *
   * @param projectDir - Absolute path to project root
   * @returns true if all required directories exist
   */
  async isInitialized(projectDir: string): Promise<boolean> {
    for (const dir of REQUIRED_DIRS) {
      const fullPath = this.pathResolver.join(projectDir, dir);
      if (!(await this.fs.exists(fullPath))) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get detailed initialization status.
   *
   * Per DYK-07: Provides specific information for error messages.
   *
   * @param projectDir - Absolute path to project root
   * @returns Status with initialized flag, missing dirs, suggested action
   */
  async getInitializationStatus(projectDir: string): Promise<InitializationStatus> {
    const missingDirs: string[] = [];

    for (const dir of REQUIRED_DIRS) {
      const fullPath = this.pathResolver.join(projectDir, dir);
      if (!(await this.fs.exists(fullPath))) {
        missingDirs.push(dir);
      }
    }

    const initialized = missingDirs.length === 0;

    return {
      initialized,
      missingDirs,
      suggestedAction: initialized ? '' : "Run 'cg init' to initialize this project.",
    };
  }

  /**
   * Create the required directory structure.
   *
   * @param projectDir - Absolute path to project root
   * @returns Array of created directory paths (relative to project)
   */
  private async createDirectoryStructure(projectDir: string): Promise<string[]> {
    const created: string[] = [];

    for (const dir of REQUIRED_DIRS) {
      const fullPath = this.pathResolver.join(projectDir, dir);
      // mkdir with recursive: true is idempotent
      await this.fs.mkdir(fullPath, { recursive: true });
      created.push(dir);
    }

    return created;
  }

  /**
   * Hydrate bundled starter templates.
   *
   * @param projectDir - Absolute path to project root
   * @param force - If true, overwrite existing workflows
   * @returns Object with hydrated, skipped, and overwritten template slugs
   */
  private async hydrateStarterTemplates(
    projectDir: string,
    force: boolean
  ): Promise<{ hydrated: string[]; skipped: string[]; overwritten: string[] }> {
    const hydrated: string[] = [];
    const skipped: string[] = [];
    const overwritten: string[] = [];

    const templatesPath = this.getBundledAssetsPath('workflows');

    // Check if templates directory exists
    if (!(await this.fs.exists(templatesPath))) {
      // No bundled templates - this is okay, just return empty results
      return { hydrated, skipped, overwritten };
    }

    // List all template directories
    const templateDirs = await this.fs.readDir(templatesPath);

    for (const slug of templateDirs) {
      // SEC-01: Validate slug before path construction to prevent path traversal
      if (!SLUG_PATTERN.test(slug)) {
        continue; // Skip invalid template directory names
      }

      const sourcePath = this.pathResolver.join(templatesPath, slug);

      // Skip non-directories (shouldn't happen, but be safe)
      const stat = await this.fs.stat(sourcePath);
      if (!stat.isDirectory) {
        continue;
      }

      const workflowDir = this.pathResolver.join(projectDir, '.chainglass', 'workflows', slug);
      const currentDir = this.pathResolver.join(workflowDir, 'current');
      const workflowJsonPath = this.pathResolver.join(workflowDir, 'workflow.json');

      // Check if workflow already exists
      const workflowExists = await this.fs.exists(workflowDir);

      if (workflowExists && !force) {
        // Skip existing workflow
        skipped.push(slug);
        continue;
      }

      if (workflowExists && force) {
        // Delete existing current/ directory before overwriting
        const existingCurrentDir = this.pathResolver.join(workflowDir, 'current');
        if (await this.fs.exists(existingCurrentDir)) {
          await this.fs.rmdir(existingCurrentDir, { recursive: true });
        }
        // Also delete workflow.json so it gets regenerated
        if (await this.fs.exists(workflowJsonPath)) {
          await this.fs.unlink(workflowJsonPath);
        }
        overwritten.push(slug);
      } else {
        hydrated.push(slug);
      }

      // Create workflow directory structure
      await this.fs.mkdir(currentDir, { recursive: true });

      // Copy template to current/
      await this.fs.copyDirectory(sourcePath, currentDir);

      // Generate workflow.json
      const wfYamlPath = this.pathResolver.join(currentDir, 'wf.yaml');
      await generateWorkflowJson(
        workflowDir,
        slug,
        wfYamlPath,
        new Date().toISOString(),
        {
          fs: this.fs,
          pathResolver: this.pathResolver,
          yamlParser: this.yamlParser,
        }
      );
    }

    return { hydrated, skipped, overwritten };
  }
}
