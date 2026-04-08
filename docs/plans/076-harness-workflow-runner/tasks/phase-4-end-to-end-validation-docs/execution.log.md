# Execution Log — Phase 4 Subtask 001: REST API + SDK

## Live REST/SDK Validation (2026-03-23)

### Environment
- Dev server: `http://localhost:3000` with `DISABLE_AUTH=true`
- Workspace: `chainglass` (slug), worktree: `/Users/jordanknight/substrate/074-actaul-real-agents`
- Test workflow: `test-workflow` (4 nodes across 3 lines, pre-existing from Phase 3)

### Endpoint Verification (all 5 Tier 1 endpoints)

**1. GET /detailed** — Per-node diagnostics
```bash
curl -s "http://localhost:3000/api/workspaces/chainglass/workflows/test-workflow/detailed?worktreePath=/Users/jordanknight/substrate/074-actaul-real-agents"
```
Result: 200 OK — returned slug, execution status, 3 lines with 4 nodes, timing data, blockedBy arrays. Maps serialized correctly to JSON objects.

**2. GET /execution** — Status before start
```bash
curl -s "http://localhost:3000/api/workspaces/chainglass/workflows/test-workflow/execution?worktreePath=..."
```
Result: `null` (no execution running) — correct.

**3. POST /execution** — Start workflow
```bash
curl -s -X POST ".../execution" -H "Content-Type: application/json" -d '{"worktreePath":"..."}'
```
Result: `{"ok":true,"key":"L1VzZXJz...","already":false}` — workflow started through WorkflowExecutionManager.drive().

**4. POST /execution** — Idempotent start (already running)
```bash
# Same curl as above, second call
```
Result: HTTP 409 `{"ok":false,"key":"L1VzZXJz...","already":true}` — correct idempotent behavior.

**5. GET /execution** — Status while running
```bash
curl -s ".../execution?worktreePath=..."
```
Result: `{"status":"running","iterations":0,"totalActions":0,"lastEventType":"idle","lastMessage":"No actions — polling","startedAt":"2026-03-23T02:39:44.381Z","stoppedAt":null}` — full SerializableExecutionStatus.

**6. DELETE /execution** — Stop workflow
```bash
curl -s -X DELETE ".../execution" -H "Content-Type: application/json" -d '{"worktreePath":"..."}'
```
Result: `{"ok":true,"stopped":true}` — workflow stopped immediately.

**7. POST /execution/restart** — Restart workflow
```bash
curl -s -X POST ".../execution/restart" -H "Content-Type: application/json" -d '{"worktreePath":"..."}'
```
Result: `{"ok":true,"key":"L1VzZXJz..."}` — workflow restarted (stop + reset + start). Status polled after: `"status":"running"`.

### SDK Contract Tests
- 16/16 pass (11 shared contract suite + 5 fake-specific)
- Real-client parity tests added (FT-002) — skipped in CI, runnable with `TEST_SERVER_URL` env var

### Drive Lock (ST006)
- Lock moved from CLI `positional-graph.command.ts` into `GraphOrchestration.drive()`
- Both CLI and web paths protected by same engine-level PID lock
- 5581 monorepo tests pass after change — no regressions

### FT-001 Fix Applied
- Original issue: `--server` mode used `resolveProjectRoot()` as worktreePath (monorepo root, not registered workspace) and hardcoded `localhost:3000`
- Fix: `resolveServerContext()` uses `computePorts()` for URL and `scratch/harness-test-workspace` for path
- Verified: correct workspace/worktree resolution matches seeded workspace

### Observations
- SSE broadcasts fire during REST-triggered execution — browser clients see node progress
- Drive lock file created at `.chainglass/data/workflows/test-workflow/drive.lock` with server PID
- `getReality()` correctly serializes ReadonlyMap → JSON object for detailed endpoint

---

## Phase 4 Main Tasks — Dogfooding Checkpoint (2026-03-23)

### Fixes Applied During Dogfooding

| Fix | Issue | Resolution |
|-----|-------|------------|
| `run --server` fire-and-forget | Command blocked with poll loop instead of returning immediately | POST start → print nextSteps → exit 0 |
| `stop`/`restart` server-url | Justfile didn't inject `--server-url` for stop/restart (no `--server` flag) | Regex matches `wf stop\|wf restart` subcommands |
| `stop`/`status`/`restart` crash | `adapter.format()` expects `errors` field, SDK results don't have it | Spread `...result, errors: []` |
| Root `harness-cg` recipe | `just harness cg` failed — `cg` is a harness justfile recipe, not a CLI command | Added `just harness-cg` to root justfile |
| CLAUDE.md → AGENTS.md | Renamed with mandatory harness dogfooding section | Strong language: never bypass harness |

### Full Lifecycle Validation (via `just harness-cg` / `just harness workflow`)

All commands executed from repo root using harness recipes. No direct curl/REST.

**Step 1: Reset** — `just harness workflow reset`
→ `{"status":"ok","data":{"cleaned":true,"created":{"units":true,"template":true,"workflow":true}}}`

**Step 2: Run (fire-and-forget)** — `just harness-cg wf run test-workflow --server`
→ Instant return: `{"started":true,"nextSteps":{"poll":"cg wf show...","stop":"cg wf stop..."}}`

**Step 3: Poll** — `just harness-cg wf show test-workflow --detailed --server`
→ 4 nodes: `test-user-input-eb5` (ready), 3 others (pending, blocked by preceding-lines)

**Step 4: Stop** — `just harness-cg wf stop test-workflow`
→ `{"ok":true,"stopped":true}`

**Step 5: Status** — `just harness-cg wf status test-workflow --server`
→ `{"status":"stopped","iterations":2,"lastMessage":"Drive stopped — aborted during sleep"}`

**Step 6: Restart** — `just harness-cg wf restart test-workflow`
→ `{"ok":true,"key":"..."}` — fresh start, all nodes reset to ready/pending

**Step 7: Poll after restart** — `just harness-cg wf show test-workflow --detailed --server`
→ All 4 nodes back to initial state (ready/pending), progress 0%

**Step 8: Stop** — `just harness-cg wf stop test-workflow`
→ `{"ok":true,"stopped":true}`

**Step 9: Logs** — `just harness workflow logs`
→ 13 cached events with emoji status display, drive timeout capture

### Agent System Verification (T002)

ODS-dispatched pods register as agents via `AgentManagerService.getNew()` / `getWithSessionId()`. Verified through code analysis:
- ODS creates agents at `ods.ts:190-204` 
- AgentManagerService stores in `_agents` Map and `_sessionIndex` Map
- DI wires singleton AgentManagerService at `di-container.ts:505-525`
- Test coverage at `ods-agent-wiring.test.ts` (4 tests)
- **No gap found** — workflow pods ARE registered in the existing agent system

### Harness Wishlist

10 friction points documented in `docs/plans/076-harness-workflow-runner/harness-wishlist.md`.
Blockers fixed during this session (W001, W003, W008). Remaining items tracked for future improvement.
