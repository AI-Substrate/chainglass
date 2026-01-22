# Chainglass Architecture

**Version**: 1.0.0
**Last Updated**: 2026-01-21
**Constitution Reference**: [constitution.md](./constitution.md)

This document captures the system's high-level structure, boundaries, and interaction contracts.

---

## 1. System Overview

Chainglass is a **workflow orchestration system for AI agents**. It provides:

- **CLI** (`cg`): Command-line interface for automation and scripting
- **MCP Server**: Model Context Protocol server for AI agent integration
- **Web Application**: GUI for human interaction with workflows

All interfaces share a common core via `@chainglass/shared`.

```
┌─────────────────────────────────────────────────────────────────┐
│                         USERS                                    │
│  Humans (Web GUI)  │  Scripts (CLI)  │  AI Agents (MCP)         │
└─────────────────────────────────────────────────────────────────┘
           │                   │                   │
           ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│    apps/web     │  │    apps/cli     │  │ packages/mcp    │
│   (Next.js)     │  │   (Commander)   │  │    -server      │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │  @chainglass/shared   │
                  │  - Interfaces         │
                  │  - Fakes              │
                  │  - Adapters           │
                  └───────────────────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │   Filesystem / Git    │
                  │   (Workflow State)    │
                  └───────────────────────┘
```

---

## 2. Package Architecture

### 2.1 Package Dependency Graph

```
apps/web ──────────────┐
                       │
apps/cli ──────────────┼───► @chainglass/shared
                       │
packages/mcp-server ───┘
```

**Rules**:
- All apps/packages depend on `@chainglass/shared`
- No circular dependencies between packages
- No app imports from another app

### 2.2 Package Responsibilities

| Package | Responsibility | Exports |
|---------|----------------|---------|
| `@chainglass/shared` | Core interfaces, fakes, adapters, config | `ILogger`, `FakeLogger`, `PinoLoggerAdapter`, `IConfigService`, `FakeConfigService`, `ChainglassConfigService` |
| `@chainglass/mcp-server` | MCP protocol implementation | `createMcpServer()` |
| `apps/web` | Next.js web application | N/A (not imported) |
| `apps/cli` | CLI commands | `cg` binary |

### 2.3 Directory Structure

```
chainglass/
├── apps/
│   ├── web/                    # Next.js web application
│   │   ├── src/
│   │   │   ├── app/            # Next.js App Router
│   │   │   ├── lib/
│   │   │   │   └── di-container.ts
│   │   │   ├── services/       # Business logic services
│   │   │   └── adapters/       # App-specific adapters (rare)
│   │   └── next.config.ts
│   └── cli/                    # @chainglass/cli
│       └── src/
│           ├── commands/       # CLI command handlers
│           └── cli.ts          # Entry point
├── packages/
│   ├── shared/                 # @chainglass/shared
│   │   └── src/
│   │       ├── interfaces/     # All interfaces (ILogger, IConfigService)
│   │       ├── fakes/          # Test doubles (FakeLogger, FakeConfigService)
│   │       ├── adapters/       # Shared adapters (PinoLoggerAdapter)
│   │       ├── config/         # Configuration system
│   │       │   ├── schemas/    # Zod schemas (SampleConfigSchema, etc.)
│   │       │   ├── loaders/    # YAML, env, secrets loaders
│   │       │   ├── security/   # Secret detection
│   │       │   └── chainglass-config.service.ts
│   │       └── index.ts        # Barrel exports
│   └── mcp-server/             # @chainglass/mcp-server
│       └── src/
│           ├── lib/
│           │   └── di-container.ts
│           ├── tools/          # MCP tool definitions
│           └── server.ts       # Server implementation
├── test/                       # Centralized test suite
│   ├── contracts/              # Contract test factories
│   ├── unit/                   # Unit tests by package
│   ├── integration/            # Cross-package tests
│   └── fixtures/               # Shared test data
└── docs/
    ├── project-rules/          # Constitution & rules
    ├── adr/                    # Architecture decisions
    └── plans/                  # Implementation plans
```

---

## 3. Clean Architecture Layers

