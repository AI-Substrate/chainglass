# Chainglass Rules

**Version**: 1.0.0
**Last Updated**: 2026-01-21
**Constitution Reference**: [constitution.md](./constitution.md)

This document contains enforceable MUST/SHOULD statements derived from the [Constitution](./constitution.md).

---

## 1. Source Control & Branching

### R-SCM-001: Git as Source of Truth
- **MUST** use git for all source code and configuration
- **MUST** preserve git history during file moves (use `git mv`)
- **SHOULD** use conventional commit messages

### R-SCM-002: Branch Strategy
- **MUST** branch from `main` for feature work
- **MUST** pass all quality gates before merging to `main`
- **SHOULD** use descriptive branch names

---

## 2. Coding Standards

### R-CODE-001: TypeScript Strict Mode
- **MUST** enable `strict: true` in tsconfig.json
- **MUST NOT** use `any` type in production code
- **MUST** use explicit return types for public APIs

### R-CODE-002: Naming Conventions
- **MUST** use PascalCase for classes and interfaces (e.g., `ILogger`, `FakeLogger`)
- **MUST** use camelCase for functions and variables
- **MUST** prefix interfaces with `I` (e.g., `ILogger`, `IWorkflowRepository`)
- **MUST** suffix adapters with `Adapter` (e.g., `PinoLoggerAdapter`)
- **MUST** prefix fakes with `Fake` (e.g., `FakeLogger`)

### R-CODE-003: File Naming
- **MUST** use kebab-case for file names (e.g., `fake-logger.ts`)
- **MUST** use `.interface.ts` suffix for interface files
- **MUST** use `.adapter.ts` suffix for adapter files
- **MUST** use `.test.ts` suffix for test files

### R-CODE-004: Import Organization
- **MUST** use path aliases (`@chainglass/shared`) not relative paths between packages
- **MUST** use `export type` for interface re-exports (isolatedModules compliance)
- **SHOULD** organize imports: external → internal → types

### R-CODE-005: Formatting
- **MUST** use Biome for formatting
- **MUST** use 2-space indentation
- **MUST** use single quotes for strings
- **MUST** include trailing commas (ES5 style)
- **MUST** limit line width to 100 characters

---

## 3. Architecture Rules

### R-ARCH-001: Dependency Direction
- **MUST** have services depend on interfaces, not concrete adapters
- **MUST NOT** have adapters import from services
- **MUST NOT** have fakes import from adapters or services

| Layer | Can Import From | Cannot Import From |
|-------|-----------------|-------------------|
| Services | Interfaces (`@chainglass/shared`) | Adapters, external libs directly |
| Adapters | Interfaces, external libs | Services |
| Fakes | Interfaces | Services, Adapters, external libs |

### R-ARCH-002: Interface-First Design
- **MUST** create interface before any implementation
- **MUST** create fake before real adapter
- **MUST** place interfaces in `@chainglass/shared/interfaces/`
- **MUST** place fakes in `@chainglass/shared/fakes/`
- **MUST** place shared adapters in `@chainglass/shared/adapters/`

### R-ARCH-003: Dependency Injection
- **MUST** use `useFactory` pattern for DI registration
- **MUST NOT** use `@injectable()` or `@inject()` decorators (RSC incompatible)
- **MUST** use child containers for test isolation
- **MUST** create fresh container per test (no singleton pollution)

### R-ARCH-004: Package Boundaries
- **MUST** place shared code in `@chainglass/shared`
- **MUST** place app-specific code in `apps/[app-name]/`
- **SHOULD** default to shared unless clearly app-specific

---

## 4. Testing Rules

### R-TEST-001: Testing Philosophy
- **MUST** practice Test-Driven Development (RED-GREEN-REFACTOR)
- **MUST** write tests as documentation (explain WHY, not just WHAT)
- **MUST** apply "tests must pay rent" principle - keep only valuable tests
- **SHOULD** use test-first when it adds design value

### R-TEST-002: Test Quality Standards
- **MUST** include Test Doc comment with 5 required fields:
  - **Why**: Business/regression reason for test existence
  - **Contract**: Plain-English invariants being asserted
  - **Usage Notes**: How to call the API, gotchas to avoid
  - **Quality Contribution**: What failures this test catches
  - **Worked Example**: Concrete inputs/outputs
- **MUST** use clear naming (Given-When-Then or "should" format)
- **MUST** have each test assert one behavior

### R-TEST-003: Test Doc Format

```typescript
it('should log processing messages', async () => {
  /*
  Test Doc:
  - Why: Verify observability for debugging production issues
  - Contract: doSomething() logs at INFO level with input and result
  - Usage Notes: Use FakeLogger.assertLoggedAtLevel() for assertions
  - Quality Contribution: Catches missing log statements that hurt debugging
  - Worked Example: doSomething('test') → logs "Processing input" and "Processing complete"
  */
  // Arrange-Act-Assert with clear phases
});
```

### R-TEST-004: Scratch → Promote Workflow
- **MAY** write probe tests in `test/scratch/` for fast exploration
- **MUST** exclude `test/scratch/` from CI
- **MUST** promote tests only if they add durable value
- **MUST** add complete Test Doc when promoting from scratch
- **SHOULD** use promotion heuristic: Critical path, Opaque behavior, Regression-prone, Edge case

