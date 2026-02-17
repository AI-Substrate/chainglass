/**
 * Test Doc:
 * - Why: PodManager tracks pod lifecycle and session persistence. FakePodManager
 *   enables deterministic testing. Incorrect behavior breaks pod creation, session
 *   persistence across restarts, and downstream ODS integration.
 * - Contract: IPodManager creates pods by unit type, tracks sessions (survive
 *   pod destroy), persists/loads from pod-sessions.json via atomic writes.
 *   FakePodManager supports configurePod, seedSession, history tracking.
 *   Contract tests verify fake/real behavioral parity.
 * - Usage Notes: Real PodManager needs IFileSystem for persistence. FakePodManager
 *   needs nothing. Both receive adapter/runner via createPod() params (DYK-P4#4).
 *   Contract tests use per-implementation setup, shared assertions (DYK-P4#3).
 * - Quality Contribution: Catches regressions in pod creation, session tracking,
 *   atomic persistence, and fake/real parity.
 * - Worked Example: createPod('node-1', { unitType: 'agent', ... }) → AgentPod,
 *   setSessionId('node-1', 'sess-1'), persistSessions(), loadSessions() → sessions
 *   contain 'node-1' → 'sess-1'.
 */

import { FakeAgentInstance, FakeFileSystem } from '@chainglass/shared';
import { beforeEach, describe, expect, it } from 'vitest';
// T007/T009 RED: These imports will fail until T008/T010 create the modules
import { FakePodManager } from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-pod-manager.js';
import { PodManager } from '../../../../../packages/positional-graph/src/features/030-orchestration/pod-manager.js';
import type {
  IPodManager,
  PodCreateParams,
} from '../../../../../packages/positional-graph/src/features/030-orchestration/pod-manager.types.js';
import { FakeScriptRunner } from '../../../../../packages/positional-graph/src/features/030-orchestration/script-runner.types.js';

// ============================================
// Shared Fixtures
// ============================================

function makeAgentParams(): PodCreateParams {
  return {
    unitType: 'agent',
    unitSlug: 'test-agent',
    agentInstance: new FakeAgentInstance({
      id: 'inst-test',
      name: 'test-agent',
      type: 'copilot',
      workspace: '/workspace',
    }),
  };
}

function makeCodeParams(runner?: FakeScriptRunner): PodCreateParams {
  return {
    unitType: 'code',
    unitSlug: 'test-script',
    runner: runner ?? new FakeScriptRunner({ exitCode: 0 }),
  };
}

// ============================================
// T007: FakePodManager Tests
// ============================================

