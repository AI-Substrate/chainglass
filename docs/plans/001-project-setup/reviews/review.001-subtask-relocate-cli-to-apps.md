# Code Review: Subtask 001 - Relocate CLI to apps/

**Subtask**: `001-subtask-relocate-cli-to-apps`
**Review Date**: 2026-01-20
**Reviewer**: AI Code Review Agent
**Testing Approach**: Manual (verification uses existing test infrastructure)

---

## A) Verdict

## ✅ APPROVE

All 11 tasks completed successfully. Implementation matches subtask specification exactly. No security, correctness, or compliance issues found.

---

## B) Summary

The CLI package was successfully relocated from `packages/cli` to `apps/cli` to align with monorepo conventions:
- **8 configuration files** updated with correct path changes
- **3 test files** updated (justified neighbor modifications)
- **66 tests** continue to pass
- **CLI commands** (`cg --help`, `cg web`, `cg mcp`) verified working
- All 5 Critical Insights (DYK-01 through DYK-05) confirmed and addressed
- Git history preserved via `git mv`

---

## C) Checklist

**Testing Approach: Manual** (verification uses existing test infrastructure)

- [x] Manual verification steps documented (ST001, ST009, ST010, ST011)
- [x] Manual test results recorded with observed outcomes
- [x] All acceptance criteria manually verified
- [x] Evidence artifacts present (command outputs in execution log)

**Universal (all approaches)**:
- [x] Only in-scope files changed (+ 3 justified neighbors)
- [x] Pre-existing lint/typecheck issues noted (out-of-scope files)
- [x] Absolute paths used where required (esbuild, tsconfig)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| – | – | – | No findings | – |

**Zero findings.** All changes are correct and well-documented.

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Skipped**: This is a post-phase subtask (Phase 6 was already complete). No prior phases to regress against.

**Verification**: The 66 tests that pass include tests from all prior phases:
- Phase 2: 18 logger contract tests ✓
- Phase 3: 7 DI container tests ✓
- Phase 4: 14 CLI tests ✓
- Phase 5: 21 MCP server tests ✓
- Integration: 6 misc tests ✓

### E.1) Doctrine & Testing Compliance

**Graph Integrity**: ✅ INTACT
- All 11 tasks (ST001-ST011) have corresponding execution log entries
- Execution log references back to task IDs
- Status markers (✅ Complete) properly used

**Scope Compliance**: ✅ PASS
| Category | Count | Files |
|----------|-------|-------|
| In-scope | 8 | Directory move + 7 config files |
| Justified neighbors | 3 | Test files with hardcoded CLI paths |
| Documentation | 2 | Subtask dossier + execution log |
| Out-of-scope violations | 0 | – |

**Test file justification**: The 3 test files (`mcp-stdio.test.ts`, `stdio-transport.test.ts`, `check-health.test.ts`) had hardcoded paths to `packages/cli/dist/cli.cjs` that required updating for tests to pass during verification (ST009). This is documented in the execution log.

### E.2) Semantic Analysis

All path changes verified mathematically correct:

| File | Change | Verification |
|------|--------|--------------|
| esbuild.config.ts | `'..', '..', 'apps', 'web'` → `'..', 'web'` | From `apps/cli`, `../web` = `apps/web` ✓ |
| apps/cli/tsconfig.json | `../shared` → `../../packages/shared` | From `apps/cli`, `../../packages/shared` = `packages/shared` ✓ |
| tsconfig.json | `./packages/cli/src` → `./apps/cli/src` | Root-relative path ✓ |
| vitest.config.ts | `packages/cli/src` → `apps/cli/src` | Root-relative path ✓ |
| package.json | `./packages/cli/dist` → `./apps/cli/dist` | Root-relative path ✓ |
| justfile | `cd packages/cli` → `cd apps/cli` | Root-relative path ✓ |

### E.3) Quality & Safety Analysis

**Safety Score: 100/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0)

**Security Review**: ✅ No vulnerabilities
- No path traversal issues
- No hardcoded absolute paths
- All relative paths correctly calculated

**Correctness Review**: ✅ All logic correct
- Directory structure verified: `apps/cli/` exists, `packages/cli/` removed
- All configurations point to correct locations
- Build artifacts created at `apps/cli/dist/`

