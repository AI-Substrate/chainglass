/**
 * Plan 084 Phase 3 — cross-phase test helper for the bootstrap-code feature.
 *
 * Phase 6's integration tests (popup polish) import `setupBootstrapTestEnv()`
 * from this module. Locked path: `test/helpers/auth-bootstrap-code.ts`.
 *
 * NOT a `.test.ts` file by design — vitest globs (`test/**\/*.test.ts`) skip
 * us, and importing from another test file risks circular discovery.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  type BootstrapCodeFile,
  ensureBootstrapCode,
  _resetSigningSecretCacheForTests,
} from '@chainglass/shared/auth-bootstrap-code';

import { _resetForTests as _resetBootstrapCache } from '../../apps/web/src/lib/bootstrap-code';
import { _resetRateLimitForTests } from '../../apps/web/app/api/bootstrap/verify/route';

export interface BootstrapTestEnv {
  /** Absolute path to the temp project root used by the test. */
  cwd: string;
  /** Active bootstrap code (XXXX-XXXX-XXXX) from the freshly-generated file. */
  code: string;
  /** Full URL for the verify route — POST against this. */
  verifyUrl: string;
  /** Full URL for the forget route — POST against this. */
  forgetUrl: string;
  /** Full BootstrapCodeFile written to disk in `${cwd}/.chainglass/`. */
  file: BootstrapCodeFile;
  /**
   * Cleanup — restores process.cwd, resets all caches (bootstrap-code,
   * signing-key, rate-limit), removes the temp dir. Always call in afterEach.
   */
  cleanup: () => void;
}

/**
 * Provisions a fresh temp `cwd`, generates a bootstrap-code file, and resets
 * every module-level cache the route handlers and proxy depend on.
 *
 * Caller MUST call the returned `cleanup()` in `afterEach` to restore process
 * state and remove the temp dir.
 */
export function setupBootstrapTestEnv(): BootstrapTestEnv {
  const originalCwd = process.cwd();
  const cwd = mkdtempSync(join(tmpdir(), 'bootstrap-code-it-'));
  process.chdir(cwd);

  _resetBootstrapCache();
  _resetSigningSecretCacheForTests();
  _resetRateLimitForTests();

  const ensured = ensureBootstrapCode(cwd);

  return {
    cwd,
    code: ensured.data.code,
    verifyUrl: 'http://localhost:3000/api/bootstrap/verify',
    forgetUrl: 'http://localhost:3000/api/bootstrap/forget',
    file: ensured.data,
    cleanup() {
      process.chdir(originalCwd);
      _resetBootstrapCache();
      _resetSigningSecretCacheForTests();
      _resetRateLimitForTests();
      rmSync(cwd, { recursive: true, force: true });
    },
  };
}
