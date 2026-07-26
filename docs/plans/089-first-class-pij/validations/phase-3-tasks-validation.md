# Validation Record — Phase 3 tasks dossier

**Target**: `docs/plans/089-first-class-pij/tasks/phase-3-flow-phase-view/tasks.md`
**Date**: 2026-07-26 · **Mode**: lead + 2 opus critics (Jordan's standing order) · **Verdict**: ✅ **VALIDATED WITH FIXES**
(Operational note: both critics 529'd three times on server overload before completing on the fourth launch.)

## Contract
- **Purpose/Promise**: a coder following only this dossier + referenced files produces Phase 3 (plan tasks 3.1–3.5, AC-06/AC-07, C-02/C-04/C-09) without clarification.
- **Proof target**: Contract. **Upstream**: plan v1.1.0 § Phase 3 + Coverage Map. **Consumers**: coder (nigel), cross-model reviewer (terra).

## Findings (verified by lead, fixed in-target)

| Sev | Finding | Evidence | Fix applied |
|---|---|---|---|
| CRITICAL | T002's "absolute counter" cursor is underivable inside the hook — the shared `useChannelEvents` trims silently and returns no count; dossier simultaneously declared `_lib/sse` unchanged | `use-channel-events.ts:46-64` (both critics independently) | Pre-Impl Check + T002 rescoped: additive `receivedCount` on the shared hook, consumers proven unbroken (they destructure `{messages}` only); "_lib/sse unchanged" line corrected |
| CRITICAL | Watcher's workspace enumeration undefined — three materially different designs satisfied T005 as written | `start-pij-poller.ts` has no workspace notion; enumeration only exists request-scoped in `pij/page.tsx` | T005 names the source: `IWorkspaceService.list()` at bootstrap + lazy watch-once registration on unwatched `/api/pij/flow` roots (covers `?worktree=`) |
| HIGH | Done When written against a phantom `'rename'` event — `FileWatcherEvent` has none; macOS atomic replace fires `'add'`+`'change'`, and a fake emitting 'rename' would green-test dead production code | `file-watcher.interface.ts:19`, `native-file-watcher.adapter.ts:186-194` (both critics) | T005 + sequence diagram restated in contract terms; existing `FakeFileWatcher` (`simulateAdd/simulateChange`) mandated; `FileWatcherOptions.atomic` decision pinned |
| HIGH | Foreign flow rejects routed into `filteredOut`, which the Fleet tab renders as a claim about SEAT updates — would make the honesty counter lie | `fleet-view.tsx:108-114` renders the scalar with seat wording | T002/T001: separate `flowsFilteredOut`, rendered on the Flows tab with flow wording; fleet counter asserted unchanged by flow rejects |
| MEDIUM | T007 histogram unfalsifiable (no expected counts) and the "never `harness flow list`" prohibition absent from dossier text | plan:266; critic measured true current histogram 83/2/1 across 86 dirs | T007: expected 83/2/1 pinned, `IFlowReader.scan` mandated, `harness flow list` banned in-dossier with the why |
| MEDIUM | AC-06 wording invited misreading rv4* as reviews of ph6 | fixture: rv4/rv4b/rv4c all `branch_of: ph4` | T004 Done When names the trap explicitly |
| — (disproven) | Specialist claimed `tsconfig.test.json` untracked | Lead: `git ls-files` shows it, committed `4f81a60b8`, no diff vs HEAD — the probe ran against the wrong tree; a false absence claim, dropped | No change (a transient warning added on the claim was reverted) |

Also from verification, folded in as improvements: T006 now prefers NO exclusion (factory-injected code may carry no `watch(` token past `toCode()`'s stripping) with the companion assertion either way; recursive tree-watching capability and `@chainglass/workflow` dependency confirmed; 10 fixtures exist (2 undocumented extras: `no-bag`, `tombstone`).

## Reverification
All fixes are in-target document edits uniquely determined by critic-quoted source; the specialist's independent line-level verification (every other dossier claim exact — drop point line 331, signature format, fence lines/regex verbatim, 088 fixture shape, dashboard baseline 3 re-run) is the reverification basis.

**Thesis**: advanced — validation caught an unimplementable prerequisite, an undefined enumeration source, and a phantom-event spec that would have shipped a green-tested dead watcher.
**Consumers**: 2/2 satisfied.
**Open decisions**: none for this phase (role-chip ack and AC-01 browser probe ride from P2).
