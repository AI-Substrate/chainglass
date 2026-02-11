/**
 * Test Doc:
 * - Why: Pods are the execution containers that bridge work unit definitions
 *   with agent/code adapters. Incorrect pod behavior breaks agent execution,
 *   session tracking, and question/answer flows.
 * - Contract: AgentPod wraps IAgentAdapter.run() — maps AgentResult to
 *   PodExecuteResult (4 outcomes), owns mutable sessionId, reads
 *   node-starter-prompt.md. CodePod wraps IScriptRunner — no sessions,
 *   no question support. Both return PodExecuteResult.
 * - Usage Notes: Use FakeAgentAdapter (from @chainglass/shared) and
 *   FakeScriptRunner for deterministic testing. AgentPod requires
 *   node-starter-prompt.md in the feature folder.
 * - Quality Contribution: Catches regressions in adapter delegation,
 *   session tracking (DYK-P4#2), prompt loading (DYK-P4#1), and
 *   result mapping.
 * - Worked Example: AgentPod.execute() with FakeAgentAdapter returning
 *   { status: 'completed', sessionId: 'sess-1' } → PodExecuteResult
 *   { outcome: 'completed', sessionId: 'sess-1' }
 */

import { FakeAgentAdapter } from '@chainglass/shared';
import { describe, expect, it } from 'vitest';
// T003/T005 RED: These imports will fail until T004/T006 create the modules
import { AgentPod } from '../../../../../packages/positional-graph/src/features/030-orchestration/pod.agent.js';
import { CodePod } from '../../../../../packages/positional-graph/src/features/030-orchestration/pod.code.js';
import type { PodExecuteOptions } from '../../../../../packages/positional-graph/src/features/030-orchestration/pod.types.js';
import { FakeScriptRunner } from '../../../../../packages/positional-graph/src/features/030-orchestration/script-runner.types.js';

// ============================================
// Shared Test Fixtures
// ============================================

function makeOptions(overrides: Partial<PodExecuteOptions> = {}): PodExecuteOptions {
  return {
    inputs: { inputs: {}, ok: true },
    ctx: { worktreePath: '/workspace' },
    graphSlug: 'test-graph',
    ...overrides,
  };
}

// ============================================
// T003: AgentPod Tests (RED)
// ============================================

describe('AgentPod', () => {
  describe('execute()', () => {
    it('successful completion returns completed + sessionId', async () => {
      const adapter = new FakeAgentAdapter({
        status: 'completed',
        sessionId: 'sess-1',
        output: 'done',
      });
      const pod = new AgentPod('node-1', adapter);

      const result = await pod.execute(makeOptions());

      expect(result.outcome).toBe('completed');
      expect(result.sessionId).toBe('sess-1');
    });

    it('failed status maps to error outcome', async () => {
      const adapter = new FakeAgentAdapter({
        status: 'failed',
        exitCode: 1,
        stderr: 'something broke',
        sessionId: 'sess-err',
      });
      const pod = new AgentPod('node-1', adapter);

      const result = await pod.execute(makeOptions());

      expect(result.outcome).toBe('error');
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('AGENT_FAILED');
      expect(result.error?.message).toContain('something broke');
    });

    it('killed status maps to terminated outcome', async () => {
      const adapter = new FakeAgentAdapter({
        status: 'killed',
        sessionId: 'sess-kill',
      });
      const pod = new AgentPod('node-1', adapter);

      const result = await pod.execute(makeOptions());

      expect(result.outcome).toBe('terminated');
      expect(result.sessionId).toBe('sess-kill');
    });

    it('captures sessionId from adapter result', async () => {
      const adapter = new FakeAgentAdapter({
        status: 'completed',
        sessionId: 'sess-captured',
      });
      const pod = new AgentPod('node-1', adapter);

      expect(pod.sessionId).toBeUndefined();

      await pod.execute(makeOptions());

      expect(pod.sessionId).toBe('sess-captured');
    });

    it('passes contextSessionId to adapter', async () => {
      const adapter = new FakeAgentAdapter({
        status: 'completed',
        sessionId: 'sess-new',
      });
      const pod = new AgentPod('node-1', adapter);

      await pod.execute(makeOptions({ contextSessionId: 'sess-from-prev' }));

      const history = adapter.getRunHistory();
      expect(history).toHaveLength(1);
      expect(history[0].sessionId).toBe('sess-from-prev');
    });

    it('passes prompt content to adapter', async () => {
      const adapter = new FakeAgentAdapter({
        status: 'completed',
        sessionId: 'sess-1',
      });
      const pod = new AgentPod('node-1', adapter);

      await pod.execute(makeOptions());

      const history = adapter.getRunHistory();
      expect(history).toHaveLength(1);
      // AgentPod should pass some prompt content (from node-starter-prompt.md)
      expect(history[0].prompt).toBeDefined();
      expect(history[0].prompt.length).toBeGreaterThan(0);
    });

    it('adapter exception returns error outcome', async () => {
      const adapter = new FakeAgentAdapter({ status: 'completed' });
      // Override run to throw
      adapter.run = async () => {
        throw new Error('adapter crashed');
      };
      const pod = new AgentPod('node-1', adapter);

      const result = await pod.execute(makeOptions());

      expect(result.outcome).toBe('error');
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('POD_AGENT_EXECUTION_ERROR');
      expect(result.error?.message).toContain('adapter crashed');
    });

    it('passes cwd from ctx.worktreePath to adapter', async () => {
      const adapter = new FakeAgentAdapter({
        status: 'completed',
        sessionId: 'sess-1',
      });
      const pod = new AgentPod('node-1', adapter);

      await pod.execute(makeOptions({ ctx: { worktreePath: '/my/workspace' } }));

      const history = adapter.getRunHistory();
      expect(history[0].cwd).toBe('/my/workspace');
    });
  });

  describe('resumeWithAnswer()', () => {
    it('formats answer and calls adapter with existing session', async () => {
      const adapter = new FakeAgentAdapter({
        status: 'completed',
        sessionId: 'sess-resume',
      });
      const pod = new AgentPod('node-1', adapter);

      // First execute to establish session
      await pod.execute(makeOptions());
      adapter.reset();

      const result = await pod.resumeWithAnswer('q-1', 'Yes', makeOptions());

      expect(result.outcome).toBe('completed');
      const history = adapter.getRunHistory();
      expect(history).toHaveLength(1);
      expect(history[0].sessionId).toBe('sess-resume');
      expect(history[0].prompt).toContain('Yes');
    });

    it('no session returns error', async () => {
      const adapter = new FakeAgentAdapter({ status: 'completed' });
      const pod = new AgentPod('node-1', adapter);
      // Do NOT execute first — no sessionId

      const result = await pod.resumeWithAnswer('q-1', 'answer', makeOptions());

      expect(result.outcome).toBe('error');
      expect(result.error?.code).toBe('POD_NO_SESSION');
    });
  });

  describe('terminate()', () => {
    it('calls adapter.terminate() with sessionId', async () => {
      const adapter = new FakeAgentAdapter({
        status: 'completed',
        sessionId: 'sess-term',
      });
      const pod = new AgentPod('node-1', adapter);

      // Establish session
      await pod.execute(makeOptions());

      await pod.terminate();

      const terminateHistory = adapter.getTerminateHistory();
      expect(terminateHistory).toHaveLength(1);
      expect(terminateHistory[0]).toBe('sess-term');
    });

    it('does nothing if no session', async () => {
      const adapter = new FakeAgentAdapter({ status: 'completed' });
      const pod = new AgentPod('node-1', adapter);

      // Should not throw
      await pod.terminate();

      expect(adapter.getTerminateHistory()).toHaveLength(0);
    });
  });

  describe('properties', () => {
    it('has correct nodeId and unitType', () => {
      const adapter = new FakeAgentAdapter({ status: 'completed' });
      const pod = new AgentPod('my-node', adapter);

      expect(pod.nodeId).toBe('my-node');
      expect(pod.unitType).toBe('agent');
    });
  });
});

