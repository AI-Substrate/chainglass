# Chainglass Project Setup Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-01-18
**Spec**: [./project-setup-spec.md](./project-setup-spec.md)
**Status**: DRAFT

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Implementation Phases](#implementation-phases)
   - [Phase 1: Monorepo Foundation](#phase-1-monorepo-foundation)
   - [Phase 2: Shared Package](#phase-2-shared-package)
   - [Phase 3: Next.js App with Clean Architecture](#phase-3-nextjs-app-with-clean-architecture)
   - [Phase 4: CLI Package](#phase-4-cli-package)
   - [Phase 5: MCP Server Package](#phase-5-mcp-server-package)
   - [Phase 6: Documentation & Polish](#phase-6-documentation--polish)
6. [Cross-Cutting Concerns](#cross-cutting-concerns)
7. [Complexity Tracking](#complexity-tracking)
8. [Progress Tracking](#progress-tracking)
9. [Deviation Ledger](#deviation-ledger)
10. [ADR Ledger](#adr-ledger)
11. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

### Problem Statement

Chainglass needs a robust, maintainable foundation for a spec-driven development enrichment workflow tool. The project requires a CLI (`cg`), MCP server for AI agent integration, and a Next.js web application, all sharing business logic while maintaining clean architecture boundaries.

### Solution Approach

- **Monorepo Structure**: pnpm workspaces + Turborepo for efficient package management and build orchestration
- **Clean Architecture**: Strict Services ← Adapters dependency direction with interface-based DI via TSyringe
- **TDD-First**: Fakes over mocks, centralized test suite, interface-driven design from day one
- **Fast Tooling**: Vitest (10x faster), Biome (20x faster), Just task runner for developer experience
- **npx Distribution**: Bundled CLI via esbuild for zero-install execution

### Expected Outcomes

- Developers productive quickly: `just install && just dev` (after installing prerequisites)
- Clean architecture physically enforced via import restrictions
- Sub-200ms test feedback for TDD flow
- CLI accessible via `npx cg` or `npx chainglass`

### Success Metrics

- All 10 acceptance criteria from spec pass
- `just check` passes all quality gates
- `cg --help`, `cg web`, `cg mcp` functional

---

## Technical Context

### Current System State

- **Greenfield project**: Empty repository with only README.md, .gitignore, and planning docs
- **Branch**: `001-project-setup`
- **No existing code**: All components to be created

### Integration Requirements

- **npm Registry**: CLI distributable via npx (future npm publish)
- **MCP Protocol**: stdio and HTTP transports for AI agent integration
- **Next.js 15**: App Router with React Server Components

### Constraints and Limitations

- **Node.js 18+**: Required for native ESM support
- **pnpm**: Required package manager (not npm or yarn)
- **Just**: Optional but recommended task runner (npm script fallbacks available)
- **No decorators in RSC**: TSyringe must use decorator-free pattern in server components

### Assumptions

1. Developers have Node.js 18+ installed
2. pnpm is acceptable as the package manager
3. TypeScript strict mode is acceptable
4. Clean architecture boundaries are non-negotiable

---

## Critical Research Findings

### 🚨 Critical Discovery 01: Bootstrap Sequence Dependency Chain
**Impact**: Critical
**Sources**: [I1-01, R1-01]

**Problem**: Phase 1 has a strict internal dependency order. Running `pnpm install` on incomplete configuration fails with cryptic errors. Turborepo needs packages that don't exist yet.

**Root Cause**: pnpm workspaces + Turborepo expect all referenced packages to exist when initialized.

**Solution**: Staged bootstrap approach:
1. Create minimal `pnpm-workspace.yaml` first
2. Create package directories with minimal `package.json` (name + version only)
3. Run `pnpm install` to establish linking
4. Add `turbo.json` after packages have build scripts

**Action Required**: Follow exact file creation order in Phase 1.

**Affects Phases**: 1

---

### 🚨 Critical Discovery 02: TSyringe Decorators Fail in React Server Components
**Impact**: Critical
**Sources**: [R1-03]

**Problem**: TSyringe's `@injectable()` and `@inject()` decorators require runtime metadata that may not survive RSC compilation. Next.js 15 App Router uses RSC by default.

**Root Cause**: RSC have restrictions on JavaScript features. Decorator metadata can be stripped during bundling.

**Solution**: Use decorator-free pattern with explicit `container.register()` calls:
```typescript
// ❌ WRONG - Decorators may fail in RSC
@injectable()
class EnrichmentService {
  constructor(@inject('ILogger') private logger: ILogger) {}
}

// ✅ CORRECT - Explicit registration
container.register<ILogger>('ILogger', { useClass: PinoLoggerAdapter });
const service = container.resolve(EnrichmentService);
```

**Action Required**: All DI setup uses explicit registration, no decorators.

**Affects Phases**: 3, 4, 5

---

### High Impact Discovery 03: Shared Package is Hard Dependency Gate
**Impact**: High
**Sources**: [I1-02]

**Problem**: Phase 3, 4, and 5 all import from `@chainglass/shared`. If Phase 2 isn't buildable, subsequent phases cannot start.

**Root Cause**: `workspace:*` imports fail if the target package doesn't exist or build.

**Solution**: Phase 2 must be 100% complete with:
- Package builds successfully
- ILogger interface exported
- FakeLogger implemented and tested
- Verification: `import { ILogger } from '@chainglass/shared'` resolves

**Action Required**: Gate before Phase 3: `pnpm -F @chainglass/shared build && pnpm -F @chainglass/shared test`

**Affects Phases**: 2, 3, 4, 5

---

### High Impact Discovery 04: DI Container Requires Child Container Pattern
**Impact**: High
**Sources**: [I1-04, R1-03]

**Problem**: Tests using TSyringe pollute the global container. State leaks cause flaky test failures.

**Root Cause**: TSyringe's `container` is a singleton. `clearInstances()` alone doesn't reset registrations.

**Solution**: Use child containers:
```typescript
// Production
export function createProductionContainer() {
  const c = container.createChildContainer();
  c.register<ILogger>('ILogger', { useClass: PinoLoggerAdapter });
  return c;
}

// Testing
export function createTestContainer() {
  const c = container.createChildContainer();
  c.register<ILogger>('ILogger', { useClass: FakeLogger });
  return c;
}
```

**Action Required**: Implement dual container setup in Phase 3.

**Affects Phases**: 3, 4, 5

---

### High Impact Discovery 05: Vitest Path Resolution Requires Triple Alignment
**Impact**: High
**Sources**: [I1-06, R1-04]

**Problem**: Centralized test suite at `test/` must resolve imports from multiple packages. Three systems must agree: pnpm, TypeScript, Vitest.

**Root Cause**: Each system has separate path resolution. Misconfiguration causes "Cannot find module" despite code working elsewhere.

**Solution**: Configure all three:
```typescript
// vitest.config.ts
import tsconfigPaths from 'vite-tsconfig-paths';
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    alias: {
      '@chainglass/shared': './packages/shared/src',
      '@test/': './test/',
    },
  },
});
```

**Action Required**: Configure path aliases in tsconfig.json AND vitest.config.ts.

**Affects Phases**: 1, 2, 3

---

### High Impact Discovery 06: CLI Bundle Must Include Workspace Dependencies
**Impact**: High
**Sources**: [I1-05, R1-06]

**Problem**: esbuild must bundle `@chainglass/shared` for npx distribution, but NOT bundle Node.js built-ins or lazy-loaded deps.

**Root Cause**: `workspace:*` protocol is for local dev. Published bundle must be self-contained.

**Solution**: esbuild with `packages: 'bundle'`:
```typescript
await esbuild.build({
  bundle: true,
  packages: 'bundle', // Include workspace packages
  external: ['pino', 'next', '@modelcontextprotocol/*'], // Lazy-loaded
});
```

**Action Required**: Configure two build modes: dev (external shared) and prod (bundled).

**Affects Phases**: 4

---

### High Impact Discovery 07: Clean Architecture Needs Automated Enforcement
**Impact**: High
**Sources**: [R1-05]

**Problem**: TypeScript cannot prevent services from importing concrete adapters. Without enforcement, architecture erodes.

**Root Cause**: Import restrictions are semantic, not syntactic. TypeScript allows any valid import.

**Solution**: Add architecture check to CI:
```bash
# Quick check for violations
grep -r "from.*adapter" packages/shared/src/services/ apps/web/src/services/ \
  | grep -v ".interface" && echo "VIOLATION" || echo "OK"
```

**Action Required**: Enforce via code review during development/PR process. (Note: Automated grep-based checks were evaluated but rejected in Phase 3 DYK-03 due to false positive risks.)

**Affects Phases**: 2, 3, 4

---

### Medium Impact Discovery 08: Interface-First TDD Cycle
**Impact**: Medium
**Sources**: [I1-03]

**Problem**: Writing adapters first tempts interface design around implementation (e.g., Pino API), not consumer needs.

**Solution**: TDD order for each interface:
1. Write interface (method signatures)
2. Write fake (test helpers for assertions)
3. Write test using fake (drive interface from test needs)
4. Write real adapter (implements same interface)

**Action Required**: Phase 2 ILogger follows this exact sequence.

**Affects Phases**: 2, 3

---

### Medium Impact Discovery 09: Contract Tests Prevent Fake Drift
**Impact**: Medium
**Sources**: [R1-07]

**Problem**: Fakes can drift from real adapter behavior. TypeScript checks interface compliance, not behavioral equivalence.

**Solution**: Shared contract test suites:
```typescript
export function loggerContractTests(name: string, createLogger: () => ILogger) {
  it('should not throw when logging info', () => {
    expect(() => createLogger().info('test')).not.toThrow();
  });
}
// Run for both FakeLogger and PinoLoggerAdapter
```

**Action Required**: Create `test/contracts/` directory with contract tests.

**Affects Phases**: 2, 3

---

### Medium Impact Discovery 10: MCP stdio Transport Requires stdout Discipline
**Impact**: Medium
**Sources**: [R1-08]

**Problem**: In stdio mode, stdout is reserved for JSON-RPC. Any extraneous output (logs, console.log) corrupts the protocol.

**Solution**: Redirect all logging to stderr in stdio mode:
```typescript
if (options.stdio) {
  console.log = (...args) => console.error('[LOG]', ...args);
}
```

**Action Required**: Implement strict stdout discipline in Phase 5.

**Affects Phases**: 5

---

### Medium Impact Discovery 11: Phases 3 and 4 Can Parallelize
**Impact**: Medium
**Sources**: [I1-07]

**Problem**: Strict sequential execution is suboptimal. Web and CLI don't depend on each other.

**Solution**: After Phase 2, develop Phase 3 (web) and Phase 4 (CLI) in parallel. Integration point (`cg dev` starting Next.js) comes later.

**Action Required**: Consider parallel development tracks if resources allow.

**Affects Phases**: 3, 4

---

## Testing Philosophy

### Testing Approach

**Selected Approach**: Full TDD
**Rationale**: Foundational architecture requires comprehensive test coverage. Patterns established here affect all future development.
**Focus Areas**: DI container, service-adapter wiring, clean architecture boundaries, CLI commands

### Test-Driven Development

Every implementation task follows RED-GREEN-REFACTOR:

1. **RED**: Write test first, verify it fails
2. **GREEN**: Implement minimal code to pass test
3. **REFACTOR**: Improve code quality while keeping tests green

### Mock Usage Policy

**Policy**: Fakes only, avoid mocks

- All test doubles are full fake implementations
- No `vi.mock()`, `jest.mock()`, or similar
- Fakes implement the same interface as real adapters
- Fakes provide test helper methods (e.g., `assertLoggedAtLevel()`)
- Fakes live in `@chainglass/shared/fakes/`
- Contract tests ensure fakes match real adapter behavior

```typescript
// ❌ WRONG - Using mocks
const mockLogger = vi.fn();
mockLogger.mockReturnValue(undefined);

// ✅ CORRECT - Using fakes
const fakeLogger = new FakeLogger();
// ... run test ...
fakeLogger.assertLoggedAtLevel('INFO', 'Expected message');
```

### Test Organization

```
test/                          # CENTRAL test suite
├── setup.ts                   # Global Vitest setup
├── vitest.config.ts           # Root config
├── fixtures/                  # Shared test data
├── contracts/                 # Contract tests (both fake and real must pass)
├── base/                      # Base test classes, utilities
├── unit/                      # Unit tests
│   ├── shared/                # @chainglass/shared tests
│   ├── cli/                   # @chainglass/cli tests
│   └── web/                   # apps/web tests
├── integration/               # Integration tests
└── e2e/                       # End-to-end (future)
```

### Test Documentation

Every test must include a Test Doc comment with these 5 mandatory fields:

```typescript
test('should process input and log operations', async () => {
  /*
  Test Doc:
  - Why: Business/regression reason - explains why this test exists and what triggered its creation
  - Contract: Plain-English invariants - what must always be true for this test to pass
  - Usage Notes: How to call the API being tested, any gotchas or edge cases to be aware of
  - Quality Contribution: What bugs/failures this test catches, what regressions it prevents
  - Worked Example: Concrete input/output summary showing expected behavior
  */
  // ... test implementation
});
```

**Field Descriptions**:
- **Why**: The business reason, bug fix, or regression that motivated this test. Answers "why does this test exist?"
- **Contract**: The invariants being asserted in plain English. What must always hold true?
- **Usage Notes**: How to use the API being tested, including any gotchas or common mistakes
- **Quality Contribution**: What types of bugs or failures this test would catch if they occurred
- **Worked Example**: A concrete example showing specific inputs and their expected outputs

---

## Implementation Phases

### Phase 1: Monorepo Foundation

**Objective**: Establish the monorepo infrastructure with pnpm, Turborepo, TypeScript, Biome, and Just.

#### Tool Overview

**pnpm (Performant npm)**

pnpm is a disk-space efficient package manager that uses a content-addressable store. Unlike npm/yarn which copy dependencies into each project's `node_modules`, pnpm hard-links them from a single global store.

*Value Contribution*:
- **50-70% disk savings**: Each dependency version stored once, hard-linked everywhere
- **Strict dependency resolution**: Prevents "phantom dependencies" (using packages not in package.json)
- **workspace:* protocol**: Links local packages for development, resolves to versions for publishing
- **Fast installs**: Only downloads what's new, reuses cached packages

*How it works in Chainglass*:
```
chainglass/
├── packages/shared/     ← workspace:* links to this during dev
├── packages/cli/        ← imports from @chainglass/shared
└── node_modules/
    └── @chainglass/shared → symlink to packages/shared
```

**Turborepo**

Turborepo is a build system for JavaScript/TypeScript monorepos that understands package dependencies and orchestrates tasks intelligently.

*Value Contribution*:
- **Dependency-aware builds**: Knows `cli` depends on `shared`, builds `shared` first
- **Intelligent caching**: Skips rebuilding unchanged packages (70-80% faster CI)
- **Parallel execution**: Runs independent tasks simultaneously
- **Incremental adoption**: Works with existing npm scripts, no lock-in

*How it works in Chainglass*:
```json
// turbo.json - defines task dependencies
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],  // Build dependencies first
      "outputs": ["dist/**"]    // Cache these outputs
    }
  }
}
```

When you run `turbo build`:
1. Turborepo builds `@chainglass/shared` first (no dependencies)
2. Then builds `@chainglass/cli` and `apps/web` in parallel (both depend on shared)
3. Caches results - next build with no changes completes in <1 second

**Why Both Together**

| Concern | pnpm | Turborepo |
|---------|------|-----------|
| Dependency installation | ✓ | - |
| Disk efficiency | ✓ | - |
| Workspace linking | ✓ | - |
| Build orchestration | - | ✓ |
| Task caching | - | ✓ |
| Parallel execution | - | ✓ |

pnpm manages *what* packages exist and how they're linked. Turborepo manages *how* to build them efficiently.

**Deliverables**:
- Root `package.json` with bin exports (`cg`, `chainglass`)
- `pnpm-workspace.yaml` defining workspace packages
- Base `tsconfig.json` with path aliases
- `biome.json` for linting and formatting
- `turbo.json` for build orchestration
- `justfile` with development commands
- Minimal package stubs for shared, cli, mcp-server, web

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Bootstrap chicken-and-egg (R1-01) | Medium | High | Staged bootstrap: minimal packages first, then tooling |
| TypeScript path resolution (R1-02) | Medium | Medium | Verify `tsc --build --dry` after setup |

### Tasks (TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 1.1 | [x] | Create root package.json with workspace config | 1 | `pnpm init` succeeds, bin exports defined | [📋](tasks/phase-1-monorepo-foundation/execution.log.md#T001) | Completed [^1] |
| 1.2 | [x] | Create pnpm-workspace.yaml | 1 | References packages/* and apps/* | [📋](tasks/phase-1-monorepo-foundation/execution.log.md#T002) | Completed [^2] |
| 1.3 | [x] | Create minimal package stubs | 1 | packages/shared, packages/cli, packages/mcp-server, apps/web each have package.json with name+version | [📋](tasks/phase-1-monorepo-foundation/execution.log.md#T003) | Completed [^3] |
| 1.4 | [x] | Run initial pnpm install | 1 | `pnpm install` completes without errors | [📋](tasks/phase-1-monorepo-foundation/execution.log.md#T004) | Completed [^4] |
| 1.5 | [x] | Create base tsconfig.json | 2 | Strict mode, path aliases for all packages | [📋](tasks/phase-1-monorepo-foundation/execution.log.md#T005) | Completed [^5] |
| 1.6 | [x] | Create package-level tsconfigs | 2 | Each package has tsconfig extending root, composite: true | [📋](tasks/phase-1-monorepo-foundation/execution.log.md#T006) | Completed [^6] |
| 1.7 | [x] | Create biome.json | 1 | Linter + formatter configured, recommended rules | [📋](tasks/phase-1-monorepo-foundation/execution.log.md#T007) | Completed [^7] |
| 1.8 | [x] | Create turbo.json | 2 | Build pipeline with ^build dependencies, caching enabled | [📋](tasks/phase-1-monorepo-foundation/execution.log.md#T008) | Completed [^8] |
| 1.9 | [x] | Create justfile | 2 | Commands: install, dev, build, test, lint, format, fft, typecheck | [📋](tasks/phase-1-monorepo-foundation/execution.log.md#T009) | Completed [^9] |
| 1.10 | [x] | Create test/vitest.config.ts | 2 | Root Vitest config with tsconfigPaths plugin | [📋](tasks/phase-1-monorepo-foundation/execution.log.md#T010) | Completed [^10] |
| 1.11 | [x] | Create test/setup.ts and placeholder test | 1 | Global test setup with DI container reset + placeholder test proving infra works | [📋](tasks/phase-1-monorepo-foundation/execution.log.md#T011) | Completed [^11] |
| 1.12 | [x] | Verify Phase 1 gate | 1 | `pnpm install && just --list && just typecheck` passes | [📋](tasks/phase-1-monorepo-foundation/execution.log.md#T012) | Completed [^12] |

### Test Examples

```typescript
// test/setup.ts (minimal - NO @chainglass/* imports yet)
import { container } from 'tsyringe';

// NOTE: Do NOT import from @chainglass/shared here - it doesn't exist until Phase 2
// Shared package imports will be added in Phase 2 after the package is created

beforeEach(() => {
  container.clearInstances();
});
```

```typescript
// test/unit/placeholder.test.ts
// Proves test infrastructure works. Delete after Phase 2 adds real tests.
import { describe, it, expect } from 'vitest';
import { container } from 'tsyringe';

describe('Test Infrastructure', () => {
  it('should have working test setup', () => {
    /*
    Test Doc:
    - Why: Validates Vitest + tsyringe integration works before real tests exist
    - Contract: container from tsyringe is defined and accessible in tests
    - Usage Notes: This is a placeholder - delete once Phase 2 adds real tests
    - Quality Contribution: Catches broken test infrastructure early in Phase 1
    - Worked Example: container !== undefined proves DI is available to tests
    */
    expect(container).toBeDefined();
  });
});
```

### Non-Happy-Path Coverage
- [ ] Verify `pnpm install` fails gracefully with missing workspace.yaml
- [ ] Verify `just` commands show helpful errors if tools not installed

### Acceptance Criteria
- [ ] `pnpm install` completes without errors
- [ ] `just --list` shows all commands
- [ ] `pnpm tsc --build --dry` shows correct build order
- [ ] `just typecheck` passes (empty project)
- [ ] `just lint` runs without errors

---

### Phase 2: Shared Package

**Objective**: Create the core `@chainglass/shared` package with ILogger interface, FakeLogger, and PinoLoggerAdapter using interface-first TDD.

#### Shared Package Architecture

`@chainglass/shared` is the **core package** that both CLI and web depend on. This is not just a "utilities" package - it contains the majority of the system's business logic and infrastructure.

**Key Principle**: Most services and adapters are shared between CLI and web. We don't want to write them twice.

**What Lives in Shared**:

| Category | Examples (real + illustrative) | Rationale |
|----------|-------------------------------|-----------|
| **ALL Interfaces** | `ILogger` (real), `ISampleService`, `ISampleAdapter` | Single source of truth for contracts |
| **ALL Fakes** | `FakeLogger` (real), `FakeSampleAdapter` | Colocated with interfaces for TDD |
| **Shared Services** | `SampleService` (illustrative - future: real business services) | Business logic used by both CLI and web |
| **Shared Adapters** | `PinoLoggerAdapter` (real), `SampleStorageAdapter` (illustrative) | Infrastructure used by both CLI and web |
| **Types/DTOs** | `SampleResult`, `SampleConfig` (illustrative) | Shared data structures |

*Note: "Sample*" names are placeholders demonstrating the pattern. Real business implementations (e.g., enrichment, spec parsing) will be added in future feature phases.*

**What Lives in Package-Specific Locations**:

| Package | Examples (illustrative) | Rationale |
|---------|------------------------|-----------|
| `packages/cli/` | `SampleTerminalAdapter`, `SampleCLIService` | Terminal-specific UI concerns |
| `apps/web/` | `SampleSessionService`, `SampleWebAdapter` | Browser/server-specific concerns |

*Note: These are illustrative names. Real implementations depend on actual feature requirements.*

**Directory Structure**:
```
packages/shared/src/
├── interfaces/           # ALL interfaces (single source of truth)
│   ├── logger.interface.ts        # Real - implemented in Phase 2
│   ├── sample.interface.ts        # Illustrative pattern
│   └── index.ts
├── services/             # Shared business logic (MAJORITY lives here)
│   ├── sample.service.ts          # Illustrative pattern
│   └── index.ts
├── adapters/             # Shared infrastructure (MAJORITY lives here)
│   ├── pino-logger.adapter.ts     # Real - implemented in Phase 2
│   ├── sample-storage.adapter.ts  # Illustrative pattern
│   └── index.ts
├── fakes/                # ALL fakes (colocated with interfaces)
│   ├── fake-logger.ts             # Real - implemented in Phase 2
│   ├── fake-sample-adapter.ts     # Illustrative pattern
│   └── index.ts
├── types/                # Shared DTOs and type definitions
│   ├── sample-result.ts           # Illustrative pattern
│   └── index.ts
└── index.ts              # Package exports
```

**Why This Matters**: When you add a new capability, the interface, adapter, fake, and service all go in `@chainglass/shared`. Both CLI and web use the same shared services. Only truly package-specific code (terminal formatting, browser sessions) lives outside shared.

**Phase 2 Scope**: This phase establishes the pattern with ILogger as the first example. Future phases will add more interfaces/services/adapters following this same structure.

**Deliverables**:
- `ILogger` interface with all log levels
- `FakeLogger` with test helper methods
- `PinoLoggerAdapter` implementing ILogger
- Contract tests verifying both implementations
- Package exports properly configured

**Dependencies**: Phase 1 complete (workspace functional)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Fake contract drift (R1-07) | Low | Medium | Contract tests from day one |
| Path resolution in tests (R1-04) | Medium | Medium | Verify imports resolve before continuing |

### Tasks (TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 2.1 | [x] | Create packages/shared/src structure | 1 | interfaces/, adapters/, fakes/, types/ directories | [📋](tasks/phase-2-shared-package/execution.log.md#task-t001-create-packagessharedsrc-directory-structure) | [^13] |
| 2.2 | [x] | Write ILogger interface | 1 | All log levels, child() method, typed parameters | [📋](tasks/phase-2-shared-package/execution.log.md#task-t002-write-ilogger-interface-with-all-log-levels) | I1-03 [^13] |
| 2.3 | [x] | Write FakeLogger implementing ILogger | 2 | Captures all log entries, test helpers for assertions | [📋](tasks/phase-2-shared-package/execution.log.md#task-t003-write-fakelogger-implementing-ilogger) | I1-03 [^14] |
| 2.4 | [x] | Write test for FakeLogger | 2 | Tests: log capture, level filtering, message matching, clear() | [📋](tasks/phase-2-shared-package/execution.log.md#task-t004-write-tests-for-fakelogger) | I1-03 [^15] |
| 2.5 | [x] | Run test - expect RED | 1 | Test fails (FakeLogger not exported) | [📋](tasks/phase-2-shared-package/execution.log.md#task-t005-run-fakelogger-tests---expect-red) | TDD: RED |
| 2.6 | [x] | Fix exports, run test - expect GREEN | 1 | All FakeLogger tests pass | [📋](tasks/phase-2-shared-package/execution.log.md#task-t006-fix-exports-run-fakelogger-tests---expect-green) | TDD: GREEN |
| 2.7 | [x] | Create logger contract tests | 2 | Shared test suite both fake and real must pass | [📋](tasks/phase-2-shared-package/execution.log.md#task-t007-create-logger-contract-tests) | R1-07 [^16] |
| 2.8 | [x] | Write PinoLoggerAdapter | 2 | Implements ILogger using pino | [📋](tasks/phase-2-shared-package/execution.log.md#task-t008-write-pinologgeradapter-implementing-ilogger) | I1-03 [^17] |
| 2.9 | [x] | Run contract tests for PinoLoggerAdapter | 1 | All contract tests pass | [📋](tasks/phase-2-shared-package/execution.log.md#task-t009-run-contract-tests-for-pinologgeradapter) | |
| 2.10 | [x] | Configure package exports | 1 | Exports: index, interfaces, fakes, adapters | [📋](tasks/phase-2-shared-package/execution.log.md#task-t010-configure-package-exports-in-indexts) | [^18] |
| 2.11 | [x] | Write package build script | 1 | `pnpm -F @chainglass/shared build` succeeds | [📋](tasks/phase-2-shared-package/execution.log.md#task-t011-add-package-build-script) | [^18] |
| 2.12 | [x] | Verify Phase 2 gate | 1 | Build + test pass, imports resolve from root test/ | [📋](tasks/phase-2-shared-package/execution.log.md#task-t012-verify-phase-2-gate) | GATE |

### Test Examples

```typescript
// test/unit/shared/fake-logger.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { FakeLogger, LogLevel } from '@chainglass/shared';

describe('FakeLogger', () => {
  let logger: FakeLogger;

  beforeEach(() => {
    logger = new FakeLogger();
  });

  it('should capture log entries at all levels', () => {
    /*
    Test Doc:
    - Why: FakeLogger is the primary test double for logging; must capture all levels to enable assertions
    - Contract: Every log method call is recorded with level, message, and optional data intact
    - Usage Notes: Call any log method (trace/debug/info/warn/error/fatal), then use getEntries() to inspect
    - Quality Contribution: Catches missing log level implementations, ensures services can be tested for logging behavior
    - Worked Example: logger.info('msg') -> getEntries() returns [{level: INFO, message: 'msg', data: undefined}]
    */
    logger.trace('trace msg');
    logger.debug('debug msg');
    logger.info('info msg');
    logger.warn('warn msg');
    logger.error('error msg', new Error('test'));
    logger.fatal('fatal msg', new Error('critical'));

    const entries = logger.getEntries();
    expect(entries).toHaveLength(6);
    expect(entries.map(e => e.level)).toEqual([
      LogLevel.TRACE, LogLevel.DEBUG, LogLevel.INFO,
      LogLevel.WARN, LogLevel.ERROR, LogLevel.FATAL
    ]);
  });

  it('should filter entries by level', () => {
    /*
    Test Doc:
    - Why: Tests often need to assert on specific log levels without noise from other levels
    - Contract: getEntriesByLevel(level) returns only entries matching that exact level
    - Usage Notes: Pass a LogLevel enum value; returns empty array if no matches
    - Quality Contribution: Catches filtering bugs that could cause false-positive test assertions
    - Worked Example: After info('a'), error('b'), info('c') -> getEntriesByLevel(INFO) returns 2 entries
    */
    logger.info('info 1');
    logger.error('error 1', new Error('e1'));
    logger.info('info 2');

    const infoEntries = logger.getEntriesByLevel(LogLevel.INFO);
    expect(infoEntries).toHaveLength(2);
  });

  it('should assert message was logged', () => {
    /*
    Test Doc:
    - Why: Manual inspection of log entries is verbose; need a one-liner assertion method
    - Contract: assertLoggedAtLevel throws if no entry matches level+message substring, otherwise succeeds
    - Usage Notes: Uses substring matching for message; throws descriptive error on failure
    - Quality Contribution: Catches missing or incorrect log calls in services; improves test readability
    - Worked Example: After info('Processing request'), assertLoggedAtLevel(INFO, 'Processing') succeeds
    */
    logger.info('Processing request', { requestId: '123' });

    // Should not throw
    logger.assertLoggedAtLevel(LogLevel.INFO, 'Processing request');

    // Should throw for non-existent message
    expect(() => {
      logger.assertLoggedAtLevel(LogLevel.INFO, 'Non-existent');
    }).toThrow();
  });
});

// test/contracts/logger.contract.ts
import { describe, it, expect } from 'vitest';
import type { ILogger } from '@chainglass/shared';

export function loggerContractTests(name: string, createLogger: () => ILogger) {
  describe(`${name} implements ILogger contract`, () => {
    it('should not throw when logging at any level', () => {
      /*
      Test Doc:
      - Why: Contract tests ensure FakeLogger and PinoLoggerAdapter behave identically; prevents fake drift
      - Contract: All ILogger implementations must accept log calls at every level without throwing
      - Usage Notes: Run this test suite for both FakeLogger and real adapters via parameterized factory
      - Quality Contribution: Catches breaking changes in either implementation; ensures test doubles are trustworthy
      - Worked Example: createLogger().info('test') must not throw for both FakeLogger and PinoLoggerAdapter
      */
      const logger = createLogger();
      expect(() => logger.trace('trace')).not.toThrow();
      expect(() => logger.debug('debug')).not.toThrow();
      expect(() => logger.info('info')).not.toThrow();
      expect(() => logger.warn('warn')).not.toThrow();
      expect(() => logger.error('error', new Error('e'))).not.toThrow();
      expect(() => logger.fatal('fatal', new Error('f'))).not.toThrow();
    });

    it('should create child logger with metadata', () => {
      /*
      Test Doc:
      - Why: Child loggers enable request-scoped context (e.g., requestId); both fake and real must support this
      - Contract: child(metadata) returns a valid ILogger that can log without throwing
      - Usage Notes: Pass object with context fields; child inherits parent config plus new metadata
      - Quality Contribution: Catches child logger creation failures; ensures structured logging context works
      - Worked Example: createLogger().child({requestId: '123'}).info('msg') must not throw
      */
      const logger = createLogger();
      const child = logger.child({ requestId: '123' });
      expect(child).toBeDefined();
      expect(() => child.info('child log')).not.toThrow();
    });
  });
}
```

### Non-Happy-Path Coverage
- [ ] Error with null message
- [ ] Error with undefined data
- [ ] Child logger with empty metadata

### Acceptance Criteria
- [ ] `pnpm -F @chainglass/shared build` succeeds
- [ ] `pnpm -F @chainglass/shared test` passes
- [ ] FakeLogger has assertLoggedAtLevel(), getEntries(), getEntriesByLevel(), clear()
- [ ] Contract tests pass for both FakeLogger and PinoLoggerAdapter
- [ ] `import { ILogger, FakeLogger } from '@chainglass/shared'` resolves

---

### Phase 3: Next.js App with Clean Architecture

**Objective**: Create the Next.js web application with clean architecture patterns, DI container, and sample service demonstrating the pattern.

#### Web App Architecture

The web app at `apps/web/` imports most of its services and adapters from `@chainglass/shared`. Only web-specific concerns live in this package.

**What the Web App Imports from Shared**:
- All interfaces (`ILogger` (real), `ISampleService` (illustrative), etc.)
- All shared services (`SampleService` (illustrative) - future: real business services)
- All shared adapters (`PinoLoggerAdapter` (real), `SampleStorageAdapter` (illustrative))
- All fakes for testing (`FakeLogger` (real), `FakeSampleAdapter` (illustrative))

**What Lives in Web App Only** (illustrative - created as features require):
| Component | Purpose |
|-----------|---------|
| `services/SampleSessionService` | Illustrative: web-specific session handling |
| `adapters/SampleWebAdapter` | Illustrative: browser-specific concerns |
| `lib/di-container.ts` | Web-specific DI wiring (real - created in Phase 3) |

*Note: "Sample*" names are placeholders. Real web-specific implementations depend on feature requirements.*

**Directory Structure**:
```
apps/web/src/
├── app/                    # Next.js App Router pages
├── services/               # Web-ONLY services (minimal - most in shared)
├── adapters/               # Web-ONLY adapters (minimal - most in shared)
└── lib/
    └── di-container.ts     # Wires shared + web-specific together
```

**Phase 3 Scope**: This phase creates the DI container that wires `@chainglass/shared` services/adapters. A `SampleService` demonstrates the pattern - it's intentionally simple to show how services receive adapters via DI.

**Deliverables**:
- Next.js 15 app with App Router
- DI container setup with child container pattern
- Sample service demonstrating adapter injection
- Tests using FakeLogger
- Clean architecture directory structure

**Dependencies**: Phase 2 complete (shared package buildable)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| TSyringe in RSC (R1-03) | Medium | High | Decorator-free pattern, test RSC rendering |
| Architecture boundary violation (R1-05) | Low | High | Add check-architecture command early |

### Tasks (TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 3.1 | [x] | Verify/update Next.js app structure | 1 | App Router structure verified | [📋](tasks/phase-3-nextjs-app-clean-architecture/execution.log.md#task-t001-verifyupdate-nextjs-app-structure) | Completed [^19] |
| 3.2 | [x] | Create services/, adapters/, lib/ directories | 1 | Directory structure for clean architecture | [📋](tasks/phase-3-nextjs-app-clean-architecture/execution.log.md#task-t002-create-services-adapters-lib-directories) | Completed [^19] |
| 3.2a | [x] | Create test/base/web-test.ts with Vitest fixtures | 2 | DRY test infrastructure | [📋](tasks/phase-3-nextjs-app-clean-architecture/execution.log.md#task-t002a-create-testbaseweb-testts-with-vitest-fixtures) | Completed [^19] |
| 3.3 | [x] | Write tests for DI container | 2 | Tests compile, all fail (RED) | [📋](tasks/phase-3-nextjs-app-clean-architecture/execution.log.md#task-t003-write-tests-for-di-container) | TDD: RED [^19] |
| 3.4 | [x] | Implement DI container with child containers | 2 | createProductionContainer(), createTestContainer() | [📋](tasks/phase-3-nextjs-app-clean-architecture/execution.log.md#task-t004-implement-di-container-with-child-containers) | Decorator-free pattern [^19] |
| 3.5 | [x] | Run DI container tests - expect GREEN | 1 | All 4 DI tests pass | [📋](tasks/phase-3-nextjs-app-clean-architecture/execution.log.md#task-t005-run-di-container-tests---expect-green) | TDD: GREEN [^19] |
| 3.6 | [x] | Write tests for SampleService | 2 | Tests compile, all fail (RED) | [📋](tasks/phase-3-nextjs-app-clean-architecture/execution.log.md#task-t006-write-tests-for-sampleservice) | TDD: RED [^19] |
| 3.7 | [x] | Implement SampleService with ILogger injection | 2 | REFERENCE IMPLEMENTATION with DI | [📋](tasks/phase-3-nextjs-app-clean-architecture/execution.log.md#task-t007-implement-sampleservice-with-ilogger-injection) | Completed [^19] |
| 3.8 | [x] | Run SampleService tests - expect GREEN | 1 | All 3 service tests pass | [📋](tasks/phase-3-nextjs-app-clean-architecture/execution.log.md#task-t008-run-sampleservice-tests---expect-green) | TDD: GREEN [^19] |
| 3.9 | [x] | Create minimal app/page.tsx | 1 | Page renders at localhost:3000 | [📋](tasks/phase-3-nextjs-app-clean-architecture/execution.log.md#task-t009-create-minimal-apppagetsx) | Verified [^19] |
| 3.10 | [x] | Create health check API route | 1 | GET /api/health returns `{ status: 'ok' }` | [📋](tasks/phase-3-nextjs-app-clean-architecture/execution.log.md#task-t010-create-health-check-api-route) | Completed [^19] |
| 3.11 | [x] | Verify Phase 3 gate | 1 | `just test`, `just build`, `just fft` all pass | [📋](tasks/phase-3-nextjs-app-clean-architecture/execution.log.md#task-t011-verify-phase-3-gate) | GATE passed [^19] |

### Test Examples

```typescript
// test/unit/web/di-container.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { container } from 'tsyringe';
import {
  createProductionContainer,
  createTestContainer,
} from '@/lib/di-container';
import { ILogger, FakeLogger, PinoLoggerAdapter } from '@chainglass/shared';

describe('DI Container', () => {
  beforeEach(() => {
    container.clearInstances();
  });

  it('should create production container with real adapters', () => {
    /*
    Test Doc:
    - Why: Production must use real adapters (PinoLoggerAdapter) not fakes; wrong wiring causes silent failures
    - Contract: createProductionContainer() resolves 'ILogger' to PinoLoggerAdapter instance
    - Usage Notes: Use createProductionContainer() in app startup; never in tests
    - Quality Contribution: Catches misconfigured production DI that would ship fakes to production
    - Worked Example: createProductionContainer().resolve('ILogger') returns PinoLoggerAdapter
    */
    const prodContainer = createProductionContainer();
    const logger = prodContainer.resolve<ILogger>('ILogger');

    expect(logger).toBeInstanceOf(PinoLoggerAdapter);
  });

  it('should create test container with fakes', () => {
    /*
    Test Doc:
    - Why: Tests must use fakes for deterministic assertions; real adapters cause flaky/slow tests
    - Contract: createTestContainer() resolves 'ILogger' to FakeLogger instance
    - Usage Notes: Use createTestContainer() in all test setup; provides assertion helpers
    - Quality Contribution: Catches test container misconfiguration that would use real I/O in tests
    - Worked Example: createTestContainer().resolve('ILogger') returns FakeLogger with getEntries()
    */
    const testContainer = createTestContainer();
    const logger = testContainer.resolve<ILogger>('ILogger');

    expect(logger).toBeInstanceOf(FakeLogger);
  });

  it('should isolate containers from each other', () => {
    /*
    Test Doc:
    - Why: TSyringe singleton pollution caused flaky tests; child containers solve this
    - Contract: Each createTestContainer() call returns independent container with isolated state
    - Usage Notes: Always create fresh container per test; never share containers between tests
    - Quality Contribution: Eliminates test order dependencies and state leakage between tests
    - Worked Example: container1.resolve('ILogger').info('x') does not affect container2.resolve('ILogger').getEntries()
    */
    const container1 = createTestContainer();
    const container2 = createTestContainer();

    const logger1 = container1.resolve<ILogger>('ILogger') as FakeLogger;
    const logger2 = container2.resolve<ILogger>('ILogger') as FakeLogger;

    logger1.info('container 1 message');

    expect(logger1.getEntries()).toHaveLength(1);
    expect(logger2.getEntries()).toHaveLength(0);
  });
});

// test/unit/web/sample-service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SampleService } from '@/services/sample.service';
import { FakeLogger, LogLevel } from '@chainglass/shared';

describe('SampleService', () => {
  let service: SampleService;
  let fakeLogger: FakeLogger;

  beforeEach(() => {
    fakeLogger = new FakeLogger();
    service = new SampleService(fakeLogger);
  });

  it('should process input and return result', async () => {
    /*
    Test Doc:
    - Why: Core business logic must transform input correctly; this is the primary happy path
    - Contract: doSomething(input) returns 'Processed: {input}' string
    - Usage Notes: Pass any string; async method returns Promise<string>
    - Quality Contribution: Catches transformation logic bugs; ensures service does its primary job
    - Worked Example: doSomething('test-input') returns 'Processed: test-input'
    */
    const result = await service.doSomething('test-input');

    expect(result).toBe('Processed: test-input');
  });

  it('should log processing operations', async () => {
    /*
    Test Doc:
    - Why: Operations must be observable for debugging and monitoring; silent services are hard to troubleshoot
    - Contract: doSomething() logs INFO 'Processing input' at start and 'Processing complete' at end
    - Usage Notes: Use FakeLogger.assertLoggedAtLevel() to verify; checks substring match
    - Quality Contribution: Catches missing log statements; ensures observability contract is maintained
    - Worked Example: After doSomething('x'), fakeLogger contains INFO entries for start and complete
    */
    await service.doSomething('test');

    fakeLogger.assertLoggedAtLevel(LogLevel.INFO, 'Processing input');
    fakeLogger.assertLoggedAtLevel(LogLevel.INFO, 'Processing complete');
  });

  it('should include input in log metadata', async () => {
    /*
    Test Doc:
    - Why: Structured logging with context enables filtering and correlation in production log systems
    - Contract: 'Processing input' log entry includes {input: <value>} in metadata
    - Usage Notes: Access entry.data to inspect structured metadata; data is optional object
    - Quality Contribution: Catches missing context in logs; ensures production debugging is possible
    - Worked Example: After doSomething('my-value'), log entry has data.input === 'my-value'
    */
    await service.doSomething('my-value');

    const entries = fakeLogger.getEntriesByLevel(LogLevel.INFO);
    const inputEntry = entries.find(e => e.message.includes('Processing input'));

    expect(inputEntry?.data?.input).toBe('my-value');
  });
});
```

### Non-Happy-Path Coverage
- [ ] Service handles null input gracefully
- [ ] Container handles unregistered token
- [ ] RSC page renders without DI errors

### Acceptance Criteria
- [ ] `just dev` starts Next.js on localhost:3000
- [ ] `/api/health` returns `{ status: 'ok' }`
- [ ] All DI container tests pass
- [ ] All sample service tests pass
- [ ] `just check-architecture` reports no violations
- [ ] TypeScript strict mode passes

---

### Phase 4: CLI Package

**Objective**: Create the CLI package with Commander.js, `cg` command entry point, and bundled distribution via esbuild.

#### CLI Architecture

The CLI at `packages/cli/` imports most of its services and adapters from `@chainglass/shared`. Only CLI-specific concerns (terminal UI, command parsing) live in this package.

**What the CLI Imports from Shared**:
- All interfaces (`ILogger` (real), `ISampleService` (illustrative), etc.)
- All shared services (`SampleService` (illustrative) - future: real business services)
- All shared adapters (`PinoLoggerAdapter` (real), `SampleStorageAdapter` (illustrative))
- All fakes for testing (`FakeLogger` (real), `FakeSampleAdapter` (illustrative))

**What Lives in CLI Only** (illustrative - created as features require):
| Component | Purpose |
|-----------|---------|
| `bin/cg.ts` | Entry point with shebang (real - created in Phase 4) |
| `commands/*.ts` | Commander.js command definitions (real - created in Phase 4) |
| `adapters/SampleTerminalAdapter` | Illustrative: terminal output formatting |
| `services/SampleCLIService` | Illustrative: CLI-specific operations |

*Note: "Sample*" names are placeholders. Real CLI-specific implementations depend on feature requirements.*

**Directory Structure**:
```
packages/cli/src/
├── bin/
│   └── cg.ts               # #!/usr/bin/env node entry (real)
├── commands/               # Command handlers (real)
│   ├── dev.command.ts
│   ├── mcp.command.ts
│   └── index.ts
├── services/               # CLI-ONLY services (minimal - most in shared)
├── adapters/               # CLI-ONLY adapters (minimal - most in shared)
└── index.ts
```

**Phase 4 Scope**: This phase creates the CLI entry point and command structure. Commands like `cg dev` and `cg mcp` orchestrate shared services. Future commands will use real services from `@chainglass/shared`.

**Deliverables**:
- Commander.js CLI with `--help`, `--version`, `dev`, `mcp` commands
- esbuild bundling to `dist/cli.js`
- `npm link` workflow functional
- Development and production build modes

**Dependencies**: Phase 2 complete (shared package), Phase 3 partial (Next.js can start)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Bundle includes wrong deps (R1-06) | Medium | High | Test bundle in isolation |
| workspace:* not resolved (R1-06) | Low | High | Use `packages: 'bundle'` in esbuild |

### Tasks (TDD Approach)

> **Note**: Actual implementation used refined task breakdown (T001-T016) documented in [tasks/phase-4-cli-package/tasks.md](tasks/phase-4-cli-package/tasks.md). Key changes: `cg web` replaces `cg dev` for production-first design, Next.js standalone bundling added.

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 4.1 | [x] | Create packages/cli/src structure | 1 | bin/, commands/ directories | [📋](tasks/phase-4-cli-package/execution.log.md#task-t001) | T001 [^20] |
| 4.2 | [x] | Write test for CLI argument parsing | 2 | Tests: --help, --version, web, mcp commands | [📋](tasks/phase-4-cli-package/execution.log.md#task-t002) | TDD: RED; T002 [^21] |
| 4.3 | [x] | Implement cg.ts entry point | 2 | Commander program with commands | [📋](tasks/phase-4-cli-package/execution.log.md#task-t003) | T003 [^22] |
| 4.4 | [x] | Implement help and version commands | 1 | `cg --help` and `cg --version` work | [📋](tasks/phase-4-cli-package/execution.log.md#task-t004) | T004 [^23] |
| 4.5 | [x] | Run CLI tests - expect GREEN | 1 | All 9 argument parsing tests pass | [📋](tasks/phase-4-cli-package/execution.log.md#task-t005) | TDD: GREEN; T005 [^24] |
| 4.6 | [x] | Write test for web command | 2 | Tests: starts Next.js standalone, port option | [📋](tasks/phase-4-cli-package/execution.log.md#task-t007) | TDD: RED; T007 [^26] |
| 4.7 | [x] | Implement web command | 2 | Starts bundled standalone server | [📋](tasks/phase-4-cli-package/execution.log.md#task-t008) | T008 [^27] |
| 4.8 | [x] | Run web tests - expect GREEN | 1 | All 5 web command tests pass | [📋](tasks/phase-4-cli-package/execution.log.md#task-t009) | TDD: GREEN; T009 [^28] |
| 4.9 | [x] | Create esbuild configuration | 2 | CJS bundle + standalone asset copy | [📋](tasks/phase-4-cli-package/execution.log.md#task-t011) | T011 [^30] |
| 4.10 | [x] | Add CLI build scripts | 1 | `pnpm -F @chainglass/cli build` creates dist/cli.cjs | [📋](tasks/phase-4-cli-package/execution.log.md#task-t012) | T012 [^31] |
| 4.11 | [~] | Test bundle in isolation | 2 | PARTIAL: pnpm symlink issue prevents full isolation | [📋](tasks/phase-4-cli-package/execution.log.md#task-t013) | T013 [^32] Known limitation |
| 4.12 | [x] | Test npm link workflow | 1 | `npm link && cg --help` works | [📋](tasks/phase-4-cli-package/execution.log.md#task-t014) | T014 [^33] |
| 4.13 | [x] | Verify Phase 4 gate | 1 | Built CLI, npm link, `cg web` starts server, npx works | [📋](tasks/phase-4-cli-package/execution.log.md#task-t016) | GATE; T016 [^35] |

### Test Examples

```typescript
// test/unit/cli/cli-parser.test.ts
import { describe, it, expect } from 'vitest';
import { createProgram } from '@chainglass/cli';

describe('CLI Parser', () => {
  it('should parse --help flag', () => {
    /*
    Test Doc:
    - Why: CLI must be self-documenting; --help is the primary discovery mechanism for users
    - Contract: helpInformation() returns string containing 'cg', 'dev', and 'mcp' command names
    - Usage Notes: createProgram() returns Commander instance; helpInformation() gets formatted help text
    - Quality Contribution: Catches missing command registrations; ensures all commands are discoverable
    - Worked Example: createProgram().helpInformation() contains 'cg', 'dev', 'mcp' substrings
    */
    const program = createProgram();
    const output = program.helpInformation();

    expect(output).toContain('cg');
    expect(output).toContain('dev');
    expect(output).toContain('mcp');
  });

  it('should parse dev command', () => {
    /*
    Test Doc:
    - Why: 'cg dev' is the primary developer workflow command; must be registered and documented
    - Contract: Program contains 'dev' command with description containing 'development'
    - Usage Notes: Access program.commands array to find command by name()
    - Quality Contribution: Catches missing dev command or incorrect description; ensures DX is correct
    - Worked Example: program.commands.find(c => c.name() === 'dev') is defined with 'development' in description
    */
    const program = createProgram();
    const devCmd = program.commands.find(c => c.name() === 'dev');

    expect(devCmd).toBeDefined();
    expect(devCmd?.description()).toContain('development');
  });

  it('should parse mcp command with options', () => {
    /*
    Test Doc:
    - Why: MCP server needs --stdio flag for AI agent integration; missing option breaks agent workflows
    - Contract: Program contains 'mcp' command with --stdio option in its flags
    - Usage Notes: Check mcpCmd.options array for option with flags containing '--stdio'
    - Quality Contribution: Catches missing MCP options; ensures AI agent integration is possible
    - Worked Example: program.commands.find(c => c.name() === 'mcp').options includes --stdio flag
    */
    const program = createProgram();
    const mcpCmd = program.commands.find(c => c.name() === 'mcp');

    expect(mcpCmd).toBeDefined();
    expect(mcpCmd?.options.some(o => o.flags.includes('--stdio'))).toBe(true);
  });
});

// test/integration/cli-dev.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';

describe('CLI dev command', () => {
  let proc: ChildProcess | null = null;

  afterEach(() => {
    if (proc) {
      proc.kill();
      proc = null;
    }
  });

  it('should start Next.js development server', async () => {
    /*
    Test Doc:
    - Why: 'cg dev' must spawn Next.js correctly; broken dev command blocks all local development
    - Contract: Running 'cg dev' outputs text containing 'Ready', 'localhost:3000', or 'started' within 10s
    - Usage Notes: Spawns child process; must clean up proc in afterEach; uses stdout pipe for assertion
    - Quality Contribution: Catches broken dev command wiring; ensures developers can start local server
    - Worked Example: spawn('node', ['dist/cli.js', 'dev']) stdout eventually contains 'Ready' or 'localhost:3000'
    */
    proc = spawn('node', ['dist/cli.js', 'dev'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const output = await new Promise<string>((resolve) => {
      let data = '';
      proc!.stdout?.on('data', (chunk) => {
        data += chunk.toString();
        if (data.includes('Ready') || data.includes('localhost:3000')) {
          resolve(data);
        }
      });
      setTimeout(() => resolve(data), 10000);
    });

    expect(output).toMatch(/Ready|localhost:3000|started/i);
  });
});
```

### Non-Happy-Path Coverage
- [ ] CLI handles unknown command
- [ ] dev command handles missing apps/web
- [ ] Bundle handles missing lazy-loaded deps gracefully

### Acceptance Criteria
- [ ] `pnpm -F @chainglass/cli build` creates dist/cli.js
- [ ] Bundle size < 1MB
- [ ] `npm link && cg --help` shows help
- [ ] `cg web` starts Next.js production server
- [ ] Bundle works without node_modules present

---

### Phase 5: MCP Server Package

**Objective**: Create the MCP server package with basic structure, stdio transport, and CLI integration via `cg mcp`.

**Deliverables**:
- Basic MCP server structure
- stdio transport support
- CLI `cg mcp` command integration
- Strict stdout discipline for protocol compliance

**Dependencies**: Phase 4 complete (CLI functional)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| stdout pollution (R1-08) | Medium | Medium | Test stdio cleanliness explicitly |

### Tasks (TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 5.1 | [x] | Create packages/mcp-server/src structure | 1 | server.ts, index.ts | [📋](tasks/phase-5-mcp-server-package/execution.log.md) | Complete [^21] |
| 5.2 | [x] | Write test for MCP server initialization | 2 | Tests: server creates, handles stdio mode | [📋](tasks/phase-5-mcp-server-package/execution.log.md) | Complete [^21] |
| 5.3 | [x] | Implement basic MCP server | 2 | Server initializes, handles initialize request | [📋](tasks/phase-5-mcp-server-package/execution.log.md) | Complete [^21] |
| 5.4 | [x] | Run server tests - expect GREEN | 1 | Server initialization tests pass | [📋](tasks/phase-5-mcp-server-package/execution.log.md) | Complete [^21] |
| 5.5 | [x] | Write test for stdio cleanliness | 2 | Tests: no stdout before input, only JSON-RPC on stdout | [📋](tasks/phase-5-mcp-server-package/execution.log.md) | Complete [^21] |
| 5.6 | [x] | Implement strict stdout discipline | 2 | Redirect logs to stderr in stdio mode | [📋](tasks/phase-5-mcp-server-package/execution.log.md) | Complete [^21] |
| 5.7 | [x] | Run stdio tests - expect GREEN | 1 | Stdio cleanliness tests pass | [📋](tasks/phase-5-mcp-server-package/execution.log.md) | Complete [^21] |
| 5.8 | [x] | Write test for mcp command | 2 | Tests: `cg mcp --help`, `cg mcp --stdio` | [📋](tasks/phase-5-mcp-server-package/execution.log.md) | Complete [^21] |
| 5.9 | [x] | Implement mcp command in CLI | 2 | Lazy-loads MCP server, passes options | [📋](tasks/phase-5-mcp-server-package/execution.log.md) | Complete [^21] |
| 5.10 | [x] | Run mcp command tests - expect GREEN | 1 | MCP command tests pass | [📋](tasks/phase-5-mcp-server-package/execution.log.md) | Complete [^21] |
| 5.11 | [x] | Verify Phase 5 gate | 1 | `cg mcp --help` shows options, stdio works | [📋](tasks/phase-5-mcp-server-package/execution.log.md) | Complete [^21] |

### Test Examples

```typescript
// test/integration/mcp-stdio.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';

describe('MCP stdio transport', () => {
  let proc: ChildProcess | null = null;

  afterEach(() => {
    if (proc) {
      proc.kill();
      proc = null;
    }
  });

  it('should not output anything to stdout before receiving input', async () => {
    /*
    Test Doc:
    - Why: MCP stdio protocol requires stdout be reserved for JSON-RPC only; any startup noise corrupts the protocol
    - Contract: After spawn with --stdio, stdout remains empty until first JSON-RPC input is received
    - Usage Notes: Wait 500ms for any accidental startup messages; stderr is allowed for logs
    - Quality Contribution: Catches console.log or logger misconfiguration that would break AI agent integration
    - Worked Example: spawn mcp --stdio, wait 500ms, stdout.join('') === '' (empty string)
    */
    proc = spawn('node', ['dist/cli.js', 'mcp', '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const stdout: string[] = [];
    proc.stdout?.on('data', (data) => stdout.push(data.toString()));

    // Wait briefly for any startup messages
    await new Promise((r) => setTimeout(r, 500));

    // Should have no stdout output
    expect(stdout.join('')).toBe('');
  });

  it('should respond to valid JSON-RPC request', async () => {
    /*
    Test Doc:
    - Why: MCP server must handle JSON-RPC initialize request for AI agent handshake; broken init blocks all MCP usage
    - Contract: Valid JSON-RPC initialize request returns response with jsonrpc='2.0', matching id, and result object
    - Usage Notes: Write request to stdin with trailing newline; read response from stdout; 5s timeout
    - Quality Contribution: Catches broken JSON-RPC handling; ensures MCP server can complete agent handshake
    - Worked Example: stdin '{"jsonrpc":"2.0","id":1,"method":"initialize",...}' -> stdout contains {jsonrpc:'2.0',id:1,result:{...}}
    */
    proc = spawn('node', ['dist/cli.js', 'mcp', '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const request = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    });

    proc.stdin?.write(request + '\n');

    const response = await new Promise<string>((resolve) => {
      proc!.stdout?.once('data', (data) => resolve(data.toString()));
      setTimeout(() => resolve(''), 5000);
    });

    const parsed = JSON.parse(response);
    expect(parsed.jsonrpc).toBe('2.0');
    expect(parsed.id).toBe(1);
    expect(parsed.result).toBeDefined();
  });
});
```

### Non-Happy-Path Coverage
- [ ] Invalid JSON-RPC request
- [ ] Unknown method
- [ ] Server handles shutdown gracefully

### Acceptance Criteria
- [ ] `cg mcp --help` shows available options
- [ ] `cg mcp --stdio` starts without stdout pollution
- [ ] Valid JSON-RPC requests get valid responses
- [ ] Errors go to stderr, not stdout

---

### Phase 6: Documentation & Polish

**Objective**: Create architecture documentation, update README, verify all commands work, and ensure all acceptance criteria from spec pass.

**Deliverables**:
- `docs/rules/architecture.md` with clean architecture patterns
- Updated `README.md` with getting started guide
- All 10 spec acceptance criteria verified
- Full quality check passing

**Dependencies**: All previous phases complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Documentation drift | Low | Low | Write docs from actual working code |

### Tasks (Documentation Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 6.1 | [ ] | Survey existing docs structure | 1 | Document what exists, plan new docs | - | |
| 6.2 | [ ] | Create docs/rules/architecture.md | 2 | Dependency direction, service/adapter patterns, DI usage | - | |
| 6.3 | [ ] | Update README.md | 2 | Prerequisites, installation, getting started, commands table | - | |
| 6.4 | [ ] | Verify AC-1: Monorepo Structure | 1 | `pnpm install` links all packages | - | |
| 6.5 | [ ] | Verify AC-2: Development Server | 1 | `just dev` starts localhost:3000 | - | |
| 6.6 | [ ] | Verify AC-3: Test Execution | 1 | `just test` passes | - | |
| 6.7 | [ ] | Verify AC-4: Linting and Formatting | 1 | `just lint`, `just format`, `just fft` work | - | |
| 6.8 | [ ] | Verify AC-5: CLI Availability | 1 | `npm link && cg --help` works | - | |
| 6.9 | [ ] | Verify AC-6: CLI Subcommands | 1 | `cg web` and `cg mcp` work | - | |
| 6.10 | [ ] | Verify AC-7: Clean Architecture | 1 | Import restrictions enforced | - | |
| 6.11 | [ ] | Verify AC-8: Dependency Injection | 1 | Services receive injected adapters | - | |
| 6.12 | [ ] | Verify AC-9: Type Check | 1 | `just typecheck` passes | - | |
| 6.13 | [ ] | Verify AC-10: Build Pipeline | 1 | `just build` creates dist/cli.js, cached builds <1s | - | |
| 6.14 | [ ] | Run full quality suite | 1 | `just check` passes | - | GATE |

### Documentation Content Outline

**docs/rules/architecture.md**:
1. Overview and Principles
2. Dependency Direction (Services ← Adapters)
3. Layer Rules Table
4. Interface-First Design
5. DI Container Usage
6. Testing with Fakes
7. Adding New Services (step-by-step)
8. Adding New Adapters (step-by-step)

**README.md**:
1. What is Chainglass
2. Prerequisites (Node 18+, pnpm, Just)
3. Quick Start (`just install && just dev`)
4. Common Commands Table
5. Link to docs/rules/architecture.md

### Acceptance Criteria
- [ ] docs/rules/architecture.md is complete and accurate
- [ ] README.md has quick-start that works
- [ ] All 10 spec acceptance criteria pass
- [ ] `just check` passes all quality gates
- [ ] No broken links in documentation

---

## Cross-Cutting Concerns

### Security Considerations

- **No secrets in code**: Environment variables for any sensitive config
- **Input validation**: CLI validates arguments before processing
- **Dependency audit**: `pnpm audit` in CI pipeline (future)

### Observability

- **Logging**: ILogger interface used throughout
- **Structured logs**: Pino JSON format in production
- **Log levels**: Configurable via LOG_LEVEL env var
- **Health check**: `/api/health` endpoint for monitoring

### Documentation

**Location**: Hybrid (README.md + docs/rules/)

**Structure**:
- `README.md`: Getting started, prerequisites, common commands
- `docs/rules/architecture.md`: Clean architecture patterns and rules

**Target Audience**:
- README: New developers, first 5 minutes
- docs/rules/: Feature implementers, pattern reference

**Maintenance**: Update when patterns change; README stable after setup

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| Monorepo bootstrap | 3 | Medium | S=1,I=1,D=0,N=1,F=0,T=0 | pnpm+Turborepo+TS coordination | Staged bootstrap, verification gates |
| DI container | 3 | Medium | S=1,I=1,D=0,N=1,F=0,T=0 | TSyringe in RSC, child containers | Decorator-free pattern |
| CLI bundling | 3 | Medium | S=1,I=1,D=0,N=0,F=1,T=0 | workspace:* resolution, bundle size | Two build modes, isolation test |
| Architecture enforcement | 2 | Small | S=1,I=0,D=0,N=1,F=0,T=0 | No native TS support | grep-based check, CI gate |

---

## Progress Tracking

### Phase Completion Checklist

- [x] Phase 1: Monorepo Foundation - COMPLETE
- [x] Phase 2: Shared Package - COMPLETE (12/12 tasks, 18 tests passing)
- [x] Phase 3: Next.js App with Clean Architecture - COMPLETE (12/12 tasks, 25 tests passing)
- [x] Phase 4: CLI Package - COMPLETE (16/16 tasks, 39 tests passing) [^20]
- [x] Phase 5: MCP Server Package - COMPLETE
- [ ] Phase 6: Documentation & Polish - NOT STARTED

### STOP Rule

**IMPORTANT**: This plan must be validated before creating detailed task dossiers.

After reviewing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Deviation Ledger

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| (none) | - | - | - |

No constitution or architecture deviations required for this greenfield project setup.

---

## ADR Ledger

| ADR | Title | Status | Date | Affects Phases |
|-----|-------|--------|------|----------------|
| 0001 | [MCP Tool Design Patterns](../../adr/adr-0001-mcp-tool-design-patterns.md) | Accepted | 2026-01-19 | 5 |

### ADR Seeds (from spec)

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-001: Monorepo Structure | SEED (in spec) | 1, 2, 3, 4, 5 | pnpm + Turborepo selected |
| ADR-002: Dependency Injection | SEED (in spec) | 2, 3, 4, 5 | TSyringe selected |
| ADR-003: Test Strategy | SEED (in spec) | All | Vitest + fakes over mocks |

Note: ADR seeds defined in spec. Consider running `/plan-3a-adr` to formalize before implementation.

---

## Change Footnotes Ledger

**NOTE**: This section will be populated during implementation by plan-6a-update-progress.

**Footnote Numbering Authority**: plan-6a-update-progress is the single source of truth for footnote numbering.

[^1]: Phase 1 - Root configuration files
  - `file:/Users/jordanknight/substrate/chainglass/package.json`
  - `file:/Users/jordanknight/substrate/chainglass/pnpm-workspace.yaml`
  - `file:/Users/jordanknight/substrate/chainglass/tsconfig.json`
  - `file:/Users/jordanknight/substrate/chainglass/biome.json`
  - `file:/Users/jordanknight/substrate/chainglass/turbo.json`
  - `file:/Users/jordanknight/substrate/chainglass/justfile`

[^2]: Phase 1 - Package configurations
  - `file:/Users/jordanknight/substrate/chainglass/packages/shared/package.json`
  - `file:/Users/jordanknight/substrate/chainglass/packages/shared/tsconfig.json`
  - `file:/Users/jordanknight/substrate/chainglass/packages/shared/src/index.ts`
  - `file:/Users/jordanknight/substrate/chainglass/packages/cli/package.json`
  - `file:/Users/jordanknight/substrate/chainglass/packages/cli/tsconfig.json`
  - `file:/Users/jordanknight/substrate/chainglass/packages/cli/src/index.ts`
  - `file:/Users/jordanknight/substrate/chainglass/packages/mcp-server/package.json`
  - `file:/Users/jordanknight/substrate/chainglass/packages/mcp-server/tsconfig.json`
  - `file:/Users/jordanknight/substrate/chainglass/packages/mcp-server/src/index.ts`

[^3]: Phase 1 - Web app and test configurations
  - `file:/Users/jordanknight/substrate/chainglass/apps/web/package.json`
  - `file:/Users/jordanknight/substrate/chainglass/apps/web/tsconfig.json`
  - `file:/Users/jordanknight/substrate/chainglass/apps/web/next.config.ts`
  - `file:/Users/jordanknight/substrate/chainglass/apps/web/app/page.tsx`
  - `file:/Users/jordanknight/substrate/chainglass/apps/web/app/layout.tsx`
  - `file:/Users/jordanknight/substrate/chainglass/test/vitest.config.ts`
  - `file:/Users/jordanknight/substrate/chainglass/test/setup.ts`
  - `file:/Users/jordanknight/substrate/chainglass/test/unit/placeholder.test.ts`

[^4]: Phase 1 Task 1.4 - Initial pnpm install completed successfully

[^5]: Phase 1 Task 1.5 - Base tsconfig.json created with strict mode and path aliases

[^6]: Phase 1 Task 1.6 - Package-level tsconfigs created extending root with composite: true

[^7]: Phase 1 Task 1.7 - biome.json created with linter and formatter configured

[^8]: Phase 1 Task 1.8 - turbo.json created with build pipeline and caching

[^9]: Phase 1 Task 1.9 - justfile created with all development commands

[^10]: Phase 1 Task 1.10 - test/vitest.config.ts created with tsconfigPaths plugin

[^11]: Phase 1 Task 1.11 - test/setup.ts and placeholder test created

[^12]: Phase 1 Task 1.12 - Phase 1 gate verification passed

[^13]: Phase 2 Task T001-T002 - Directory structure and ILogger interface
  - `file:/Users/jordanknight/substrate/chainglass/packages/shared/src/interfaces/`
  - `file:/Users/jordanknight/substrate/chainglass/packages/shared/src/adapters/`
  - `file:/Users/jordanknight/substrate/chainglass/packages/shared/src/fakes/`
  - `file:/Users/jordanknight/substrate/chainglass/packages/shared/src/types/`
  - `file:/Users/jordanknight/substrate/chainglass/packages/shared/src/interfaces/logger.interface.ts`
  - `file:/Users/jordanknight/substrate/chainglass/packages/shared/src/interfaces/index.ts`

[^14]: Phase 2 Task T003-T004 - FakeLogger implementation and tests
  - `class:/Users/jordanknight/substrate/chainglass/packages/shared/src/fakes/fake-logger.ts:FakeLogger`
  - `file:/Users/jordanknight/substrate/chainglass/packages/shared/src/fakes/index.ts`
  - `file:/Users/jordanknight/substrate/chainglass/test/unit/shared/fake-logger.test.ts`

[^15]: Phase 2 Task T005-T006 - TDD RED-GREEN cycle, exports fixed
  - `file:/Users/jordanknight/substrate/chainglass/packages/shared/src/index.ts`

[^16]: Phase 2 Task T007 - Contract tests for ILogger implementations
  - `file:/Users/jordanknight/substrate/chainglass/test/contracts/logger.contract.ts`
  - `file:/Users/jordanknight/substrate/chainglass/test/contracts/logger.contract.test.ts`

[^17]: Phase 2 Task T008-T009 - PinoLoggerAdapter implementation and contract verification
  - `class:/Users/jordanknight/substrate/chainglass/packages/shared/src/adapters/pino-logger.adapter.ts:PinoLoggerAdapter`
  - `file:/Users/jordanknight/substrate/chainglass/packages/shared/src/adapters/index.ts`

[^18]: Phase 2 Task T010-T012 - Exports, build, and gate verification
  - Fixed type exports for isolatedModules compliance
  - Deleted placeholder.test.ts (no longer needed)
  - Gate verification: just build, just fft, just typecheck all pass

[^19]: Phase 3 Tasks T001-T011 + T002a - Next.js App with Clean Architecture
  - `file:/Users/jordanknight/substrate/chainglass/apps/web/src/lib/di-container.ts` - DI container with child container pattern
  - `file:/Users/jordanknight/substrate/chainglass/apps/web/src/services/sample.service.ts` - Reference implementation
  - `file:/Users/jordanknight/substrate/chainglass/apps/web/src/services/index.ts` - Service exports
  - `file:/Users/jordanknight/substrate/chainglass/apps/web/src/adapters/index.ts` - Adapter exports
  - `file:/Users/jordanknight/substrate/chainglass/apps/web/src/lib/index.ts` - Lib exports
  - `file:/Users/jordanknight/substrate/chainglass/apps/web/app/api/health/route.ts` - Health check API
  - `file:/Users/jordanknight/substrate/chainglass/apps/web/tsconfig.json` - Fixed path mappings
  - `file:/Users/jordanknight/substrate/chainglass/test/base/web-test.ts` - Vitest fixtures
  - `file:/Users/jordanknight/substrate/chainglass/test/unit/web/di-container.test.ts` - DI tests (4 tests)
  - `file:/Users/jordanknight/substrate/chainglass/test/unit/web/sample-service.test.ts` - Service tests (3 tests)
  - Discoveries: useFactory pattern required, static imports for ESM, tsconfig dist paths
  - Gate verification: 25 tests passing, just build/test/fft all pass

[^20]: Phase 4 Tasks T001-T016 - CLI Package (cg command)
  - `file:/Users/jordanknight/substrate/chainglass/packages/cli/src/bin/cg.ts` - CLI entry point with Commander.js
  - `function:/Users/jordanknight/substrate/chainglass/packages/cli/src/bin/cg.ts:createProgram` - Factory with testMode option
  - `file:/Users/jordanknight/substrate/chainglass/packages/cli/src/commands/web.command.ts` - Web command (starts standalone server)
  - `function:/Users/jordanknight/substrate/chainglass/packages/cli/src/commands/web.command.ts:findStandaloneAssets` - Asset discovery
  - `function:/Users/jordanknight/substrate/chainglass/packages/cli/src/commands/web.command.ts:validateStandaloneAssets` - Asset validation
  - `function:/Users/jordanknight/substrate/chainglass/packages/cli/src/commands/web.command.ts:runWebCommand` - Server startup
  - `file:/Users/jordanknight/substrate/chainglass/packages/cli/src/commands/mcp.command.ts` - MCP command stub (Phase 5)
  - `file:/Users/jordanknight/substrate/chainglass/packages/cli/esbuild.config.ts` - Bundle configuration (CJS format)
  - `file:/Users/jordanknight/substrate/chainglass/apps/web/next.config.ts` - Standalone output configuration
  - `file:/Users/jordanknight/substrate/chainglass/test/unit/cli/cli-parser.test.ts` - Parser tests (9 tests)
  - `file:/Users/jordanknight/substrate/chainglass/test/unit/cli/web-command.test.ts` - Web command tests (5 tests)
  - Discoveries: Commander.js exitOverride() for tests, CJS format for esbuild, isMain needs /cg paths
  - Known limitation: T013 pnpm symlink issue prevents full isolation test
  - Gate verification: 39 tests passing (14 CLI + 25 prior), npx + npm link both work

[^21]: Phase 5 - MCP Server Package implementation
  - `file:packages/mcp-server/src/server.ts` - Main MCP server with check_health tool
  - `file:packages/mcp-server/src/lib/di-container.ts` - DI container for MCP server
  - `file:packages/mcp-server/src/lib/index.ts` - Lib exports
  - `file:packages/mcp-server/src/tools/index.ts` - Tools exports
  - `file:packages/mcp-server/src/index.ts` - Package exports
  - `file:packages/cli/src/commands/mcp.command.ts` - CLI mcp command with lazy loading
  - `file:packages/shared/src/adapters/pino-logger.adapter.ts` - Added createForStderr() factory
  - `file:test/unit/mcp-server/server.test.ts` - Server initialization tests (6 tests)
  - `file:test/unit/mcp-server/stdio-transport.test.ts` - Stdio cleanliness tests (4 tests)
  - `file:test/unit/mcp-server/check-health.test.ts` - ADR-0001 compliance tests (6 tests)
  - `file:test/integration/mcp-stdio.test.ts` - MCP command integration tests (5 tests)

---

**Plan Created**: 2026-01-18
**Plan Location**: `docs/plans/001-project-setup/project-setup-plan.md`
**Next Step**: Run `/plan-5-phase-tasks-and-brief --phase 4` to generate Phase 4 dossier
