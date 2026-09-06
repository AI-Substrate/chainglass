# Plan 093 — silkworm implementation receipts

Basis: `PACKET-silkworm-rs-default.md`, impl-guide Amendments 1–6, Antelope's accepted ack and final no-persistence ruling A (2026-09-06). Work began at main `44056cb52`; publication parent `81d9152ec` includes the prime's later findings. Unrelated `.serena/project.yml` excluded.

## Implementation progress

| Unit | State | Evidence |
|---|---|---|
| u5 stream | Implemented; live replay proof passed | Split cursors, 5s recycle, post-hello establishment, ordered commits. Fresh processes replay from explicit alias:0; persist nothing (Antelope ruling A). |
| u6 mapping | Implemented; focused tests pass | Explicit model/provider mapping; shared join field set partitions carried facts and unavailable fields; tombstone cursor typed and source-discriminated. |
| u7 ingestion | Implemented; review correction passed | Real report cards/semantic declarations; coalesced 2s notifications; not_found race tolerance; committed proof command. Fresh descriptors supersede cached history, preserving only newer in-flight reports. |
| u8 default | Implemented; focused tests pass | Default rs; explicit legacy retains PIJ_POLLER=on gating. Environment injection controls construction and start consistently. |
| u9 honest rail | Implemented; focused tests pass | Source capability and row marker reach rail, fleet and global/nested rows; no state-derived liveness, hot count or idle pruning for rs. |

## RAN — preliminary evidence

- `harness boot`: exit 0; `just typecheck` passed all 9 workspace tsconfigs; 17,551ms. No dev or daemon restart.
- Read-only HTTP `/v1/seats`: HTTP 200; 913 rows, one machine alias.
- Read-only `/v1/events?since={}`: HTTP 200; hello only during 2s observation. Empty map is not bootstrap replay.
- One-time research `/v1/events?since={"JordansacStudio.localdomain":0}`: HTTP 200; 14,484 event frames plus hello. This is measurement, not a production bootstrap design. Counts: 1,447 seat.put, 93 seat.tombstone, 516 report.now, 110 report.state, 29 spawn.bound, 2 spawn.failed.
- Captured 20 real report/spawn frames, unchanged payloads, in `../inputs/live-report-frames-6012-14473.ndjson`. Original supplied fixture carried no report frames.
- At cursor 14,484: 55 untombstoned roster IDs had status cards; latest-card cursors span 235–14,473. Windows of 512/1024/2048/4096/8192 frames cover 2/2/3/7/20 such reporters. Untombstoned is NOT evidence of live. This measurement invalidated the proposed bounded window.
- RAN 2026-09-06: original RsClient measurement through cursor 14,484: **93ms transport**, **7,772,489 decoded NDJSON bytes**. This justified replay-from-zero every process with no persistence. Re-evaluate when fresh replay exceeds approximately 3s.
- RAN `node scripts/verify-rs-reader.mjs --replay`, exit 0: **14,560 frames**, **89.35ms transport**, **298.94ms integrated**, **7,809,291 wire bytes**. Integrated reader restored **57 cards** and **11 semantic reports** across **913 rows**. **1,579 refresh requests → 3 global reads**; maximum concurrent read and subscriber each **1**. Transport and ingestion are separate measurements; this preceded the descriptor-authority review correction.
- RAN revised `node scripts/verify-rs-reader.mjs --replay`, exit 0 after review correction: **14,596 frames**, **96.01ms transport**, **188.77ms integrated**, **7,826,054 bytes**, **914 rows / 57 cards / 11 semantic reports**. **1,580 refresh requests → 3 global reads**, maximum subscriber/read concurrency **1**. Oracle follows actual descriptor state, not stale report history.
- RAN final `node scripts/verify-rs-reader.mjs --replay`, exit 0 after native-review corrections: **14,614 events**, **90.75ms transport / 196.96ms integrated**, **7,834,105 bytes**, **916 rows / 57 cards / 11 semantic reports**; 1,584 refresh requests coalesced to 3 reads, one subscriber/read at a time. Three successful `poller-status` publications now accompany the reads.
- RAN `pnpm vitest run test/unit/web/pij`, exit 0: **35 files / 478 tests passed**. This includes UI absence, default selection, binding mapping, ingestion, stream and sole-writer fence contracts; not a substitute for live delivery.
- The proposed bounded bootstrap/persisted cursor rulings were withdrawn: a cursor-only checkpoint loses in-memory cards after restart, and writing PIJ_HOME violates C-02. No checkpoint code or file created.

- `report.state` writes upstream `descriptor.semantic_state`, not mechanical `state` (read-only source evidence: pij `crates/core/src/report.rs:232`). It updates semanticState/stateNote, never fabricates a PREV/NEXT card. `report.now` maps literal did/next into the existing card. Replay keeps the newest per-seat report cursor. Browser snapshot/delta sequence is monotone application order because raw daemon cursor delivery is not monotone.
## Acceptance receipts

These rows require committed commands; preliminary observations above are NOT acceptance receipts.

