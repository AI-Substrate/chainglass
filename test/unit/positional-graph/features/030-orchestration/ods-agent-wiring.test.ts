/**
 * ODS Agent Wiring Tests — verifies ODS creates agents through AgentManagerService.
 *
 * Purpose: Proves ODS.handleAgentOrCode() correctly maps AgentContextService
 * outcomes (new/inherit/fallback) to AgentManagerService methods (getNew/getWithSessionId),
 * resolves agent type from reality.settings, and passes agentInstance to PodManager.
 *
 * Quality Contribution: Catches regressions in the ODS → AgentManagerService wiring
 * that would cause agents to be created with wrong type, session, or params.
 *
 * Acceptance Criteria: AC-02, AC-03, AC-04, AC-11
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { IAgentManagerService } from '@chainglass/shared';
import { FakeAgentManagerService } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';

import { FakeAgentContextService } from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-agent-context.js';
import { buildFakeReality } from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-onbas.js';
import { FakePodManager } from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-pod-manager.js';
import { ODS } from '../../../../../packages/positional-graph/src/features/030-orchestration/ods.js';
import type { ODSDependencies } from '../../../../../packages/positional-graph/src/features/030-orchestration/ods.types.js';
import type { StartNodeResult } from '../../../../../packages/positional-graph/src/interfaces/positional-graph-service.interface.js';
import type { IPositionalGraphService } from '../../../../../packages/positional-graph/src/interfaces/positional-graph-service.interface.js';

function makeCtx(): WorkspaceContext {
  return {
    worktreePath: '/test/workspace',
    workspaceName: 'test-workspace',
    isMainWorktree: true,
    hasGit: false,
  };
}

function makeGraphServiceStub(): IPositionalGraphService {
  const defaultResult: StartNodeResult = {
    errors: [],
    nodeId: 'test',
    status: 'starting',
    startedAt: '2026-02-17T10:00:00Z',
  };
  return {
    startNode: async (_ctx: unknown, _graphSlug: unknown, nodeId: unknown) => ({
      ...defaultResult,
      nodeId: nodeId as string,
    }),
  } as unknown as IPositionalGraphService;
}

const stubRunner = {
  run: async () => ({ exitCode: 0, stdout: '', stderr: '', outputs: {} }),
  kill: () => {},
};

describe('ODS Agent Wiring', () => {
  let agentManager: FakeAgentManagerService;
  let podManager: FakePodManager;
  let contextService: FakeAgentContextService;
  let ods: ODS;
  const ctx = makeCtx();

  beforeEach(() => {
    agentManager = new FakeAgentManagerService();
    podManager = new FakePodManager();
    contextService = new FakeAgentContextService();
    const deps: ODSDependencies = {
      graphService: makeGraphServiceStub(),
      podManager,
      contextService,
      agentManager,
      scriptRunner: stubRunner,
    };
    ods = new ODS(deps);
  });

  // ═══════════════════════════════════════════════════════
  // T001: getNew path (source='new')
  // ═══════════════════════════════════════════════════════

  describe('getNew path (AC-02)', () => {
    it('calls agentManager.getNew with correct params when source is new', async () => {
      const reality = buildFakeReality({
        nodes: [{ nodeId: 'n1', unitSlug: 'spec-builder', unitType: 'agent', status: 'ready' }],
      });
      contextService.setContextSource('n1', { source: 'new' });

      const result = await ods.execute(
        {
          type: 'start-node',
          nodeId: 'n1',
          graphSlug: 'test-graph',
          inputs: { ok: true, inputs: {} },
        },
        ctx,
        reality
      );

      expect(result.ok).toBe(true);
      const agents = agentManager.getCreatedAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('spec-builder');
      expect(agents[0].type).toBe('copilot');
      expect(agents[0].workspace).toBe('/test/workspace');
    });
  });

  // ═══════════════════════════════════════════════════════
  // T002: getWithSessionId path (source='inherit')
  // ═══════════════════════════════════════════════════════

  describe('getWithSessionId path (AC-03)', () => {
    it('calls agentManager.getWithSessionId when inheriting and session exists', async () => {
      const reality = buildFakeReality({
        nodes: [{ nodeId: 'n2', unitSlug: 'spec-reviewer', unitType: 'agent', status: 'ready' }],
      });
      contextService.setContextSource('n2', { source: 'inherit', fromNodeId: 'n1' });
      podManager.seedSession('n1', 'session-abc');

      const result = await ods.execute(
        {
          type: 'start-node',
          nodeId: 'n2',
          graphSlug: 'test-graph',
          inputs: { ok: true, inputs: {} },
        },
        ctx,
        reality
      );

      expect(result.ok).toBe(true);
      const agents = agentManager.getCreatedAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].sessionId).toBe('session-abc');
    });
  });

  // ═══════════════════════════════════════════════════════
  // T003: inherit fallback to getNew
  // ═══════════════════════════════════════════════════════

  describe('inherit fallback (AC-04)', () => {
    it('falls back to getNew when inheriting but source node has no session', async () => {
      const reality = buildFakeReality({
        nodes: [{ nodeId: 'n2', unitSlug: 'spec-reviewer', unitType: 'agent', status: 'ready' }],
      });
      contextService.setContextSource('n2', { source: 'inherit', fromNodeId: 'n1' });
      // No session seeded for n1

      const result = await ods.execute(
        {
          type: 'start-node',
          nodeId: 'n2',
          graphSlug: 'test-graph',
          inputs: { ok: true, inputs: {} },
        },
        ctx,
        reality
      );

      expect(result.ok).toBe(true);
      const agents = agentManager.getCreatedAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].sessionId).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════
  // T004: agent type resolution from reality.settings
  // ═══════════════════════════════════════════════════════

  describe('agent type resolution (AC-11)', () => {
    it('uses reality.settings.agentType when present', async () => {
      const reality = {
        ...buildFakeReality({
          nodes: [{ nodeId: 'n1', unitSlug: 'coder', unitType: 'agent', status: 'ready' }],
        }),
        settings: { agentType: 'claude-code' as const },
      };
      contextService.setContextSource('n1', { source: 'new' });

      await ods.execute(
        {
          type: 'start-node',
          nodeId: 'n1',
          graphSlug: 'test-graph',
          inputs: { ok: true, inputs: {} },
        },
        ctx,
        reality
      );

      const agents = agentManager.getCreatedAgents();
      expect(agents[0].type).toBe('claude-code');
    });

    it('defaults to copilot when settings is missing', async () => {
      const reality = buildFakeReality({
        nodes: [{ nodeId: 'n1', unitSlug: 'coder', unitType: 'agent', status: 'ready' }],
      });
      contextService.setContextSource('n1', { source: 'new' });

      await ods.execute(
        {
          type: 'start-node',
          nodeId: 'n1',
          graphSlug: 'test-graph',
          inputs: { ok: true, inputs: {} },
        },
        ctx,
        reality
      );

      const agents = agentManager.getCreatedAgents();
      expect(agents[0].type).toBe('copilot');
    });
  });
});
