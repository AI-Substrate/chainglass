/**
 * Plan 067: Question Popper — Phase 4 Integration Tests
 *
 * Subprocess-based tests for blocking/timeout behavior.
 * Skipped by default — requires a running Chainglass server.
 * Unskip manually for E2E validation.
 *
 * Test Doc:
 *   Scope: CLI blocking, timeout, and immediate return via subprocess
 *   Pattern: spawn cg process, validate stdout JSON
 *   Dependencies: Running Chainglass server on localhost
 *   Run: pnpm vitest run test/integration/question-popper/cli-blocking.test.ts
 *   Coverage: 3 integration tests (all skipped by default)
 */

import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const CG_BIN = 'npx cg';

describe.skip('Phase 4: CLI Blocking Integration', () => {
  it('cg question ask --timeout 0 returns immediately', () => {
    const start = Date.now();
    const stdout = execSync(
      `${CG_BIN} question ask --text "Integration test (immediate)" --type text --timeout 0`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    const elapsed = Date.now() - start;

    const output = JSON.parse(stdout.trim());
    expect(output.questionId).toBeDefined();
    expect(output.status).toBe('pending');
    expect(elapsed).toBeLessThan(3000);
  });

  it('cg question ask --timeout 2 times out after ~2s', () => {
    const start = Date.now();
    const stdout = execSync(
      `${CG_BIN} question ask --text "Integration test (timeout)" --type text --timeout 2`,
      { encoding: 'utf-8', timeout: 10000 }
    );
    const elapsed = Date.now() - start;

    const output = JSON.parse(stdout.trim());
    expect(output.questionId).toBeDefined();
    expect(output.status).toBe('pending');
    expect(elapsed).toBeGreaterThanOrEqual(1500);
    expect(elapsed).toBeLessThan(8000);
  });

  it('cg question ask blocks and returns on answer', () => {
    // 1. Ask with --timeout 0 to get questionId
    const askStdout = execSync(
      `${CG_BIN} question ask --text "Answer me" --type confirm --timeout 0`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    const { questionId } = JSON.parse(askStdout.trim());

    // 2. Answer via CLI
    execSync(`${CG_BIN} question answer ${questionId} --answer "true"`, {
      encoding: 'utf-8',
      timeout: 5000,
    });

    // 3. Get and verify answered
    const getStdout = execSync(`${CG_BIN} question get ${questionId}`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    const result = JSON.parse(getStdout.trim());
    expect(result.status).toBe('answered');
  });
});
