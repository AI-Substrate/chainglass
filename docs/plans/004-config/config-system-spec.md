# Chainglass Configuration System

📚 *This specification incorporates findings from `research-dossier.md` and external research in `external-research/`.*

## Research Context

Based on comprehensive research of the fs2 (FlowSpace) configuration system and external research on TypeScript validation, cross-platform paths, and secret management:

- **Components affected**: New `@chainglass/config` package, integration with existing SampleService and adapters
- **Critical dependencies**: Zod (validation), dotenv-expand (secret loading), custom XDG-aware path resolution
- **Modification risks**: Integration with existing DI container (TSyringe), ensuring pattern is correct before wider adoption
- **Prior learnings**: Chainglass already has Clean Architecture with DI, ILogger interface precedent, fakes-over-mocks testing pattern

See `research-dossier.md` for full analysis of fs2 patterns and `external-research/*.md` for TypeScript-specific guidance.

## Summary

**WHAT**: An exemplar configuration system implementation that establishes the pattern for multi-source, type-safe configuration in Chainglass. The initial implementation focuses on infrastructure (loading, merging, validation) and integration with existing sample service/adapters to prove the pattern works correctly with the DI system.

**WHY**: Before building domain-specific configuration, we need to establish and validate the foundational patterns. By integrating with existing SampleService and sample adapters, we prove the DI pattern works, create exemplar code for future development, and establish rules/idioms that can be documented in ADRs.

## Goals

1. **Establish the pattern** - Create exemplar configuration infrastructure that demonstrates the correct way to define, load, and consume configuration in Chainglass

2. **Prove DI integration** - Inject configuration into existing SampleService and sample adapters to validate the TSyringe factory pattern works correctly with config

3. **Create exemplar tests** - Comprehensive unit tests demonstrating how to test services that depend on configuration using FakeConfigService

4. **Document in ADR** - Capture the configuration patterns, conventions, and decisions for future reference

5. **Update rules & idioms** - Establish configuration as a documented pattern in the project's architectural guidance

6. **Multi-source loading** - Implement the core infrastructure:
   - User config (`~/.config/chainglass/`)
   - Project config (`.chainglass/`)
   - Environment variables (`CG_*`)
   - `.env` file loading with `${VAR}` expansion

7. **Type-safe access** - `IConfigService` with `get<T>()` and `require<T>()` methods following the ILogger precedent

8. **Security foundations** - Literal secret detection to prevent hardcoded API keys

## Non-Goals

1. **Domain-specific configs** - No application-specific configuration objects yet; focus on exemplar only

2. **CLI config commands** - `cg config get/set/validate` commands are deferred; focus on library implementation

3. **Production deployment patterns** - Cloud secret manager integration, rotation, etc. are out of scope

4. **Config file creation tooling** - No `cg init` or starter file generation

5. **Hot-reloading** - Configuration is loaded once at startup

## Complexity

**Score**: CS-2 (small)

**Breakdown**:
| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Surface Area (S) | 1 | New package + integration with existing sample service/adapters |
| Integration (I) | 1 | External deps: Zod, dotenv-expand, yaml (stable, well-documented) |
| Data/State (D) | 0 | No database schema; file-based config only |
| Novelty (N) | 0 | Well-specified from fs2 research; clear TypeScript patterns from external research |
| Non-Functional (F) | 0 | Standard security patterns; no strict compliance requirements |
| Testing/Rollout (T) | 1 | Contract tests and integration tests; no feature flags |

**Total**: S(1) + I(1) + D(0) + N(0) + F(0) + T(1) = **3** → **CS-2**

**Confidence**: 0.90

**Assumptions**:
- Zod provides sufficient validation capabilities
- Existing TSyringe DI pattern extends cleanly to config service
- SampleService and sample adapters are sufficient to prove the pattern

**Dependencies**:
- Zod library for schema validation
- dotenv + dotenv-expand for .env loading
- yaml library for YAML parsing

