# Chainglass Project Setup

**Mode**: Full

📚 This specification incorporates findings from `research-dossier.md`

---

## Research Context

Extensive research was conducted via Perplexity Deep Research covering 9 topics. Key findings:

- **Components affected**: Greenfield project - all components to be created
- **Critical dependencies**: pnpm, Turborepo, Next.js 15, TypeScript 5, Commander.js, TSyringe, Vitest, Biome, Just
- **Modification risks**: None (greenfield) - but architectural decisions here will constrain all future development
- **Link**: See `research-dossier.md` for full analysis (9 findings, 1300+ lines)

---

## Summary

**WHAT**: Establish the foundational project structure, tooling, and architectural patterns for Chainglass - a spec-driven development enrichment workflow tool.

**WHY**:
- Enable clean architecture with strict dependency direction (Services ← Adapters) to maintain long-term maintainability
- Provide a CLI (`cg`) and MCP server for AI-assisted development workflows
- Establish test-driven development patterns using fakes over mocks for behavior-focused testing
- Create a monorepo structure that supports independent package development while maintaining cohesion
- Enable rapid iteration through fast tooling (Vitest 10x faster, Biome 20x faster, Just 18x faster than alternatives)

---

## Goals

1. **Developer Experience**: Developers can clone the repo and be productive quickly using `just install && just dev` (after installing prerequisites)
2. **Clean Architecture Enforcement**: The codebase structure physically prevents concept leakage (adapters cannot import from services)
3. **TDD-First Workflow**: Every service has a corresponding fake adapter, enabling isolated unit testing without mocks
4. **CLI Distribution**: Users can run `npx cg` or `npx chainglass` to access CLI functionality without global installation
5. **MCP Integration**: An MCP server is accessible via `cg mcp` for AI agent integration
6. **Fast Feedback Loops**: Tests run in <2 seconds, linting in <1 second, formatting in <1 second
7. **Type Safety**: Full TypeScript coverage with strict mode, zero `any` types in production code
8. **Documentation**: Architecture rules are codified in `docs/rules/architecture.md` as a living reference

---

## Non-Goals

1. **Feature Development**: This setup phase does not implement any business features - only scaffolding and patterns
2. **Production Deployment**: No CI/CD pipelines, Docker configurations, or cloud deployment in this phase
3. **Database Integration**: No database adapters or migrations - these will be added as features require them
4. **Authentication/Authorization**: No auth system - this is a developer tool, not a user-facing application
5. **UI Components**: No React component library or design system - only minimal Next.js pages for verification
6. **npm Publishing**: While the structure supports publishing, actual npm publish is out of scope
7. **MCP Protocol Implementation**: Only basic MCP server structure - full protocol implementation is a separate feature
8. **Performance Optimization**: No premature optimization - focus on correctness and maintainability first

---

## Complexity

**Score**: CS-3 (Medium)

**Breakdown**:
| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Surface Area (S) | 2 | Cross-cutting: 4 packages (cli, shared, mcp-server, web), multiple config files, docs |
| Integration (I) | 1 | One external system (npm registry for npx), otherwise internal |
| Data/State (D) | 0 | No database, no migrations, no persistent state |
| Novelty (N) | 1 | Clean architecture is well-specified but monorepo + DI + TDD combo has some ambiguity |
| Non-Functional (F) | 1 | Moderate: fast startup for npx, sub-second test feedback |
| Testing/Rollout (T) | 1 | Integration tests needed for CLI, workspace linking, turbo caching |

**Total**: S(2) + I(1) + D(0) + N(1) + F(1) + T(1) = **6 → CS-3**

**Confidence**: 0.85

**Assumptions**:
- pnpm workspaces + Turborepo will integrate smoothly (validated by research)
- TSyringe decorators are truly optional for basic DI (research confirms)
- Commander.js v12+ has native TypeScript support (verified)
- Just is installed or easily installable on developer machines

**Dependencies**:
- Node.js 18+ (for native ESM support)
- pnpm (for workspace management)
- Just task runner (developer machine prerequisite)

