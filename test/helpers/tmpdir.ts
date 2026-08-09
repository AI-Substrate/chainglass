import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Retry policy for temp-directory removal.
 *
 * `fs.rm` retries EBUSY, EMFILE, ENFILE, ENOTEMPTY and EPERM — but ONLY when
 * `maxRetries > 0`, and the default is 0. Without it, a recursive remove throws
 * ENOTEMPTY the moment anything creates an entry in the directory mid-walk,
 * even with `force: true`.
 *
 * MEASURED, and the numbers matter more than the reasoning (plan 092, bp-0017):
 *
 *   matched 10-run blocks, one test file, restored byte-identically between them
 *     baseline { recursive, force }              6/10 FAILED
 *     + maxRetries: 3, retryDelay: 50            0/10 FAILED
 *   Fisher exact p ~= 0.011
 *
 * THE BASE RATE IS UNSTABLE — the same file gave 1/5 and then 6/10 on identical
 * code ten minutes apart. So a single clean block proves nothing and will make
 * this look unnecessary. Before concluding these options are redundant, run a
 * MATCHED A/B in one session; a quiet machine returns 0/10 either way.
 *
 * Three independent observers hit it with three different failure sets (1, 2,
 * and 5-then-2 failures) on unchanged trees, and one file failed on a DIFFERENT
 * test in each run — so it is neither a per-test nor a per-file defect. It is
 * transient external contention against a repo-wide teardown pattern.
 */
const REMOVE_RETRY = { maxRetries: 3, retryDelay: 50 } as const;

/**
 * Create a temp directory for a test, with a readable prefix.
 *
 * Pair every call with `removeTmpDir` in an `afterEach`.
 */
export function makeTmpDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

/**
 * Remove a temp directory recursively, tolerating transient contention.
 *
 * Prefer this over a bare `rmSync(dir, { recursive: true, force: true })` in
 * test teardown: the bare form is what reddens the suite, and it does so on a
 * different file each run, which reads as an unrelated flake rather than one
 * cause.
 */
export function removeTmpDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, ...REMOVE_RETRY });
}