// ============================================
// T005: CodePod Tests (RED)
// ============================================

describe('CodePod', () => {
  describe('execute()', () => {
    it('successful script returns completed', async () => {
      const runner = new FakeScriptRunner({
        exitCode: 0,
        stdout: 'ok',
        outputs: { result: 'done' },
      });
      const pod = new CodePod('code-1', runner);

      const result = await pod.execute(makeOptions());

      expect(result.outcome).toBe('completed');
      expect(result.outputs).toEqual({ result: 'done' });
    });

    it('script failure returns error', async () => {
      const runner = new FakeScriptRunner({
        exitCode: 1,
        stderr: 'lint failed',
      });
      const pod = new CodePod('code-1', runner);

      const result = await pod.execute(makeOptions());

      expect(result.outcome).toBe('error');
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('SCRIPT_FAILED');
      expect(result.error?.message).toContain('lint failed');
    });

    it('sessionId is always undefined', async () => {
      const runner = new FakeScriptRunner({ exitCode: 0 });
      const pod = new CodePod('code-1', runner);

      expect(pod.sessionId).toBeUndefined();

      await pod.execute(makeOptions());

      expect(pod.sessionId).toBeUndefined();
    });

    it('passes inputs as env vars to runner', async () => {
      const runner = new FakeScriptRunner({ exitCode: 0 });
      const pod = new CodePod('code-1', runner);

      await pod.execute(
        makeOptions({
          inputs: {
            inputs: { spec: 'data', count: 42 },
            ok: true,
          },
        })
      );

      const history = runner.getRunHistory();
      expect(history).toHaveLength(1);
      expect(history[0].env.INPUT_SPEC).toBe('data');
      expect(history[0].env.INPUT_COUNT).toBe('42');
    });

    it('runner exception returns error outcome', async () => {
      const runner = new FakeScriptRunner({ exitCode: 0 });
      runner.run = async () => {
        throw new Error('process crashed');
      };
      const pod = new CodePod('code-1', runner);

      const result = await pod.execute(makeOptions());

      expect(result.outcome).toBe('error');
      expect(result.error?.code).toBe('POD_SCRIPT_EXECUTION_ERROR');
      expect(result.error?.message).toContain('process crashed');
    });
  });

  describe('resumeWithAnswer()', () => {
    it('returns not-supported error', async () => {
      const runner = new FakeScriptRunner({ exitCode: 0 });
      const pod = new CodePod('code-1', runner);

      const result = await pod.resumeWithAnswer('q-1', 'answer', makeOptions());

      expect(result.outcome).toBe('error');
      expect(result.error?.code).toBe('POD_NOT_SUPPORTED');
    });
  });

  describe('terminate()', () => {
    it('kills the runner', async () => {
      const runner = new FakeScriptRunner({ exitCode: 0 });
      const pod = new CodePod('code-1', runner);

      await pod.terminate();

      expect(runner.wasKilled).toBe(true);
    });
  });

  describe('properties', () => {
    it('has correct nodeId and unitType', () => {
      const runner = new FakeScriptRunner({ exitCode: 0 });
      const pod = new CodePod('my-code', runner);

      expect(pod.nodeId).toBe('my-code');
      expect(pod.unitType).toBe('code');
    });
  });
});
