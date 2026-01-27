---
title: "ADR-0008: Module Registration Function Pattern"
status: "Accepted"
date: "2026-01-28"
authors: "Chainglass Team"
tags: ["architecture", "decision", "dependency-injection", "tsyringe", "modules", "composition"]
supersedes: ""
superseded_by: ""
---

# ADR-0008: Module Registration Function Pattern

## Status

**Accepted**

## Context

ADR-0004 established the Parent-Child Container Hierarchy pattern for dependency injection. However, as the codebase grew to include multiple packages (workflow, workgraph, mcp-server) consumed by multiple entry points (CLI, Web, MCP), a problem emerged:

**DI registration duplication across entry points.**

Current state analysis revealed:
- CLI container (`apps/cli/src/lib/container.ts`) - 251 lines of registrations
- Workflow container (`packages/workflow/src/container.ts`) - 215 lines
- WorkGraph container (`packages/workgraph/src/container.ts`) - 170 lines
- Web container (`apps/web/src/lib/di-container.ts`) - Similar registrations
- MCP container (`packages/mcp-server/src/lib/di-container.ts`) - Similar registrations

**Specific duplications identified:**
- `IFileSystem`, `IPathResolver`, `IYamlParser`, `ISchemaValidator` registered in CLI, Workflow, AND WorkGraph
- `ILogger`, `IConfigService` registered in CLI, Web, AND MCP
- `AgentService` registration duplicated between CLI and Web with nearly identical factory logic

Each package currently exports its own `createXxxProductionContainer()` factory that creates from the root TSyringe container. When CLI needs WorkGraph services, it cannot simply resolve them—the WorkGraph container has no access to CLI's shared dependencies (YAML_PARSER, FILESYSTEM, etc.).

**The gap**: Packages cannot easily contribute their services to a consumer's container without the consumer duplicating registration logic or creating nested container hierarchies.

## Decision

We adopt the **Module Registration Function Pattern** as an extension to ADR-0004.

Each package that provides services for external consumption exports a registration function:

```typescript
// packages/workgraph/src/container.ts
export function registerWorkgraphServices(container: DependencyContainer): void {
  // Register WorkUnit service
  container.register<IWorkUnitService>(WORKGRAPH_DI_TOKENS.WORKUNIT_SERVICE, {
    useFactory: (c: DependencyContainer) => {
      const fs = c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
      const pathResolver = c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
      const yamlParser = c.resolve<IYamlParser>(SHARED_DI_TOKENS.YAML_PARSER);
      return new WorkUnitService(fs, pathResolver, yamlParser);
    },
  });

  // Register WorkGraph service (depends on WorkUnit)
  container.register<IWorkGraphService>(WORKGRAPH_DI_TOKENS.WORKGRAPH_SERVICE, {
    useFactory: (c: DependencyContainer) => {
      const fs = c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
      const pathResolver = c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
      const yamlParser = c.resolve<IYamlParser>(SHARED_DI_TOKENS.YAML_PARSER);
      const workUnitService = c.resolve<IWorkUnitService>(WORKGRAPH_DI_TOKENS.WORKUNIT_SERVICE);
      return new WorkGraphService(fs, pathResolver, yamlParser, workUnitService);
    },
  });

  // Register WorkNode service (depends on WorkGraph and WorkUnit)
  container.register<IWorkNodeService>(WORKGRAPH_DI_TOKENS.WORKNODE_SERVICE, {
    useFactory: (c: DependencyContainer) => {
      const fs = c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
      const pathResolver = c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
      const workGraphService = c.resolve<IWorkGraphService>(WORKGRAPH_DI_TOKENS.WORKGRAPH_SERVICE);
      const workUnitService = c.resolve<IWorkUnitService>(WORKGRAPH_DI_TOKENS.WORKUNIT_SERVICE);
      return new WorkNodeService(fs, pathResolver, workGraphService, workUnitService);
    },
  });
}
```

Consumers call the registration function to add module services to their container:

```typescript
// apps/cli/src/lib/container.ts
import { registerWorkgraphServices } from '@chainglass/workgraph';
import { registerWorkflowServices } from '@chainglass/workflow';

export function createCliProductionContainer(): DependencyContainer {
  const childContainer = container.createChildContainer();

  // Register shared infrastructure first
  childContainer.register<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM, {
    useFactory: () => new NodeFileSystemAdapter(),
  });
  childContainer.register<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER, {
    useFactory: () => new PathResolverAdapter(),
  });
  childContainer.register<IYamlParser>(SHARED_DI_TOKENS.YAML_PARSER, {
    useFactory: () => new YamlParserAdapter(),
  });
  // ... other shared registrations ...

  // Add module services (packages contribute their registrations)
  registerWorkflowServices(childContainer);
  registerWorkgraphServices(childContainer);

  // CLI-specific registrations
  childContainer.register<IOutputAdapter>(CLI_DI_TOKENS.OUTPUT_ADAPTER_CONSOLE, {
    useFactory: () => new ConsoleOutputAdapter(),
  });

  return childContainer;
}
```

### Key Principles

