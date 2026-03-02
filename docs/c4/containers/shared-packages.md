# Level 2 Detail: Shared Packages

> Cross-cutting types, interfaces, fakes, and adapters shared by all Chainglass consumers.

```mermaid
C4Component
    title Component diagram — Shared Packages (packages/shared)

    Container_Boundary(shared, "Shared Packages (@chainglass/shared)") {

        Boundary(ifaces, "Interfaces") {
            Component(iLogger, "ILogger", "Interface", "Structured logging contract<br/>with child logger support")
            Component(iFileSystem, "IFileSystem", "Interface", "Filesystem abstraction<br/>read, write, stat, list")
            Component(iPathResolver, "IPathResolver", "Interface", "Secure path resolution<br/>within workspace boundaries")
            Component(iConfig, "IConfigService", "Interface", "Configuration loading<br/>and validation")
            Component(iYaml, "IYamlParser", "Interface", "YAML parsing with<br/>structured error results")
            Component(iState, "IStateService", "Interface", "Global state pub/sub<br/>service contract")
            Component(viewerFile, "ViewerFile", "Type", "Shared file structure:<br/>path, filename, content")
            Component(diffTypes, "DiffError, DiffResult", "Types", "Diff operation<br/>result types")
            Component(sdkTypes, "SDKCommand, SDKSetting", "Types", "SDK registration<br/>contracts")
            Component(results, "Result Types", "Types", "BaseResult, PrepareResult,<br/>ValidateResult, FinalizeResult")
        }

        Boundary(fakes, "Fakes (Test Doubles)") {
            Component(fakeLogger, "FakeLogger", "Fake", "In-memory logger<br/>with assertion helpers")
            Component(fakeConfig, "FakeConfigService", "Fake", "Configurable test<br/>config provider")
            Component(fakeFS, "FakeFileSystem", "Fake", "In-memory filesystem<br/>for unit tests")
        }

        Boundary(adapters, "Adapters") {
            Component(pinoAdapter, "PinoLoggerAdapter", "Adapter", "Production logger<br/>via Pino")
            Component(configAdapter, "ChainglassConfigService", "Adapter", "Reads chainglass.yaml<br/>configuration files")
        }
    }
```

## Package Exports

| Category | Key Exports | Consumers |
|----------|------------|-----------|
| **Interfaces** | ILogger, IFileSystem, IPathResolver, IConfigService, IYamlParser, IStateService | apps/web, apps/cli, packages/mcp-server |
| **Types** | ViewerFile, DiffError, SDKCommand, Result types | apps/web (viewers, SDK), apps/cli (workflow output) |
| **Fakes** | FakeLogger, FakeConfigService, FakeFileSystem | test/ (all test suites) |
| **Adapters** | PinoLoggerAdapter, ChainglassConfigService | apps/web (DI container), apps/cli (bootstrap) |

## Design Principle

> **Shared by Default** (Constitution P7): Code belongs in `@chainglass/shared` unless it is app-specific. Interfaces, fakes, adapters go here. App-specific adapters (rare) go in `apps/web/` or `apps/cli/`.

---

## Navigation

- **Zoom Out**: [Container Overview](overview.md) | [System Context](../system-context.md)
- **Hub**: [C4 Overview](../README.md)
