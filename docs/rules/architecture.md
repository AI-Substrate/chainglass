# Clean Architecture Rules

This document defines the architectural patterns and rules for the Chainglass codebase. All contributors should follow these guidelines when adding new features.

---

## 1. Overview and Principles

Chainglass follows **Clean Architecture** principles to maintain a modular, testable, and maintainable codebase.

### Core Principles

- **Dependency Inversion**: High-level modules (services) depend on abstractions (interfaces), not concrete implementations (adapters)
- **Interface-First Design**: Define interfaces before implementations
- **Fakes Over Mocks**: Use real fake implementations for testing instead of mock libraries
- **Decorator-Free DI**: Use factory patterns instead of decorators for React Server Component compatibility

### Package Structure

```
chainglass/
├── apps/
│   ├── web/              # Next.js web application
│   └── cli/              # @chainglass/cli - Command-line interface
├── packages/
│   ├── shared/           # @chainglass/shared - Interfaces, fakes, utilities
│   └── mcp-server/       # @chainglass/mcp-server - MCP server
└── test/                 # Centralized test suite
```

---

## 2. Dependency Direction Rules

The most important rule: **dependencies flow inward**.

```
┌─────────────────────────────────────────────────────────────┐
│                       ADAPTERS                               │
│  (PinoLoggerAdapter, ConsoleLoggerAdapter, etc.)            │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    SERVICES                            │  │
│  │  (SampleService, etc.)                                 │  │
│  │                                                        │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │              INTERFACES                          │  │  │
│  │  │  (ILogger, etc.)                                 │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │                                                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Rules

1. **Services import ONLY from interfaces** - Never from `*.adapter.ts` files
2. **Adapters import from interfaces and external libraries** - Never from services
3. **Fakes import ONLY from interfaces** - Never from services or adapters

---

## 3. Layer Rules Table

| Layer | Can Import From | Cannot Import From |
|-------|-----------------|-------------------|
| **Services** | `@chainglass/shared` interfaces | Adapters, external libs directly |
| **Adapters** | Interfaces, external libs | Services |
| **Fakes** | Interfaces | Services, Adapters, external libs |

### Example: Correct Service Import

```typescript
// ✅ CORRECT - imports only from interface
import type { ILogger } from '@chainglass/shared';

export class SampleService {
  constructor(private readonly logger: ILogger) {}
}
```

### Example: Incorrect Service Import

```typescript
// ❌ WRONG - imports concrete adapter
import { PinoLoggerAdapter } from '@chainglass/shared';

export class SampleService {
  constructor(private readonly logger: PinoLoggerAdapter) {}
}
```

---

## 4. Interface-First Design

Always create the interface before any implementation.

### Interface Location

All interfaces live in `@chainglass/shared/interfaces/`:

```
packages/shared/src/
├── interfaces/
│   ├── logger.interface.ts    # ILogger, LogLevel, LogEntry
│   └── index.ts               # Re-exports all interfaces
├── fakes/
│   └── fake-logger.ts         # FakeLogger implements ILogger
└── adapters/
    └── pino-logger.adapter.ts # PinoLoggerAdapter implements ILogger
```

### ILogger Example

```typescript
// packages/shared/src/interfaces/logger.interface.ts
export interface ILogger {
  trace(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error, data?: Record<string, unknown>): void;
  fatal(message: string, error?: Error, data?: Record<string, unknown>): void;
  child(metadata: Record<string, unknown>): ILogger;
}
```

---

## 5. DI Container Usage

> **ADR Reference**: See [ADR-0004: Dependency Injection Container Architecture](../adr/adr-0004-dependency-injection-container-architecture.md) for the complete decision record including alternatives considered, consequences, and remediation protocols.

### Why Child Containers?

We use TSyringe's child container pattern for test isolation. Each test gets a fresh container, preventing state leakage between tests.

### Why useFactory Instead of useClass?

TSyringe's `useClass` requires `@injectable()` decorators. These decorators may not survive React Server Component (RSC) compilation. We use `useFactory` which works without decorators.

### Production Container

```typescript
// apps/web/src/lib/di-container.ts
export function createProductionContainer(): DependencyContainer {
  const childContainer = container.createChildContainer();

  childContainer.register<ILogger>(DI_TOKENS.LOGGER, {
    useFactory: () => new PinoLoggerAdapter(),
  });

  childContainer.register(DI_TOKENS.SAMPLE_SERVICE, {
    useFactory: (c) => {
      const logger = c.resolve<ILogger>(DI_TOKENS.LOGGER);
      return new SampleService(logger);
    },
  });

  return childContainer;
}
```

### Test Container

```typescript
export function createTestContainer(): DependencyContainer {
  const childContainer = container.createChildContainer();

  const fakeLogger = new FakeLogger();

  childContainer.register<ILogger>(DI_TOKENS.LOGGER, {
    useFactory: () => fakeLogger,
  });

  childContainer.register(DI_TOKENS.SAMPLE_SERVICE, {
    useFactory: (c) => {
      const logger = c.resolve<ILogger>(DI_TOKENS.LOGGER);
      return new SampleService(logger);
    },
  });

  return childContainer;
}
```

### Token Constants

Use string tokens for type-safe resolution:

```typescript
export const DI_TOKENS = {
  LOGGER: 'ILogger',
  SAMPLE_SERVICE: 'SampleService',
} as const;
```

---

## 6. Testing with Fakes

### Fakes Over Mocks Policy

We do **not** use mocking libraries (`vi.mock()`, `jest.mock()`). Instead:

- Write full fake implementations that implement the same interface
- Fakes provide test helper methods for assertions
- Contract tests ensure fakes and real adapters behave identically

### FakeLogger Example

```typescript
export class FakeLogger implements ILogger {
  private readonly entries: LogEntry[] = [];

