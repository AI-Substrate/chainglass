# Research Dossier: First-class pij support in the chainglass UI

**Generated**: 2026-07-26T05:55:00Z
**Query**: "explore — first-class pij support in the chainglass UI (new plan; discovery material already exists in scratch/pij-firstclass-*.md)"
**Effort**: Standard
**Tools**: Mixed (FlowSpace + standard; plus live CLI probes against the pij store and harness binary)
**Evidence**: 14 current sources · 6 historical sources

## The Ask

Jordan named a workstream: chainglass (this repo's Next.js web UI) should display the pij agent-orchestration platform first-class — fleet/tree views of agent seats, per-project work state, and the /builder flow's phase progress — plus, later, actions like Q&A. This dossier packages a full discovery phase (run as pij stream `first-class-pij-support-in-the-chainglass-ui`, 2026-07-26) into a decision packet for the plan stage: what surfaces exist on both sides, which contracts were ruled for us, what Jordan has already decided, and what remains open. The primary discovery artifacts live in `scratch/pij-firstclass-*.md` and two ruled contract documents in peer repos; this dossier links rather than restates them.

## Answer

1. **Both data sides are contract-backed and read-only for us.** pij: spine event log via file cursor (chainglass is a *named consumer*, ruled path-stable), records via CLI `--json` at slow cadence. Builder flows: `docs/plans/*/the-flow.json` read directly (file-watching is the *intended* pattern there), bound to a ruled safe subset with chainglass registered as a named consumer.
2. **The delivery shape is settled and already built chainglass-side**: one server-side poller (spine cursor 1–2s + slow descriptor/freshness loop 5–10s, system-state filtered ~100:1 before fan-out) → `sseManager.broadcast` channels → the leader-elected mux SSE (ADR-0015) → `useChannelEvents`. Every piece except the poller exists.
3. **Jordan's rulings**: default lens = current repo/workspace; global prime-rooted tree view also wanted (POC designs first); read-only v1 with actions (Q&A) later; bones-first standalone feature; hot tier + <2d idle only; pop-over panel (064-style, header button) plus probably a full page — panel-vs-page split unresolved.
4. **The seat-activity half of the flow view does not exist in flow data** — no agent dimension at all; v1 renders *phase activations* (from `cursor-moved` events) + pij-side seat activity, joined by convention until PR 81 (`HARNESS_PLAN_ID` stamping, merge ordered) and the assignment `--flow` pointer (accepted by dove, automated-not-exhorted) land.
5. **Three named principles govern every view** (each ruled after a real near-miss this cycle): *observer-perturbs-instrument* (a browser tmux attach would reflow panes and corrupt the daemon's own busy-detection); *the inverted instrument* (a correctly-silent terminal seat reads as broken to the stall detector); *split the observable rather than pick a default* (ruled 3× in one day: `paneObservation`, `expired` surfacing, flow absence).
6. **Hard prohibitions are enumerated and final**: four forbidden affordances (no close/--force, no daemon restart, no keystrokes, no auto-refreshing pane content); tmux untouchable from the UI (pixel-stream via 088 is the safe live-view); no stalled badge (`stalled` is two mechanisms in one string today); anomalies advisory-only; never render intention as fact (pinned vs observed provenance in UI copy).

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | Discovery report: option space, six Jordan questions, store scale (179 hot seats, 135KB list; repo tree 7KB vs 100KB global; archive 1,988 vs 196 hot) | `scratch/pij-firstclass-discovery.md` | Scoping solved (repo-scope default); archive excluded from v1 per Q5 ruling | High |
| F-02 | Q3 ruled: spine `~/.pij/spine/` is path-stable, chainglass a named consumer; record paths NOT stable → CLI; tearing does not exist for readers; measured CLI poll 0.42–0.48s vs <10ms file tail | `scratch/pij-firstclass-q3-memo.md`; pij commit `861ed1e` ("Path stability" § in `pij-platform.md`) | Hybrid binding is the documented answer; poller reads spine by file, records by CLI | High |
| F-03 | pij on-disk contract: badge derivation (worst-first), effective parent, three axes, done-is-a-claim, ruled vocabularies | `/Users/jordanknight/pi-hacking/pij/docs/how/pij-platform.md` | Derivations we take from CLI, never re-implement | High |
| F-04 | pij consumer guidance: two stores (registry vs spine), join on pij id; polling cadences; danger list | `/Users/jordanknight/pi-hacking/pij/docs/how/pij-for-ui-consumers.md` | The structural spine of every view: join registry+spine; two loops mandatory (transitions on spine, freshness/gauges not) | High |
| F-05 | Mux SSE: one leader-elected connection/browser, `channels` param (cap 20), auth-gated; client `subscribe`/`useChannelEvents` | `docs/adr/adr-0015-leader-elected-multiplexed-sse.md`; `apps/web/app/api/events/mux/route.ts:44`; `apps/web/src/lib/sse/use-channel-events.ts:17` | pij needs 1–2 channels; zero new transport work | High |
| F-06 | Server bootstrap pattern: HMR-safe global-flag singletons in `instrumentation.ts` (3 precedents); adapters broadcast via `sseManager.broadcast(channel, eventType, data)` | `apps/web/instrumentation.ts:33`; `apps/web/src/features/027-central-notify-events/start-central-notifications.ts:89` | The pij poller service slots in as a fourth singleton, 027-style | High |
| F-07 | needs-human contract ruled: seat-level `paneObservation`; `since` + `observationGaps[]`; cleared-causes `prompt-gone`/`seat-dead`(corroboration ladder, 4th cannot-confirm outcome)/`superseded`; `answered` only via attributable channel; kind-chip only, no excerpt, no answered-by, out of badge | `scratch/pij-firstclass-needs-human-contract.md` + dove's acceptance (relayed rulings, 2026-07-26; dove writing into pij `docs/how/`) | The "needs me" queue view binds to this shape when dove ships the field | High |
| F-08 | ask/answer verbs ruled: terminals `answered·dismissed·expired·seat-died-holding-it`; clarification = in-thread transition; counts derive from THREADS; `expired` carries surfacing separately; `ask` implies `question` state; flow pointer = pointer-as-claim verified at read time; `--flow` automated not exhorted | dove rulings relayed 2026-07-26 (this session); prior art `packages/shared/src/question-popper/types.ts:19`, `schemas.ts:17` | Q&A view (later, actions-phase) designs against threads from line one; 067 supplies the answer-type vocabulary | High |
| F-09 | Flow JSON contract: safe subset ruled; **no seat/agent dimension exists** (`agents[]` unpopulated, `harness flow agent` verb unbuilt); five absence states (live/legacy-E308/untracked/not-started/corrupt); completion = `nav.bag.status` never file set; file-watch intended (atomic replace → watch rename; .json only); filter `type=="phase"` never id patterns; reviews may be excursions; schema unenforced on mutation | `/Users/jordanknight/substrate/harness-engineering/scratch/flow-answers-for-chainglass-ui.md` (+ `flow-ui-dossier.md` — field-by-field, 9 gotchas, queued for design) | Phase view is fully buildable; seat column is *phase activations* only, labelled as such | High |
| F-10 | Flow coverage here: 3 of 85 plan dirs (085, 086 legacy-E308; 088 live and in_progress) | probe 2026-07-26; `docs/plans/088-remote-app-view/the-flow.json` | Empty state is the primary surface — designed first-class, five distinct renderings | High |
| F-11 | PR 81 (harness): `HARNESS_PLAN_ID` → `provenance.plan_id` fallback restored (env-only stamped; `--plan-id` wins; blank → null); `HARNESS_AGENT` stays refused (plan-026 HIGH: carries model name); contract § Provenance in `docs/how/harness-flow.md`; merge+deploy ordered by Jordan | meadowlark confirmation (relayed, 2026-07-26); `AI-Substrate/harness-engineering#81`, commit `853525e3` | pij exports the var at spawn → flows self-label; join becomes bidirectional with F-08's `--flow` pointer | High |
| F-12 | File-reader hazards (the real ones): tier-migration `renameSync` to `~/.pij/archive/` at 48h (vanish ≠ delete); stranded `*.tmp-<pid>-<uuid>` files in scans (one 8-day-old on this host) | pij `pij-platform.md` § Path stability (commit `861ed1e`); host probe | Poller/scanner code handles both from day one | High |
| F-13 | Workspace join key: workspace = slug + absolute `path`; pij descriptors carry `folder` | `packages/shared/src/interfaces/results/workspace.types.ts:21`; `pij list --json` row shape | Repo-scoped lens = filter seats by `folder` under workspace path | High |
| F-14 | 064-terminal overlay pattern: fixed right-edge panel, `terminal:toggle` custom event, SDK command + keybinding, `_platform/panel-layout` composition | `apps/web/src/features/064-terminal/domain.md:40` | Jordan's pop-over pij panel is a sibling of this pattern; a 064-style attach pointed at pij panes is FORBIDDEN (see R-01) | High |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | ADR-0007's per-tab SSE hit the 6-connection browser cap at the 6th tab; superseded by leader election | `docs/adr/adr-0015-leader-elected-multiplexed-sse.md#context` | Direct | Never add a second EventSource; join the mux channels |
| H-02 | Central notify architecture: domain adapters → `ICentralEventNotifier` → SSE | `docs/adr/adr-0010-central-domain-event-notification-architecture.md` | Direct | The pij poller emits through the same seam |
| H-03 | 067 question system: 4 answer types, options+default, always-on freeform comment, clarification bounce + chaining, dismissed/expired terminals, respondedBy | `packages/shared/src/question-popper/schemas.ts:17` | Partial (may not reuse the code; the vocabulary is proven) | Q&A UI (actions phase) inherits this feature set; popper integration deferred by Jordan |
| H-04 | node-pty fd leak + PTY teardown discipline (FX001) — sidecar attaches are heavyweight and were hard-won | `apps/web/src/features/064-terminal/domain.md:140` | Direct | Reinforces: no per-seat terminal attaches; pixel-stream (088) is the safe live view |
| H-05 | pij's own lesson: recycled identifiers (pane `%N`, pids) caused three review rounds; single-segment ids broke nine regexes | `pij-for-ui-consumers.md` §1 | Direct | Key rows on pij id only; never pattern-match id shapes |
| H-06 | The operation's instrument doctrine: negative results from broken instruments; prove a gate can fail; 401≠404; null-result looks like clean-result | stream briefs + six recorded instrument errors this cycle | Direct | Applies to the UI itself: every "empty" view must be distinguishable from a broken read |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| `needs-human` field not yet shipped (dove building; contract accepted) | F-07 | The highest-value view ("does this seat need me") can't bind until it lands | Dove notifies on land; v1 ships observables-only, adds the field additively |
| `stalled` string = two mechanisms (working-quiet vs nudge-no-response) until dove's terminal-state fix | roadrunner relay (daemon.ts:734 vs :768) | A stalled badge would be confidently wrong | No stalled rendering in v1; re-evaluate when the derivation-annotated notice ships |
| Anomaly surface has two live defects; finished-and-undeclared (as anomaly kind) inherits them | F-08 relay | Shipping it now inherits a distrusted detector | Gated: not in UI until detectors settle; advisory forever |
| Panel-vs-page split unresolved (Jordan: pop-over yes; full page probable for big tree) | Jordan in-session 2026-07-26 | Decides route structure + `_platform/panel-layout` usage | Jordan rules at design/POC review |
| Tree-rendering approach unchosen ("will look real good using some html lib… POC some designs first") | Jordan in-session | Global prime-rooted tree at 179+ seats needs a deliberate viz choice | Design-phase POCs, per Jordan's explicit ask |
| PR 81 merge+deploy in flight | F-11 | Until live, `provenance.plan_id` stays opportunistic | Meadowlark confirms when landed; no chainglass change either way |
| Mux channel membership rotates lock+BroadcastChannel+URL together (`channelsKey`) | ADR-0015 consequences | Adding the pij channel(s) causes a known transient two-leader window | Expected/self-heals; do not add migration logic |

## Domain Impact

| Domain / boundary | Relationship | Contract or constraint | Evidence |
|-------------------|--------------|------------------------|----------|
| pij store (`~/.pij`) | read-only consumer | spine by file (path-stable, named consumer); records via CLI; never write; vanish≠delete; tmp filtering | F-02, F-12 |
| builder flow files | read-only consumer | safe subset + five absence states; sole-writer fence (with pij-store rule: **one policy**); paths surfaced in docs get machine-owned annotation | F-09, F-10 |
| harness binary | indirect (env var at spawn, pij-side) | harness never learns pij; opaque `HARNESS_PLAN_ID` only; `provenance.agent` never a seat/model | F-11 |
| 027/mux SSE | producer + consumer | new channel(s) through existing `sseManager`; ≤20 channels/connection | F-05, F-06 |
| 064-terminal | hard boundary | never attach to pij panes (resize corrupts daemon's `BUSY_RE` liveness read); `select-window` only ever on direct human click | F-14, F-04 |
| 088-remote-view | potential consumer | pixel stream = the sanctioned live-pane view | F-01 §3-D |
| 067-question-popper | deferred | Jordan: review later; vocabulary reused conceptually in ask/answer | H-03 |

## Planning Handoff

- **Preserve**: the three named principles (observer-perturbs-instrument · inverted instrument · split-the-observable) as design-doc openers; the four forbidden affordances; both sole-writer fences as one policy; hybrid binding (spine file cursor + records CLI); two-loop poller (transitions vs freshness); threads-not-records for any question counts; provenance (pinned vs observed) in UI copy; empty state as primary surface.
- **Change carefully**: `instrumentation.ts` (add 4th singleton — follow the HMR-safe flag idiom exactly); mux channel membership (`channelsKey` rotation consequence); nothing under `~/.pij` or any `the-flow.*` is ever written.
- **Likely files/symbols**: new `apps/web/src/features/089-pij-*/` (bones-first standalone); poller service + 027-style adapter; `sseManager.broadcast` (`apps/web/src/lib/sse-manager.ts:60`); `useChannelEvents`; `_platform/panel-layout` for the overlay panel (064 sibling) + a page route for tree views; join helpers keyed on pij id + workspace `path`↔descriptor `folder`.
- **Decisions still required**: panel-vs-page split (Jordan); tree-viz library/approach via POCs (Jordan review); channel taxonomy (one `pij` channel vs `pij-spine`+`pij-fleet`); v1 view list ordering (phase view vs fleet view first); slug/name for the feature dir.

## External Research

_Omitted — all material questions were answered by the owning authorities (dove for pij, meadowlark for the flow contract) with measured evidence; no standards/library question remains that would change the plan. The tree-viz library choice is a design-phase POC, not a research gap._
