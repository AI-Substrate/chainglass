# Research Report: fs2 Configuration System Replication for Chainglass

**Generated**: 2026-01-21T12:00:00Z
**Research Query**: "Replicate fs2 (FlowSpace) config system in Chainglass with central config, .env secrets, workspace composition, and CG__ env var overrides"
**Mode**: Plan-Associated
**Location**: docs/plans/004-config/research-dossier.md
**FlowSpace**: Available (fs2 graph indexed)
**Findings**: 65+ findings from 7 specialized subagents

## Executive Summary

### What It Does
The fs2 configuration system is a sophisticated, multi-source, typed configuration framework that loads settings from user-level YAML (~/.config/fs2), project-level YAML (.fs2/), environment variables (FS2__), and .env files, with automatic secret expansion, deep merging, and Pydantic validation.

### Business Purpose
Enables flexible, secure configuration across development, CI, and production environments while preventing hardcoded secrets, supporting team-wide defaults with project-specific overrides, and providing type-safe access through dependency injection.

### Key Insights
1. **Seven-phase loading pipeline**: Secrets → YAML sources → Pre-extract lists → Deep merge → Post-inject lists → Placeholder expansion → Typed object creation
2. **Security-first design**: Literal secret detection rejects `sk-*` prefixes; `${VAR}` placeholders mandatory for sensitive values
3. **Typed object registry pattern**: `config.require(ConfigType)` provides type-safe access, not string-key lookups

### Quick Stats
- **Components**: 8 core modules in fs2/config/
- **Config Objects**: 13+ typed Pydantic models (AzureOpenAIConfig, ScanConfig, LLMConfig, etc.)
- **Dependencies**: Pydantic 2.0+, PyYAML, python-dotenv, pathlib
- **Test Coverage**: Comprehensive with contract tests, DI integration tests, fixture patterns
- **Prior Learnings**: 15 relevant findings from Chainglass existing architecture

---

## How It Currently Works (fs2 Reference)

### Entry Points
| Entry Point | Type | Location | Purpose |
|------------|------|----------|---------|
| `FS2ConfigurationService()` | Constructor | `config/service.py:147` | Initialize and load all config sources |
| `config.require(Type)` | Method | `config/service.py:136` | Type-safe config retrieval (raises if missing) |
| `config.get(Type)` | Method | `config/service.py:128` | Optional config retrieval (returns None) |
| `config.set(instance)` | Method | `config/service.py:120` | Store typed config object |

### Core Execution Flow

**Phase 1: Load Secrets into Environment**
```python
def load_secrets_to_env() -> None:
    """Load secrets files into os.environ (lowest → highest priority)."""
    # 1. User secrets (~/.config/fs2/secrets.env)
    user_secrets = get_user_config_dir() / "secrets.env"
    if user_secrets.exists():
        load_dotenv(user_secrets, override=True)

    # 2. Project secrets (./.fs2/secrets.env)
    project_secrets = get_project_config_dir() / "secrets.env"
    if project_secrets.exists():
        load_dotenv(project_secrets, override=True)

    # 3. Working dir .env (./.env - HIGHEST PRIORITY)
    dotenv_file = Path.cwd() / ".env"
    if dotenv_file.exists():
        load_dotenv(dotenv_file, override=True)
```

**Phase 2-4: Load and Merge YAML Sources**
```python
# Phase 2: Load raw config dicts
user_raw = load_yaml_config(get_user_config_dir() / "config.yaml")
project_raw = load_yaml_config(get_project_config_dir() / "config.yaml")
env_raw = parse_env_vars()  # FS2_* → nested dict

# Phase 4: Deep merge (user → project → env wins)
raw_config = deep_merge(deep_merge({}, user_raw), project_raw)
raw_config = deep_merge(raw_config, env_raw)
```

**Phase 5-7: Expand Placeholders and Create Objects**
```python
# Phase 6: Expand ${VAR} placeholders
expand_placeholders(raw_config)

# Phase 7: Create typed objects
for config_type in YAML_CONFIG_TYPES:
    path = config_type.__config_path__
    if path and _get_nested_value(raw_config, path):
        obj = config_type.model_validate(_get_nested_value(raw_config, path))
        self.set(obj)
```

