/**
 * InstanceGraphAdapter — routes graph engine to an instance directory.
 *
 * Extends PositionalGraphAdapter with a pre-resolved instance path.
 * getGraphDir() returns the fixed path regardless of slug argument —
 * the adapter is scoped to one instance at construction time.
 *
 * Clean Architecture: same interface as PositionalGraphAdapter, swapped
 * via child container per execution context using useFactory.
 *
 * Per DYK #1 (Phase 3): Composite slugs fail validation regex.
 * Per InstanceWorkUnitAdapter precedent: basePath in constructor.
 * Per Workshop 003: Instance data at .chainglass/instances/ (tracked).
 */

import type { IFileSystem, IPathResolver } from '@chainglass/shared';

import type { WorkspaceContext } from '@chainglass/workflow';
import { PositionalGraphAdapter } from './positional-graph.adapter.js';

export class InstanceGraphAdapter extends PositionalGraphAdapter {
  constructor(
    fs: IFileSystem,
    pathResolver: IPathResolver,
    private readonly instancePath: string
  ) {
    super(fs, pathResolver);
  }

  /**
   * Returns the pre-resolved instance path.
   * Slug argument is ignored — this adapter is scoped to one instance.
   */
  override getGraphDir(_ctx: WorkspaceContext, _slug: string): string {
    return this.instancePath;
  }

  /**
   * Ensure the instance graph directory and nodes/ subdirectory exist.
   */
  override async ensureGraphDir(_ctx: WorkspaceContext, _slug: string): Promise<void> {
    await this.fs.mkdir(this.instancePath, { recursive: true });
    await this.fs.mkdir(this.pathResolver.join(this.instancePath, 'nodes'), { recursive: true });
  }

  /**
   * Check if the instance graph exists (graph.yaml present).
   */
  override async graphExists(_ctx: WorkspaceContext, _slug: string): Promise<boolean> {
    const graphYamlPath = this.pathResolver.join(this.instancePath, 'graph.yaml');
    return this.fs.exists(graphYamlPath);
  }

  /**
   * Not supported for instance adapter — scoped to a single instance.
   */
  override async listGraphSlugs(_ctx: WorkspaceContext): Promise<string[]> {
    return [];
  }

  /**
   * Not supported for instance adapter — instances are not removed via the graph adapter.
   */
  override async removeGraph(_ctx: WorkspaceContext, _slug: string): Promise<void> {
    // No-op: instance removal is handled via InstanceAdapter, not the graph adapter
  }
}
