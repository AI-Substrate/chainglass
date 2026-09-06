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
| bp-0001 | READ — prime's startup and page passes below | Initial rs bootstrap: 0 CLI list children, 918 rows. After Jordan's second restart, fresh rs-parent-links hierarchy rendered and live focus returned 200 / honest refusal 409. |
| bp-0002 | RAN — pass | `node scripts/verify-rs-reader.mjs --all`, exit 0: 913 rows matched every carried/additive field, zero mismatches, 96 tombstoned rows, one seats + one state read. |
| bp-0003 | RAN — pass | `node scripts/verify-rs-reader.mjs --watch-pane %3808 --timeout-ms 60000`, exit 0. Local stdin trigger → appearance **3,082.31ms upper bound**. First seat.put **14602** (at 0) arrived on connection **3**; pushed **14603/14604** arrived earlier on connection **2**; reconnect `since` stayed **14599**. Three checked since maps; no skipped descriptor. |
| bp-0004 | RAN — pass | Created isolated cg-rs-proof-093 pane %3806, adopted inside that pane → pij-yielding-dijkstra, then `tmux kill-session -t cg-rs-proof-093`, exit 0. `node scripts/verify-rs-reader.mjs --seat pij-yielding-dijkstra`, exit 0: one row matched direct source including ABSENT tombstone fields. Above --all also checked 96 actual tombstones. |
| bp-0005 | BLOCKED — needs authorization | Shared daemon restart requires Jordan's explicit word; not run. |
| bp-0006 | RAN — pass | `node scripts/verify-rs-reader.mjs --auth`, exit 0: actual HTTP 401/200 with exactly 2 attempts, and terminal 401/401 with exactly 2 attempts; scratch key only. |
| bp-0007 | RAN — pass | Published f1b79236f: **548 tests / 35 files**. D1–D3 first integrated run: **556 / 35**, followed by **85 focus/fence tests** after the six additional stamp regressions. All PIJ files also pass in the complete gate below. Initial 478 predated late fixes (482 at bc57d806d). |
| bp-0008 | RAN — code gates pass; audit exception | Final containment `just fft`: lint/format 1,804 files, production build, all 9 workspace tsconfigs, **547 files / 7,386 tests passed**, 8 files / 63 tests skipped. Exit 1 ONLY at the unchanged **124-advisory audit (6 critical, 41 high, 68 moderate, 9 low)** under the acknowledged exception. |

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

## Post-push hierarchy and focus correction — page accepted

Authority: `REVIEW-bc57d806d.md` and Jordan's screenshot showing a flat ROLE UNKNOWN rail. All six review findings were upheld. No role is inferred from a name or parent position.

- **F1**: rs `nodeShow` now reads the exact id from the same fresh `/v1/seats` source. Focus validates pane existence, pid/start identity and process ancestry using bounded read-only probes, then rechecks the pane/window before selecting. Legacy focus remains separate.
- **F2**: rs tree now projects real `parent` links, with repository-family scope via existing `IGitWorktreeResolver`. Tree API carries `structureSource: rs-parent-links` and role provenance. Real adapter + real git resolver returned Antelope with Zakalwe and Chickadee as children. The rail uses compact unclassified rows, one source notice, and preserves actual report cards regardless of missing roles.
- **F3**: captured payloads drive explicit scripted same-seat/cursor regression scenarios; no fabricated transcript files. Both spawn kinds are tested through `getPijPoller`'s actual callback and remain excluded from resume.
- **F4**: the f1b79236f focused proof count was 548 tests / 35 files, exit 0; later follow-up counts are recorded below.
- **F5**: unknown source values warn at construction while the pure selector still defaults to rs.
- **F6**: `ddocs set` + build updated the generated default-source criteria and added Amendment 7, including the same-source tree/detail cutover.

