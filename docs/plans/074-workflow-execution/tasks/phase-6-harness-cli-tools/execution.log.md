# Execution Log: Phase 6 — Harness + CLI Tools

**Phase**: Phase 6: Harness + CLI Tools
**Started**: 2026-03-16
**Implementor**: plan-6-v2

---

## Pre-Flight

- **Harness validation**: Deferred — Phase 6 builds harness tooling itself
- **Baseline tests**: 5568 passing, 4 pre-existing 040-graph-inspect failures

---

## Task Log

### Stage 1: CLI Unit Commands ✅
- T001: `cg unit update <slug>` — 8 flags (--patch, --set, --add-input, --add-output, --description, --version, --inputs-json, --outputs-json). Guarded file reads, JSON parsing, load failures (FT-004).
- T002: `cg unit delete <slug>` — idempotent. Service method exists; CLI is thin wrapper.
- Fixed create() call signature: `service.create(ctx, slug, type)` → `service.create(ctx, { slug, type })`.
- Changed import from `@chainglass/workgraph` to `@chainglass/positional-graph` IWorkUnitService (has update/delete).

### Stage 2: runCg + Constants + Patches ✅
- T003: `runCg()` helper — local execFile or Docker exec routing. CLI build freshness check on first call. ▸ prefix on stderr.
- T004: `constants.ts` — TEST_DATA with separate templateSlug/workflowId (P6-DYK #2).
- T005: 3 YAML patch files (test-agent, test-code, test-user-input).

### Stage 3-4: Test-data Commands ✅
- T006-T009: create units/template/workflow/env — all idempotent (delete-first per P6-DYK #3).
- T010: clean/status/run/stop lifecycle commands.

### Stage 5: Registration + Docs ✅
- T011: Commander.js `test-data` command group in harness CLI.
- T012: `just test-data` recipe in justfile.
- T013: Harness README updated with 8 test-data commands.
- T014: `docs/how/workflow-execution.md` how-to guide.

### Code Review Fix Tasks ✅
- FT-001: Container mode uses `computePorts()` for container name.
- FT-002: `cg template delete` implemented end-to-end (interface → service → CLI).
- FT-003: This execution log + task status updates.
- FT-004: Guarded file reads, JSON parsing, --add-input/output load failures.
- FT-005: Domain history updated for positional-graph.
- FT-006: Removed dead `deleteIfExists()` helper.

---

## Verification

- `node apps/cli/dist/cli.cjs unit update --help` — shows all 8 flags ✓
- `node apps/cli/dist/cli.cjs unit delete --help` — shows command ✓
- `node apps/cli/dist/cli.cjs template delete --help` — shows command ✓
- Tests: 5568 passing, 4 pre-existing failures (040-graph-inspect), 0 regressions ✓
- CLI build: successful, includes update/delete/template-delete ✓
