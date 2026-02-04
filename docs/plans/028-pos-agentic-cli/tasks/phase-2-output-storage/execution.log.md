# Phase 2: Output Storage — Execution Log

**Plan**: [../../pos-agentic-cli-plan.md](../../pos-agentic-cli-plan.md)
**Phase**: Phase 2: Output Storage
**Started**: 2026-02-03
**Status**: ✅ Complete

---

## Task T001: Write tests for saveOutputData service method
**Started**: 2026-02-03
**Status**: ✅ Complete

### What I Did
Created `output-storage.test.ts` with comprehensive TDD tests for all four output storage methods:
- saveOutputData (6 tests): saves value, merges with existing, handles JSON types, overwrites, E153 for unknown node
- saveOutputFile (7 tests): copies file, rejects path traversal, E179 for missing source, creates directory
- getOutputData (4 tests): reads value, E175 for missing, E153 for unknown node
- getOutputFile (4 tests): returns absolute path, E175 for missing, E153 for unknown node

### Evidence (TDD RED)
```
❯ test/unit/positional-graph/output-storage.test.ts (21 tests | 21 failed) 29ms
   × PositionalGraphService — saveOutputData > saves value to data.json with outputs wrapper
     → service.saveOutputData is not a function
   × PositionalGraphService — saveOutputData > merges with existing outputs
     → service.saveOutputData is not a function
   [... all 21 tests fail because methods don't exist yet]
```

Tests correctly fail because service methods don't exist yet - TDD RED phase complete.

### Files Changed
- `test/unit/positional-graph/output-storage.test.ts` — Created (new file, 21 tests)

**Completed**: 2026-02-03

---

## Task T002: Add SaveOutputDataResult type and interface signature
**Started**: 2026-02-03
**Status**: ✅ Complete

### What I Did
Added 4 result types and 4 method signatures to `positional-graph-service.interface.ts`:
- `SaveOutputDataResult` - nodeId, outputName, saved
- `SaveOutputFileResult` - nodeId, outputName, saved, filePath
- `GetOutputDataResult` - nodeId, outputName, value
- `GetOutputFileResult` - nodeId, outputName, filePath

### Evidence
TypeScript correctly reports missing implementations (expected):
```
TS2420: Class 'PositionalGraphService' incorrectly implements interface 'IPositionalGraphService'.
  Type 'PositionalGraphService' is missing the following properties: saveOutputData, saveOutputFile, getOutputData, getOutputFile
```

### Files Changed
- `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` — Added 4 result types and 4 method signatures

**Completed**: 2026-02-03

---

## Task T003: Implement saveOutputData in service (and all 4 methods)
**Started**: 2026-02-03
**Status**: ✅ Complete

### What I Did
Implemented all 4 output storage methods in `positional-graph.service.ts`:

1. **saveOutputData** — Saves JSON value to `nodes/{nodeId}/data/data.json` with `{ "outputs": {...} }` wrapper
   - Verifies node exists via `loadNodeConfig`
   - Creates data directory if missing
   - Loads existing data.json or creates empty structure
   - Merges new output value
   - Writes atomically via `atomicWriteFile`

2. **saveOutputFile** — Copies file to `nodes/{nodeId}/data/outputs/` with path traversal prevention
   - Rejects `..` in output name and source path (security)
   - Verifies node exists
   - Verifies source file exists
   - Creates outputs directory if missing
   - Copies file content
   - Records relative path in data.json

3. **getOutputData** — Retrieves stored value from data.json
   - Verifies node exists
   - Returns E175 if data.json missing or output not found
   - Returns the stored value

4. **getOutputFile** — Returns absolute path to stored file
   - Verifies node exists
   - Returns E175 if data.json missing or output not found
   - Converts relative path to absolute path

### Evidence (TDD GREEN)
```
pnpm test -- --run test/unit/positional-graph/output-storage.test.ts

 ✓ test/unit/positional-graph/output-storage.test.ts (21 tests) 30ms

 Test Files  1 passed (1)
      Tests  21 passed (21)
```

All 21 tests pass — TDD GREEN phase complete.

### Files Changed
- `packages/positional-graph/src/services/positional-graph.service.ts` — Added 4 service methods (~180 lines)

**Completed**: 2026-02-03

---

## Tasks T004, T008, T011, T014: Add CLI commands for output storage
**Started**: 2026-02-03
**Status**: ✅ Complete

### What I Did
Added 4 CLI commands to `positional-graph.command.ts`:

1. **save-output-data** `<graph> <nodeId> <outputName> <valueJson>` — Save JSON value to node
   - Parses JSON value (with error handling for invalid JSON)
   - Calls `service.saveOutputData()`
   - Returns result with `saved`, `nodeId`, `outputName`

2. **save-output-file** `<graph> <nodeId> <outputName> <sourcePath>` — Copy file to node
   - Calls `service.saveOutputFile()`
   - Returns result with `saved`, `nodeId`, `outputName`, `filePath`

3. **get-output-data** `<graph> <nodeId> <outputName>` — Retrieve stored value
   - Calls `service.getOutputData()`
   - Returns result with `value`, `nodeId`, `outputName`

4. **get-output-file** `<graph> <nodeId> <outputName>` — Get file path
   - Calls `service.getOutputFile()`
   - Returns result with `filePath`, `nodeId`, `outputName`

### Evidence
```bash
$ node apps/cli/dist/cli.cjs wf node save-output-data --help
DESCRIPTION
  Save an output data value (JSON) to a node
```

CLI builds and help displays correctly.

### Files Changed
- `apps/cli/src/commands/positional-graph.command.ts` — Added 4 handlers and 4 command registrations (~120 lines)

**Completed**: 2026-02-03

---

## Code Review Fixes
**Started**: 2026-02-03
**Status**: ✅ Complete

### Issues Addressed

**F01: Missing interface exports (Critical)**
- Added 4 result type exports to `interfaces/index.ts`:
  - `GetOutputDataResult`
  - `GetOutputFileResult`
  - `SaveOutputDataResult`
  - `SaveOutputFileResult`

**F02: Incomplete path traversal prevention (Critical)**
- Enhanced `saveOutputFile` security:
  - Added rejection of `/` and `\` in output names (not just `..`)
  - Added `resolvePath()` call with try/catch for containment checking
  - Added explicit normalization-based containment verification
  - Destination path must start with normalized outputsDir prefix

**F03: fileNotFoundError() signature mismatch (Critical)**
- Updated `fileNotFoundError()` to accept optional `reason` parameter
- Signature: `fileNotFoundError(sourcePath: string, reason?: string): ResultError`
- When reason provided: `"File error for '<path>': <reason>"`
- When no reason: `"Source file not found: <path>"` (backward compatible)

### Evidence
```
pnpm typecheck - passes
pnpm test -- --run test/unit/positional-graph/output-storage.test.ts
 ✓ test/unit/positional-graph/output-storage.test.ts (21 tests) 37ms
 Test Files  1 passed (1)
      Tests  21 passed (21)
```

### Files Changed
- `packages/positional-graph/src/interfaces/index.ts` — Added 4 exports
- `packages/positional-graph/src/errors/positional-graph-errors.ts` — Updated fileNotFoundError signature
- `packages/positional-graph/src/services/positional-graph.service.ts` — Enhanced path traversal prevention

**Completed**: 2026-02-03

---