### Data Flow
```
┌─────────────────────────────────────────────────────────────────┐
│                    Configuration Loading Pipeline                │
└─────────────────────────────────────────────────────────────────┘
                              │
    ┌─────────────────────────┼─────────────────────────┐
    ▼                         ▼                         ▼
┌────────────┐         ┌────────────┐         ┌────────────────┐
│ User       │         │ Project    │         │ Environment    │
│ ~/.config/ │         │ .fs2/      │         │ FS2_*          │
│ fs2/       │         │            │         │ Variables      │
├────────────┤         ├────────────┤         ├────────────────┤
│ config.yaml│         │ config.yaml│         │ Parsed to      │
│ secrets.env│         │ secrets.env│         │ nested dict    │
└─────┬──────┘         └─────┬──────┘         └───────┬────────┘
      │                      │                        │
      └──────────────────────┼────────────────────────┘
                             ▼
                    ┌────────────────┐
                    │   Deep Merge   │
                    │ (env wins)     │
                    └───────┬────────┘
                            ▼
                    ┌────────────────┐
                    │   Expand       │
                    │   ${VAR}       │
                    └───────┬────────┘
                            ▼
                    ┌────────────────┐
                    │ Pydantic       │
                    │ Validation     │
                    └───────┬────────┘
                            ▼
                    ┌────────────────┐
                    │ Typed Object   │
                    │ Registry       │
                    └────────────────┘
```

### Precedence Order (Highest → Lowest)
1. **Environment Variables** (`FS2_SECTION__FIELD=value`)
2. **Project YAML** (`./.fs2/config.yaml`)
3. **User YAML** (`~/.config/fs2/config.yaml`)
4. **Pydantic Defaults** (in model definitions)

**For Secrets** (loaded first, highest → lowest):
1. `./.env` (working directory)
2. `./.fs2/secrets.env` (project)
3. `~/.config/fs2/secrets.env` (user)

---

## Architecture & Design

### Component Map

```
fs2/config/
├── service.py          # ConfigurationService ABC + implementations
│   ├── ConfigurationService (ABC)
│   ├── FS2ConfigurationService (production)
│   └── FakeConfigurationService (testing)
├── objects.py          # Typed config models (Pydantic)
│   ├── AzureOpenAIConfig (__config_path__ = "azure.openai")
│   ├── ScanConfig (__config_path__ = "scan")
│   ├── LLMConfig (__config_path__ = "llm")
│   ├── EmbeddingConfig (__config_path__ = "embedding")
│   └── YAML_CONFIG_TYPES registry
├── loaders.py          # Loading utilities
│   ├── load_yaml_config()
│   ├── load_secrets_to_env()
│   ├── parse_env_vars()
│   ├── deep_merge()
│   └── expand_placeholders()
├── paths.py            # XDG path resolution
│   ├── get_user_config_dir()
│   └── get_project_config_dir()
└── exceptions.py       # Custom errors
    ├── ConfigurationError
    ├── MissingConfigurationError
    └── LiteralSecretError
```

### Design Patterns Identified

| Pattern | Where Used | Purpose |
|---------|-----------|---------|
| **Abstract Factory** | ConfigurationService ABC | Swap production/test implementations |
| **Typed Object Registry** | `config.require(Type)` | Type-safe access without string keys |
| **Builder** | 7-phase loading pipeline | Construct config incrementally |
| **Deep Merge** | `deep_merge()` | Compose partial configs from multiple sources |
| **Placeholder Expansion** | `${VAR}` syntax | Defer secret resolution to runtime |
| **Field Validator** | Pydantic `@field_validator` | Constraint checking per field |
| **Model Validator** | Pydantic `@model_validator` | Cross-field validation |

### Environment Variable Convention

```
FS2_{SECTION}__{SUBSECTION}__{FIELD}=value
    ↓
{"section": {"subsection": {"field": "value"}}}
```

**Examples**:
- `FS2_AZURE__OPENAI__TIMEOUT=120` → `azure.openai.timeout: 120`
- `FS2_SCAN__MAX_FILE_SIZE_KB=1000` → `scan.max_file_size_kb: 1000`
- `FS2_LLM__PROVIDER=azure` → `llm.provider: azure`

**For Chainglass**: Use `CG_` prefix with same `__` nesting convention.

---

## Configuration Object Schema

### Base Pattern
```python
from typing import ClassVar
from pydantic import BaseModel, field_validator

class SampleConfig(BaseModel):
    """Configuration for sample feature."""
    __config_path__: ClassVar[str] = "sample"  # YAML location

    enabled: bool = True
    timeout: int = 30
    api_key: str | None = None

    @field_validator("timeout")
    @classmethod
    def validate_timeout(cls, v: int) -> int:
        if v < 1 or v > 300:
            raise ValueError("Timeout must be 1-300 seconds")
        return v
```

### Key Config Objects in fs2

| Object | Path | Key Fields |
|--------|------|------------|
| `AzureOpenAIConfig` | `azure.openai` | endpoint, api_key, api_version, timeout |
| `ScanConfig` | `scan` | scan_paths, max_file_size_kb, respect_gitignore |
| `LLMConfig` | `llm` | provider, api_key, model, temperature, max_tokens |
| `EmbeddingConfig` | `embedding` | provider, model, batch_size |
| `SearchConfig` | `search` | default_limit, min_score |
| `GraphConfig` | `graph` | graph_path |
| `OtherGraphsConfig` | `other_graphs` | graphs (list with concatenation) |