describe('FakePodManager', () => {
  let fake: FakePodManager;

  beforeEach(() => {
    fake = new FakePodManager();
  });

  it('configurePod + createPod returns FakePod with configured results', async () => {
    fake.configurePod('node-1', {
      executeResult: { outcome: 'completed', sessionId: 'sess-configured' },
    });

    const pod = fake.createPod('node-1', makeAgentParams());
    const result = await pod.execute({
      inputs: { inputs: {}, ok: true },
      ctx: { worktreePath: '/ws' },
      graphSlug: 'test',
    });

    expect(result.outcome).toBe('completed');
    expect(result.sessionId).toBe('sess-configured');
  });

  it('seedSession + getSessionId', () => {
    fake.seedSession('node-1', 'sess-seeded');

    expect(fake.getSessionId('node-1')).toBe('sess-seeded');
  });

  it('getCreateHistory tracks createPod calls', () => {
    fake.createPod('node-1', makeAgentParams());
    fake.createPod('node-2', makeCodeParams());

    const history = fake.getCreateHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ nodeId: 'node-1', unitType: 'agent', unitSlug: 'test-agent' });
    expect(history[1]).toEqual({ nodeId: 'node-2', unitType: 'code', unitSlug: 'test-script' });
  });

  it('reset clears everything', () => {
    fake.seedSession('node-1', 'sess-1');
    fake.createPod('node-1', makeAgentParams());

    fake.reset();

    expect(fake.getSessionId('node-1')).toBeUndefined();
    expect(fake.getPod('node-1')).toBeUndefined();
    expect(fake.getCreateHistory()).toHaveLength(0);
  });

  it('FakePod tracks wasExecuted/wasResumed/wasTerminated', async () => {
    fake.configurePod('node-1', {
      executeResult: { outcome: 'completed', sessionId: 'sess-1' },
    });

    const pod = fake.createPod('node-1', makeAgentParams());
    const fakePod = pod as { wasExecuted: boolean; wasResumed: boolean; wasTerminated: boolean };

    expect(fakePod.wasExecuted).toBe(false);
    expect(fakePod.wasResumed).toBe(false);
    expect(fakePod.wasTerminated).toBe(false);

    await pod.execute({
      inputs: { inputs: {}, ok: true },
      ctx: { worktreePath: '/ws' },
      graphSlug: 'test',
    });
    expect(fakePod.wasExecuted).toBe(true);

    await pod.resumeWithAnswer('q-1', 'answer', {
      inputs: { inputs: {}, ok: true },
      ctx: { worktreePath: '/ws' },
      graphSlug: 'test',
    });
    expect(fakePod.wasResumed).toBe(true);

    await pod.terminate();
    expect(fakePod.wasTerminated).toBe(true);
  });

  it('destroyPod retains session', () => {
    fake.seedSession('node-1', 'sess-1');
    fake.createPod('node-1', makeAgentParams());

    fake.destroyPod('node-1');

    expect(fake.getPod('node-1')).toBeUndefined();
    expect(fake.getSessionId('node-1')).toBe('sess-1');
  });

  it('getPod returns undefined for uncreated node', () => {
    expect(fake.getPod('nonexistent')).toBeUndefined();
  });

  it('loadSessions and persistSessions are no-ops', async () => {
    // Should not throw
    await fake.loadSessions({ worktreePath: '/ws' }, 'test');
    await fake.persistSessions({ worktreePath: '/ws' }, 'test');
  });
});

// ============================================
// T009: Real PodManager Tests
// ============================================

describe('PodManager', () => {
  let fs: FakeFileSystem;
  let manager: PodManager;

  beforeEach(() => {
    fs = new FakeFileSystem();
    manager = new PodManager(fs);
  });

  describe('createPod', () => {
    it('agent unit returns AgentPod', () => {
      const pod = manager.createPod('node-1', makeAgentParams());

      expect(pod.unitType).toBe('agent');
      expect(pod.nodeId).toBe('node-1');
    });

    it('code unit returns CodePod', () => {
      const pod = manager.createPod('node-1', makeCodeParams());

      expect(pod.unitType).toBe('code');
      expect(pod.nodeId).toBe('node-1');
    });

    it('returns existing pod if already active', () => {
      const pod1 = manager.createPod('node-1', makeAgentParams());
      const pod2 = manager.createPod('node-1', makeAgentParams());

      expect(pod1).toBe(pod2);
    });
  });

  describe('getPod', () => {
    it('returns undefined for uncreated node', () => {
      expect(manager.getPod('nonexistent')).toBeUndefined();
    });

    it('returns undefined after destroy', () => {
      manager.createPod('node-1', makeAgentParams());
      manager.destroyPod('node-1');

      expect(manager.getPod('node-1')).toBeUndefined();
    });
  });

  describe('sessions', () => {
    it('setSessionId + getSessionId roundtrip', () => {
      manager.setSessionId('node-1', 'sess-abc');

      expect(manager.getSessionId('node-1')).toBe('sess-abc');
    });

    it('getSessions returns all', () => {
      manager.setSessionId('node-1', 'sess-1');
      manager.setSessionId('node-2', 'sess-2');

      const sessions = manager.getSessions();
      expect(sessions.size).toBe(2);
      expect(sessions.get('node-1')).toBe('sess-1');
      expect(sessions.get('node-2')).toBe('sess-2');
    });

    it('destroyPod retains session', () => {
      manager.createPod('node-1', makeAgentParams());
      manager.setSessionId('node-1', 'sess-1');
      manager.destroyPod('node-1');

      expect(manager.getPod('node-1')).toBeUndefined();
      expect(manager.getSessionId('node-1')).toBe('sess-1');
    });
  });

  describe('persistence', () => {
    const ctx = { worktreePath: '/workspace' };
    const graphSlug = 'my-graph';
    const sessionsPath = '/workspace/.chainglass/graphs/my-graph/pod-sessions.json';

    it('persistSessions writes JSON via atomicWriteFile', async () => {
      manager.setSessionId('node-1', 'sess-1');
      manager.setSessionId('node-2', 'sess-2');

      // Ensure parent directory exists for atomic write
      fs.setDir('/workspace/.chainglass/graphs/my-graph');

      await manager.persistSessions(ctx, graphSlug);

      const content = fs.getFile(sessionsPath);
      expect(content).toBeDefined();
      const parsed = JSON.parse(content ?? '');
      expect(parsed.sessions['node-1']).toBe('sess-1');
      expect(parsed.sessions['node-2']).toBe('sess-2');
      expect(parsed.persisted_at).toBeDefined();
    });

    it('loadSessions reads back persisted data', async () => {
      const data = JSON.stringify({
        sessions: { 'node-a': 'sess-a', 'node-b': 'sess-b' },
        persisted_at: '2026-02-06T12:00:00Z',
      });
      fs.setFile(sessionsPath, data);

      await manager.loadSessions(ctx, graphSlug);

      expect(manager.getSessionId('node-a')).toBe('sess-a');
      expect(manager.getSessionId('node-b')).toBe('sess-b');
    });

    it('loadSessions handles missing file gracefully', async () => {
      // No file set — should not throw
      await manager.loadSessions(ctx, graphSlug);

      expect(manager.getSessions().size).toBe(0);
    });

    it('persist + load roundtrip preserves data', async () => {
      fs.setDir('/workspace/.chainglass/graphs/my-graph');
      manager.setSessionId('node-1', 'sess-round');

      await manager.persistSessions(ctx, graphSlug);

      const manager2 = new PodManager(fs);
      await manager2.loadSessions(ctx, graphSlug);

      expect(manager2.getSessionId('node-1')).toBe('sess-round');
    });
  });
});

