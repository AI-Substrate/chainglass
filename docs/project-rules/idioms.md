# Chainglass Idioms

**Version**: 1.0.0
**Last Updated**: 2026-01-21
**Constitution Reference**: [constitution.md](./constitution.md)

This document provides illustrative patterns, code examples, and recurring conventions.

---

## 1. Interface Definition Idiom

**Pattern**: Define interfaces in `@chainglass/shared/interfaces/` with JSDoc contracts.

```typescript
// packages/shared/src/interfaces/logger.interface.ts

export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Logging abstraction for observability.
 * All implementations must be synchronous and never throw.
 */
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

**Export Pattern** (barrel exports):
```typescript
// packages/shared/src/interfaces/index.ts
export { LogLevel } from './logger.interface.js';
export type { ILogger, LogEntry } from './logger.interface.js';
```

---

## 2. Fake Implementation Idiom

**Pattern**: Fakes implement interfaces and provide test helper methods.

```typescript
// packages/shared/src/fakes/fake-logger.ts

export class FakeLogger implements ILogger {
  private readonly entries: LogEntry[];
  private readonly metadata: Record<string, unknown>;

  constructor(
    entries?: LogEntry[],
    metadata?: Record<string, unknown>
  ) {
    // Share parent's entries array for child logger assertions
    this.entries = entries ?? [];
    this.metadata = metadata ?? {};
  }

  // === Interface Implementation ===

  info(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, data);
  }

  child(metadata: Record<string, unknown>): ILogger {
    return new FakeLogger(this.entries, { ...this.metadata, ...metadata });
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    this.entries.push({
      level,
      message,
      data: { ...this.metadata, ...data },
      timestamp: new Date(),
    });
  }

  // === Test Helper Methods (NOT in interface) ===

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  getEntriesByLevel(level: LogLevel): LogEntry[] {
    return this.entries.filter((e) => e.level === level);
  }

  assertLoggedAtLevel(level: LogLevel, messageSubstring: string): void {
    const found = this.entries.some(
      (e) => e.level === level && e.message.includes(messageSubstring)
    );
    if (!found) {
      throw new Error(
        `Expected log at ${level} containing "${messageSubstring}". ` +
        `Found: ${JSON.stringify(this.entries.map((e) => ({ level: e.level, message: e.message })))}`
      );
    }
  }

  clear(): void {
    this.entries.length = 0;
  }
}
```

**Key Characteristics**:
- Accepts optional `entries` array to share state with child loggers
- Test helpers use assertion-style naming (`assertLoggedAtLevel`)
- `clear()` enables test isolation

---

## 3. Adapter Implementation Idiom

**Pattern**: Adapters implement interfaces using external libraries.

```typescript
// packages/shared/src/adapters/pino-logger.adapter.ts

import type { Logger } from 'pino';
import pino from 'pino';
import type { ILogger } from '../interfaces/logger.interface.js';

export class PinoLoggerAdapter implements ILogger {
  private readonly logger: Logger;

  constructor(pinoInstance?: Logger) {
    this.logger = pinoInstance ?? pino({
      serializers: { err: pino.stdSerializers.err },
    });
  }

  // Static factory for special configurations
  static createForStderr(): PinoLoggerAdapter {
    const stderrLogger = pino(
      { serializers: { err: pino.stdSerializers.err } },
      pino.destination({ dest: 2 }) // fd 2 = stderr
    );
    return new PinoLoggerAdapter(stderrLogger);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.logger.info(data, message);
  }

  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.logger.error({ ...data, err: error }, message);
  }

  child(metadata: Record<string, unknown>): ILogger {
    return new PinoLoggerAdapter(this.logger.child(metadata));
  }

  // ... other methods
}
```

---

## 4. DI Container Idiom

**Pattern**: Factory-based registration with child containers.

```typescript
// apps/web/src/lib/di-container.ts

import 'reflect-metadata';
import { container, type DependencyContainer } from 'tsyringe';
import type { ILogger } from '@chainglass/shared';
import { FakeLogger, PinoLoggerAdapter } from '@chainglass/shared';
import { SampleService } from '../services/sample.service.js';