### Registry Pattern
```python
YAML_CONFIG_TYPES: list[type[BaseModel]] = [
    AzureOpenAIConfig,
    ScanConfig,
    LLMConfig,
    EmbeddingConfig,
    SearchConfig,
    GraphConfig,
    OtherGraphsConfig,
    # ... all auto-loaded configs
]
```

---

## Quality & Testing

### Test Patterns from fs2

1. **Contract Tests**: Run same assertions against both FakeConfigService and real implementation
2. **DI Integration Tests**: Verify container wiring for production vs test
3. **Vitest Fixtures**: Auto-inject container and fakes into tests
4. **Environment Mocking**: Use factory pattern, not mocks

### FakeConfigurationService Pattern
```python
class FakeConfigurationService(ConfigurationService):
    def __init__(self, *configs: BaseModel) -> None:
        """Initialize with pre-set configs for testing."""
        self._configs: dict[type, BaseModel] = {}
        for config in configs:
            self.set(config)
```

**Usage in Tests**:
```python
def test_azure_adapter():
    config = FakeConfigurationService(
        AzureOpenAIConfig(endpoint="https://test.com", api_key="test-key")
    )
    adapter = AzureAdapter(config)
    # Test adapter behavior
```

---

## Prior Learnings from Chainglass

### PL-01: Clean Architecture Foundation
Chainglass already uses Clean Architecture with strict DI. Configuration interfaces belong in `@chainglass/shared/interfaces/`, adapters implement them.

### PL-02: TSyringe Factory Pattern
DI uses `useFactory` (not decorators) for React Server Component compatibility. Same pattern applies to config service registration.

### PL-03: Interface-First TDD
Established pattern: Interface → Fake → Test → Real adapter. Follow for config system.

### PL-04: Fakes Over Mocks
Use `FakeConfigService` implementing `IConfigService`, not `vi.mock()`.

### PL-05: Logger Interface Precedent
`ILogger` with `LogLevel` enum is proven pattern. `IConfigService` should follow similar structure.

### PL-06: MCP Tool Patterns (ADR-0001)
Config exposed via MCP must use snake_case, 3-4 sentence descriptions, semantic JSON responses.

### PL-07: CLI Command Structure
CLI uses Commander.js. Config commands: `cg config get`, `cg config set`, `cg config validate`.

---

## Modification Considerations

### Safe to Implement First
1. **Path resolution** (`get_user_config_dir`, `get_project_config_dir`)
2. **YAML loading** (`load_yaml_config`)
3. **Deep merge** utility
4. **Config object models** (Pydantic)

### Implement with Caution
1. **Environment variable parsing** (edge cases with nested keys)
2. **Placeholder expansion** (handle missing vars gracefully)
3. **List concatenation** (deduplication logic)

### Design Decisions Needed
1. **TypeScript vs Python**: Chainglass is TypeScript; need equivalent patterns
2. **Pydantic equivalent**: Zod for validation? io-ts? Custom classes?
3. **dotenv library**: Which Node.js library for .env parsing?

---

## Additional Concepts to Consider

Based on research, these fs2 features may be valuable for Chainglass:

### 1. List Concatenation for Multi-Source Configs
fs2 has special handling for `other_graphs.graphs` where user and project lists are concatenated (not replaced) with deduplication by `name` field. Useful for:
- Multiple API endpoints
- Plugin/extension lists
- Feature flag collections

### 2. Literal Secret Detection
fs2 rejects values starting with `sk-` (OpenAI keys) to prevent accidental commits. Consider:
- `sk-*` for OpenAI
- `ghp_*` for GitHub tokens
- `xoxb-*` for Slack tokens
- Custom patterns per integration

### 3. XDG Base Directory Compliance
fs2 respects `$XDG_CONFIG_HOME` for Linux/Unix portability. Consider:
- macOS: `~/Library/Application Support/chainglass`
- Linux: `$XDG_CONFIG_HOME/chainglass` or `~/.config/chainglass`
- Windows: `%APPDATA%\chainglass`

### 4. Multi-Graph/Multi-Project Support
fs2 can query external codebases via configured graph references. Consider:
- Shared configuration across projects
- Cross-project references

### 5. Content-Aware Chunking Strategies
fs2 uses different embedding chunk sizes for code vs documentation. Consider:
- Different validation rules per config section
- Different merge strategies per section

### 6. Incremental Updates with Hash Comparison
fs2 preserves embeddings for unchanged content. Consider:
- Config caching with change detection
- Only reload changed sections

