---
title: "ADR-0004: Dependency Injection Container Architecture"
status: "Accepted"
date: "2026-01-23"
authors: "Chainglass Team"
tags: ["architecture", "decision", "dependency-injection", "tsyringe", "containers", "testing"]
supersedes: ""
superseded_by: ""
---

# ADR-0004: Dependency Injection Container Architecture

## Status

**Accepted**

## Context

Chainglass is a multi-package monorepo with distinct entry points (CLI, Web application, MCP server) that share common services (workflow operations, configuration, logging). Each entry point has unique requirements:

- **CLI**: Executes workflow commands (`cg wf compose`, `cg phase prepare`)
- **Web**: Next.js application with React Server Component constraints
- **MCP Server**: Model Context Protocol server requiring stdout reserved for JSON-RPC (logging to stderr only)

The codebase requires dependency injection to enable:
1. **Testability**: Swap real adapters with fakes without mocking libraries
2. **Configuration**: Pre-load configuration before service instantiation
3. **Isolation**: Fresh container per test to prevent state leakage
4. **Flexibility**: Different adapters for different environments (e.g., stderr logger for MCP)

Key constraints discovered during implementation:
- TSyringe's `@injectable()` decorators do not survive React Server Component compilation
- Configuration must load synchronously before container creation (fail-fast pattern)
- MCP server requires `PinoLoggerAdapter.createForStderr()` while other entry points use standard stdout
- Test isolation requires child containers, not global singletons

The codebase currently has **three independent DI containers** (Workflow, MCP, Web) that do not compose, and **critical violations in CLI commands** where services are directly instantiated bypassing DI entirely (marked as TODO).

## Decision

We adopt a **Parent-Child Container Hierarchy** pattern using TSyringe's native `createChildContainer()` API:

1. **Decorator-Free Registration**: All service registrations use `useFactory` pattern, never `useClass` with decorators
2. **Token Constants**: Type-safe string tokens defined per package (`SHARED_DI_TOKENS`, `WORKFLOW_DI_TOKENS`, `MCP_DI_TOKENS`)
3. **Container Ownership**: Each package owns its container factory (`createXxxProductionContainer`, `createXxxTestContainer`)
4. **Parent-Child Composition**: Shared services register in a root container; package-specific containers inherit via `createChildContainer()`
5. **Config Pre-Loading**: Configuration must be loaded and validated before passing to container factories
6. **Test Isolation**: Each test creates a fresh child container; no global container state
7. **No Direct Instantiation**: Services MUST be resolved from containers, never instantiated directly in command handlers

### Container Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                    Root Container                            │
│  (Shared: IConfigService, ILogger, IFileSystem,             │
│   IPathResolver, IOutputAdapter)                            │
│                                                              │
│  ┌─────────────────┐ ┌─────────────────┐ ┌───────────────┐  │
│  │  CLI Container  │ │  MCP Container  │ │ Web Container │  │
│  │  (WorkflowSvc,  │ │  (Stderr Logger │ │ (SampleSvc,   │  │
│  │   PhaseSvc)     │ │   override)     │ │  WebSvc)      │  │
│  └─────────────────┘ └─────────────────┘ └───────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Registration Pattern

```typescript
// Root container with shared services
export function createSharedRootContainer(config: IConfigService): DependencyContainer {
  const root = container.createChildContainer();

  root.register<IConfigService>(SHARED_DI_TOKENS.CONFIG, { useValue: config });
  root.register<ILogger>(SHARED_DI_TOKENS.LOGGER, {
    useFactory: () => new PinoLoggerAdapter(),
  });
  root.register<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM, {
    useFactory: () => new NodeFileSystemAdapter(),
  });

  return root;
}

// Package-specific child container
export function createCliContainer(root: DependencyContainer): DependencyContainer {
  const cli = root.createChildContainer();

  cli.register<IWorkflowService>(WORKFLOW_DI_TOKENS.WORKFLOW_SERVICE, {
    useFactory: (c) => new WorkflowService(
      c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM),
      c.resolve<IYamlParser>(WORKFLOW_DI_TOKENS.YAML_PARSER),
      c.resolve<ISchemaValidator>(WORKFLOW_DI_TOKENS.SCHEMA_VALIDATOR),
      c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER)
    ),
  });

  return cli;
}
```

### Resolution Pattern (Mandatory)

```typescript
// ✅ CORRECT - Resolve from container
async function handleCompose(slug: string, options: ComposeOptions): Promise<void> {
  const container = getCliContainer();
  const service = container.resolve<IWorkflowService>(WORKFLOW_DI_TOKENS.WORKFLOW_SERVICE);
  const result = await service.compose(slug, options.runsDir);
}

// ❌ WRONG - Direct instantiation (bypasses DI)
async function handleCompose(slug: string, options: ComposeOptions): Promise<void> {
  const service = new WorkflowService(
    new NodeFileSystemAdapter(),
    new YamlParserAdapter(),
    // ... direct instantiation
  );
}
```

## Consequences

### Positive

