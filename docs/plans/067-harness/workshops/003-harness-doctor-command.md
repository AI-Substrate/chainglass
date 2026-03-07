# Workshop 003: `harness doctor` Command

**Plan**: [harness-plan.md](../harness-plan.md)
**Topic**: A single diagnostic command that replaces agent health-check guesswork
**Created**: 2026-03-07

---

## Problem

When an agent runs `harness health` and gets a degraded or error result, it has no idea what to do next. We observed a test agent spending 8+ tool calls flailing through `docker ps`, `docker inspect`, `docker compose logs`, manual health poll loops, and reading shell output — all trying to figure out why the harness isn't ready.

The current `harness health` command is a **status reporter** — it tells you what's up or down. It doesn't tell you **why** it's down or **what to do about it**. Agents need actionable guidance, not raw status.

## Proposed Solution: `harness doctor`

A single command that runs a layered diagnostic cascade and returns **actionable fix commands** for every problem it finds.

### Design Principles

1. **Cascade from infrastructure up**: Docker → Container → App → Services → Browser
2. **Stop at the first blocking layer**: If Docker isn't running, don't bother checking the app
3. **Every problem gets a fix command**: Not "app is down" but "App not responding. Run: `just harness dev`"
4. **Human-readable to stderr, JSON to stdout**: Agents parse JSON; humans read stderr
5. **Fast**: Under 5 seconds for a healthy harness, under 3 seconds for common failures

### Diagnostic Cascade

```
Layer 0: Prerequisites
├─ Is Docker/OrbStack running?
│  ✗ → "Docker is not running. Run: orbctl start"
│
├─ Is the harness package installed?
│  ✗ → "Harness deps not installed. Run: just harness-install"
│
Layer 1: Container
├─ Does the container exist?
│  ✗ → "No harness container found. Run: just harness dev"
│
├─ Is the container running (not exited/restarting)?
│  ✗ → "Container exited. Run: just harness dev"
│      (include last 5 lines of container logs for context)
│
├─ Is the container still in cold-boot (< 3 min old, deps installing)?
│  ⏳ → "Container is booting (installing deps). Wait ~2 min, then: just harness health"
│
Layer 2: Application
├─ Is the app responding on the allocated port?
│  ✗ → "App not responding on :3159. Container may still be building."
│      "Check logs: just harness logs | tail -20"
│
├─ Is MCP endpoint accessible?
│  ✗ → "MCP not responding. App may still be starting. Wait 30s."
│
Layer 3: Services
├─ Is the terminal sidecar listening?
│  ✗ → "Terminal sidecar down on :4659. Check entrypoint.sh logs."
│
├─ Is CDP/Chromium accessible?
│  ✗ → "CDP not available on :9281. Chromium may be starting."
│      "If persistent, rebuild: just harness build && just harness dev"
│
Layer 4: Ready
└─ All services up
   ✓ → "Harness is healthy and ready."
       "  App:      http://127.0.0.1:3159"
       "  CDP:      http://127.0.0.1:9281"
       "  Terminal: ws://127.0.0.1:4659"
```

### JSON Output Schema

```typescript
interface DoctorResult {
  healthy: boolean;
  layer: 'prerequisites' | 'container' | 'application' | 'services' | 'ready';
  checks: DoctorCheck[];
  summary: string;         // One-line human summary
  action?: string;         // The single most important fix command
}

interface DoctorCheck {
  name: string;            // e.g., "docker", "container", "app", "cdp"
  status: 'pass' | 'fail' | 'warn' | 'skip';
  message: string;         // Human-readable explanation
  fix?: string;            // Exact command to run
  detail?: string;         // Extra context (log lines, error messages)
}
```

### Example Outputs

**Docker not running:**
```
stderr:
  ✗ Docker is not running
  → Run: orbctl start

stdout:
  {"command":"doctor","status":"error","data":{"healthy":false,"layer":"prerequisites",
   "checks":[{"name":"docker","status":"fail","message":"Docker is not running","fix":"orbctl start"}],
   "summary":"Docker is not running","action":"orbctl start"}}
```

