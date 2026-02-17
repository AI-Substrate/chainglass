/*
Test Doc:
- Why: Verify registerOrchestrationServices() wires all deps correctly via DI (AC-10)
- Contract: Container resolves IOrchestrationService; .get(ctx, slug) returns a handle; handle has correct graphSlug
- Usage Notes: Prerequisite tokens (graphService, agentManager, scriptRunner, eventHandlerService, filesystem) must be registered before calling registerOrchestrationServices()
- Quality Contribution: Proves DI wiring is correct — the factory resolves all internal collaborators (ONBAS, ODS, PodManager, AgentContextService) without exposing them as tokens
- Worked Example: container.resolve(ORCHESTRATION_SERVICE) → service; service.get(ctx, 'my-graph') → handle; handle.graphSlug === 'my-graph'
*/

import 'reflect-metadata';
import { type DependencyContainer, container } from 'tsyringe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  registerOrchestrationServices,
  registerPositionalGraphServices,
} from '@chainglass/positional-graph';
import {
  FakeAgentManagerService,
  FakeFileSystem,
  FakePathResolver,
  ORCHESTRATION_DI_TOKENS,
  POSITIONAL_GRAPH_DI_TOKENS,
  SHARED_DI_TOKENS,
} from '@chainglass/shared';
import { FakeYamlParser } from '@chainglass/workflow';
import type { WorkspaceContext } from '@chainglass/workflow';
import type { IOrchestrationService } from '../../../../../packages/positional-graph/src/features/030-orchestration/orchestration-service.types.js';
import { FakeScriptRunner } from '../../../../../packages/positional-graph/src/features/030-orchestration/script-runner.types.js';
import { FakeEventHandlerService } from '../../../../../packages/positional-graph/src/features/032-node-event-system/fake-event-handler-service.js';

// ── Test Helpers ─────────────────────────────────────

function makeCtx(): WorkspaceContext {
  return {
    workspaceSlug: 'test-ws',
    workspaceName: 'Test Workspace',
    workspacePath: '/tmp/test',
    worktreePath: '/tmp/test',
    worktreeBranch: null,
    isMainWorktree: true,
    hasGit: false,
  };
}

// ═══════════════════════════════════════════════════════
// T011: Container integration test for orchestration DI
// ═══════════════════════════════════════════════════════

describe('Orchestration DI container', () => {
  let childContainer: DependencyContainer;

  beforeEach(() => {
    childContainer = container.createChildContainer();

    // Register shared prerequisite tokens
    childContainer.register(SHARED_DI_TOKENS.FILESYSTEM, {
      useValue: new FakeFileSystem(),
    });
    childContainer.register(SHARED_DI_TOKENS.PATH_RESOLVER, {
      useValue: new FakePathResolver(),
    });
    childContainer.register(SHARED_DI_TOKENS.YAML_PARSER, {
      useValue: new FakeYamlParser(),
    });

    // Register positional-graph services (provides POSITIONAL_GRAPH_SERVICE)
    registerPositionalGraphServices(childContainer);
    childContainer.register(POSITIONAL_GRAPH_DI_TOKENS.WORK_UNIT_LOADER, {
      useFactory: (c) => c.resolve(POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE),
    });

    // Register orchestration prerequisite tokens
    childContainer.register(ORCHESTRATION_DI_TOKENS.AGENT_MANAGER, {
      useValue: new FakeAgentManagerService(),
    });
    childContainer.register(ORCHESTRATION_DI_TOKENS.SCRIPT_RUNNER, {
      useValue: new FakeScriptRunner(),
    });
    childContainer.register(ORCHESTRATION_DI_TOKENS.EVENT_HANDLER_SERVICE, {
      useValue: new FakeEventHandlerService(),
    });

    // Register orchestration services
    registerOrchestrationServices(childContainer);
  });

  afterEach(() => {
    childContainer.dispose();
  });

  it('resolves IOrchestrationService from ORCHESTRATION_SERVICE token', () => {
    const service = childContainer.resolve<IOrchestrationService>(
      ORCHESTRATION_DI_TOKENS.ORCHESTRATION_SERVICE
    );

    expect(service).toBeDefined();
    expect(typeof service.get).toBe('function');
  });

  it('service.get() returns a handle with correct graphSlug', async () => {
    const service = childContainer.resolve<IOrchestrationService>(
      ORCHESTRATION_DI_TOKENS.ORCHESTRATION_SERVICE
    );

    const handle = await service.get(makeCtx(), 'test-pipeline');

    expect(handle).toBeDefined();
    expect(handle.graphSlug).toBe('test-pipeline');
  });

  it('handle has run() and getReality() methods', async () => {
    const service = childContainer.resolve<IOrchestrationService>(
      ORCHESTRATION_DI_TOKENS.ORCHESTRATION_SERVICE
    );

    const handle = await service.get(makeCtx(), 'method-check');

    expect(typeof handle.run).toBe('function');
    expect(typeof handle.getReality).toBe('function');
  });
});
