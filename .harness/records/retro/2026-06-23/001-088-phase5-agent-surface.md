---
record_kind: "retro"
harness_version: "0.5.0"
branch: "084-random-enhancements-3"
repo: "git@github.com:AI-Substrate/chainglass.git"
created_at: "2026-06-23T09:19:02.534Z"
agent: agent
plan_id: 088-remote-app-view
schema_version: "1.1"
retro_id: "2026-06-23T09:19:02Z-agent-368b"
started_at: "2026-06-23T05:04:09.862Z"
ended_at: "2026-06-23T09:19:02Z"
summary: "Plan 088 Phase 5 (Lifecycle, Agent Surface & Events) drain — 13 observations across the phase: 3 companion WINs (caught real T005 contract drift + a HIGH auth-gate gap; live per-commit review worked on the final run), a dominant companion/minih friction cluster (DL-001/003/004/005 — inside-lane invisibility, mid-task self-termination, batch-at-exit cadence, recurring state-vocab drift), a tasks-dossier↔reality drift cluster (INS-002/003 + INS-001), a vitest cold-start hang on stale standalone dirs (DL-002), and an ADR-0001 annotation-exemplar insight (INS-005). The companion/minih cluster is harness-product friction (upstream); the dossier-validation + vitest items are encodable locally."
entries:
  - id: WIN-001
    kind: win
    description: |-
      code-review-companion (minih) caught a real doc/contract drift on T005: docs+tests claimed createSession-failure maps to daemonDown, but the R6 reducer maps SESSION_RECREATE_FAIL -> picker (healthy-daemon re-pick). Fixed in 2ffd4af3; companion re-review = APPROVE.
    target: tooling
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-06-23T05:04:09.862Z"
  - id: DL-001
    kind: difficulty
    description: |-
      minih 0.2.3 companion findings/replies land on the INSIDE lane (inbox/inside/messages.ndjson, sender:inside), invisible to the documented 'minih outside inbox list' read-path. Had to read the ndjson directly to see the companion's HIGH finding.
    target: tooling
    severity: degrading
    workaround: "read inbox/inside/messages.ndjson directly"
    suggested_encoding: "minih outside inbox list should surface inside-lane replies, or document the inside-lane read-path"
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-06-23T05:04:11.680Z"
  - id: INS-001
    kind: insight
    description: |-
      T004 shipped with no execution.log.md entry — the prior session skipped the implement verb's 'append execution log' step; surfaced only when I went looking. Per-task execution-log append isn't enforced or reminded by the implement loop.
    target: skill
    severity: annoying
    suggested_encoding: "implement verb should checkpoint an execution.log.md append per task (or flag its absence) before marking the task done"
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-06-23T05:04:13.358Z"
  - id: DL-002
    kind: difficulty
    description: |-
      vitest cold-start hung for minutes on Plan 088 — vite-tsconfig-paths recursively scanned STALE build artifacts (apps/web/.next/standalone + apps/cli/dist/web/standalone) whose copied tsconfig.json has a broken 'extends', throwing TSConfckParseError EXTENDS_RESOLVE before any test ran. Pruning the two (untracked, gitignored) standalone dirs took the run from >180s/hung to ~1s.
    target: tooling
    severity: degrading
    workaround: "rm -rf apps/web/.next/standalone apps/cli/dist/web/standalone"
    suggested_encoding: "vitest/vite-tsconfig-paths should exclude **/.next/standalone and **/dist/**/standalone, or a just recipe should prune them before test runs"
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-06-23T06:25:47.733Z"
  - id: INS-002
    kind: insight
    description: |-
      Plan 088 tasks dossier asserted 'Phase 2 registered the remote-view domain', but WorkspaceDomain (the single-source enum in packages/shared) had NO RemoteView entry — emit('remote-view',…) would not typecheck. T006 had to add it. A 'claimed registration resolves to a real source symbol' check at the tasks/validate stage would have caught this drift before implementation.
    target: skill
    severity: annoying
    suggested_encoding: "validate-v2 / tasks stage: verify each 'registered/exported X' claim maps to a concrete symbol+line in source"
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-06-23T06:25:47.802Z"
  - id: DL-003
    kind: difficulty
    description: |-
      code-review-companion run …-8ec5 (booted last session) self-terminated (run.json status: completed, idle ~60min) DURING the long T006 implementation, so the per-task T006 review-request landed on a dead session — no live review. Companion longevity didn't survive one long TDD task (deep exploration + a vitest stall). Per-commit live review is lost when a single task runs longer than the companion's idle timeout.
    target: tooling
    severity: degrading
    workaround: "T006 verified independently (133/133, tsc 0, biome clean); re-boot a fresh companion for T007+"
    suggested_encoding: "companion should stay alive across a phase (heartbeat/keepalive) or the implement verb should re-check liveness before each per-task ping and re-boot if dead"
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-06-23T06:28:58.111Z"
  - id: INS-003
    kind: insight
    description: |-
      Plan 088 T007 build-sheet said 'publish sites in the real adapter' (server), but GlobalState is a CLIENT runtime store (new GlobalStateSystem() exists only in state-provider.tsx). The server reaches client state via SSE -> ServerEventRoute -> client GlobalState, never directly. T007 therefore publishes client-side: status via a ServerEventRoute descriptor on the remote-view SSE channel, latency/fps via a throttled publisher tapped into the viewport HUD sampler. Same dossier-vs-reality drift class as T006's unregistered WorkspaceDomain.
    target: "docs/plans/088-remote-app-view/tasks/phase-5-lifecycle-agent-surface-events/tasks.md"
    suggested_encoding: "tasks dossier validation should grep that named publish/registration sites actually exist on the claimed side (client vs server) before pinning them in Done-When"
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-06-23T06:53:01.991Z"
  - id: INS-004
    kind: insight
    description: |-
      Plan 088 T007: stats (latency/fps) only have real values against the live daemon (Phase 6); Phase 5 is fakes-only. The 5s-throttled publisher is unit-tested with an injected clock, but its viewport call-site (HUD sampler) is verified only by the Phase 6 browser smoke since the viewport is intentionally not unit-tested (jsdom lacks WebCodecs).
    target: "apps/web/src/features/088-remote-view/components/viewport.tsx"
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-06-23T06:53:02.061Z"
  - id: WIN-002
    kind: win
    description: |-
      Plan 088 code-review-companion (run …-81f7) delivered a FULL structured debrief on run-exit — 4 findings (2 HIGH, 2 MEDIUM) + magicWand + difficulties — even though the run process terminated. Recovery from DL-003 (prior run died silently). Crucially it caught a real auth-gate gap green tests missed: T009 CLI sends X-Local-Token but the remote-view routes gate NextAuth-only (requireRemoteViewSession), so cg remote-view would 401 in production — the T009 unit tests inject the request seam and never exercise the real auth path.
    target: "agents/code-review-companion/runs/2026-06-23T06-42-47-993Z-81f7/completed.json"
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-06-23T08:02:40.813Z"
  - id: DL-004
    kind: difficulty
    description: |-
      Companion-mode cadence friction (Plan 088 Phase 5): per-task review-request pings (T006-T009) were NOT reviewed live per-commit — the companion batched all reviews and emitted them only at run-exit (~4500s run). 'Inline review at commit time' was effectively 'one batch review at phase end'. Findings also failed minih schema validation (run 'degraded': findings needed property 'id' in a different shape), and the companion hit a coordination-state vocab mismatch (prompt used reading/reporting/blocked/stopping; runtime allowed only idle/in-progress/paused/reviewing/complete/error).
    target: "agents/code-review-companion"
    severity: degrading
    suggested_encoding: "companion-mode: confirm whether live per-commit cadence is expected vs batch-at-exit, or document that findings land at phase end; align the companion prompt state vocabulary with the minih coordination schema; fix the findings schema (id property)"
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-06-23T08:02:50.376Z"
  - id: INS-005
    kind: insight
    description: |-
      ADR-0001 openWorldHint judgment call: remote-view MCP tools reach a live native daemon capturing the host's windows, so I set openWorldHint:true (vs the repo's filesystem-only tools that use false). The four-hint annotation set is genuinely a per-tool semantic decision (read vs create vs destructive), not boilerplate — worth a worked exemplar in the MCP tool-authoring guidance.
    target: "packages/mcp-server tool-authoring (ADR-0001)"
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-06-23T08:29:20.397Z"
  - id: WIN-003
    kind: win
    description: |-
      Live per-commit companion review worked this run (…-368b): booted a fresh code-review-companion, it reviewed the FINAL commit b2f55f4ca at the boundary in ~60s and cleanly approved (0 findings), independently confirming the ADR-0001 annotations + X-Local-Token gate + frozen-contract parity. Contrast with the prior run (…-81f7) which batched all reviews at run-exit. Takeaway: the dogfood cadence delivers genuine live review WHEN the companion is alive for the commit boundary — booting fresh at phase start (not relying on a prior run surviving) is the reliable pattern.
    target: tooling
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-06-23T08:40:33.723Z"
  - id: DL-005
    kind: difficulty
    description: |-
      Companion-prompt state vocabulary drift RECURS across two consecutive code-review-companion runs (…-81f7 and …-368b, both MH-001): the prompt instructs states like reading/reporting/stopping, but the live minih coordination schema only accepts idle/in-progress/paused/reviewing/complete/error — the first state_transition fails until the agent inspects coordination_status. A recurring, deterministic mismatch is worth encoding: align the companion agent prompt's state vocabulary to the live schema (or have minih auto-map prompt states), so each run doesn't rediscover it at runtime.
    target: "code-review-companion agent prompt / minih coordination schema"
    severity: degrading
    resolved_by: "https://github.com/AI-Substrate/minih/issues/63"
    system:
      compound:
        status: escalated
        source: agent-self
        first_seen_at: "2026-06-23T08:40:33.796Z"
