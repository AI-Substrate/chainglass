# Plan 089 Phase 1 Cross-Model Review

**Verdict: APPROVE**

## Re-review resolution — replacement identity fix

**Finding count: 0.** The prior High finding is resolved.

`FileSpineCursor` now keys its byte offset to the `dev:ino` identity returned by
`stat()`. When the path points to a different inode, it clears both `offset` and
`pending` before reading from byte zero, regardless of whether the replacement
is smaller, equal in size, or larger. The exclusive sequence guard then filters
the repeated `seq: 106` line and emits the new `seq: 301` line. An `ENOENT`
between `stat()` and the range read returns the documented missing/rename-window
result without advancing state.

The new atomic-replacement test genuinely replaces the pathname with a sibling
file whose size is at least the previous offset and whose stale offset falls
inside the new event line. It therefore closes the former skip-on-equal-or-larger
replacement hole rather than retesting the existing shrink fallback.

### Re-review mutation gate — file identity reset

The identity guard is load-bearing. I copied
`apps/web/src/features/089-first-class-pij/server/spine-cursor.ts` to
`/tmp/pij-rereview-d1106100/spine-cursor.ts`, changed only
`this.identity !== null && this.identity !== identity` to
`false && this.identity !== null && this.identity !== identity`, then restored
from that copy. The restored source is byte-exact:

```text
54c80002a353c86e460ca9fb163707964e5773d05ffd45c7e9d777047ff683ef  /tmp/pij-rereview-d1106100/spine-cursor.ts
54c80002a353c86e460ca9fb163707964e5773d05ffd45c7e9d777047ff683ef  apps/web/src/features/089-first-class-pij/server/spine-cursor.ts
```

```text
$ pnpm vitest run test/unit/web/pij/spine-cursor.test.ts
❯ test/unit/web/pij/spine-cursor.test.ts (16 tests | 1 failed) 126ms
× FileSpineCursor > rename and replacement tolerance (C-07) > resets on an atomic replacement that is NOT smaller than what it had already read 17ms
  → expected [] to deeply equal [ 301 ]
Tests  1 failed | 15 passed (16)
```

The ENOENT rename-window test remained green during this mutation, proving the
new test is pinned to identity handling alone.

```text
$ cp /tmp/pij-rereview-d1106100/spine-cursor.ts apps/web/src/features/089-first-class-pij/server/spine-cursor.ts
$ diff -u /tmp/pij-rereview-d1106100/spine-cursor.ts apps/web/src/features/089-first-class-pij/server/spine-cursor.ts
$ pnpm vitest run test/unit/web/pij/spine-cursor.test.ts
✓ test/unit/web/pij/spine-cursor.test.ts (16 tests) 19ms
Test Files  1 passed (1)
Tests  16 passed (16)
```

The suite also passed before the mutation: 16 tests, one file. Vitest emitted
the known `tsconfck` warnings for generated standalone tsconfigs, but they did
not prevent either run.

## Original finding — resolved in re-review

### Resolved High — Atomic replacement can silently skip spine events

- **File:** `apps/web/src/features/089-first-class-pij/server/spine-cursor.ts:76-89`
- **Claim:** The cursor is rename/replacement tolerant (C-07), discards its byte offset when a file is replaced, and relies on exclusive sequence filtering for correctness.
- **Evidence:** The implementation resets `offset` only when `stat(path).size < offset`. An atomic replacement whose new `events.ndjson` is the same size or larger retains the offset and reads from the middle of the replacement, skipping its prefix. The existing test only writes a much shorter two-line replacement, so it exercises the shrink path rather than the advertised replacement guarantee. A replacement can therefore omit new events permanently while still reporting a healthy, non-missing log.
- **Required fix:** Record the file identity from `stat` (for example `dev` and `ino`) and reset `offset` and `pending` when it changes, irrespective of size. Also treat an `ENOENT` from `readRange` after a successful `stat` as the same non-fatal rename window. Add coverage for an atomic replacement at least as large as the previously read file, containing a duplicate old sequence plus a new event; it must emit only the new event.

## Mutation Gate Evidence

Each target was copied to `/tmp/pij-review-d1106100/`, mutated, tested, copied back from that backup, and compared with `diff -q`. The final SHA-256 values match the backups:

```text
f984f94ae17c15634f6208bcde91bbbe1560bb545063903201d53a14e892a4be  spine-cursor.ts
6e36d52e66031c8dd3fbb92112af84e7d1dfb2bb5553009e50bdaa684eae607c  flow-reader.ts
9f2a170ca6de634bcc6268d08b06f2c0ff5e676f9efdec40e0a91df7c0e5c6e8  fence.test.ts
```

### Spine exclusive-sequence guard

Mutation: changed `parsed.seq > this.cursorSeq` to `parsed.seq >= this.cursorSeq`.