### 3.1 Layer Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                        ADAPTERS                                 │
│  Infrastructure concerns: logging, APIs, databases              │
│  (PinoLoggerAdapter, ConsoleLoggerAdapter, etc.)               │
│                                                                 │
│  CONFIG SERVICES (Infrastructure)                               │
│  (ChainglassConfigService - loads from files/env)              │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                      SERVICES                             │  │
│  │  Business logic: workflows, validation, orchestration     │  │
│  │  (SampleService, WorkflowService, etc.)                   │  │
│  │  → Consume config via IConfigService constructor injection │  │
│  │                                                           │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │                   INTERFACES                        │  │  │
│  │  │  Contracts: what capabilities exist                 │  │  │
│  │  │  (ILogger, IConfigService, IWorkflowRepository)    │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  FAKES (Test Doubles)                                          │
│  (FakeLogger, FakeConfigService, FakeWorkflowRepository)       │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 3.2 Dependency Direction Rules

| Layer | Can Import From | Cannot Import From |
|-------|-----------------|-------------------|
| **Services** | Interfaces (`@chainglass/shared`) | Adapters, external libs directly |
| **Adapters** | Interfaces, external libs | Services |
| **Fakes** | Interfaces | Services, Adapters, external libs |
| **Tests** | All layers | N/A |

### 3.3 Import Examples

```typescript
// ✅ CORRECT - Service imports interface
import type { ILogger } from '@chainglass/shared';

export class WorkflowService {
  constructor(private readonly logger: ILogger) {}
}

// ❌ WRONG - Service imports concrete adapter
import { PinoLoggerAdapter } from '@chainglass/shared';

export class WorkflowService {
  constructor(private readonly logger: PinoLoggerAdapter) {}
}
```

---

## 4. Dependency Injection Architecture

### 4.1 Container Pattern

Each app owns its own DI container with separate production and test factories.

**Config loads BEFORE container creation** (pre-loaded pattern):

```
┌─────────────────────────────────────────────────────────────┐
│                    Production Runtime                        │
│                                                              │
│  1. const config = new ChainglassConfigService({...});      │
│  2. config.load();  // Synchronous, throws on error          │
│  3. createProductionContainer(config);  // Config injected   │
│                                                              │
│  ┌─────────────────────────────┐    ┌─────────────────────┐ │
│  │ createProductionContainer   │───►│ ChainglassConfig... │ │
│  │ (config: IConfigService)    │    │ PinoLoggerAdapter   │ │
│  │                             │    │ RealWorkflowRepo... │ │
│  └─────────────────────────────┘    └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      Test Runtime                            │
│                                                              │
│  const fakeConfig = new FakeConfigService({                 │
│    sample: { enabled: true, timeout: 30, name: 'test' }     │
│  });                                                         │
│                                                              │
│  ┌─────────────────────────────┐    ┌─────────────────────┐ │
│  │ createTestContainer         │───►│ FakeConfigService   │ │
│  │                             │    │ FakeLogger          │ │
│  │                             │    │ FakeWorkflowRepo... │ │
│  └─────────────────────────────┘    └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Container Isolation

**Problem**: TSyringe singletons cause state leakage between tests.

**Solution**: Child container per test.

```typescript
// Each test gets fresh container
beforeEach(() => {
  const testContainer = createTestContainer();
  service = testContainer.resolve(DI_TOKENS.WORKFLOW_SERVICE);
});
```

### 4.3 Why useFactory (Not useClass)

TSyringe's `useClass` requires `@injectable()` decorators. These decorators may not survive React Server Component compilation.

```typescript
// ✅ CORRECT - useFactory works without decorators
container.register<ILogger>(DI_TOKENS.LOGGER, {
  useFactory: () => new PinoLoggerAdapter(),
});