export const DI_TOKENS = {
  LOGGER: 'ILogger',
  SAMPLE_SERVICE: 'SampleService',
} as const;

export function createProductionContainer(): DependencyContainer {
  const childContainer = container.createChildContainer();

  // Register adapters
  childContainer.register<ILogger>(DI_TOKENS.LOGGER, {
    useFactory: () => new PinoLoggerAdapter(),
  });

  // Register services with explicit factory
  childContainer.register(DI_TOKENS.SAMPLE_SERVICE, {
    useFactory: (c) => {
      const logger = c.resolve<ILogger>(DI_TOKENS.LOGGER);
      return new SampleService(logger);
    },
  });

  return childContainer;
}

export function createTestContainer(): DependencyContainer {
  const childContainer = container.createChildContainer();

  const fakeLogger = new FakeLogger();

  // Register fakes
  childContainer.register<ILogger>(DI_TOKENS.LOGGER, {
    useFactory: () => fakeLogger,
  });

  // Same service registration pattern
  childContainer.register(DI_TOKENS.SAMPLE_SERVICE, {
    useFactory: (c) => {
      const logger = c.resolve<ILogger>(DI_TOKENS.LOGGER);
      return new SampleService(logger);
    },
  });

  return childContainer;
}
```

**Why `useFactory` not `useClass`**: TSyringe's `useClass` requires `@injectable()` decorators which may not survive React Server Component compilation.

---

## 5. Service Implementation Idiom

**Pattern**: Services depend only on interfaces via constructor injection.

```typescript
// apps/web/src/services/sample.service.ts

import type { ILogger } from '@chainglass/shared';

/**
 * REFERENCE IMPLEMENTATION - demonstrates service pattern.
 * Future services should follow this structure.
 */
export class SampleService {
  constructor(private readonly logger: ILogger) {}

  async doSomething(input: string): Promise<string> {
    this.logger.info('Processing input', { input });

    // Business logic here
    const result = `Processed: ${input}`;

    this.logger.info('Processing complete', { input, result });
    return result;
  }
}
```

**Key Points**:
- Import `type { ILogger }` - only the type, not implementation
- Constructor accepts interface, not concrete class
- All dependencies injected (no `new` inside service)

---

## 6. Contract Test Idiom

**Pattern**: Parameterized test factory that runs against both fake and real.

```typescript
// test/contracts/logger.contract.ts

import type { ILogger, LogLevel } from '@chainglass/shared';

export function loggerContractTests(
  name: string,
  createLogger: () => ILogger
) {
  describe(`${name} implements ILogger contract`, () => {
    let logger: ILogger;

    beforeEach(() => {
      logger = createLogger();
    });

    it('should not throw when logging at any level', () => {
      /*
      Test Doc:
      - Why: Contract guarantees all log levels are accepted
      - Contract: ILogger methods never throw exceptions
      - Usage Notes: Safe to call any log method without try/catch
      - Quality Contribution: Catches breaking implementation changes
      - Worked Example: logger.info('test') completes without error
      */
      expect(() => logger.trace('trace')).not.toThrow();
      expect(() => logger.debug('debug')).not.toThrow();
      expect(() => logger.info('info')).not.toThrow();
      expect(() => logger.warn('warn')).not.toThrow();
      expect(() => logger.error('error')).not.toThrow();
      expect(() => logger.fatal('fatal')).not.toThrow();
    });

    it('should create child logger with inherited context', () => {
      /*
      Test Doc:
      - Why: Child loggers enable request-scoped context
      - Contract: child() returns ILogger that inherits parent metadata
      - Usage Notes: Pass object with additional context fields
      - Quality Contribution: Ensures observability patterns work
      - Worked Example: logger.child({reqId:'x'}).info('msg') includes reqId
      */
      const child = logger.child({ requestId: 'test-123' });
      expect(child).toBeDefined();
      expect(() => child.info('child log')).not.toThrow();
    });
  });
}
```

**Usage**:
```typescript
// test/contracts/logger.contract.test.ts

