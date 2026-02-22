# Code Review: Phase 5 — Export Wiring and Documentation

**Plan**: 034-agentic-cli
**Phase**: Phase 5: Export Wiring and Documentation
**Diff range**: `f8b0a14..5765586`
**Date**: 2026-02-16
**Testing Approach**: Lightweight (docs-only phase; overall plan is Full TDD)
**Mock Usage**: N/A (no test files in diff)

---

## A) Verdict: REQUEST_CHANGES

Phase 5 implementation is functionally correct — all barrel exports compile, documentation is comprehensive, and all 3858 tests pass. However, the phase has **critical graph integrity failures** (no execution log, dossier not updated, no footnotes) and one **HIGH documentation accuracy issue** (non-compiling code example).

---

## B) Summary

Phase 5 adds 7 missing type exports to `@chainglass/shared`, creates two developer guide documents, and adds a quick-start section to README.md. The code changes are minimal and correct. All tests pass (3858 passed, 54 skipped). TypeScript compiles cleanly for `packages/shared` and `apps/cli` (pre-existing errors in `positional-graph` and `mcp-server` are unrelated).

The review flags two categories of issues:
1. **Graph integrity**: `plan-6a-update-progress` was never run — no execution log, dossier tasks unchecked, no footnotes, no log links in plan table.
2. **Documentation accuracy**: One code example in `2-usage.md` won't compile (passes non-existent `adapter` property to `FakeAgentInstance`). The `AgentType` → `AgentInstanceType` rename creates a mismatch between docs and exports.

---

## C) Checklist

**Testing Approach: Lightweight (documentation phase)**

- [x] Core validation tests present (all 3858 pass — no regressions)
- [x] Critical paths covered (barrel exports compile, `tsc --noEmit` clean)
- [x] Key verification points documented (AC-47 through AC-50 checked off in plan)
- [x] No BridgeContext patterns applicable (docs + exports only)
- [x] Only in-scope files changed (plus justified neighbor: Phase 4 dossier footnote stubs)
- [x] Linters/type checks clean (pre-existing unrelated errors only)
- [x] Absolute paths used correctly (no hidden context assumptions)
- [ ] **Execution log created** — MISSING
- [ ] **Dossier task statuses updated** — all 6 remain `[ ]`
- [ ] **Plan footnotes created for Phase 5** — none exist
- [ ] **Plan Log column updated** — all show `-`
- [ ] **Documentation code examples compile** — SEM-01 fails

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| V1-F1 | CRITICAL | (missing file) | No execution log exists | Create `execution.log.md` via `plan-6a` |
| V3-F1 | CRITICAL | plan + dossier | All 6 tasks: plan [x] vs dossier [ ] | Run `plan-6a` to sync statuses |
| V1-F2 | CRITICAL | plan:622-630 | Plan Log column shows `-` for all 5.x tasks | Add [📋] log links |
| SEM-01 | HIGH | 2-usage.md:84-88 | FakeAgentInstance example passes non-existent `adapter` prop | Remove `adapter: fakeAdapter` |
| V2-F1 | HIGH | plan:734-744 | No Phase 5 footnote in Change Footnotes Ledger | Add [^8] for Phase 5 changes |
| V2-F2 | HIGH | plan:622-630 | No [^N] footnote tags in 5.x Notes column | Add footnote refs |
| V3-F2 | HIGH | plan:622-630 | Missing [📋] log links in 5.x Log column | Add log links after creating exec log |
| V3-F3 | HIGH | plan:622-630 | No footnote tags in 5.x Notes column | Add [^8] refs |
| V4-F1 | HIGH | plan:734-744 | 4 changed files have no footnotes | Create footnotes for changed files |
| V1-F3 | HIGH | (missing file) | 6 completed tasks have no log entries | Create execution log with entries |
| SEM-02 | MEDIUM | 1-overview.md:46 | Property table says `AgentType` but export is `AgentInstanceType` | Update docs to match export name |
| SEM-03 | MEDIUM | README.md + 2-usage.md | AdapterFactory example hides `type` parameter | Use `(type) => ...` in examples |
| V2-F3 | MEDIUM | dossier:tasks.md | No Phase Footnote Stubs section in dossier | Add stubs section |
| F-001 | MEDIUM | dossier:tasks.md | Dossier created in implementation diff (should precede plan-6) | Process note for future phases |
| SEM-04 | LOW | 2-usage.md:33-41 | Event types table shows 5 of 9+ types without indicating subset | Add "common types" note |
| SEM-05 | LOW | 1-overview.md:24-28 | State diagram error→stopped arrow skips intermediate `working` | Clarify retry path |
| F-002 | LOW | dossier T001 | Lists `AgentEventHandler` as missing but it was already exported | Update dossier description |
| F-003 | LOW | index.ts:226 | Undocumented `AgentInstanceType` alias added (not in T001 list) | Add to T001 description |
| V2-F4 | LOW | plan:734-744 | Footnote sequence gaps: [^4], [^5] missing (pre-existing) | Cosmetic — optional fix |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Tests rerun**: 3858 passed, 54 skipped, 0 failures.
**Contracts broken**: 0. `packages/shared` and `apps/cli` compile cleanly.
**Integration points**: Barrel exports add new public surface — no existing exports changed.
**Backward compatibility**: All pre-existing exports unchanged. AC-48 (IAgentAdapter unchanged) and AC-49 (AgentService unchanged) verified.

