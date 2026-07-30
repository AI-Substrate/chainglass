# Research Dossier: pij rail v2 — left-rail now/next fleet view + the pij-side companion plan

**Generated**: 2026-07-29T10:15+10:00
**Query**: "pij rail v2: left-rail now/next fleet view (CG plan) + cohesive pij-side plan for wee-albatross; explore existing 089 surfaces to reuse/retire, the joint contracts (status kind, question text, role), and the two-repo plan split"
**Effort**: Standard (2 workers + session-held measurements)
**Tools**: Standard
**Evidence**: 10 current sources · 4 historical sources

## The Ask

Jordan judged the shipped plan-089 pij observatory "accurate but not useful" and redirected: the pij view moves into the left rail (sharing the file-tree slot), organised prime → PM → workers, where PMs carry a two-sentence **now/next** status and seats waiting on a human are pinned in a NEEDS-YOU strip. Clicking a seat focuses its tmux pane; scope is this project, resolved to main when the workspace is a worktree. This plan (090) is the chainglass half, built in main; a **cohesive sibling plan** will be built by the pij repo's o-prime (pij-wee-albatross) in a worktree, but only briefed once this plan has its feet on the ground. The direction, AC split, and approved mockup already exist (`docs/plans/089-first-class-pij/v2-enhancements.md`, `scratch/pij-rail-mock.html`); this dossier grounds the *implementation* questions.

## Answer

