/**
 * Spine cursor — Plan 089 Phase 1, T003.
 *
 * The spine (`~/.pij/spine/events.ndjson`) is the ONE pij path the platform rules as stable and
 * bindable by file (`pij-platform.md` § Path stability). Everything else goes through the CLI.
 * These tests pin the four hazards that make a naive `readFile + JSON.parse` reader lie:
 *
 *   1. `--since` is EXCLUSIVE (`seq > N`) — C-08, proved both directions in discovery.
 *   2. Torn/corrupt lines exist on disk and must be skipped without desynchronising the cursor.
 *   3. `*.tmp-<pid>-<uuid>` files appear transiently in every pij directory — C-07.
 *   4. Atomic replace / tier migration means the file can be renamed under a live reader — a
 *      vanished path is NOT a deletion.
 *
 * Constitution P4: fakes and fixtures only, no vi.mock(). Mutating cases run against a temp-dir copy
 * of the fixture store — nothing here goes near a real `~/.pij` (C-02).
 */
import { appendFileSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SPINE_LOG_FILENAME,
  createFileSpineCursor,
  isTransientStorePath,
} from '../../../../apps/web/src/features/089-first-class-pij/server/spine-cursor';
import {
  FIXTURE_OPEN_VOCAB_SPINE_DIR,
  FIXTURE_SPINE_DIR,
  FIXTURE_SPINE_SEQS,
  FIXTURE_TORN_SEQ,
  copyStoreToTemp,
} from '../../../fixtures/pij/index';

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function tempStore() {
  const store = copyStoreToTemp();
  cleanups.push(store.cleanup);
  return store;
}

/** A real byte-range read, used as the pass-through half of the injected-failure seam. */
async function readRealRange(path: string, position: number, length: number): Promise<string> {
  return readFileSync(path)
    .subarray(position, position + length)
    .toString('utf8');
}

