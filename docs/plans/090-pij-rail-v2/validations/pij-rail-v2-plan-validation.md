# Validation Record — pij-rail-v2-plan.md

**Validated**: 2026-07-29 · **Verdict**: NEEDS ATTENTION (4 high, 6 medium)
**Target**: `docs/plans/090-pij-rail-v2/pij-rail-v2-plan.md` (v1.0.0, Simple mode)
**Scope**: adaptive — lead + one independent critic (pij-side contract surface)

## Contract

- **Purpose**: replace the 089 overlay with a left-rail PIJ tab that answers "what am I working on, and who needs me" — Jordan's "accurate but not useful" verdict is the driver.
- **Promise**: a rail view buildable today behind fakes, plus three joint contracts tight enough for the pij repo (wee-albatross) to code against without guessing.
- **Proof target**: Contract (JC-1..3) + Implementation (T001–T014).
- **Upstream**: `089-first-class-pij/v2-enhancements.md` (16 V2-ACs), `090/research-dossier.md` (F-01..F-10, H-01..H-04).
- **Consumers**: the sibling pij plan (albatross) consumes JC-1..3 verbatim.
- **Constraints**: ADR-0015 (one mux channel, membership load-bearing); 089 doctrine (verbatim consumption, designed absence states, read-only CLI fence, C-06 human-click focus); H-04 tree-decides-membership.

## Dossier citations spot-checked — all accurate

F-01 (`panel-layout/types.ts:9`), F-02 (`browser-client.tsx:1084` / `:1484`), F-03, F-04
(`use-panel-state.ts:82-88`), F-06 (three dispatchers: `explorer-panel.tsx:530`,
`dashboard-sidebar.tsx:349`, `sdk/register.ts:24`), F-07 (`pij-poller.service.ts:277`),
F-08 (`layout.tsx:36-45` membership incl. `'pij'`), F-09 (`WorkspaceInfo.path` at
`packages/workflow/src/interfaces/workspace-context.interface.ts:114`; `browser/page.tsx:68-74`
passes only `worktreePath`; `getMainRepoPath` has no non-test callers), F-10 (verified in the pij
source at `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/`). Read-only fence intact:
`PIJ_READ_VERBS` includes `spine` (`pij-records.ts:31`) and `spine events` accepts
`--peer/--json` (`core/cli.ts:694`). ADR-0015 honoured — no membership change.

## Findings

| # | Sev | Finding | Evidence |
|---|-----|---------|----------|
| 1 | HIGH | Overlay retirement makes pij unreachable outside `/browser`, but all three triggers are global; no task specifies navigation | `layout.tsx:109`; `dashboard-shell.tsx:33`; `sdk/register.ts:18-27`; LeftPanel only in `browser-client.tsx:1084,1484` + `terminal-page-client.tsx:121` |
| 2 | HIGH | `refreshStatus()` has no named trigger; signature gating cannot bound per-PM process cost | `flow-watcher.ts:242`; `start-pij-poller.ts:78`; `pij-poller.service.ts:193-227`; F-07 |
| 3 | HIGH | JC-2 collides with an existing `role` field of different semantics | `core/types.ts:12` (`Role = "parent" \| "worker"`), `:166`, `:167` |
| 4 | HIGH | JC-3's premise false — daemon label is a fixed pattern tag, not question text | `core/interstitial.ts:41-49`; `core/daemon/loop.ts:272` |
| 5 | MEDIUM | AC-10 overclaims; no JC-2/JC-3 fake in T005 | plan T005 Done-When; AC-10 |
| 6 | MEDIUM | Domain Manifest omits `layout.tsx`; G7 "manifest covers every task file" false | `layout.tsx:23,109` + `:36-45` |
| 7 | MEDIUM | AC-02 roster uncovered; `lib/fleet-grouping.ts` unlisted; `FleetSection` already infers PM from tree position | `fleet-grouping.ts:39-40,137`; plan Acceptance Coverage Map |
| 8 | MEDIUM | T006 names a non-existent test file (`pij-poller.test.ts`; actual `poller.test.ts`) | `test/unit/web/pij/poller.test.ts` |
| 9 | MEDIUM | Untestable Done-Whens (T010 280px/no-h-scroll; T005 "swappable without touching consumers") | plan Testing Strategy "Excluded: visual pixel testing" |
| 10 | MEDIUM | T003 touches shared `LeftPanel`/`PanelHeader` also rendered by the terminal page; guard names only tree mode | `terminal-page-client.tsx:121-143` |

Full detail relayed with the verdict.

## Resolution — fixes folded in at plan v1.1.0 (2026-07-29, in-target)

| # | Fix applied |
|---|---|
| 1 | AC-08 + T013: off-`/browser` toggles navigate to `/workspaces/<slug>/browser?panel=pij`; three-trigger test covers both cases |
| 2 | AC-09/T006/T007 rewritten: `status-delta` emits from the **existing fast-loop spine-cursor drain** (kind:"status" recognised there); no new read, no per-PM spawn |
| 3 | JC-2 names its carrier: new `orchestrationRole` field; existing `Role` union explicitly not widened |
| 4 | JC-3 split: declared `--note` = the only question-text source; daemon detection = pattern-tag/kind-only fallback; real pane-text persistence marked an explicit stretch ask for albatross |
| 5 | T005 + AC-10: fakes for all three contracts; JC-2 fake may infer from tree depth, labelled fake-only |
| 6 | Manifest + T013: `layout.tsx` listed; Done-When pins `WORKSPACE_SSE_CHANNELS` unchanged with `'pij'` present |
| 7 | New T009a (RED) + T009b: grouping = tree for structure, JC-2 for role; production never consumes tree-lead as "PM"; `fleet-grouping.ts` in manifest. The tree-vs-role contradiction resolved: **tree decides membership + nesting; JC-2 decides labels** |
| 8 | T006 path corrected to `test/unit/web/pij/poller.test.ts` |
| 9 | T010 Done-When → class-based truncation assertions (280px stays Jordan's visual confirm); T005 Done-When → seam-swap test |
| 10 | T003 Done-When covers `'sessions'` mode; terminal page in manifest as regression surface |

Open decision surfaced to Jordan (not blocking): the interim role stance — fake seam infers role from tree depth, production renders role-unknown until JC-2's real field lands.