**Performance Review**: ✅ No regressions
- Test duration: 3.84-4.01s (unchanged)
- Build caching still functional

**Observability Review**: ✅ N/A (no logging changes)

---

## F) Coverage Map

**Testing Approach**: Manual verification via existing test infrastructure

| Acceptance Criterion | Verification | Confidence |
|---------------------|--------------|------------|
| Directory at apps/cli | `ls -la apps/cli/` | 100% |
| Git history preserved | `git mv` used (R status in diff) | 100% |
| Tests pass | `just test` = 66 pass | 100% |
| CLI works | `cg --help`, `cg web`, `cg mcp` | 100% |
| Build works | `apps/cli/dist/` exists | 100% |
| Invariant: Test count = 66 | `just test` output | 100% |
| Invariant: CLI functional | Manual verification | 100% |

**Overall Coverage Confidence**: 100%

---

## G) Commands Executed

```bash
# Pre-flight (ST001)
just check

# Move directory (ST002)
git mv packages/cli apps/cli

# Configuration updates (ST003-ST007)
# Edits to: tsconfig.json, apps/cli/tsconfig.json, vitest.config.ts,
#           package.json, justfile, esbuild.config.ts

# Reinstall (ST008)
pnpm install

# Test verification (ST009)
just test  # 66 tests pass

# CLI verification (ST010)
npm unlink -g @chainglass/cli
npm unlink -g chainglass
cd apps/cli && npm link
cg --help
cg --version
cg mcp --help
cg web --port 3459

# Quality gate (ST011)
just format  # 61 files, 2 fixed
just test    # 66 tests pass
```

---

## H) Decision & Next Steps

### Decision

**✅ APPROVE** – Implementation is complete and correct.

### Pre-existing Issues (Out of Scope)

The following pre-existing issues were noted but are **not related** to this subtask:

1. **Lint failures** in:
   - `.vsc-bridge/host.json` – VS Code extension bridge file
   - `scripts/agents/copilot-session-demo.ts` – Demo script

2. **Typecheck failures** in:
   - `scripts/agents/copilot-session-demo.ts` – `isolatedModules` export issue

These existed before the subtask and should be addressed separately.

### Next Steps

1. **Commit the changes** – All modifications ready for commit
2. **Update subtask registry** – Mark 001-subtask-relocate-cli-to-apps as `[x] Complete` in plan
3. **Optional cleanup** – Address pre-existing lint/typecheck issues in separate PR

---

## I) Footnotes Audit

| Diff-Touched Path | Phase/Task | Change Type |
|-------------------|------------|-------------|
| `packages/cli/*` → `apps/cli/*` | ST002 | Directory rename |
| `tsconfig.json` | ST003 | Path alias update |
| `apps/cli/tsconfig.json` | ST003a | References path fix |
| `test/vitest.config.ts` | ST004 | Alias update |
| `package.json` | ST005 | Bin paths update |
| `justfile` | ST006 | Install path update |
| `apps/cli/esbuild.config.ts` | ST007 | webRoot path fix |
| `pnpm-lock.yaml` | ST008 | Auto-generated |
| `test/integration/mcp-stdio.test.ts` | ST009 | CLI path update |
| `test/unit/mcp-server/check-health.test.ts` | ST009 | CLI path update |
| `test/unit/mcp-server/stdio-transport.test.ts` | ST009 | CLI path update |

**All changes traced to documented tasks.**

---

## Appendix: Critical Insights Confirmed

| Insight | Status | Impact |
|---------|--------|--------|
| DYK-01: Git History Preservation | ✅ Confirmed | `git mv` preserves rename tracking |
| DYK-02: esbuild Path Simplification | ✅ Confirmed | `../web` cleaner than `../../apps/web` |
| DYK-03: npm Global Link Cleanup | ✅ Confirmed | Stale links needed cleanup |
| DYK-04: pnpm-workspace.yaml | ✅ Confirmed | `apps/*` glob auto-covers apps/cli |
| DYK-05: CLI tsconfig References | ✅ Confirmed | CRITICAL fix: `../shared` → `../../packages/shared` |

---

**Review Complete**: 2026-01-20
**Verdict**: ✅ **APPROVE**