- **POS-001**: Testability without mocks - Fakes are injected via container, enabling deterministic tests without `vi.mock()` or similar libraries
- **POS-002**: RSC compatibility - `useFactory` pattern survives React Server Component compilation where `@injectable()` decorators fail
- **POS-003**: Explicit dependencies - All service dependencies are visible in factory functions, improving code comprehension
- **POS-004**: Configuration fail-fast - Pre-loaded config validation catches errors at startup, not during request handling
- **POS-005**: MCP STDIO compliance - Stderr logger can be explicitly registered in MCP child container without affecting other entry points
- **POS-006**: Test isolation guaranteed - Child containers per test prevent singleton pollution across test runs

### Negative

- **NEG-001**: Boilerplate overhead - Each service requires explicit factory registration (~5-10 lines per service)
- **NEG-002**: Two-step container setup - Parent container must be created before child containers, requiring coordination at bootstrap
- **NEG-003**: Token duplication - Similar tokens exist across packages (e.g., `SHARED_DI_TOKENS.LOGGER` vs `MCP_DI_TOKENS.LOGGER`)
- **NEG-004**: Learning curve - Developers unfamiliar with TSyringe child containers need onboarding
- **NEG-005**: Remediation required - Existing direct instantiation in CLI (wf.command.ts, phase.command.ts) must be migrated to container resolution

## Alternatives Considered

### Alternative 1: Single Global Container

- **ALT-001**: **Description**: One TSyringe root container for all packages (CLI, Web, MCP). All services registered at application startup into a shared global container.
- **ALT-002**: **Rejection Reason**: Violates package boundaries established in architecture. Creates tight coupling between packages. MCP's stderr logger requirement becomes implicit rather than explicit. Test isolation requires careful global state management.

### Alternative 2: Container Merging at Runtime

- **ALT-003**: **Description**: Each package exports a registration function that accepts a container and registers its services. Bootstrap calls all registration functions sequentially to merge into one container.
- **ALT-004**: **Rejection Reason**: Registration order becomes implicit dependency. Larger single container with all services. Package independence reduced. Works for CLI but poorly for independent Web/MCP deployment.

### Alternative 3: Service Locator Pattern

- **ALT-005**: **Description**: Lightweight singleton registry where packages register factories. CLI queries registry instead of instantiating directly.
- **ALT-006**: **Rejection Reason**: Anti-pattern that hides dependencies. Stringly-typed lookups lose type safety. Testing requires global mocking. Defeats explicit DI purpose. Architectural regression.

### Alternative 4: Event-Driven Container Initialization

- **ALT-007**: **Description**: Packages emit initialization events; central orchestrator coordinates DI setup. Supports async initialization and late-binding.
- **ALT-008**: **Rejection Reason**: Over-engineered for synchronous CLI bootstrap. Event indirection complicates debugging. Race conditions possible with async initialization. Complexity without proportional benefit.

## Implementation Notes

- **IMP-001**: **Remediation Protocol** - When encountering direct instantiation patterns (e.g., `new WorkflowService(...)`), do not silently fix. Walk through with user to ensure understanding, then migrate to container resolution. Document in Discoveries & Learnings.
- **IMP-002**: **Container Bootstrap Sequence** - (1) Load config synchronously, (2) Validate config.isLoaded(), (3) Create root container with config, (4) Create package-specific child containers, (5) Resolve services from children.
- **IMP-003**: **MCP Special Case** - MCP child container MUST override `SHARED_DI_TOKENS.LOGGER` with `PinoLoggerAdapter.createForStderr()` to preserve stdout for JSON-RPC protocol.
- **IMP-004**: **Test Container Pattern** - Test files use `createXxxTestContainer()` which registers fakes. Each test creates fresh child via `beforeEach`. Never share container instances across tests.
- **IMP-005**: **Known Violations** - CLI commands (`apps/cli/src/commands/wf.command.ts:41-47`, `phase.command.ts:61-66`) currently bypass DI with direct instantiation. Marked as TODO (T010). Must be remediated per IMP-001.
- **IMP-006**: **Token Naming Convention** - Tokens use interface name as value: `{ LOGGER: 'ILogger', FILESYSTEM: 'IFileSystem' }`. Package-specific tokens prefixed: `WORKFLOW_DI_TOKENS`, `MCP_DI_TOKENS`.

## References

- **REF-001**: [Architecture Rules - DI Container Usage](../rules/architecture.md#5-di-container-usage)
- **REF-002**: [ADR-0003: Configuration System Architecture](./adr-0003-configuration-system.md) - Config pre-loading pattern
- **REF-003**: [TSyringe Documentation](https://github.com/microsoft/tsyringe) - Child container API
- **REF-004**: [Phase 1 Tasks - DI Infrastructure](../plans/003-wf-basics/tasks/phase-1-core-infrastructure/tasks.md) - Original DI token and container implementation (T017, T018)
- **REF-005**: [Critical Discovery 02](../plans/001-project-setup/implementation-discoveries.md) - Decorator-free pattern for RSC
- **REF-006**: [Critical Discovery 04](../plans/001-project-setup/implementation-discoveries.md) - Child container pattern for test isolation
