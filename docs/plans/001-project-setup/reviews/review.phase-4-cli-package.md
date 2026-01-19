# Code Review: Phase 4 - CLI Package

**Plan**: [../project-setup-plan.md](../project-setup-plan.md)
**Dossier**: [../tasks/phase-4-cli-package/tasks.md](../tasks/phase-4-cli-package/tasks.md)
**Date**: 2026-01-19
**Reviewer**: Claude Code Review Agent

---

## A) Verdict

**REQUEST_CHANGES**

Phase 4 demonstrates **excellent TDD discipline** with comprehensive test documentation, proper RED-GREEN-REFACTOR cycles, and zero mock policy violations. However, several **HIGH-severity correctness and safety issues** require remediation before merge.

---

## B) Summary

Phase 4 implements the Chainglass CLI (`cg` command) with web and MCP command stubs. The implementation follows Full TDD methodology with 14 tests (9 CLI parser + 5 web command), all passing.

**Strengths:**
- Exemplary TDD compliance (tests before implementation documented in execution log)
- Complete Test Doc blocks on all 14 tests (5-field TAD-style documentation)
- Zero mock policy violations (only vi.spyOn for console observability)
- Commander.js testMode pattern prevents process.exit() in tests
- Clean SIGINT forwarding for graceful shutdown

**Critical Issues Requiring Fixes:**
1. Missing port number validation (NaN and range checks)
2. Signal handler accumulation (memory leak risk)
3. Spawn error handling gap (synchronous failures unhandled)
4. Hardcoded styled-jsx dependency version path
5. Unbounded environment variable inheritance

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution.log.md)
- [x] Tests as docs (all 14 tests have complete 5-field Test Doc blocks)
- [x] Mock usage matches spec: **Fakes only** (vi.spyOn console acceptable)
- [x] Negative/edge cases covered (missing assets, port options)

**Universal:**
- [x] BridgeContext patterns followed (N/A - Node CLI, not VS Code extension)
- [ ] Only in-scope files changed (minor: .fs2/config.yaml, .gitignore, .npmrc out of scope)
- [x] Linters/type checks are clean (TypeScript passes, Biome has minor import order findings)
- [x] Absolute paths used (import.meta.dirname pattern for asset discovery)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| SEC-001 | HIGH | web.command.ts:106-108 | Missing port validation | Add isNaN + range check (1-65535) |
| SEC-002 | HIGH | web.command.ts:146-150 | Env var inheritance exposes secrets | Allowlist safe variables only |
| COR-001 | HIGH | web.command.ts:175-183 | Signal handler accumulation | Use process.once() instead of process.on() |
| COR-002 | HIGH | web.command.ts:143-152 | Unhandled spawn() sync errors | Wrap in try/catch block |
| PERF-001 | CRITICAL | esbuild.config.ts:88-151 | 60MB bundle from unbounded copy | Implement selective asset whitelist |
| COR-003 | MEDIUM | esbuild.config.ts:141-148 | Hardcoded styled-jsx version | Use dynamic glob pattern |
| COR-004 | MEDIUM | cg.ts:88-96 | isMain string matching fragile | Normalize path with basename() |
| SEC-003 | MEDIUM | web.command.ts:138 | Full error paths exposed | Sanitize in production |
| COR-005 | MEDIUM | web.command.ts:155-165 | Case-sensitive ready detection | Use toLowerCase() comparison |
| COR-006 | MEDIUM | web.command.ts:186-188 | Silent non-zero exit | Log error code before exit |
| LINK-001 | HIGH | tasks.md, execution.log.md | Missing anchor IDs for cross-links | Add <!-- T001 --> anchors |
| LINK-002 | MEDIUM | tasks.md, plan.md | Task count mismatch (13 vs 16) | Synchronize plan task table |
| SCOPE-001 | LOW | .fs2/config.yaml | Out-of-scope tooling file | N/A (acceptable) |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Tests Rerun**: 39 tests total (14 CLI + 25 prior phases)
**Tests Failed**: 0
**Contracts Broken**: 0

Phase 4 does not regress any prior phase functionality. All 39 tests pass.

### E.1) Doctrine & Testing Compliance

#### TDD Compliance: PASS