**Risks**:
- **Tooling Compatibility**: Multiple new tools (Biome, Turborepo, TSyringe) may have unexpected interactions
- **Learning Curve**: Team must learn pnpm workspaces, Turborepo caching, and TSyringe patterns
- **npx Cold Start**: Bundled CLI size affects first-run experience

**Phases**:
1. Monorepo Foundation (pnpm, Turborepo, Just, Biome, base configs)
2. Shared Package (ILogger interface, FakeLogger, utility types)
3. Next.js App with Clean Architecture (services/, adapters/, DI container)
4. CLI Package (Commander.js, esbuild bundling, npx support)
5. MCP Server Package (basic structure, CLI integration)
6. Documentation & Polish (architecture.md, verification)

---

## Acceptance Criteria

### AC-1: Monorepo Structure
**Given** a fresh clone of the repository
**When** I run `pnpm install`
**Then** all workspace packages are linked and dependencies are installed
**And** `node_modules` at root contains symlinks to workspace packages

### AC-2: Development Server
**Given** dependencies are installed
**When** I run `just dev`
**Then** Next.js development server starts on `localhost:3000`
**And** the home page displays without errors

### AC-3: Test Execution
**Given** dependencies are installed
**When** I run `just test`
**Then** Vitest executes all tests across all packages
**And** all tests pass
**And** total execution time is under 5 seconds for the initial test suite

### AC-4: Linting and Formatting
**Given** source files exist
**When** I run `just lint`
**Then** Biome reports linting status for all TypeScript files
**When** I run `just format`
**Then** all files are formatted consistently
**When** I run `just fft`
**Then** fix, format, and test run in sequence

### AC-5: CLI Availability
**Given** the CLI package is built
**When** I run `npm link` from the root
**And** I run `cg --help`
**Then** I see the help output listing available commands (dev, mcp, version)

### AC-6: CLI Subcommands
**Given** the CLI is linked
**When** I run `cg dev`
**Then** the Next.js development server starts
**When** I run `cg mcp`
**Then** the MCP server starts (stdio transport by default)

### AC-7: Clean Architecture Enforcement
**Given** a service file in `apps/web/src/services/`
**When** I attempt to import from `apps/web/src/adapters/*.adapter.ts` (concrete implementation)
**Then** TypeScript compilation fails or linting warns
**But** importing from `*.interface.ts` (adapter interface) succeeds

### AC-8: Dependency Injection
**Given** a service that requires ILogger
**When** the service is instantiated via the DI container
**Then** it receives the registered adapter implementation
**And** in tests, it receives a FakeLogger instance

### AC-9: Type Check
**Given** all source files
**When** I run `just typecheck`
**Then** TypeScript reports no errors
**And** strict mode is enabled

### AC-10: Build Pipeline
**Given** all packages
**When** I run `just build`
**Then** Turborepo builds packages in dependency order
**And** `dist/cli.js` is created as a bundled executable
**And** subsequent builds with no changes complete in under 1 second (cached)

---

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Tooling incompatibility** between Biome/Turborepo/pnpm | Low | High | Research validated these tools work together; test early in Phase 1 |
| **TSyringe decorator overhead** in Next.js server components | Medium | Medium | Use decorator-optional patterns; avoid decorators in RSC |
| **npx cold start** too slow due to bundle size | Medium | Low | Use esbuild minification, lazy-load commands, measure during Phase 4 |
| **Just not installed** on developer machines | Medium | Low | Document installation in README; provide fallback npm scripts |
| **workspace:* protocol** confuses npm publish | Low | Medium | Test publish workflow locally before actual npm publish |

### Assumptions

1. **Node.js 18+** is available on all developer machines
2. **Developers can install Just** (or will use npm script fallbacks)
3. **pnpm is acceptable** as the package manager (not npm or yarn)
4. **Decorators are acceptable** in TypeScript (even if optional for TSyringe)
5. **Single repository** is preferred over multiple repositories
6. **Biome's rule set** is sufficient (no need for ESLint-specific plugins initially)

---

## Open Questions

1. **[DEFERRED: MCP Protocol Version]** - Use latest (2024-11-05); revisit when implementing full MCP features

