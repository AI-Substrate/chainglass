/**
 * Test fixtures for the bootstrap-code library.
 *
 * Plan 084 Phase 1 — exported here for cross-phase reuse:
 * - Phase 2 (instrumentation) will reuse `mkTempCwd`.
 * - Phase 3 (verify route) will reuse `INVALID_FORMAT_SAMPLES`.
 * - Phase 5 (`requireLocalAuth`) will reuse `mkTempCwd` + `mkBootstrapCodeFile`.
 *
 * No production code should import from here.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BootstrapCodeFile } from '@chainglass/shared/auth-bootstrap-code';

/**
 * Create a fresh temp directory and return its absolute path.
 *
 * Pair with `rmSync(cwd, { recursive: true, force: true })` in `afterEach`
 * (validation fix Comp-H2 — every test must clean up).
 */
export function mkTempCwd(prefix = 'bootstrap-code-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/**
 * Build a syntactically valid `BootstrapCodeFile` with sensible defaults.
 * Override any field via the partial argument.
 */
export function mkBootstrapCodeFile(
  overrides: Partial<BootstrapCodeFile> = {},
): BootstrapCodeFile {
  const now = new Date().toISOString();
  return {
    version: 1,
    code: 'TEST-TEST-TEST',
    createdAt: now,
    rotatedAt: now,
    ...overrides,
  };
}

/**
 * Strings that MUST be rejected by `BOOTSTRAP_CODE_PATTERN.test()`.
 *
 * Phase 3 reuses this for verify-route format-error tests.
 * `readonly` per validation fix C-FC4.
 */
export const INVALID_FORMAT_SAMPLES: readonly string[] = [
  'ABC-DEFG-HI', // (a) too short — only 11 chars
  '7K2P-9XQM-3T8RXY', // (b) too long — 16 chars
  '7K2P9XQM3T8R', // (c) missing hyphens
  '7k2p-9xqm-3t8r', // (d) lowercase
  '7K2P-9XQM-3T8I', // (e) illegal char `I` (excluded from Crockford alphabet)
  '7K2P -9XQM-3T8R', // (f) embedded whitespace
];
