/**
 * Error codes and classes for workspace operations.
 *
 * Per Plan 014: Workspaces - E074-E081 range reserved for workspace errors.
 * Per DYK Session (2026-01-27): Shifted from E070-E077 to avoid collision with PhaseService (E070-E073).
 *
 * Error code allocation:
 * - E030-E039: WorkflowRegistryService (checkpoint, restore, versions)
 * - E040-E049: InitService (init, directory creation)
 * - E050-E059: Run operations
 * - E060-E069: Reserved
 * - E070-E073: PhaseService (handover operations)
 * - E074-E081: Workspace operations (this file)
 *
 * Per High Discovery 06: Each error needs code, message, action, path for actionable guidance.
 */

import type { WorkspaceErrorCode } from '../interfaces/workspace-registry-adapter.interface.js';

/**
 * Error codes for workspace operations (E074-E081).
 */
export const WorkspaceErrorCodes = {
  /** Workspace not found in registry */
  WORKSPACE_NOT_FOUND: 'E074' as WorkspaceErrorCode,
  /** Workspace with slug already exists */
  WORKSPACE_EXISTS: 'E075' as WorkspaceErrorCode,
  /** Invalid path (relative or contains ..) */
  INVALID_PATH: 'E076' as WorkspaceErrorCode,
  /** Path does not exist on filesystem */
  PATH_NOT_FOUND: 'E077' as WorkspaceErrorCode,
  /** Registry file is corrupt (invalid JSON) */
  REGISTRY_CORRUPT: 'E078' as WorkspaceErrorCode,
  /** Git operation failed */
  GIT_ERROR: 'E079' as WorkspaceErrorCode,
  /** Config directory not writable */
  CONFIG_NOT_WRITABLE: 'E080' as WorkspaceErrorCode,
  /** Reserved for future use */
  RESERVED: 'E081' as WorkspaceErrorCode,
} as const;

/**
 * Workspace error structure with actionable guidance.
 *
 * Per High Discovery 06: Each error includes code, message, action, and path
 * to help users understand and resolve the issue.
 */
export interface WorkspaceError {
  /** Error code (E074-E081) */
  code: WorkspaceErrorCode;
  /** Human-readable error message */
  message: string;
  /** Suggested action for the user */
  action: string;
  /** Related path (workspace path or registry path) */
  path: string;
}

/**
 * Error thrown when a workspace is not found in the registry.
 *
 * @example
 * ```typescript
 * throw new WorkspaceNotFoundError('my-project');
 * ```
 */
export class WorkspaceNotFoundError extends Error {
  readonly code = WorkspaceErrorCodes.WORKSPACE_NOT_FOUND;
  readonly action = 'Run: cg workspace list';
  readonly path = '~/.config/chainglass/workspaces.json';

  constructor(readonly slug: string) {
    super(`Workspace '${slug}' not found`);
    this.name = 'WorkspaceNotFoundError';
    Object.setPrototypeOf(this, WorkspaceNotFoundError.prototype);
  }

  toWorkspaceError(): WorkspaceError {
    return {
      code: this.code,
      message: this.message,
      action: this.action,
      path: this.path,
    };
  }
}

/**
 * Error thrown when a workspace with the same slug already exists.
 *
 * @example
 * ```typescript
 * throw new WorkspaceExistsError('my-project');
 * ```
 */
export class WorkspaceExistsError extends Error {
  readonly code = WorkspaceErrorCodes.WORKSPACE_EXISTS;
  readonly path = '~/.config/chainglass/workspaces.json';

  constructor(readonly slug: string) {
    super(`Workspace '${slug}' already exists`);
    this.name = 'WorkspaceExistsError';
    Object.setPrototypeOf(this, WorkspaceExistsError.prototype);
  }

  get action(): string {
    return `Remove existing: cg workspace remove ${this.slug}`;
  }

  toWorkspaceError(): WorkspaceError {
    return {
      code: this.code,
      message: this.message,
      action: this.action,
      path: this.path,
    };
  }
}

/**
 * Error thrown when a workspace path is invalid.
 *
 * Invalid paths include:
 * - Relative paths (not starting with / or ~)
 * - Paths containing .. (directory traversal)
 *
 * @example
 * ```typescript
 * throw new InvalidPathError('./relative/path', 'Path must be absolute');
 * ```
 */
export class InvalidPathError extends Error {
  readonly code = WorkspaceErrorCodes.INVALID_PATH;
  readonly action = 'Provide an absolute path (e.g., /home/user/project or ~/project)';

  constructor(
    readonly path: string,
    readonly reason: string
  ) {
    super(`Invalid path '${path}': ${reason}`);
    this.name = 'InvalidPathError';
    Object.setPrototypeOf(this, InvalidPathError.prototype);
  }

  toWorkspaceError(): WorkspaceError {
    return {
      code: this.code,
      message: this.message,
      action: this.action,
      path: this.path,
    };
  }
}

/**
 * Error thrown when a workspace path does not exist on the filesystem.
 *
 * @example
 * ```typescript
 * throw new PathNotFoundError('/home/user/nonexistent');
 * ```
 */
export class PathNotFoundError extends Error {
  readonly code = WorkspaceErrorCodes.PATH_NOT_FOUND;
  readonly action = 'Create the directory or provide an existing path';

  constructor(readonly path: string) {
    super(`Path '${path}' does not exist`);
    this.name = 'PathNotFoundError';
    Object.setPrototypeOf(this, PathNotFoundError.prototype);
  }