2. ~~**[RESOLVED: Shared Package Scope]**~~ - See Clarifications Q7. `@chainglass/shared` contains interfaces, services, adapters, fakes, and types. It is the core package.

3. ~~**[RESOLVED: Web App Purpose]**~~ - See Clarifications Q6. Full engineering experience, end-user facing application.

4. **[DEFERRED: Logging in CLI vs Web]** - Use same ILogger abstraction everywhere; CLI can use a simpler ConsoleLoggerAdapter

5. **[DEFERRED: Test Coverage Threshold]** - No enforced threshold initially; establish baseline first, then decide on threshold

---

## ADR Seeds (Optional)

### ADR-001: Monorepo Structure

**Decision Drivers**:
- Need to share code between CLI, MCP server, and web app
- Want independent package versioning capability
- Require fast builds with intelligent caching
- Clean architecture demands clear package boundaries

**Candidate Alternatives**:
- A) **pnpm workspaces + Turborepo** - Recommended by research, best performance/disk usage
- B) npm workspaces alone - Simpler but no build caching
- C) Nx - More features but higher complexity
- D) Separate repositories - Maximum isolation but coordination overhead

**Stakeholders**: Core development team, future contributors

---

### ADR-002: Dependency Injection Approach

**Decision Drivers**:
- Clean architecture requires interface-based injection
- Testing requires easy fake substitution
- Next.js server components have specific constraints
- Bundle size impacts npx startup time

**Candidate Alternatives**:
- A) **TSyringe** - Lightweight, decorator-optional, Microsoft-backed
- B) Awilix - Zero decorators, explicit registration
- C) Manual DI - No library, pure constructor injection
- D) InversifyJS - Feature-rich but heavy

**Stakeholders**: Core development team

---

### ADR-003: Test Strategy

**Decision Drivers**:
- TDD requires fast feedback (<200ms for affected tests)
- Fakes over mocks requires interface-driven design
- Multi-package monorepo needs unified test runner
- Coverage reporting desired

**Candidate Alternatives**:
- A) **Vitest** - 10x faster, native TS, graph-based watch
- B) Jest - Industry standard, more ecosystem
- C) Bun test - Very fast but less mature
- D) Node test runner - Built-in but limited features

**Stakeholders**: Core development team

---

## External Research

**Incorporated**: None (no `external-research/*.md` files found)

**Key Findings**: All research conducted via Perplexity and documented in `research-dossier.md`

**Applied To**: All sections - the research dossier directly informed Goals, Complexity scoring, Acceptance Criteria, and Risks

---

## Testing Strategy

**Approach**: Full TDD

**Rationale**: Complex foundational architecture requires comprehensive test coverage. Red-green-refactor cycle ensures patterns are correct before building on them.

**Test Suite Organization**: Centralized at repository root
```
test/                          # CENTRAL test suite
├── setup.ts                   # Global Vitest setup
├── fixtures/                  # Shared test data/fixtures
├── base/                      # Base test classes, test utilities
├── unit/                      # Unit tests (organized by package)
│   ├── shared/                # Tests for @chainglass/shared
│   ├── cli/                   # Tests for @chainglass/cli
│   └── web/                   # Tests for apps/web
├── integration/               # Integration tests
└── e2e/                       # End-to-end tests (future)
```

**Focus Areas**:
- DI container registration and resolution
- Service-to-adapter wiring via interfaces
- Clean architecture boundary enforcement (import restrictions)
- CLI command parsing and execution
- Fake implementations match interface contracts

**Excluded**:
- Config file parsing (covered by integration tests)
- Next.js page rendering (minimal pages for verification only)

**Mock Usage**: Fakes only, avoid mocks
- All test doubles are full fake implementations (FakeLogger, FakeStorage)
- No `vi.mock()`, `jest.mock()`, or similar
- Fakes implement the same interface as real adapters
- Fakes provide test helper methods (e.g., `assertLoggedAtLevel()`)
- Fakes live in `@chainglass/shared/fakes/` (colocated with interfaces)
- Rationale: Behavior-focused testing, stable during refactoring, encourages interface-driven design

---

## Documentation Strategy

**Location**: Hybrid (README.md + docs/)

