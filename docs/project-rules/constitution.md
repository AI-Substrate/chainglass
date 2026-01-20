# Chainglass Project Constitution

<!--
Sync Impact Report:
- Mode: CREATE
- Version: 1.0.0
- Creation Date: 2026-01-21
- Source Documents:
  * Project Setup Plan (6 phases, 76+ tasks)
  * ADR-0001: MCP Tool Design Patterns
  * Architecture Rules (docs/rules/architecture.md)
  * 66 tests across all packages
- Placeholder Status: ALL RESOLVED
- Outstanding TODOs: None
-->

**Version**: 1.0.0
**Ratification Date**: 2026-01-21
**Last Amended**: 2026-01-21

---

## 1. Project Overview

Chainglass is a **workflow system for AI agents** - similar to Argo Workflows but designed for agent orchestration. It is:

- **Filesystem-based**: All workflow state lives in files and directories, tracked by git
- **Multi-interface**: CLI for automation, MCP server for AI agents, web GUI for humans
- **Phase-driven**: Workflows have phases with typed inputs/outputs (files and structured data)
- **Extensible**: Users can dynamically add phases and choose from multiple workflow templates

"Agents" in this context are external tools like Claude Code, GitHub CLI, or other automation tools that execute phase work.

---

## 2. Guiding Principles

### Principle 1: Clean Architecture with Strict Dependency Direction

**MUST**: Dependencies flow inward - Services depend on Interfaces, Adapters implement Interfaces.

```
┌─────────────────────────────────────────────────────────────┐
│                       ADAPTERS                               │
│  (PinoLoggerAdapter, ConsoleLoggerAdapter, etc.)            │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    SERVICES                            │  │
│  │  (SampleService, WorkflowService, etc.)               │  │
│  │                                                        │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │              INTERFACES                          │  │  │
│  │  │  (ILogger, IWorkflowRepository, etc.)           │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │                                                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Rationale**: Enables testability, swappable implementations, and long-term maintainability.

### Principle 2: Interface-First Development

**MUST**: Define interfaces BEFORE any implementation. The development sequence is:
1. Write interface (method signatures, contracts)
2. Write fake (test double with assertion helpers)
3. Write tests using the fake
4. Write real adapter (implements same interface)
5. Contract tests verify fake-real parity

**Rationale**: Drives design from consumer needs, ensures testability from the start.

### Principle 3: Test-Driven Development (TDD)

**MUST**: Follow RED-GREEN-REFACTOR cycle for all implementation work:
- **RED**: Write test first, verify it fails
- **GREEN**: Implement minimal code to pass test
- **REFACTOR**: Improve code quality while keeping tests green

**Rationale**: Ensures comprehensive coverage, documents expected behavior, prevents regressions.

### Principle 4: Fakes Over Mocks

**MUST**: Use full fake implementations instead of mocking libraries.
- NO `vi.mock()`, `jest.mock()`, `vi.spyOn()`, Sinon stubs
- YES `FakeLogger`, `FakeWorkflowRepository` with test helper methods

**Rationale**: Behavior-focused testing, stable during refactoring, drives interface design.

### Principle 5: Fast Feedback Loops

**SHOULD**: Maintain sub-second feedback for common operations:
- Tests: < 2 seconds (Vitest)
- Linting: < 1 second (Biome)
- Cached builds: < 1 second (Turborepo)

**Rationale**: Developer productivity requires immediate feedback.

### Principle 6: Developer Experience First

**MUST**: New developers can be productive with minimal setup:
```bash
git clone <repo> && just install && just dev
```

Prerequisites: Node.js 18+, pnpm, Just task runner.

**Rationale**: Reduces onboarding friction and "works on my machine" problems.

### Principle 7: Shared by Default

**SHOULD**: Code belongs in `@chainglass/shared` unless it is app-specific.
- Interfaces, fakes, adapters → `packages/shared/`
- App-specific adapters (rare) → `apps/web/`, `apps/cli/`

**Rationale**: Maximizes reuse across CLI, web, and MCP server.

---

## 3. Quality & Verification Strategy

### 3.1 Testing Approach

**Primary Strategy**: Full TDD with fakes over mocks.

| Test Type | Purpose | Location |
|-----------|---------|----------|
| Unit Tests | Isolated component behavior | `test/unit/` |
| Contract Tests | Fake-real parity verification | `test/contracts/` |
| Integration Tests | Cross-component behavior | `test/integration/` |

### 3.2 Test Documentation Format (Test Doc)

**MUST**: Every test includes a 5-field Test Doc comment:

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
  // test implementation
});
```

### 3.3 Contract Tests for Interface Compliance

**MUST**: All interface implementations (fakes AND adapters) pass shared contract tests:

```typescript
export function loggerContractTests(name: string, createLogger: () => ILogger) {
  describe(`${name} implements ILogger contract`, () => {
    it('should not throw when logging at any level', () => {
      const logger = createLogger();
      expect(() => logger.info('test')).not.toThrow();
    });
  });
}

// Run for BOTH implementations
loggerContractTests('FakeLogger', () => new FakeLogger());
loggerContractTests('PinoLoggerAdapter', () => new PinoLoggerAdapter());
```

### 3.4 Quality Gates

**MUST PASS** before merge:
- `just test` - All tests pass
- `just typecheck` - TypeScript strict mode, zero errors
- `just lint` - Biome linter passes
- `just build` - All packages build successfully