// ❌ WRONG - useClass requires @injectable decorator
container.register<ILogger>(DI_TOKENS.LOGGER, {
  useClass: PinoLoggerAdapter,
});
```

---

## 5. MCP Server Architecture

### 5.1 Protocol Overview

```
┌──────────────────┐     JSON-RPC over stdio    ┌──────────────────┐
│    AI Agent      │◄───────────────────────────►│   MCP Server     │
│  (Claude, etc.)  │     stdout: responses       │  (@chainglass/   │
│                  │     stdin: requests         │   mcp-server)    │
└──────────────────┘                             └──────────────────┘
```

### 5.2 STDIO Discipline (Three-Layer Defense)

**Critical**: stdout is reserved for JSON-RPC only. Any extraneous output corrupts the protocol and breaks AI agent communication.

Chainglass implements a **three-layer defense** to guarantee stdout cleanliness:

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: CLI Console Redirect (apps/cli)                       │
│  ─────────────────────────────────────────                      │
│  Redirects console.log/warn/info to stderr BEFORE any imports   │
│  Catches: Module-level side effects, third-party library logs   │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 2: Lazy-Loading via Dynamic Import                       │
│  ─────────────────────────────────────────                      │
│  Uses `await import()` instead of static imports                │
│  Catches: Import-time code execution that might log             │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 3: MCP Server Stderr Logger (packages/mcp-server)        │
│  ─────────────────────────────────────────────────────          │
│  Uses PinoLoggerAdapter.createForStderr() in DI container       │
│  Catches: Application-level logging from services/adapters      │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation in CLI** (`apps/cli/src/commands/mcp.command.ts`):

```typescript
export async function runMcpCommand(options: { stdio: boolean }) {
  if (options.stdio) {
    // LAYER 1: Redirect BEFORE any imports (catches module side effects)
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    console.log = (...args) => console.error('[LOG]', ...args);
    console.warn = (...args) => console.error('[WARN]', ...args);
    console.info = (...args) => console.error('[INFO]', ...args);

    try {
      // LAYER 2: Lazy-load via dynamic import (safe now)
      const { createMcpServer } = await import('@chainglass/mcp-server');
      const { PinoLoggerAdapter } = await import('@chainglass/shared');

      // LAYER 3: Explicitly use stderr logger (defense in depth)
      const logger = PinoLoggerAdapter.createForStderr();
      const server = createMcpServer({ logger });

      await server.connectStdio();
      // ... handle shutdown
    } finally {
      // Restore on shutdown (for clean process exit)
      console.log = originalLog;
      console.warn = originalWarn;
      console.info = originalInfo;
    }
  }
}
```

### 5.3 MCP Server Container Pattern (Special Case)

The MCP server has its **own DI container** separate from the web app, because it requires special configuration for stdio compliance.

**Location**: `packages/mcp-server/src/lib/di-container.ts`

```typescript
// MCP-specific token namespace (avoids conflicts with web app tokens)
export const MCP_DI_TOKENS = {
  LOGGER: 'ILogger',
} as const;

/**
 * Production container uses stderr-configured logger.
 * Per Critical Discovery 10: stdout reserved for JSON-RPC.
 */
export function createMcpProductionContainer(): DependencyContainer {
  const childContainer = container.createChildContainer();

  // CRITICAL: Use stderr logger, not default stdout logger
  childContainer.register<ILogger>(MCP_DI_TOKENS.LOGGER, {
    useFactory: () => PinoLoggerAdapter.createForStderr(),
  });

  return childContainer;
}

/**
 * Test container uses FakeLogger (no stdout/stderr concerns).
 */
export function createMcpTestContainer(): DependencyContainer {
  const childContainer = container.createChildContainer();

  const fakeLogger = new FakeLogger();
  childContainer.register<ILogger>(MCP_DI_TOKENS.LOGGER, {
    useFactory: () => fakeLogger,
  });

  return childContainer;
}
```

**Key Differences from Web App Container**:

| Aspect | Web App Container | MCP Server Container |
|--------|-------------------|----------------------|
| Logger | `PinoLoggerAdapter()` (stdout) | `PinoLoggerAdapter.createForStderr()` |
| Token namespace | `DI_TOKENS` | `MCP_DI_TOKENS` |
| Console redirect | Not needed | Required at CLI layer |
| Import timing | Static imports OK | Must use dynamic imports |

### 5.4 Future Debug Mode Considerations

When adding a `--debug` flag to the CLI:

**MUST** ensure debug output goes to stderr, never stdout:

```typescript
// ✅ CORRECT - Debug logs to stderr
export async function runMcpCommand(options: { stdio: boolean; debug: boolean }) {
  if (options.stdio) {
    // Console redirect still applies in debug mode
    console.log = (...args) => console.error('[LOG]', ...args);
    console.debug = (...args) => console.error('[DEBUG]', ...args);  // Add debug redirect
  }

  if (options.debug) {
    // Configure verbose logging - still goes to stderr
    const logger = PinoLoggerAdapter.createForStderr({ level: 'debug' });
  }
}