```text
$ pnpm vitest run test/unit/web/pij/spine-cursor.test.ts
❯ test/unit/web/pij/spine-cursor.test.ts (14 tests | 3 failed) 23ms
× FileSpineCursor > exclusive --since semantics (C-08) > is EXCLUSIVE: since=<tip> yields nothing, since=<tip-1> yields exactly the tip
→ expected [ { schema_version: 1, …(9) } ] to deeply equal []

$ cp /tmp/pij-review-d1106100/spine-cursor.ts apps/web/src/features/089-first-class-pij/server/spine-cursor.ts
$ diff -u /tmp/pij-review-d1106100/spine-cursor.ts apps/web/src/features/089-first-class-pij/server/spine-cursor.ts
$ pnpm vitest run test/unit/web/pij/spine-cursor.test.ts
✓ test/unit/web/pij/spine-cursor.test.ts (14 tests) 102ms
Test Files  1 passed (1)
Tests  14 passed (14)
```

### Flow five-state classifier

Mutation: changed the no-provenance classification from `legacy` to `not-started`.

```text
$ pnpm vitest run test/unit/web/pij/flow-reader.test.ts
❯ test/unit/web/pij/flow-reader.test.ts (24 tests | 2 failed) 187ms
× createFlowReader — the five ruled states (AC-07) > classifies a flow with NO provenance as legacy, not as an error and not as empty
→ expected 'not-started' to be 'legacy' // Object.is equality

$ cp /tmp/pij-review-d1106100/flow-reader.ts apps/web/src/features/089-first-class-pij/server/flow-reader.ts
$ diff -u /tmp/pij-review-d1106100/flow-reader.ts apps/web/src/features/089-first-class-pij/server/flow-reader.ts
$ pnpm vitest run test/unit/web/pij/flow-reader.test.ts
✓ test/unit/web/pij/flow-reader.test.ts (24 tests) 29ms
Test Files  1 passed (1)
Tests  24 passed (24)
```

### Fence anti-vacuity guard

Mutation: changed `GUARDED_ROOTS` to an empty array.

```text
$ pnpm vitest run test/unit/web/pij/fence.test.ts
❯ test/unit/web/pij/fence.test.ts (10 tests | 2 failed) 5ms
× C-02 fence — the feature writes to nothing (AC-11) > guards a non-empty set of source files (the check itself must not silently cover zero)
→ expected 0 to be greater than or equal to 8

$ cp /tmp/pij-review-d1106100/fence.test.ts test/unit/web/pij/fence.test.ts
$ diff -u /tmp/pij-review-d1106100/fence.test.ts test/unit/web/pij/fence.test.ts
$ pnpm vitest run test/unit/web/pij/fence.test.ts
✓ test/unit/web/pij/fence.test.ts (10 tests) 26ms
Test Files  1 passed (1)
Tests  10 passed (10)
```

The three original load-bearing test guards are non-vacuous. The former
equal-or-larger atomic-replacement coverage gap is resolved by the re-review
test and mutation evidence above.

## Contract and Scope Checks

- All Phase 1 changes are within the packet's permitted paths; `git diff --check` is clean.
- C-01/C-02/C-04: the source audit found only the fixed-argv `execFile` seam; no write-mode filesystem calls, watcher, tmux, or mutating pij invocation. The static fence and its runtime argv allowlist are both covered.
- C-03: rows are keyed by branded `PijId`; `pid`, `paneId`, and `dataDir` are removed before serialization.
- C-08/C-10: the poller has the 2s spine and 8s single-global-list loops, coalesces system-state activity to at most one fast-loop broadcast, and stamps snapshots and all three channel union variants with `seq`.
- C-09: the flow reader matches the ruled table: provenance maps to `live`/`legacy`, artifacts to `untracked`, an empty folder to `not-started`, and invalid JSON or dangling `nav.now` to `corrupt`.
- Every `/api/pij/*` handler calls the shared auth gate before reading. Route tests verify all four unauthenticated paths return 401.

## Flagged Interpretations

- **Fixture naming and temp materialization: sound.** Committed `*.fixture.json` files avoid creating a second `the-flow.json` writer surface, while the tests materialize the real production filename in an OS temp directory before exercising the reader.
- **Corrupt-JSON `.txt` guard: sound.** The fixture materializer strips `.fixture.json.txt` to `the-flow.json`, so the parser still receives deliberately invalid JSON while format tooling does not parse the committed invalid document.

## Claim Spot Checks

- `pnpm vitest run test/unit/web/pij/`: **8 files, 122 tests passed**.
- `just typecheck`: passed all listed workspace and test tsconfigs.
- `pnpm vitest run test/integration/web/dashboard-navigation.test.tsx`: reproduced the claimed three failures: two missing `/dev/i` assertions and one obsolete `w-16` class assertion. The reviewed Phase 1 diff has no overlap with that component/test surface, so the execution-log explanation is consistent; no revert was used.