describe('FileSpineCursor', () => {
  describe('exclusive --since semantics (C-08)', () => {
    it('returns every well-formed event when starting from seq 0', async () => {
      /*
      Test Doc:
      - Why: The cursor is the transition feed for the whole observatory; a dropped event is a badge
        that never changes and a UI that quietly lies.
      - Contract: read() returns events in file order with seq > the cursor, and advances the cursor
        to the highest seq it saw.
      - Usage Notes: Fixture spine carries seqs 101,102,[103 torn],104,105,106.
      - Quality Contribution: Pins the happy path so the hazard tests below mean something.
      - Worked Example: since=0 → [101,102,104,105,106], cursor.seq === 106.
      */
      const cursor = createFileSpineCursor({ spineDir: FIXTURE_SPINE_DIR, since: 0 });

      const result = await cursor.read();

      expect(result.events.map((e) => e.seq)).toEqual([...FIXTURE_SPINE_SEQS]);
      expect(cursor.seq).toBe(106);
    });

    it('is EXCLUSIVE: since=<tip> yields nothing, since=<tip-1> yields exactly the tip', async () => {
      /*
      Test Doc:
      - Why: `--since` being inclusive by one would replay the tip on every 2s tick forever — a
        permanent duplicate broadcast storm that looks like liveness.
      - Contract: `seq > since`, never `>=`. Discovery proved this against the live store in both
        directions; this test is that probe, frozen.
      - Usage Notes: 106 is the fixture tip.
      - Quality Contribution: The single most load-bearing semantic in the read layer.
      - Worked Example: since=106 → []; since=105 → [106].
      */
      const atTip = createFileSpineCursor({ spineDir: FIXTURE_SPINE_DIR, since: 106 });
      const beforeTip = createFileSpineCursor({ spineDir: FIXTURE_SPINE_DIR, since: 105 });

      expect((await atTip.read()).events).toEqual([]);
      expect((await beforeTip.read()).events.map((e) => e.seq)).toEqual([106]);
    });

    it('never re-delivers an event across consecutive reads', async () => {
      /*
      Test Doc:
      - Why: The poller calls read() every ~2s against an append-only log; re-delivery is the
        default failure of a naive implementation.
      - Contract: A second read() with no new lines returns [] and leaves the cursor where it was.
      - Usage Notes: —
      - Quality Contribution: Guards the poller's diff logic from phantom churn.
      - Worked Example: read() → 5 events; read() → 0 events, cursor still 106.
      */
      const cursor = createFileSpineCursor({ spineDir: FIXTURE_SPINE_DIR, since: 0 });

      const first = await cursor.read();
      const second = await cursor.read();

      expect(first.events).toHaveLength(5);
      expect(second.events).toEqual([]);
      expect(cursor.seq).toBe(106);
    });

    it('picks up lines appended after a read, and only those', async () => {
      /*
      Test Doc:
      - Why: This is the actual production motion — the daemon appends, we tail.
      - Contract: An append between reads surfaces on the next read; earlier lines do not.
      - Usage Notes: Runs against a temp copy; the committed fixture is never mutated.
      - Quality Contribution: Proves the incremental read is incremental, not a re-scan that happens
        to be filtered.
      - Worked Example: append seq 107 → next read is exactly [107].
      */
      const store = tempStore();
      const cursor = createFileSpineCursor({ spineDir: store.spineDir, since: 0 });
      await cursor.read();

      appendFileSync(
        join(store.spineDir, SPINE_LOG_FILENAME),
        `${JSON.stringify({
          schema_version: 1,
          seq: 107,
          ts: '2026-07-26T01:00:06.000Z',
          actor: 'daemon',
          kind: 'system-state',
          refs: ['node:shipname'],
          peer: 'shipname',
          prev: 'idle',
          next: 'working',
        })}\n`
      );

      const result = await cursor.read();

      expect(result.events.map((e) => e.seq)).toEqual([107]);
      expect(cursor.seq).toBe(107);
    });
  });

  describe('torn and corrupt lines (C-07)', () => {
    it('skips a torn mid-file line, counts it, and keeps reading past it', async () => {
      /*
      Test Doc:
      - Why: `pij-platform.md` states plainly that NDJSON readers must skip torn lines — every pij
        parser does. A reader that throws here goes blind the moment a writer crashes mid-append.
      - Contract: The torn line is skipped, reported in `skipped`, and events AFTER it are still
        returned.
      - Usage Notes: Fixture seq 103 is truncated mid-object.
      - Quality Contribution: The difference between "one bad line" and "the observatory is down".
      - Worked Example: skipped === 1, and 104/105/106 (after the tear) are present.
      */
      const cursor = createFileSpineCursor({ spineDir: FIXTURE_SPINE_DIR, since: 0 });

      const result = await cursor.read();

      expect(result.skipped).toBe(1);
      expect(result.events.map((e) => e.seq)).not.toContain(FIXTURE_TORN_SEQ);
      expect(result.events.map((e) => e.seq)).toEqual(expect.arrayContaining([104, 105, 106]));
    });

    it('holds an incomplete trailing line instead of discarding it, and completes it next read', async () => {
      /*
      Test Doc:
      - Why: A trailing partial line is a write in flight, NOT a tear. Discarding it loses a real
        event permanently; parsing it throws. Both are wrong.
      - Contract: A chunk that does not end in a newline leaves its tail buffered; the next read
        joins the completion and emits the event exactly once.
      - Usage Notes: The cursor is drained first (that read legitimately reports the fixture's one
        tear), then the new line is written in two halves with a read between them.
      - Quality Contribution: Removes the last class of silent event loss from the fast loop.
      - Worked Example: half a line → 0 events, 0 skipped; the rest arrives → [108].
      */
      const store = tempStore();
      const logPath = join(store.spineDir, SPINE_LOG_FILENAME);
      const cursor = createFileSpineCursor({ spineDir: store.spineDir, since: 0 });
      expect((await cursor.read()).skipped).toBe(1);

      const full = `${JSON.stringify({
        schema_version: 1,
        seq: 108,
        ts: '2026-07-26T01:00:07.000Z',
        actor: 'daemon',
        kind: 'system-state',
        refs: ['node:shipname'],
        peer: 'shipname',
      })}\n`;
      const split = Math.floor(full.length / 2);
      appendFileSync(logPath, full.slice(0, split));

      const partial = await cursor.read();
      expect(partial.events).toEqual([]);
      expect(partial.skipped).toBe(0);

      appendFileSync(logPath, full.slice(split));
      const completed = await cursor.read();

      expect(completed.events.map((e) => e.seq)).toEqual([108]);
    });
  });

  describe('transient temp files (C-07)', () => {
    it('reads only events.ndjson — a sibling *.tmp-<pid>-<uuid> log changes nothing', async () => {
      /*
      Test Doc:
      - Why: Atomic replace leaves `*.tmp-<pid>-<uuid>` files behind; there is one on the live host
        today. Its seqs are arbitrary — reading it can push the cursor past real events forever.
      - Contract: The cursor binds one fixed filename. The fixture's tmp log carries seqs 9001/9002;
        neither may ever appear, and the cursor must not jump to 9002.
      - Usage Notes: `spine/events.ndjson.tmp-1234-2f7a8c31` ships in the fixture for exactly this.
      - Quality Contribution: Prevents a permanently-poisoned cursor — a failure that is silent and
        unrecoverable without a restart.
      - Worked Example: read() → max seq 106, no 9001/9002.
      */
      const cursor = createFileSpineCursor({ spineDir: FIXTURE_SPINE_DIR, since: 0 });

      const result = await cursor.read();

      expect(result.events.map((e) => e.seq)).not.toContain(9001);
      expect(result.events.map((e) => e.seq)).not.toContain(9002);
      expect(cursor.seq).toBe(106);
    });

    it('refuses to be constructed against a transient path', () => {
      /*
      Test Doc:
      - Why: The hazard returns the moment someone globs a spine directory and hands us a path. A
        guard at construction turns a silent poisoning into a loud, immediate error.
      - Contract: `isTransientStorePath` recognises the tmp shape; the factory throws on one.
      - Usage Notes: The lock file is likewise never a log.
      - Quality Contribution: Makes the C-07 filter reusable and enforced, not a comment.
      - Worked Example: fileName: 'events.ndjson.tmp-1234-2f7a8c31' → throws.
      */
      expect(isTransientStorePath('events.ndjson.tmp-1234-2f7a8c31')).toBe(true);
      expect(isTransientStorePath('pij-normal-seat.json.tmp-4242-6b1c9d0e')).toBe(true);
      expect(isTransientStorePath('events.ndjson')).toBe(false);

      expect(() =>
        createFileSpineCursor({
          spineDir: FIXTURE_SPINE_DIR,
          fileName: 'events.ndjson.tmp-1234-2f7a8c31',
        })
      ).toThrow(/transient/i);
    });

    it('does not parse the internal append lock', async () => {
      /*
      Test Doc:
      - Why: `spine/events.lock` is ruled internal — "never parse". It is not JSON and not NDJSON.
      - Contract: Its presence in the directory is inert.
      - Usage Notes: The fixture ships one.
      - Quality Contribution: Proves the reader is name-bound, not directory-greedy.
      - Worked Example: read() succeeds and reports 1 skipped line (the tear), not more.
      */
      const cursor = createFileSpineCursor({ spineDir: FIXTURE_SPINE_DIR, since: 0 });

      const result = await cursor.read();

      expect(result.skipped).toBe(1);
    });
  });

  describe('rename and replacement tolerance (C-07)', () => {
    it('survives the log being renamed away and replaced under a live reader', async () => {
      /*
      Test Doc:
      - Why: The registry renames records between tiers with renameSync, and atomic replace is
        temp+rename. A reader holding a byte offset into the OLD inode goes permanently silent.
      - Contract: The cursor resolves by PATH on every read and re-reads from the start of a
        replacement file, with `seq >` as the only de-duplication guard.
      - Usage Notes: Old log moved aside; a fresh log is written containing one already-seen seq and
        one new one.
      - Quality Contribution: Turns the documented rename hazard into a covered case rather than a
        3am mystery.
      - Worked Example: replacement holds [106,201] and the cursor is at 106 → exactly [201].
      */
      const store = tempStore();
      const logPath = join(store.spineDir, SPINE_LOG_FILENAME);
      const cursor = createFileSpineCursor({ spineDir: store.spineDir, since: 0 });
      await cursor.read();
      expect(cursor.seq).toBe(106);

      renameSync(logPath, `${logPath}.rotated`);
      writeFileSync(
        logPath,
        `${JSON.stringify({ schema_version: 1, seq: 106, ts: 't', actor: 'daemon', kind: 'system-state', refs: [] })}\n${JSON.stringify(
          { schema_version: 1, seq: 201, ts: 't', actor: 'daemon', kind: 'system-state', refs: [] }
        )}\n`
      );

      const result = await cursor.read();

      expect(result.events.map((e) => e.seq)).toEqual([201]);
    });

    it('resets on an atomic replacement that is NOT smaller than what it had already read', async () => {
      /*
      Test Doc:
      - Why: Review finding 1 (HIGH). Comparing sizes only catches a replacement that SHRANK. Atomic
        replace is temp+rename, and the replacement is very often the same size or larger — a
        compaction that rewrites the tail, a tier migration, a fresh log that has already caught up.
        In that case a size-only reader keeps a byte offset that belongs to a dead inode, reads from
        the MIDDLE of the new file, and drops its entire prefix permanently — while still reporting
        `missing: false` and a healthy `skipped: 0`. Silent, unrecoverable, invisible.
      - Contract: The cursor keys the byte offset to the file's IDENTITY (dev + ino), not its size.
        A changed identity discards the offset and the pending buffer regardless of how the sizes
        compare; `seq >` then does the de-duplication.
      - Usage Notes: The replacement is written to a sibling and renamed over the path — a genuine
        atomic replace, so the inode really does change. Its first line is padded so the replacement
        is LARGER than the original AND the stale offset lands in the middle of the second line,
        which is where the new event lives. A size-only reader therefore sees a fragment: zero
        events and a phantom tear.
      - Quality Contribution: Closes the last silent-loss path in the fast loop. This is the failure
        the shrink test cannot see.
      - Worked Example: cursor at 106; replacement holds [106 (padded), 301] and is bigger than the
        original → exactly [301], skipped 0, missing false.
      */
      const store = tempStore();
      const logPath = join(store.spineDir, SPINE_LOG_FILENAME);
      const cursor = createFileSpineCursor({ spineDir: store.spineDir, since: 0 });
      await cursor.read();
      expect(cursor.seq).toBe(106);

      const oldSize = statSync(logPath).size;
      const newEventLine = `${JSON.stringify({
        schema_version: 1,
        seq: 301,
        ts: '2026-07-26T02:00:00.000Z',
        actor: 'daemon',
        kind: 'system-state',
        refs: ['node:shipname'],
        peer: 'shipname',
      })}\n`;
      // Size the duplicate line so the STALE offset (oldSize) falls inside the new event's line.
      const duplicateBody = {
        schema_version: 1,
        seq: 106,
        ts: 't',
        actor: 'daemon',
        kind: 'system-state',
        refs: [],
        pad: '',
      };
      const targetDuplicateLength = oldSize - Math.floor(newEventLine.length / 2);
      const padLength = targetDuplicateLength - `${JSON.stringify(duplicateBody)}\n`.length;
      expect(padLength).toBeGreaterThan(0);
      const duplicateLine = `${JSON.stringify({ ...duplicateBody, pad: 'p'.repeat(padLength) })}\n`;

      const replacement = `${logPath}.incoming`;
      writeFileSync(replacement, duplicateLine + newEventLine);
      // The replacement really is at least as large as what we already read — the shrink guard is
      // deliberately given nothing to fire on.
      expect(statSync(replacement).size).toBeGreaterThanOrEqual(oldSize);
      renameSync(replacement, logPath);

      const result = await cursor.read();

      expect(result.events.map((e) => e.seq)).toEqual([301]);
      expect(result.skipped).toBe(0);
      expect(result.missing).toBe(false);
      expect(cursor.seq).toBe(301);
    });

    it('treats the log vanishing between stat and open as the rename window, not an exception', async () => {
      /*
      Test Doc:
      - Why: `stat` and `open` are two syscalls with a real gap between them. The registry renames
        records under live readers, so the file can disappear inside that gap. An unhandled ENOENT
        there escapes read(), and read() is documented as never throwing on a missing store — it
        would take the 2s poll loop down on a race that the contract explicitly says is normal.
      - Contract: ENOENT after a successful stat degrades to the same honest empty as a missing file:
        `missing: true`, cursor held, byte offset and pending buffer untouched so nothing is lost.
      - Usage Notes: The gap cannot be hit deterministically against the real fs, so the range read
        is injected — the same test-only seam the `fileName` option already provides.
      - Quality Contribution: Makes the poller's liveness independent of syscall interleaving.
      - Worked Example: injected ENOENT → [], missing true, cursor still 0; the real reader then
        picks up the whole log on the next tick.
      */
      const enoent = Object.assign(new Error('ENOENT: no such file or directory'), {
        code: 'ENOENT',
      });
      let failNext = true;
      const cursor = createFileSpineCursor({
        spineDir: FIXTURE_SPINE_DIR,
        since: 0,
        readChunk: async (path, position, length) => {
          if (failNext) {
            failNext = false;
            throw enoent;
          }
          return readRealRange(path, position, length);
        },
      });

      const duringGap = await cursor.read();

      expect(duringGap.events).toEqual([]);
      expect(duringGap.missing).toBe(true);
      expect(duringGap.skipped).toBe(0);
      expect(cursor.seq).toBe(0);

      // Position was held, not consumed: the next read still sees the whole log.
      const afterGap = await cursor.read();
      expect(afterGap.events.map((e) => e.seq)).toEqual([...FIXTURE_SPINE_SEQS]);
    });

    it('treats a vanished log as "nothing new", not as an error', async () => {
      /*
      Test Doc:
      - Why: "A watcher bound to a record path will see it vanish and must NOT read that as
        deletion" — the rename window is real and momentary.
      - Contract: A missing file yields an empty read, leaves the cursor untouched, and does not
        throw. When the file reappears, reading resumes.
      - Usage Notes: Deletes then restores the log.
      - Quality Contribution: Keeps the poller alive across the exact window the contract warns about.
      - Worked Example: unlink → [] with cursor still 106; restore with seq 202 → [202].
      */
      const store = tempStore();
      const logPath = join(store.spineDir, SPINE_LOG_FILENAME);
      const cursor = createFileSpineCursor({ spineDir: store.spineDir, since: 0 });
      await cursor.read();

      rmSync(logPath);
      const duringGap = await cursor.read();

      expect(duringGap.events).toEqual([]);
      expect(duringGap.missing).toBe(true);
      expect(cursor.seq).toBe(106);

      writeFileSync(
        logPath,
        `${JSON.stringify({ schema_version: 1, seq: 202, ts: 't', actor: 'daemon', kind: 'system-state', refs: [] })}\n`
      );
      const afterGap = await cursor.read();

      expect(afterGap.events.map((e) => e.seq)).toEqual([202]);
    });

    it('treats a missing spine directory as "nothing new", not as an error', async () => {
      /*
      Test Doc:
      - Why: A machine with no pij installed, or PIJ_HOME pointed somewhere else, must degrade to an
        honest empty — never a boot crash in instrumentation.
      - Contract: An absent directory behaves exactly like an absent file.
      - Usage Notes: —
      - Quality Contribution: Lets the poller start on any host.
      - Worked Example: nonexistent dir → [], missing: true.
      */
      const cursor = createFileSpineCursor({ spineDir: '/nonexistent/pij/spine', since: 0 });

      const result = await cursor.read();

      expect(result.events).toEqual([]);
      expect(result.missing).toBe(true);
    });
  });

  describe('cursor survives a reader restart', () => {
    it('resumes exclusively from a persisted seq', async () => {
      /*
      Test Doc:
      - Why: HMR, a dev-server restart, or a poller re-bootstrap constructs a NEW cursor. If the
        replacement re-reads from 0, every open tab gets the whole log replayed as fresh deltas.
      - Contract: `new cursor(since: previous.seq)` delivers nothing already delivered.
      - Usage Notes: Simulates restart by constructing a second cursor from the first's seq.
      - Quality Contribution: Directly protects AC-02 (one well-behaved reader) across restarts.
      - Worked Example: first drains to 106; restarted cursor reads [] then sees only new appends.
      */
      const store = tempStore();
      const first = createFileSpineCursor({ spineDir: store.spineDir, since: 0 });
      await first.read();

      const restarted = createFileSpineCursor({ spineDir: store.spineDir, since: first.seq });
      expect((await restarted.read()).events).toEqual([]);

      appendFileSync(
        join(store.spineDir, SPINE_LOG_FILENAME),
        `${JSON.stringify({ schema_version: 1, seq: 109, ts: 't', actor: 'daemon', kind: 'system-state', refs: [] })}\n`
      );

      expect((await restarted.read()).events.map((e) => e.seq)).toEqual([109]);
    });
  });

  describe('open vocabulary (WS-5)', () => {
    it('passes unknown kinds and additive fields through untouched', async () => {
      /*
      Test Doc:
      - Why: `kind` is an open vocabulary by ruling — external writers mint kinds, and discovery
        observed an undocumented daemon kind in live data. A reader with an enum here drops real
        events on the floor.
      - Contract: Unknown kinds are returned verbatim, and unknown additive fields survive the round
        trip.
      - Usage Notes: The open-vocab fixture carries `cosmic-ray-detected` and the live-observed
        `delivered-unacked-stale`.
      - Quality Contribution: Makes forward-compatibility a tested property rather than an intention.
      - Worked Example: kinds include both unknown values; `somethingAdditive.nested === true`.
      */
      const cursor = createFileSpineCursor({ spineDir: FIXTURE_OPEN_VOCAB_SPINE_DIR, since: 0 });

      const result = await cursor.read();

      expect(result.events.map((e) => e.kind)).toEqual([
        'system-state',
        'cosmic-ray-detected',
        'delivered-unacked-stale',
      ]);
      expect(result.events[1].somethingAdditive).toEqual({ nested: true });
    });
  });
});