1. The 089 feature is already the right shape for reuse: one data hook (`usePijFleet`) + one pure view (`FleetView`) behind three retirable shells (overlay panel, overlay wrapper, overlay provider). The rail rebuild is mostly new *placement* plus a denser view, not a new data layer.
2. The left rail has a first-class tab mechanism (`PanelMode = 'tree' | 'changes' | 'sessions'`) — adding `'pij'` is a small, pattern-following change, but the tab content record is duplicated in two places (desktop + mobile) and the panel header has no per-mode title/actions yet.
3. Worktree→main resolution is a data-threading fix, not a git problem: the main checkout path already exists server-side (`WorkspaceInfo.path`); the client just never receives it. One trap: `getMainRepoPath()` is misnamed (returns the *current* worktree's root) and must not be used.
4. New pij reads (spine status events, per-PM) slot into the existing poller as an on-demand method shaped like `refreshFlows()`, emitting a new member of the existing `pij` channel's event union — never a new SSE channel (membership is load-bearing on leader identity) and never a new polling loop.
5. The pij-side asks are small and already scoped in v2-enhancements.md §B: one-call `pij status` sugar over the existing spine envelope (`prev`/`next` fields exist; CLI flags don't), persist the needs-human question label the daemon already extracts, prime-only sweep-adopt, role-in-record, `--note` on attention states, PM-targeted watchdog nudge. The joint contracts (status field shape, role carrier, question-text carrier) are the coupling surface between the two plans — they must be sketched before either side codes.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | The rail's tab mechanism exists: `PanelMode = 'tree' \| 'changes' \| 'sessions'`, rendered by `LeftPanel`/`PanelHeader` with a `children[mode]` record | `panel-layout/types.ts:9`, `left-panel.tsx:45-59`, `panel-header.tsx:50` | A `'pij'` tab is additive: extend the union, the modes array (`041-file-browser/hooks/use-panel-state.ts:113-118`), and the URL literal union (`041-file-browser/params/file-browser.params.ts:27`) | High |
| F-02 | The `children` record is **duplicated** — desktop and mobile render separate `<LeftPanel>` trees | `browser/browser-client.tsx:1083-1160` (mobile) and `:1483-1560` (desktop) | Insert the pij tab in BOTH or it silently vanishes on one surface; extracting a shared `leftPanelChildren` first is the cheaper move | High |
| F-03 | `PanelHeader` has no per-mode title/actions — a pij tab inherits "FILES" + the tree's Refresh; panel width is a hardcoded 280px native-resize div, no persisted width | `panel-header.tsx:28-35`, `left-panel.tsx:46-58`, `panel-shell.tsx:82-85` | The rail view must fit ~280px dense (mock already designs for this); `LeftPanel` needs a small per-mode title/actions override | High |
| F-04 | `handlePanelModeChange` hardcodes a two-way toast (`'tree' ? 'Tree view' : 'Changes view'`) | `041-file-browser/hooks/use-panel-state.ts:82-88` | Will mislabel a third mode — fix as part of the tab work | Medium |
| F-05 | 089 reuse/retire split: `usePijFleet` + `FleetView` + focus route + API routes **reuse**; overlay panel/wrapper/provider **retire**; `/pij` global page (no SSE by design) and workspace `/pij` page kept | worker inventory table; `use-pij-fleet.ts:169`, `fleet-view.tsx:59`, `pij-overlay-panel.tsx:91`, `app/(dashboard)/workspaces/[slug]/layout.tsx:107` | The rail consumes the same data layer; the deliverable is a denser rail-fit view (mock is the contract), not new plumbing | High |
| F-06 | `pij:toggle` is one seam with three dispatchers (explorer button, sidebar button, SDK command `pij.toggleOverlay` / `$mod+Shift+KeyF`) | `use-pij-overlay.tsx:104`, `sdk/register.ts:24`, `explorer-panel.tsx:530`, `dashboard-sidebar.tsx:349` | Repoint the listener (open rail tab instead of overlay) and all three triggers follow; a partial retire double-fires against `overlay:close-all` | High |
| F-07 | Poller = 2s fast spine-cursor loop + 8s slow `list --json --badge` loop, single egress `broadcast(PIJ_CHANNEL, …)`; `refreshFlows()` is the precedent for an on-demand, change-signature-gated read | `pij-poller.service.ts:42,45,233,277,283,301,303` | Per-PM status reads (`spine events --peer`) follow the `refreshFlows` shape + a new `PijChannelEvent` member (`types.ts:150`) — no third loop (process cost ~0.45s/call was deliberately capped) | High |
| F-08 | No channel-count wall (7/20 used) but channel membership is load-bearing on leader identity; `/pij` global page is deliberately SSE-free | `app/api/events/mux/route.ts:48`, workspace layout `:34-45`, `adr-0015…md:81` | Extend the `pij` channel's union; never add a channel for this | High |
| F-09 | Main-checkout path exists server-side (`WorkspaceInfo.path`, `worktreePath`, `isMainWorktree` are modelled) but pages pass only `worktreePath` to the client; **zero** readers of `--git-common-dir` in the repo; `getMainRepoPath()` is misnamed (`--show-toplevel` = current worktree, no non-test callers) | `workspace-context.interface.ts:86-125`, `browser/page.tsx:49-50`, `pij/page.tsx:41`, `git-worktree.resolver.ts:97,123-140` | Worktree→main = thread `mainPath` (= `info.path`) through the page props; never call `getMainRepoPath()` for this | High |
| F-10 | pij-side surface (measured live this session): semantic states incl. `blocked`/`question` are ruled words (`types.ts:99`); badge is worst-first over both axes (`state.ts:125`); spine envelope has free `prev`/`next` strings but `spine append` doesn't expose them (`cli.ts:693`); daemon extracts the needs-human question label then drops it (`daemon/loop.ts:262-272`); node card has **no role field**; `pij list` is hot-tier (215/234 flat/4,037 archived) | pij repo `.pi/extensions/pij/core/*` (read-only), session measurements 2026-07-29 | The pij plan's items are: `status` one-call verb, persist question label, `--note` on attention states, role carrier, sweep-adopt (prime-only notify), watchdog nudge; storage rides existing envelopes | High |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | v2 direction, 16-AC owner map (CG/PIJ/JOINT), and all session rulings (one-call status; PM-only periodic status; q = question not queue; blocked vs question semantics; prime-only sweep-adopt notify) | `docs/plans/089-first-class-pij/v2-enhancements.md` | Direct | This is the business source for the plan's spec half; the mockup `scratch/pij-rail-mock.html` is the layout contract |
| H-02 | One SSE connection per tab via mux; channel membership rotates lock+BroadcastChannel+URL together | `docs/adr/adr-0015-leader-elected-multiplexed-sse.md` | Direct | Reinforces F-08: extend the union, never split channels; escalate instead |
| H-03 | 089 doctrine: verbatim consumption (AC-03), designed absence states (N states → N test-ids), read-only CLI fence, C-06 focus-on-human-click | `docs/plans/089-first-class-pij/first-class-pij-plan.md` + phase dossiers | Direct | All carry into v2 unchanged; the rail adds new absence states (no status yet / stale / not-a-PM) |
| H-04 | Membership bug lineage: the tree (with `--all`) decides workspace membership, not path containment; dead worktree seats vanish without `--all` | 089 post-plan fixes `e0cf63f9f`, `4626117ec` | Direct | The rail's prime→PM→worker grouping must come from the tree; orphan rendering remains a designed transitional state until pij's sweep-adopt lands |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| Joint contracts unruled: status event field shape, role carrier, question-text carrier | v2-enhancements §B, F-10 | The CG rail renders these; coding against a guessed shape re-runs the 089 `folder`-vs-`cwd` trap | Sketch the three contracts in the plan; CG builds behind fakes; contracts ratified in the albatross brief before pij codes |
| Two-plan cohesion (CG in main, pij in a worktree) | original-ask | Divergence between the plans re-creates the harness/pij half-shipped design failure (the `HARNESS_PLAN_ID` lesson) | The joint-contract section of THIS plan is the single interface; albatross's plan consumes it verbatim |
| Overlay/page retirement not yet ruled by Jordan | 089 open question; F-05, F-06 | Determines whether `pij:toggle` repoints to the rail tab or keeps the overlay as a second surface | Decision required at plan time (open question below) |
| Status staleness threshold + PM-click behaviour (focus vs expand) | mock + 089 open questions | Small but user-visible; watchdog nudge threshold couples to pij's side | Jordan rules at plan/workshop time |

## Planning Handoff

- **Preserve**: the read-only CLI fence (`PIJ_READ_VERBS` — `spine` already allowlisted); AC-03 verbatim consumption; C-06 human-click-only focus; ADR-0015 one-channel doctrine; tree-decides-membership with `--all` (H-04); designed absence states; instrument-window labelling (hot tier ≠ census).
- **Change carefully**: `browser-client.tsx` duplicated children records (F-02 — extract first); `use-pij-overlay.tsx` listener repoint (F-06 — three triggers + AC-12 test move together); `use-panel-state.ts` mode toast (F-04).
- **Likely files/symbols**: `panel-layout/types.ts` (`PanelMode`), `use-panel-state.ts`, `file-browser.params.ts`, `browser-client.tsx`, `left-panel.tsx`/`panel-header.tsx` (per-mode title/actions), new rail view component (dense variant consuming `usePijFleet` data), `pij-poller.service.ts` + `pij-records.ts` (`spine events --peer` via existing fence), `types.ts` `PijChannelEvent` union, `browser/page.tsx` (+`mainPath` threading), retirements per F-05.
- **Decisions still required**: overlay + `/pij` page fate; status staleness threshold; PM-row click semantics; whether the rail ships behind faked status events until pij's `status` verb lands (recommended); the three joint-contract shapes (proposed in plan → ratified with albatross).
