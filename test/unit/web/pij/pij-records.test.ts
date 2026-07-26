/**
 * pij CLI record reader — Plan 089 Phase 1, T004.
 *
 * Finding 01 splits the read layer in two: the **spine** is bound by file (path-stable by ruling),
 * **records** are read through the CLI, because individual record paths are explicitly NOT stable —
 * the two-tier registry renames records between `~/.pij/` and `~/.pij/archive/` on a 48h TTL, and
 * re-implementing pij's derivation logic outside pij is the exact failure `pij-platform.md` exists
 * to prevent.
 *
 * These tests pin the four ways a CLI-backed reader lies:
 *
 *   1. **Silent repo-scoping.** A bare `pij` call scopes to the process cwd. The dev server's cwd is
 *      chainglass, so a cross-workspace call that forgets `cwd` returns a plausible wrong answer.
 *   2. **Re-derived badges.** The badge is a ruled worst-first derivation over two vocabularies. If we
 *      recompute it we will drift from pij and be confidently wrong (AC-03).
 *   3. **Shell injection / drifting argv.** `execFile` with fixed argv, never a shell string.
 *   4. **Unmapped failures.** `E-…` codes, non-zero exits and timeouts must arrive as typed errors,
 *      because the poller's degraded mode (AC-09) is driven by them.
 *
 * Constitution P4: `FakePijExecutor`, no `vi.mock()`.
 */
import { describe, expect, it } from 'vitest';
import {
  PIJ_FORBIDDEN_TOKENS,
  PijCliError,
  assertReadOnlyArgv,
  createPijRecords,
} from '../../../../apps/web/src/features/089-first-class-pij/server/pij-records';
import {
  FakePijExecutor,
  execFileFailure,
  execFileTimeout,
} from '../../../fakes/fake-pij-executor';

const WORKSPACE = '/Users/fixture/substrate/chainglass';
const OTHER_WORKSPACE = '/Users/fixture/osk/osk-split-billing';

/** A `pij list --json` row, in the live shape (measured 2026-07-26). */
function listRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pij-normal-seat',
    folder: WORKSPACE,
    dataDir: '/Users/fixture/.pij/pij-normal-seat',
    pid: 76391,
    state: 'idle',
    activity: 'done',
    liveness: 'active',
    lastEventAt: '2026-07-26T05:22:17.895Z',
    boundModel: 'claude-opus-5',
    boundProvider: 'anthropic',
    effort: 'high',
    failureReason: null,
    bindHealth: 'ok',
    degraded: false,
    terminal: null,
    watchdog: { enabled: true, intervalMs: 1_200_000 },
    prime: true,
    oldPrime: false,
    unadopted: false,
    ...overrides,
  };
}