**Quick Check**: `just fft` (fix, format, test) or `just check` (full suite)

### 3.5 Tooling Stack

| Tool | Purpose | Selection Rationale |
|------|---------|---------------------|
| pnpm | Package manager | 50-70% disk savings, strict resolution |
| Turborepo | Build orchestration | Dependency-aware caching, parallelism |
| Vitest | Test runner | 10x faster than Jest, native TS |
| Biome | Linter/formatter | 20x faster than ESLint+Prettier |
| Just | Task runner | 18x faster than npm scripts |
| TSyringe | DI container | Lightweight, factory-based registration |

---

## 4. Delivery Practices

### 4.1 Phase-Based Delivery

Work is organized into phases with explicit gates:

| Phase | Gate Criteria |
|-------|---------------|
| Foundation | `pnpm install && just typecheck && just lint` |
| Package | `pnpm -F @chainglass/[pkg] build && test` |
| Feature | Tests pass, acceptance criteria verified |
| Documentation | All docs updated, links validated |

### 4.2 No Time Estimates

**MUST NOT** provide time estimates. Use Complexity Scores instead:

| CS | Label | Description |
|----|-------|-------------|
| CS-1 | Trivial | Isolated tweak, one file, unit test touchups |
| CS-2 | Small | Few files, familiar code, one internal integration |
| CS-3 | Medium | Multiple modules, small migration, integration tests |
| CS-4 | Large | Cross-component, new dependency, rollout plan needed |
| CS-5 | Epic | Architectural change, high uncertainty, phased rollout |

**Scoring Factors** (0-2 points each):
- Surface Area (S): Files/modules touched
- Integration Breadth (I): External libs/services
- Data & State (D): Schema changes, migrations
- Novelty & Ambiguity (N): Requirements clarity
- Non-Functional Constraints (F): Performance, security
- Testing & Rollout (T): Test depth, feature flags

### 4.3 Definition of Done

A task is complete when:
- [ ] All acceptance criteria verified
- [ ] Tests pass (`just test`)
- [ ] Type check passes (`just typecheck`)
- [ ] Lint passes (`just lint`)
- [ ] Build succeeds (`just build`)
- [ ] Documentation updated (if applicable)
- [ ] Plan/dossier status synchronized

---

## 5. Governance

### 5.1 Amendment Procedure

1. Propose changes via PR to constitution documents
2. Document rationale in PR description
3. Require team review before merge
4. Update version number:
   - MAJOR: Breaking changes to principles
   - MINOR: New principles or expanded guidance
   - PATCH: Clarifications or formatting

### 5.2 Review Cadence

- **Per PR**: Architecture patterns, test quality, dependency direction
- **Per Phase**: Delivery practices, quality gates
- **Quarterly**: Constitution review for relevance

### 5.3 Compliance Tracking

Architecture rules are enforced via **code review** (not automated tooling, due to false positive risks).

**Reviewer Checklist**:
- [ ] Services import only from interfaces
- [ ] No direct adapter imports in service files
- [ ] New interfaces have corresponding fakes
- [ ] Contract tests exist for new fakes
- [ ] DI registrations use `useFactory` pattern
- [ ] Test Doc format used in new tests
- [ ] No mocking library usage

### 5.4 Critical Discoveries Registry

Architectural discoveries from implementation are documented and enforced:

| Discovery | Impact | Enforcement |
|-----------|--------|-------------|
| Bootstrap sequence | pnpm-workspace.yaml before packages | Phase 1 gate |
| Decorator-free DI | No @injectable in RSC | Code review |
| Child container isolation | Fresh container per test | Code review |
| Vitest path alignment | pnpm + TS + Vitest paths match | Build validation |
| MCP stdout discipline | JSON-RPC only on stdout | Integration tests |

---

## 6. Reference Implementations

### 6.1 Exemplar: SampleService

**Location**: `apps/web/src/services/sample.service.ts`

Demonstrates: Constructor injection, interface-only imports, structured logging.

### 6.2 Exemplar: FakeLogger

**Location**: `packages/shared/src/fakes/fake-logger.ts`

Demonstrates: Full interface implementation, test helper methods, child logger pattern.

### 6.3 Exemplar: check_health Tool

**Location**: `packages/mcp-server/src/server.ts`

Demonstrates: ADR-0001 MCP tool design patterns, verb_object naming, semantic responses.

### 6.4 Exemplar: DI Container

**Location**: `apps/web/src/lib/di-container.ts`

Demonstrates: Factory-based registration, child containers, production vs test containers.

---

## 7. Anti-Patterns

**Banned Practices**:
- `@injectable()` / `@inject()` decorators (RSC incompatible)
- `useClass` DI registration (use `useFactory`)
- `vi.mock()`, `jest.mock()`, `vi.spyOn()` (use fakes)
- Global DI container in tests (use child containers)
- Services importing from `*.adapter.ts` files
- stdout output in MCP stdio mode before JSON-RPC

**Code Review Flags**:
- Service imports concrete adapter
- Test mocks function instead of using fake
- Test missing any Test Doc field
- Path alias not in all three configs (pnpm, TS, Vitest)
- Child container not created per test

---

<!-- USER CONTENT START -->
<!-- Add project-specific amendments below this line -->
<!-- USER CONTENT END -->

---

*Constitution Version 1.0.0 - Ratified 2026-01-21*
