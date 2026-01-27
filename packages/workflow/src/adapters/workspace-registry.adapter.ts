/**
 * Production WorkspaceRegistryAdapter for managing workspace registration.
 *
 * Per Phase 1: Workspace Entity + Registry Adapter + Contract Tests
 * Per Critical Discovery 01: Uses ~/.config/chainglass/workspaces.json for storage
 * Per Critical Discovery 03: No caching - always fresh filesystem reads
 *
 * The registry stores workspace metadata (slug, name, path, createdAt) in a JSON file.
 * Path validation and config directory creation happen on save().
 */

import type { IFileSystem, IPathResolver } from '@chainglass/shared';
import { Workspace, type WorkspaceJSON } from '../entities/workspace.js';
import { EntityNotFoundError } from '../errors/entity-not-found.error.js';
import { RegistryCorruptError, WorkspaceErrorCodes } from '../errors/workspace-errors.js';
import type {
  IWorkspaceRegistryAdapter,
  WorkspaceRemoveResult,
  WorkspaceSaveResult,
} from '../interfaces/workspace-registry-adapter.interface.js';

/**
 * Registry file structure stored in workspaces.json.
 */
interface WorkspaceRegistryFile {
  /** Schema version for future migrations */
  version: 1;
  /** Array of workspace JSON objects */
  workspaces: WorkspaceJSON[];
}

/**
 * Production implementation of IWorkspaceRegistryAdapter.
 *
 * Manages the global workspace registry at ~/.config/chainglass/workspaces.json.
 * Uses injected dependencies for testability:
 * - IFileSystem for file I/O
 * - IPathResolver for path operations
 */
export class WorkspaceRegistryAdapter implements IWorkspaceRegistryAdapter {
  /** Config directory path (~/.config/chainglass/) */
  private readonly configDir: string;

  /** Registry file path (~/.config/chainglass/workspaces.json) */
  private readonly registryPath: string;

  constructor(
    private readonly fs: IFileSystem,
    private readonly pathResolver: IPathResolver
  ) {
    // Resolve paths at construction time
    // Expand ~ to home directory using os.homedir() for production
    // The FakeFileSystem handles paths with ~ literally, so in tests with fakes
    // the ~ path is used as-is. In production, we expand ~ to real home.
    const tildeBase = '~/.config/chainglass';
    // Check if we have a real home directory and expand
    const homeDir = process.env.HOME ?? process.env.USERPROFILE;
    this.configDir = homeDir ? tildeBase.replace(/^~/, homeDir) : tildeBase;
    this.registryPath = this.pathResolver.join(this.configDir, 'workspaces.json');
  }

  /**
   * Load a workspace from the registry by slug.
   *
   * @param slug - Workspace slug
   * @returns Workspace if found
   * @throws EntityNotFoundError if workspace not found
   * @throws RegistryCorruptError if workspace path in registry is invalid
   */
  async load(slug: string): Promise<Workspace> {
    const registry = await this.readRegistry();
    const workspaceJson = registry.workspaces.find((w) => w.slug === slug);

    if (!workspaceJson) {
      throw new EntityNotFoundError('Workspace', slug, this.registryPath);
    }

    // Validate path even when loading (defense against tampered registry)
    const pathValidation = this.validatePath(workspaceJson.path);
    if (!pathValidation.ok) {
      throw new RegistryCorruptError(
        `Invalid path in registry for workspace '${slug}': ${pathValidation.errorMessage}`
      );
    }

    // Reconstruct Workspace entity from JSON
    return Workspace.create({
      name: workspaceJson.name,
      path: workspaceJson.path,
      slug: workspaceJson.slug,
      createdAt: new Date(workspaceJson.createdAt),
    });
  }

  /**
   * Save a workspace to the registry.
   *
   * Creates the config directory and registry file if needed.
   * Validates the workspace path before saving.
   *
   * @param workspace - Workspace to save
   * @returns WorkspaceSaveResult with ok=true on success
   */
  async save(workspace: Workspace): Promise<WorkspaceSaveResult> {
    // Validate path
    const pathValidation = this.validatePath(workspace.path);
    if (!pathValidation.ok) {
      return pathValidation;
    }

    // Read existing registry (or create empty one)
    const registry = await this.readRegistry();

    // Check for duplicate slug
    if (registry.workspaces.some((w) => w.slug === workspace.slug)) {
      return {
        ok: false,
        errorCode: WorkspaceErrorCodes.WORKSPACE_EXISTS,
        errorMessage: `Workspace '${workspace.slug}' already exists`,
        errorAction: `Remove existing: cg workspace remove ${workspace.slug}`,
      };
    }

    // Add workspace to registry
    registry.workspaces.push(workspace.toJSON());

    // Write registry back to file
    await this.writeRegistry(registry);

    return { ok: true };
  }

