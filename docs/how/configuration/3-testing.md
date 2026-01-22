# Configuration Testing Guide

Patterns for testing services that depend on configuration.

## Core Principle: Fakes Over Mocks

Per project testing policy, use `FakeConfigService` instead of `vi.mock()`. This provides:

- Behavior-focused testing
- Assertion helpers for verification
- Contract test parity with production

## Using FakeConfigService

### Basic Usage

```typescript
import { describe, it, expect } from 'vitest';
import { FakeConfigService, FakeLogger } from '@chainglass/shared';
import { MyFeatureConfigType } from '@chainglass/shared';
import { MyService } from '../services/my.service.js';

describe('MyService', () => {
  it('should use configured timeout', () => {
    // Create fake with specific config
    const fakeConfig = new FakeConfigService({
      myFeature: {
        enabled: true,
        maxRetries: 5,
        endpoint: 'https://test.example.com',
      },
    });
    const fakeLogger = new FakeLogger();

    // Inject into service
    const service = new MyService(fakeLogger, fakeConfig);

    // Test behavior
    expect(service.getMaxRetries()).toBe(5);
  });
});
```

### Constructor Injection Pattern

FakeConfigService accepts a record of configs in its constructor:

```typescript
// Pre-populate with all needed config sections
const fakeConfig = new FakeConfigService({
  sample: { enabled: true, timeout: 30, name: 'test' },
  myFeature: { enabled: false, maxRetries: 0, endpoint: 'http://localhost' },
});

// Both configs are immediately available
fakeConfig.require(SampleConfigType);     // Works
fakeConfig.require(MyFeatureConfigType);  // Works
```

### Runtime Set Pattern

For tests that need to change config during execution:

```typescript
const fakeConfig = new FakeConfigService();

// Initially empty
expect(fakeConfig.get(MyFeatureConfigType)).toBeUndefined();

// Set config at runtime
fakeConfig.set(MyFeatureConfigType, {
  enabled: true,
  maxRetries: 3,
  endpoint: 'https://example.com',
});

// Now available
expect(fakeConfig.require(MyFeatureConfigType)).toBeDefined();
```

## Assertion Helpers

FakeConfigService provides test helper methods:

### has(type)

Quick existence check:

```typescript
fakeConfig.set(MyFeatureConfigType, config);

expect(fakeConfig.has(MyFeatureConfigType)).toBe(true);
expect(fakeConfig.has(OtherConfigType)).toBe(false);
```

### assertConfigSet(type, message?)

Throws with descriptive message if config not set:

```typescript
// Throws: "Expected config 'myFeature' to be set. Use FakeConfigService..."
fakeConfig.assertConfigSet(MyFeatureConfigType);

// With context message
fakeConfig.assertConfigSet(MyFeatureConfigType, 'needed for API calls');
// Throws: "Expected config 'myFeature' to be set (needed for API calls)..."
```

### getSetConfigs()

Get all registered configs for inspection:

```typescript
const configs = fakeConfig.getSetConfigs();
expect(configs.size).toBe(2);
expect(configs.has('sample')).toBe(true);
```

### isLoaded()

Check if any configs are registered (for DI factory guards):

```typescript
const emptyConfig = new FakeConfigService();
expect(emptyConfig.isLoaded()).toBe(false);

emptyConfig.set(SampleConfigType, { enabled: true, timeout: 30, name: 'test' });
expect(emptyConfig.isLoaded()).toBe(true);
```

## Using serviceTest Fixture

The `serviceTest` Vitest fixture provides pre-baked fakes:

```typescript
// test/fixtures/service-test.fixture.ts is already set up
import { serviceTest, describe, expect } from '../fixtures/service-test.fixture.js';

describe('MyService', () => {
  // fakeLogger and fakeConfig are automatically provided!
  serviceTest('should process when enabled', ({ fakeLogger, fakeConfig }) => {
    // fakeConfig has default sample config pre-populated
    const service = new MyService(fakeLogger, fakeConfig);

    service.process();

    fakeLogger.assertLoggedAtLevel('info', 'Processing');
  });

  // Override specific values when needed
  serviceTest('should skip when disabled', ({ fakeLogger, fakeConfig }) => {
    fakeConfig.set(SampleConfigType, {
      enabled: false,
      timeout: 30,
      name: 'disabled-test',
    });

    const service = new MyService(fakeLogger, fakeConfig);
    service.process();

    fakeLogger.assertLoggedAtLevel('debug', 'disabled');
  });
});
```

## Contract Tests

Contract tests ensure FakeConfigService behaves like ChainglassConfigService.

### Using the Contract Test Factory

