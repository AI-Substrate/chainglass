/**
 * Contract tests for IWorkflowApiClient — shared suite runs against both Fake and Real.
 *
 * Plan 076 Phase 4 Subtask 001: REST API + SDK.
 *
 * Pattern: follows test/contracts/ convention — shared test suite function called
 * with different implementations. Ensures Fake behavior matches Real behavior.
 *
 * @see test/contracts/agent-adapter.contract.ts for the established pattern.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type { IWorkflowApiClient } from '../../../src/sdk/workflow-api-client.interface.js';
import { FakeWorkflowApiClient } from '../../../src/sdk/fake-workflow-api-client.js';

// ── Shared Contract Test Suite ──────────────────────────

function workflowApiClientContractTests(
  name: string,
  createClient: () => IWorkflowApiClient & { simulateComplete?: (slug: string) => void },
) {
  describe(`${name} implements IWorkflowApiClient contract`, () => {
    let client: ReturnType<typeof createClient>;
    const graphSlug = 'test-workflow';

    beforeEach(() => {
      client = createClient();
    });

    it('run() starts a workflow and returns key', async () => {
      /**
       * Test Doc:
       * - Why: Core contract — run() must return ok:true with a key
       * - Contract: POST /execution returns {ok, key, already}
       * - Quality Contribution: Verifies basic start lifecycle
       */
      const result = await client.run(graphSlug);
      expect(result.ok).toBe(true);
      expect(result.key).toBeDefined();
      expect(typeof result.key).toBe('string');
      expect(result.already).toBe(false);
    });

    it('run() returns already:true when workflow is already running', async () => {
      /**
       * Test Doc:
       * - Why: Idempotent start — no double-execution
       * - Contract: Second run() returns already:true, same key
       */
      const first = await client.run(graphSlug);
      const second = await client.run(graphSlug);
      expect(second.ok).toBe(true);
      expect(second.already).toBe(true);
      expect(second.key).toBe(first.key);
    });

    it('getStatus() returns null before any execution', async () => {
      /**
       * Test Doc:
       * - Why: Status of non-existent execution is null
       * - Contract: GET /execution returns null when nothing running
       */
      const status = await client.getStatus(graphSlug);
      expect(status).toBeNull();
    });

    it('getStatus() returns running status after run()', async () => {
      /**
       * Test Doc:
       * - Why: Status reflects state transitions
       * - Contract: GET /execution returns running after POST
       */
      await client.run(graphSlug);
      const status = await client.getStatus(graphSlug);
      expect(status).not.toBeNull();
      expect(status!.status).toBe('running');
      expect(status!.graphSlug).toBe(graphSlug);
    });

    it('stop() stops a running workflow', async () => {
      /**
       * Test Doc:
       * - Why: Core contract — stop() must transition from running to stopped
       * - Contract: DELETE /execution returns stopped:true
       */
      await client.run(graphSlug);
      const result = await client.stop(graphSlug);
      expect(result.ok).toBe(true);
      expect(result.stopped).toBe(true);
    });

    it('stop() returns stopped:false when nothing running', async () => {
      /**
       * Test Doc:
       * - Why: Stopping a non-running workflow is a no-op
       * - Contract: DELETE /execution returns stopped:false
       */
      const result = await client.stop(graphSlug);
      expect(result.ok).toBe(true);
      expect(result.stopped).toBe(false);
    });

    it('getStatus() reflects stopped state after stop()', async () => {
      /**
       * Test Doc:
       * - Why: Status tracks state transitions through stop
       * - Contract: GET /execution returns stopped after DELETE
       */
      await client.run(graphSlug);
      await client.stop(graphSlug);
      const status = await client.getStatus(graphSlug);
      expect(status).not.toBeNull();
      expect(status!.status).toBe('stopped');
    });

    it('restart() restarts a workflow', async () => {
      /**
       * Test Doc:
       * - Why: Restart = stop + reset + start
       * - Contract: POST /execution/restart returns ok:true with new key
       */
      await client.run(graphSlug);
      const result = await client.restart(graphSlug);
      expect(result.ok).toBe(true);
      expect(result.key).toBeDefined();
    });

    it('getStatus() shows running after restart()', async () => {
      /**
       * Test Doc:
       * - Why: Restart transitions back to running
       * - Contract: GET /execution returns running after restart
       */
      await client.run(graphSlug);
      await client.stop(graphSlug);
      await client.restart(graphSlug);
      const status = await client.getStatus(graphSlug);
      expect(status).not.toBeNull();
      expect(status!.status).toBe('running');
    });

    it('getDetailed() returns detailed node status', async () => {
      /**
       * Test Doc:
       * - Why: Detailed endpoint provides per-node diagnostics
       * - Contract: GET /detailed returns slug, execution, lines[], questions, sessions
       */
      const detailed = await client.getDetailed(graphSlug);
      expect(detailed).not.toBeNull();
      expect(detailed!.slug).toBe(graphSlug);
      expect(detailed!.execution).toBeDefined();
      expect(detailed!.execution.totalNodes).toBeGreaterThan(0);
      expect(Array.isArray(detailed!.lines)).toBe(true);
      expect(detailed!.lines.length).toBeGreaterThan(0);
      expect(detailed!.lines[0].nodes.length).toBeGreaterThan(0);
      expect(detailed!.lines[0].nodes[0]).toHaveProperty('id');
      expect(detailed!.lines[0].nodes[0]).toHaveProperty('unitSlug');
      expect(detailed!.lines[0].nodes[0]).toHaveProperty('status');
      expect(detailed!.lines[0].nodes[0]).toHaveProperty('blockedBy');
    });

    it('run() on stopped workflow resumes it', async () => {
      /**
       * Test Doc:
       * - Why: run() on stopped workflow should restart execution
       * - Contract: POST /execution on stopped state returns ok:true
       */
      await client.run(graphSlug);
      await client.stop(graphSlug);
      const result = await client.run(graphSlug);
      expect(result.ok).toBe(true);
    });
  });
}

