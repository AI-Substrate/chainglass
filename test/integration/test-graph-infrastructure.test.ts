/**
 * Test Doc
 * Why: Proves withTestGraph() lifecycle works — Plan 037 Phase 2 infrastructure smoke test.
 * Contract: withTestGraph creates temp workspace, copies units, validates addNode, cleans up.
 * Usage Notes: Uses real filesystem, real graph service. Run with `pnpm test -- --run test/integration/test-graph-infrastructure.test.ts`.
 * Quality Contribution: Gates Phase 3 (simple graphs) — if this fails, no integration tests can work.
 * Worked Example: withTestGraph('smoke', ...) → creates graph + node with real unit validation → cleans up temp dir.
 */

import * as fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { withTestGraph } from '../../dev/test-graphs/shared/graph-test-runner.js';
import { makeScriptsExecutable } from '../../dev/test-graphs/shared/helpers.js';

describe('Test Graph Infrastructure', () => {
  it('withTestGraph creates workspace, copies units, validates addNode, cleans up', async () => {
    let capturedWorkspacePath: string | null = null;

    await withTestGraph('smoke', async (tgc) => {
      capturedWorkspacePath = tgc.workspacePath;

      // Verify temp workspace was created
      const stats = await fs.stat(tgc.workspacePath);
      expect(stats.isDirectory()).toBe(true);

      // Verify units were copied
      const unitYaml = await fs.readFile(
        `${tgc.workspacePath}/.chainglass/units/ping/unit.yaml`,
        'utf-8'
      );
      expect(unitYaml).toContain('slug: ping');
      expect(unitYaml).toContain('type: code');

      // Verify scripts are executable
      const scriptStat = await fs.stat(
        `${tgc.workspacePath}/.chainglass/units/ping/scripts/ping.sh`
      );
      expect(scriptStat.mode & 0o111).toBeGreaterThan(0);

      // Create a graph and add a node — the real loader validates unit exists on disk
      const createResult = await tgc.service.create(tgc.ctx, 'smoke-test');
      expect(createResult.errors).toEqual([]);

      const addResult = await tgc.service.addNode(
        tgc.ctx,
        'smoke-test',
        createResult.lineId,
        'ping'
      );
      expect(addResult.errors).toEqual([]);
      expect(addResult.nodeId).toBeTruthy();
    });

    // Verify cleanup happened
    expect(capturedWorkspacePath).not.toBeNull();
    await expect(fs.stat(capturedWorkspacePath as string)).rejects.toThrow();
  }, 30_000);

  it('makeScriptsExecutable sets +x on .sh files', async () => {
    const { mkdtemp, writeFile, stat, rm } = fs;
    const tmpDir = await mkdtemp('/tmp/chmod-test-');
    try {
      await fs.mkdir(`${tmpDir}/sub`, { recursive: true });
      await writeFile(`${tmpDir}/test.sh`, '#!/bin/bash\necho hi\n', { mode: 0o644 });
      await writeFile(`${tmpDir}/sub/nested.sh`, '#!/bin/bash\necho nested\n', { mode: 0o644 });
      await writeFile(`${tmpDir}/not-a-script.txt`, 'hello', { mode: 0o644 });

      await makeScriptsExecutable(tmpDir);

      const s1 = await stat(`${tmpDir}/test.sh`);
      expect(s1.mode & 0o111).toBeGreaterThan(0);
      const s2 = await stat(`${tmpDir}/sub/nested.sh`);
      expect(s2.mode & 0o111).toBeGreaterThan(0);
      const s3 = await stat(`${tmpDir}/not-a-script.txt`);
      expect(s3.mode & 0o111).toBe(0);
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });
});
