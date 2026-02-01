import {
  type IFileSystem,
  type IPathResolver,
  type IYamlParser,
  POSITIONAL_GRAPH_DI_TOKENS,
  SHARED_DI_TOKENS,
} from '@chainglass/shared';
import type { DependencyContainer } from 'tsyringe';
import { PositionalGraphAdapter } from './adapter/positional-graph.adapter.js';
import { PositionalGraphService } from './services/positional-graph.service.js';

/**
 * Register positional-graph services into a DI container.
 *
 * Per ADR-0009: Module registration function.
 * Per DYK-I5: Adapter constructor needs only (fs, pathResolver).
 *
 * Prerequisite tokens (must be registered before calling):
 * - SHARED_DI_TOKENS.FILESYSTEM (IFileSystem)
 * - SHARED_DI_TOKENS.PATH_RESOLVER (IPathResolver)
 * - SHARED_DI_TOKENS.YAML_PARSER (IYamlParser)
 */
export function registerPositionalGraphServices(container: DependencyContainer): void {
  container.register(POSITIONAL_GRAPH_DI_TOKENS.POSITIONAL_GRAPH_ADAPTER, {
    useFactory: (c: DependencyContainer) => {
      const fs = c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
      const pathResolver = c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
      return new PositionalGraphAdapter(fs, pathResolver);
    },
  });

  container.register(POSITIONAL_GRAPH_DI_TOKENS.POSITIONAL_GRAPH_SERVICE, {
    useFactory: (c: DependencyContainer) => {
      const fs = c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
      const pathResolver = c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
      const yamlParser = c.resolve<IYamlParser>(SHARED_DI_TOKENS.YAML_PARSER);
      const adapter = c.resolve<PositionalGraphAdapter>(
        POSITIONAL_GRAPH_DI_TOKENS.POSITIONAL_GRAPH_ADAPTER
      );
      return new PositionalGraphService(fs, pathResolver, yamlParser, adapter);
    },
  });
}
