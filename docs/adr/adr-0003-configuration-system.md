---
title: "ADR-0003: Configuration System Architecture"
status: "Accepted"
date: "2026-01-22"
authors: "Chainglass Team"
tags: ["architecture", "decision", "configuration", "zod", "di", "validation"]
supersedes: ""
superseded_by: ""
---

# ADR-0003: Configuration System Architecture

## Status

**Accepted**

## Context

Chainglass requires a type-safe, multi-source configuration system that supports developer preferences (user-level), project-specific settings, environment variable overrides, and secure secret handling. The system must integrate seamlessly with the existing dependency injection architecture and testing patterns.

Key requirements driving this decision:

- **Multi-Source Precedence**: Configuration from user preferences (`~/.config/chainglass/`), project settings (`.chainglass/`), and environment variables (`CG_*`) with clear override semantics
- **Type Safety**: Compile-time type inference for configuration objects, eliminating runtime type errors
- **Secret Management**: Support for placeholder-based secrets (`${API_KEY}`) with validation against hardcoded secrets
- **Testability**: Configuration system must support the project's fakes-only testing policy with `FakeConfigService`
- **DI Integration**: Configuration must load before DI container creation, with pre-loaded config passed as parameter
- **Zero-Config Startup**: System should work out-of-the-box with sensible defaults, no `--init` command required

Research findings from fs2 (FlowSpace) informed the seven-phase loading pipeline design, adapted from Python/Pydantic to TypeScript/Zod.

## Decision

We adopt a **typed object registry pattern with Zod validation** for the configuration system:

1. **IConfigService Interface**: Generic interface following the `ILogger`/`FakeLogger` exemplar pattern:
   ```typescript
   interface IConfigService {
     get<T>(type: ConfigType<T>): T | undefined;
     require<T>(type: ConfigType<T>): T;  // Throws MissingConfigurationError
     set<T>(type: ConfigType<T>, config: T): void;
     isLoaded(): boolean;
   }
   ```

2. **ConfigType<T> Registry Pattern**: Each config type is a typed descriptor with path and parser:
   ```typescript
   interface ConfigType<T> {
     readonly configPath: string;  // e.g., 'sample'
     parse(raw: unknown): T;       // Zod-based validation
   }
   ```

3. **Zod Schema-First Definition**: Type inference from Zod schemas, never separate type definitions:
   ```typescript
   const SampleConfigSchema = z.object({
     enabled: z.boolean().default(true),
     timeout: z.coerce.number().min(1).max(300).default(30),
     name: z.string().default('default'),
   });
   type SampleConfig = z.infer<typeof SampleConfigSchema>;
   ```

4. **Seven-Phase Loading Pipeline**: Synchronous pipeline with explicit precedence:
   | Phase | Operation | Precedence |
   |-------|-----------|------------|
   | 1 | Load user secrets.env | Lowest |
   | 2 | Load project secrets.env | Low |
   | 3 | (Reserved for CWD .env) | Medium |
   | 4 | Load YAML configs (user → project) | Medium-High |
   | 5 | Parse CG_* env vars | Highest |
   | 6 | Deep merge all sources | - |
   | 7 | Validate (placeholders, secrets, Zod) | - |

5. **Transactional Secret Loading**: Secrets are loaded to a pending map, validated, then committed to `process.env` only after all validation passes. This prevents partial environment pollution on validation failure.

6. **DI Integration Pattern**: Config loads before container creation:
   ```typescript
   const config = new ChainglassConfigService({ userConfigDir, projectConfigDir });
   config.load();
   const container = createProductionContainer(config);
   ```

7. **FakeConfigService for Testing**: Constructor-injected test double with assertion helpers:
   ```typescript
   const fakeConfig = new FakeConfigService({
     sample: { enabled: true, timeout: 60, name: 'test' },
   });
   ```

8. **Contract Tests for Parity**: `configServiceContractTests()` factory ensures FakeConfigService and ChainglassConfigService behave identically.

## Consequences

### Positive

- **POS-001**: Zod schema-first design provides compile-time type safety and runtime validation from a single source of truth, eliminating type drift between schema and interface
- **POS-002**: Typed object registry enables IDE autocomplete and refactoring safety when accessing configuration values
- **POS-003**: Seven-phase pipeline with explicit precedence makes override behavior predictable and debuggable
- **POS-004**: FakeConfigService with constructor injection enables zero-boilerplate test setup, aligning with fakes-only testing policy
- **POS-005**: Contract tests guarantee fake-real parity, preventing test/production divergence
- **POS-006**: Transactional secret loading prevents partial environment state on validation failure
- **POS-007**: Pre-loaded config passed to DI container ensures all services have valid configuration at resolution time
- **POS-008**: Default config strategy with auto-created user directory enables zero-config startup
- **POS-009**: Literal secret detection prevents accidental credential commits in config files