### R-TEST-005: Test Reliability
- **MUST NOT** use network calls in unit tests (use fixtures/fakes)
- **MUST NOT** use sleep/timers (use time mocking if needed)
- **MUST** ensure tests are deterministic (no flaky tests)
- **SHOULD** keep tests fast (< 100ms per unit test)

### R-TEST-006: Test Organization
- **MUST** place unit tests in `test/unit/[package]/`
- **MUST** place contract tests in `test/contracts/`
- **MUST** place integration tests in `test/integration/`
- **MUST** place test fixtures in `test/fixtures/`
- **MUST NOT** colocate tests with source (centralized test suite)

### R-TEST-007: Mock Usage Policy (Fakes Only)
- **MUST NOT** use `vi.mock()`, `jest.mock()`, `vi.fn()`, `vi.spyOn()`
- **MUST NOT** use Sinon stubs/spies
- **MUST** use full fake implementations that implement interfaces
- **MUST** provide test helper methods on fakes for assertions
- **MUST** document WHY a dependency uses a fake (in Test Doc)

### R-TEST-008: Contract Tests
- **MUST** create contract test suite for each interface
- **MUST** run contract tests against both fake AND real adapter
- **MUST** use parameterized test factory pattern

```typescript
export function loggerContractTests(name: string, createLogger: () => ILogger) {
  describe(`${name} implements ILogger contract`, () => {
    // Shared tests that both fake and real must pass
  });
}

loggerContractTests('FakeLogger', () => new FakeLogger());
loggerContractTests('PinoLoggerAdapter', () => new PinoLoggerAdapter());
```

---

## 5. MCP Tool Rules

### R-MCP-001: Tool Naming
- **MUST** use `verb_object` format in snake_case (e.g., `check_health`, `list_workflows`)
- **MUST** use standard action verbs: get, list, search, create, update, delete, check, validate, analyze

### R-MCP-002: Tool Description
- **MUST** include 3-4 sentence description covering:
  - What the tool does (action)
  - Context and scope (when to use)
  - Return values (what agent receives)
  - Alternatives (related tools)

### R-MCP-003: Parameter Design
- **MUST** use JSON Schema with explicit constraints
- **MUST** use `enum` for fixed options (not natural language)
- **MUST** use `minimum`/`maximum` for numeric bounds
- **MUST** provide sensible defaults

### R-MCP-004: Response Design
- **MUST** include `summary` field for agent reasoning
- **MUST** use semantic fields (names) over technical IDs
- **SHOULD** use metadata envelope for paginated results

### R-MCP-005: STDIO Protocol
- **MUST** redirect console to stderr BEFORE any imports
- **MUST** reserve stdout exclusively for JSON-RPC
- **MUST** use lazy-loading (dynamic import) after console redirection

### R-MCP-006: Tool Annotations
- **MUST** include all four MCP annotations:
  - `readOnlyHint`: Does it modify state?
  - `destructiveHint`: Can it cause data loss?
  - `idempotentHint`: Same result on repeat calls?
  - `openWorldHint`: Does it access external resources?

---

## 6. Complexity Scoring (No Time Estimates)

### R-EST-001: No Time Language
- **MUST NOT** use time estimates (hours, days, "quick", "soon")
- **MUST** use Complexity Score (CS 1-5) for effort quantification

### R-EST-002: Complexity Scoring

| CS | Label | Points | Description |
|----|-------|--------|-------------|
| CS-1 | Trivial | 0-2 | Isolated tweak, one file, unit test touchups |
| CS-2 | Small | 3-4 | Few files, familiar code, one integration |
| CS-3 | Medium | 5-7 | Multiple modules, small migration, integration tests |
| CS-4 | Large | 8-9 | Cross-component, new dependency, rollout plan |
| CS-5 | Epic | 10-12 | Architectural change, high uncertainty, phased rollout |

### R-EST-003: Scoring Factors (0-2 points each)
- **S** (Surface Area): Files/modules touched
- **I** (Integration Breadth): External libs/services/APIs
- **D** (Data & State): Schema changes, migrations, concurrency
- **N** (Novelty & Ambiguity): Requirements clarity, research needed
- **F** (Non-Functional): Performance, security, compliance
- **T** (Testing & Rollout): Test depth, flags, staged rollout

### R-EST-004: High Complexity Requirements
- **MUST** include staged rollout for CS ≥ 4
- **SHOULD** include feature flags for CS ≥ 4
- **MUST** document rollback plan for CS ≥ 4

---

## 7. Tooling & Automation

### R-TOOL-001: Required Tools
- **MUST** use pnpm as package manager
- **MUST** use Turborepo for build orchestration
- **MUST** use Vitest for testing
- **MUST** use Biome for linting/formatting
- **MUST** use Just for task running

### R-TOOL-002: Quality Commands
- **MUST** pass `just test` before merge
- **MUST** pass `just typecheck` before merge
- **MUST** pass `just lint` before merge
- **MUST** pass `just build` before merge

### R-TOOL-003: Development Commands
- **SHOULD** use `just fft` for quick pre-commit check (fix, format, test)
- **SHOULD** use `just check` for full quality suite
- **SHOULD** use `just dev` for development server

---

<!-- USER CONTENT START -->
<!-- Add project-specific rules below this line -->
<!-- USER CONTENT END -->

---

*Rules Version 1.0.0 - Derived from Constitution 1.0.0*
