/**
 * InstanceAdapter — filesystem path resolution for workflow instances.
 *
 * Overrides getDomainPath() to use `.chainglass/instances/`
 * instead of `.chainglass/data/instances/`. Instances are Git-tracked.
 *
 * Per Workshop 003: All instance data (state.json, outputs, events) lives
 * under `.chainglass/instances/` — no separate data path.
 * Per WorkUnitAdapter precedent: Override getDomainPath() for tracked storage.
 */

import type { IFileSystem, IPathResolver } from '@chainglass/shared';

import type { WorkspaceContext } from '../interfaces/workspace-context.interface.js';
import { WorkspaceDataAdapterBase } from './workspace-data-adapter-base.js';

const SLUG_PATTERN = /^[a-z][a-z0-9-]*$/;

export class InstanceAdapter extends WorkspaceDataAdapterBase {
  readonly domain = 'instances';

  /**
   * Override: Use `.chainglass/instances/` (tracked)
   * instead of `.chainglass/data/instances/` (ephemeral).
   */
  protected override getDomainPath(ctx: WorkspaceContext): string {
    return this.pathResolver.join(ctx.worktreePath, '.chainglass', 'instances');
  }

  /** Root directory for a specific instance */
  getInstanceDir(ctx: WorkspaceContext, workflowSlug: string, instanceId: string): string {
    this.validateSlug(workflowSlug);
    this.validateSlug(instanceId);
    return this.pathResolver.join(this.getDomainPath(ctx), workflowSlug, instanceId);
  }

  /** Units directory within an instance */
  getInstanceUnitDir(
    ctx: WorkspaceContext,
    workflowSlug: string,
    instanceId: string,
    unitSlug: string
  ): string {
    return this.pathResolver.join(
      this.getInstanceDir(ctx, workflowSlug, instanceId),
      'units',
      unitSlug
    );
  }

  /** List all instance IDs for a workflow template */
  async listInstanceIds(ctx: WorkspaceContext, workflowSlug: string): Promise<string[]> {
    this.validateSlug(workflowSlug);
    const workflowDir = this.pathResolver.join(this.getDomainPath(ctx), workflowSlug);
    const exists = await this.fs.exists(workflowDir);
    if (!exists) {
      return [];
    }
    const entries = await this.fs.readDir(workflowDir);
    return entries.filter((entry: string) => SLUG_PATTERN.test(entry));
  }

  /** Check if an instance exists (has instance.yaml) */
  async instanceExists(
    ctx: WorkspaceContext,
    workflowSlug: string,
    instanceId: string
  ): Promise<boolean> {
    const instanceYamlPath = this.pathResolver.join(
      this.getInstanceDir(ctx, workflowSlug, instanceId),
      'instance.yaml'
    );
    return this.fs.exists(instanceYamlPath);
  }

  /** Ensure the instance directory structure exists */
  async ensureInstanceDir(
    ctx: WorkspaceContext,
    workflowSlug: string,
    instanceId: string
  ): Promise<void> {
    const instanceDir = this.getInstanceDir(ctx, workflowSlug, instanceId);
    await this.fs.mkdir(instanceDir, { recursive: true });
    await this.fs.mkdir(this.pathResolver.join(instanceDir, 'nodes'), { recursive: true });
    await this.fs.mkdir(this.pathResolver.join(instanceDir, 'units'), { recursive: true });
  }

  private validateSlug(slug: string): void {
    if (!SLUG_PATTERN.test(slug)) {
      throw new Error(`Invalid slug '${slug}': must match /^[a-z][a-z0-9-]*$/`);
    }
  }
}