### Negative

- **NEG-001**: Synchronous loading adds startup latency (~1-5ms typical, <100ms gate), though acceptable for CLI/server startup
- **NEG-002**: `process.env` mutation in Phases 1-3 requires careful test isolation (snapshot/restore pattern)
- **NEG-003**: Pre-loaded config pattern requires explicit startup sequence documentation and enforcement
- **NEG-004**: New config types require adding to CONFIG_REGISTRY in ChainglassConfigService, creating coupling
- **NEG-005**: Secret detection patterns may produce false positives requiring whitelist maintenance

## Alternatives Considered

### Alternative 1: Environment-Only Configuration

- **ALT-001**: **Description**: Use only environment variables for all configuration, no YAML files or user config directories
- **ALT-002**: **Rejection Reason**: Environment-only config lacks hierarchical structure, makes complex nested configuration unwieldy, and doesn't support user-level preferences that persist across projects. Developer experience suffers without file-based config for IDE editing.

### Alternative 2: Pydantic-Style Class Pattern (from fs2)

- **ALT-003**: **Description**: Use class-based config with `__config_path__` metadata, like Python's Pydantic approach
- **ALT-004**: **Rejection Reason**: TypeScript lacks runtime class introspection for metadata. Zod schemas with `z.infer<>` provide equivalent type derivation without requiring class decorators or reflection.

### Alternative 3: Lazy Loading in DI Factory

- **ALT-005**: **Description**: Load config lazily in `useFactory` during first resolution
- **ALT-006**: **Rejection Reason**: Lazy loading creates ambiguous startup semantics - when does load() throw? Early validation is preferable for fail-fast behavior. Pre-loaded config makes startup sequence explicit and testable.

### Alternative 4: Mock-Based Testing for Config

- **ALT-007**: **Description**: Use `vi.mock()` for IConfigService in tests rather than FakeConfigService
- **ALT-008**: **Rejection Reason**: Explicitly banned by project architecture rules. FakeConfigService provides behavior-focused testing with assertion helpers, aligning with fakes-only policy.

### Alternative 5: JSON Config Files

- **ALT-009**: **Description**: Use JSON instead of YAML for config files
- **ALT-010**: **Rejection Reason**: YAML supports comments, improving developer experience for config documentation. JSON's lack of comments makes config files harder to understand and maintain.

## Implementation Notes

- **IMP-001**: Config location follows XDG Base Directory spec: Linux `~/.config/chainglass/`, macOS `~/.config/chainglass/`, Windows `%APPDATA%/chainglass/`
- **IMP-002**: Environment variable parsing uses `CG_` prefix with `__` for nesting (e.g., `CG_SAMPLE__TIMEOUT=60`). Maximum nesting depth is 4 to prevent DoS.
- **IMP-003**: Secret detection patterns cover: OpenAI (`sk-`), GitHub PAT (`ghp_`), Slack (`xoxb-`), Stripe (`sk_live/test_`), AWS (`AKIA`). Whitelist `sk_example` for test fixtures.
- **IMP-004**: Tests should snapshot `process.env` in `beforeEach` and restore in `afterEach` to prevent inter-test pollution from secret loading.
- **IMP-005**: Placeholder expansion uses `${VAR}` syntax with `dotenv-expand`. Unexpanded placeholders after Phase 7 throw `ConfigurationError` with actionable message.
- **IMP-006**: New config types added by: (1) create Zod schema in `config/schemas/`, (2) add to CONFIG_REGISTRY in ChainglassConfigService, (3) document in how-to guide.
- **IMP-007**: Performance target: `load()` completes in <100ms. Measured at 0.83ms typical in Phase 3 integration tests.
- **IMP-008**: `serviceTest`, `mcpTest`, and `cliTest` Vitest fixtures provide pre-baked FakeLogger + FakeConfigService for zero-boilerplate testing.

## References

- **REF-001**: [Spec](../plans/004-config/config-system-spec.md)
- **REF-002**: [Plan](../plans/004-config/config-system-plan.md)
- **REF-003**: [ADR-0001: MCP Tool Design Patterns](./adr-0001-mcp-tool-design-patterns.md) - Establishes interface/fake patterns
- **REF-004**: [ADR-0002: Exemplar-Driven Development](./adr-0002-exemplar-driven-development.md) - Establishes testing philosophy
- **REF-005**: [Constitution](../project-rules/constitution.md) - Defines fakes-only testing policy
- **REF-006**: [ILogger/FakeLogger Exemplar](../../packages/shared/src/interfaces/logger.interface.ts) - Interface pattern exemplar
