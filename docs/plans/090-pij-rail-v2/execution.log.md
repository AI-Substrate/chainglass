# Plan 090 Execution Log

## T001 — Shared left-panel children

- Extracted the duplicated tree/changes child record in `browser-client.tsx` into one `leftPanelChildren` value consumed by both mobile and desktop `LeftPanel` instances.
- Evidence: targeted browser-client suite passed, 3 files / 11 tests, exit code 0.

## T002 — PIJ panel mode

- Added `pij` to the panel-mode and URL contracts, exposed it on both git and non-git browser rails, and changed the mode toast to emit `PIJ`.
- Evidence: targeted params, hook, and panel suites passed, 3 files / 18 tests, exit code 0.

## T003 — Per-mode panel header

- Added optional per-mode header configuration to `LeftPanel`; the browser PIJ mode now has a PIJ title and separately wired refresh action while tree and terminal sessions retain the default Files header contract.
- Evidence: panel layout suites passed, 2 files / 17 tests, exit code 0.

## T004 — RED JC-1 status contract

- Added tests pinning newest-by-`seq`, the exact 30-minute threshold edge, stale-text retention, and all four status absence discriminators.
- RED evidence: suite failed because `pij-status.contract.ts` did not exist, exit code 1.

## T005 — JC-1/2/3 contract seam

- Added consumed-field types and pure readers for PM status, projected orchestration role, declared notes, daemon D0/D1, and the declared-only empty strip.
- Added contract-valid fake generators, including fake-only tree-depth roles, the older-pij missing-role fixture, 280-character status boundaries, all seven JC-3 decisions, and swappable seam interfaces.
- Evidence: T004 plus seam-swap suites passed, 2 files / 16 tests, exit code 0.

## T006 — RED fast-drain status emission

- Extended the existing poller suite to require status recognition outside the known-fleet guard, newest-`seq` coalescing, one broadcast per event type, unchanged two-loop registration, and zero extra CLI reads.
- RED evidence: the poller emitted no `status-delta`, 1 expected / 0 observed, exit code 1.

## T007 — Fast-drain status deltas

- Added `status-delta` to the existing `pij` channel union and collected `kind:"status"` events before the known-seat guard.
- Coalesced newest status per peer, retained the map for cold snapshots, scoped snapshot statuses through known workspace rows, and kept the existing two loops and single broadcast egress.
- Evidence: poller and route suites passed, 2 files / 45 tests, exit code 0.

## T008 — RED status hook

- Added hook tests for snapshot hydration, producer-clock age, newest-`seq` channel updates, and the named threshold.
- RED evidence: suite failed because `use-pij-status.ts` did not exist, exit code 1.

## T009 — Live status hook

- Added `usePijStatus`, hydrating from the fleet snapshot and consuming `status-delta` through the existing multiplexed channel subscription with newest-`seq` replacement.
- Exposed cold-start statuses from `usePijFleet`; age and absence decisions remain delegated to the pure JC-1 contract reader.
- Evidence: fleet and status hook suites passed, 2 files / 28 tests, exit code 0.

## T009a — RED role-aware rail grouping

- Added tests requiring tree-owned nesting, JC-2-only role labels, honest absent-role states, and fake-seam role pass-through.
- RED evidence: all three tests failed because `groupRailFleet` did not exist, exit code 1.

## Gate repair — legacy fleet snapshots

- Root cause: T007 made `statuses` required in the new fleet payload, while `usePijFleet` assigned the field directly. A pre-JC-1 snapshot therefore wrote `undefined` into the hook result instead of preserving the additive-contract absence as an empty collection.
- Changed snapshot hydration to `snapshot.data.statuses ?? []` and added a regression proving legacy snapshots retain all fleet rows and expose `statuses: []`.
- The overlay failures had a separate root cause: static `2026-07-26` `lastEventAt` fixtures crossed the ruled 48-hour idle window on `2026-07-29`, so grouping correctly hid every seat. Added an injected overlay clock and kept fixture ages relative to the controlled `UI_NOW`, removing the calendar time bomb.

## T009b — Role-aware rail grouping

- Promoted the JC-2 projected role while preserving missing-key versus present-null absence.
- Added `groupRailFleet`, which reuses `groupFleet` for all structure and annotates placements only through `readSeatRole`; prime/lead tree positions never become roles.
- Evidence: grouping, join, fleet-view, legacy snapshot, and overlay gate suites passed, 5 files / 86 tests, exit code 0.

## Chunk-2 rework — wired contract seam and bounded status cache

