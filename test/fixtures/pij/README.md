# pij store fixtures — hazard ledger

Plan 089 Phase 1, T002. **One ruled hazard per fixture.** If you add a fixture, add its row; if a row
has no test asserting it, the fixture is decoration and should be deleted.

Nothing here is ever written back to `~/.pij`. Tests that need to mutate a store copy it into an OS
temp dir first (`copyStoreToTemp()` in `index.ts`).

| Fixture | Ruled hazard | Rule | Asserted by |
|---|---|---|---|
| `store/shipname.json` | A pij id may be a **single segment**. Never pattern-match id shapes. | C-03 / F-03 | `join.test.ts`, `poller.test.ts` |
| `store/pij-normal-seat.json` | _(control — no hazard)_ A well-formed descriptor, so a failing test means the hazard, not the shape. | — | all |
| `store/pij-normal-seat.json.tmp-4242-6b1c9d0e` | Atomic replace is write-temp + rename, so `<id>.json.tmp-<pid>-<uuid>` files appear transiently and survive crashes. A directory scan that does not filter them reads a **phantom peer**. | C-07 | `spine-cursor.test.ts` |
| `store/archive/pij-archived-seat.json` | The two-tier registry **renames** records into `archive/` on a 48h terminal TTL. A vanished record path is a **tier migration, not a deletion**. | C-07 / Finding 01 | `spine-cursor.test.ts` |
| `store/spine/events.ndjson` | A **torn line** (seq 103, truncated mid-append). Every pij parser skips torn lines; so must ours — and skipping must not desynchronise the cursor. | C-07 / `pij-platform.md` § Consistency | `spine-cursor.test.ts` |
| `store/spine/events.ndjson.tmp-1234-2f7a8c31` | Same tmp hazard, inside the **spine** directory: a transient temp carrying far-future seqs. Reading it would poison the cursor forever. | C-07 | `spine-cursor.test.ts` |
| `store/spine/events.lock` | The append lock is ruled **internal, never parse**. A scan that treats every file in `spine/` as a log crashes on it. | `pij-platform.md` § File layout | `spine-cursor.test.ts` |
| `open-vocab-spine/events.ndjson` | `kind` is an **open vocabulary** (WS-5): external writers mint kinds, and undocumented daemon kinds exist in live data today (`delivered-unacked-stale`, observed 2026-07-26). Unknown kinds must survive the reader untouched. | WS-5 / discovery §1 | `spine-cursor.test.ts`, `poller.test.ts` |

## Deliberately absent

- **No `projects/` or `assignments/` records.** Phase 1 reads those through the CLI, never by path —
  record paths are explicitly *not* a stable contract (`pij-platform.md` § Path stability). A fixture
  for them would encode a binding we must not create.
