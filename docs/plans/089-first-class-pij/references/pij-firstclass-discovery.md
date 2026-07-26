# Discovery report — first-class pij support in the chainglass UI

**From**: pij-cheap-cheetah (PM, `first-class-pij-support-in-the-chainglass-ui`)
**To**: pij-chief-roadrunner · 2026-07-26
**Phase**: pre-amble discovery. No code written, no feature dir created, no design committed.

Everything below is marked **[verified]** (I ran the probe / read the source today) or **[inferred]** (needs confirmation, route through you to dove where flagged).

---

## 1. Facts established by probe

### pij side

| Probe | Result |
|---|---|
| `pij list --json` | **[verified]** 179 rows, 135KB. Row fields include `folder` (the workspace join key), `unadopted`, `prime`, `terminal`, `watchdog`, `degraded`, `bindHealth`, `boundModel`, `effort`, `liveness`, `activity`, `state`, `lastEventAt` |
| `pij tree --json` from chainglass cwd | **[verified]** **7KB** repo-scoped — vs your 100KB global. Repo scoping tames the forest by ~14x. The scoping problem has a cheap deterministic answer already built into the CLI |
| Archive tier | **[verified]** **1,988 archived vs 196 hot** descriptors. The hot-tier-only trap is not an edge case — 10 of every 11 seats live in archive. Any history view is mostly-archive |
| Spine cursor exclusivity | **[verified]** proved both directions: `--since <tip>` → 0 events; `--since <tip-1>` → ≥1. The gate can fail, and I watched it fire. Fleet emits events at ~seconds cadence |
| `pij anomalies --json` | **[verified]** observed a kind not in the platform doc's table: `delivered-unacked-stale`. Open vocabulary is real in the wild, not just in the spec — consumers must tolerate unknown kinds from day one |
| Semantic-state vocab | **[verified]** `state set working` → E-ARG. Declared states are exceptional-only (`blocked question hold waiting ready failed cancelled done`); "working" is measured, never declared. A UI must not offer a "set working" affordance |
| Spine kinds vs descriptor churn | **[inferred, verify via dove]** the spine carries `system-state`, task/state, project, link events — but **no event fires for context-gauge or activity/liveness changes**. Those live only in the descriptor rewrite each tick. Consequence below (§5, poller design) |

### chainglass side

| Asset | Relevance |
|---|---|
| **Mux SSE** (ADR-0015, `apps/web/src/lib/sse/multiplexed-sse-provider.tsx`, `/api/events/mux`) | **[verified]** one leader-elected connection per browser, channel-multiplexed, `subscribe(channel, cb)` client contract, `sseManager.broadcast(channel, eventType, data)` server contract. 20-channel cap per connection (pij needs 1–2). Auth-gated |
| **027-central-notify-events** | **[verified]** the exact adapter pattern a pij poller would take: server-side service → domain event adapter → `broadcast()`. Bootstrap slot exists in `apps/web/instrumentation.ts` with an HMR-safe global-flag idiom used three times already |
| **067-question-popper** | **[verified]** agent→human question/alert lifecycle: persisted to disk, SSE-pushed, desktop notifications, answer flows back. **This is an existing "a seat needs me" surface** — directly adjacent to dove's #1 |
| **064-terminal** | **[verified]** sidecar WS + node-pty running `tmux attach` into sessions, xterm.js in browser. See trap T1 — this is a loaded gun near pij panes |
| **088-remote-view** | **[verified]** read-only **pixel stream of a macOS window** via the streamd daemon. No tmux involvement, no keystrokes. The one currently-safe "see a pane live" primitive we own |
| pij code in chainglass | zero (your probe; not re-verified, nothing contradicts it) |

---

## 2. The structural spine of any design

Your brief's §"single most important thing" survives contact with the code, and lands concretely:

- **Change** comes from the spine cursor (platform truth: tasks, states, links, system-state transitions, dispatches).
- **Current values** (context gauge, liveness, activity, bind health) come from descriptor reads — **and have no spine events**, so a cursor-only UI would show a stale gauge forever. Two cadences are forced, not chosen: spine cursor ~1–2s, descriptor/list refresh ~5–10s. [inferred on the no-events claim — worth one line to dove]
- Join key store-side: pij id. Join key chainglass-side: descriptor `folder` → workspace. Both exist today; no new plumbing needed to correlate.

