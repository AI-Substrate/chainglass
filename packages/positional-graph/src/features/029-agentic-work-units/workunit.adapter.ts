/**
 * WorkUnitAdapter — Filesystem adapter for work unit data.
 *
 * Extends WorkspaceDataAdapterBase but overrides getDomainPath() to use
 * `.chainglass/units/` instead of `.chainglass/data/units/` (per DYK #1).
 *
 * Per Plan 029: Agentic Work Units — Phase 2.
 * Per ADR-0008: Workspace Split Storage Data Model.
 *
 * @packageDocumentation
 */

import type { IFileSystem, IPathResolver } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { WorkspaceDataAdapterBase } from '@chainglass/workflow/adapters';

import { workunitSlugInvalidError } from './workunit-errors.js';

/**
 * Regex pattern for valid unit slugs.
 * Must start with lowercase letter, contain only lowercase letters, numbers, and hyphens.
 */
const SLUG_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Filesystem adapter for WorkUnit data.
 *
 * Provides path resolution for work unit files:
 * - Unit directory: `.chainglass/units/<slug>/`
 * - Unit definition: `.chainglass/units/<slug>/unit.yaml`
 * - Templates: `.chainglass/units/<slug>/<relativePath>`
 *
 * @example
 * ```typescript
 * const adapter = new WorkUnitAdapter(fs, pathResolver);
 * const unitDir = adapter.getUnitDir(ctx, 'my-agent');
 * // → '/workspace/.chainglass/units/my-agent'
 * ```
 */
export class WorkUnitAdapter extends WorkspaceDataAdapterBase {
  /**
   * Domain name. Note: This is not used directly because we override getDomainPath().
   * Per DYK #1: WorkUnits use `.chainglass/units/`, not `.chainglass/data/units/`.
   */
  readonly domain = 'units';

  /**
   * Override getDomainPath to use `.chainglass/units/` instead of `.chainglass/data/units/`.
   *
   * Per DYK #1: WorkUnits live at `.chainglass/units/<slug>/`, NOT `.chainglass/data/units/`.
   * This is a deliberate deviation from the base class pattern.
   */
  protected override getDomainPath(ctx: WorkspaceContext): string {
    return this.pathResolver.join(ctx.worktreePath, '.chainglass', 'units');
  }

  /**
   * Get the directory path for a specific work unit.
   *
   * @param ctx - Workspace context
   * @param slug - Unit slug (must match /^[a-z][a-z0-9-]*$/)
   * @returns Absolute path to unit directory
   * @throws Error if slug is invalid
   *
   * @example
   * ```typescript
   * adapter.getUnitDir(ctx, 'my-agent')
   * // → '/workspace/.chainglass/units/my-agent'
   * ```
   */
  getUnitDir(ctx: WorkspaceContext, slug: string): string {
    this.validateSlug(slug);
    return this.pathResolver.join(this.getDomainPath(ctx), slug);
  }

  /**
   * Get the path to unit.yaml for a specific work unit.
   *
   * @param ctx - Workspace context
   * @param slug - Unit slug
   * @returns Absolute path to unit.yaml
   * @throws Error if slug is invalid
   *
   * @example
   * ```typescript
   * adapter.getUnitYamlPath(ctx, 'my-agent')
   * // → '/workspace/.chainglass/units/my-agent/unit.yaml'
   * ```
   */
  getUnitYamlPath(ctx: WorkspaceContext, slug: string): string {
    return this.pathResolver.join(this.getUnitDir(ctx, slug), 'unit.yaml');
  }

  /**
   * Get the absolute path to a template file within a unit.
   *
   * @param ctx - Workspace context
   * @param slug - Unit slug
   * @param relativePath - Relative path within unit directory (e.g., 'prompts/main.md')
   * @returns Absolute path to template file
   * @throws Error if slug is invalid
   *
   * @example
   * ```typescript
   * adapter.getTemplatePath(ctx, 'my-agent', 'prompts/main.md')
   * // → '/workspace/.chainglass/units/my-agent/prompts/main.md'
   * ```
   */
  getTemplatePath(ctx: WorkspaceContext, slug: string, relativePath: string): string {
    return this.pathResolver.join(this.getUnitDir(ctx, slug), relativePath);
  }

  /**
   * List all unit slugs in the units directory.
   *
   * @param ctx - Workspace context
   * @returns Array of unit slugs (directory names)
   *
   * @example
   * ```typescript
   * await adapter.listUnitSlugs(ctx)
   * // → ['agent-a', 'agent-b', 'code-unit']
   * ```
   */
  async listUnitSlugs(ctx: WorkspaceContext): Promise<string[]> {
    const domainPath = this.getDomainPath(ctx);

    try {
      const exists = await this.fs.exists(domainPath);
      if (!exists) {
        return [];
      }

      return this.fs.readDir(domainPath);
    } catch {
      return [];
    }
  }

  /**
   * Check if a unit exists (has a unit.yaml file).
   *
   * @param ctx - Workspace context
   * @param slug - Unit slug
   * @returns True if unit.yaml exists
   * @throws Error if slug is invalid
   *
   * @example
   * ```typescript
   * await adapter.unitExists(ctx, 'my-agent')
   * // → true (if unit.yaml exists)
   * ```
   */
  async unitExists(ctx: WorkspaceContext, slug: string): Promise<boolean> {
    const yamlPath = this.getUnitYamlPath(ctx, slug);
    return this.fs.exists(yamlPath);
  }

  /**
   * Validate a unit slug format.
   *
   * @param slug - Slug to validate
   * @throws Error with E187 code if slug is invalid
   */
  validateSlug(slug: string): void {
    const trimmed = slug.trim();

    if (!trimmed || !SLUG_PATTERN.test(trimmed)) {
      const error = workunitSlugInvalidError(slug);
      throw new Error(`${error.code}: ${error.message}`);
    }
  }

  // ========== Write Helpers (Plan 058 Phase 1) ==========

  /**
   * Ensure the unit directory exists. Creates it recursively if needed.
   */
  async ensureUnitDir(ctx: WorkspaceContext, slug: string): Promise<string> {
    const unitDir = this.getUnitDir(ctx, slug);
    await this.fs.mkdir(unitDir, { recursive: true });
    return unitDir;
  }

  /**
   * Remove the entire unit directory. Idempotent — no error if missing.
   */
  async removeUnitDir(ctx: WorkspaceContext, slug: string): Promise<void> {
    const unitDir = this.getUnitDir(ctx, slug);
    const exists = await this.fs.exists(unitDir);
    if (exists) {
      await this.fs.rmdir(unitDir, { recursive: true });
    }
  }

  /**
   * Rename a unit directory from oldSlug to newSlug.
   * Validates both slugs before renaming.
   */
  async renameUnitDir(ctx: WorkspaceContext, oldSlug: string, newSlug: string): Promise<void> {
    this.validateSlug(oldSlug);
    this.validateSlug(newSlug);
    const oldDir = this.getUnitDir(ctx, oldSlug);
    const newDir = this.pathResolver.join(this.getDomainPath(ctx), newSlug);
    await this.fs.rename(oldDir, newDir);
  }
}