```typescript
// test/contracts/config.contract.ts
import { configServiceContractTests } from './config.contract.js';
import { FakeConfigService, ChainglassConfigService } from '@chainglass/shared';

// Run same tests against both implementations
configServiceContractTests('FakeConfigService', () => new FakeConfigService());

configServiceContractTests('ChainglassConfigService', () => {
  const service = new ChainglassConfigService({
    userConfigDir: null,
    projectConfigDir: null,
  });
  service.load();
  return service;
});
```

### Contract Test Coverage

The contract tests verify:

- `get()` returns undefined for unset config
- `require()` throws MissingConfigurationError when not set
- `set()` stores and `get()` retrieves correctly
- `set()` with null/undefined throws TypeError
- `isLoaded()` returns correct state

## Testing Config Validation

### Testing Zod Schema Validation

```typescript
import { describe, it, expect } from 'vitest';
import { MyFeatureConfigSchema } from '@chainglass/shared';

describe('MyFeatureConfigSchema', () => {
  it('should apply defaults for missing fields', () => {
    const result = MyFeatureConfigSchema.parse({});

    expect(result.enabled).toBe(true);
    expect(result.maxRetries).toBe(3);
  });

  it('should coerce string numbers', () => {
    const result = MyFeatureConfigSchema.parse({
      maxRetries: '5',  // String from env var
    });

    expect(result.maxRetries).toBe(5);  // Coerced to number
  });

  it('should reject out-of-range values', () => {
    expect(() => {
      MyFeatureConfigSchema.parse({ maxRetries: 100 });
    }).toThrow();
  });
});
```

### Testing Placeholder Expansion

```typescript
import { expandPlaceholders, validateNoUnexpandedPlaceholders } from '@chainglass/shared/config';

describe('placeholder expansion', () => {
  it('should expand from environment', () => {
    process.env.MY_VAR = 'test-value';

    const config = { key: '${MY_VAR}' };
    const expanded = expandPlaceholders(config);

    expect(expanded.key).toBe('test-value');
  });

  it('should throw on unexpanded placeholders', () => {
    const config = { key: '${MISSING_VAR}' };
    const expanded = expandPlaceholders(config);  // Leaves as-is

    expect(() => {
      validateNoUnexpandedPlaceholders(expanded);
    }).toThrow(/Unexpanded placeholder.*MISSING_VAR/);
  });
});
```

## Process.env Isolation

ChainglassConfigService mutates `process.env` during loading. Isolate tests:

```typescript
describe('config loading', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Snapshot
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore
    process.env = originalEnv;
  });

  it('should load secrets to env', () => {
    // Test modifies process.env safely
    const service = new ChainglassConfigService({
      userConfigDir: '/test/user',
      projectConfigDir: '/test/project',
    });
    // ... test ...
  });
});
```

## Integration Testing with Fixtures

Use fixture files for full pipeline tests:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ChainglassConfigService, SampleConfigType } from '@chainglass/shared';

describe('ChainglassConfigService integration', () => {
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));

    // Create fixture files
    fs.mkdirSync(path.join(tempDir, '.chainglass'));
    fs.writeFileSync(
      path.join(tempDir, '.chainglass', 'config.yaml'),
      'sample:\n  timeout: 60\n  name: fixture-test\n'
    );
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tempDir, { recursive: true });
  });

  it('should load from project config', () => {
    const service = new ChainglassConfigService({
      userConfigDir: null,
      projectConfigDir: path.join(tempDir, '.chainglass'),
    });
    service.load();

    const config = service.require(SampleConfigType);
    expect(config.timeout).toBe(60);
    expect(config.name).toBe('fixture-test');
  });
});
```

## Anti-Patterns to Avoid

### Don't Use vi.mock()

```typescript
// BAD - Banned by architecture rules
vi.mock('@chainglass/shared', () => ({
  ChainglassConfigService: vi.fn(),
}));

// GOOD - Use fakes
const fakeConfig = new FakeConfigService({ ... });
```

### Don't Share Fakes Between Tests

```typescript
// BAD - State leakage
const sharedFake = new FakeConfigService();

describe('tests', () => {
  it('test 1', () => {
    sharedFake.set(...);  // Affects test 2!
  });
  it('test 2', () => {
    // Sees state from test 1
  });
});

// GOOD - Fresh fakes per test
describe('tests', () => {
  it('test 1', () => {
    const fakeConfig = new FakeConfigService();
    // Isolated
  });
});
```

### Don't Test Implementation Details

```typescript
// BAD - Testing internal registry
expect(fakeConfig._registry.size).toBe(1);

// GOOD - Test behavior
expect(fakeConfig.has(SampleConfigType)).toBe(true);
```

## Next Steps

- [Overview](./1-overview.md) - Architecture and concepts
- [Usage Guide](./2-usage.md) - Adding and consuming configuration
