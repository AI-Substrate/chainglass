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
