/**
 * Positional Graph Orchestration E2E — Vitest Wrapper
 *
 * Why: Proves the entire orchestration system works end-to-end (58 steps) as
 * part of the regular test suite, without duplicating the standalone E2E script.
 *
 * Contract: Shells out to the standalone E2E script and asserts exit 0. The
 * script drives an 8-node, 4-line pipeline through user-input, serial agents,
 * question/answer cycles, parallel execution, manual transitions, code nodes,
 * and error recovery — ending with graph-complete.
 *
 * Usage Notes: Requires CLI to be pre-built (`pnpm build --filter=@chainglass/cli`).
 * Skips gracefully if the CLI build artifact is missing.
 *
 * Quality Contribution: Catches regressions in the orchestration system that
 * unit tests might miss — ONBAS + ODS integration, event settlement, input
 * wiring, pod lifecycle, and the settle-decide-act loop all verified in one pass.
 *
 * Worked Example: Run the standalone script directly for narrative output:
 *   npx tsx test/e2e/positional-graph-orchestration-e2e.ts
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'vitest';

const CLI_PATH = resolve(__dirname, '../../../apps/cli/dist/cli.cjs');
const E2E_SCRIPT = resolve(__dirname, '../../e2e/positional-graph-orchestration-e2e.ts');
const RUN_INTEGRATION = process.env.RUN_INTEGRATION === '1';

describe('Positional Graph Orchestration E2E', () => {
  it.skipIf(!existsSync(CLI_PATH) || !RUN_INTEGRATION)(
    'full pipeline passes (58 steps)',
    { timeout: 120_000 },
    () => {
      execSync(`npx tsx ${E2E_SCRIPT}`, {
        stdio: 'inherit',
        cwd: resolve(__dirname, '../../..'),
      });
    }
  );
});