  /**
   * List all registered workspaces.
   *
   * @returns Array of all workspaces
   */
  async list(): Promise<Workspace[]> {
    const registry = await this.readRegistry();

    return registry.workspaces.map((json) =>
      Workspace.create({
        name: json.name,
        path: json.path,
        slug: json.slug,
        createdAt: new Date(json.createdAt),
      })
    );
  }

  /**
   * Remove a workspace from the registry by slug.
   *
   * @param slug - Workspace slug to remove
   * @returns WorkspaceRemoveResult with ok=true on success
   */
  async remove(slug: string): Promise<WorkspaceRemoveResult> {
    const registry = await this.readRegistry();

    const index = registry.workspaces.findIndex((w) => w.slug === slug);
    if (index === -1) {
      return {
        ok: false,
        errorCode: WorkspaceErrorCodes.WORKSPACE_NOT_FOUND,
        errorMessage: `Workspace '${slug}' not found`,
      };
    }

    // Remove workspace from array
    registry.workspaces.splice(index, 1);

    // Write registry back to file
    await this.writeRegistry(registry);

    return { ok: true };
  }

  /**
   * Check if a workspace with the given slug is registered.
   *
   * @param slug - Workspace slug to check
   * @returns true if workspace is registered
   */
  async exists(slug: string): Promise<boolean> {
    const registry = await this.readRegistry();
    return registry.workspaces.some((w) => w.slug === slug);
  }

  // ==================== Private Helpers ====================

  /**
   * Validate a workspace path.
   *
   * Per High Discovery 05: All paths must be validated:
   * - Must be absolute (or start with ~)
   * - Cannot contain .. (directory traversal)
   * - URL encoding must be decoded to prevent bypass attacks
   *
   * @param workspacePath - Path to validate
   * @returns WorkspaceSaveResult with ok=true if valid, error if invalid
   */
  private validatePath(workspacePath: string): WorkspaceSaveResult {
    // Decode URL encoding to prevent bypass (decode repeatedly for double-encoding)
    let decoded = workspacePath;
    try {
      let prev = '';
      while (decoded !== prev) {
        prev = decoded;
        decoded = decodeURIComponent(decoded);
      }
    } catch {
      // If decoding fails, use original (malformed URL encoding)
      decoded = workspacePath;
    }

    // Check for directory traversal in decoded path
    if (decoded.includes('..')) {
      return {
        ok: false,
        errorCode: WorkspaceErrorCodes.INVALID_PATH,
        errorMessage: `Invalid path '${workspacePath}': contains directory traversal (..)`,
        errorAction: 'Provide an absolute path without .. (e.g., /home/user/project or ~/project)',
      };
    }

    // Check if path is absolute (starts with / or ~)
    const isAbsolute = decoded.startsWith('/') || decoded.startsWith('~');
    if (!isAbsolute) {
      return {
        ok: false,
        errorCode: WorkspaceErrorCodes.INVALID_PATH,
        errorMessage: `Invalid path '${workspacePath}': path must be absolute`,
        errorAction: 'Provide an absolute path (e.g., /home/user/project or ~/project)',
      };
    }

    return { ok: true };
  }

  /**
   * Read the workspace registry from file.
   *
   * Returns empty registry if file doesn't exist.
   * Throws RegistryCorruptError if JSON is invalid or structure is wrong.
   */
  private async readRegistry(): Promise<WorkspaceRegistryFile> {
    // Check if registry file exists
    const exists = await this.fs.exists(this.registryPath);
    if (!exists) {
      // Return empty registry
      return { version: 1, workspaces: [] };
    }

    // Read and parse registry file
    const content = await this.fs.readFile(this.registryPath);

    try {
      const registry = JSON.parse(content) as WorkspaceRegistryFile;

      // Validate structure
      if (!registry.workspaces || !Array.isArray(registry.workspaces)) {
        throw new RegistryCorruptError('Invalid registry structure: missing workspaces array');
      }

      return registry;
    } catch (error) {
      // Re-throw RegistryCorruptError as-is
      if (error instanceof RegistryCorruptError) {
        throw error;
      }
      // JSON parse failed
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new RegistryCorruptError(`Failed to parse registry JSON: ${message}`);
    }
  }

  /**
   * Write the workspace registry to file.
   *
   * Creates the config directory if needed.
   * Per Medium Discovery 09: Handle permission errors gracefully.
   *
   * @throws ConfigNotWritableError if directory cannot be created or written to
   */
  private async writeRegistry(registry: WorkspaceRegistryFile): Promise<void> {
    try {
      // Ensure config directory exists
      const dirExists = await this.fs.exists(this.configDir);
      if (!dirExists) {
        await this.fs.mkdir(this.configDir, { recursive: true });
      }

      // Write registry file
      const content = JSON.stringify(registry, null, 2);
      await this.fs.writeFile(this.registryPath, content);
    } catch (error) {
      // Re-throw with workspace-specific error code
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`E080: Cannot write to config directory: ${message}`);
    }
  }
}