| Row | State | Command / exit / number |
|---|---|---|
| bp-0001 | READ — prime's startup pass below; correction runtime pending | The prime ran the initial rs bootstrap after Jordan's restart (0 CLI list children, 918 rows). Current hierarchy/focus adapter correction still needs a fresh dev restart and own browser proof. |
| bp-0002 | RAN — pass | `node scripts/verify-rs-reader.mjs --all`, exit 0: 913 rows matched every carried/additive field, zero mismatches, 96 tombstoned rows, one seats + one state read. |
| bp-0003 | RAN — pass | `node scripts/verify-rs-reader.mjs --watch-pane %3808 --timeout-ms 60000`, exit 0. Local stdin trigger → appearance **3,082.31ms upper bound**. First seat.put **14602** (at 0) arrived on connection **3**; pushed **14603/14604** arrived earlier on connection **2**; reconnect `since` stayed **14599**. Three checked since maps; no skipped descriptor. |
| bp-0004 | RAN — pass | Created isolated cg-rs-proof-093 pane %3806, adopted inside that pane → pij-yielding-dijkstra, then `tmux kill-session -t cg-rs-proof-093`, exit 0. `node scripts/verify-rs-reader.mjs --seat pij-yielding-dijkstra`, exit 0: one row matched direct source including ABSENT tombstone fields. Above --all also checked 96 actual tombstones. |
| bp-0005 | BLOCKED — needs authorization | Shared daemon restart requires Jordan's explicit word; not run. |
| bp-0006 | RAN — pass | `node scripts/verify-rs-reader.mjs --auth`, exit 0: actual HTTP 401/200 with exactly 2 attempts, and terminal 401/401 with exactly 2 attempts; scratch key only. |
| bp-0007 | RAN — pass | Latest correction run: `pnpm vitest run test/unit/web/pij`, exit 0, **548 tests / 35 files**. Initial 478-test count predated four late fixes (482 at bc57d806d); this run includes hierarchy/focus/status and review regressions. |
| bp-0008 | RAN — code gates pass; audit exception | Latest hierarchy/focus correction `just fft`, exit 1 ONLY at security-audit. Lint/format 1,804 files; production build; all 9 workspace tsconfigs; **547 test files / 7,352 tests passed**, 8 files / 63 tests skipped. Explicit legacy tests passed. Audit unchanged: **124 advisories (6 critical, 41 high, 68 moderate, 9 low)** under the acknowledged exception. |

## Proof boundaries

No app or daemon restarts. Three isolated proof panes adopted themselves; all three owned tmux sessions were removed. **Three permanent registry rows added by these probes** (`pij-yielding-dijkstra`, `pij-marine-vulture`, `pij-overwhelming-locust`), because the daemon does not reap. No other daemon writes, sqlite access or shared-key changes. Temporary proof subscribers ran one at a time. No dependency changes. Security audit retains the previously acknowledged publication exception. First `just fft` attempt was cancelled when a review fix invalidated its revision; the final corrected gate subsequently completed as recorded below.

### Failed probes retained, not relabelled

- `%3806` / `rs-descriptor-proof`: exit 1, `watch_clock_or_trigger_order`. Measured seat.put 14561 carried `at:0`; fixed the instrument to use an explicit local monotonic trigger instead of a fabricated timestamp.
- `%3807` / `rs-descriptor-proof-clock`: exit 1, `watch_missing_pushed_burn_control`. Appearance upper bound 3,273.52ms, but pushed 14597/14598 preceded seat.put 14599 because `tmux send-keys` returns before the shell finishes. Kept the assertion; corrected the external stimulus to `pij-rs adopt --harness omp --json && pij-rs send --to pij-lonely-antelope --body 'NO ACTION: bp-0003 positive control sent strictly after owned scratch adoption' --json` inside `%3808`.
- Successful `%3808` protocol: create isolated `cg-rs-proof-093-ordered` session; start committed `--watch-pane`; wait `ready`; write `trigger` to observer stdin; wait `triggerReady`; execute ordered adopt/send inside the owned pane; observer exits 0; remove the session. Source event timestamps remain raw, including zero.

## Harness observations

Boot works; harness doctor reports missing `checks` verb and the boot briefing remains a generated TODO. Existing repo `just` gates remain the publication proof. The missing report fixture and missing committed live-reader probe are addressed inside u7 rather than replaced by invented frames or temporary-only evidence.

## Validation record

Source-only independent backend critic upheld one defect: cached report.state could override a revived descriptor's cleared semantic state forever. Corrected fresh-descriptor authority using read-start application revision and per-seat descriptor cursor; historical notes remain only when their state matches. **31 targeted tests passed**, including three new revival/in-flight/cold-replay cases using captured frames 12639/12672. Critic's targeted recheck: **correct, no remaining findings**, confidence 0.97; reviewer ran no validation commands.

Final corrected `just fft` completed in **369.11s**, with **all 3,974 output lines read**. Build, lint/format, all 9 workspace typechecks and **7,286 tests** passed; only the acknowledged 124-advisory dependency audit failed. Expected error-path output, React act warnings and legacy bootstrap missing-workspace watcher warnings were not filtered. No test was weakened or skipped to obtain the pass.

