/**
 * Tests for AgentPod prompt template resolution and selection — Plan 036 Phase 2.
 *
 * Test Doc:
 * - Why: Validate prompt template resolution and starter/resume selection before agents run real tasks
 * - Contract: resolveTemplate replaces all {{placeholders}}; _hasExecuted discriminates starter vs resume
 * - Usage Notes: Tests construct AgentPod directly with FakeAgentInstance to capture prompt passed to run()
 * - Quality Contribution: Catches placeholder leaks (unresolved {{...}}) and wrong prompt selection
 * - Worked Example: AgentPod('node-1', fakeInstance, 'unit-1').execute({graphSlug:'g1',...}) → prompt contains 'g1', 'node-1', 'unit-1'
 *
 * @packageDocumentation
 */

import { FakeAgentInstance } from '@chainglass/shared';
import { describe, expect, it } from 'vitest';
import { AgentPod } from '../../../../../packages/positional-graph/src/features/030-orchestration/pod.agent.js';
import type { PodExecuteOptions } from '../../../../../packages/positional-graph/src/features/030-orchestration/pod.types.js';

// ── Helpers ─────────────────────────────────────────────

function makeFakeInstance(sessionId?: string): FakeAgentInstance {
  const instance = new FakeAgentInstance({
    id: 'inst-1',
    name: 'test-agent',
    type: 'copilot',
    workspace: '/test/workspace',
  });
  if (sessionId) {
    instance.setSessionId(sessionId);
  }
  return instance;
}

function makeExecuteOptions(overrides?: Partial<PodExecuteOptions>): PodExecuteOptions {
  return {
    inputs: { inputs: {}, ok: true },
    ctx: { worktreePath: '/test/workspace' },
    graphSlug: 'my-pipeline',
    ...overrides,
  };
}

// ── Template Resolution Tests ───────────────────────────

describe('AgentPod prompt template resolution', () => {
  it('resolves all {{graphSlug}} placeholders', async () => {
    const instance = makeFakeInstance();
    const pod = new AgentPod('spec-writer', instance, 'generate-spec');

    await pod.execute(makeExecuteOptions({ graphSlug: 'my-pipeline' }));

    const history = instance.getRunHistory();
    expect(history).toHaveLength(1);
    expect(history[0].prompt).toContain('my-pipeline');
    expect(history[0].prompt).not.toContain('{{graphSlug}}');
  });

  it('resolves all {{nodeId}} placeholders', async () => {
    const instance = makeFakeInstance();
    const pod = new AgentPod('spec-writer', instance, 'generate-spec');

    await pod.execute(makeExecuteOptions());

    const history = instance.getRunHistory();
    expect(history[0].prompt).toContain('spec-writer');
    expect(history[0].prompt).not.toContain('{{nodeId}}');
  });

  it('resolves all {{unitSlug}} placeholders', async () => {
    const instance = makeFakeInstance();
    const pod = new AgentPod('spec-writer', instance, 'generate-spec');

    await pod.execute(makeExecuteOptions());

    const history = instance.getRunHistory();
    expect(history[0].prompt).toContain('generate-spec');
    expect(history[0].prompt).not.toContain('{{unitSlug}}');
  });

  it('no unresolved {{...}} remain after resolution', async () => {
    const instance = makeFakeInstance();
    const pod = new AgentPod('n1', instance, 'u1');

    await pod.execute(makeExecuteOptions());

    const history = instance.getRunHistory();
    expect(history[0].prompt).not.toMatch(/\{\{/);
  });
});

// ── Prompt Selection Tests ──────────────────────────────

describe('AgentPod prompt selection (_hasExecuted)', () => {
  it('first execute uses starter prompt', async () => {
    const instance = makeFakeInstance();
    const pod = new AgentPod('n1', instance, 'u1');

    await pod.execute(makeExecuteOptions());

    const history = instance.getRunHistory();
    expect(history[0].prompt).toContain('Accept Your Assignment');
  });

  it('second execute uses resume prompt', async () => {
    const instance = makeFakeInstance();
    const pod = new AgentPod('n1', instance, 'u1');

    await pod.execute(makeExecuteOptions());
    await pod.execute(makeExecuteOptions());

    const history = instance.getRunHistory();
    expect(history[1].prompt).toContain('Resume Instructions');
    expect(history[1].prompt).not.toContain('Accept Your Assignment');
  });

  it('inherited session, first execute still uses starter', async () => {
    const instance = makeFakeInstance('inherited-session-abc');
    const pod = new AgentPod('n1', instance, 'u1');

    await pod.execute(makeExecuteOptions());

    const history = instance.getRunHistory();
    // Even with pre-existing sessionId, first execute gets starter
    expect(history[0].prompt).toContain('Accept Your Assignment');
  });
});
