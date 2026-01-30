/**
 * Tests for workspace isolation in fake services.
 *
 * Per Plan 021 Phase 3: Verifies that fake services properly isolate
 * data by workspace using composite keys (worktreePath|slug).
 */

import { beforeEach, describe, expect, test } from 'vitest';

import {
  FakeWorkGraphService,
  FakeWorkNodeService,
  FakeWorkUnitService,
} from '@chainglass/workgraph/fakes';

import { createTestWorkspaceContext } from '../../helpers/workspace-context.js';

describe('Fake workspace isolation', () => {
  describe('FakeWorkGraphService', () => {
    let fake: FakeWorkGraphService;

    beforeEach(() => {
      fake = new FakeWorkGraphService();
    });

    test('same slug in different workspaces are independent', async () => {
      const ctxA = createTestWorkspaceContext('/workspace-a');
      const ctxB = createTestWorkspaceContext('/workspace-b');

      // Set different preset results per workspace
      fake.setPresetCreateResult(ctxA, 'graph', {
        graphSlug: 'graph',
        path: '/a/path',
        errors: [],
      });
      fake.setPresetCreateResult(ctxB, 'graph', {
        graphSlug: 'graph',
        path: '/b/path',
        errors: [],
      });

      const resultA = await fake.create(ctxA, 'graph');
      const resultB = await fake.create(ctxB, 'graph');

      expect(resultA.path).toBe('/a/path');
      expect(resultB.path).toBe('/b/path');
    });

    test('getCalls() records ctx for inspection', async () => {
      const ctx = createTestWorkspaceContext('/workspace');

      await fake.create(ctx, 'my-graph');

      const calls = fake.getCreateCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].ctx.worktreePath).toBe('/workspace');
      expect(calls[0].slug).toBe('my-graph');
    });

    test('reset() clears all state', async () => {
      const ctx = createTestWorkspaceContext('/workspace');

      fake.setPresetCreateResult(ctx, 'graph', { graphSlug: 'graph', path: '/path', errors: [] });
      await fake.create(ctx, 'graph');

      fake.reset();

      expect(fake.getCreateCalls()).toHaveLength(0);
      // After reset, should use default result
      const result = await fake.create(ctx, 'graph');
      expect(result.path).toBe('.chainglass/data/work-graphs/graph');
    });
  });

  describe('FakeWorkNodeService', () => {
    let fake: FakeWorkNodeService;

    beforeEach(() => {
      fake = new FakeWorkNodeService();
    });

    test('same graph:node in different workspaces are independent', async () => {
      const ctxA = createTestWorkspaceContext('/workspace-a');
      const ctxB = createTestWorkspaceContext('/workspace-b');

      fake.setPresetCanRunResult(ctxA, 'graph', 'node-1', { canRun: true, errors: [] });
      fake.setPresetCanRunResult(ctxB, 'graph', 'node-1', {
        canRun: false,
        errors: [{ code: 'E999', message: 'blocked', action: 'wait' }],
      });

      const resultA = await fake.canRun(ctxA, 'graph', 'node-1');
      const resultB = await fake.canRun(ctxB, 'graph', 'node-1');

      expect(resultA.canRun).toBe(true);
      expect(resultB.canRun).toBe(false);
    });

    test('getCalls() records ctx for inspection', async () => {
      const ctx = createTestWorkspaceContext('/workspace');

      await fake.start(ctx, 'graph', 'node-1');

      const calls = fake.getStartCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].ctx.worktreePath).toBe('/workspace');
      expect(calls[0].graphSlug).toBe('graph');
      expect(calls[0].nodeId).toBe('node-1');
    });

    test('reset() clears all state including canEndCalls', async () => {
      const ctx = createTestWorkspaceContext('/workspace');

      // Use various methods
      await fake.start(ctx, 'graph', 'node-1');
      await fake.canEnd(ctx, 'graph', 'node-1');
      await fake.getAnswer(ctx, 'graph', 'node-1', 'q-1');

      fake.reset();

      expect(fake.getStartCalls()).toHaveLength(0);
      expect(fake.getCanEndCalls()).toHaveLength(0);
      expect(fake.getGetAnswerCalls()).toHaveLength(0);
    });

    test('getAnswer() has full fake support', async () => {
      const ctx = createTestWorkspaceContext('/workspace');

      // Set preset answer result
      fake.setPresetGetAnswerResult(ctx, 'graph', 'node-1', 'q-123', {
        nodeId: 'node-1',
        questionId: 'q-123',
        answered: true,
        answer: 'my answer',
        errors: [],
      });

      const result = await fake.getAnswer(ctx, 'graph', 'node-1', 'q-123');

      expect(result.answered).toBe(true);
      expect(result.answer).toBe('my answer');

      const calls = fake.getGetAnswerCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].ctx.worktreePath).toBe('/workspace');
      expect(calls[0].questionId).toBe('q-123');
    });
  });

  describe('FakeWorkUnitService', () => {
    let fake: FakeWorkUnitService;

    beforeEach(() => {
      fake = new FakeWorkUnitService();
    });

    test('same slug in different workspaces are independent', async () => {
      const ctxA = createTestWorkspaceContext('/workspace-a');
      const ctxB = createTestWorkspaceContext('/workspace-b');

      fake.setPresetLoadResult(ctxA, 'my-unit', {
        unit: { slug: 'my-unit', type: 'agent', path: '/a/units/my-unit' },
        errors: [],
      });
      fake.setPresetLoadResult(ctxB, 'my-unit', {
        unit: { slug: 'my-unit', type: 'code', path: '/b/units/my-unit' },
        errors: [],
      });

      const resultA = await fake.load(ctxA, 'my-unit');
      const resultB = await fake.load(ctxB, 'my-unit');

      expect(resultA.unit?.type).toBe('agent');
      expect(resultB.unit?.type).toBe('code');
    });

    test('list() isolates by workspace', async () => {
      const ctxA = createTestWorkspaceContext('/workspace-a');
      const ctxB = createTestWorkspaceContext('/workspace-b');

      fake.setPresetListResult(ctxA, {
        units: [{ slug: 'unit-a', type: 'agent', path: '/a' }],
        errors: [],
      });
      fake.setPresetListResult(ctxB, {
        units: [{ slug: 'unit-b', type: 'code', path: '/b' }],
        errors: [],
      });

      const resultA = await fake.list(ctxA);
      const resultB = await fake.list(ctxB);

      expect(resultA.units).toHaveLength(1);
      expect(resultA.units[0].slug).toBe('unit-a');
      expect(resultB.units).toHaveLength(1);
      expect(resultB.units[0].slug).toBe('unit-b');
    });

    test('getCalls() records ctx for inspection', async () => {
      const ctx = createTestWorkspaceContext('/workspace');

      await fake.list(ctx);

      const calls = fake.getListCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].ctx.worktreePath).toBe('/workspace');
    });

    test('reset() clears all state', async () => {
      const ctx = createTestWorkspaceContext('/workspace');

      fake.setDefaultUnits([{ slug: 'default', type: 'agent', path: '/default' }]);
      fake.setPresetListResult(ctx, { units: [], errors: [] });
      await fake.list(ctx);

      fake.reset();

      expect(fake.getListCalls()).toHaveLength(0);
      // After reset, should use empty defaultUnits
      const result = await fake.list(ctx);
      expect(result.units).toHaveLength(0);
    });
  });
});
