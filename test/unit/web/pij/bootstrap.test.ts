/**
 * Poller bootstrap — Plan 089 Phase 1, T009.
 *
 * AC-02 in one sentence: **N open tabs must produce exactly ONE poller and ONE spine cursor
 * server-side.** The mux already elects one EventSource per browser; this elects one reader per
 * server process, and the two compose. The thing that breaks it is Next.js hot-module reload, which
 * re-runs module bodies and can reach `register()` more than once — hence the `globalThis` flag
 * idiom that `instrumentation.ts` already uses three times (Plans 067, 074, 088).
 *
 * The dev server is deliberately NOT restarted for this task (Jordan's nod required). Proof here is
 * unit + typecheck + build, per the task note.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  getPijPoller,
  isPijPollerStarted,
  pijHome,
  resetPijPollerForTests,
  startPijPoller,
  stopPijPoller,
} from '../../../../apps/web/src/features/089-first-class-pij/server/start-pij-poller';

afterEach(() => {
  resetPijPollerForTests();
});

describe('startPijPoller — HMR-safe singleton (AC-02)', () => {
  it('returns the same instance on every call', () => {
    /*
    Test Doc:
    - Why: If `getPijPoller()` minted a new poller per import, every route module and every HMR cycle
      would add a reader against `~/.pij` — invisibly, and exactly the load the whole design is built
      to avoid.
    - Contract: The instance is process-wide, held on globalThis so it survives HMR.
    - Usage Notes: —
    - Quality Contribution: The identity half of AC-02.
    - Worked Example: two calls → the same object reference.
    */
    expect(getPijPoller()).toBe(getPijPoller());
  });

  it('start() twice does not start a second poller', async () => {
    /*
    Test Doc:
    - Why: The precise HMR failure. A second `register()` that starts a second set of loops doubles
      the store's reader count with no visible symptom until the host is contended.
    - Contract: The flag makes the second call a no-op and the instance is unchanged.
    - Usage Notes: The real store may be absent here; startPijPoller() is non-throwing by design, so
      this test is about idempotence, not about the store.
    - Quality Contribution: The idempotence half of AC-02.
    - Worked Example: two starts → one instance, started true.
    */
    const first = await startPijPoller();
    const second = await startPijPoller();

    expect(second).toBe(first);
    expect(isPijPollerStarted()).toBe(true);
  });

  it('never throws, whatever the host looks like', async () => {
    /*
    Test Doc:
    - Why: This runs inside `instrumentation.register()`. A throw here is a failed server boot — and
      the trigger would be something entirely ordinary: no pij installed, PIJ_HOME pointing nowhere,
      an unreadable spine. Degrading to an honest `poller-status` is the ruled behaviour (AC-08/09).
    - Contract: startPijPoller() resolves rather than rejecting.
    - Usage Notes: Runs against whatever store this machine actually has.
    - Quality Contribution: Boot cannot be taken down by an optional observability feature.
    - Worked Example: resolves to a poller with a readable status.
    */
    const poller = await startPijPoller();

    expect(poller.snapshot().status).toBeDefined();
    expect(typeof poller.snapshot().seq).toBe('number');
  });

  it('stop() releases the started flag so a later boot can start again', async () => {
    /*
    Test Doc:
    - Why: SIGTERM cleanup must genuinely stop the reader, and a flag left set would prevent the next
      process from ever starting one.
    - Contract: stopPijPoller() flips running false and clears the flag.
    - Usage Notes: —
    - Quality Contribution: Makes the instrumentation SIGTERM handler meaningful.
    - Worked Example: started true → stop → started false, running false.
    */
    await startPijPoller();
    expect(isPijPollerStarted()).toBe(true);

    stopPijPoller();

    expect(isPijPollerStarted()).toBe(false);
    expect(getPijPoller().snapshot().status.running).toBe(false);
  });

  it('reports a poller that has never started as not running, rather than as an empty fleet', async () => {
    /*
    Test Doc:
    - Why: AC-08's middle leg. A route reaching the poller before the bootstrap has run must get
      "poller not running" — the one condition a human can actually act on — not a fabricated empty
      fleet that reads as "no seats here".
    - Contract: A freshly constructed, unstarted poller has running false and lastRecordsPollAt null.
    - Usage Notes: Constructed via getPijPoller() without start().
    - Quality Contribution: Keeps the pre-boot window honest instead of misleading.
    - Worked Example: running false, lastRecordsPollAt null, fleetSize 0.
    */
    const status = getPijPoller().snapshot().status;

    expect(status.running).toBe(false);
    expect(status.lastRecordsPollAt).toBeNull();
    expect(status.fleetSize).toBe(0);
  });
});

describe('pijHome', () => {
  it('honours $PIJ_HOME and defaults to ~/.pij, exactly as the platform contract specifies', () => {
    /*
    Test Doc:
    - Why: "All paths are under $PIJ_HOME (default ~/.pij)". Hard-coding the home would break any
      host that relocates the store, and silently — the poller would just report an empty fleet.
    - Contract: The env var wins; the default is ~/.pij.
    - Usage Notes: Env is injected rather than mutated, so this test cannot leak into others.
    - Quality Contribution: One less way for the observatory to be honestly-empty for a wrong reason.
    - Worked Example: PIJ_HOME=/custom → '/custom'.
    */
    expect(pijHome({ PIJ_HOME: '/custom/pij' })).toBe('/custom/pij');
    expect(pijHome({})).toMatch(/\.pij$/);
  });
});

describe('instrumentation.ts wiring', () => {
  it('registers the pij block with its own global flag, try/catch and SIGTERM cleanup', async () => {
    /*
    Test Doc:
    - Why: Finding 06 — there are three precedents for this idiom in the file and the plan says to
      copy it EXACTLY. Deviating (no flag, or no try/catch) reintroduces double-start under HMR or a
      boot that a missing pij store can kill.
    - Contract: The source contains the four required elements of the idiom.
    - Usage Notes: A source assertion because `register()` cannot be invoked in a unit test without a
      Next.js runtime; the behavioural half is covered by the singleton tests above.
    - Quality Contribution: Catches a future edit that removes the HMR guard or the error boundary.
    - Worked Example: flag, guarded start, SIGTERM handler and catch-with-reset all present.
    */
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const source = await readFile(
      join(import.meta.dirname, '../../../../apps/web/instrumentation.ts'),
      'utf8'
    );

    expect(source).toContain('__pijObservatoryBootstrapped');
    expect(source).toContain('if (!globalForPijObservatory.__pijObservatoryBootstrapped)');
    expect(source).toContain('await startPijPoller()');
    expect(source).toContain("process.on('SIGTERM', stopPij)");
    expect(source).toContain('globalForPijObservatory.__pijObservatoryBootstrapped = false;');
  });
});