**Verdict**: PASS — no regressions.

### E.1) Doctrine & Testing Compliance

#### Graph Integrity (Step 3a)

**Graph Integrity Verdict: BROKEN** (3 CRITICAL, 7 HIGH)

The Phase 5 traceability graph is completely disconnected. `plan-6a-update-progress` was never run after implementation.

**Task↔Log**: FAIL. No execution log exists. Plan task table shows `-` in Log column for all 5.x tasks. Phase 4 correctly has `[📋]` links — Phase 5 skipped this entirely.

**Task↔Footnote**: FAIL. No Phase 5 footnotes in the Change Footnotes Ledger. Footnotes go [^1]→[^2]→[^3]→[^6]→[^7] with no Phase 5 entry. Dossier has no Footnote Stubs section.

**Plan↔Dossier Sync**: FAIL. All 6 tasks show contradictory statuses — plan [x] vs dossier [ ]. This is the most visible issue: the dossier was created as a new file in the implementation diff and its task statuses were never updated.

**Footnote↔File**: SKIP. No footnotes exist to validate.

#### Plan Authority (Step 3c)

N/A — no footnotes to conflict between plan and dossier.

#### Testing Doctrine (Step 4)

Phase 5 is labeled "Lightweight Approach for Documentation" in the plan section header, while the plan overall declares "Full TDD". This is appropriate — Phase 5 adds no new behavior, only exports and documentation. No test files in the diff. Regression validated by `just fft` (3858 tests pass).

**Mock usage**: N/A (no test files).

**Scope guard**: PASS with one justified neighbor. Changed files match task table paths. Phase 4 dossier touched for footnote stubs (justified plan-6a bookkeeping).

### E.2) Semantic Analysis

**SEM-01 (HIGH)**: `docs/how/agent-system/2-usage.md` lines 84-88 — The `FakeAgentInstance` test example creates a `FakeAgentAdapter` and passes `adapter: fakeAdapter` in the config object. `AgentInstanceConfig` has no `adapter` property. `FakeAgentInstance` constructor signature is `(config: AgentInstanceConfig, options?: FakeAgentInstanceOptions)` — it doesn't accept an adapter. This code example will produce a TypeScript error when copy-pasted.

**Fix**: Remove the `FakeAgentAdapter` instantiation and the `adapter: fakeAdapter` property:
```diff
-import { FakeAgentInstance, FakeAgentManagerService } from '@chainglass/shared';
-import { FakeAgentAdapter } from '@chainglass/shared'; // from fakes barrel
-
-// Direct fake instance
-const fakeAdapter = new FakeAgentAdapter();
-const instance = new FakeAgentInstance({
-  id: 'test-1', name: 'test', type: 'claude-code', workspace: '/tmp',
-  adapter: fakeAdapter,
-});
+import { FakeAgentInstance, FakeAgentManagerService } from '@chainglass/shared';
+
+// Direct fake instance
+const instance = new FakeAgentInstance({
+  id: 'test-1', name: 'test', type: 'claude-code', workspace: '/tmp',
+});
```

**SEM-02 (MEDIUM)**: `docs/how/agent-system/1-overview.md` line 46 — Property table lists `type` as `AgentType` but the public export from `@chainglass/shared` renames it to `AgentInstanceType`. A developer writing `import type { AgentType } from '@chainglass/shared'` will get a compile error.

