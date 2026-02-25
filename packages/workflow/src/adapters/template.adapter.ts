/**
 * TemplateAdapter — filesystem path resolution for workflow templates.
 *
 * Overrides getDomainPath() to use `.chainglass/templates/workflows/`
 * instead of `.chainglass/data/templates/`. Templates are Git-tracked.
 *
 * Per Workshop 003: Templates live outside `.chainglass/data/` (gitignored).
 * Per WorkUnitAdapter precedent: Override getDomainPath() for tracked storage.
 * Per ADR-0008: Extends WorkspaceDataAdapterBase for path conventions.
 */

import type { IFileSystem, IPathResolver } from '@chainglass/shared';

import type { WorkspaceContext } from '../interfaces/workspace-context.interface.js';
import { WorkspaceDataAdapterBase } from './workspace-data-adapter-base.js';

const SLUG_PATTERN = /^[a-z][a-z0-9-]*$/;

export class TemplateAdapter extends WorkspaceDataAdapterBase {
  readonly domain = 'templates';

  /**
   * Override: Use `.chainglass/templates/workflows/` (tracked)
   * instead of `.chainglass/data/templates/` (ephemeral).
   */
  protected override getDomainPath(ctx: WorkspaceContext): string {
    return this.pathResolver.join(ctx.worktreePath, '.chainglass', 'templates', 'workflows');
  }

  /** Root directory for a specific workflow template */
  getTemplateDir(ctx: WorkspaceContext, slug: string): string {
    this.validateSlug(slug);
    return this.pathResolver.join(this.getDomainPath(ctx), slug);
  }

  /** Root directory for standalone unit templates */
  getStandaloneUnitDir(ctx: WorkspaceContext, slug: string): string {
    this.validateSlug(slug);
    return this.pathResolver.join(ctx.worktreePath, '.chainglass', 'templates', 'units', slug);
  }

  /** Path to a graph source directory (in .chainglass/data/workflows/) */
  getGraphSourceDir(ctx: WorkspaceContext, graphSlug: string): string {
    this.validateSlug(graphSlug);
    return this.pathResolver.join(ctx.worktreePath, '.chainglass', 'data', 'workflows', graphSlug);
  }

  /** Path to global units directory */
  getGlobalUnitsDir(ctx: WorkspaceContext): string {
    return this.pathResolver.join(ctx.worktreePath, '.chainglass', 'units');
  }

  /** List all workflow template slugs by scanning the templates directory */
  async listTemplateSlugs(ctx: WorkspaceContext): Promise<string[]> {
    const domainPath = this.getDomainPath(ctx);
    const exists = await this.fs.exists(domainPath);
    if (!exists) {
      return [];
    }
    const entries = await this.fs.readDir(domainPath);
    return entries.filter((entry: string) => SLUG_PATTERN.test(entry));
  }

  /** Check if a workflow template exists (has graph.yaml) */
  async templateExists(ctx: WorkspaceContext, slug: string): Promise<boolean> {
    const graphYamlPath = this.pathResolver.join(this.getTemplateDir(ctx, slug), 'graph.yaml');
    return this.fs.exists(graphYamlPath);
  }

  /** Ensure the template directory structure exists */
  async ensureTemplateDir(ctx: WorkspaceContext, slug: string): Promise<void> {
    const templateDir = this.getTemplateDir(ctx, slug);
    await this.fs.mkdir(templateDir, { recursive: true });
    await this.fs.mkdir(this.pathResolver.join(templateDir, 'nodes'), { recursive: true });
    await this.fs.mkdir(this.pathResolver.join(templateDir, 'units'), { recursive: true });
  }

  private validateSlug(slug: string): void {
    if (!SLUG_PATTERN.test(slug)) {
      throw new Error(`Invalid slug '${slug}': must match /^[a-z][a-z0-9-]*$/`);
    }
  }
}