**Container booting (cold start):**
```
stderr:
  ✓ Docker running
  ✓ Container exists (chainglass-066-wf-real-agents)
  ⏳ Container started 45s ago — still booting (deps installing)
  → Wait ~2 min, then run: just harness health

stdout:
  {"command":"doctor","status":"degraded","data":{"healthy":false,"layer":"container",
   "checks":[{"name":"docker","status":"pass",...},{"name":"container","status":"warn",
   "message":"Container booting (45s ago)","fix":"Wait ~2 min, then: just harness health"}],
   "summary":"Container is booting","action":"just harness health"}}
```

**All healthy:**
```
stderr:
  ✓ Docker running
  ✓ Container running (chainglass-066-wf-real-agents)
  ✓ App responding on :3159
  ✓ MCP endpoint accessible
  ✓ Terminal sidecar on :4659
  ✓ CDP/Chromium on :9281 (Chrome/136.0.7103.25)
  ✓ Harness is healthy and ready.

stdout:
  {"command":"doctor","status":"ok","data":{"healthy":true,"layer":"ready","checks":[...],"summary":"Harness is healthy and ready"}}
```

### Implementation Approach

**New files:**
- `harness/src/doctor/diagnose.ts` — the cascade logic, composes existing SDK helpers
- `harness/src/cli/commands/doctor.ts` — CLI command registration

**Reuses existing SDK helpers:**
- `isDockerAvailable()` from `src/docker/lifecycle.ts`
- `isContainerRunning()`, `dockerPs()` from `src/docker/lifecycle.ts`
- `probeApp()`, `probeMcp()`, `probeTerminal()`, `probeCdp()` from `src/health/probe.ts`
- `computePorts()` from `src/ports/allocator.ts`

**New SDK helpers needed:**
- `getContainerAge()` — parse `docker inspect` for container start time
- `getContainerLogs(n)` — last N lines of container logs for error context

### Relationship to `harness health`

| | `harness health` | `harness doctor` |
|---|---|---|
| Purpose | Status snapshot | Diagnostic + remediation |
| Speed | ~1s | ~2-5s |
| Output | Service statuses | Checks + fixes + context |
| Audience | Programmatic (agent parsing) | Both (agent + human) |
| When to use | After boot, periodic checks | When something's wrong |

`health` is a thermometer. `doctor` is the doctor who reads the thermometer and tells you what to do.

### Testing Approach

Unit tests for the cascade logic:
- Mock Docker unavailable → check stops at Layer 0
- Mock container missing → check stops at Layer 1
- Mock app down, CDP up → Layer 2 failure with correct fix
- All up → Layer 4 ready

Integration test (requires running container):
- `harness doctor` returns `healthy: true` when harness is up

### Prompt Integration

The test agent prompt should change from:
```
Check health, if not ok, try various things...
```
To:
```
Run: just harness doctor
If not healthy, run the fix command from the output, then doctor again.
```

This turns the multi-step guesswork into a simple loop: `doctor → fix → doctor → fix → ready`.

---

## Decision Points

1. **Should `doctor` replace `health` as the default status command?** — No. Health is fast and simple for programmatic polling. Doctor is heavier and for troubleshooting.

2. **Should `doctor` auto-fix?** — No. It tells you what to run, but doesn't run it. Auto-fixing (e.g., starting Docker) has side effects the user should control.

3. **Should the prompt always start with `doctor` instead of `health`?** — Yes. Doctor is the right first command for an agent that doesn't know the current state.

---

## Estimated Scope

- **Complexity**: CS-2 (small)
- **New files**: 2 (diagnose.ts, doctor.ts)
- **Modified files**: 2 (index.ts for registration, lifecycle.ts for container age/logs helpers)
- **Tests**: ~8 unit tests for cascade logic, 1 integration test
- **Time**: Can be implemented as a quick follow-on, not a full phase
