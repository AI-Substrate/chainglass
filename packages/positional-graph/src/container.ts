import {
  type IAgentManagerService,
  type IFileSystem,
  type IPathResolver,
  type IYamlParser,
  ORCHESTRATION_DI_TOKENS,
  POSITIONAL_GRAPH_DI_TOKENS,
  SHARED_DI_TOKENS,
} from '@chainglass/shared';
import type { DependencyContainer } from 'tsyringe';
import { PositionalGraphAdapter } from './adapter/positional-graph.adapter.js';
import { WorkUnitAdapter, WorkUnitService } from './features/029-agentic-work-units/index.js';
import { AgentContextService } from './features/030-orchestration/agent-context.js';
import { ODS } from './features/030-orchestration/ods.js';
import { ONBAS } from './features/030-orchestration/onbas.js';
import { OrchestrationService } from './features/030-orchestration/orchestration-service.js';
import { PodManager } from './features/030-orchestration/pod-manager.js';
import type { IScriptRunner } from './features/030-orchestration/script-runner.types.js';
import type { IEventHandlerService } from './features/032-node-event-system/event-handler-service.interface.js';
import type { IWorkUnitLoader } from './interfaces/index.js';
import type { IPositionalGraphService } from './interfaces/positional-graph-service.interface.js';
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

  // Register WorkUnitAdapter (Plan 029: Phase 3)
  container.register(POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_ADAPTER, {
    useFactory: (c: DependencyContainer) => {
      const fs = c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
      const pathResolver = c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
      return new WorkUnitAdapter(fs, pathResolver);
    },
  });

  // Register WorkUnitService (Plan 029: Phase 3)
  // Per Critical Insight #5: Also wire to WORK_UNIT_LOADER for backward compatibility
  container.register(POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE, {
    useFactory: (c: DependencyContainer) => {
      const fs = c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
      const yamlParser = c.resolve<IYamlParser>(SHARED_DI_TOKENS.YAML_PARSER);
      const adapter = c.resolve<WorkUnitAdapter>(POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_ADAPTER);
      return new WorkUnitService(adapter, fs, yamlParser);
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
      const workUnitLoader = c.resolve<IWorkUnitLoader>(
        POSITIONAL_GRAPH_DI_TOKENS.WORK_UNIT_LOADER
      );
      return new PositionalGraphService(fs, pathResolver, yamlParser, adapter, workUnitLoader);
    },
  });
}

/**
 * Register orchestration services into a DI container.
 *
 * Per Plan 030 Phase 7, ADR-0009: Module registration function.
 * Per ADR-0004: useFactory pattern only.
 *
 * Internal collaborators (ONBAS, ODS, PodManager, AgentContextService)
 * are created inside the factory — NOT registered as separate tokens.
 *
 * Prerequisite tokens (must be registered before calling):
 * - POSITIONAL_GRAPH_DI_TOKENS.POSITIONAL_GRAPH_SERVICE (IPositionalGraphService)
 * - ORCHESTRATION_DI_TOKENS.AGENT_MANAGER (IAgentManagerService)
 * - ORCHESTRATION_DI_TOKENS.SCRIPT_RUNNER (IScriptRunner)
 * - ORCHESTRATION_DI_TOKENS.EVENT_HANDLER_SERVICE (IEventHandlerService)
 * - SHARED_DI_TOKENS.FILESYSTEM (IFileSystem)
 */
export function registerOrchestrationServices(container: DependencyContainer): void {
  container.register(ORCHESTRATION_DI_TOKENS.ORCHESTRATION_SERVICE, {
    useFactory: (c: DependencyContainer) => {
      const graphService = c.resolve<IPositionalGraphService>(
        POSITIONAL_GRAPH_DI_TOKENS.POSITIONAL_GRAPH_SERVICE
      );
      const agentManager = c.resolve<IAgentManagerService>(ORCHESTRATION_DI_TOKENS.AGENT_MANAGER);
      const scriptRunner = c.resolve<IScriptRunner>(ORCHESTRATION_DI_TOKENS.SCRIPT_RUNNER);
      const eventHandlerService = c.resolve<IEventHandlerService>(
        ORCHESTRATION_DI_TOKENS.EVENT_HANDLER_SERVICE
      );
      const fs = c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);

      const onbas = new ONBAS();
      const contextService = new AgentContextService();
      const podManager = new PodManager(fs);
      const ods = new ODS({ graphService, podManager, contextService, agentManager, scriptRunner });

      return new OrchestrationService({
        graphService,
        onbas,
        ods,
        eventHandlerService,
        podManager,
      });
    },
  });
}
