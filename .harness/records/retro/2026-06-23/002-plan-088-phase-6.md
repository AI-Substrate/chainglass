---
record_kind: "retro"
harness_version: "0.5.0"
branch: "084-random-enhancements-3"
repo: "git@github.com:AI-Substrate/chainglass.git"
created_at: "2026-06-23T23:53:44.448Z"
agent: "agent"
plan_id: "088-remote-app-view"
schema_version: "1.1"
retro_id: "2026-06-23T23:55:00Z-agent-p6rv"
started_at: "2026-06-23T09:50:00Z"
ended_at: "2026-06-23T23:55:00Z"
summary: "Plan 088 Phase 6 (remote-view integration hardening, permissions UX, docs) implemented end-to-end with the engineering-harness observe seam + the code-review-companion live-reviewing each task. A live pre-flight produced 9 observations that became T001–T008; the implementation then closed them. The marquee learning: a tsyringe `useFactory` registration is TRANSIENT and ignores `lifecycle`, so a stateful service/control loses its per-request in-memory state — found twice (T008 daemon-control, T007 service/DL-008, the latter caught by a live CLI attach→list smoke that unit tests missed). The companion caught two real bugs (F001 health fetch-race, F002 arch-guard narrowness). just check (typecheck+lint) brought to green; the only un-headless-able remainder is T009's visual/measured live AC sweep (needs the host-Mac authenticated browser)."
entries:
  - id: DL-008
    kind: difficulty
    description: "tsyringe `useFactory` is TRANSIENT and ignores `lifecycle` for factory providers — a stateful registration (REMOTE_VIEW_SERVICE holding the in-memory session Map; REMOTE_VIEW_DAEMON_CONTROL holding config+manager) builds a FRESH instance per resolve, so per-request state is lost: attach() set instance A's Map, the next request's list() read instance B's empty Map → GET /sessions structurally always empty in prod. Found twice in one feature (T008 daemon-control, T007 service)."
    target: project
    severity: degrading
    workaround: "Memoize per-container with a closure cell (prod + test registrations); add a DI test asserting resolve()==resolve() within a container AND distinct across containers."
    suggested_encoding: "A reusable DI lint/test: any token whose impl holds mutable instance state must resolve to the SAME instance within a container — assert resolve()===resolve(). Caught here by a cross-request attach→list test."
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-06-23T23:27:38.522Z"
  - id: WIN-003
    kind: win
    description: "The dogfood loop paid for itself thrice: (1) the observe seam's 9 live pre-flight observations became the source-grounded basis for T001–T008 (no re-discovery mid-build); (2) a live CLI attach→list smoke caught DL-008, a real production session-loss bug unit tests could not see; (3) the code-review-companion caught two genuine defects — F001 (a health-refresh fetch-race that would make the AC-14 permission card reappear after a fix) and F002 (the new arch guard only matched static next/headers imports)."
    target: tooling
    suggested_encoding: "Keep the observe→task and per-task companion-review cadence for live-integration phases; live smokes against the running server catch a class of cross-request/state bugs that hermetic unit tests cannot."
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-06-23T23:35:00.000Z"
  - id: DL-001
    kind: difficulty
    description: "Shipped CLI binary (apps/cli/dist/cli.cjs) lagged source by days, so `cg remote-view` verbs were absent at runtime — the live CLI smoke was impossible until a rebuild. dist artifacts silently lag src across sessions."
    target: tooling
    severity: degrading
    workaround: "Rebuilt apps/cli (pnpm build); hit the HTTP route via curl in the interim."
    suggested_encoding: "`just cli-build-check` — flags dist/cli.cjs older than any apps/cli/src/**.ts and exits non-zero (agent/CI guard). ADDED this phase."
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-06-23T09:50:46.040Z"
  - id: INS-004
    kind: insight
    description: "A 'live probe accepts an unexpected credential' finding can be a DISABLE_AUTH artifact, not a real auth gap. The T008 concern (a live probe saw /health accept X-Local-Token alone) dissolved structurally: /health + /windows export GET() with ZERO params, so they cannot read a token — NextAuth-only by construction. The dev server's DISABLE_AUTH=true fakes a session, so every request looked authenticated regardless of headers."
    target: project
    suggested_encoding: "When live-probing an auth gate, first assert DISABLE_AUTH is unset; prefer a deterministic unit test with an injected null session, and a structural proof (handler arity 0 → can't read a credential) over a single live curl. Encoded as the zero-arg structural test + the session-only-routes architecture guard."
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-06-23T22:12:53.291Z"
  - id: INS-003
    kind: insight
    description: "Dossier↔reality drift: a task specified 'add a Next route that UPGRADES the WS and reverse-proxies to the loopback daemon', but Next App-Router handlers cannot upgrade WebSockets in this app (chainglass serves all WS via sidecars; the daemon is loopback-frozen). The canonical path is a same-origin reverse proxy (Caddy), so the task reduced to a client url-builder + env/origin config + a Caddyfile recipe — the 'new Next route' was infeasible."
    target: plan
    suggested_encoding: "tasks/validate stage: verify any 'route that upgrades a WebSocket' (or similar transport) claim against the app's ACTUAL serving mechanism (sidecar vs route) before pinning it in a task."
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-06-23T11:06:54.466Z"
  - id: DL-006
    kind: difficulty
    description: "`just check`'s typecheck + lint were RED on pre-existing debt UNRELATED to the phase's feature logic (commander v11-vs-v13 type-identity skew in a test; RequestInit/tuple + ProcessEnv-NODE_ENV in tests; a .minih companion-runtime JSONC file biome mis-parsed). Inherited red is hard to separate from regressions mid-phase."
    target: tooling
    severity: degrading
    workaround: "Fixed all cleanly under T011 (no @ts-ignore): Partial<NodeJS.ProcessEnv>, typed fetch spy, import Command from the CLI's own commander copy, add .minih to biome ignore."
    suggested_encoding: "A pre-phase `just typecheck`/`just lint` baseline snapshot would let a phase separate inherited red from its own regressions; the gate should be green at phase start."
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-06-23T10:54:37.985Z"
  - id: DL-007
    kind: difficulty
    description: "code-review-companion `minih outside inbox send` fails E170 'Multiple active runs found' when prior-day runs stay marked active (6 stale candidates here) — slug-only addressing is ambiguous; must pass --run <runId> explicitly every send."
    target: minih
    severity: annoying
    workaround: "Capture the fresh boot runId (ls -dt agents/code-review-companion/runs/) and pass --run on every send."
    suggested_encoding: "minih could auto-select the most-recent active run, or add `minih runs gc` to retire idle/farewelled runs. Upstream OSS issue (file as jakkaj)."
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-06-23T21:56:19.832Z"
---

