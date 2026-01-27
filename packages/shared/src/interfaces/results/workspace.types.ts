/**
 * Workspace command result types for CLI output adapters.
 *
 * Per Plan 014: Workspaces - Phase 5: CLI Commands
 * Per DYK-P5-01: Output adapters need result types for workspace.* commands.
 *
 * These types are used by ConsoleOutputAdapter and JsonOutputAdapter
 * to format workspace command results consistently.
 *
 * Note: These are CLI output result types, distinct from service-level types.
 * The "Cmd" suffix indicates these are command output results.
 */

import type { BaseResult } from './base.types.js';

// ==================== Workspace Result Types ====================

/**
 * Workspace data for output display.
 */
export interface WorkspaceOutputData {
  /** URL-safe identifier */
  slug: string;
  /** Human-readable name */
  name: string;
  /** Absolute path to workspace directory */
  path: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
}

/**
 * Worktree data for output display.
 */
export interface WorktreeOutputData {
  /** Worktree name (derived from path) */
  name: string;
  /** Absolute path to worktree */
  path: string;
  /** Git branch name */
  branch: string;
}

/**
 * Result from workspace.add command.
 */
export interface WorkspaceAddCmdResult extends BaseResult {
  /** The created workspace (only present on success) */
  workspace?: WorkspaceOutputData;
  /** Warnings encountered during add (e.g., no .git folder) */
  warnings?: string[];
}

/**
 * Result from workspace.list command.
 */
export interface WorkspaceListCmdResult extends BaseResult {
  /** All registered workspaces */
  workspaces: WorkspaceOutputData[];
  /** Total count */
  count: number;
}

/**
 * Result from workspace.info command.
 */
export interface WorkspaceInfoCmdResult extends BaseResult {
  /** Workspace details */
  workspace?: WorkspaceOutputData;
  /** Whether path is a git repository */
  isGitRepo: boolean;
  /** Git worktrees (only if isGitRepo is true) */
  worktrees?: WorktreeOutputData[];
  /** Total worktree count */
  worktreeCount?: number;
}

/**
 * Result from workspace.remove command.
 */
export interface WorkspaceRemoveCmdResult extends BaseResult {
  /** Slug of the removed workspace */
  slug?: string;
  /** Path that was unregistered */
  path?: string;
  /** Informational message */
  message?: string;
}

// ==================== Sample Result Types ====================

/**
 * Sample data for output display.
 */
export interface SampleOutputData {
  /** URL-safe identifier */
  slug: string;
  /** Human-readable name */
  name: string;
  /** Sample content */
  content: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 update timestamp */
  updatedAt: string;
}

/**
 * Workspace context for sample output.
 */
export interface SampleWorkspaceContextData {
  /** Workspace slug */
  slug: string;
  /** Worktree name (derived from path) */
  worktree: string;
  /** Data root path (optional) */
  dataRoot?: string;
}

/**
 * Result from sample.add command.
 */
export interface SampleAddCmdResult extends BaseResult {
  /** The created sample (only present on success) */
  sample?: SampleOutputData;
  /** Path to the sample file */
  path?: string;
  /** Workspace context info */
  workspace?: SampleWorkspaceContextData;
}

/**
 * Result from sample.list command.
 */
export interface SampleListCmdResult extends BaseResult {
  /** All samples in context */
  samples: SampleOutputData[];
  /** Total count */
  count: number;
  /** Workspace context info */
  workspace?: SampleWorkspaceContextData;
}

/**
 * Result from sample.info command.
 */
export interface SampleInfoCmdResult extends BaseResult {
  /** Sample details */
  sample?: SampleOutputData;
  /** Path to the sample file */
  path?: string;
  /** Workspace context info */
  workspace?: SampleWorkspaceContextData;
}

/**
 * Result from sample.delete command.
 */
export interface SampleDeleteCmdResult extends BaseResult {
  /** Slug of the deleted sample */
  slug?: string;
  /** Path that was deleted */
  path?: string;
  /** Informational message */
  message?: string;
}
