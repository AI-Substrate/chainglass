/**
 * Node Event System E2E — Vitest Wrapper
 *
 * Why: Proves the entire node event system works end-to-end (41 steps) as part
 * of the regular test suite, without duplicating the standalone E2E script.
 *
 * Contract: Shells out to the standalone E2E script and asserts exit 0. The
 * script exercises all 6 event types, 5 error codes, 10 CLI commands, and 5
 * processGraph settlement passes across a 2-node pipeline.
 *
 * Usage Notes: Requires CLI to be pre-built (`pnpm build --filter=@chainglass/cli`).
 * Skips gracefully if the CLI build artifact is missing.
 *
 * Quality Contribution: Catches regressions in the node event system that unit
 * tests might miss — schema validation, CLI wiring, processGraph idempotency,
 * and cross-component integration all verified in one pass.
 *
 * Worked Example: Run the standalone script directly for narrative output:
 *   npx tsx test/e2e/node-event-system-visual-e2e.ts
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'vitest';

const CLI_PATH = resolve(__dirname, '../../../apps/cli/dist/cli.cjs');
const E2E_SCRIPT = resolve(__dirname, '../../e2e/node-event-system-visual-e2e.ts');
const RUN_INTEGRATION = process.env.RUN_INTEGRATION === '1';

describe('Node Event System E2E', () => {
  it.skipIf(!existsSync(CLI_PATH) || !RUN_INTEGRATION)(
    'full lifecycle passes (41 steps)',
    { timeout: 120_000 },
    () => {
      execSync(`npx tsx ${E2E_SCRIPT}`, {
        stdio: 'inherit',
        cwd: resolve(__dirname, '../../..'),
      });
    }
  );
});