`pnpm biome check --write` over affected source/tests passed. Full correction `just fft` completed in **384.85s**: build, lint/format, all nine workspace typechecks, **547 files / 7,352 tests passed**, 63 tests skipped. All **3,951 output lines** were read. Only the acknowledged 124-advisory security audit failed. Role projection remains upstream **pij plan 138 phase 2, unscheduled**; probe cleanup has no supported rs API, so no sqlite edits or ID-specific hiding were added and no further probe seats were created.

**Historical runtime blocker, since cleared:** the first owned browser loaded the compact UI but the HMR-held composite still served legacy hierarchy. Jordan's second restart and the prime's page proof below closed this blocker; the earlier bp-0001 bootstrap pass was not substituted for it.

Independent read-only review of the hierarchy/focus correction returned **no material findings** (confidence 0.88). It covered source identity, repository scoping, process/pane guards, card retention and tree refresh; it did not run commands or claim browser proof. All three `ddocs build --check <file>` runs passed with `drift:false` for plan, implementation guide and backpressure documents.

Operator alert `2026-09-06T08-29-42-254Z_00009e` requested only the dev restart needed for current runtime proof. Screenshot/protocol attempts also timed out; DOM evaluation and live API reads worked. No services, real-seat records or new probe registrations were changed during this correction.

The prime authorized commit/push before the operator restart, with the mandatory commit-body caveat: **live hierarchy/focus acceptance pending dev restart; not claimed**. A fresh-page receipt must follow the restart; source/test proof is not substituted for it. Existing `.serena/project.yml` and the failed runner's untracked `docs/retros/code-review.md` remain outside this change.

## F1 reproduced on the loaded page, pre-fix (antelope, 2026-09-06 08:41Z)

Jordan clicked the NEEDS-YOU card for `pij-grim-gurgeh` and got
`the pij store could not be read: E-UNKNOWN no detail`. The dev server (pid 36201) started
18:03 local; the F1 fix (`f1b79236f`) was committed 18:36. The running poller singleton
therefore still routes `nodeShow` to the legacy store, which does not hold the seat — F1
exactly, as the reviewer described it, now observed by the operator. Confirmed by
`GET /api/pij/tree` on the same server returning the legacy root `pij-chief-roadrunner`
with a `~/.pij` dataDir. Not a new defect; a live receipt for the reviewer's finding.
Cleared by a `just dev` restart onto `f1b79236f`, which is Jordan's to run.

## Page proof on f1b79236f — RAN by antelope after Jordan's second restart (2026-09-07 08:25 local start)

- `GET /api/pij/tree?workspace=<main>&all=1` from the fresh singleton:
  `structureSource: "rs-parent-links"`, `rolesUnavailable: true`, 11 roots,
  `pij-lonely-antelope` children = `[pij-civil-zakalwe, pij-creative-chickadee]`.
- `POST /api/pij/focus` `pij-creative-chickadee` → **200 `{focused:"@3723"}`** (live seat, pane verified at click time).
- `POST /api/pij/focus` `pij-marine-vulture` (probe corpse) → **409 `no-pane`**, "has no matching tmux pane at focus time". An honest refusal, not a store error.
- Operator's screenshot shows the same hierarchy rendered. F1 and F2 closed on the page. The only rows without a receipt are bp-0005 (daemon restart, awaiting Jordan) and the D1–D3 LOW follow-ups.

## D1–D3 follow-ups — after accepted page proof