# Retro — Plan 088 Phase 6 (Remote View: integration hardening, permissions UX, docs)

The phase was driven by the harness `observe` seam and a live `code-review-companion`. A live pre-flight
against the running dev server produced 9 observations (DL-001..005, INS-001/002, WIN-001/002) that became
the **source-grounded basis** for tasks T001–T008 — the keystone being that *no route surfaced the daemon
WS url to the client* (the panel streamed `''`). Implementation then closed each one.

**The durable learning** is `DL-008` / the transient-`useFactory` class: in tsyringe a `useFactory`
provider is **transient** and **ignores `lifecycle`**, so any registration whose implementation holds
mutable instance state (the daemon-control's config+manager; the service's in-memory session `Map`) hands
every `resolve()` a *fresh* object — and per-request state silently evaporates. We hit it **twice in one
feature**: T008 for the daemon-control (the `/health`↔`/windows` reconcile) and T007 for the service
(`GET /sessions` structurally always empty), the latter caught only because a **live CLI `attach→list`
smoke** disagreed with the unit tests. The fix both times is a per-container closure memo + a same-instance
DI test; the generalizable encoding is "a stateful DI token must resolve to one instance per container."

**The dogfood earned its place** (`WIN-003`): the observe→task pipeline, the live smoke that found DL-008,
and the companion's two real catches (F001 a permission-card fetch-race, F002 an arch-guard that under-matched
its own contract). Nine of nine pre-flight observations are now addressed; `just check` (typecheck + lint) is
green. The single un-headless-able remainder is **T009's visual/measured live AC sweep** — it needs the
host-Mac authenticated browser to observe frame decode and read fps/latency, and those numbers must not be
fabricated; it's scaffolded as a runnable Measurement Sheet (AC-11 snapshot already PASS: 0 orphans).