import { FakeLogger, PinoLoggerAdapter } from '@chainglass/shared';
import { loggerContractTests } from './logger.contract.js';

loggerContractTests('FakeLogger', () => new FakeLogger());
loggerContractTests('PinoLoggerAdapter', () => new PinoLoggerAdapter());
```

---

## 7. Unit Test Idiom

**Pattern**: Use fakes for assertions, Test Doc for documentation.

```typescript
// test/unit/web/sample-service.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { FakeLogger, LogLevel } from '@chainglass/shared';
import { SampleService } from '@chainglass/web/services/sample.service.js';

describe('SampleService', () => {
  let service: SampleService;
  let fakeLogger: FakeLogger;

  beforeEach(() => {
    fakeLogger = new FakeLogger();
    service = new SampleService(fakeLogger);
  });

  it('should log processing start and completion', async () => {
    /*
    Test Doc:
    - Why: Operations must be observable for debugging
    - Contract: doSomething() logs INFO at start and completion
    - Usage Notes: Use FakeLogger.assertLoggedAtLevel() for assertions
    - Quality Contribution: Catches missing log statements
    - Worked Example: doSomething('x') → 2 INFO logs with 'Processing'
    */
    await service.doSomething('test-input');

    fakeLogger.assertLoggedAtLevel(LogLevel.INFO, 'Processing input');
    fakeLogger.assertLoggedAtLevel(LogLevel.INFO, 'Processing complete');
    expect(fakeLogger.getEntries()).toHaveLength(2);
  });

  it('should include input in log metadata', async () => {
    /*
    Test Doc:
    - Why: Log metadata enables filtering and debugging
    - Contract: Logs include input value in data field
    - Usage Notes: Check entry.data.input for passed value
    - Quality Contribution: Catches silent metadata loss
    - Worked Example: doSomething('foo') → log.data.input === 'foo'
    */
    await service.doSomething('my-value');

    const entries = fakeLogger.getEntriesByLevel(LogLevel.INFO);
    const inputEntry = entries.find((e) => e.message.includes('Processing input'));

    expect(inputEntry?.data?.input).toBe('my-value');
  });
});
```

---

## 8. MCP Tool Idiom

**Pattern**: Follow ADR-0001 design patterns for agent-friendly tools.

```typescript
// packages/mcp-server/src/tools/check-health.tool.ts

export const checkHealthTool = {
  name: 'check_health',  // verb_object in snake_case
  description:
    'Checks the health status of the Chainglass server. ' +
    'Use this to verify the server is operational before other operations. ' +
    'Returns status and optional diagnostic details. ' +
    'Prefer this over manual status checks.',
  inputSchema: {
    type: 'object',
    properties: {
      include_details: {
        type: 'boolean',
        description: 'Include diagnostic information in response',
        default: false,
      },
    },
    required: [],
  },
  annotations: {
    readOnlyHint: true,      // Does not modify state
    destructiveHint: false,  // Cannot cause data loss
    idempotentHint: true,    // Same result on repeat calls
    openWorldHint: false,    // No external resources
  },
};

export async function handleCheckHealth(
  params: { include_details?: boolean }
): Promise<{ summary: string; status: string; details?: object }> {
  const status = 'healthy';
  const summary = `Server is ${status}`;  // Required for agent reasoning

  if (params.include_details) {
    return {
      summary,
      status,
      details: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      },
    };
  }

  return { summary, status };
}
```

---

## 9. MCP STDIO Discipline Idiom

**Pattern**: Redirect console BEFORE any imports.

```typescript
// apps/cli/src/commands/mcp.command.ts