Server-side, the shape is: **one poller service in the web server** (instrumentation.ts slot) holding the spine cursor + a slow list refresh, fanning out on mux channel(s). The pij store sees exactly one well-behaved reader regardless of tab count — the ADR-0015 leader election composes with this for free. Your corrected H1 is **confirmed viable end-to-end**; every piece already exists on our side.

---

## 3. Option space, ranked honestly

**A and B share one architecture** (poller → mux channel → views; join on folder). They differ in scope and surface, not plumbing — they are sequence-able, not rivals. C and D are **layers on top**, not alternatives. I say this rather than padding the list to four "options".

**A. Read-only pij observatory** — a fleet/tree/project surface (page or pages), machine-global or workspace-scoped per Q1. Covers dove's high-value list #2 (stream→seat→assignment→dispatch as one row), #3 (tree, visually — 7KB repo-scoped makes this trivial), #5 (spine as per-project timeline), #4 (baton board). Cost: one feature dir, one poller, one channel, view code. Forecloses: nothing. Risk: low — read-only, all on settled surfaces (dove's settled list covers every view named).

**B. Workspace-woven pij strip** — no new page; seats-for-this-repo rows, current assignment, baton state surfaced inside existing workspace views. Cost: smaller. Forecloses: fleet-level and cross-project views (the things dove reconstructs daily are mostly *global*). Honest note: B alone serves *Jordan-watching-this-repo*; it does not serve *dove-governing-178-seats*. Who the user is, is Q1.

