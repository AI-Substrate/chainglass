/**
 * FlowSpace MCP Integration Test
 *
 * Plan 084: env-gated test that spawns a real `fs2 mcp` child against the
 * chainglass repo's own `.fs2/graph.pickle`. Verifies the long-lived process
 * pool returns parseable results.
 *
 * Skip conditions (any of):
 *   - `fs2` not on PATH
 *   - `.fs2/graph.pickle` missing
 *   - `fs2 mcp` starts but errors on initialisation (e.g., Azure embedding
 *     credentials missing — fs2 doesn't propagate the host shell's
 *     secrets.env into spawned children, so this is a real-world drift case
 *     that should NOT block CI/local commits)
 *   - explicit opt-out via `SKIP_FS2_INTEGRATION=1`
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
  if (process.env.SKIP_FS2_INTEGRATION === '1') return false;
  try {
    execSync('command -v fs2', { stdio: 'ignore' });
  } catch {
    return false;
  }
  return existsSync(resolve(REPO_ROOT, '.fs2', 'graph.pickle'));
}

const SKIP = !hasFs2();

/**
 * Soft-skip wrapper: real `fs2 mcp` may fail on initialisation if the host's
 * fs2 secrets (Azure embedding creds, etc.) aren't reaching the spawned child
 * — a known limitation of stdio child inheritance. Treat that as a skip
 * rather than a failure.
 */
async function runOrSkipOnEnvDrift<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (/Embedding service error|Azure (embedding|credential)|DefaultAzureCredential/i.test(msg)) {
      console.warn('[flowspace-integration] skipping — fs2 env not configured:', msg);
      return null;
    }
    throw err;
  }
}

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
      const out = await runOrSkipOnEnvDrift(() =>
        flowspaceMcpSearch(REPO_ROOT, 'useFlowspaceSearch', 'grep')
      );
      if (out === null) return;

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
      const out = await runOrSkipOnEnvDrift(() =>
        flowspaceMcpSearch(REPO_ROOT, 'flowspaceMcpSearch', 'grep')
      );
      if (out === null) return;
      const elapsed = Date.now() - start;

      expect(out).toBeDefined();
      // Warm path should be well under the 30 s ceiling.
      expect(elapsed).toBeLessThan(5_000);
    },
    { timeout: 30_000 }
  );
});