// ❌ WRONG - Debug bypasses stderr redirect
if (options.debug) {
  console.log('Debug info');  // CORRUPTS JSON-RPC PROTOCOL
}
```

**Rule**: Any future CLI flags (`--debug`, `--verbose`, `--trace`) MUST respect the three-layer defense. Debug output is still output - it goes to stderr.

### 5.6 Tool Design Pattern

All MCP tools follow ADR-0001 patterns:

```typescript
const tool = {
  name: 'verb_object',           // snake_case naming
  description: '...',            // 3-4 sentences
  inputSchema: {                 // Strong JSON Schema
    type: 'object',
    properties: {
      param: { type: 'string', enum: ['a', 'b'] },  // Explicit constraints
    },
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
```

---

## 6. Web Application Architecture

### 6.1 Next.js App Router

```
apps/web/src/
├── app/                    # App Router (Next.js 14+)
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home page
│   └── api/
│       └── health/
│           └── route.ts    # Health check endpoint
├── lib/
│   └── di-container.ts     # DI configuration
└── services/
    └── sample.service.ts   # Business logic
```

### 6.2 API Route Pattern

```typescript
// apps/web/src/app/api/health/route.ts

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
```

### 6.3 Service Integration

Services are resolved from DI container and used in API routes:

```typescript
// apps/web/src/app/api/process/route.ts

import { createProductionContainer, DI_TOKENS } from '@/lib/di-container';
import type { SampleService } from '@/services/sample.service';

export async function POST(request: Request) {
  const container = createProductionContainer();
  const service = container.resolve<SampleService>(DI_TOKENS.SAMPLE_SERVICE);

  const { input } = await request.json();
  const result = await service.doSomething(input);

  return Response.json({ result });
}
```

---

## 7. CLI Architecture

### 7.1 Command Structure

```
apps/cli/src/
├── cli.ts                  # Entry point, Commander setup
├── commands/
│   ├── web.command.ts      # Start web server
│   └── mcp.command.ts      # Start MCP server
└── lib/
    └── server.ts           # Server utilities
```

### 7.2 Command Pattern

```typescript
// apps/cli/src/cli.ts

import { Command } from 'commander';
import { runWebCommand } from './commands/web.command.js';
import { runMcpCommand } from './commands/mcp.command.js';

const program = new Command()
  .name('cg')
  .description('Chainglass CLI')
  .version('0.1.0');

program
  .command('web')
  .description('Start production web server')
  .option('-p, --port <port>', 'Port number', '3000')
  .action(runWebCommand);

program
  .command('mcp')
  .description('Start MCP server')
  .option('--stdio', 'Use stdio transport')
  .action(runMcpCommand);

program.parse();
```

### 7.3 Asset Discovery

CLI bundles Next.js standalone output and discovers assets at runtime:

```typescript
// Asset paths relative to CLI binary
const assetsPath = path.join(import.meta.dirname, '../web');
```

---

## 8. Testing Architecture

### 8.1 Test Organization

```
test/
├── setup.ts                # Global Vitest setup
├── contracts/              # Contract test factories
│   └── logger.contract.ts  # Parameterized logger tests
├── unit/                   # Unit tests by package
│   ├── shared/
│   │   └── fake-logger.test.ts
│   ├── web/
│   │   ├── di-container.test.ts
│   │   └── sample-service.test.ts
│   ├── cli/
│   │   └── cli-parser.test.ts
│   └── mcp-server/
│       └── server.test.ts
├── integration/            # Cross-package tests
└── fixtures/               # Shared test data
```

### 8.2 Contract Test Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Contract Test Factory                           │
│                                                              │
│  loggerContractTests(name, createLogger)                    │
│    ├── "should not throw when logging"                      │
│    ├── "should create child logger"                         │
│    └── ...                                                   │
└─────────────────────────────────────────────────────────────┘
                      │
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│   FakeLogger    │    │ PinoLoggerAdapter│
│                 │    │                  │
│ Same tests run  │    │ Same tests run   │
│ against fake    │    │ against real     │
└─────────────────┘    └─────────────────┘
```

---

## 9. Integration Points

### 9.1 External Dependencies

| Dependency | Purpose | Package |
|------------|---------|---------|
| Pino | Production logging | `@chainglass/shared` |
| TSyringe | Dependency injection | All packages |
| Commander | CLI framework | `apps/cli` |
| Next.js | Web framework | `apps/web` |
| @modelcontextprotocol/sdk | MCP protocol | `packages/mcp-server` |

### 9.2 Filesystem Integration

Chainglass workflows are filesystem-based:

```
workflows/
├── my-workflow/
│   ├── workflow.yaml       # Workflow definition
│   ├── phases/
│   │   ├── phase-1/
│   │   │   ├── inputs/     # Phase inputs
│   │   │   └── outputs/    # Phase outputs
│   │   └── phase-2/
│   └── state.json          # Runtime state
```

### 9.3 Git Integration

- All workflow state is git-tracked
- Phase execution creates commits
- Rollback via git history

---

## 10. Anti-Patterns

### 10.1 Banned Patterns

| Anti-Pattern | Why | Alternative |
|--------------|-----|-------------|
| Service imports adapter | Violates dependency direction | Import interface only |
| `@injectable()` decorator | RSC incompatible | Use `useFactory` |
| `vi.mock()` in tests | Not behavior-focused | Use fakes |
| Global DI container in tests | State leakage | Child containers |
| stdout in MCP stdio mode | Corrupts protocol | Redirect to stderr |
| Static imports before console redirect | Logs to stdout | Lazy-load with dynamic import |
| Debug output to stdout in MCP | Corrupts protocol even in debug mode | Debug logs to stderr |
| Using web app DI container for MCP | Wrong logger configuration | Use `createMcpProductionContainer()` |

### 10.2 Code Review Checklist

**Architecture**:
- [ ] No imports from `*.adapter.ts` in service files
- [ ] No `@injectable()` or `@inject()` decorators
- [ ] Child container created per test

**Testing**:
- [ ] No `vi.mock()`, `jest.mock()`, or `vi.spyOn()`
- [ ] Test Doc format with all 5 fields

**MCP Server**:
- [ ] MCP tools follow ADR-0001 patterns
- [ ] Console redirect happens BEFORE any imports in MCP command
- [ ] MCP server uses `createMcpProductionContainer()` (not web container)
- [ ] All MCP logging uses stderr-configured logger
- [ ] Any new CLI flags (--debug, etc.) output to stderr only

---

## 11. Evolution Guidelines

### 11.1 Adding a New Interface

1. Create interface in `packages/shared/src/interfaces/`
2. Create fake in `packages/shared/src/fakes/`
3. Create contract tests in `test/contracts/`
4. Create real adapter in `packages/shared/src/adapters/`
5. Run contract tests against both
6. Register in DI containers

### 11.2 Adding a New Service

1. Create service in `apps/[app]/src/services/`
2. Constructor accepts only interfaces
3. Write unit tests with fakes
4. Register in DI container
5. Document in architecture.md if significant

### 11.3 Adding a New MCP Tool

1. Follow ADR-0001 design patterns
2. Create tool definition in `packages/mcp-server/src/tools/`
3. Use `check_health` as exemplar
4. Write unit, integration, and E2E tests
5. Include all four MCP annotations

---

<!-- USER CONTENT START -->
<!-- Add project-specific architecture notes below this line -->

## 12. Configuration System Architecture

### 12.1 Config Loading Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Config Loading Pipeline                       │
│                                                                   │
│   ~/.config/chainglass/     .chainglass/       Environment       │
│   ├── config.yaml           ├── config.yaml    CG_* variables    │
│   └── secrets.env           └── secrets.env                      │
│          │                        │                  │            │
│          └────────────┬───────────┴──────────────────┘            │
│                       ▼                                           │
│              ChainglassConfigService.load()                       │
│              ┌─────────────────────────────┐                      │
│              │ 1. Load secrets to pending   │                      │
│              │ 2. Load YAML configs         │                      │
│              │ 3. Parse CG_* env vars       │                      │
│              │ 4. Deep merge (precedence)   │                      │
│              │ 5. Expand ${VAR} placeholders│                      │
│              │ 6. Validate no secrets       │                      │
│              │ 7. Zod schema validation     │                      │
│              │ 8. Commit secrets to env     │                      │
│              └─────────────────────────────┘                      │
│                       │                                           │
│                       ▼                                           │
│              Typed Config Objects (SampleConfig, etc.)            │
│                       │                                           │
│                       ▼                                           │
│              DI Container (config injected)                       │
│                       │                                           │
│                       ▼                                           │
│              Services (consume via IConfigService)                │
└─────────────────────────────────────────────────────────────────┘
```

### 12.2 Precedence (Highest Last)

| Priority | Source | Example |
|----------|--------|---------|
| 1 | Zod schema defaults | `z.number().default(30)` |
| 2 | User config | `~/.config/chainglass/config.yaml` |
| 3 | Project config | `.chainglass/config.yaml` |
| 4 | Environment | `CG_SAMPLE__TIMEOUT=60` |

### 12.3 Key Decisions

- **ChainglassConfigService in config/**: Not in adapters/ because it's an infrastructure service with orchestration logic, not a thin wrapper
- **Pre-loaded pattern**: Config loads before DI container creation
- **Transactional loading**: Secrets committed to process.env only after all validation passes
- **Fakes for testing**: FakeConfigService accepts configs via constructor

See [ADR-0003](../adr/adr-0003-configuration-system.md) for full architecture decision.

<!-- USER CONTENT END -->

---

*Architecture Version 1.0.0 - Derived from project setup implementation*