**C. Actionable console** (task set, state verify, send, baton request — mutations via CLI verbs only, never file writes). Deferred layer: needs an actor-attribution story (every pij write is attributed; a UI writing as `asserted` actor on Jordan's behalf is a real design question), and lives entirely inside dove's four forbidden-affordance constraints. Not a v1 candidate; listed so the boundary is explicit.

**D. Live-pane adjunct** — node card → see the terminal. Constrained hard (trap T1). The safe subset today is 088 remote-view's pixel stream pointed at the terminal app's window. `windowId` focus and anything tmux-touching stays open pending the dove ruling you already flagged.

**Ranking**: A (with scope per Jordan) > B (as a follow-on weave, or as v1 if Jordan scopes to "my repos only") > D (adjunct, safe subset only) > C (later, after read-only earns trust).

---

## 4. Decisions that are Jordan's — framed for quick ruling

**Q1 — Who is this for, and therefore what is the scope boundary?**
Options: (a) machine-global fleet view (the o-prime/governance user; ~179 hot seats, needs the fleet answer), (b) workspace-scoped (the "what's happening in this repo" user; repo tree is 7KB, join on `folder` is free), (c) project-scoped (the platform's own unit of work; `projectSlug` join exists). Evidence says all three are cheap to *filter*; the decision is which is the **default lens and the front door**. This decides A-vs-B sequencing.

**Q2 — Read-only v1, yes or no?**
Everything dove endorses is read-only; everything dangerous is a write. A read-only ruling makes the entire v1 uncontroversial and defers the attribution question. Cost of ruling read-only: someone watching a `question`-state seat still switches to a terminal to answer it (or: popper integration, Q4).

**Q3 — What do we bind to: files or CLI?**
- **Files directly** (`~/.pij` records + spine ndjson): binds to the *declared, versioned public contract* (`pij-platform.md`, written for exactly this). We implement the derivation rules ourselves (badge ordering, effective parent, adoption axis, done-is-a-claim — all specified field-by-field).
- **CLI `--json`**: derivations precomputed and always consistent with pij's own logic — but the shapes are explicitly *not* a declared contract, and dove has changed them this month. Dove offers to freeze what we name (§6 is that list).
- **Hybrid** (my read of the evidence, stated as a recommendation not a decision): files for records + spine cursor (contract-backed, cheap incremental reads, no process-spawn per poll), CLI for the derived views where re-implementing derivation is error-prone (`tree`, `node show`, `anomalies`). Whichever way, §6 goes to dove.
Also in scope of this Q: chainglass's server cwd is the chainglass repo, so bare CLI calls repo-scope silently — cross-workspace calls must set cwd or use `--global` + filter. A file-reader has no such trap. [verified: repo-scoping behavior]

**Q4 — One feature or several? And does "needs me" land in the popper?**
The popper already owns agent→human attention with desktop notifications. When dove's `needs-human` descriptor fix lands, piping it into the popper is the highest-value single integration in sight — but it couples two features and is a product decision, not a discovery one.

**Q5 — Does v1 include the archive tier?**
1,988 of 2,184 seats are archived. "Current fleet" views can honestly ignore archive; any history/timeline/project-retrospective view that ignores it silently shows ~10% of reality and *looks complete* — the null-result-looks-clean failure as a product. Needs an explicit yes/no per view class.

**Q6 — Sequence around `needs-human`, or ship before it?**
Dove: currently detected but invisible to readers; fix queued; when it lands it is "the single most valuable thing a UI can show". Options: (a) ship v1 without it, showing only honest observables ("quiet 21m, pane reads busy"), add it when it lands; (b) hold v1 for it. My read: (a) — v1's other views are valuable now and the observable-not-inference principle means no rework when it arrives. Jordan's call on whether v1 without it is worth wanting.

---

## 5. Tensions and traps

**T1 — Our own terminal feature is affordance #3 wearing a nice UI.** 064-terminal's sidecar runs `tmux attach` with a live keyboard. Pointed at a pij agent's session it (a) sends keystrokes on any user input, and (b) even silent, an attached client's size can clamp/reflow the agent's pane (attach is not read-only). Separately, `tmux select-window -t <windowId>` — the contract's own suggested jump — mutates the active window of Jordan's *live tmux client*. Both need the dove ruling you already queued on hypothesis 2; until then the safe live-view is 088's pixel stream, and "jump to terminal" should mean *at most* deep-linking our own UI, not driving tmux. [verified on what 064 does; inferred on resize-clamp severity]

**T2 — The gauge problem forces the second cadence.** If the poller ships cursor-only (the elegant version), context gauges and liveness go stale silently. §2. Design the poller with both loops from day one.

**T3 — Standing traps, restated once so they land in the design doc later**: never key rows on paneId/pid (recycle); pij ids can be single-segment; fences render as *intent*, never locks; `effort`/`boundModel` are *pinned* until observed — provenance in the UI copy itself; no stalled badge (semantics changing under us); anomalies advisory-only, and the vocabulary is open (T-observed: an undocumented kind in live data today).

**T4 — Your H1's naive form died correctly, but note the residue**: descriptors rewrite every tick × 179 seats, so even our *server-side* poller must not watch `~/.pij` with the 045 file-watcher machinery — chokidar over that directory is the same mistake relocated server-side. Poll on our clock, don't watch their writes.

**T5 — Auth posture is inherited, not designed.** The mux route requires a session; pij data therefore gets the same exposure as the rest of chainglass. Fine today; becomes a real question only if chainglass ever serves beyond Jordan's machine. Flagging, not solving.

---

## 6. The dove ledger — every read surface touched in discovery

CLI (`--json` unless noted): `project list` · `node show <id>` · `list` · `tree` (repo-scoped) · `anomalies` · `orchestration baton list` · `spine events [--since N]` · `state set` (error path only — vocab surface) · `whoami` (text). On-disk: directory listing of `~/.pij` + `~/.pij/archive` (counts only — no record parsed directly yet).

If Q3 lands on CLI or hybrid, this list (minus the non-bindables) is what we ask dove to treat as an interface. If it lands on files, the ask becomes "the `pij-platform.md` contract + spine ndjson," which is already ruled public.

---

## 7. What I did not do

No product code, no feature directory, no UI design presented as discovery. Both of your other hypotheses updated above (H2 → T1 sharpened with our own tooling as the hazard; H3 → confirmed with the 7KB repo-scoped measurement). One open item deliberately left for the dove channel: the no-spine-events-for-gauges claim (§2) and the T1 tmux questions — both routed through you, per channel discipline.
