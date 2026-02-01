import {
  type IFileSystem,
  type IPathResolver,
  POSITIONAL_GRAPH_DI_TOKENS,
  SHARED_DI_TOKENS,
} from '@chainglass/shared';
import type { DependencyContainer } from 'tsyringe';
import { PositionalGraphAdapter } from './adapter/positional-graph.adapter.js';

/**
 * Register positional-graph services into a DI container.
 *
 * Per ADR-0009: Module registration function.
 * Per DYK-I5: Adapter constructor needs only (fs, pathResolver).
 *
 * Prerequisite tokens (must be registered before calling):
 * - SHARED_DI_TOKENS.FILESYSTEM (IFileSystem)
 * - SHARED_DI_TOKENS.PATH_RESOLVER (IPathResolver)
 *
 * Phase 3 will add: POSITIONAL_GRAPH_DI_TOKENS.POSITIONAL_GRAPH_SERVICE
 */
export function registerPositionalGraphServices(container: DependencyContainer): void {
  container.register(POSITIONAL_GRAPH_DI_TOKENS.POSITIONAL_GRAPH_ADAPTER, {
    useFactory: (c: DependencyContainer) => {
      const fs = c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
      const pathResolver = c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
      return new PositionalGraphAdapter(fs, pathResolver);
    },
  });
}