export async function runMcpCommand(options: { stdio: boolean }): Promise<void> {
  if (options.stdio) {
    // CRITICAL: Redirect BEFORE any imports that might log
    console.log = (...args) => console.error('[LOG]', ...args);
    console.warn = (...args) => console.error('[WARN]', ...args);
    console.info = (...args) => console.error('[INFO]', ...args);
  }

  // NOW safe to import (uses dynamic import for lazy-loading)
  const { createMcpServer } = await import('@chainglass/mcp-server');

  const server = await createMcpServer({ stdio: options.stdio });
  await server.run();
}
```

**Why Lazy-Loading**: Static imports execute before console redirection. Dynamic import ensures redirection happens first.

---

## 10. Complexity Score Idiom

**Pattern**: Use CS scores instead of time estimates.

### Calibration Examples

**CS-1 (Trivial)**: Rename a constant in one file
```
S=0 (one file), I=0 (internal), D=0 (no state), N=0 (clear), F=0, T=0
Total: 0 points → CS-1
```

**CS-3 (Medium)**: Add new endpoint using existing service
```
S=1 (route + handler + types), I=1 (one internal service), D=1 (new response shape),
N=1 (some ambiguity), F=0, T=1 (integration tests)
Total: 5 points → CS-3
```

**CS-5 (Epic)**: Introduce new service with schema migration
```
S=2 (many files), I=2 (new external dep), D=2 (migration),
N=2 (specs unclear), F=1 (perf requirements), T=2 (staged rollout)
Total: 11 points → CS-5
```

### Output Format

```json
{
  "complexity": {
    "score": 3,
    "label": "medium",
    "breakdown": {
      "surface": 1,
      "integration": 1,
      "data_state": 1,
      "novelty": 1,
      "nfr": 0,
      "testing_rollout": 1
    },
    "confidence": 0.75
  },
  "assumptions": ["Spec is finalized", "API contract stable"],
  "dependencies": ["Existing WorkflowService"],
  "risks": ["Third-party API rate limits"],
  "phases": ["Design", "Implementation", "Tests", "Review"]
}
```

---

## 11. Directory Convention Idiom

```
chainglass/
├── apps/
│   ├── web/                    # Next.js application
│   │   └── src/
│   │       ├── lib/
│   │       │   └── di-container.ts
│   │       ├── services/       # Business logic
│   │       └── adapters/       # App-specific adapters (rare)
│   └── cli/                    # CLI application
│       └── src/
│           └── commands/       # CLI command handlers
├── packages/
│   ├── shared/                 # Core shared package
│   │   └── src/
│   │       ├── interfaces/     # All interfaces
│   │       ├── fakes/          # All fakes
│   │       └── adapters/       # Shared adapters
│   └── mcp-server/            # MCP server package
│       └── src/
│           ├── lib/
│           │   └── di-container.ts
│           └── tools/          # MCP tool definitions
├── test/                       # Centralized test suite
│   ├── setup.ts               # Global test setup
│   ├── contracts/             # Contract test factories
│   ├── unit/                  # Unit tests by package
│   │   ├── shared/
│   │   ├── web/
│   │   ├── cli/
│   │   └── mcp-server/
│   ├── integration/           # Cross-package tests
│   └── fixtures/              # Shared test data
└── docs/
    ├── project-rules/         # Constitution, rules, idioms
    ├── adr/                   # Architecture Decision Records
    └── plans/                 # Implementation plans
```

---

## 12. Barrel Export Idiom

**Pattern**: Layer exports for clean public API.

```typescript
// packages/shared/src/index.ts

// Types (interface re-exports need 'export type')
export { LogLevel } from './interfaces/index.js';
export type { ILogger, LogEntry } from './interfaces/index.js';

// Fakes
export { FakeLogger } from './fakes/index.js';

// Adapters
export { PinoLoggerAdapter } from './adapters/index.js';
```

**Layer Files**:
```typescript
// interfaces/index.ts - re-exports from interface files
// fakes/index.ts - re-exports from fake files
// adapters/index.ts - re-exports from adapter files
```

---

<!-- USER CONTENT START -->
<!-- Add project-specific idioms below this line -->
<!-- USER CONTENT END -->

---

*Idioms Version 1.0.0 - Examples derived from project setup implementation*