describe('createPijRecords', () => {
  describe('fixed argv, never a shell (Risks §)', () => {
    it('calls `pij list --json --badge` with no scoping flag', async () => {
      /*
      Test Doc:
      - Why: F-13 rules the acquisition model — ONE global list call, with workspace scoping applied
        server-side as a filter. A stray `--here` would silently make every workspace view show only
        the server's own repo. Phase 4 adds `--badge`, which is a DELIBERATE contract change: every
        `list()` call now asks for badges, because the poller (the only production caller) calls
        `records.list()` bare and the argv lives here, not there.
      - Contract: argv is exactly ['list', '--json', '--badge'].
      - Usage Notes: FakePijExecutor records argv verbatim.
      - Quality Contribution: Freezes the acquisition model against well-meaning "optimisation",
        and pins the badge request at the one place it can be made.
      - Worked Example: list() → ['list','--json','--badge'], no '--here', no '--archived'.
      */
      const exec = new FakePijExecutor().whenJson(['list', '--json', '--badge'], [listRow()]);
      const records = createPijRecords({ exec: exec.exec, defaultCwd: WORKSPACE });

      await records.list();

      expect(exec.lastArgs).toEqual(['list', '--json', '--badge']);
      expect(exec.lastArgs).not.toContain('--here');
      expect(exec.lastArgs).not.toContain('--archived');
    });

    it('passes each argument as a separate token, never a joined string', async () => {
      /*
      Test Doc:
      - Why: `execFile` with fixed argv is the ruled call shape. A joined string would reintroduce a
        shell and make a hostile pij id (they are arbitrary strings) an injection vector.
      - Contract: `node show <id> --json` is four tokens; the id is its own token, unquoted.
      - Usage Notes: Uses a single-segment id, which is legal (C-03).
      - Quality Contribution: Keeps the one place this feature spawns a process injection-proof.
      - Worked Example: nodeShow('shipname') → ['node','show','shipname','--json'].
      */
      const exec = new FakePijExecutor().whenJson(['node', 'show', 'shipname', '--json'], {
        id: 'shipname',
        badge: 'working',
      });
      const records = createPijRecords({ exec: exec.exec, defaultCwd: WORKSPACE });

      await records.nodeShow('shipname');

      expect(exec.lastArgs).toEqual(['node', 'show', 'shipname', '--json']);
      expect(exec.calls[0].command).toBe('pij');
    });

    it('refuses to run a mutating verb even if one is somehow constructed', async () => {
      /*
      Test Doc:
      - Why: C-02 and C-01 forbid every mutating verb in v1. The static fence test (T010) catches
        source-level violations; this catches a value that arrives at runtime — the case static
        analysis cannot see.
      - Contract: The adapter validates argv against a read-verb allowlist before spawning anything.
      - Usage Notes: Reached through the escape hatch the adapter exposes for exactly this assertion.
      - Quality Contribution: Defence in depth on the single hardest fence in the plan.
      - Worked Example: raw(['close','pij-x']) → throws, and NOTHING is executed.
      */
      const exec = new FakePijExecutor();
      const records = createPijRecords({ exec: exec.exec, defaultCwd: WORKSPACE });

      await expect(records.raw(['close', 'pij-normal-seat', '--json'])).rejects.toThrow(
        /read-only|not a read verb/i
      );
      expect(exec.calls).toHaveLength(0);
    });
  });

  describe('per-call cwd — the silent repo-scoping trap', () => {
    it('threads an explicit cwd to the executor for repo-scoped tree reads', async () => {
      /*
      Test Doc:
      - Why: THE trap. `pij tree` is repo-scoped from cwd (7KB here vs ~100KB global). The Next.js
        server's cwd is chainglass, so a tree call for another workspace that forgets cwd returns
        chainglass's tree, labelled as the other workspace's. Plausible, wrong, and silent.
      - Contract: `tree({ cwd })` passes that cwd verbatim; the same argv against two cwds yields two
        different trees.
      - Usage Notes: `cwd` is REQUIRED by the type on tree() — this test proves the value is actually
        used, not merely accepted.
      - Quality Contribution: Converts a silent wrong answer into a covered behaviour.
      - Worked Example: cwd=A → root 'pij-in-a'; cwd=B → root 'pij-in-b'.
      */
      const exec = new FakePijExecutor()
        .whenJson(['tree', '--json'], { roots: [{ id: 'pij-in-a' }] }, { cwd: WORKSPACE })
        .whenJson(['tree', '--json'], { roots: [{ id: 'pij-in-b' }] }, { cwd: OTHER_WORKSPACE });
      const records = createPijRecords({ exec: exec.exec, defaultCwd: WORKSPACE });

      const here = await records.tree({ cwd: WORKSPACE });
      const there = await records.tree({ cwd: OTHER_WORKSPACE });

      expect(here.roots[0].id).toBe('pij-in-a');
      expect(there.roots[0].id).toBe('pij-in-b');
      expect(exec.calls.map((c) => c.cwd)).toEqual([WORKSPACE, OTHER_WORKSPACE]);
    });

    it('asks for the whole machine with `--global`, and only then', async () => {
      /*
      Test Doc:
      - Why: Phase 4's global page needs the forest for every folder, not this repo's. The two
        variants are one method with one argv-shaped difference, so the failure mode is a global page
        quietly rendering the server's own repo — the same silent-wrong-answer this describe block
        exists to prevent, pointing the other way.
      - Contract: `tree({ global: true })` → ['tree','--global','--json']; `tree({ cwd })` →
        ['tree','--json'] with NO '--global'. The two are never confusable.
      - Usage Notes: A cwd is still handed to execFile because a child process must start somewhere;
        `--global` makes it irrelevant to the RESULT, which is exactly why the flag has to be present
        rather than assumed.
      - Quality Contribution: Pins the one-token difference that separates 52 nodes from 9 folders.
      - Worked Example: global → 30 roots; repo-scoped → 1 root.
      */
      const exec = new FakePijExecutor()
        .whenJson(['tree', '--global', '--json'], { roots: [{ id: 'pij-anywhere' }] })
        .whenJson(['tree', '--json'], { roots: [{ id: 'pij-in-a' }] }, { cwd: WORKSPACE });
      const records = createPijRecords({ exec: exec.exec, defaultCwd: WORKSPACE });

      const everywhere = await records.tree({ global: true });
      expect(exec.lastArgs).toEqual(['tree', '--global', '--json']);
      expect(everywhere.roots[0].id).toBe('pij-anywhere');

      await records.tree({ cwd: WORKSPACE });
      expect(exec.lastArgs).toEqual(['tree', '--json']);
      expect(exec.lastArgs).not.toContain('--global');
    });

    it('keeps the global tree read inside the read-only allowlist', async () => {
      /*
      Test Doc:
      - Why: The global variant is a new argv reaching the one process-spawning seam. `--global` must
        be a read like every other token this feature can name (C-01/C-02) — a new flag is exactly
        where an allowlist quietly stops covering the calls being made.
      - Contract: The global argv passes `assertReadOnlyArgv` and names no forbidden token.
      - Usage Notes: Asserted through the public call rather than the validator, so it covers the
        argv the adapter actually builds.
      - Quality Contribution: Keeps the fence ahead of the feature instead of behind it.
      - Worked Example: tree({global:true}) executes; argv contains no mutating token.
      */
      const exec = new FakePijExecutor().whenJson(['tree', '--global', '--json'], { roots: [] });
      const records = createPijRecords({ exec: exec.exec, defaultCwd: WORKSPACE });

      await records.tree({ global: true });

      expect(() => assertReadOnlyArgv(exec.lastArgs)).not.toThrow();
      for (const token of PIJ_FORBIDDEN_TOKENS) expect(exec.lastArgs).not.toContain(token);
    });

    it('applies a per-call timeout to every invocation', async () => {
      /*
      Test Doc:
      - Why: A CLI invocation costs ~0.42–0.48s wall clock on a contended host (measured by two
        observers). An unbounded call can wedge the slow loop and stall the whole poller.
      - Contract: Every call carries a positive timeout; the configured value is used.
      - Usage Notes: —
      - Quality Contribution: Bounds the worst case of the one blocking thing this feature does.
      - Worked Example: timeoutMs 3000 → every recorded call has timeoutMs 3000.
      */
      const exec = new FakePijExecutor().whenJson(['list', '--json', '--badge'], []);
      const records = createPijRecords({ exec: exec.exec, defaultCwd: WORKSPACE, timeoutMs: 3000 });

      await records.list();

      expect(exec.calls[0].timeoutMs).toBe(3000);
    });
  });

  describe('badges are consumed, never re-derived (AC-03)', () => {
    it('returns the badge exactly as pij computed it, even when it contradicts systemState', async () => {
      /*
      Test Doc:
      - Why: The badge is a ruled worst-first derivation across TWO vocabularies (systemState plus the
        latest declared state of every OPEN assignment). Re-deriving it from the fields we happen to
        have gives a different, confidently-wrong answer whenever an assignment carries the worse
        state — which is precisely when the badge matters.
      - Contract: `badge` is passed through verbatim.
      - Usage Notes: systemState 'idle' with badge 'question' is the real lost-dispatch shape; a naive
        re-derivation from systemState alone would render 'idle'.
      - Quality Contribution: Keeps the UI's most prominent signal owned by pij.
      - Worked Example: badge 'question' survives beside systemState 'idle'.
      */
      const exec = new FakePijExecutor().whenJson(['node', 'show', 'shipname', '--json'], {
        id: 'shipname',
        systemState: 'idle',
        semanticState: 'question',
        badge: 'question',
      });
      const records = createPijRecords({ exec: exec.exec, defaultCwd: WORKSPACE });

      const node = await records.nodeShow('shipname');

      expect(node.badge).toBe('question');
      expect(node.systemState).toBe('idle');
    });

    it('preserves unknown and additive fields on every record shape', async () => {
      /*
      Test Doc:
      - Why: Records evolve additively and readers "must tolerate unknown fields". dove's `needs-human`
        field is in flight right now and is expected to arrive mid-build; the plan's risk table calls
        the rework cost "low (additive)" — that is only true if the reader passes fields through.
      - Contract: Unknown keys survive the reader untouched.
      - Usage Notes: `needsHuman` stands in for the field that is about to land.
      - Quality Contribution: Makes the "no rework by design" claim in the risk table actually hold.
      - Worked Example: row.needsHuman === true survives list().
      */
      const exec = new FakePijExecutor().whenJson(
        ['list', '--json', '--badge'],
        [listRow({ needsHuman: true, someFutureField: { nested: 1 } })]
      );
      const records = createPijRecords({ exec: exec.exec, defaultCwd: WORKSPACE });

      const [row] = await records.list();

      expect(row.needsHuman).toBe(true);
      expect(row.someFutureField).toEqual({ nested: 1 });
    });
  });

  describe('E-code mapping (drives AC-09 degraded mode)', () => {
    it('maps a pij E-code on stderr to a typed PijCliError carrying that code', async () => {
      /*
      Test Doc:
      - Why: `pij state` with no id returns `E-ARG: usage: pij state <id>` (observed live). The poller
        must distinguish "the store is unreadable" from "you asked wrongly" — AC-08's trichotomy is
        exactly that distinction rendered.
      - Contract: `E-<CODE>: <message>` → PijCliError { code: 'E-ARG', verb, message }.
      - Usage Notes: pij writes the code at the start of the stream.
      - Quality Contribution: Gives the empty-state component a fact instead of a guess.
      - Worked Example: stderr 'E-ARG: usage…' → error.code === 'E-ARG'.
      */
      const exec = new FakePijExecutor()
        .when(['state', 'nope', '--json'])
        .fails(execFileFailure({ stderr: 'E-ARG: usage: pij state <id>\n' }));
      const records = createPijRecords({ exec: exec.exec, defaultCwd: WORKSPACE });

      await expect(records.state('nope')).rejects.toMatchObject({
        name: 'PijCliError',
        code: 'E-ARG',
        verb: 'state',
      });
    });

    it('maps an unlabelled non-zero exit to E-EXIT rather than inventing a code', async () => {
      /*
      Test Doc:
      - Why: Reporting an unknown failure as a known code is the "confident lie" this plan is written
        against.
      - Contract: No `E-…` prefix → code 'E-EXIT', with the raw stderr preserved for display.
      - Usage Notes: —
      - Quality Contribution: Keeps honest-unknown available as an outcome.
      - Worked Example: stderr 'segfault' → code 'E-EXIT', stderr retained.
      */
      const exec = new FakePijExecutor()
        .when(['list', '--json', '--badge'])
        .fails(execFileFailure({ stderr: 'something exploded' }));
      const records = createPijRecords({ exec: exec.exec, defaultCwd: WORKSPACE });

      await expect(records.list()).rejects.toMatchObject({
        code: 'E-EXIT',
        stderr: 'something exploded',
      });
    });

    it('decodes the `--json` error envelope, so E-NOID does not collapse into E-EXIT', async () => {
      /*
      Test Doc:
      - Why: pij emits its coded failures TWO ways. Bare, it writes `E-ARG: usage: …` at the head of
        the stream; under `--json` — which is the only way this feature ever calls it — the same
        failure arrives as `{"error":"E-NOID","message":"no session 'pij-x' in registry"}` on stderr
        (verified live 2026-07-26, exit 2). Only the first form was decoded, so every JSON-mode
        failure became E-EXIT, and "that seat does not exist" was indistinguishable from "the store
        is broken". Phase 4's focus route separates those into a 404 and a 503, so the distinction has
        to survive the reader.
      - Contract: A JSON envelope whose `error` is E-code-shaped yields that code and its message; a
        JSON body that is NOT an error envelope still yields E-EXIT rather than an invented code.
      - Usage Notes: Both legs asserted together — the decoder must be strict, not merely willing.
      - Quality Contribution: Restores the honest-unknown boundary at the one place a wrong code now
        changes an HTTP status.
      - Worked Example: E-NOID envelope → code 'E-NOID'; `{"oops":true}` → code 'E-EXIT'.
      */
      const exec = new FakePijExecutor()
        .when(['node', 'show', 'pij-gone', '--json'])
        .fails(
          execFileFailure({
            code: 2,
            stderr: '{"error":"E-NOID","message":"no session \'pij-gone\' in registry"}',
          })
        )
        .when(['node', 'show', 'pij-odd', '--json'])
        .fails(execFileFailure({ code: 1, stderr: '{"oops":true}' }));
      const records = createPijRecords({ exec: exec.exec, defaultCwd: WORKSPACE });

      await expect(records.nodeShow('pij-gone')).rejects.toMatchObject({
        code: 'E-NOID',
        message: "no session 'pij-gone' in registry",
      });
      await expect(records.nodeShow('pij-odd')).rejects.toMatchObject({ code: 'E-EXIT' });
    });

    it('maps a killed-by-timeout invocation to E-TIMEOUT', async () => {
      /*
      Test Doc:
      - Why: A wedged CLI is materially different from a broken one: the store may be fine and the
        host merely contended. The status endpoint should say so.
      - Contract: A `killed` execFile rejection → code 'E-TIMEOUT'.
      - Usage Notes: execFile signals a timeout kill via `killed: true` + a signal, not an E-code.
      - Quality Contribution: Separates "slow" from "broken" in the one place a human reads it.
      - Worked Example: killed:true → code 'E-TIMEOUT'.
      */
      const exec = new FakePijExecutor()
        .when(['list', '--json', '--badge'])
        .fails(execFileTimeout());
      const records = createPijRecords({ exec: exec.exec, defaultCwd: WORKSPACE });

      await expect(records.list()).rejects.toMatchObject({ code: 'E-TIMEOUT' });
    });

    it('maps unparseable stdout to E-PARSE instead of throwing a raw SyntaxError', async () => {
      /*
      Test Doc:
      - Why: A SyntaxError escaping the reader crashes the poller tick; a typed error routes into the
        degraded-mode path that keeps last-known data on screen.
      - Contract: Non-JSON stdout → PijCliError { code: 'E-PARSE' }.
      - Usage Notes: A truncated stream is the realistic cause.
      - Quality Contribution: No unhandled throw can reach the poller loop from this adapter.
      - Worked Example: stdout '[{"id":' → code 'E-PARSE'.
      */
      const exec = new FakePijExecutor().when(['list', '--json', '--badge']).returns('[{"id":');
      const records = createPijRecords({ exec: exec.exec, defaultCwd: WORKSPACE });

      await expect(records.list()).rejects.toMatchObject({ code: 'E-PARSE' });
    });

    it('rejects a list payload that is not an array', async () => {
      /*
      Test Doc:
      - Why: Shape drift is a named risk. Silently treating an object as zero rows renders "no seats
        here" — the empty state that means the opposite of what happened.
      - Contract: A non-array `list` payload is an E-SHAPE error, never an empty result.
      - Usage Notes: —
      - Quality Contribution: Stops drift from surfacing as a plausible empty fleet.
      - Worked Example: stdout '{"rows":[]}' → code 'E-SHAPE'.
      */
      const exec = new FakePijExecutor().when(['list', '--json', '--badge']).returns('{"rows":[]}');
      const records = createPijRecords({ exec: exec.exec, defaultCwd: WORKSPACE });

      await expect(records.list()).rejects.toMatchObject({ code: 'E-SHAPE' });
    });

    it('PijCliError is an Error and carries its verb for display', async () => {
      /*
      Test Doc:
      - Why: The status endpoint renders the failure; "pij list failed: E-EXIT" is actionable, a bare
        "Error" is not.
      - Contract: PijCliError extends Error, has name/code/verb/stderr.
      - Usage Notes: —
      - Quality Contribution: Makes AC-08's "store unreadable" state legible without devtools.
      - Worked Example: instanceof Error === true.
      */
      const error = new PijCliError({ code: 'E-EXIT', verb: 'list', message: 'boom' });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('PijCliError');
      expect(error.code).toBe('E-EXIT');
      expect(error.verb).toBe('list');
    });
  });

  describe('shapes', () => {
    it('returns list rows verbatim, including a single-segment id', async () => {
      /*
      Test Doc:
      - Why: C-03 — pij ids may be single-segment and must never be pattern-matched. A reader that
        validates ids against a `pij-*` shape drops real seats.
      - Contract: Rows pass through unfiltered; `shipname` survives.
      - Usage Notes: —
      - Quality Contribution: Pins C-03 at the earliest point in the pipeline.
      - Worked Example: ids ['pij-normal-seat','shipname'].
      */
      const exec = new FakePijExecutor().whenJson(
        ['list', '--json', '--badge'],
        [listRow(), listRow({ id: 'shipname', prime: false, unadopted: false })]
      );
      const records = createPijRecords({ exec: exec.exec, defaultCwd: WORKSPACE });

      const rows = await records.list();

      expect(rows.map((r) => r.id)).toEqual(['pij-normal-seat', 'shipname']);
    });

    it('returns the tree root set as pij shaped it', async () => {
      /*
      Test Doc:
      - Why: `unadopted` and prime marks are ruled derivations (adoption axis) we consume rather than
        compute; the structural and runtime axes must never be merged into them.
      - Contract: `roots[]` passes through with its flags intact.
      - Usage Notes: —
      - Quality Contribution: Keeps AC-05's marks owned by pij.
      - Worked Example: root carries unadopted:true untouched.
      */
      const exec = new FakePijExecutor().whenJson(
        ['tree', '--json'],
        { roots: [{ id: 'shipname', unadopted: true, children: [{ id: 'pij-child' }] }] },
        { cwd: WORKSPACE }
      );
      const records = createPijRecords({ exec: exec.exec, defaultCwd: WORKSPACE });

      const tree = await records.tree({ cwd: WORKSPACE });

      expect(tree.roots[0].unadopted).toBe(true);
      expect(tree.roots[0].children?.[0].id).toBe('pij-child');
    });
  });
});
