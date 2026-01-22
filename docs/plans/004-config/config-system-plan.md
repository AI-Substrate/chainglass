# Chainglass Configuration System - Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-01-21
**Spec**: [./config-system-spec.md](./config-system-spec.md)
**Status**: READY
**Mode**: Full

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Implementation Phases](#implementation-phases)
   - [Phase 1: Core Interfaces and Fakes](#phase-1-core-interfaces-and-fakes)
   - [Phase 2: Loading Infrastructure](#phase-2-loading-infrastructure)
   - [Phase 3: Production Config Service](#phase-3-production-config-service)
   - [Phase 4: DI Integration](#phase-4-di-integration)
   - [Phase 5: Documentation](#phase-5-documentation)
6. [Cross-Cutting Concerns](#cross-cutting-concerns)
7. [Complexity Tracking](#complexity-tracking)
8. [Progress Tracking](#progress-tracking)
9. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Test File Organization

| Category | Path Pattern | Purpose |
|----------|--------------|---------|
| Contract Tests | `test/contracts/config.contract.ts` | Verify fake-real parity for IConfigService |
| Unit Tests | `test/unit/config/*.test.ts` | Individual utility functions |
| Integration Tests | `test/integration/config/*.test.ts` | Full pipeline with fixtures |
| Data Fixtures | `test/fixtures/config/` | YAML, .env sample files for tests |
| Test Utilities | `test/helpers/config-test-utils.ts` | createTempUserConfig(), createTempProjectConfig() |
| Config Fixtures | `test/helpers/config-fixtures.ts` | createTestConfigService() factory function |
| Service Test Fixture | `test/fixtures/service-test.fixture.ts` | Pre-baked `serviceTest` with FakeLogger + FakeConfigService |
| MCP Test Fixture | `test/fixtures/mcp-test.fixture.ts` | Pre-baked `mcpTest` with MCP-specific defaults |
| CLI Test Fixture | `test/fixtures/cli-test.fixture.ts` | Pre-baked `cliTest` with CLI-specific defaults |

---

## Executive Summary

**Problem**: Chainglass needs a type-safe, multi-source configuration system that loads from user config (`~/.config/chainglass/`), project config (`.chainglass/`), environment variables (`CG_*`), and `.env` files with proper secret handling.

**Solution Approach**:
- Implement `IConfigService` interface following established interface-first pattern (like `ILogger`)
- Use Zod for schema validation and type inference
- Seven-phase loading pipeline adapted from fs2 (FlowSpace) research
- Full TDD with contract tests verifying fake-real parity
- Integrate with existing TSyringe DI using `useFactory` pattern

**Expected Outcomes**:
- Exemplar `SampleConfig` demonstrates pattern for future configs
- `SampleService` updated to consume config via DI
- ADR and rules/idioms documented for team reference
- Comprehensive test coverage serving as executable documentation

**Success Metrics**:
- 30 acceptance criteria (AC-01 through AC-30) all verified
- Contract tests pass for both `FakeConfigService` and `ChainglassConfigService`
- `just check` passes with no regressions

---

## Technical Context

### Current System State

```
chainglass/
├── packages/
│   └── shared/
│       └── src/
│           ├── interfaces/
│           │   ├── logger.interface.ts    # ILogger exemplar
│           │   └── index.ts
│           ├── fakes/
│           │   ├── fake-logger.ts         # FakeLogger exemplar
│           │   └── index.ts
│           └── adapters/
│               ├── pino-logger.adapter.ts # Production adapter (wraps Pino)
│               └── index.ts
├── apps/web/src/lib/
│   └── di-container.ts                    # TSyringe DI setup
└── test/
    └── contracts/
        └── logger.contract.ts             # Contract test exemplar
```

### Target Structure (Config System)

```
packages/shared/src/
├── interfaces/
│   ├── config.interface.ts     # IConfigService, ConfigType<T>
│   └── index.ts
├── fakes/
│   ├── fake-config.service.ts  # FakeConfigService
│   └── index.ts
├── config/                      # NEW: Config subsystem (not adapters/)
│   ├── chainglass-config.service.ts  # Production implementation
│   ├── schemas/
│   │   └── sample.schema.ts    # SampleConfig Zod schema
│   ├── loaders/
│   │   ├── yaml.loader.ts
│   │   ├── env.parser.ts
│   │   ├── secrets.loader.ts
│   │   ├── deep-merge.ts
│   │   └── expand-placeholders.ts
│   ├── paths/
│   │   ├── user-config.ts
│   │   └── project-config.ts
│   ├── security/
│   │   └── secret-detection.ts
│   ├── templates/               # Starter config templates (versioned)
│   │   └── config.yaml         # Copied to ~/.config/chainglass/ on first run
│   ├── exceptions.ts
│   └── index.ts
└── adapters/
    └── pino-logger.adapter.ts   # Adapters wrap external libraries
```

**Architectural Note**: `ChainglassConfigService` lives in `config/` (not `adapters/`) because:
- **Adapters** are thin wrappers around external libraries (e.g., `PinoLoggerAdapter` wraps Pino)
- **ChainglassConfigService** is an **infrastructure service** with orchestration logic (seven-phase pipeline, validation, secret detection) that happens to use libraries as implementation details

### Integration Requirements

| Component | Integration Point | Requirement |
|-----------|------------------|-------------|
| TSyringe DI | `createProductionContainer()` | Register `IConfigService` with `useFactory` |
| SampleService | Constructor injection | Add `IConfigService` parameter |
| MCP Server | `createMcpProductionContainer()` | Config must load before stderr logger setup |
| Test Infrastructure | `createTestContainer()` | Register `FakeConfigService` |

### Constraints and Limitations

1. **Synchronous Loading**: Config must load blocking at startup (no async/await in constructor)
2. **No Decorators**: RSC compatibility requires `useFactory` pattern, not `@injectable`
3. **Fakes Over Mocks**: Use `FakeConfigService`, not `vi.mock()`
4. **Targeted Mocks Only**: Filesystem mocking acceptable for platform-specific path tests

### Default Config Strategy

**Principle**: Zero-config startup with sensible defaults. No `--init` command required.

| Scenario | Behavior |
|----------|----------|
| No `~/.config/chainglass/` exists | Auto-create directory on first access (mode 0755) |
| No `config.yaml` exists | Use Zod schema defaults only |
| Partial `config.yaml` | Merge file values with schema defaults |
| No `.chainglass/` in project | Use user config + env vars only (not an error) |

**Default Sources** (in order of application):
1. **Zod schema defaults**: `z.boolean().default(true)` - always applied for missing fields
2. **User config file**: `~/.config/chainglass/config.yaml` - overrides schema defaults
3. **Project config file**: `.chainglass/config.yaml` - overrides user config
4. **Environment variables**: `CG_*` - highest priority, overrides everything

### Config Composition Hierarchy

```mermaid
flowchart TB
    subgraph Sources["Config Sources (by precedence)"]
        direction TB
        ENV["🔺 CG_* Environment Variables<br/><i>Highest priority</i>"]
        PROJ["📁 .chainglass/config.yaml<br/><i>Project-specific</i>"]
        USER["🏠 ~/.config/chainglass/config.yaml<br/><i>User preferences</i>"]
        ZOD["📋 Zod Schema Defaults<br/><i>Fallback values</i>"]
    end

    subgraph Secrets["Secret Sources (loaded to env first)"]
        direction TB
        DOTENV[".env<br/><i>CWD dotenv-expand</i>"]
        PROJ_SEC[".chainglass/secrets.env"]
        USER_SEC["~/.config/chainglass/secrets.env"]
    end

    subgraph Pipeline["Seven-Phase Pipeline"]
        direction LR
        P1["1️⃣ Load<br/>Secrets"]
        P2["2️⃣ Load<br/>YAML"]
        P3["3️⃣ Parse<br/>CG_* Env"]
        P4["4️⃣ Deep<br/>Merge"]
        P5["5️⃣ Expand<br/>Placeholders"]
        P6["6️⃣ Validate<br/>Secrets"]
        P7["7️⃣ Zod<br/>Validate"]
    end

    subgraph Output["Final Config"]
        TYPED["✅ Typed Config Objects<br/>SampleConfig, etc."]
    end

    %% Secret loading flow
    USER_SEC --> P1
    PROJ_SEC --> P1
    DOTENV --> P1
    P1 -->|"sets process.env"| P3

    %% YAML loading flow
    USER --> P2
    PROJ --> P2

    %% Merge flow
    ZOD --> P4
    P2 -->|"merged YAML"| P4
    P3 -->|"env overrides"| P4

    %% Validation flow
    P4 --> P5
    P5 --> P6
    P6 --> P7
    P7 --> TYPED

    %% Precedence indicators
    ENV -.->|"overrides"| PROJ
    PROJ -.->|"overrides"| USER
    USER -.->|"overrides"| ZOD

    classDef highest fill:#ff6b6b,stroke:#c92a2a,color:#fff
    classDef high fill:#ffa94d,stroke:#e67700,color:#000
    classDef medium fill:#69db7c,stroke:#2f9e44,color:#000
    classDef low fill:#74c0fc,stroke:#1c7ed6,color:#000
    classDef pipeline fill:#e9ecef,stroke:#495057,color:#000
    classDef output fill:#9775fa,stroke:#6741d9,color:#fff

    class ENV highest
    class PROJ,DOTENV high
    class USER,PROJ_SEC medium
    class ZOD,USER_SEC low
    class P1,P2,P3,P4,P5,P6,P7 pipeline
    class TYPED output
```

**Reading the diagram**:
- **Top to bottom**: Higher precedence sources override lower ones
- **Left to right**: Pipeline execution order
- **Secrets** load into `process.env` first, then CG_* parsing reads them
- **Dotted lines**: Show override relationships

**First Run Behavior**:
```typescript
// getUserConfigDir() auto-creates on first access
export function getUserConfigDir(): string {
  const configDir = resolveConfigPath(); // platform-specific

  // Auto-create if missing (first run)
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true, mode: 0o755 });
  }

  return configDir;
}
```

**First Run Creates Starter Config**:
- On first run, copy template from `packages/shared/src/config/templates/config.yaml`
- Template includes comments explaining each option and commented-out examples
- Template is versioned in git - updated as project evolves
- Users can customize or delete; won't be overwritten on subsequent runs

```yaml
# packages/shared/src/config/templates/config.yaml
# Chainglass Configuration
# Documentation: https://github.com/chainglass/chainglass/docs/configuration
#
# This file was created on first run. Customize as needed.
# Environment variables (CG_*) override these values.

# Sample configuration (reference implementation)
sample:
  enabled: true
  timeout: 30  # seconds (1-300)
  name: default

# Uncomment to customize:
# sample:
#   timeout: 60
#   name: my-project
```

### Assumptions

1. Zod provides sufficient validation for all config types
2. TSyringe factory pattern extends cleanly to config service
3. `SampleService` is representative of future service patterns
4. One config service instance per process is sufficient
5. Synchronous loading is acceptable for startup performance

---

## Critical Research Findings

Research sourced from `research-dossier.md` (65+ findings) and optimized subagent analysis (16 implementation/risk discoveries).

### Critical Discovery 01: TypeScript Zod Pattern Replaces Pydantic

**Impact**: Critical
**Sources**: [Research Dossier, I1-01]

**Problem**: fs2 uses Pydantic `BaseModel` with `__config_path__` metadata. TypeScript lacks runtime class introspection.

**Solution**: Use Zod schemas with explicit registry pattern:

```typescript
// ❌ WRONG - Pydantic-style class approach (no TypeScript equivalent)
class SampleConfig extends BaseModel {
  __config_path__ = 'sample';
}

// ✅ CORRECT - Zod schema with metadata wrapper
const SampleConfigSchema = z.object({
  enabled: z.boolean().default(true),
  timeout: z.coerce.number().min(1).max(300).default(30),
  name: z.string().default('default'),
});

type SampleConfig = z.infer<typeof SampleConfigSchema>;

export const CONFIG_REGISTRY = {
  sample: { schema: SampleConfigSchema, configPath: 'sample' },
} as const;
```

**Action Required**: Define all config schemas with `z.infer<>` for type derivation. Never maintain separate type definitions.

**Affects Phases**: Phase 1, Phase 2

---

### Critical Discovery 02: DI Lifecycle - Config Loads Before Container

**Impact**: Critical
**Sources**: [Spec AC-21/22, R1-04]

**Problem**: Config must be fully loaded before any DI resolution. Current startup sequence undefined.

**Solution**: Explicit startup sequence with config as parameter:

```typescript
// ❌ WRONG - Config loaded lazily during resolution
container.register(DI_TOKENS.CONFIG, {
  useFactory: () => new ChainglassConfigService(), // When does this load?
});

// ✅ CORRECT - Config loaded before container creation
export function createProductionContainer(
  config: IConfigService
): DependencyContainer {
  const childContainer = container.createChildContainer();

  childContainer.register<IConfigService>(DI_TOKENS.CONFIG, {
    useValue: config, // Already loaded, inject as value
  });

  return childContainer;
}

// Startup sequence
const config = new ChainglassConfigService();
config.load(); // Synchronous, throws on error
const container = createProductionContainer(config);
```

**Action Required**: Update DI container factory to accept pre-loaded config. Document startup sequence.

**Affects Phases**: Phase 4

---

### Critical Discovery 03: Environment Variable Parsing Edge Cases

**Impact**: High
**Sources**: [AC-09/10, R1-01]

**Problem**: `CG_SECTION__FIELD=value` parsing has edge cases:
- Single underscore vs double underscore ambiguity
- Type coercion (all env vars are strings)
- Deeply nested keys (potential DOS)

**Solution**: Strict parsing with validation and depth limits:

```typescript
// ❌ WRONG - Naive parsing
const parts = key.split('__'); // What if key has trailing __?

// ✅ CORRECT - Strict pattern validation
const ENV_VAR_PATTERN = /^CG_([A-Z][A-Z0-9_]*)$/;
const MAX_NESTING_DEPTH = 4;

function parseEnvVars(): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('CG_')) continue;

    const path = key.slice(3).split('__').map(s => s.toLowerCase());
    if (path.length > MAX_NESTING_DEPTH) {
      throw new ConfigurationError(`Nesting depth exceeds ${MAX_NESTING_DEPTH}: ${key}`);
    }

    setNestedValue(result, path, value);
  }

  return result;
}
```

**Action Required**: Implement strict env var parser with depth limits. Add comprehensive edge case tests.

**Affects Phases**: Phase 2

---

### Critical Discovery 04: Placeholder Expansion Must Validate

**Impact**: High
**Sources**: [AC-12, R1-02]

**Problem**: `${VAR}` placeholders may remain unexpanded if env var is missing. Silent failure is security risk.

**Solution**: Two-phase expansion with strict validation:

```typescript
// ❌ WRONG - dotenv-expand defaults leave unexpanded placeholders
const result = expand(config()); // ${MISSING} stays as literal

// ✅ CORRECT - Expand then validate
function loadAndExpand(): void {
  // Phase 1: Load with dotenv-expand (lenient)
  expand(config({ path: '.env' }));

  // Phase 2: Validate no unexpanded placeholders remain
  validateNoUnexpandedPlaceholders(rawConfig);
}

function validateNoUnexpandedPlaceholders(obj: Record<string, unknown>): void {
  const pattern = /\$\{([^}]+)\}/;
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && pattern.test(value)) {
      const match = value.match(pattern);
      throw new ConfigurationError(
        `Unexpanded placeholder in '${key}': ${match?.[0]}\n` +
        `Set environment variable: ${match?.[1]}=<value>`
      );
    }
    if (typeof value === 'object' && value !== null) {
      validateNoUnexpandedPlaceholders(value as Record<string, unknown>);
    }
  }
}
```

**Action Required**: Implement post-expansion validation. Add tests for missing variable scenarios.

**Affects Phases**: Phase 2, Phase 3

---

### Critical Discovery 05: Literal Secret Detection Patterns

**Impact**: High
**Sources**: [AC-14, R1-07, nodejs-secrets.md]

**Problem**: Hardcoded secrets like `sk-abc123` must be rejected. Pattern matching has false positives/negatives.

**Solution**: Multi-pattern detection with whitelisting:

```typescript
const SECRET_PATTERNS = [
  { name: 'OpenAI', pattern: /^sk-[A-Za-z0-9]{20,}$/ },
  { name: 'GitHub PAT', pattern: /^ghp_[A-Za-z0-9]{36}$/ },
  { name: 'Slack Bot', pattern: /^xoxb-[0-9]+-[0-9]+-[A-Za-z0-9]+$/ },
  { name: 'Stripe', pattern: /^sk_(live|test)_[A-Za-z0-9]{24}$/ },
  { name: 'AWS', pattern: /^AKIA[0-9A-Z]{16}$/ },
];

// Whitelist for test fixtures
const LEGITIMATE_PREFIXES = ['sk_example', 'ghp_test_'];

export function detectLiteralSecret(value: string): string | null {
  if (LEGITIMATE_PREFIXES.some(p => value.startsWith(p))) {
    return null;
  }

  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(value)) {
      return name;
    }
  }

  return null;
}
```

**Action Required**: Implement secret detection with test coverage for all patterns. Document whitelisting for test fixtures.

**Affects Phases**: Phase 3

---

### High Discovery 06: Git-Style Project Config Discovery

**Impact**: High
**Sources**: [AC-08]

**Problem**: Project config must be found by walking up from CWD like `.git/` discovery.

**Solution**: Efficient walk-up algorithm with caching:

```typescript
let cachedProjectDir: string | null | undefined;

export function getProjectConfigDir(): string | null {
  if (cachedProjectDir !== undefined) return cachedProjectDir;

  let current = process.cwd();
  const root = path.parse(current).root;

  while (current !== root) {
    const candidate = path.join(current, '.chainglass');
    try {
      const stats = fs.statSync(candidate);
      if (stats.isDirectory()) {
        cachedProjectDir = candidate;
        return candidate;
      }
    } catch {
      // Directory doesn't exist, continue walking
    }
    current = path.dirname(current);
  }

  cachedProjectDir = null;
  return null;
}
```

**Action Required**: Implement walk-up discovery with caching. Add tests for deep directory structures.

**Affects Phases**: Phase 2

---

### High Discovery 07: Cross-Platform Path Resolution

**Impact**: Medium
**Sources**: [AC-05/06/07, R1-08, cross-platform-paths.md]

**Problem**: Path conventions differ: Linux XDG, macOS ~/.config, Windows %APPDATA%.

**Solution**: Platform-specific resolution with consistent lowercase:

```typescript
export function getUserConfigDir(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome) {
    return path.join(xdgConfigHome, 'chainglass');
  }

  const home = process.env.HOME || os.homedir();

  switch (process.platform) {
    case 'win32':
      const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
      return path.join(appData, 'chainglass');

    case 'darwin':
    case 'linux':
    default:
      return path.join(home, '.config', 'chainglass');
  }
}
```

**Action Required**: Implement platform-specific paths. Add tests mocking each platform.

**Affects Phases**: Phase 2

---

### High Discovery 08: IConfigService Interface Design

**Impact**: High
**Sources**: [AC-01, I1-02]

**Problem**: Interface must follow interface-first pattern (interface + fake + implementation) with typed object registry.

**Solution**: Typed registry pattern with get/require/set:

```typescript
// packages/shared/src/interfaces/config.interface.ts
export interface IConfigService {
  /**
   * Get config object if available.
   * @returns Config object or undefined if not loaded
   */
  get<T extends ConfigObject>(type: ConfigType<T>): T | undefined;

  /**
   * Get config object or throw if missing.
   * @throws MissingConfigurationError if config type not available
   */
  require<T extends ConfigObject>(type: ConfigType<T>): T;

  /**
   * Set config object in registry.
   * Used by loaders and for testing.
   */
  set<T extends ConfigObject>(config: T): void;
}

export interface ConfigType<T> {
  readonly configPath: string;
  parse(raw: unknown): T;
}
```

**Action Required**: Define interface in shared package. Create FakeConfigService following FakeLogger pattern.

**Affects Phases**: Phase 1

---

## Testing Philosophy

### Testing Approach

**Selected Approach**: Full TDD
**Rationale**: Exemplar implementation should demonstrate proper test-first development for all config system components.
**Focus Areas**:
- Contract tests for IConfigService implementations
- Unit tests for loaders, mergers, validators
- Integration tests for multi-source config loading
- Platform-specific path resolution tests

### Test-Driven Development

All implementation follows RED-GREEN-REFACTOR:
1. **RED**: Write test first, verify it fails
2. **GREEN**: Implement minimal code to pass test
3. **REFACTOR**: Improve code quality while keeping tests green

### Test Documentation

Every test includes Test Doc comment:

```typescript
it('should load config from YAML file', () => {
  /*
  Test Doc:
  - Why: Verify core config loading from filesystem
  - Contract: loadYamlConfig() returns parsed object or throws on invalid YAML
  - Usage Notes: Pass absolute path; relative paths resolved from CWD
  - Quality Contribution: Catches YAML parsing errors before production
  - Worked Example: loadYamlConfig('/path/config.yaml') → { sample: { timeout: 30 } }
  */
  // test implementation
});
```

### Mock Usage

**Policy**: Targeted mocks - limited to external systems or slow dependencies.

| Component | Approach | Rationale |
|-----------|----------|-----------|
| IConfigService | FakeConfigService | Behavior-focused fake, not vi.mock() |
| Filesystem | Mock `fs.readFileSync` | Platform-specific path tests |
| process.env | Direct manipulation | Reset after each test |
| process.platform | vi.stubGlobal | Cross-platform path tests |

### Test Config Injection Patterns

**For Service/Adapter Tests** (not config system tests):

```typescript
// test/unit/web/sample-service.test.ts
import { FakeConfigService, FakeLogger } from '@chainglass/shared';
import { SampleService } from '../services/sample.service.js';

describe('SampleService', () => {
  it('should use configured timeout', () => {
    // Arrange: Create fake with specific test config
    const fakeConfig = new FakeConfigService({
      sample: { enabled: true, timeout: 120, name: 'test-run' },
    });
    const service = new SampleService(new FakeLogger(), fakeConfig);

    // Act & Assert
    expect(service.getTimeout()).toBe(120);
  });

  it('should handle disabled state', () => {
    // Different config for different test scenario
    const fakeConfig = new FakeConfigService({
      sample: { enabled: false, timeout: 30, name: 'disabled-test' },
    });
    const service = new SampleService(new FakeLogger(), fakeConfig);

    expect(service.isEnabled()).toBe(false);
  });
});
```

**Test Config Helpers** (optional, in `test/helpers/`):

```typescript
// test/helpers/config-fixtures.ts
import { FakeConfigService } from '@chainglass/shared';

export function createTestConfigService(
  overrides: Partial<{ sample: Partial<SampleConfig> }> = {}
): FakeConfigService {
  return new FakeConfigService({
    sample: {
      enabled: true,
      timeout: 30,
      name: 'test-default',
      ...overrides.sample,
    },
  });
}

// Usage in tests:
const config = createTestConfigService({ sample: { timeout: 60 } });
```

**Key Principles**:
1. Each test creates its own `FakeConfigService` - no shared state
2. Constructor accepts full config objects - no loading from files
3. Tests control exact config values - deterministic behavior
4. No environment variable pollution between tests

### Pre-baked Test Fixtures (Vitest `test.extend()`)

**For consistent test setup across all service/adapter tests**:

```typescript
// test/fixtures/service-test.fixture.ts
import { test as base } from 'vitest';
import { FakeLogger, FakeConfigService, type SampleConfig } from '@chainglass/shared';

// Type for fixture context
interface ServiceTestFixtures {
  fakeLogger: FakeLogger;
  fakeConfig: FakeConfigService;
  defaultSampleConfig: SampleConfig;
}

// Extended test with pre-baked fakes
export const serviceTest = base.extend<ServiceTestFixtures>({
  // Fresh FakeLogger for each test
  fakeLogger: async ({}, use) => {
    await use(new FakeLogger());
  },

  // Default config - tests can override via fakeConfig.set()
  defaultSampleConfig: async ({}, use) => {
    await use({
      enabled: true,
      timeout: 30,
      name: 'test-fixture',
    });
  },

  // FakeConfigService pre-populated with defaults
  fakeConfig: async ({ defaultSampleConfig }, use) => {
    const config = new FakeConfigService({
      sample: defaultSampleConfig,
    });
    await use(config);
  },
});

// Re-export describe, expect, etc. for convenience
export { describe, expect, beforeEach, afterEach } from 'vitest';
```

**Usage in tests** - fixtures auto-injected:

```typescript
// test/unit/web/sample-service.test.ts
import { serviceTest, describe, expect } from '../fixtures/service-test.fixture.js';

describe('SampleService', () => {
  // Fixtures automatically provided - no manual setup!
  serviceTest('should use default timeout', ({ fakeLogger, fakeConfig }) => {
    const service = new SampleService(fakeLogger, fakeConfig);
    expect(service.getTimeout()).toBe(30); // from defaultSampleConfig
  });

  // Override specific values when needed
  serviceTest('should handle custom timeout', ({ fakeLogger, fakeConfig }) => {
    fakeConfig.set({ enabled: true, timeout: 120, name: 'custom' });
    const service = new SampleService(fakeLogger, fakeConfig);
    expect(service.getTimeout()).toBe(120);
  });

  // Access logger entries for assertions
  serviceTest('should log on startup', ({ fakeLogger, fakeConfig }) => {
    const service = new SampleService(fakeLogger, fakeConfig);
    service.initialize();
    fakeLogger.assertLoggedAtLevel('info', 'initialized');
  });
});
```

**Multiple fixture sets for different contexts**:

```typescript
// test/fixtures/mcp-test.fixture.ts - MCP-specific defaults
export const mcpTest = base.extend<McpTestFixtures>({
  fakeLogger: async ({}, use) => {
    // MCP uses stderr logger pattern
    await use(new FakeLogger());
  },
  fakeConfig: async ({}, use) => {
    await use(new FakeConfigService({
      sample: { enabled: true, timeout: 60, name: 'mcp-test' },
      mcp: { stdio: true, debug: false }, // MCP-specific config
    }));
  },
});

// test/fixtures/cli-test.fixture.ts - CLI-specific defaults
export const cliTest = base.extend<CliTestFixtures>({
  // CLI-specific setup...
});
```

**Benefits**:
- Zero boilerplate in test files
- Consistent defaults across all tests
- Fresh instances per test (isolation)
- Easy to override specific values
- Type-safe fixture injection

---

## Implementation Phases

### Phase 1: Core Interfaces and Fakes

**Objective**: Define `IConfigService` interface and `FakeConfigService` test double following established patterns.

**Deliverables**:
- `IConfigService` interface in `@chainglass/shared/interfaces/`
- `ConfigType<T>` interface for typed object registry
- `FakeConfigService` with test helper methods
- `SampleConfig` interface and Zod schema
- Contract test factory for config service implementations

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Schema/type drift | Medium | High | Use `z.infer<>` exclusively; never separate types |
| Interface too narrow | Low | Medium | Review against fs2 patterns before finalizing |

#### Tasks (TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.1 | [ ] | Write contract tests for IConfigService | 2 | Tests cover: get, require, set; fake and real must pass | - | Create test/contracts/config.contract.ts |
| 1.2 | [ ] | Write tests for FakeConfigService | 2 | Tests cover: constructor injection, assertion helpers, type safety | - | Create test/unit/shared/fake-config.test.ts |
| 1.3 | [ ] | Define IConfigService interface | 1 | Interface compiles, exports from index.ts | - | packages/shared/src/interfaces/config.interface.ts |
| 1.4 | [ ] | Define ConfigType<T> interface | 1 | Generic type works with SampleConfig | - | Same file as IConfigService |
| 1.5 | [ ] | Define SampleConfig interface with Zod schema | 2 | z.infer<> derives correct type; fields: enabled, timeout, name | - | packages/shared/src/config/schemas/sample.schema.ts |
| 1.6 | [ ] | Implement FakeConfigService to pass tests | 2 | All tests from 1.2 pass; implements IConfigService | - | packages/shared/src/fakes/fake-config.service.ts |
| 1.7 | [ ] | Create config exceptions | 1 | ConfigurationError, MissingConfigurationError, LiteralSecretError | - | packages/shared/src/config/exceptions.ts |
| 1.8 | [ ] | Update barrel exports | 1 | Can import { IConfigService, FakeConfigService } from '@chainglass/shared' | - | Update all index.ts files |
| 1.9 | [ ] | Create test config helper | 1 | createTestConfigService() with defaults + overrides | - | test/helpers/config-fixtures.ts |
| 1.10 | [ ] | Create serviceTest fixture | 2 | Vitest test.extend() with FakeLogger + FakeConfigService | - | test/fixtures/service-test.fixture.ts |

#### Test Examples (Write First!)

```typescript
// test/contracts/config.contract.ts
export function configServiceContractTests(
  name: string,
  createService: () => IConfigService
) {
  describe(`${name} implements IConfigService contract`, () => {
    let service: IConfigService;

    beforeEach(() => {
      service = createService();
    });

    it('should return undefined for unset config type', () => {
      /*
      Test Doc:
      - Why: Verify get() returns undefined, not throws, when config missing
      - Contract: get(ConfigType) returns T | undefined
      - Usage Notes: Use require() if config must exist
      - Quality Contribution: Catches null vs undefined handling errors
      - Worked Example: get(SampleConfigSchema) → undefined (before set)
      */
      const result = service.get(SampleConfigSchema);
      expect(result).toBeUndefined();
    });

    it('should throw MissingConfigurationError on require() for unset type', () => {
      /*
      Test Doc:
      - Why: Verify require() fails fast when config missing
      - Contract: require(ConfigType) throws MissingConfigurationError if not set
      - Usage Notes: Error message includes config type name for debugging
      - Quality Contribution: Catches missing config at startup, not runtime
      - Worked Example: require(SampleConfigSchema) → throws MissingConfigurationError
      */
      expect(() => service.require(SampleConfigSchema)).toThrow(
        MissingConfigurationError
      );
    });

    it('should return config after set()', () => {
      /*
      Test Doc:
      - Why: Verify set() stores and get() retrieves correctly
      - Contract: set(config) stores; get(type) returns same object
      - Usage Notes: Type safety ensures correct config/type pairing
      - Quality Contribution: Catches registry storage bugs
      - Worked Example: set(sample); get(SampleConfigSchema) → sample
      */
      const sample: SampleConfig = { enabled: true, timeout: 30, name: 'test' };
      service.set(sample);

      expect(service.get(SampleConfigSchema)).toEqual(sample);
      expect(service.require(SampleConfigSchema)).toEqual(sample);
    });
  });
}

// Run contract tests against both implementations
configServiceContractTests('FakeConfigService', () => new FakeConfigService());
// ChainglassConfigService added in Phase 3
```

#### Non-Happy-Path Coverage
- [ ] get() with unregistered config type returns undefined
- [ ] require() with unregistered type throws MissingConfigurationError
- [ ] set() with null/undefined throws TypeError
- [ ] Error messages include config type name

#### Acceptance Criteria
- [ ] All contract tests pass (10+ behavioral scenarios covering get/require/set)
- [ ] FakeConfigService supports constructor injection for test setup:
  ```typescript
  // Easy test setup - pass configs directly to constructor
  const fakeConfig = new FakeConfigService({
    sample: { enabled: true, timeout: 60, name: 'test' },
  });
  ```
- [ ] FakeConfigService has assertion helpers following FakeLogger pattern:
  - `getSetConfigs()`: Returns Map of all set configs
  - `has(type: ConfigType)`: Boolean check if type is set
  - `assertConfigSet(type, message)`: Throws if type not set
- [ ] SampleConfig schema validates with explicit rules:
  - `enabled`: boolean, required, default `true`
  - `timeout`: number, min 1, max 300, required, default `30`
  - `name`: string, required, default `'default'`
- [ ] Exports work: `import { IConfigService, FakeConfigService } from '@chainglass/shared'`
- [ ] TypeScript strict mode passes
- [ ] `serviceTest` fixture provides type-safe `fakeLogger` and `fakeConfig` injection
- [ ] Tests using `serviceTest` have zero manual setup boilerplate

---

### Phase 2: Loading Infrastructure

**Objective**: Implement path resolution, YAML loading, environment parsing, deep merge, and placeholder expansion utilities.

**Deliverables**:
- Path resolution functions (user, project, .env)
- YAML config loader with error handling
- Environment variable parser (`CG_*` prefix)
- Deep merge utility
- Placeholder expansion (`${VAR}` syntax)

**Dependencies**: Phase 1 complete (interfaces available)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Windows path edge cases | Medium | Medium | Platform-specific unit tests with mocking |
| Env var parsing ambiguity | Medium | High | Strict regex pattern with depth limits |
| Circular reference in merge | Low | Low | WeakSet-based detection |

#### Tasks (TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Write tests for getUserConfigDir() | 2 | Tests cover: Linux XDG, macOS ~/.config, Windows %APPDATA%, auto-create on first access | - | Mock process.platform and env vars |
| 2.2 | [ ] | Write tests for getProjectConfigDir() | 2 | Tests cover: walk-up discovery, no .chainglass found, caching | - | Use temp directories |
| 2.3 | [ ] | Write tests for loadYamlConfig() | 2 | Tests cover: valid YAML, invalid YAML, file not found | - | Use fixtures |
| 2.4 | [ ] | Write tests for parseEnvVars() | 2 | Tests cover: CG_ prefix, __ nesting, depth limit, coercion | - | Edge cases critical |
| 2.5 | [ ] | Write tests for deepMerge() | 2 | Tests cover: nested objects, array replacement, circular refs | - | |
| 2.6 | [ ] | Write tests for expandPlaceholders() | 2 | Tests cover: ${VAR}, missing vars, nested values | - | |
| 2.7 | [ ] | Implement getUserConfigDir() | 2 | All tests from 2.1 pass; auto-creates dir | - | packages/shared/src/config/paths/user-config.ts |
| 2.7.1 | [ ] | Create config.yaml template | 1 | Template with comments, all options documented | - | packages/shared/src/config/templates/config.yaml |
| 2.7.2 | [ ] | Implement ensureUserConfig() | 2 | Copies template on first run if config.yaml missing | - | packages/shared/src/config/paths/user-config.ts |
| 2.8 | [ ] | Implement getProjectConfigDir() | 2 | All tests from 2.2 pass | - | packages/shared/src/config/paths/project-config.ts |
| 2.9 | [ ] | Implement loadYamlConfig() | 2 | All tests from 2.3 pass | - | packages/shared/src/config/loaders/yaml.loader.ts |
| 2.10 | [ ] | Implement parseEnvVars() | 2 | All tests from 2.4 pass; MAX_DEPTH = 4 | - | packages/shared/src/config/loaders/env.parser.ts |
| 2.11 | [ ] | Implement deepMerge() | 2 | All tests from 2.5 pass; circular ref detection | - | packages/shared/src/config/loaders/deep-merge.ts |
| 2.12 | [ ] | Implement expandPlaceholders() | 2 | All tests from 2.6 pass | - | packages/shared/src/config/loaders/expand-placeholders.ts |
| 2.13 | [ ] | Implement validateNoUnexpandedPlaceholders() | 1 | Throws on remaining ${...} patterns | - | Same file as 2.12 |
| 2.14 | [ ] | Add npm dependencies | 1 | zod, yaml, dotenv, dotenv-expand added to package.json | - | pnpm add zod yaml dotenv dotenv-expand |

#### Test Examples (Write First!)

```typescript
// test/unit/config/env-parser.test.ts
describe('parseEnvVars', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should parse CG_ prefixed variables to nested object', () => {
    /*
    Test Doc:
    - Why: Core env var parsing is foundation of config override
    - Contract: CG_SECTION__FIELD=value → { section: { field: 'value' } }
    - Usage Notes: Double underscore (__) creates nesting; values are strings
    - Quality Contribution: Catches nesting logic errors
    - Worked Example: CG_SAMPLE__TIMEOUT=30 → { sample: { timeout: '30' } }
    */
    process.env.CG_SAMPLE__TIMEOUT = '30';
    process.env.CG_SAMPLE__ENABLED = 'true';

    const result = parseEnvVars();

    expect(result).toEqual({
      sample: {
        timeout: '30',
        enabled: 'true',
      },
    });
  });

  it('should reject nesting beyond MAX_DEPTH', () => {
    /*
    Test Doc:
    - Why: Prevent DOS via deeply nested env vars
    - Contract: Nesting > 4 levels throws ConfigurationError
    - Usage Notes: MAX_DEPTH = 4 (configurable in future)
    - Quality Contribution: Security boundary for untrusted env
    - Worked Example: CG_A__B__C__D__E=x → throws
    */
    process.env.CG_A__B__C__D__E = 'too deep';

    expect(() => parseEnvVars()).toThrow(ConfigurationError);
  });

  it('should ignore non-CG_ prefixed variables', () => {
    process.env.OTHER_VAR = 'ignored';
    process.env.CG_SAMPLE__NAME = 'included';

    const result = parseEnvVars();

    expect(result).not.toHaveProperty('other_var');
    expect(result).toHaveProperty('sample.name', 'included');
  });
});
```

#### Non-Happy-Path Coverage
- [ ] getUserConfigDir() when HOME undefined (falls back to os.homedir())
- [ ] getUserConfigDir() when directory doesn't exist (auto-creates with mode 0755)
- [ ] ensureUserConfig() when config.yaml missing (copies template, doesn't overwrite existing)
- [ ] getProjectConfigDir() at filesystem root (returns null)
- [ ] loadYamlConfig() with empty file (returns empty object)
- [ ] loadYamlConfig() with invalid YAML (throws with line number)
- [ ] parseEnvVars() with trailing double underscore (rejects)
- [ ] deepMerge() with null values (replaces target)
- [ ] expandPlaceholders() with circular ${A} → ${B} → ${A} (not supported, document limitation)

#### Acceptance Criteria
- [ ] All 24 tests pass (6 per utility function)
- [ ] Path resolution works on macOS (verified locally)
- [ ] getUserConfigDir() auto-creates `~/.config/chainglass/` on first access (mode 0755)
- [ ] ensureUserConfig() copies template to `config.yaml` on first run (preserves existing)
- [ ] getProjectConfigDir() returns null if no `.chainglass/` found (not an error)
- [ ] Env var parser handles edge cases documented in R1-01
- [ ] Placeholder expansion validates no unexpanded remain
- [ ] Dependencies added: zod, yaml, dotenv, dotenv-expand

---

### Phase 3: Production Config Service

**Objective**: Implement `ChainglassConfigService` executing the seven-phase loading pipeline with secret detection.

#### Seven-Phase Loading Pipeline (Explicit Ordering)

The loading pipeline executes **synchronously** in this exact order:

| Phase | Name | Input | Output | Precedence |
|-------|------|-------|--------|------------|
| 1 | Load user secrets | `~/.config/chainglass/secrets.env` | Env vars set | Lowest |
| 2 | Load project secrets | `.chainglass/secrets.env` | Env vars set (overrides Phase 1) | Low |
| 3 | Load CWD .env | `./.env` with `dotenv-expand` | Env vars set (overrides Phase 2) | Medium |
| 4 | Load YAML configs | User `config.yaml` → Project `config.yaml` | Merged object | Medium-High |
| 5 | Parse CG_ env vars | `process.env.CG_*` | Override object | Highest |
| 6 | Deep merge all | Defaults + YAML + env overrides | Final config object | - |
| 7 | Validate | Zod schemas + placeholder check + secret detection | Typed config or throws | - |

**Precedence Rule**: Later phases override earlier phases. Environment variables always win.

```typescript
// ChainglassConfigService.load() pseudocode
load(): void {
  // Phase 1-3: Load secrets to environment
  this.loadSecretsToEnv(this.userSecretsPath);
  this.loadSecretsToEnv(this.projectSecretsPath);
  this.loadDotEnvWithExpand(this.dotEnvPath);

  // Phase 4: Load YAML configs
  const userConfig = this.loadYamlConfig(this.userConfigPath);
  const projectConfig = this.loadYamlConfig(this.projectConfigPath);

  // Phase 5: Parse environment overrides
  const envConfig = this.parseEnvVars();

  // Phase 6: Deep merge (user → project → env)
  const merged = deepMerge(deepMerge(userConfig, projectConfig), envConfig);

  // Phase 7: Validate
  this.validateNoUnexpandedPlaceholders(merged);
  this.validateNoLiteralSecrets(merged);
  this.validateAndRegisterSchemas(merged);
}
```

**Deliverables**:
- `ChainglassConfigService` implementing `IConfigService`
- Seven-phase loading pipeline (sync)
- Literal secret detection
- Integration tests for full pipeline

**Dependencies**: Phase 1 (interfaces), Phase 2 (utilities)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Phase sequencing bug | Medium | High | Explicit phase methods with logging |
| Secret detection false positives | Medium | Medium | Whitelisting for test fixtures |
| Sync loading performance | Low | Low | Cache project dir; minimize stat calls |

#### Tasks (TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Write tests for secret detection | 2 | Tests cover: sk-*, ghp_*, whitelist, high-entropy | - | |
| 3.2 | [ ] | Write tests for secrets loading pipeline | 2 | Tests cover: user → project → .env precedence | - | |
| 3.3 | [ ] | Write tests for YAML loading pipeline | 2 | Tests cover: user → project merge, missing files | - | |
| 3.4 | [ ] | Write tests for full ChainglassConfigService | 3 | Tests cover: complete pipeline, precedence, exceptions | - | Integration-level tests |
| 3.5 | [ ] | Implement detectLiteralSecret() | 2 | All tests from 3.1 pass | - | packages/shared/src/config/security/secret-detection.ts |
| 3.6 | [ ] | Implement validateNoLiteralSecrets() | 2 | Recursively checks all string values | - | Same file as 3.5 |
| 3.7 | [ ] | Implement loadSecretsToEnv() | 2 | Tests from 3.2 pass; user → project → .env order | - | packages/shared/src/config/loaders/secrets.loader.ts |
| 3.8 | [ ] | Implement ChainglassConfigService.load() | 3 | All tests from 3.4 pass; seven-phase pipeline | - | packages/shared/src/config/chainglass-config.service.ts |
| 3.9 | [ ] | Run contract tests against real service | 1 | Contract tests pass for ChainglassConfigService | - | Update config.contract.ts |
| 3.10 | [ ] | Add integration tests with fixtures | 2 | Full pipeline tested with YAML + env + .env | - | test/integration/config-service.test.ts |

#### Test Examples (Write First!)

```typescript
// test/unit/config/secret-detection.test.ts
describe('detectLiteralSecret', () => {
  it('should detect OpenAI sk- prefix', () => {
    /*
    Test Doc:
    - Why: Prevent hardcoded OpenAI keys in config files
    - Contract: sk-[20+ chars] detected as "OpenAI" secret
    - Usage Notes: Returns null for non-secrets; string name for detected secrets
    - Quality Contribution: Security gate before config loaded
    - Worked Example: 'sk-abc123def456ghi789jkl012' → 'OpenAI'
    */
    expect(detectLiteralSecret('sk-abc123def456ghi789jkl012')).toBe('OpenAI');
  });

  it('should allow whitelisted test prefixes', () => {
    expect(detectLiteralSecret('sk_example_test_value')).toBeNull();
  });

  it('should detect GitHub PAT', () => {
    expect(detectLiteralSecret('ghp_abcdefghijklmnopqrstuvwxyz123456')).toBe('GitHub PAT');
  });
});

// test/integration/config-service.test.ts
describe('ChainglassConfigService', () => {
  it('should load config from all sources with correct precedence', () => {
    /*
    Test Doc:
    - Why: Verify complete loading pipeline works end-to-end
    - Contract: env vars > project YAML > user YAML > defaults
    - Usage Notes: Create temp directories with fixture files
    - Quality Contribution: Catches precedence bugs
    - Worked Example: User timeout=30, project timeout=60, env CG_SAMPLE__TIMEOUT=90 → 90
    */
    // Setup temp directories with fixtures
    const userDir = createTempUserConfig({ sample: { timeout: 30 } });
    const projectDir = createTempProjectConfig({ sample: { timeout: 60 } });
    process.env.CG_SAMPLE__TIMEOUT = '90';

    const service = new ChainglassConfigService({
      userConfigDir: userDir,
      projectConfigDir: projectDir,
    });
    service.load();

    const config = service.require(SampleConfigSchema);
    expect(config.timeout).toBe(90); // env wins
  });
});
```

#### Non-Happy-Path Coverage
- [ ] load() when all config sources missing (uses defaults)
- [ ] load() when YAML is invalid (throws with file path)
- [ ] load() when literal secret detected (throws LiteralSecretError)
- [ ] load() when unexpanded placeholder remains (throws ConfigurationError)
- [ ] load() called twice (idempotent - returns cached config, no error)

**Decision**: `load()` is **idempotent**. Calling twice returns the same config without re-loading. Document in JSDoc.

#### Acceptance Criteria
- [ ] Contract tests pass for ChainglassConfigService (10+ behavioral scenarios)
- [ ] Secret detection catches 5 patterns: OpenAI (sk-*), GitHub (ghp_*), Slack (xoxb-*), Stripe (sk_live/test_*), AWS (AKIA*)
- [ ] Loading precedence verified: env vars > project > user > defaults (test shows override chain)
- [ ] All exceptions include: error type, config path, field path, remediation hint
- [ ] Performance: load() completes in <100ms (measured via test harness, logged to output)
- [ ] Integration test uses real YAML fixture files from `test/fixtures/config/`

---

### Phase 4: DI Integration

**Objective**: Register `IConfigService` in DI containers and update `SampleService` to consume config.

#### Startup Sequence (Critical)

Config **must** be loaded before DI container creation. This is the required startup sequence:

```typescript
// ========================================
// CORRECT: Config loads BEFORE container
// ========================================

// 1. Create config service
const config = new ChainglassConfigService({
  userConfigDir: getUserConfigDir(),
  projectConfigDir: getProjectConfigDir(),
});

// 2. Load config synchronously (blocking)
config.load(); // Throws on validation error - fail fast

// 3. Create container with pre-loaded config
const container = createProductionContainer(config);

// 4. Now safe to resolve services
const sampleService = container.resolve<SampleService>(DI_TOKENS.SAMPLE_SERVICE);

// ========================================
// WRONG: Config loaded lazily in factory
// ========================================
// container.register(DI_TOKENS.CONFIG, {
//   useFactory: () => new ChainglassConfigService(), // When does load() happen?
// });
```

**Entry Points**:
- **CLI**: `apps/cli/src/index.ts` - Load config at startup before command execution
- **Web**: `apps/web/src/lib/bootstrap.ts` - Load config before `createProductionContainer()`
- **MCP**: `packages/mcp-server/src/index.ts` - Load config before stderr logger setup

**Deliverables**:
- `DI_TOKENS.CONFIG` token added
- Production container registers `ChainglassConfigService`
- Test container registers `FakeConfigService`
- `SampleService` updated with config injection
- DI integration tests

**Dependencies**: Phase 3 complete (production service available)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Startup sequence bug | Medium | High | Explicit config param to container factory |
| SampleService regression | Low | Medium | Existing tests plus new config tests |
| MCP container missed | Low | High | Update both web and MCP containers |

#### Tasks (TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Write tests for DI container config registration | 2 | Tests cover: production and test containers | - | |
| 4.2 | [ ] | Write tests for SampleService with config | 2 | Tests cover: config injection, timeout usage | - | |
| 4.3 | [ ] | Add DI_TOKENS.CONFIG | 1 | Token defined in DI_TOKENS object | - | apps/web/src/lib/di-container.ts |
| 4.4 | [ ] | Update createProductionContainer() | 2 | Accepts config param; registers as value | - | |
| 4.5 | [ ] | Update createTestContainer() | 2 | Registers FakeConfigService | - | |
| 4.6 | [ ] | Update SampleService constructor | 2 | Adds IConfigService parameter | - | apps/web/src/services/sample.service.ts |
| 4.7 | [ ] | Update SampleService to use config | 2 | Reads timeout from SampleConfig | - | |
| 4.8 | [ ] | Update MCP container | 2 | createMcpProductionContainer() includes config | - | packages/mcp-server/src/lib/di-container.ts |
| 4.8.1 | [ ] | Document MCP startup sequence | 2 | Config loads before stderr logger; test verifies | - | Verify config → logger order |
| 4.9 | [ ] | Update existing SampleService tests | 2 | All existing tests pass with FakeConfigService | - | |
| 4.10 | [ ] | Create startup sequence example | 1 | Code example in bootstrap.ts with comments | - | |
| 4.11 | [ ] | Add container factory error handling | 1 | Throw helpful error if config not pre-loaded | - | Check config.isLoaded() in factory |
| 4.12 | [ ] | Create mcpTest fixture | 1 | Extends serviceTest with MCP-specific defaults | - | test/fixtures/mcp-test.fixture.ts |
| 4.13 | [ ] | Create cliTest fixture | 1 | Extends serviceTest with CLI-specific defaults | - | test/fixtures/cli-test.fixture.ts |

#### Test Examples (Write First!)

```typescript
// test/unit/web/di-container.test.ts
describe('DI Container with Config', () => {
  it('should resolve SampleService with config injected', () => {
    /*
    Test Doc:
    - Why: Verify DI wiring includes config service
    - Contract: SampleService receives IConfigService via constructor
    - Usage Notes: createTestContainer() injects FakeConfigService
    - Quality Contribution: Catches DI registration errors
    - Worked Example: container.resolve(SAMPLE_SERVICE) → has configService
    */
    const container = createTestContainer();
    const service = container.resolve<SampleService>(DI_TOKENS.SAMPLE_SERVICE);

    expect(service).toBeInstanceOf(SampleService);
    // Service should have access to config
    expect(service.getTimeout()).toBeDefined();
  });

  it('should use FakeConfigService in test container', () => {
    const container = createTestContainer();
    const configService = container.resolve<IConfigService>(DI_TOKENS.CONFIG);

    expect(configService).toBeInstanceOf(FakeConfigService);
  });
});

// test/unit/web/sample-service.test.ts
describe('SampleService with Config', () => {
  it('should use timeout from config', () => {
    /*
    Test Doc:
    - Why: Verify SampleService reads config values
    - Contract: getTimeout() returns value from SampleConfig.timeout
    - Usage Notes: Inject FakeConfigService with pre-set config
    - Quality Contribution: Catches config integration bugs
    - Worked Example: FakeConfig(timeout: 60) → getTimeout() === 60
    */
    const logger = new FakeLogger();
    const config = new FakeConfigService();
    config.set({ enabled: true, timeout: 60, name: 'test' });

    const service = new SampleService(logger, config);

    expect(service.getTimeout()).toBe(60);
  });
});
```

#### Non-Happy-Path Coverage
- [ ] SampleService when config not set (uses default from schema)
- [ ] Container created without config param (throws: "IConfigService required - call config.load() before createProductionContainer()")
- [ ] Container created with unloaded config (throws: "Config not loaded - call config.load() before container creation")
- [ ] MCP container config loading verified before stderr logger (test: resolve logger, verify config already available)

#### Acceptance Criteria
- [ ] SampleService receives IConfigService via constructor injection (verified by 3+ assertions)
- [ ] Production container uses ChainglassConfigService (type assertion in test)
- [ ] Test container uses FakeConfigService (type assertion in test)
- [ ] MCP container includes config service AND loads before stderr logger (integration test)
- [ ] All existing tests pass (run `pnpm test --run` - no new failures)
- [ ] Startup sequence documented with code example in `apps/web/src/lib/bootstrap.ts`
- [ ] Container factory throws descriptive error if config missing or unloaded

---

### Phase 5: Documentation

**Objective**: Document the configuration system with ADR, README, and how-to guides.

**Deliverables**:
- ADR documenting architecture decisions
- Package README with quick-start
- Detailed how-to guide in docs/how/
- Updated rules & idioms

**Dependencies**: All implementation phases complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Documentation drift | Medium | Medium | Include doc updates in phase gates |
| Unclear examples | Low | Medium | Use real code from implementation |

#### Discovery & Placement Decision

**Existing docs/how/ structure**:
```
docs/how/
└── (empty - first feature docs)
```

**Decision**: Create new `docs/how/configuration/` directory.

**File strategy**: Create numbered files following convention.

#### Tasks (Lightweight Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Create ADR from ADR-SEED-001 and ADR-SEED-002 | 2 | ADR follows template; status Accepted | - | docs/adr/adr-0002-configuration-system.md |
| 5.2 | [ ] | Create package README | 2 | Quick-start usage, basic examples, links | - | packages/shared/README.md (update) |
| 5.3 | [ ] | Create docs/how/configuration/1-overview.md | 2 | Architecture diagram, key concepts | - | |
| 5.4 | [ ] | Create docs/how/configuration/2-usage.md | 2 | Step-by-step usage guide | - | |
| 5.5 | [ ] | Create docs/how/configuration/3-testing.md | 2 | Testing patterns with FakeConfigService | - | |
| 5.6 | [ ] | Update docs/project-rules/idioms.md | 1 | Add configuration patterns section | - | |
| 5.7 | [ ] | Update docs/project-rules/architecture.md | 1 | Add config service to component diagram | - | |
| 5.8 | [ ] | Review all documentation | 1 | Peer review, no broken links | - | |

#### Content Outlines

**ADR-0002: Configuration System**:
- Context: Need for multi-source, type-safe config
- Decision: Typed object registry with Zod validation
- Consequences: Positive (type safety, testability) and negative (sync loading)
- References: ADR-SEED-001, ADR-SEED-002

**docs/how/configuration/1-overview.md**:
- What is the configuration system
- Architecture diagram (loading pipeline)
- Key concepts: sources, precedence, typed registry
- When to use config vs environment variables

**docs/how/configuration/2-usage.md**:
- Adding a new config type (step-by-step)
- Loading config in a service
- Environment variable overrides
- Secret handling with placeholders

**docs/how/configuration/3-testing.md**:
- Using FakeConfigService in tests
- Contract tests for new config types
- Integration testing patterns

#### Acceptance Criteria
- [ ] ADR-0002 documents all architecture decisions
- [ ] README enables quick-start in <5 minutes
- [ ] How-to guides are complete and accurate
- [ ] All links in docs validated
- [ ] Peer review completed

---

## Cross-Cutting Concerns

### Security Considerations

| Concern | Approach |
|---------|----------|
| Literal secret detection | Reject hardcoded `sk-*`, `ghp_*`, etc. with LiteralSecretError |
| Secret file permissions | Document that secrets.env should have 600 permissions |
| Placeholder validation | Fail if `${VAR}` unexpanded after loading |
| Whitelist for tests | `sk_example` prefix allowed for test fixtures |

### Observability

| Aspect | Implementation |
|--------|---------------|
| Logging | Debug-level logs for each loading phase (via ILogger) |
| Metrics | Config load time measurable (startup performance) |
| Error tracking | All errors include config type, file path, field path |

### Documentation

| Location | Content | Audience |
|----------|---------|----------|
| packages/shared/README.md | Quick-start, basic usage | All developers |
| docs/how/configuration/ | Detailed guides, testing patterns | Feature developers |
| docs/adr/adr-0002-*.md | Architecture decisions | Architects, reviewers |
| docs/project-rules/idioms.md | Configuration idioms | All developers |

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| ChainglassConfigService | 3 | Medium | S=1,I=1,D=0,N=0,F=1,T=1 | Seven-phase pipeline, sync loading | Explicit phase methods, comprehensive tests |
| Path Resolution | 2 | Small | S=1,I=0,D=0,N=0,F=0,T=1 | Cross-platform edge cases | Platform-specific tests with mocking |
| Secret Detection | 2 | Small | S=0,I=0,D=0,N=1,F=1,T=1 | Pattern matching ambiguity | Whitelist, comprehensive test coverage |

---

## Progress Tracking

### Phase Completion Checklist

- [x] Phase 1: Core Interfaces and Fakes - ✅ COMPLETE (2026-01-21)
- [x] Phase 2: Loading Infrastructure - ✅ COMPLETE (2026-01-21)
- [ ] Phase 3: Production Config Service - NOT STARTED
- [ ] Phase 4: DI Integration - NOT STARTED
- [ ] Phase 5: Documentation - NOT STARTED

### STOP Rule

**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Change Footnotes Ledger

**NOTE**: This section will be populated during implementation by plan-6a-update-progress.

**Footnote Numbering Authority**: plan-6a-update-progress is the **single source of truth** for footnote numbering across the entire plan.

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]

---

**Plan Status**: READY
**Validation**: Passed `/plan-4-complete-the-plan` on 2026-01-21 (7 critical fixes applied)
**Next Step**: Run `/plan-5-phase-tasks-and-brief` for Phase 1
