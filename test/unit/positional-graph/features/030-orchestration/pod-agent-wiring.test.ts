/**
 * AgentPod Wiring Tests — verifies AgentPod wraps IAgentInstance.
 *
 * Purpose: Proves AgentPod constructor accepts (nodeId, agentInstance, unitSlug),
 * delegates run/terminate to the instance, reads sessionId from instance
 * (not internal tracking), and does not pass contextSessionId.
 *
 * Quality Contribution: Catches regressions in pod ↔ instance delegation
 * that would break agent lifecycle tracking and session management.
 *
 * Acceptance Criteria: AC-05, AC-06, AC-07
 */
import { describe, expect, it } from 'vitest';

import { FakeAgentInstance } from '@chainglass/shared';
import { AgentPod } from '../../../../../packages/positional-graph/src/features/030-orchestration/pod.agent.js';
import type { PodExecuteOptions } from '../../../../../packages/positional-graph/src/features/030-orchestration/pod.types.js';

function makeExecuteOptions(): PodExecuteOptions {
  return {
    inputs: { ok: true, inputs: {} },
    ctx: { worktreePath: '/test/workspace' },
    graphSlug: 'test-graph',
  };
}

function makeFakeInstance(sessionId?: string): FakeAgentInstance {
  const instance = new FakeAgentInstance({
    id: 'inst-1',
    name: 'spec-builder',
    type: 'copilot',
    workspace: '/test/workspace',
  });
  if (sessionId) {
    instance.setSessionId(sessionId);
  }
  return instance;
}

describe('AgentPod Wiring', () => {
  // ═══════════════════════════════════════════════════════
  // T007: constructor, delegation, sessionId
  // ═══════════════════════════════════════════════════════

  describe('constructor and delegation (AC-05, AC-07)', () => {
    it('constructs with (nodeId, agentInstance, unitSlug)', () => {
      const instance = makeFakeInstance();
      const pod = new AgentPod('n1', instance, 'spec-builder');
      expect(pod.nodeId).toBe('n1');
      expect(pod.unitType).toBe('agent');
    });

    it('delegates run to agentInstance.run', async () => {
      const instance = makeFakeInstance();
      instance.setNextRunResult({
        output: 'done',
        sessionId: 'sess-1',
        status: 'completed',
        exitCode: 0,
        tokens: { input: 10, output: 20, cacheRead: 0 },
      });
      const pod = new AgentPod('n1', instance, 'spec-builder');

      await pod.execute(makeExecuteOptions());

      const history = instance.getRunHistory();
      expect(history).toHaveLength(1);
      expect(history[0].cwd).toBe('/test/workspace');
    });

    it('delegates terminate to agentInstance.terminate', async () => {
      const instance = makeFakeInstance('sess-active');
      const pod = new AgentPod('n1', instance, 'spec-builder');

      await pod.terminate();

      expect(instance.getTerminateCount()).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════
  // T008: sessionId from instance, no contextSessionId
  // ═══════════════════════════════════════════════════════

  describe('sessionId and context (AC-06)', () => {
    it('reads sessionId from agentInstance', () => {
      const instance = makeFakeInstance('sess-abc');
      const pod = new AgentPod('n1', instance, 'spec-builder');
      expect(pod.sessionId).toBe('sess-abc');
    });

    it('bridges null sessionId to undefined', () => {
      const instance = makeFakeInstance();
      const pod = new AgentPod('n1', instance, 'spec-builder');
      expect(pod.sessionId).toBeUndefined();
    });

    it('execute does not pass contextSessionId', async () => {
      const instance = makeFakeInstance();
      instance.setNextRunResult({
        output: 'done',
        sessionId: 'sess-new',
        status: 'completed',
        exitCode: 0,
        tokens: { input: 10, output: 20, cacheRead: 0 },
      });
      const pod = new AgentPod('n1', instance, 'spec-builder');

      await pod.execute(makeExecuteOptions());

      const history = instance.getRunHistory();
      expect(history[0]).not.toHaveProperty('sessionId');
    });
  });
});