The execution log shows strict RED-GREEN-REFACTOR order:
- T002 (tests RED) → T003-T004 (implementation) → T005 (tests GREEN)
- T007 (tests RED) → T008 (implementation) → T009 (tests GREEN)

All 14 tests include complete Test Doc blocks with:
- **Why**: User value rationale
- **Contract**: Behavioral expectations
- **Usage Notes**: Implementation guidance
- **Quality Contribution**: What the test catches
- **Worked Example**: Concrete usage pattern

#### Mock Policy Compliance: PASS

Zero `vi.mock()` or `vi.fn()` violations. Only `vi.spyOn(console, 'log')` used for output capture (acceptable per policy).

#### Graph Integrity: MINOR_ISSUES

**Task↔Log Links:**
- Forward links exist (tasks.md → execution.log.md)
- Backward links exist (execution.log.md → tasks.md header)
- **Issue**: No anchor IDs on log headings (## Task T001:) for deep linking

**Task↔Footnote Links:**
- All 16 tasks have footnotes [^20]-[^35]
- Footnote stubs are complete with file paths
- Plan § 12 uses consolidated [^20] for entire phase

**Footnote↔File Links:**
- All 11 node IDs are valid
- All referenced files exist in diff
- All function signatures verified at correct line numbers

**Plan↔Dossier Sync:**
- Status checkboxes match for completed tasks
- Task count mismatch: Plan has 13 tasks (4.1-4.13), Dossier has 16 (T001-T016)
- Plan missing T004 (detailed help), T006 (Next.js standalone), T010 (MCP stub), T015 (npx portability)

### E.2) Semantic Analysis

No semantic/business logic violations detected. Implementation matches plan specifications:
- `cg web` starts production server from bundled standalone assets
- `cg mcp` shows stub message for Phase 5
- `cg --help` and `cg --version` work correctly
- Port option accepts custom port values

### E.3) Quality & Safety Analysis

**Safety Score: 35/100** (CRITICAL: 1, HIGH: 4, MEDIUM: 5, LOW: 1)
**Verdict: REQUEST_CHANGES**

#### Security Findings

**SEC-001 [HIGH]** - `web.command.ts:106-108`
- **Issue**: Missing port number validation allows NaN and out-of-range values
- **Impact**: Server may bind to unpredictable ports or fail silently
- **Fix**: Add after parseInt: `if (isNaN(port) || port < 1 || port > 65535) throw new Error('Port must be 1-65535')`

**SEC-002 [HIGH]** - `web.command.ts:146-150`
- **Issue**: `...process.env` passes all parent environment variables to child
- **Impact**: API keys, tokens, credentials from npm/shell/CI inherited by spawned server
- **Fix**: Create allowlist: `env: { NODE_ENV: process.env.NODE_ENV || 'production', PORT, HOSTNAME }`

**SEC-003 [MEDIUM]** - `web.command.ts:138`
- **Issue**: Full file paths exposed in error messages
- **Impact**: Reveals internal directory structure to users
- **Fix**: Check NODE_ENV and sanitize messages in production

#### Correctness Findings

**COR-001 [HIGH]** - `web.command.ts:175-183`
- **Issue**: Multiple invocations add duplicate signal handlers
- **Impact**: Memory leak and cascaded signal forwarding
- **Fix**: Use `process.once('SIGINT', ...)` instead of `process.on()`

**COR-002 [HIGH]** - `web.command.ts:143-152`
- **Issue**: spawn() may throw synchronously but no try/catch wraps it
- **Impact**: Unhandled exception if node not found
- **Fix**: Wrap spawn() in try/catch block

**COR-003 [MEDIUM]** - `esbuild.config.ts:141-148`
- **Issue**: Hardcoded styled-jsx@5.1.6_react@19.2.3 path
- **Impact**: Build breaks when dependencies update
- **Fix**: Use glob pattern: `styled-jsx*/node_modules/styled-jsx`

**COR-004 [MEDIUM]** - `cg.ts:88-96`
- **Issue**: isMain detection uses string endsWith without path normalization
- **Impact**: May fail with symlinks or relative paths
- **Fix**: Use `path.basename(path.resolve(process.argv[1]))`

**COR-005 [MEDIUM]** - `web.command.ts:155-165`
- **Issue**: Case-sensitive 'Ready'/'started' matching
- **Impact**: Next.js version changes may break ready detection
- **Fix**: Use `output.toLowerCase().includes('ready')`

**COR-006 [MEDIUM]** - `web.command.ts:186-188`
- **Issue**: Server exit code not logged if non-zero
- **Impact**: Silent failures hard to debug
- **Fix**: Add conditional logging for non-zero exit codes

#### Performance Findings

**PERF-001 [CRITICAL]** - `esbuild.config.ts:88-151`
- **Issue**: Unbounded recursive copy inflates bundle from 48KB to 60MB
- **Impact**: Slow npm install, large distribution package
- **Fix**: Implement selective asset whitelist instead of copying all node_modules

---

## F) Coverage Map

**Testing Approach**: Full TDD
**Overall Coverage Confidence**: 85%

| Acceptance Criterion | Test File:Assertion | Confidence |
|---------------------|---------------------|------------|
| AC1: `cg --help` shows commands | cli-parser.test.ts: "should parse --help flag" | 100% (explicit) |
| AC2: `cg --version` works | cli-parser.test.ts: "should have version configured" | 100% (explicit) |
| AC3: `cg web` starts server | web-command.test.ts: "should accept port option" | 75% (behavioral) |
| AC4: `cg web --port` custom port | web-command.test.ts: "should accept port option" | 100% (explicit) |
| AC5: Asset discovery works | web-command.test.ts: "should find bundled standalone assets" | 100% (explicit) |
| AC6: Missing assets handled | web-command.test.ts: "should handle missing assets gracefully" | 100% (explicit) |
| AC7: MCP command exists | cli-parser.test.ts: "should register mcp command" | 100% (explicit) |
| AC8: MCP --stdio option | cli-parser.test.ts: "should have --stdio option" | 100% (explicit) |

**Narrative Tests**: None identified - all tests have clear criterion mapping via Test Doc blocks.

---

## G) Commands Executed

```bash
# Type checking
pnpm tsc --noEmit

# Linting
pnpm biome check .

# Test execution
pnpm vitest run --config test/vitest.config.ts

# Git diff computation
git diff HEAD --unified=3 --no-color
git status
```

---

## H) Decision & Next Steps

**Verdict**: REQUEST_CHANGES

**Blocking Issues** (must fix before merge):
1. SEC-001: Port validation (HIGH)
2. SEC-002: Environment variable allowlist (HIGH)
3. COR-001: Signal handler accumulation (HIGH)
4. COR-002: Spawn error handling (HIGH)

**Advisory Issues** (recommended but not blocking):
1. PERF-001: Bundle size optimization (CRITICAL for distribution quality)
2. COR-003: Dynamic styled-jsx resolution (MEDIUM)
3. LINK-002: Plan/dossier task synchronization (MEDIUM)

**Next Actions**:
1. Fix the 4 blocking HIGH issues per `fix-tasks.phase-4-cli-package.md`
2. Re-run `/plan-6-implement-phase` for fixes
3. Re-run `/plan-7-code-review` to verify
4. Once approved, merge and advance to Phase 5

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote Tag(s) | Plan Ledger Node ID(s) |
|-------------------|-----------------|------------------------|
| packages/cli/src/bin/cg.ts | [^22], [^23] | `file:...cg.ts`, `function:...createProgram` |
| packages/cli/src/commands/web.command.ts | [^27] | `file:...web.command.ts`, 3 functions |
| packages/cli/src/commands/mcp.command.ts | [^29] | `file:...mcp.command.ts` |
| packages/cli/src/index.ts | [^22] | `file:...index.ts` |
| packages/cli/esbuild.config.ts | [^30] | `file:...esbuild.config.ts` |
| packages/cli/package.json | [^31] | N/A (package.json) |
| apps/web/next.config.ts | [^25] | `file:...next.config.ts` |
| test/unit/cli/cli-parser.test.ts | [^21], [^24] | `file:...cli-parser.test.ts` |
| test/unit/cli/web-command.test.ts | [^26], [^28] | `file:...web-command.test.ts` |
| packages/cli/src/bin/index.ts | [^20] | N/A (barrel export) |
| packages/cli/src/commands/index.ts | [^20] | N/A (barrel export) |

---

**Review Status**: COMPLETE
**Report Generated**: 2026-01-19