- **Own parent registration — RAN:** `pij-rs register pij-coherent-silkworm --harness omp --folder /Users/jordanknight/substrate/chainglass --pane %3614 --pid 57083 --proc-start 20260906094241 --parent pij-lonely-antelope --json` accepted the existing ID. `pij-rs state` confirmed the new parent and unchanged ID, pid, start stamp and pane. No remint, no refusal, no other seat changed; this operator-directed own-seat repair is not a Chainglass writer.
- **D1:** duplicate IDs keep their first descriptor and display once as roots. Every cycle member becomes a root; valid descendants and healthy trees remain intact. Source parent/role fields are unchanged. `structureWarnings` passes through the tree API/hook into one collection notice and clears after a healthy refresh.
- **D2:** observed missing process, differing valid start stamp, and changed pane target now produce `process-gone`, `process-reused`, and `pane-moved`, with corresponding seat observations. Incomplete/malformed evidence remains `identity-unverified`. Review caught invalid recorded stamps being mislabeled reuse: five regressions failed before the fix; the shared calendar parser now validates recorded stamps before probes.
- **D3:** process output remains bounded, raised to 32 MiB to match the existing roster reader; tmux stays at 1 MiB and all commands retain the 3s timeout.
- **RAN:** first integrated PIJ run **556 tests / 35 files**; final changed focus/fence run **85 tests / 2 files**, including six added stamp regressions. `harness boot` passed all nine workspace typechecks. Final publication gate follows on the settled revision.
- **Browser RAN, live:** the owned `pij-followup-proof` page rendered silkworm under Antelope after registration. Clicking xenophobe's real button returned **409 `no-pane`**, and its exact observation rendered. One live roster + process/pane snapshot found no in-family gone-process seat with an existing pane, so none was manufactured.
- **Browser RAN, scripted boundary proof:** three explicit HTTP refusal fixtures exercised the actual button/provider rendering of the new strings; a scripted tree-response warning rendered exactly once in the existing collection notice. These are UI fixtures, **not live daemon corruption/reuse/movement receipts**. Corrupt graph recovery and OS classifications are covered by production-adapter/route tests.
- **Proof limits:** screenshot protocol timed out; DOM-driven browser interaction worked. Docker harness container was not running; no services were started or restarted. The operator's accepted F1/F2 page receipt remains distinct from this follow-up proof.
- **Validation adjudication:** the independent critic's one MEDIUM finding (malformed recorded start mislabeled as PID reuse) was reproduced, fixed, and re-read against the applied source/tests. Final source-only result: no actionable findings. Original exact-start, ancestry and final-pane guards remain intact.
- **Browser cleanup RAN:** restoring real tree responses cleared the scripted warning; refresh returned HTTP 200 with no console errors captured during the check. The real refusal response was restored and the owned tab released.
- **Harness feedback:** recurring browser-driver capture failures and the Docker-only verification recipe are recorded as W012/W013 in the existing harness wishlist. Pending observations remain scoped to this seat; no shared buffer was cleared.
- **Full gate attempt — RAN, failed at tests:** `just fft` completed in 477.62s, all 3,039 output lines read. Lint/format (1,804 files), production build and all nine typechecks passed. Tests: **2 failed / 7,364 passed / 63 skipped**, **546 passing files / 1 failing / 8 skipped**. Both failures were the real FlowSpace MCP integration: initial 30s request timeout, then 6,113ms against the unchanged 5,000ms warm-query assertion. Security audit was not reached. This is not a green publication receipt.
- **Native review — RAN, runner failed:** run `2026-09-06T22-37-30-464Z-b3fe`, E200 from shell/write restrictions, `reportPath:null`. Its full inline report was recovered and read, not treated as runner approval. `workspace=/` containment was upheld by the prime as MEDIUM and explicitly assigned a separate commit after D1–D3. The runner's magic-wand request is a capability-aware review surface that can provide diff, health and validated report output without forbidden shell/writes; the prime owns that harness item.

### Prerequisite gate fix — literal means text

The FlowSpace failures reproduced in isolation (30s cold timeout; 5,051ms warm query). Installed fs2 source confirmed AUTO chooses SEMANTIC for these plain names when embeddings exist. The client now maps `grep` to explicit `text`, with an in-memory MCP wire regression; semantic mode is unchanged. Neither deadline nor timing assertion was changed.

**RAN after the fix:** all 9 client unit tests passed; both real integration tests passed. Cold startup **12,307ms**, first text search **1,487ms** (**13,798ms** test total); warm text search **167ms**. Full-gate re-run follows. This is a caller-intent bug fix, not a timeout waiver: **fs2 is retired (Jordan, 2026-09-03); moving the client to flowspace3 is a separate plan**. Publication order is gate-fix, D1–D3, then authoritative workspace containment.