// ── Run Contract Suite Against FakeWorkflowApiClient ────

workflowApiClientContractTests('FakeWorkflowApiClient', () =>
  new FakeWorkflowApiClient({
    workspaceSlug: 'test-workspace',
    worktreePath: '/tmp/test-worktree',
  }),
);

// ── Fake-Specific Tests ────────────────────────────────

describe('FakeWorkflowApiClient state machine', () => {
  let fake: FakeWorkflowApiClient;
  const graphSlug = 'test-workflow';

  beforeEach(() => {
    fake = new FakeWorkflowApiClient({
      workspaceSlug: 'test-workspace',
      worktreePath: '/tmp/test-worktree',
    });
  });

  it('simulateProgress updates iterations', async () => {
    await fake.run(graphSlug);
    fake.simulateProgress(graphSlug, 5, 3);
    const status = await fake.getStatus(graphSlug);
    expect(status!.iterations).toBe(5);
    expect(status!.totalActions).toBe(3);
  });

  it('simulateComplete transitions to completed', async () => {
    await fake.run(graphSlug);
    fake.simulateComplete(graphSlug);
    const status = await fake.getStatus(graphSlug);
    expect(status!.status).toBe('completed');
  });

  it('reset() clears all state', async () => {
    await fake.run(graphSlug);
    fake.reset();
    const status = await fake.getStatus(graphSlug);
    expect(status).toBeNull();
  });

  it('getDetailed reflects completed state', async () => {
    await fake.run(graphSlug);
    fake.simulateComplete(graphSlug);
    const detailed = await fake.getDetailed(graphSlug);
    expect(detailed!.execution.completedNodes).toBe(2);
    expect(detailed!.execution.progress).toBe('100%');
  });

  it('multiple independent workflows', async () => {
    await fake.run('wf-1');
    await fake.run('wf-2');
    await fake.stop('wf-1');

    const status1 = await fake.getStatus('wf-1');
    const status2 = await fake.getStatus('wf-2');
    expect(status1!.status).toBe('stopped');
    expect(status2!.status).toBe('running');
  });
});