The required `just code-review-agent apps/web/src/features/089-first-class-pij/server/pij-poller.service.ts` attempt failed with **E200 / exit 126** in minih (recipe exit 1): its preset denied shell and writing the report. Run `2026-09-06T07-33-23-587Z-f4e2`; no validated JSON report exists. Its text verdict was REQUEST_CHANGES, not approval.

Both findings were upheld and fixed: rs successful reads publish cleared errors/freshness even with unchanged rows; pushed spawn kinds fence stale declarations without advancing stream resume. **40 focused tests passed**. The independent critic's final source-only recheck returned **correct / no remaining findings**, confidence **0.98**; the full corrected gate above then passed all code checks. This does not relabel the failed minih run as an approval.

Harness improvement: add a scoped report-output allowance and fail fast on missing required review permissions. `docs/retros/code-review.md` is the failed runner's generated artifact and remains **untracked**, per Antelope's explicit ruling; it is not included as successful review evidence.

## Browser boundary

Before initial publication, the owned headless page authenticated through supported `/api/bootstrap/verify` using the local bootstrap-code file; credential never printed or copied. Fill/type/screenshot wrappers timed out while navigation/evaluation worked. At that point the host's pre-flip singleton was degraded with zero rows. Jordan subsequently restarted dev, and the prime's receipt below records the initial rs bootstrap proof. No fake endpoint responses or manual singleton reset were used. Docker verification container was absent.

## bp-0001 — RAN by pij-lonely-antelope after Jordan's `just dev` restart (2026-09-06 ~08:07Z)

- `ps -Ao command | grep -c '[c]li.ts list --json'` → **0** (pre-state on record: 2 in flight continuously).
- Dev server pid 36201 on :3000, no env overrides (Jordan's restart, not mine).
- `GET /api/pij/fleet` from the unlocked page: `running:true, fleetSize:918, seq:15065, lastError:null`, 918 rows.
- Row state: **RAN — pass.** The one row silkworm could not run without the operator.

## Post-push hierarchy and focus correction — in progress

Authority: `REVIEW-bc57d806d.md` and Jordan's screenshot showing a flat ROLE UNKNOWN rail. All six review findings were upheld. No role is inferred from a name or parent position.

- **F1**: rs `nodeShow` now reads the exact id from the same fresh `/v1/seats` source. Focus validates pane existence, pid/start identity and process ancestry using bounded read-only probes, then rechecks the pane/window before selecting. Legacy focus remains separate.
- **F2**: rs tree now projects real `parent` links, with repository-family scope via existing `IGitWorktreeResolver`. Tree API carries `structureSource: rs-parent-links` and role provenance. Real adapter + real git resolver returned Antelope with Zakalwe and Chickadee as children. The rail uses compact unclassified rows, one source notice, and preserves actual report cards regardless of missing roles.
- **F3**: captured payloads drive explicit scripted same-seat/cursor regression scenarios; no fabricated transcript files. Both spawn kinds are tested through `getPijPoller`'s actual callback and remain excluded from resume.
- **F4**: current focused proof count is 548 tests / 35 files, exit 0.
- **F5**: unknown source values warn at construction while the pure selector still defaults to rs.
- **F6**: `ddocs set` + build updated the generated default-source criteria and added Amendment 7, including the same-source tree/detail cutover.

`pnpm biome check --write` over affected source/tests passed. Full correction `just fft` completed in **384.85s**: build, lint/format, all nine workspace typechecks, **547 files / 7,352 tests passed**, 63 tests skipped. All **3,951 output lines** were read. Only the acknowledged 124-advisory security audit failed. Role projection remains upstream **pij plan 138 phase 2, unscheduled**; probe cleanup has no supported rs API, so no sqlite edits or ID-specific hiding were added and no further probe seats were created.

**New runtime proof remains blocked:** the actual owned browser loaded the compact UI, but `/api/pij/tree` still returned the old HMR-held composite (no rs provenance, one legacy root, no Antelope group). Jordan was asked to restart `just dev` again after this adapter change. The earlier bp-0001 bootstrap pass is not substituted for current hierarchy/focus verification.

Independent read-only review of the hierarchy/focus correction returned **no material findings** (confidence 0.88). It covered source identity, repository scoping, process/pane guards, card retention and tree refresh; it did not run commands or claim browser proof. All three `ddocs build --check <file>` runs passed with `drift:false` for plan, implementation guide and backpressure documents.

Operator alert `2026-09-06T08-29-42-254Z_00009e` requested only the dev restart needed for current runtime proof. Screenshot/protocol attempts also timed out; DOM evaluation and live API reads worked. No services, real-seat records or new probe registrations were changed during this correction.

The prime authorized commit/push before the operator restart, with the mandatory commit-body caveat: **live hierarchy/focus acceptance pending dev restart; not claimed**. A fresh-page receipt must follow the restart; source/test proof is not substituted for it. Existing `.serena/project.yml` and the failed runner's untracked `docs/retros/code-review.md` remain outside this change.