- Expanded the JC adapter to own status event parsing, newest selection, status resolution, role reading, and question reading.
- Wired the real hook, rail grouping, and poller through an injected `PijRailContractSeams`, defaulting centrally to `productionContractSeams`; no consumer imports the concrete readers directly.
- Replaced the local-helper seam assertion with tests that run the actual hook, grouping function, and poller against swapped adapters. A separate mutation assertion breaks every fake method while the production adapter continues unchanged.
- Bounded the status cache to the hot fleet: snapshots filter statuses to current fleet rows and each successful slow refresh evicts peers absent from the new hot list.
- Evidence: seam, hook, grouping, and poller suites passed, 4 files / 43 tests, exit code 0.

## Chunk-2 rework — live status adapter path

- Removed the hook's remaining local sequence policy: both snapshot reconciliation and live-delta coalescing now pass through the injected `status.newestByPeer` seam.
- Added a swapped-adapter regression where the adapter deliberately selects a lower-sequence live delta, proving the channel path flips without consumer changes.
- Evidence: status hook suite passed, 1 file / 4 tests, exit code 0.

## T010 — PIJ rail view

- Added the mock-shaped rail roster with tree-owned prime/team structure, contract-backed roles, PM NOW/NEXT status and age, worker task/worktree/state rows, inline blocked notes, and the declared-question strip.
- Added distinct status absence testids for `not-a-pm`, `role-unknown`, `no-status-yet`, and `status-stale`; stale status retains its text.
- Counts explicitly name the hot window, and long fields use truncation without fixed-width or `whitespace-nowrap` overflow classes.
- Evidence: rail view suite passed, 1 file / 4 tests, exit code 0.

## T011 — Rail seat focus

- Wrapped the rail with the existing `SeatFocusProvider`; prime, team-lead, and worker rows reach the single audited focus callback only from their click handlers.
- Extracted the existing focus affordance/result rendering for reuse, preserving containment-disabled rows and verbatim route refusal reasons.
- Evidence: rail and focus suites passed, 2 files / 17 tests, exit code 0.

## T012 — Main-checkout rail scope

- Threaded `WorkspaceInfo.path` from the browser server component through `BrowserClient` into the rail panel; the active worktree path remains a display-only scope annotation.
- The rail's fleet/tree/flow hook is scoped with the threaded main path and shows `⑂ <worktree> → main` when the browser is in a worktree.
- `getMainRepoPath` remains unused; no caller was added.
- Evidence: rail and focus suites passed, 2 files / 18 tests, exit code 0.

## T013 — Toggle repoint and overlay retirement

- Replaced the overlay provider/panel/wrapper with one workspace-level `PijRailToggleListener`.
- On `/browser`, `pij:toggle` preserves the active query and sets `panel=pij`; from every other workspace route it navigates to `/workspaces/<slug>/browser?panel=pij`. Repeated opens on the active PIJ rail are no-ops.
- Explorer, sidebar, SDK command, and keybinding retain the shared event seam; the SDK command id remains stable while its title/category now describe rail navigation.
- Deleted the overlay component, provider hook, wrapper, and overlay suite. No overlay imports or `overlay:close-all` PIJ path remain; `WORKSPACE_SSE_CHANNELS` is unchanged with `'pij'` present.
- Evidence: rail, focus, toggle, SDK, page-wiring, params, and panel-state suites passed, 7 files / 50 tests, exit code 0.

## Chunk-3 typecheck repair

- The full typecheck exposed one older `FleetSnapshotData` fixture in `flows-tab.test.tsx` that had not adopted the additive `statuses` field. Added `statuses: []` to the fixture.
- Evidence: `just typecheck` passed across all workspace and test tsconfigs, exit code 0; flows-tab suite passed, 1 file / 16 tests, exit code 0.

## Chunk-3 review rework

- Made every NEEDS-YOU pin a human-click focus action through the existing `SeatFocusProvider`; refusal observations render beside the pin through the shared focus-result component.
- Removed JC-1 `status.project` from the render path. The PM project label now comes only from the fleet/tree placement carrier, and a regression asserts a status-event project string is not rendered.
- Added the WS-003 aged-question variant: questions older than `QUESTION_AGED_MS` remain pinned and counted, carry `data-aged="true"`, and render an emphasised `asked <age>` label.
- Applied Biome's safe fixes across the Plan 090 PIJ surfaces, including the poller import organization, then resolved the remaining exhaustive-dependency and legacy-fixture lint findings.
- Evidence: contract/focus rework suites passed, 5 files / 60 tests, exit code 0; `pnpm lint` passed, exit code 0; `just typecheck` passed, exit code 0.