// ============================================
// T011: Contract Tests — Fake/Real PodManager Parity
// ============================================

describe('IPodManager contract', () => {
  const implementations: Array<{
    name: string;
    setup: () => IPodManager;
  }> = [
    {
      name: 'FakePodManager',
      setup: () => new FakePodManager(),
    },
    {
      name: 'PodManager (real)',
      setup: () => new PodManager(new FakeFileSystem()),
    },
  ];

  for (const { name, setup } of implementations) {
    describe(name, () => {
      let manager: IPodManager;

      beforeEach(() => {
        manager = setup();
      });

      it('createPod returns pod with correct unitType for agent', () => {
        const pod = manager.createPod('node-1', makeAgentParams());
        expect(pod.unitType).toBe('agent');
        expect(pod.nodeId).toBe('node-1');
      });

      it('createPod returns pod with correct unitType for code', () => {
        const pod = manager.createPod('node-1', makeCodeParams());
        expect(pod.unitType).toBe('code');
        expect(pod.nodeId).toBe('node-1');
      });

      it('getPod returns created pod', () => {
        const pod = manager.createPod('node-1', makeAgentParams());
        expect(manager.getPod('node-1')).toBe(pod);
      });

      it('getSessionId returns set session', () => {
        manager.setSessionId('node-1', 'sess-contract');
        expect(manager.getSessionId('node-1')).toBe('sess-contract');
      });

      it('getSessions includes all sessions', () => {
        manager.setSessionId('node-1', 'sess-1');
        manager.setSessionId('node-2', 'sess-2');

        const sessions = manager.getSessions();
        expect(sessions.get('node-1')).toBe('sess-1');
        expect(sessions.get('node-2')).toBe('sess-2');
      });

      it('destroyPod removes pod but retains session', () => {
        manager.createPod('node-1', makeAgentParams());
        manager.setSessionId('node-1', 'sess-retained');
        manager.destroyPod('node-1');

        expect(manager.getPod('node-1')).toBeUndefined();
        expect(manager.getSessionId('node-1')).toBe('sess-retained');
      });
    });
  }
});
