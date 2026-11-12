/**
 * Time bounds for tests on a loaded, shared machine — the one place they are set.
 *
 * Why: the full suite runs at `nice -n 19` (Jordan's shared-machine rule) on a machine whose
 * 1-minute load sits between 75 and 270, mostly from other repos. At that priority, time to
 * spawn a process is set by the scheduler, not by the code under test. Measured 2026-11-12
 * (baseline `just test`, load 88-137): real-git cases took up to 52.5 s against vitest's 5 s
 * test / 10 s hook defaults, and in-process cases reached 5.0 s. A file-by-file raise never
 * converged, because each run timed out a different file.
 *
 * These bounds cover environment latency only. Assertions are unchanged, and a test that
 * hangs still fails (later).
 */

/** Tests that spawn real processes (git fixtures, CLIs, shells): `vitest.config.ts` "process" project. */
export const PROCESS_TEST_TIMEOUT_MS = 120_000;

/**
 * A wait inside a process test for one spawned process to reach a state (print "ready", exit,
 * answer `--version`). Half the test bound, so the test can still report what it waited for.
 */
export const SPAWN_WAIT_MS = PROCESS_TEST_TIMEOUT_MS / 2;

/** Everything else: in-process tests still starve for CPU at nice 19 (5.0 s seen at load ~130). */
export const UNIT_TEST_TIMEOUT_MS = 30_000;
