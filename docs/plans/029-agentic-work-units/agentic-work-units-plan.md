# Agentic Work Units Implementation Plan

**Plan Version**: 1.0.1
**Created**: 2026-02-04
**Spec**: [./agentic-work-units-spec.md](./agentic-work-units-spec.md)
**Status**: READY

**Workshops**:
- [workunit-loading.md](./workshops/workunit-loading.md) - Data Model + Integration
- [e2e-test-enrichment.md](./workshops/e2e-test-enrichment.md) - Test Strategy

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [File Placement Manifest](#file-placement-manifest)
6. [Implementation Phases](#implementation-phases)
   - [Phase 1: Types and Schemas](#phase-1-types-and-schemas)
   - [Phase 2: Service and Adapter](#phase-2-service-and-adapter)
   - [Phase 3: CLI Integration](#phase-3-cli-integration)
   - [Phase 4: Test Enrichment](#phase-4-test-enrichment)
   - [Phase 5: Cleanup and Documentation](#phase-5-cleanup-and-documentation)
7. [ADR Ledger](#adr-ledger)
8. [Cross-Cutting Concerns](#cross-cutting-concerns)
9. [Complexity Tracking](#complexity-tracking)
10. [Progress Tracking](#progress-tracking)
11. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem Statement**: The positional-graph system currently only has `NarrowWorkUnit` (slug, inputs, outputs) which lacks type discrimination and configuration access. Running agents cannot programmatically access their prompt templates, and the system cannot distinguish unit types at runtime.

**Solution Approach**:
- Create discriminated union types (`AgenticWorkUnit`, `CodeUnit`, `UserInputUnit`) in positional-graph
- Implement `IWorkUnitService` with template content access via `getTemplateContent()`
- Add reserved parameter routing (`main-prompt`, `main-script`) to CLI
- Enrich E2E test fixtures and add sections 13-15

**Expected Outcomes**:
- Type-safe work unit loading with Zod validation
- Reserved parameter routing for template content access
- Backward compatibility with existing `NarrowWorkUnit` consumers
- Complete E2E coverage for all unit types

**Success Metrics**:
- All 10 acceptance criteria from spec verified
- Zero breaking changes to existing `collateInputs()` consumers
- E2E test sections 13-15 passing

---

## Technical Context

### Current System State

The positional-graph system has minimal work unit support:
- `NarrowWorkUnit` interface: `{ slug, inputs, outputs }` only
- `IWorkUnitLoader.load()`: Returns narrow type for input resolution
- DI bridge: `IWorkUnitLoader` currently wired to legacy workgraph's `IWorkUnitService`

### Integration Requirements

1. **Structural Compatibility**: New `WorkUnit` types must satisfy `NarrowWorkUnit` (structural subtyping)
2. **DI Transition**: Replace workgraph bridge with new positional-graph `IWorkUnitService`
3. **CLI Routing**: Detect reserved parameters and route to template content access
4. **Test Infrastructure**: Add enriched fixtures and stub services for testing

### Constraints and Limitations

- **GREENFIELD**: No imports from legacy `@chainglass/workgraph` package
- **PlanPak**: New files organized in `features/029-agentic-work-units/` directories
- **Fakes Only**: No mocks/stubs - use fake implementations
- **Required Type Field**: Units must declare `type` explicitly (no fallback)

### Assumptions

1. Existing `NarrowWorkUnit` consumers only access `slug`, `inputs`, `outputs`
2. Reserved params (`main-prompt`, `main-script`) don't conflict with user input names (schema prevents hyphens)
3. Template content is static - accessible regardless of node execution state

---

## Critical Research Findings

### 🚨 Critical Discovery 01: Structural Compatibility Constraint

**Impact**: Critical
**Sources**: [R1-01, I1-07]
**Problem**: `WorkUnit` must structurally satisfy `NarrowWorkUnit` or DI breaks at runtime when `collateInputs()` consumers use loaded units.
**Root Cause**: TypeScript structural typing requires field-by-field compatibility.
**Solution**:
```typescript
// Add compile-time assertion in workunit.types.ts
type _AssertCompatible = WorkUnit extends NarrowWorkUnit ? true : never;
```
**Action Required**: Add type assertion test and verify with `collateInputs()` integration test.
**Affects Phases**: Phase 1, Phase 2

### 🚨 Critical Discovery 02: Path Escape Security Vulnerability

**Impact**: Critical
**Sources**: [R1-03]
**Problem**: Malicious `prompt_template` path like `../../../.env` could leak sensitive data.
**Root Cause**: Template paths are user-specified in `unit.yaml`.
**Solution**:
```typescript
const fullPath = pathResolver.resolve(unitDir, templatePath);
if (!fullPath.startsWith(unitDir + pathResolver.sep)) {
  return { errors: [unitPathEscapeError(slug, templatePath)] };
}
```
**Action Required**: Implement path containment check in `getTemplateContent()`.
**Affects Phases**: Phase 2

### 🔴 High Discovery 03: DI Container Transition Strategy

**Impact**: High
**Sources**: [R1-06, I1-04]
**Problem**: Incorrect DI wiring could break `collateInputs()` or create circular dependencies.
**Root Cause**: `IWorkUnitLoader` currently bridges to workgraph.
**Solution**: Incremental transition - add new service first, update binding, then remove bridge.
**Action Required**: Register `IWorkUnitService`, wire `IWorkUnitLoader` to it, remove workgraph bridge.
**Affects Phases**: Phase 3, Phase 5

### 🔴 High Discovery 04: Reserved Parameter Detection

**Impact**: High
**Sources**: [R1-05, I1-05]
**Problem**: Must distinguish reserved params from normal inputs.
**Root Cause**: CLI `get-input-data` command handles both paths.
**Solution**: Exact string match on `main-prompt` and `main-script` - no collision possible because user input names use underscores (per schema: `/^[a-z][a-z0-9_]*$/`), reserved params use hyphens.
**Action Required**: Add `RESERVED_INPUT_PARAMS` constant and routing logic.
**Affects Phases**: Phase 3

### 🔴 High Discovery 05: Type Field Required - Migration Needed

**Impact**: High
**Sources**: [R1-04, Spec Q7]
**Problem**: Existing `unit.yaml` files without `type` field will fail validation.
**Root Cause**: Spec mandates strict validation - `type` field is required.
**Solution**: Update existing unit files to include `type` field as part of implementation.
**Action Required**: Migrate `.chainglass/data/units/*/unit.yaml` files in Phase 5.
**Affects Phases**: Phase 5

### 🟡 Medium Discovery 06: Error Code Allocation

**Impact**: Medium
**Sources**: [R1-02, I1-08]
**Problem**: E180-E187 range must not collide with existing codes.
**Root Cause**: Positional-graph uses E150-E179, workgraph uses E101-E199.
**Solution**: E180-E187 verified available. Add `WORKUNIT_ERROR_CODES` constant.
**Action Required**: Create error factory functions in `workunit-errors.ts`.
**Affects Phases**: Phase 1

### 🟡 Medium Discovery 07: Zod Discriminated Union Validation

**Impact**: Medium
**Sources**: [R1-07]
**Problem**: Discriminated union errors can be cryptic without transformation.
**Root Cause**: Zod's default error messages reference internal paths.
**Solution**: Create `formatZodErrors()` utility for actionable E182 messages.
**Action Required**: Transform Zod issues to user-friendly error strings.
**Affects Phases**: Phase 1, Phase 2

### 🟡 Medium Discovery 08: PlanPak File Organization

**Impact**: Medium
**Sources**: [I1-02]
**Problem**: New files must follow PlanPak pattern for traceability.
**Root Cause**: Spec specifies `File Management: PlanPak`.
**Solution**: Create `features/029-agentic-work-units/` directories in positional-graph package.
**Action Required**: All plan-scoped files in feature folder, cross-cutting files in existing locations.
**Affects Phases**: All

---

## Testing Philosophy

### Testing Approach

**Selected Approach**: Full TDD
**Rationale**: User specified full TDD for this CS-3 feature with new types, services, and CLI integration
**Focus Areas**:
- Zod schema validation (discriminated union edge cases)
- WorkUnitService load/validate/getTemplateContent operations
- Reserved parameter routing in CLI
- Structural compatibility (WorkUnit satisfies NarrowWorkUnit)
- Error code paths (E180-E187)

### Test-Driven Development

- Write tests FIRST (RED)
- Implement minimal code (GREEN)
- Refactor for quality (REFACTOR)

### Test Documentation

Every test must include:
```typescript
/*
Test Doc:
- Why: [business/bug/regression reason]
- Contract: [plain-English invariant being asserted]
- Usage Notes: [how to use the tested API]
- Quality Contribution: [what failure this catches]
- Worked Example: [inputs/outputs summarized]
*/
```

### Mock Usage

**Policy**: Fakes only (no mocks/stubs)
**Rationale**: Use fake implementations (e.g., FakeFileSystem, FakeYamlParser) that mirror real behavior — no mocks or stubs. Fakes provide realistic testing while maintaining test isolation.

**Fakes to create**:
- `FakeWorkUnitService`: In-memory unit storage with configurable template content

**Existing fakes to use**:
- `FakeFileSystem` from `@chainglass/shared`
- `FakeYamlParser` from `@chainglass/shared`

---

## File Placement Manifest

| File | Classification | Location | Rationale |
|------|---------------|----------|-----------|
| `workunit.types.ts` | plan-scoped | `packages/positional-graph/src/features/029-agentic-work-units/` | New types for this plan only |
| `workunit.schema.ts` | plan-scoped | `packages/positional-graph/src/features/029-agentic-work-units/` | Zod schemas for discriminated union |
| `workunit-errors.ts` | plan-scoped | `packages/positional-graph/src/features/029-agentic-work-units/` | Error factories E180-E187 |
| `workunit.adapter.ts` | plan-scoped | `packages/positional-graph/src/features/029-agentic-work-units/` | Filesystem adapter for units |
| `workunit.service.ts` | plan-scoped | `packages/positional-graph/src/features/029-agentic-work-units/` | IWorkUnitService implementation |
| `fake-workunit.service.ts` | plan-scoped | `packages/positional-graph/src/features/029-agentic-work-units/` | Test fake |
| `index.ts` (feature barrel) | plan-scoped | `packages/positional-graph/src/features/029-agentic-work-units/` | Re-exports all public symbols |
| DI token additions | cross-cutting | `packages/shared/src/di/positional-graph-tokens.ts` | Shared tokens |
| DI registration | cross-cutting | `packages/positional-graph/src/container.ts` | Module registration |
| CLI routing | cross-cutting | `apps/cli/src/commands/positional-graph.command.ts` | Reserved param handling |
| Test helpers | cross-cutting | `test/unit/positional-graph/test-helpers.ts` | Enriched fixtures |
| E2E test | cross-cutting | `test/e2e/positional-graph-execution-e2e.test.ts` | Sections 13-15 |
| Unit YAML files | cross-cutting | `.chainglass/data/units/*/unit.yaml` | Migration |

---

## Implementation Phases

### Phase 1: Types and Schemas

**Objective**: Create foundational type definitions, Zod schemas, and error factories for the discriminated WorkUnit union.

**Deliverables**:
- `workunit.types.ts` with `AgenticWorkUnit`, `CodeUnit`, `UserInputUnit`, and `WorkUnit` union
- `workunit.schema.ts` with Zod discriminated union validation
- `workunit-errors.ts` with E180-E187 error factories
- Feature barrel `index.ts`
- Compile-time type compatibility assertion

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Type incompatibility with NarrowWorkUnit | Medium | High | Add compile-time assertion, test with collateInputs |
| Error code collision | Low | Medium | Verified E180-E187 available |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.1 | [x] | Create feature directory structure | 1 | `packages/positional-graph/src/features/029-agentic-work-units/` exists | [📋](tasks/phase-1-types-and-schemas/execution.log.md#T001) | PlanPak setup [^1] |
| 1.2 | [x] | Write tests for WorkUnit type compatibility | 2 | Tests verify WorkUnit satisfies NarrowWorkUnit, all fail initially | [📋](tasks/phase-1-types-and-schemas/execution.log.md#T002) | TDD RED [^1] |
| 1.3 | [x] | Create `workunit.types.ts` with discriminated union | 2 | Types compile, compatibility assertion passes | [📋](tasks/phase-1-types-and-schemas/execution.log.md#T003) | TDD GREEN [^1] |
| 1.4 | [x] | Write tests for Zod schema validation | 2 | Tests cover: valid units, missing type, type mismatch, invalid configs | [📋](tasks/phase-1-types-and-schemas/execution.log.md#T004) | TDD RED [^2] |
| 1.5 | [x] | Create `workunit.schema.ts` with Zod schemas | 2 | All schema tests pass | [📋](tasks/phase-1-types-and-schemas/execution.log.md#T005) | TDD GREEN [^2] |
| 1.6 | [x] | Write tests for error factory functions | 1 | Tests verify error code, message, action for E180-E187 | [📋](tasks/phase-1-types-and-schemas/execution.log.md#T006) | TDD RED [^3] |
| 1.7 | [x] | Create `workunit-errors.ts` with error factories | 1 | All error tests pass | [📋](tasks/phase-1-types-and-schemas/execution.log.md#T007) | TDD GREEN [^3] |
| 1.8 | [x] | Create feature barrel `index.ts` and update package exports | 1 | Types/schemas/errors importable from `@chainglass/positional-graph` | [📋](tasks/phase-1-types-and-schemas/execution.log.md#T008) | [^4] |
| 1.9 | [x] | Refactor and verify structural compatibility | 2 | Type tests pass, no lint errors | [📋](tasks/phase-1-types-and-schemas/execution.log.md#T009) | TDD REFACTOR [^4] |

### Test Examples (Write First!)

```typescript
// test/unit/positional-graph/features/029-agentic-work-units/workunit.types.test.ts

describe('WorkUnit Type Compatibility', () => {
  it('AgenticWorkUnit should satisfy NarrowWorkUnit', () => {
    /*
    Test Doc:
    - Why: Backward compatibility with collateInputs() consumers
    - Contract: AgenticWorkUnit structurally extends NarrowWorkUnit
    - Usage Notes: Pass WorkUnit where NarrowWorkUnit expected
    - Quality Contribution: Catches field mismatches that break DI
    - Worked Example: AgenticWorkUnit assigned to NarrowWorkUnit variable
    */
    const unit: AgenticWorkUnit = {
      slug: 'test-agent',
      type: 'agent',
      version: '1.0.0',
      inputs: [],
      outputs: [{ name: 'result', type: 'data', data_type: 'text', required: true }],
      agent: { prompt_template: 'prompts/main.md' },
    };

    // This assignment must compile - structural subtyping
    const narrow: NarrowWorkUnit = unit;
    expect(narrow.slug).toBe('test-agent');
  });
});
```

```typescript
// test/unit/positional-graph/features/029-agentic-work-units/workunit.schema.test.ts

describe('WorkUnitSchema Validation', () => {
  it('should reject unit with missing type field', () => {
    /*
    Test Doc:
    - Why: Spec requires type field explicitly
    - Contract: Missing type returns validation error
    - Usage Notes: Type field is required, not optional
    - Quality Contribution: Catches units without type declaration
    - Worked Example: { slug: 'test' } → E182 validation error
    */
    const invalidUnit = {
      slug: 'test-unit',
      version: '1.0.0',
      inputs: [],
      outputs: [{ name: 'out', type: 'data', data_type: 'text', required: true }],
      // Missing type field
    };

    const result = WorkUnitSchema.safeParse(invalidUnit);
    expect(result.success).toBe(false);
  });
});
```

### Non-Happy-Path Coverage
- [ ] Missing `type` field
- [ ] Invalid `type` value (`type: 'invalid'`)
- [ ] `type: 'agent'` without `agent:` config
- [ ] `type: 'agent'` with `code:` config (mismatch)
- [ ] Missing required fields in config sections
- [ ] Invalid slug format

### Commands to Run

```bash
# Run Phase 1 tests
pnpm test test/unit/positional-graph/features/029-agentic-work-units/workunit.types.test.ts
pnpm test test/unit/positional-graph/features/029-agentic-work-units/workunit.schema.test.ts
pnpm test test/unit/positional-graph/features/029-agentic-work-units/workunit-errors.test.ts

# Verify TypeScript compiles without errors
pnpm typecheck

# Run lint
pnpm lint
```

### Acceptance Criteria
- [ ] `pnpm test test/unit/positional-graph/features/029-agentic-work-units/workunit.types.test.ts` passes
- [ ] `pnpm test test/unit/positional-graph/features/029-agentic-work-units/workunit.schema.test.ts` passes
- [ ] `pnpm test test/unit/positional-graph/features/029-agentic-work-units/workunit-errors.test.ts` passes
- [ ] `pnpm typecheck` completes with 0 errors
- [ ] `WorkUnit` satisfies `NarrowWorkUnit` (compile-time assertion in types file)
- [ ] Feature exports accessible: `import { WorkUnit, WorkUnitSchema } from '@chainglass/positional-graph'`

---

### Phase 2: Service and Adapter

**Objective**: Implement the WorkUnit filesystem adapter and service with template content access.

**Deliverables**:
- `workunit.adapter.ts` extending `WorkspaceDataAdapterBase`
- `workunit.service.ts` implementing `IWorkUnitService`
- `fake-workunit.service.ts` for testing
- Unit tests with full coverage

**Dependencies**: Phase 1 must be complete (types, schemas, errors)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Path escape vulnerability | Medium | High | Implement containment check, security tests |
| Template file not found | Low | Medium | E185 error with actionable message |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [x] | Write tests for WorkUnitAdapter path resolution | 2 | Tests cover: getUnitDir, getUnitYamlPath, getTemplatePath | [📋](tasks/phase-2-service-and-adapter/execution.log.md#task-t001-write-tests-for-workunitadapter-path-resolution) | Complete |
| 2.2 | [x] | Implement WorkUnitAdapter extending WorkspaceDataAdapterBase | 2 | All adapter tests pass | [📋](tasks/phase-2-service-and-adapter/execution.log.md#task-t002-implement-workunitadapter-extending-workspacedataadapterbase) | Complete |
| 2.3 | [x] | Write tests for WorkUnitService.list() | 2 | Tests cover: empty list, multiple units, error cases | [📋](tasks/phase-2-service-and-adapter/execution.log.md#task-t003-t006-write-tests-for-workunitservice-combined) | Complete |
| 2.4 | [x] | Write tests for WorkUnitService.load() | 2 | Tests cover: valid load, not found (E180), parse error (E181), schema error (E182) | [📋](tasks/phase-2-service-and-adapter/execution.log.md#task-t003-t006-write-tests-for-workunitservice-combined) | Complete |
| 2.5 | [x] | Write tests for WorkUnitService.validate() | 1 | Tests verify validation without loading | [📋](tasks/phase-2-service-and-adapter/execution.log.md#task-t003-t006-write-tests-for-workunitservice-combined) | Complete |
| 2.6 | [x] | Write tests for WorkUnitService.getTemplateContent() | 2 | Tests cover: agent prompt, code script, user-input error (E183), path escape (E184), not found (E185) | [📋](tasks/phase-2-service-and-adapter/execution.log.md#task-t003-t006-write-tests-for-workunitservice-combined) | Complete |
| 2.7 | [x] | Implement WorkUnitService + Unit classes | 3 | All service tests pass | [📋](tasks/phase-2-service-and-adapter/execution.log.md#task-t007-implement-workunitservice--unit-classes) | Complete |
| 2.8 | [x] | Write security tests for path escape prevention | 2 | Tests verify E184 for `../` paths, absolute paths, symlinks | [📋](tasks/phase-2-service-and-adapter/execution.log.md#task-t008-write-security-tests-for-path-escape-prevention) | Complete |
| 2.9 | [x] | Create FakeWorkUnitService | 2 | Fake supports all IWorkUnitService methods with configurable state | [📋](tasks/phase-2-service-and-adapter/execution.log.md#task-t009-create-fakeworkunitservice) | Complete |
| 2.10 | [x] | Add DI tokens to positional-graph-tokens.ts | 1 | `WORKUNIT_ADAPTER`, `WORKUNIT_SERVICE` tokens exported | [📋](tasks/phase-2-service-and-adapter/execution.log.md#task-t010-add-di-tokens-to-positional-graph-tokens) | Complete |
| 2.11 | [x] | Refactor and verify coverage | 2 | >80% coverage, all tests pass | [📋](tasks/phase-2-service-and-adapter/execution.log.md#task-t011-refactor-and-verify-coverage) | Complete |

### Test Examples (Write First!)

```typescript
// test/unit/positional-graph/features/029-agentic-work-units/workunit.service.test.ts

describe('WorkUnitService', () => {
  describe('getTemplateContent()', () => {
    it('should return prompt content for AgenticWorkUnit', async () => {
      /*
      Test Doc:
      - Why: Agents need programmatic access to prompt templates
      - Contract: getTemplateContent returns file content for agent units
      - Usage Notes: Returns raw content, no substitution
      - Quality Contribution: Verifies template resolution works
      - Worked Example: 'test-agent' → { content: 'You are...', templateType: 'prompt' }
      */
      const fakeFs = new FakeFileSystem();
      fakeFs.writeFileSync(
        '/workspace/.chainglass/units/test-agent/unit.yaml',
        'slug: test-agent\ntype: agent\n...'
      );
      fakeFs.writeFileSync(
        '/workspace/.chainglass/units/test-agent/prompts/main.md',
        'You are a test agent.'
      );

      const service = new WorkUnitService(fakeFs, fakeYamlParser, adapter);
      const result = await service.getTemplateContent(ctx, 'test-agent');

      expect(result.errors).toHaveLength(0);
      expect(result.content).toBe('You are a test agent.');
      expect(result.templateType).toBe('prompt');
    });

    it('should return E183 for UserInputUnit', async () => {
      /*
      Test Doc:
      - Why: UserInputUnits have no template - should error clearly
      - Contract: getTemplateContent on user-input returns E183
      - Usage Notes: Check unit type before calling getTemplateContent
      - Quality Contribution: Prevents confusing "file not found" errors
      - Worked Example: user-input unit → E183 NoTemplate
      */
      // ... setup user-input unit ...

      const result = await service.getTemplateContent(ctx, 'user-input-unit');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E183');
    });

    it('should return E184 for path escape attempt', async () => {
      /*
      Test Doc:
      - Why: Security - prevent reading files outside unit folder
      - Contract: Paths escaping unit dir return E184
      - Usage Notes: Applies to both prompt_template and script paths
      - Quality Contribution: Prevents data exfiltration
      - Worked Example: prompt_template: '../../../.env' → E184
      */
      // ... setup unit with malicious path ...

      const result = await service.getTemplateContent(ctx, 'malicious-unit');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E184');
    });
  });
});
```

### Non-Happy-Path Coverage
- [ ] Unit folder doesn't exist (E180)
- [ ] unit.yaml has syntax error (E181)
- [ ] unit.yaml has schema error (E182)
- [ ] UserInputUnit template request (E183)
- [ ] Path escape attempts (E184)
- [ ] Template file missing (E185)

### Commands to Run

```bash
# Run Phase 2 tests
pnpm test test/unit/positional-graph/features/029-agentic-work-units/workunit.adapter.test.ts
pnpm test test/unit/positional-graph/features/029-agentic-work-units/workunit.service.test.ts

# Verify TypeScript compiles
pnpm typecheck

# Run lint
pnpm lint

# Check test coverage (optional)
pnpm test test/unit/positional-graph/features/029-agentic-work-units/ --coverage
```

### Acceptance Criteria
- [ ] `pnpm test test/unit/positional-graph/features/029-agentic-work-units/workunit.adapter.test.ts` passes
- [ ] `pnpm test test/unit/positional-graph/features/029-agentic-work-units/workunit.service.test.ts` passes
- [ ] Security tests pass: path escape attempts return E184 error
- [ ] `FakeWorkUnitService` implements `IWorkUnitService` interface with methods: `list()`, `load()`, `validate()`, `getTemplateContent()`
- [ ] DI tokens `WORKUNIT_ADAPTER`, `WORKUNIT_SERVICE` exported from `packages/shared/src/di/positional-graph-tokens.ts`
- [ ] `pnpm typecheck` completes with 0 errors

---

### Phase 3: CLI Integration

**Objective**: Add reserved parameter routing to CLI and register services in DI container.

**Deliverables**:
- Reserved parameter detection in `get-input-data` command
- DI container registration for `IWorkUnitService`
- Wiring of `IWorkUnitLoader` to new service
- Unit subcommands (`list`, `info`, `get-template`)

**Dependencies**: Phase 2 must be complete (service implementation)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Reserved param collision | Low | Medium | Schema prevents hyphens in user inputs |
| DI resolution failure | Medium | High | Add container resolution tests |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [x] | Write tests for reserved parameter detection | 2 | Tests cover: main-prompt routing, main-script routing, non-reserved passthrough | [📋](tasks/phase-3-cli-integration/execution.log.md#task-t001-write-tests-for-reserved-parameter-detection) | Complete [^9] |
| 3.2 | [x] | Write tests for type mismatch error (E186) | 1 | Tests verify E186 when main-prompt used on CodeUnit | [📋](tasks/phase-3-cli-integration/execution.log.md#task-t002-write-tests-for-type-mismatch-error-e186) | Complete [^9] |
| 3.3 | [x] | Implement reserved parameter routing | 2 | Reserved param tests pass | [📋](tasks/phase-3-cli-integration/execution.log.md#task-t003-implement-reserved-parameter-routing) | Complete [^9] |
| 3.4 | [x] | Write tests for `cg wf unit list` command | 1 | Tests verify unit listing output | [📋](tasks/phase-3-cli-integration/execution.log.md#task-t004-write-tests-for-cg-wf-unit-list-command) | Complete [^10] |
| 3.5 | [x] | Write tests for `cg wf unit info` command | 1 | Tests verify full unit info output | [📋](tasks/phase-3-cli-integration/execution.log.md#task-t005-write-tests-for-cg-wf-unit-info-command) | Complete [^10] |
| 3.6 | [x] | Write tests for `cg wf unit get-template` command | 1 | Tests verify template content output | [📋](tasks/phase-3-cli-integration/execution.log.md#task-t006-write-tests-for-cg-wf-unit-get-template-command) | Complete [^10] |
| 3.7 | [x] | Implement unit subcommands | 2 | All unit command tests pass | [📋](tasks/phase-3-cli-integration/execution.log.md#task-t007-implement-unit-subcommands) | Complete [^10] |
| 3.8 | [x] | Add DI registration to positional-graph container.ts | 1 | WorkUnitAdapter, WorkUnitService registered | [📋](tasks/phase-3-cli-integration/execution.log.md#task-t008-add-di-registration-to-positional-graph-containerts) | Complete |
| 3.9 | [x] | Write DI resolution tests | 1 | Both IWorkUnitService and IWorkUnitLoader resolve correctly | [📋](tasks/phase-3-cli-integration/execution.log.md#task-t009-write-di-resolution-tests) | Complete |
| 3.10 | [x] | Refactor CLI command structure | 1 | Commands follow existing patterns, tests pass | [📋](tasks/phase-3-cli-integration/execution.log.md#task-t010-refactor-cli-command-structure) | Complete [^11] |

### Test Examples (Write First!)

```typescript
// test/unit/cli/positional-graph-command.test.ts

describe('Reserved Parameter Routing', () => {
  it('should route main-prompt to template content for AgenticWorkUnit', async () => {
    /*
    Test Doc:
    - Why: Agents retrieve prompt via reserved param name
    - Contract: main-prompt on agent node returns prompt content
    - Usage Notes: Works regardless of node state (pending/running/completed)
    - Quality Contribution: Verifies CLI routing works end-to-end
    - Worked Example: get-input-data graph node main-prompt → prompt content
    */
    // ... setup with FakeWorkUnitService ...

    const result = await getInputDataAction(ctx, 'graph', 'node', 'main-prompt');

    expect(result.errors).toHaveLength(0);
    expect(result.value).toContain('You are');
  });

  it('should return E186 for main-prompt on CodeUnit', async () => {
    /*
    Test Doc:
    - Why: Type mismatch should error, not silently fail
    - Contract: main-prompt on code unit returns E186
    - Usage Notes: Use main-script for code units
    - Quality Contribution: Prevents confusing "input not found" errors
    - Worked Example: main-prompt on code node → E186 UnitTypeMismatch
    */
    // ... setup with CodeUnit ...

    const result = await getInputDataAction(ctx, 'graph', 'code-node', 'main-prompt');

    expect(result.errors[0].code).toBe('E186');
  });
});
```

### Non-Happy-Path Coverage
- [ ] main-prompt on CodeUnit (E186)
- [ ] main-script on AgenticWorkUnit (E186)
- [ ] Reserved param on UserInputUnit (E186 or E183)
- [ ] Unit not found during routing (E180)
- [ ] Normal input that looks like reserved (`main_prompt`, `mainprompt`)

### Commands to Run

```bash
# Run Phase 3 tests
pnpm test test/unit/cli/positional-graph-command.test.ts

# Verify CLI commands work (manual verification during implementation)
cg wf unit list
cg wf unit info sample-coder
cg wf node get-input-data <graph> <node> main-prompt

# DI resolution tests
pnpm test test/unit/cli/container.test.ts

# TypeScript and lint
pnpm typecheck
pnpm lint
```

### Acceptance Criteria
- [ ] `pnpm test test/unit/cli/positional-graph-command.test.ts` passes
- [ ] `pnpm test test/unit/cli/container.test.ts` passes (DI resolution)
- [ ] `cg wf unit list` outputs JSON array of unit slugs
- [ ] `cg wf unit info sample-coder` returns full unit info with `type: 'agent'`
- [ ] `cg wf node get-input-data <graph> <agent-node> main-prompt` returns prompt template content
- [ ] `cg wf node get-input-data <graph> <code-node> main-prompt` returns E186 error (type mismatch)
- [ ] Existing CLI commands unchanged (backward compatibility)

---

### Phase 4: Test Enrichment

**Objective**: Upgrade test fixtures to full WorkUnit types and add E2E test sections 13-15.

**Deliverables**:
- Enriched fixtures (`e2eEnrichedFixtures`) in test-helpers.ts
- `stubWorkUnitService()` helper function
- E2E Section 13: Unit Type Verification
- E2E Section 14: Reserved Parameter Routing
- E2E Section 15: Row 0 UserInputUnit

**Dependencies**: Phases 2-3 must be complete (service and CLI)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Fixture backward compatibility | Low | Low | Keep e2eExecutionFixtures alongside enriched |
| E2E timing issues | Medium | Medium | Reserved params work regardless of state |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [x] | Add `e2eEnrichedFixtures` to test-helpers.ts | 2 | All 7 units have full WorkUnit types | [📋](tasks/phase-4-test-enrichment/execution.log.md#task-t001) | Completed [^12] |
| 4.2 | [x] | Add `sampleUserRequirements` and `sampleLanguageSelector` fixtures | 1 | UserInputUnit fixtures available | [📋](tasks/phase-4-test-enrichment/execution.log.md#task-t002) | Completed [^12] |
| 4.3 | [x] | Implement `stubWorkUnitService()` helper | 2 | Helper supports template content, strict mode | [📋](tasks/phase-4-test-enrichment/execution.log.md#task-t003) | Completed [^12] |
| 4.4 | [x] | Fix naming inconsistency: samplePRCreator → samplePrCreator | 1 | Consistent camelCase naming | [📋](tasks/phase-4-test-enrichment/execution.log.md#task-t004) | Completed [^12] |
| 4.5 | [x] | Write E2E Section 13: Unit Type Verification | 2 | Tests verify type discrimination via CLI | [📋](tasks/phase-4-test-enrichment/execution.log.md#task-t005-t008) | Completed [^13] |
| 4.6 | [x] | Write E2E Section 14: Reserved Parameter Routing | 2 | Tests verify main-prompt/main-script routing | [📋](tasks/phase-4-test-enrichment/execution.log.md#task-t005-t008) | Completed [^13] |
| 4.7 | [x] | Write E2E Section 15: Row 0 UserInputUnit | 2 | Tests verify UserInputUnit as entry point | [📋](tasks/phase-4-test-enrichment/execution.log.md#task-t005-t008) | Completed [^13] |
| 4.8 | [x] | Update E2E main flow to include new sections | 1 | Sections 13-15 run in correct order | [📋](tasks/phase-4-test-enrichment/execution.log.md#task-t005-t008) | Completed [^13] |
| 4.9 | [x] | Run full E2E test and verify | 1 | All 15 sections pass | [📋](tasks/phase-4-test-enrichment/execution.log.md#task-t009) | Completed - 65 steps pass [^14] |

### Test Examples (From Workshop)

```typescript
// E2E Section 13: Unit Type Verification
async function testUnitTypeVerification(): Promise<void> {
  section('Unit Type Verification');

  step('13.1: Verify coder is AgenticWorkUnit (type=agent)');
  const coderUnitInfo = await runCli<UnitInfoResult>(['unit', 'info', 'sample-coder']);
  assert(coderUnitInfo.ok, `Unit info failed: ${JSON.stringify(coderUnitInfo.errors)}`);
  assert(coderUnitInfo.data?.type === 'agent', `Expected type='agent', got ${coderUnitInfo.data?.type}`);

  step('13.2: Verify pr-creator is CodeUnit (type=code)');
  const prCreatorInfo = await runCli<UnitInfoResult>(['unit', 'info', 'sample-pr-creator']);
  assert(prCreatorInfo.data?.type === 'code', `Expected type='code'`);

  step('13.3: Verify user-requirements is UserInputUnit (type=user-input)');
  const userReqInfo = await runCli<UnitInfoResult>(['unit', 'info', 'sample-user-requirements']);
  assert(userReqInfo.data?.type === 'user-input', `Expected type='user-input'`);
}
```

### Non-Happy-Path Coverage
- [ ] E186 type mismatch in E2E
- [ ] E183 no template in E2E

### Commands to Run

```bash
# Run E2E tests (Sections 13-15)
pnpm test test/e2e/positional-graph-execution-e2e.test.ts

# Verify all E2E sections
pnpm test test/e2e/positional-graph-execution-e2e.test.ts -- --reporter=verbose

# TypeScript and lint
pnpm typecheck
pnpm lint
```

### Acceptance Criteria
- [ ] `pnpm test test/e2e/positional-graph-execution-e2e.test.ts` passes
- [ ] E2E Section 13 (Unit Type Verification) verifies: `sample-coder` is `type='agent'`, `sample-pr-creator` is `type='code'`, `sample-user-requirements` is `type='user-input'`
- [ ] E2E Section 14 (Reserved Parameter Routing) verifies: `main-prompt` returns content, `main-script` returns content, type mismatch returns E186
- [ ] E2E Section 15 (Row 0 UserInputUnit) verifies: UserInputUnit on Line 0 is immediately ready
- [ ] `stubWorkUnitService(config: { units: Map<string, WorkUnit>, templates: Map<string, string>, strict?: boolean })` helper available
- [ ] Naming: `samplePrCreator` (not `samplePRCreator`) in fixtures

---

### Phase 5: Cleanup and Documentation

**Objective**: Remove legacy workgraph bridge, migrate existing unit files, and document the feature.

**Deliverables**:
- Workgraph bridge removed from DI container
- Existing unit.yaml files migrated to include `type` field
- On-disk unit files created for E2E tests
- Documentation in docs/how/positional-graph/

**Dependencies**: All previous phases complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Migration breaks existing units | Low | Medium | Careful review of existing files |
| Documentation drift | Low | Low | Keep docs co-located with code |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Remove workgraph bridge from CLI container | 1 | Bridge code deleted, tests still pass | - | Cross-cutting |
| 5.2 | [ ] | Create on-disk unit YAML files for E2E | 2 | All 7 units + user-requirements have valid unit.yaml | - | |
| 5.3 | [ ] | Create prompt/script template files for E2E | 1 | Template files exist and are readable | - | |
| 5.4 | [ ] | Migrate existing .chainglass/data/units/ files | 1 | All existing units have `type` field | - | Per spec Q8 |
| 5.5 | [ ] | Run full test suite | 1 | All tests pass including E2E | - | Verification |
| 5.6 | [ ] | Create docs/how/positional-graph/workunit-api.md | 2 | Documentation covers types, CLI, errors | - | |
| 5.7 | [ ] | Final refactor and cleanup | 1 | No lint errors, clean imports | - | |

### On-Disk Unit Files to Create

Per workshop `e2e-test-enrichment.md`:
- `.chainglass/units/sample-spec-builder/unit.yaml` + `prompts/main.md`
- `.chainglass/units/sample-spec-reviewer/unit.yaml` + `prompts/main.md`
- `.chainglass/units/sample-coder/unit.yaml` + `prompts/main.md`
- `.chainglass/units/sample-tester/unit.yaml` + `prompts/main.md`
- `.chainglass/units/sample-spec-alignment-tester/unit.yaml` + `prompts/main.md`
- `.chainglass/units/sample-pr-preparer/unit.yaml` + `prompts/main.md`
- `.chainglass/units/sample-pr-creator/unit.yaml` + `scripts/main.sh` (CodeUnit)
- `.chainglass/units/sample-user-requirements/unit.yaml` (UserInputUnit)

### Commands to Run

```bash
# Final verification - run all tests
just fft

# Or individual commands:
pnpm lint
pnpm format
pnpm test

# Verify no workgraph imports remain
grep -r "workgraph" packages/positional-graph/src/ || echo "No workgraph imports found (good)"
grep -r "workgraph" apps/cli/src/ | grep -v "comment" || echo "No workgraph imports found (good)"

# Load a unit via CLI to verify real files
cg wf unit list
cg wf unit info sample-coder
```

### Acceptance Criteria
- [ ] `just fft` passes (lint + format + test)
- [ ] `grep -r "workgraph" packages/positional-graph/src/` returns no matches
- [ ] All on-disk unit files loadable via `cg wf unit info <slug>`
- [ ] `cg wf unit list` returns all 8 sample units
- [ ] Documentation exists at `docs/how/positional-graph/workunit-api.md` with sections:
  - Introduction
  - Type Definitions (AgenticWorkUnit, CodeUnit, UserInputUnit)
  - Service API (IWorkUnitService methods)
  - CLI Commands (unit list, unit info, get-template, reserved params)
  - Error Reference (E180-E187)
  - Examples
- [ ] All 15 E2E sections pass

---

## ADR Ledger

| ADR | Status | Relevance | Alignment |
|-----|--------|-----------|-----------|
| ADR-0003: Configuration System | Accepted | Zod validation pattern | ✅ Plan uses Zod discriminated union validation, `z.infer<>` type derivation |
| ADR-0004: Dependency Injection Container Architecture | Accepted | DI registration pattern | ✅ Plan uses `useFactory` pattern, DI tokens in shared package |
| ADR-0008: Workspace Split Storage Data Model | Accepted | Unit file storage paths | ✅ Plan uses `.chainglass/data/units/` path structure |
| ADR-0009: Module Registration Function Pattern | Accepted | Service registration | ✅ Plan follows module registration pattern for new services |

**No deviations recorded.** All architectural decisions in this plan align with accepted ADRs.

---

## Cross-Cutting Concerns

### Security Considerations

- **Path Escape Validation**: All template paths must be validated to not escape unit folder
- **Input Sanitization**: Slug validation via Zod schema prevents injection
- **No Secrets in Templates**: Templates are plain text, no credential interpolation

### Observability

- **Logging**: Use `ILogger` for all service operations
- **Error Codes**: Structured error codes E180-E187 for troubleshooting
- **Error Actions**: All errors include actionable `action` field

### Documentation

- **Location**: `docs/how/positional-graph/workunit-api.md`
- **Content**:
  - WorkUnit type definitions and examples
  - Reserved parameter routing usage
  - Error code reference (E180-E187)
  - Row 0 UserInputUnit patterns
- **Target Audience**: Agent developers, CLI users building workflows
- **Maintenance**: Update when WorkUnit types or CLI commands change

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| WorkUnit Types | 2 | Small | S=1,I=0,D=1,N=0,F=0,T=0 | New types, backward compat constraint | Type assertion tests |
| WorkUnitService | 3 | Medium | S=1,I=1,D=1,N=0,F=0,T=0 | Service impl, security check | Fakes for testing, security tests |
| CLI Reserved Routing | 2 | Small | S=1,I=1,D=0,N=0,F=0,T=0 | CLI modification | Clear routing logic |
| E2E Test Enrichment | 2 | Small | S=1,I=0,D=0,N=0,F=0,T=1 | Test infrastructure | Keep backward compat |
| DI Transition | 2 | Small | S=1,I=1,D=0,N=0,F=0,T=0 | Replace workgraph bridge | Incremental, tests first |

**Overall Plan**: CS-3 (Medium) per spec — 5-phase implementation, greenfield types/services

---

## Progress Tracking

### Phase Completion Checklist

- [x] Phase 1: Types and Schemas - COMPLETE (2026-02-04)
- [x] Phase 2: Service and Adapter - COMPLETE (2026-02-04)
- [x] Phase 3: CLI Integration - COMPLETE (2026-02-04)
- [x] Phase 4: Test Enrichment - COMPLETE (2026-02-04)
- [ ] Phase 5: Cleanup and Documentation - PENDING

### STOP Rule

**IMPORTANT**: This plan must be validated before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Change Footnotes Ledger

**NOTE**: This section will be populated during implementation by plan-6a-update-progress.

**Footnote Numbering Authority**: plan-6a-update-progress is the **single source of truth** for footnote numbering across the entire plan.

[^1]: Phase 1 T001-T003 - WorkUnit type definitions and compile-time assertions
  - `file:packages/positional-graph/src/features/029-agentic-work-units/workunit.types.ts`
  - `file:test/unit/positional-graph/features/029-agentic-work-units/workunit.types.test.ts`

[^2]: Phase 1 T004-T005 - Zod schemas with discriminated union validation
  - `file:packages/positional-graph/src/features/029-agentic-work-units/workunit.schema.ts`
  - `function:packages/positional-graph/src/features/029-agentic-work-units/workunit.schema.ts:formatZodErrors`
  - `file:test/unit/positional-graph/features/029-agentic-work-units/workunit.schema.test.ts`

[^3]: Phase 1 T006-T007 - Error factory functions E180-E187
  - `file:packages/positional-graph/src/features/029-agentic-work-units/workunit-errors.ts`
  - `function:packages/positional-graph/src/features/029-agentic-work-units/workunit-errors.ts:unitNotFoundError`
  - `function:packages/positional-graph/src/features/029-agentic-work-units/workunit-errors.ts:unitSchemaValidationError`
  - `file:test/unit/positional-graph/features/029-agentic-work-units/workunit-errors.test.ts`

[^4]: Phase 1 T008-T009 - Feature barrel exports and package integration
  - `file:packages/positional-graph/src/features/029-agentic-work-units/index.ts`
  - `file:packages/positional-graph/src/index.ts` (cross-plan edit)

[^5]: Phase 2 T001-T002 - WorkUnitAdapter implementation
  - `class:packages/positional-graph/src/features/029-agentic-work-units/workunit.adapter.ts:WorkUnitAdapter`
  - `method:packages/positional-graph/src/features/029-agentic-work-units/workunit.adapter.ts:WorkUnitAdapter.getUnitDir`
  - `method:packages/positional-graph/src/features/029-agentic-work-units/workunit.adapter.ts:WorkUnitAdapter.getUnitYamlPath`
  - `method:packages/positional-graph/src/features/029-agentic-work-units/workunit.adapter.ts:WorkUnitAdapter.getTemplatePath`
  - `method:packages/positional-graph/src/features/029-agentic-work-units/workunit.adapter.ts:WorkUnitAdapter.listUnitSlugs`
  - `method:packages/positional-graph/src/features/029-agentic-work-units/workunit.adapter.ts:WorkUnitAdapter.unitExists`
  - `method:packages/positional-graph/src/features/029-agentic-work-units/workunit.adapter.ts:WorkUnitAdapter.validateSlug`
  - `file:test/unit/positional-graph/features/029-agentic-work-units/workunit.adapter.test.ts`

[^6]: Phase 2 T003-T007 - WorkUnitService and domain classes
  - `class:packages/positional-graph/src/features/029-agentic-work-units/workunit.service.ts:WorkUnitService`
  - `method:packages/positional-graph/src/features/029-agentic-work-units/workunit.service.ts:WorkUnitService.list`
  - `method:packages/positional-graph/src/features/029-agentic-work-units/workunit.service.ts:WorkUnitService.load`
  - `method:packages/positional-graph/src/features/029-agentic-work-units/workunit.service.ts:WorkUnitService.validate`
  - `file:packages/positional-graph/src/features/029-agentic-work-units/workunit-service.interface.ts`
  - `file:packages/positional-graph/src/features/029-agentic-work-units/workunit.classes.ts`
  - `function:packages/positional-graph/src/features/029-agentic-work-units/workunit.classes.ts:createAgenticWorkUnitInstance`
  - `function:packages/positional-graph/src/features/029-agentic-work-units/workunit.classes.ts:createCodeUnitInstance`
  - `function:packages/positional-graph/src/features/029-agentic-work-units/workunit.classes.ts:createUserInputUnitInstance`
  - `function:packages/positional-graph/src/features/029-agentic-work-units/workunit.classes.ts:validatePathContainment`
  - `file:test/unit/positional-graph/features/029-agentic-work-units/workunit.service.test.ts`

[^7]: Phase 2 T008-T009 - Security tests and FakeWorkUnitService
  - `class:packages/positional-graph/src/features/029-agentic-work-units/fake-workunit.service.ts:FakeWorkUnitService`
  - `file:test/unit/positional-graph/features/029-agentic-work-units/fake-workunit.service.test.ts`

[^8]: Phase 2 T010-T011 - DI tokens and integration
  - `file:packages/shared/src/di-tokens.ts` (added WORKUNIT_ADAPTER, WORKUNIT_SERVICE)
  - `file:packages/positional-graph/src/features/029-agentic-work-units/index.ts` (updated exports)

[^9]: Phase 3 T001-T003 - Reserved parameter routing
  - `function:packages/positional-graph/src/features/029-agentic-work-units/reserved-params.ts:isReservedInputParam`
  - `file:packages/positional-graph/src/features/029-agentic-work-units/reserved-params.ts`
  - `function:apps/cli/src/commands/positional-graph.command.ts:handleNodeGetInputData`
  - `function:apps/cli/src/commands/positional-graph.command.ts:getWorkUnitService`

[^10]: Phase 3 T004-T007 - Unit subcommands
  - `function:apps/cli/src/commands/positional-graph.command.ts:handleUnitList`
  - `function:apps/cli/src/commands/positional-graph.command.ts:handleUnitInfo`
  - `function:apps/cli/src/commands/positional-graph.command.ts:handleUnitGetTemplate`

[^11]: Phase 3 T010 - CLI refactoring
  - `file:apps/cli/src/commands/positional-graph.command.ts`
  - `file:test/unit/cli/positional-graph-command.test.ts`
  - `file:test/unit/positional-graph/container.test.ts`

[^12]: Phase 4 T001-T004 - Test fixtures and helpers
  - `function:test/unit/positional-graph/test-helpers.ts:e2eEnrichedFixtures`
  - `function:test/unit/positional-graph/test-helpers.ts:sampleUserRequirements`
  - `function:test/unit/positional-graph/test-helpers.ts:sampleLanguageSelector`
  - `function:test/unit/positional-graph/test-helpers.ts:stubWorkUnitService`
  - Naming fix: samplePRCreator → samplePrCreator

[^13]: Phase 4 T005-T008 - E2E Sections 13-15
  - `function:test/e2e/positional-graph-execution-e2e.test.ts:testUnitTypeVerification`
  - `function:test/e2e/positional-graph-execution-e2e.test.ts:testReservedParameterRouting`
  - `function:test/e2e/positional-graph-execution-e2e.test.ts:testRow0UserInput`
  - Fixed CLI --json flag placement
  - Fixed E2E setup() to copy units to WorkUnitAdapter path

[^14]: Phase 4 T009 - E2E verification and unit files
  - `file:.chainglass/data/units/sample-spec-builder/unit.yaml`
  - `file:.chainglass/data/units/sample-spec-reviewer/unit.yaml`
  - `file:.chainglass/data/units/sample-spec-alignment-tester/unit.yaml`
  - `file:.chainglass/data/units/sample-pr-preparer/unit.yaml`
  - `file:.chainglass/units/sample-pr-creator/unit.yaml`
  - `file:.chainglass/units/sample-pr-creator/scripts/main.sh`
  - 65 E2E steps pass, 3233 unit tests pass

---

*Plan created: 2026-02-04*
*Plan folder: `docs/plans/029-agentic-work-units/`*