**Full re-run RAN:** `just fft`, **435.40s**, all **4,008 output lines** read. Lint/format **1,804 files**, production build and all **nine** workspace typechecks passed. Tests **547 files / 7,367 passed**, **8 files / 63 skipped**, zero failures. Real FlowSpace integration: cold test **8,179ms**, warm text **163ms**. Exit 1 **only** at the unchanged **124-advisory audit (6 critical, 41 high, 68 moderate, 9 low)** under the standing acknowledged exception; not claimed as an all-green audit.

Gate-fix published as **3650a9619** (`63446a029..3650a9619` on origin/main), three files, +12/-3, with the required fs2-retired/separate-flowspace3-plan commit-body caveat. D1–D3 remains separate; no containment source change is included.

**D1–D3 precommit re-run RAN:** `just fft` after the gate-fix commit, **435.04s**, all **4,008 lines** read. Again **547 files / 7,367 tests passed**, **63 skipped**, all nine typechecks and lint passed; build succeeded from cache. Only the same 124-advisory audit failed under the standing exception. No containment changes are part of this revision.

D1–D3 published separately as **78f659c20** (`3650a9619..78f659c20`), 16 files, +517/-67. The following containment change is not folded into that commit.

## Authoritative workspace containment — separate correction

Prime ruling: caller-controlled `workspace=/` is a real MEDIUM containment gap in this bootstrap-authenticated single-operator application. Focus must validate scope against the app's registered workspaces, not trust the query as authority.

- The handler requires injected `IWorkspaceService` reads, with the production POST using the existing bootstrap container. Exact normalized roots from `list()` are the fast path; otherwise context lookup identifies the owner and `getInfo()` supplies the authoritative exact worktree inventory. Cwd/git-family containment and all process/pane guards then use that authoritative root unchanged.
- Unregistered/relative/descendant scope → **400 `unregistered-workspace`**, before any seat or process read. Registry/owner/inventory errors → **503 `workspace-unreadable`**. Registration is checked afresh on each click.
- Review exposed two resolver compatibility cases: first-containing context is not exact nested-worktree discovery, and stored registered roots may retain a trailing slash. Exact normalized registry/inventory lookup covers both without changing the shared resolver or allowing arbitrary descendants.
- **RAN:** **117 tests / 3 files** passed (focus 82, rendered-focus 13, fence 22), including root refusal, registered roots, trailing-slash roots, sibling/nested worktrees, authoritative-root precedence, invalid descendants, removal between clicks, and read failures.
- **Actual browser/API RAN on final source:** `workspace=/` and the unregistered `<main>/src` descendant both returned **400 `unregistered-workspace`**. Registered main root and registered repo's `chainglass-093-review` worktree scope both returned **200 `{focused:"@8"}`** for silkworm. No HTTP response fixtures were used. The real rail button also focused silkworm; `tmux display-message` confirmed **`@8 1`** (window selected).
- **Own hierarchy RAN:** the rendered silkworm button is inside section **`pij-lonely-antelope and descendants`** at **`data-depth="1"`**. This confirms the earlier own-seat registration in the actual surface, without inferring a role.
- No daemon/dev-server restart or unrelated-seat registration was performed.
- **Final source review:** no material findings (confidence 0.94). The critic re-read the applied normalized registry lookup and exact worktree inventory branch, closing both compatibility findings; no commands were run by the critic. The owned browser tab was released after live proof.
- **Final precommit gate RAN:** `just fft`, **446.14s**, all **3,977 output lines** read. Lint/format **1,804 files**, production build and all **nine** typechecks passed; **547 files / 7,386 tests passed**, **8 files / 63 tests skipped**, zero test failures. Real FlowSpace integration still passed its unchanged deadlines (cold test **17,673ms**, warm text **160ms**). Exit 1 only at the same **124-advisory audit**, under the standing acknowledged exception. No suppressed checks, skipped new tests, or changed timing assertions.