**SEM-03 (MEDIUM)**: `README.md` and `2-usage.md` — `AgentManagerService` constructor examples use a zero-arg factory `() => new ClaudeCodeAdapter(...)` but `AdapterFactory` is typed as `(type: AgentType) => IAgentAdapter`. While TypeScript accepts this (arity relaxation), it hides the `type` parameter that selects between adapter types.

### E.3) Quality & Safety Analysis

**Safety Score: 100/100** — No correctness, security, performance, or observability issues. Phase 5 is documentation and barrel exports only with no runtime behavior changes.

**Correctness**: All barrel exports are valid TypeScript. No duplicate exports, no type conflicts between 019 and 034 barrels. `AgentEventHandler` correctly NOT duplicated (already exported via interfaces barrel at line 95).

**Security**: No user input handling, no secrets, no network calls.

**Performance**: N/A.

**Observability**: N/A.

### E.4) Doctrine Evolution Recommendations (Advisory)

No new ADRs, rules, or idioms recommended. Phase 5 is documentation-only with no new patterns.

**Positive alignment**: Implementation correctly follows PlanPak barrel export pattern (feature folder → main index.ts re-export), consistent with Plan 019's established approach.

---

## F) Coverage Map

| Acceptance Criterion | Evidence | Confidence |
|---------------------|----------|------------|
| AC-47: All types importable from `@chainglass/shared` | `tsc --noEmit` clean for `packages/shared` | 100% |
| AC-48: IAgentAdapter unchanged | No changes to `interfaces/agent-adapter.interface.ts` in diff | 100% |
| AC-49: AgentService unchanged as module | No changes to `services/` in diff | 100% |
| AC-50: Plan 030 E2E tests pass | 3858 tests pass including E2E suite | 100% |
| README quick-start | README.md diff adds agent system section with code examples | 100% |
| docs/how/agent-system/ guides | Both 1-overview.md and 2-usage.md created with required content | 100% |
| `just fft` passes | 3858 passed, 54 skipped, 0 failures (94.32s) | 100% |

**Overall coverage confidence: 100%** — all acceptance criteria verified.

---

## G) Commands Executed

```bash
# Diff generation
git diff f8b0a14..5765586 --stat
git diff f8b0a14..5765586 --unified=3 --no-color

# Type checking
npx tsc --noEmit -p packages/shared/tsconfig.json  # clean
npx tsc --noEmit -p apps/cli/tsconfig.json          # 184 errors, all pre-existing (positional-graph, mcp-server)

# Tests
pnpm test  # 3858 passed, 54 skipped, 0 failures

# Export verification
grep -n "AgentEventHandler" packages/shared/src/index.ts  # line 95 (already exported)
grep -n "FakeAgentAdapter" packages/shared/src/index.ts    # line 122 (exported)
```

---

## H) Decision & Next Steps

**Verdict: REQUEST_CHANGES**

The implementation itself is correct and all acceptance criteria are met. The request for changes is driven by:

1. **Graph integrity** (3 CRITICAL): Run `plan-6a-update-progress` to create execution log, sync dossier statuses, add footnotes, and populate plan log/notes columns.
2. **Documentation accuracy** (1 HIGH): Fix `FakeAgentInstance` code example in `2-usage.md`.

**Fix priority**:
1. Fix SEM-01 (non-compiling code example) — 2 minutes
2. Run `plan-6a` to fix all graph integrity issues — 5 minutes
3. Optionally fix SEM-02 (AgentType vs AgentInstanceType) and SEM-03 (factory arity) — 5 minutes

After fixes, rerun `plan-7-code-review` to verify graph integrity is restored.

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote Tag(s) | Node-ID Link(s) |
|--------------------|-----------------|------------------|
| `packages/shared/src/index.ts` | (none) | (none) |
| `README.md` | (none) | (none) |
| `docs/how/agent-system/1-overview.md` | (none) | (none) |
| `docs/how/agent-system/2-usage.md` | (none) | (none) |
| `docs/plans/034-agentic-cli/agentic-cli-plan.md` | (plan metadata) | (plan metadata) |
| `docs/plans/034-agentic-cli/tasks/phase-4-.../tasks.md` | [^6], [^7] | Phase 4 files |
| `docs/plans/034-agentic-cli/tasks/phase-5-.../tasks.md` | (none) | (none) |

**Footnote coverage**: 0/4 deliverable files have footnotes. All 4 should be covered by a Phase 5 footnote entry in the Change Footnotes Ledger.