  info(message: string, data?: Record<string, unknown>): void {
    this.entries.push({ level: LogLevel.INFO, message, data, timestamp: new Date() });
  }

  // Test helper methods
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  assertLoggedAtLevel(level: LogLevel, messageSubstring: string): void {
    const found = this.entries.some(
      (e) => e.level === level && e.message.includes(messageSubstring)
    );
    if (!found) {
      throw new Error(`Expected log at ${level} containing "${messageSubstring}"`);
    }
  }

  clear(): void {
    this.entries.length = 0;
  }
}
```

### Contract Tests

Contract tests ensure fake and real implementations are interchangeable:

```typescript
// test/contracts/logger.contract.ts
export function loggerContractTests(name: string, createLogger: () => ILogger) {
  describe(`${name} implements ILogger contract`, () => {
    it('should not throw when logging at any level', () => {
      const logger = createLogger();
      expect(() => logger.info('test')).not.toThrow();
    });
  });
}

// Usage in test files:
loggerContractTests('FakeLogger', () => new FakeLogger());
loggerContractTests('PinoLoggerAdapter', () => new PinoLoggerAdapter());
```

### Full Test Doc Format

Every test should include a Test Doc comment with 5 fields:

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
  // ... test implementation
});
```

---

## 7. Adding New Services

Follow these steps to add a new service:

### Step 1: Create Interface

```typescript
// packages/shared/src/interfaces/my-service.interface.ts
export interface IMyService {
  doWork(input: string): Promise<string>;
}
```

### Step 2: Export Interface

```typescript
// packages/shared/src/interfaces/index.ts
export type { IMyService } from './my-service.interface.js';
```

### Step 3: Create Fake

```typescript
// packages/shared/src/fakes/fake-my-service.ts
export class FakeMyService implements IMyService {
  private results: string[] = [];

  async doWork(input: string): Promise<string> {
    const result = `Fake: ${input}`;
    this.results.push(result);
    return result;
  }

  // Test helpers
  getResults(): string[] { return [...this.results]; }
  clear(): void { this.results.length = 0; }
}
```

### Step 4: Write Contract Tests

```typescript
// test/contracts/my-service.contract.ts
export function myServiceContractTests(name: string, createService: () => IMyService) {
  describe(`${name} implements IMyService contract`, () => {
    it('should return processed result', async () => {
      const service = createService();
      const result = await service.doWork('test');
      expect(result).toContain('test');
    });
  });
}
```

### Step 5: Implement Real Service

```typescript
// apps/web/src/services/my.service.ts
import type { ILogger, IMyService } from '@chainglass/shared';

export class MyService implements IMyService {
  constructor(private readonly logger: ILogger) {}

  async doWork(input: string): Promise<string> {
    this.logger.info('Processing', { input });
    return `Result: ${input}`;
  }
}
```

### Step 6: Register in DI Container

```typescript
// apps/web/src/lib/di-container.ts
export const DI_TOKENS = {
  // ... existing tokens
  MY_SERVICE: 'MyService',
} as const;

// In createProductionContainer/createTestContainer:
childContainer.register(DI_TOKENS.MY_SERVICE, {
  useFactory: (c) => {
    const logger = c.resolve<ILogger>(DI_TOKENS.LOGGER);
    return new MyService(logger);
  },
});
```

### Step 7: Write Unit Tests

```typescript
// test/unit/web/my-service.test.ts
import { createTestContainer } from '@chainglass/web/lib/di-container';

describe('MyService', () => {
  it('should process input', async () => {
    const container = createTestContainer();
    const service = container.resolve<IMyService>(DI_TOKENS.MY_SERVICE);
    const result = await service.doWork('hello');
    expect(result).toBe('Result: hello');
  });
});
```

---

## 8. Adding New Adapters

### Step 1: Identify or Create Interface

If the interface exists, use it. Otherwise, create one in `@chainglass/shared/interfaces/`.

### Step 2: Implement Adapter

```typescript
// packages/shared/src/adapters/console-logger.adapter.ts
import type { ILogger } from '../interfaces/logger.interface.js';

export class ConsoleLoggerAdapter implements ILogger {
  info(message: string, data?: Record<string, unknown>): void {
    console.log(message, data);
  }
  // ... other methods
}
```

### Step 3: Run Contract Tests

Ensure the new adapter passes all contract tests:

```typescript
loggerContractTests('ConsoleLoggerAdapter', () => new ConsoleLoggerAdapter());
```

### Step 4: Register in Production Container

Update `createProductionContainer()` to use the new adapter where appropriate.

---

## 9. MCP Tool Development

For MCP (Model Context Protocol) tool development, follow ADR-0001: MCP Tool Design Patterns.

### Key Requirements

1. **Naming**: Use `verb_object` format in snake_case (e.g., `check_health`)
2. **Description**: 3-4 sentences covering action, context, and return value
3. **STDIO Discipline**: stdout is reserved for JSON-RPC only; logs go to stderr
4. **Annotations**: Include `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`

### Exemplar: check_health Tool

See `packages/mcp-server/src/server.ts` for the reference implementation.

### ADR Reference

Full details in [ADR-0001: MCP Tool Design Patterns](../adr/adr-0001-mcp-tool-design-patterns.md).

---

## Architecture Enforcement

Architecture rules are enforced via **code review** during the development/PR process. Automated tooling was evaluated and rejected due to false positive risks.

### Checklist for Reviewers

- [ ] Services import only from interfaces (`@chainglass/shared`)
- [ ] No direct adapter imports in service files
- [ ] New interfaces have corresponding fakes
- [ ] Contract tests exist for new fakes
- [ ] DI registrations use `useFactory` pattern
- [ ] Test Doc format used in new tests

---

*Last updated: 2026-01-19*
