import type { IFileSystem, IPathResolver } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { WorkspaceDataAdapterBase } from '@chainglass/workflow/adapters';

/**
 * Filesystem adapter for positional graph data.
 *
 * Signpost pattern: provides one path method (`getGraphDir`) and directory
 * lifecycle operations. The service uses known offsets from getGraphDir
 * (graph.yaml, state.json, nodes/<id>/node.yaml) for I/O.
 *
 * Per DYK-I1: Adapter = path signpost + directory lifecycle, not I/O layer.
 * Per ADR-0008: Extends WorkspaceDataAdapterBase for getDomainPath.
 * Per CD-11: Domain = 'workflows', path = ctx.worktreePath/.chainglass/data/workflows/<slug>/
 */
export class PositionalGraphAdapter extends WorkspaceDataAdapterBase {
  readonly domain = 'workflows';

  /**
   * Get the root directory for a specific graph.
   * Service uses known offsets from here: graph.yaml, state.json, nodes/<id>/node.yaml
   */
  getGraphDir(ctx: WorkspaceContext, slug: string): string {
    if (!/^[a-z][a-z0-9-]*$/.test(slug)) {
      throw new Error(`Invalid graph slug '${slug}': must match /^[a-z][a-z0-9-]*$/`);
    }
    return this.pathResolver.join(this.getDomainPath(ctx), slug);
  }

  /**
   * Ensure the graph directory and nodes/ subdirectory exist.
   */
  async ensureGraphDir(ctx: WorkspaceContext, slug: string): Promise<void> {
    const graphDir = this.getGraphDir(ctx, slug);
    await this.fs.mkdir(graphDir, { recursive: true });
    await this.fs.mkdir(this.pathResolver.join(graphDir, 'nodes'), { recursive: true });
  }

  /**
   * List all graph slugs in the domain directory.
   */
  async listGraphSlugs(ctx: WorkspaceContext): Promise<string[]> {
    const domainPath = this.getDomainPath(ctx);
    const exists = await this.fs.exists(domainPath);
    if (!exists) {
      return [];
    }
    return this.fs.readDir(domainPath);
  }

  /**
   * Check if a graph exists (graph.yaml present in the graph directory).
   */
  async graphExists(ctx: WorkspaceContext, slug: string): Promise<boolean> {
    const graphYamlPath = this.pathResolver.join(this.getGraphDir(ctx, slug), 'graph.yaml');
    return this.fs.exists(graphYamlPath);
  }

  /**
   * Remove a graph directory and all its contents.
   */
  async removeGraph(ctx: WorkspaceContext, slug: string): Promise<void> {
    const graphDir = this.getGraphDir(ctx, slug);
    const exists = await this.fs.exists(graphDir);
    if (!exists) {
      return;
    }
    await this.fs.rmdir(graphDir, { recursive: true });
  }
}