### 7. Provider-Agnostic Abstractions
fs2 abstracts LLM/embedding providers. Consider:
- Multiple data source types
- Pluggable service backends

### 8. Environment Variable Allowlisting for Child Processes
fs2 allowlists safe env vars when spawning child processes. Consider:
- What env vars should web server see?
- What env vars should MCP server see?

---

## Recommended Chainglass Config Structure

### File Locations
```
~/.config/chainglass/           # User-level (XDG)
├── config.yaml                 # User defaults
└── secrets.env                 # User secrets

<project-root>/.chainglass/     # Project-level (git-style discovery)
├── config.yaml                 # Project overrides
└── secrets.env                 # Project secrets

<cwd>/.env                      # Working dir secrets (highest priority)
```

**Project Config Discovery**: Walks up from CWD until finding `.chainglass/` directory or reaching filesystem root (like git finds `.git/`). This allows running CLI from any subdirectory within a project.

### Environment Variable Convention
```
CG_{SECTION}__{FIELD}=value
```

### Sample config.yaml
```yaml
# ~/.config/chainglass/config.yaml (user defaults)
sample:
  enabled: true
  timeout: 30
  name: default

logging:
  level: info
  format: json
```

```yaml
# .chainglass/config.yaml (project overrides)
sample:
  name: my-project
  api_key: ${SAMPLE_API_KEY}
```

### TypeScript Interface
```typescript
// @chainglass/shared/interfaces/config.interface.ts
export interface IConfigService {
  get<T extends ConfigObject>(type: ConfigType<T>): T | undefined;
  require<T extends ConfigObject>(type: ConfigType<T>): T;
  set<T extends ConfigObject>(config: T): void;
}

// Exemplar config object - application-specific configs will follow this pattern
export interface SampleConfig {
  __configPath: 'sample';
  enabled: boolean;
  timeout: number;
  name: string;
  apiKey?: string;
}
```

---

## External Research Opportunities

### Research Opportunity 1: TypeScript Configuration Libraries

**Why Needed**: fs2 uses Pydantic (Python) for typed config validation. Need TypeScript equivalent.

**Ready-to-use prompt:**
```
/deepresearch "Compare TypeScript configuration validation libraries (Zod, io-ts, Yup, AJV, class-validator) for:
1. Type inference from schemas
2. Environment variable coercion
3. Nested object validation
4. Custom validators
5. Error message quality
6. Bundle size
7. Integration with dotenv

Context: Building a multi-source config system similar to Pydantic BaseSettings for a Node.js/TypeScript monorepo with CLI, web app, and MCP server components."
```

**Results location**: `docs/plans/004-config/external-research/typescript-config-libraries.md`

### Research Opportunity 2: Cross-Platform Config Paths

**Why Needed**: fs2 uses XDG spec (Linux-focused). Need cross-platform solution.

**Ready-to-use prompt:**
```
/deepresearch "Best practices for cross-platform configuration file locations in Node.js/TypeScript applications:
1. XDG Base Directory spec on Linux
2. macOS Application Support directory
3. Windows %APPDATA% conventions
4. Node.js libraries for platform-aware paths (env-paths, platform-folders, etc.)
5. How popular tools (VS Code, npm, pnpm) handle this

Context: Building a CLI tool and config system that needs to work on macOS, Linux, and Windows with consistent user experience."
```

**Results location**: `docs/plans/004-config/external-research/cross-platform-paths.md`

### Research Opportunity 3: Secret Management in Node.js

**Why Needed**: Need secure secret handling patterns for TypeScript.

**Ready-to-use prompt:**
```
/deepresearch "Secret management best practices for Node.js/TypeScript CLI tools and web applications:
1. dotenv vs dotenv-expand vs dotenv-flow
2. Secret detection patterns (preventing hardcoded keys)
3. Vault integration patterns
4. 1Password CLI / Bitwarden CLI integration
5. CI/CD secret injection patterns
6. Runtime secret rotation

Context: Building a config system that loads secrets from .env files with ${VAR} expansion, needs to detect accidentally hardcoded secrets, and may integrate with secret managers."
```

**Results location**: `docs/plans/004-config/external-research/nodejs-secrets.md`

---

## Next Steps

1. **Optional External Research**: Run `/deepresearch` prompts above for TypeScript-specific guidance
2. **Create Specification**: Run `/plan-1b-specify "Implement Chainglass configuration system"` to create feature spec
3. **Architecture Phase**: Design TypeScript implementation matching fs2 patterns

---

**Research Complete**: 2026-01-21
**Report Location**: /Users/jordanknight/substrate/chainglass/docs/plans/004-config/research-dossier.md
