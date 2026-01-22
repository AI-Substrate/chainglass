# @chainglass/shared

Core interfaces, fakes, adapters, and configuration system for Chainglass applications.

## Installation

```bash
pnpm add @chainglass/shared
```

## Quick Start

### Configuration System

1. **Create a config service and load configuration:**

```typescript
import {
  ChainglassConfigService,
  SampleConfigType,
} from '@chainglass/shared';

// Create and load config from all sources
const config = new ChainglassConfigService({
  userConfigDir: '/Users/me/.config/chainglass',
  projectConfigDir: '/project/.chainglass',
});
config.load(); // Synchronous, throws on validation error

// Access typed configuration
const sampleConfig = config.require(SampleConfigType);
console.log(sampleConfig.timeout); // number - type-safe!
```

2. **Use in tests with FakeConfigService:**

```typescript
import { FakeConfigService, SampleConfigType } from '@chainglass/shared';

const fakeConfig = new FakeConfigService({
  sample: { enabled: true, timeout: 60, name: 'test' },
});

const sample = fakeConfig.require(SampleConfigType);
// sample.timeout === 60
```

### Logging

```typescript
import { PinoLoggerAdapter, FakeLogger } from '@chainglass/shared';

// Production: Use Pino
const logger = new PinoLoggerAdapter();
logger.info('Hello', { userId: 123 });

// Tests: Use FakeLogger
const fakeLogger = new FakeLogger();
fakeLogger.info('test message');
fakeLogger.assertLoggedAtLevel('info', 'test');
```

## API Reference

### Configuration

| Export | Description |
|--------|-------------|
| `IConfigService` | Interface for configuration service |
| `ConfigType<T>` | Type descriptor for config sections |
| `ChainglassConfigService` | Production implementation |
| `FakeConfigService` | Test double with assertion helpers |
| `SampleConfigSchema` | Zod schema for sample config |
| `SampleConfigType` | ConfigType for sample config |

### Logging

| Export | Description |
|--------|-------------|
| `ILogger` | Interface for loggers |
| `PinoLoggerAdapter` | Production logger (wraps Pino) |
| `FakeLogger` | Test logger with assertions |
| `LogLevel` | Enum: trace, debug, info, warn, error, fatal |

### Errors

| Export | Description |
|--------|-------------|
| `ConfigurationError` | General config validation error |
| `MissingConfigurationError` | Required config not found |
| `LiteralSecretError` | Hardcoded secret detected |

## Config Sources (Precedence)

Configuration is loaded from multiple sources with clear precedence:

| Priority | Source | Example |
|----------|--------|---------|
| 1 (lowest) | Zod schema defaults | `z.number().default(30)` |
| 2 | User config | `~/.config/chainglass/config.yaml` |
| 3 | Project config | `.chainglass/config.yaml` |
| 4 (highest) | Environment variables | `CG_SAMPLE__TIMEOUT=60` |

Environment variables use `CG_` prefix with `__` for nesting.

## Creating a New Config Type

1. **Define the Zod schema:**

```typescript
// packages/shared/src/config/schemas/my-feature.schema.ts
import { z } from 'zod';
import type { ConfigType } from '../../interfaces/config.interface.js';

export const MyFeatureConfigSchema = z.object({
  enabled: z.boolean().default(false),
  maxItems: z.coerce.number().min(1).max(100).default(10),
  apiUrl: z.string().url().optional(),
});

export type MyFeatureConfig = z.infer<typeof MyFeatureConfigSchema>;

export const MyFeatureConfigType: ConfigType<MyFeatureConfig> = {
  configPath: 'myFeature',
  parse: (raw) => MyFeatureConfigSchema.parse(raw),
};
```

2. **Register in ChainglassConfigService** (see Phase 3 implementation)

3. **Use in your service:**

```typescript
const myConfig = configService.require(MyFeatureConfigType);
```

## Links

- [ADR-0003: Configuration System Architecture](../../docs/adr/adr-0003-configuration-system.md)
- [How-To: Configuration Overview](../../docs/how/configuration/1-overview.md)
- [How-To: Configuration Usage](../../docs/how/configuration/2-usage.md)
- [How-To: Testing with FakeConfigService](../../docs/how/configuration/3-testing.md)