---

# Retro — Plan 088 Phase 5 (Lifecycle, Agent Surface & Events)

Phase 5 delivered the agent surface across SDK (T008) / CLI (T009) / MCP (T010) plus the daemon
lifecycle, proxy routes, SSE envelopes, and GlobalState publishing — T001–T010 complete, drained here.

**Dominant cluster — companion/minih (harness product, routes upstream):** DL-001 (inside-lane
invisibility), DL-003 (companion self-terminated mid-T006), DL-004 (batch-at-exit cadence + findings
schema + state vocab), DL-005 (state-vocab drift **recurs**). The recurrence is the leak: the same
inference re-paid each companion run. WIN-001/002/003 are the payoff side — the companion caught a real
T005 contract drift and a HIGH production auth-gate gap that green tests missed, and live per-commit
review worked once the companion was booted fresh for the commit boundary.

**Encodable locally:** DL-002 (vitest excludes / a prune recipe for stale `**/standalone` dirs);
INS-002 + INS-003 (a tasks/validate-stage check that every "registered/exported/published X" claim
resolves to a real source symbol on the claimed side — the dossier↔reality drift class that bit T006/T007).

**Deferred to Phase 6:** INS-004 (viewport stats are live-daemon-only). **Doc/exemplar:** INS-005
(ADR-0001 four-hint annotations are a per-tool semantic decision worth a worked example).