**Risks**:
- DI registration pattern may need adjustment for config service lifecycle
- Cross-platform path edge cases

**Phases**:
1. Core infrastructure: IConfigService interface, path resolution, loaders, Zod schemas
2. Exemplar config: SampleConfig object with validation
3. DI integration: Register in container, inject into SampleService
4. Testing: Contract tests, unit tests, integration tests
5. Documentation: ADR, rules & idioms update

## Acceptance Criteria

### Core Infrastructure

1. **AC-01**: `IConfigService` interface exists in `@chainglass/shared/interfaces/` with `get<T>()`, `require<T>()`, and `set<T>()` methods
2. **AC-02**: `ChainglassConfigService` (production) loads configuration from user, project, and environment sources
3. **AC-03**: `FakeConfigService` (testing) accepts pre-set configuration objects in constructor
4. **AC-04**: Configuration loading follows precedence: env vars > project > user > defaults

### Path Resolution

5. **AC-05**: On Linux, user config loads from `$XDG_CONFIG_HOME/chainglass/` or `~/.config/chainglass/`
6. **AC-06**: On macOS, user config loads from `~/.config/chainglass/`
7. **AC-07**: On Windows, user config loads from `%APPDATA%\chainglass\`
8. **AC-08**: Project config discovery walks up from CWD until finding `.chainglass/` or reaching filesystem root (git-style discovery). If no `.chainglass/` is found, project config is empty (user and env sources still apply)

### Environment Variables

9. **AC-09**: Environment variables prefixed with `CG_` are parsed into configuration
10. **AC-10**: Double underscore `__` creates nested keys (e.g., `CG_SAMPLE__TIMEOUT=30` → `sample.timeout: 30`)
11. **AC-11**: Environment variables override file-based configuration

### Secret Handling

12. **AC-12**: `.env` files are loaded with `${VAR}` placeholder expansion
13. **AC-13**: Secrets load in order: user secrets → project secrets → `.env` (highest priority)
14. **AC-14**: Literal secrets matching patterns like `sk-*` trigger `LiteralSecretError`

### Validation

15. **AC-15**: Configuration is validated against Zod schemas at load time
16. **AC-16**: `require<T>()` throws `MissingConfigurationError` if config type not available
17. **AC-17**: Validation errors include field path and actionable message

### Exemplar: SampleConfig

18. **AC-18**: `SampleConfig` schema exists with fields: `enabled: boolean`, `timeout: number`, `name: string`
19. **AC-19**: `SampleConfig` is registered in `CONFIG_TYPES` registry
20. **AC-20**: `SampleConfig` loads from YAML path `sample` (e.g., `sample.timeout` in config.yaml)

### DI Integration

21. **AC-21**: `IConfigService` is registered in production container via `createProductionContainer()`
22. **AC-22**: `FakeConfigService` is registered in test container via `createTestContainer()`
23. **AC-23**: `SampleService` receives `IConfigService` via constructor injection
24. **AC-24**: `SampleService` uses config values (e.g., timeout from SampleConfig)

### Testing Exemplars

25. **AC-25**: Contract test verifies both `ChainglassConfigService` and `FakeConfigService` implement `IConfigService` correctly
26. **AC-26**: Unit test demonstrates testing `SampleService` with `FakeConfigService` injecting `SampleConfig`
27. **AC-27**: Integration test verifies config loading from actual YAML file
28. **AC-28**: Test demonstrates environment variable override behavior

### Documentation

29. **AC-29**: ADR documents configuration system architecture decisions
30. **AC-30**: Rules & idioms updated with configuration patterns

## Risks & Assumptions

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| DI lifecycle mismatch | Medium | Test thoroughly with existing sample service |
| Config service initialization timing | Medium | Ensure config loads before DI resolution |
| Cross-platform path issues | Low | Add platform-specific test cases |

### Assumptions

1. SampleService and sample adapters are representative of future service patterns
2. TSyringe factory pattern accommodates config service
3. Zod schema pattern scales to more complex configurations
4. One config service instance per process is sufficient
5. **Synchronous loading**: Config loads blocking at startup before DI resolution

## Open Questions

*None - scope is well-defined for exemplar implementation*

## ADR Seeds

### ADR-SEED-001: Configuration Service Pattern

**Decision Drivers**:
- Consistency with existing ILogger pattern
- Testability via dependency injection
- Type-safe configuration access
- Support for fakes in testing

**Candidate Alternatives**:
- A) **Typed object registry** (fs2 pattern) - `config.require(SampleConfig)` returns typed object
- B) **String key access** - `config.get('sample.timeout')` returns unknown
- C) **Module-level singletons** - Direct import of config objects

**Recommendation**: Option A (typed object registry) for consistency with research and type safety

### ADR-SEED-002: Configuration Schema Definition

**Decision Drivers**:
- Type inference from schema (avoid duplicate type definitions)
- Validation at load time
- Clear error messages

**Candidate Alternatives**:
- A) **Zod schemas with `z.infer<>`** - Schema defines both validation and types
- B) **Separate interfaces + runtime validation** - More code, risk of drift
- C) **Class-based with decorators** - Requires experimental decorators

**Recommendation**: Option A (Zod) per external research findings

## External Research

**Incorporated**:
- `external-research/typescript-config-libraries.md` → Zod recommendation
- `external-research/cross-platform-paths.md` → XDG path resolution
- `external-research/nodejs-secrets.md` → dotenv-expand, secret detection

**Applied To**:
- Zod for schema definition (AC-15, AC-18)
- Path resolution patterns (AC-05 through AC-08)
- Secret detection (AC-14)
- dotenv-expand for placeholder expansion (AC-12)

---

**Mode**: Full
**Specification Status**: Clarification complete
**Next Step**: Run `/plan-3-architect` to generate the phase-based implementation plan

## Testing Strategy

**Approach**: Full TDD
**Rationale**: Establishing foundational patterns requires comprehensive test coverage to serve as exemplars for future development.
**Focus Areas**:
- Contract tests for IConfigService implementations
- Unit tests for loaders, mergers, validators
- Integration tests for multi-source config loading
- Platform-specific path resolution tests

**Excluded**: N/A - full coverage for exemplar implementation

**Mock Usage**: Targeted mocks - limited to external systems or slow dependencies. Use FakeConfigService (implementing IConfigService) rather than vi.mock() for config service. Mocking filesystem operations is acceptable for platform-specific path tests.

## Documentation Strategy

**Location**: Hybrid (README.md + docs/how/)
**Rationale**: Configuration is foundational - needs quick-start for developers and detailed patterns for reference.

**Content Split**:
- **README.md** (`packages/config/README.md`): Quick-start usage, basic examples, link to detailed docs
- **docs/how/**: Detailed configuration patterns, multi-source loading explanation, testing patterns
- **docs/adr/**: ADR per AC-29 for architecture decisions

**Target Audience**: Chainglass developers adding new config types or services that consume configuration
**Maintenance**: Update when adding new config types or changing loading behavior

## Clarifications

### Session 2026-01-21

**Q1: What workflow mode fits this task?**

| Option | Mode | Best For | What Changes |
|--------|------|----------|--------------|
| A | Simple | CS-1/CS-2 tasks, single phase, quick path to implementation | Single-phase plan, inline tasks, plan-4/plan-5 optional |
| **B** | **Full** | **CS-3+ features, multiple phases, comprehensive gates** | **Multi-phase plan, required dossiers, all gates** |

**Answer**: B (Full)
**Rationale**: User specified "Full" - establishing foundational patterns requires comprehensive gates and multi-phase planning despite CS-2 complexity score.

---

**Q2: What testing approach best fits this feature's complexity and risk profile?**

| Option | Approach | Best For | Test Coverage |
|--------|----------|----------|---------------|
| **A** | **Full TDD** | **Complex logic, algorithms, APIs** | **Comprehensive unit/integration/e2e tests** |
| B | TAD | Features needing executable documentation | Tests as high-fidelity docs |
| C | Lightweight | Simple operations, config changes | Core functionality validation only |
| D | Manual Only | One-time scripts, trivial changes | Document manual verification steps |
| E | Hybrid | Mixed complexity features | TDD for complex, TAD/lightweight for others |

**Answer**: A (Full TDD)
**Rationale**: User specified "TDD" - exemplar implementation should demonstrate proper test-first development for all config system components.

---

**Q3: How should mocks/stubs/fakes be used during implementation?**

| Option | Policy | Typical Use |
|--------|--------|-------------|
| A | Avoid mocks entirely | Real data/fixtures only |
| **B** | **Targeted mocks** | **Limited to external systems or slow dependencies** |
| C | Allow liberal mocking | Any component may be mocked when beneficial |

**Answer**: B (Targeted mocks)
**Rationale**: Aligns with established "fakes-over-mocks" pattern. Use FakeConfigService for DI, mock filesystem for platform tests.

---

**Q4: Where should this feature's documentation live?**

| Option | Location | Best For | Content Examples |
|--------|----------|----------|------------------|
| A | README.md only | Quick-start essentials | Setup steps, basic usage |
| B | docs/how/ only | Detailed guides | Architecture, tutorials |
| **C** | **Hybrid** | **Features needing both** | **Overview in README, details in docs/how/** |
| D | No new documentation | Internal changes | Refactoring, minor fixes |

**Answer**: C (Hybrid)
**Rationale**: Configuration is foundational infrastructure - needs quick-start for immediate use and detailed docs for pattern reference.
**Content Split**: README for basic usage/examples, docs/how/ for detailed patterns and testing guidance, docs/adr/ for architecture decisions.

---

**Q5: Should config loading be synchronous or async?**

| Option | Style | Trade-offs |
|--------|-------|------------|
| **A** | **Synchronous** | **Simpler, blocks startup, config ready before DI resolution** |
| B | Async | More complex, requires async container setup |

**Answer**: A (Synchronous)
**Rationale**: Matches fs2 pattern. Config must be fully loaded before DI container resolves services that depend on it.

---

**Q6: How should config errors be surfaced to callers?**

| Option | Style | Behavior |
|--------|-------|----------|
| **A** | **Throw exceptions** | **require() throws MissingConfigurationError, get() returns undefined** |
| B | Result types | Return Result<T, Error> for explicit error handling |

**Answer**: A (Throw exceptions)
**Rationale**: Matches fs2 pattern and existing ILogger precedent. Simpler API, consistent with TypeScript ecosystem conventions.

---

### Coverage Summary

| Category | Status | Notes |
|----------|--------|-------|
| Workflow Mode | ✅ Resolved | Full mode selected |
| Testing Strategy | ✅ Resolved | Full TDD with targeted mocks |
| Documentation Strategy | ✅ Resolved | Hybrid (README + docs/how/ + ADR) |
| Loading Behavior | ✅ Resolved | Synchronous, blocking at startup |
| Error Handling | ✅ Resolved | Throw exceptions pattern |
| FRs (AC-01 to AC-30) | ✅ Complete | 30 acceptance criteria defined |
| NFRs | ✅ Complete | Security (literal secret detection), cross-platform |
| Data Model | ✅ Complete | Zod schemas, typed object registry |
| Integrations | ✅ Complete | TSyringe DI, SampleService |
| Edge Cases | ✅ Complete | No .chainglass found, missing configs, validation errors |

**Outstanding**: None
**Deferred**: CLI commands (cg config), cloud secret managers, hot-reloading