1. **Packages export registration functions, not just container factories**
2. **Consumer controls registration order** (shared deps before module deps)
3. **Consumer controls which modules to include** (opt-in, not all-or-nothing)
4. **Single container hierarchy preserved** (no nested containers)
5. **Existing `createXxxProductionContainer()` factories remain** for standalone use
6. **Test containers follow same pattern** with `registerWorkgraphTestServices(container)`

## Consequences

### Positive

- **POS-001**: Eliminates registration duplication. Shared dependency registrations (FILESYSTEM, YAML_PARSER, etc.) happen once in consumer; module registration functions reuse them via `c.resolve()`.
- **POS-002**: Packages encapsulate their DI knowledge. CLI doesn't need to know WorkGraph's internal service dependencies—just call `registerWorkgraphServices(container)`.
- **POS-003**: Explicit opt-in composition. Consumer clearly sees which modules are included. Adding a new module is one function call, not copying 50 lines of registration code.
- **POS-004**: Maintains ADR-0004 compliance. Still uses `useFactory`, child containers, and token constants. No decorators, no global state.
- **POS-005**: Supports all entry points. CLI, Web, and MCP can each choose which modules to include based on their needs.
- **POS-006**: Preserves test isolation. Test containers use `registerWorkgraphTestServices()` which registers fakes, maintaining the child-container-per-test pattern.

### Negative

- **NEG-001**: Registration order matters. Consumer must register shared dependencies before calling module registration functions. Wrong order causes runtime resolution failures.
- **NEG-002**: Implicit dependency contract. Module registration functions assume certain tokens are pre-registered (FILESYSTEM, YAML_PARSER). This is documented but not enforced at compile time.
- **NEG-003**: Two patterns coexist. Packages now export both `createXxxProductionContainer()` (for standalone use) and `registerXxxServices()` (for composition). Developers must understand when to use which.
- **NEG-004**: Potential token conflicts. If two modules register the same token, last registration wins silently. Must maintain clear token namespacing per ADR-0004.

## Alternatives Considered

### Alternative 1: Global Container Merging (ADR-0004 ALT-003)

- **ALT-001**: **Description**: Bootstrap calls ALL registration functions sequentially into a single global container. Every module always registered.
- **ALT-002**: **Rejection Reason**: ADR-0004 rejected this: "Registration order becomes implicit dependency. Package independence reduced. Works for CLI but poorly for independent Web/MCP deployment." Our pattern differs by making registration selective and explicit per consumer.

### Alternative 2: Nested Container Hierarchy

- **ALT-003**: **Description**: WorkGraph creates child container from CLI container: `createWorkgraphProductionContainer(cliContainer)`. Services registered in nested children.
- **ALT-004**: **Rejection Reason**: Creates complex resolution chains. Debugging which container owns a service becomes difficult. Violates ADR-0004's flat hierarchy preference. Parent container modifications don't automatically flow to deeply nested children.

### Alternative 3: Service Locator Pattern

- **ALT-005**: **Description**: Global singleton registry where packages register factories. Components query registry directly instead of using containers.
- **ALT-006**: **Rejection Reason**: ADR-0004 explicitly rejected: "Anti-pattern that hides dependencies. Stringly-typed lookups lose type safety. Testing requires global mocking. Defeats explicit DI purpose."

### Alternative 4: Keep Current Duplication

- **ALT-007**: **Description**: Maintain separate container factories per package. Accept duplication as the cost of package independence.
- **ALT-008**: **Rejection Reason**: As the codebase grows (workgraph, analytics, etc.), duplication compounds. Each new module requires duplicating shared registrations in every consumer. Not sustainable for 5+ packages.

## Implementation Notes

- **IMP-001**: **Migration Strategy**: Add `registerXxxServices()` functions alongside existing `createXxxProductionContainer()` factories. Existing code continues working. Migrate consumers incrementally.
- **IMP-002**: **Prerequisite Documentation**: Each registration function must document its prerequisite tokens in JSDoc. Example: `@requires SHARED_DI_TOKENS.FILESYSTEM, SHARED_DI_TOKENS.YAML_PARSER`.
- **IMP-003**: **Test Registration Functions**: Export `registerXxxTestServices(container)` that registers fakes. Consumer test containers call this instead of production version.
- **IMP-004**: **Index Exports**: Add registration functions to package index.ts exports alongside existing container factories.
- **IMP-005**: **Validation Helper** (optional): Consider a debug-mode helper that validates prerequisite tokens are registered before module registration runs. Throws descriptive error if missing.

## References

- **REF-001**: [ADR-0004: Dependency Injection Container Architecture](./adr-0004-dependency-injection-container-architecture.md) - Parent ADR this extends
- **REF-002**: [Phase 6 Tasks - DYK#1](../plans/016-agent-units/tasks/phase-6-cli-integration/tasks.md) - Discovery that prompted this ADR
- **REF-003**: [TSyringe Documentation](https://github.com/microsoft/tsyringe) - Container API reference
- **REF-004**: [Architecture Rules - DI Container Usage](../project-rules/architecture.md#5-di-container-usage) - Doctrine constraints
