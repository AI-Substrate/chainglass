# Execution Log: Phase 3 — Smoke Test Agent

**Plan**: 070-harness-agent-runner
**Phase**: Phase 3: Smoke Test Agent
**Started**: 2026-03-08

---

## Pre-Phase: Runner Fix (DYK-01)

**Task**: Fix runner.ts to not overwrite agent's report.json with agentResult.output
**Rationale**: DYK session identified that the runner unconditionally writes `agentResult.output` (often prose) to `output/report.json`, overwriting any valid JSON the agent wrote via file tools. Fix: only write as fallback if file doesn't already exist.
**Change**: `harness/src/agent/runner.ts` line 157-160 — added `!fs.existsSync(outputPath)` guard
**Test**: Updated runner.test.ts Test Doc to reflect new fallback contract. All 53 unit tests pass.

## Pre-Phase: Error Code Range Fix

**Task**: Fix pre-existing test failure in output.test.ts
**Rationale**: Phase 2 added E120-E125 error codes but the test asserted E100-E110 range only.
**Change**: `harness/tests/unit/cli/output.test.ts` — updated range assertion to allow E100-E110 OR E120-E125.
**Test**: All 7 unit test files pass (53 tests).

---

## Stage 1: Create Agent Definition (T001, T002, T003)

### T001: Create smoke-test prompt.md
- **Created**: `harness/agents/smoke-test/prompt.md` (4.8KB)
- **Content**: 6-section prompt (health check, screenshots, console logs, server logs, report, retrospective)
- **DYK decisions applied**:
  - DYK-02: Included CDP port discovery via `just harness ports` + Playwright connection pattern
  - DYK-04: Agent references screenshot paths from command output, no file moving
  - DYK-05: Retrospective section expanded with 5 specific sub-prompts (workedWell, confusing, magicWand, cliDiscoverability, improvementSuggestions)

### T002: Create smoke-test output-schema.json
- **Created**: `harness/agents/smoke-test/output-schema.json` (4.3KB)
- **Content**: JSON Schema Draft 2020-12 with required fields: health, screenshots, verdict, retrospective
- **DYK decisions applied**:
  - DYK-03: `additionalProperties: true` at every object level for agent flexibility
  - DYK-03: `health.status` is `type: string` (not enum) — agent may mirror harness CLI format
  - DYK-05: Retrospective schema includes `cliDiscoverability` and `improvementSuggestions` fields
- **Validated**: `JSON.parse()` confirms valid JSON

### T003: Create smoke-test instructions.md
- **Created**: `harness/agents/smoke-test/instructions.md` (2.9KB)
- **Content**: Identity, output rules, CLI quick reference table, CDP browser access, error handling, retrospective guidance with good/bad examples
- **DYK decisions applied**:
  - DYK-02: CLI quick reference table with all relevant commands
  - DYK-02: CDP connection pattern with Playwright example
  - DYK-04: Instructions say "do NOT move files"

---

## Stage 2: Execute and Validate (T004, T005)

### T004: First Run Attempt
- **Command**: `just harness agent run smoke-test`
- **Result**: FAILED — SDK `sendAndWait()` timeout after 60s
- **Root cause**: `AgentRunOptions` had no `timeout` field; SDK defaults to 60s idle timeout. Agent was actively working (15 tool calls, 1076 events) but didn't finish in 60s.
- **Fix**: Added `timeout?: number` to `AgentRunOptions`, wired through `SdkCopilotAdapter.run()` → `session.sendAndWait(opts, timeout)`, and runner passes `timeoutMs` (300s default).

### T004: Second Run Attempt
- **Command**: `just harness agent run smoke-test` (with timeout fix)
- **Result**: DEGRADED — agent completed (124.5s, 2351 events, 21 tool calls), wrote valid report, but schema validation failed
- **Root cause**: `ajv` v8 default doesn't support JSON Schema draft 2020-12. Error: `"no schema with key or ref https://json-schema.org/draft/2020-12/schema"`
- **Fix**: Changed `import Ajv from 'ajv'` to `import Ajv2020 from 'ajv/dist/2020.js'` in validator.ts

### T005: Re-Validate After Fixes
- **Command**: `just harness agent validate smoke-test`
- **Result**: ✅ `validated: true` — report passes schema validation
- **Agent report highlights**:
  - Health: all 4 services UP (app, mcp, terminal, cdp)
  - Screenshots: 3 viewports captured (desktop-lg, tablet, mobile) — paths correctly referenced from command output
  - Console: 1 WebSocket HMR error (expected in dev)
  - Verdict: `"partial"` (healthy but console error present)
  - Retrospective: Outstanding UX feedback — identified `npx tsx` vs `pnpm exec tsx` gotcha, requested `console-logs` CLI command, suggested multi-viewport screenshot command

### Infrastructure Fixes Applied During T004/T005:
1. **AgentRunOptions.timeout** — new optional field wired through adapter to SDK `sendAndWait()`
2. **Ajv2020** — validator now supports JSON Schema draft 2020-12
3. **Runner report.json fallback** — only writes `agentResult.output` if agent didn't write file (DYK-01)
4. **Error code range test** — output.test.ts updated to allow E120-E125 range

---

## Stage 3: Document (T006)

### T006: Update harness.md
- Added Plan 070 P3 entry to History table
- Added "Agent Definitions" section with:
  - Reference Agent: smoke-test — folder structure, execution commands, what it does
  - Creating New Agents — 4-step guide
  - Emphasis on retrospective as the most valuable output

---

## Acceptance Criteria Evidence

| AC | Status | Evidence |
|----|--------|----------|
| AC-22 | ✅ | `harness/agents/smoke-test/` exists with prompt.md, output-schema.json, instructions.md |
| AC-23 | ✅ | Report includes health (4 services), 3 screenshots, console errors, server log summary |
| AC-24 | ✅ | Retrospective includes workedWell, confusing, magicWand + bonus cliDiscoverability, improvementSuggestions |
| AC-25 | ✅ | Run completed with `validated: true` after re-validation |
| events.ndjson tool calls | ✅ | 21 tool calls including doctor, health, screenshot (x3), ports, docker logs, console check |
| completed.json | ✅ | Written with full metadata, sessionId, timing, validation |