**Rationale**: Developers need quick-start in README, but clean architecture patterns require detailed documentation in docs/rules/.

**Content Split**:
- **README.md**: Installation, prerequisites (Node 18+, pnpm, Just), `just install && just dev`, common commands table, link to detailed docs
- **docs/rules/architecture.md**: Clean architecture layers, dependency direction rules, service/adapter patterns, DI container usage, testing with fakes

**Target Audience**:
- README: New developers onboarding
- docs/rules/: Developers implementing features, need pattern reference

**Maintenance**: Update docs when patterns change; README stays stable after initial setup

---

## Clarifications

### Session 2026-01-18

**Q1: Workflow Mode**
- **Answer**: Full
- **Rationale**: CS-3 complexity with 6 phases requires comprehensive gates and multi-phase planning

**Q2: Testing Approach**
- **Answer**: Full TDD
- **Rationale**: Foundational architecture must be thoroughly tested; patterns established here affect all future development

**Q3: Mock/Stub/Fake Policy**
- **Answer**: Fakes only, avoid mocks
- **Rationale**: Behavior-focused testing with real fake implementations. No vi.mock() or similar. Fakes are reusable and stable during refactoring.

**Q4: Documentation Location**
- **Answer**: Hybrid (README + docs/)
- **Rationale**: Quick-start needs differ from pattern reference needs

**Q5: Documentation Split**
- **Answer**: README has setup + commands; docs/ has patterns
- **Rationale**: Separation of concerns - onboarding vs reference

**Q6: Web App Purpose**
- **Answer**: Full engineering experience, end-user facing application
- **Rationale**: Not just a verification target - this will be the main product UI. Elevates importance of architecture decisions.
- **Impact**: Updated Non-Goals to clarify UI components will come later; architecture must support production use

**Q7: Shared Package Scope**
- **Answer**: Types + utilities + fakes + shared services + shared adapters
- **Key Principle**: Interfaces always live in `@chainglass/shared` even if only one package uses them initially. Keeps dependency direction clean.

**Q8: Test Suite Organization**
- **Answer**: Centralized test suite at repository root
- **Rationale**: Single location for all tests, shared fixtures, base test classes, and test infrastructure. No scattered test folders.
- **Structure**:
  ```
  test/                          # CENTRAL test suite (root level)
  ├── setup.ts                   # Global Vitest setup
  ├── fixtures/                  # Shared test data/fixtures
  ├── base/                      # Base test classes, test utilities
  │   └── base-service.test.ts   # Reusable test patterns
  ├── unit/                      # Unit tests (organized by package)
  │   ├── shared/                # Tests for @chainglass/shared
  │   ├── cli/                   # Tests for @chainglass/cli
  │   └── web/                   # Tests for apps/web
  ├── integration/               # Integration tests
  └── e2e/                       # End-to-end tests (future)

  packages/shared/src/fakes/     # Fakes still live with interfaces
  ```
- **Key Principle**: Tests are centralized but fakes remain colocated with their interfaces in `@chainglass/shared/fakes`
- **Future**: Infrastructure for orchestrating isolated test environments (out of scope for now)

---

## Clarification Coverage Summary

| Category | Status | Notes |
|----------|--------|-------|
| Workflow Mode | ✅ Resolved | Full mode selected |
| Testing Strategy | ✅ Resolved | Full TDD, fakes only |
| Documentation Strategy | ✅ Resolved | Hybrid (README + docs/) |
| Shared Package Scope | ✅ Resolved | Core package with services/adapters/fakes |
| Web App Purpose | ✅ Resolved | End-user facing product |
| Test Suite Organization | ✅ Resolved | Centralized at root `test/`, organized by package |
| MCP Protocol Version | ⏸️ Deferred | Use latest (2024-11-05); revisit when implementing MCP features |
| Logging in CLI vs Web | ⏸️ Deferred | Use same ILogger abstraction; CLI can have simpler adapter |
| Test Coverage Threshold | ⏸️ Deferred | No enforced threshold initially; revisit after baseline established |

---

**Specification Created**: 2026-01-18
**Plan Folder**: `docs/plans/001-project-setup/`
**Branch**: `001-project-setup`