  toWorkspaceError(): WorkspaceError {
    return {
      code: this.code,
      message: this.message,
      action: this.action,
      path: this.path,
    };
  }
}

/**
 * Error thrown when the workspace registry file is corrupt.
 *
 * @example
 * ```typescript
 * throw new RegistryCorruptError('Unexpected token in JSON');
 * ```
 */
export class RegistryCorruptError extends Error {
  readonly code = WorkspaceErrorCodes.REGISTRY_CORRUPT;
  readonly path = '~/.config/chainglass/workspaces.json';
  readonly action = 'Delete the file to reset: rm ~/.config/chainglass/workspaces.json';

  constructor(readonly reason: string) {
    super(`Workspace registry is corrupt: ${reason}`);
    this.name = 'RegistryCorruptError';
    Object.setPrototypeOf(this, RegistryCorruptError.prototype);
  }

  toWorkspaceError(): WorkspaceError {
    return {
      code: this.code,
      message: this.message,
      action: this.action,
      path: this.path,
    };
  }
}

/**
 * Error thrown when a git operation fails during workspace detection.
 *
 * @example
 * ```typescript
 * throw new GitOperationError('/home/user/project', 'git worktree list failed');
 * ```
 */
export class GitOperationError extends Error {
  readonly code = WorkspaceErrorCodes.GIT_ERROR;
  readonly action = 'Ensure git is installed and the directory is a git repository';

  constructor(
    readonly path: string,
    readonly reason: string
  ) {
    super(`Git operation failed in '${path}': ${reason}`);
    this.name = 'GitOperationError';
    Object.setPrototypeOf(this, GitOperationError.prototype);
  }

  toWorkspaceError(): WorkspaceError {
    return {
      code: this.code,
      message: this.message,
      action: this.action,
      path: this.path,
    };
  }
}

/**
 * Error thrown when the config directory is not writable.
 *
 * @example
 * ```typescript
 * throw new ConfigNotWritableError('Permission denied');
 * ```
 */
export class ConfigNotWritableError extends Error {
  readonly code = WorkspaceErrorCodes.CONFIG_NOT_WRITABLE;
  readonly path = '~/.config/chainglass/';
  readonly action = 'Ensure ~/.config is writable: chmod 755 ~/.config';

  constructor(readonly reason: string) {
    super(`Cannot write to config directory: ${reason}`);
    this.name = 'ConfigNotWritableError';
    Object.setPrototypeOf(this, ConfigNotWritableError.prototype);
  }

  toWorkspaceError(): WorkspaceError {
    return {
      code: this.code,
      message: this.message,
      action: this.action,
      path: this.path,
    };
  }
}

/**
 * Factory functions for creating workspace errors.
 *
 * Per High Discovery 06: Use these factories to ensure consistent error structure.
 */
export const WorkspaceErrors = {
  /**
   * Create a "workspace not found" error.
   */
  notFound: (slug: string): WorkspaceError => ({
    code: WorkspaceErrorCodes.WORKSPACE_NOT_FOUND,
    message: `Workspace '${slug}' not found`,
    action: 'Run: cg workspace list',
    path: '~/.config/chainglass/workspaces.json',
  }),

  /**
   * Create a "workspace already exists" error.
   */
  exists: (slug: string): WorkspaceError => ({
    code: WorkspaceErrorCodes.WORKSPACE_EXISTS,
    message: `Workspace '${slug}' already exists`,
    action: `Remove existing: cg workspace remove ${slug}`,
    path: '~/.config/chainglass/workspaces.json',
  }),

  /**
   * Create an "invalid path" error.
   */
  invalidPath: (path: string, reason: string): WorkspaceError => ({
    code: WorkspaceErrorCodes.INVALID_PATH,
    message: `Invalid path '${path}': ${reason}`,
    action: 'Provide an absolute path (e.g., /home/user/project or ~/project)',
    path,
  }),

  /**
   * Create a "path not found" error.
   */
  pathNotFound: (path: string): WorkspaceError => ({
    code: WorkspaceErrorCodes.PATH_NOT_FOUND,
    message: `Path '${path}' does not exist`,
    action: 'Create the directory or provide an existing path',
    path,
  }),

  /**
   * Create a "registry corrupt" error.
   */
  registryCorrupt: (reason: string): WorkspaceError => ({
    code: WorkspaceErrorCodes.REGISTRY_CORRUPT,
    message: `Workspace registry is corrupt: ${reason}`,
    action: 'Delete the file to reset: rm ~/.config/chainglass/workspaces.json',
    path: '~/.config/chainglass/workspaces.json',
  }),

  /**
   * Create a "git error" error.
   */
  gitError: (path: string, reason: string): WorkspaceError => ({
    code: WorkspaceErrorCodes.GIT_ERROR,
    message: `Git operation failed in '${path}': ${reason}`,
    action: 'Ensure git is installed and the directory is a git repository',
    path,
  }),

  /**
   * Create a "config not writable" error.
   */
  configNotWritable: (reason: string): WorkspaceError => ({
    code: WorkspaceErrorCodes.CONFIG_NOT_WRITABLE,
    message: `Cannot write to config directory: ${reason}`,
    action: 'Ensure ~/.config is writable: chmod 755 ~/.config',
    path: '~/.config/chainglass/',
  }),
};
