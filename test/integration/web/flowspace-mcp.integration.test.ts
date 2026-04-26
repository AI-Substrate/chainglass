/**
 * FlowSpace MCP Integration Test
 *
 * Plan 084: env-gated test that spawns a real `fs2 mcp` child against the
 * chainglass repo's own `.fs2/graph.pickle`. Verifies the long-lived process
 * pool returns parseable results.
 *
 * Skipped automatically when `fs2` is not on PATH or `.fs2/graph.pickle` is
 * missing — these are dev-machine prerequisites, not CI requirements.
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  __clearFlowspacePool,
  flowspaceMcpSearch,
  setFlowspaceTransportFactory,
  shutdownAllFlowspace,
} from '../../../apps/web/src/lib/server/flowspace-mcp-client';

const REPO_ROOT = resolve(__dirname, '../../..');

function hasFs2(): boolean {
  try {
    execSync('command -v fs2', { stdio: 'ignore' });
  } catch {
    return false;
  }
  return existsSync(resolve(REPO_ROOT, '.fs2', 'graph.pickle'));
}

const SKIP = !hasFs2();

describe.skipIf(SKIP)('flowspace-mcp-client — real fs2 mcp integration', () => {
  afterAll(async () => {
    setFlowspaceTransportFactory(undefined);
    await shutdownAllFlowspace();
    __clearFlowspacePool();
  });

  it(
    'spawns real fs2 mcp and returns parseable results for a known query',
    async () => {
      // Use `grep` mode (→ fs2 `auto`) so the test works on graphs without
      // embeddings — fs2's auto mode falls through to text matching.
      const out = await flowspaceMcpSearch(REPO_ROOT, 'useFlowspaceSearch', 'grep');

      expect(out).toBeDefined();
      expect(Array.isArray(out.results)).toBe(true);
      expect(out.folders).toBeDefined();
      expect(typeof out.folders).toBe('object');

      if (out.results.length > 0) {
        const first = out.results[0];
        expect(first.kind).toBe('flowspace');
        expect(typeof first.nodeId).toBe('string');
        expect(typeof first.filePath).toBe('string');
        expect(typeof first.startLine).toBe('number');
        expect(typeof first.score).toBe('number');
      }
    },
    { timeout: 60_000 }
  );

  it(
    'reuses the warm process for a second query (sub-second after warmup)',
    async () => {
      const start = Date.now();
      const out = await flowspaceMcpSearch(REPO_ROOT, 'flowspaceMcpSearch', 'grep');
      const elapsed = Date.now() - start;

      expect(out).toBeDefined();
      // Warm path should be well under the 30 s ceiling.
      expect(elapsed).toBeLessThan(5_000);
    },
    { timeout: 30_000 }
  );
});
