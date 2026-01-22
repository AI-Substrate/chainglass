# Phase 4: DI Integration - Fix Tasks

**Review Report**: [../reviews/review.phase-4-di-integration.md](../reviews/review.phase-4-di-integration.md)  
**Original Tasks**: [../tasks/phase-4-di-integration/tasks.md](../tasks/phase-4-di-integration/tasks.md)  
**Date**: 2026-01-27

---

## Fix Priority Order

**CRITICAL fixes** (block merge):
1. FIX-001: Resolve type safety violation in container factories
2. FIX-002: Add error logging at guard failure points (web)
3. FIX-003: Add error logging at guard failure points (MCP)

**HIGH fixes** (should fix before merge):
4. FIX-004: Add audit trail for config loading
5. FIX-005: Add audit trail for DI registration

**MEDIUM fixes** (recommended):
6. FIX-006: Implement transactional config loading
7. FIX-007: Add ReDoS protection in placeholder expansion
8. FIX-008: Migrate to async file operations
9. FIX-009: Add structured error context
10. FIX-010: Add performance metrics for container creation
11. FIX-011: Add observability for isLoaded() transitions

---

## CRITICAL Fixes (Must Complete)

### FIX-001: Resolve Type Safety Violation in Container Factories

**Severity**: CRITICAL  
**Finding ID**: COR-001, COR-002  
**Affected Files**:
- `apps/web/src/lib/di-container.ts` (lines 38-50)
- `packages/mcp-server/src/lib/di-container.ts` (lines 207-219)
- `test/unit/web/di-container.test.ts` (lines 494-503)

**Problem**: 
- Function signature has non-optional parameter: `config: IConfigService`
- Runtime guard at line 42-46 checks `if (!config)` but this is unreachable due to TypeScript
- Test attempts to call `createProductionContainer()` without arguments, which TypeScript prevents

**Decision Required**: Choose one approach:

**Option A (Recommended)**: Make parameter optional and fix guards
```typescript
// apps/web/src/lib/di-container.ts
export function createProductionContainer(config?: IConfigService): DependencyContainer {
  // Combined guard for both null and isLoaded
  if (!config || !config.isLoaded()) {
    throw new Error(
      'IConfigService required and must be loaded - call config.load() before createProductionContainer(config)'
    );
  }

  const childContainer = container.createChildContainer();
  // ... rest unchanged
}
```

**Option B**: Remove guard, rely on TypeScript type system
```typescript
// apps/web/src/lib/di-container.ts
export function createProductionContainer(config: IConfigService): DependencyContainer {
  // Only check isLoaded() - TypeScript prevents null/undefined
  if (!config.isLoaded()) {
    throw new Error(
      'Config not loaded - call config.load() before createProductionContainer(config)'
    );
  }

  const childContainer = container.createChildContainer();
  // ... rest unchanged
}

// test/unit/web/di-container.test.ts
// Remove or update test at lines 494-504 - cannot test missing config with non-optional param
it('should throw if config not loaded before passing to production container', () => {
  const config = new ChainglassConfigService({
    userConfigDir: tempUserDir,
    projectConfigDir: tempProjectDir,
  });
  // Don't call config.load()
  
  expect(() => createProductionContainer(config)).to.throw('Config not loaded');
});
```

**Recommended**: **Option A** - provides runtime safety for JavaScript consumers and explicit error messages.

**Apply same fix to**:
- `packages/mcp-server/src/lib/di-container.ts` (createMcpProductionContainer function)

**Testing**:
- Update test at `test/unit/web/di-container.test.ts:494-503` to match chosen approach
- Ensure `pnpm tsc --noEmit` passes
- Ensure `pnpm test -- --run test/unit/web/di-container.test.ts` passes

---

### FIX-002: Add Error Logging at Guard Failure Points (Web)

**Severity**: CRITICAL  
**Finding ID**: OBS-001  
**Affected Files**:
- `apps/web/src/lib/di-container.ts` (lines 40-50)

**Problem**: When config validation fails, no log entry is created. Silent failures make debugging impossible.

**Fix** (Full TDD approach):

**Step 1: Write test for error logging (RED phase)**

Add test to `test/unit/web/di-container.test.ts` after existing "Config Registration" tests:

```typescript
// Add to "Config Registration (Phase 4)" describe block
it('should log error before throwing when config is missing', () => {
  const fakeLogger = new FakeLogger();
  
  // Attempt to create container without config (if Option A chosen for FIX-001)
  expect(() => createProductionContainer(undefined, fakeLogger)).to.throw('IConfigService required');
  
  // Verify error was logged
  const errorLogs = fakeLogger.getLogs().filter(log => log.level === 'error');
  expect(errorLogs).to.have.lengthOf(1);
  expect(errorLogs[0].message).to.include('Config validation failed');
});

it('should log error before throwing when config is not loaded', () => {
  const fakeLogger = new FakeLogger();
  const config = new ChainglassConfigService({
    userConfigDir: tempUserDir,
    projectConfigDir: tempProjectDir,
  });
  // Don't call config.load()
  
  expect(() => createProductionContainer(config, fakeLogger)).to.throw('Config not loaded');
  
  // Verify error was logged
  const errorLogs = fakeLogger.getLogs().filter(log => log.level === 'error');
  expect(errorLogs).to.have.lengthOf(1);
  expect(errorLogs[0].message).to.include('Config not loaded');
});
```

**Step 2: Update function signature to accept optional logger (GREEN phase)**

```typescript
// apps/web/src/lib/di-container.ts

/**
 * Creates a production DI container with real adapter implementations.
 *
 * Use in application startup code (not in tests).
 *
 * Per Critical Discovery 02: Config must be loaded BEFORE calling this function.
 * See bootstrap.ts for correct startup sequence.
 *
 * @param config Pre-loaded IConfigService instance (must have isLoaded() === true)
 * @param logger Optional logger for error reporting (uses console if not provided)
 * @returns Child container with production registrations
 * @throws Error if config is missing or not loaded
 */
export function createProductionContainer(
  config?: IConfigService,
  logger?: ILogger
): DependencyContainer {
  // Combined guard with logging
  if (!config || !config.isLoaded()) {
    const errorMsg = !config
      ? 'IConfigService required - call config.load() before createProductionContainer(config)'
      : 'Config not loaded - call config.load() before createProductionContainer(config)';
    
    // Log error before throwing
    if (logger) {
      logger.error(errorMsg, { reason: !config ? 'config_missing' : 'config_not_loaded' });
    } else {
      console.error(`[createProductionContainer] ${errorMsg}`);
    }
    
    throw new Error(errorMsg);
  }

  const childContainer = container.createChildContainer();

  // Register pre-loaded config as value (not factory)
  childContainer.register<IConfigService>(DI_TOKENS.CONFIG, {
    useValue: config,
  });

  // Register production adapters using factory pattern
  childContainer.register<ILogger>(DI_TOKENS.LOGGER, {
    useFactory: () => new PinoLoggerAdapter(),
  });

  // Register SampleService with factory for explicit DI
  childContainer.register(DI_TOKENS.SAMPLE_SERVICE, {
    useFactory: (c) => {
      const resolvedLogger = c.resolve<ILogger>(DI_TOKENS.LOGGER);
      const cfg = c.resolve<IConfigService>(DI_TOKENS.CONFIG);
      return new SampleService(resolvedLogger, cfg);
    },
  });

  return childContainer;
}
```

**Step 3: Update bootstrap.ts to pass logger (if available)**

```typescript
// apps/web/src/lib/bootstrap.ts

export function bootstrap(options: BootstrapOptions = {}): BootstrapResult {
  // ... existing code ...

  // 2. Call config.load() synchronously
  config.load(); // Throws on validation error - fail fast

  // 3. Verify config.isLoaded()
  if (!config.isLoaded()) {
    throw new Error('Config failed to load');
  }

  // 4. Pass to createProductionContainer() - optionally pass logger for error logging
  const container = createProductionContainer(config);

  return { container, config };
}
```

**Testing**:
- Run `pnpm test -- --run test/unit/web/di-container.test.ts`
- Verify new tests pass
- Verify error logs appear in test output

---

### FIX-003: Add Error Logging at Guard Failure Points (MCP)

**Severity**: CRITICAL  
**Finding ID**: OBS-002  
**Affected Files**:
- `packages/mcp-server/src/lib/di-container.ts` (lines 207-219)

**Problem**: MCP startup errors won't be logged. In stdio mode, error visibility is critical.

**Fix** (Full TDD approach):

**Step 1: Write test for error logging (RED phase)**

Add test to `test/unit/mcp/di-container.test.ts`:

```typescript
// Add to existing describe block
it('should log error before throwing when config is missing', () => {
  // Capture console.error calls
  const consoleErrorSpy = vi.spyOn(console, 'error');
  
  expect(() => createMcpProductionContainer(undefined)).to.throw('IConfigService required');
  
  // Verify console.error was called
  expect(consoleErrorSpy).toHaveBeenCalledWith(
    expect.stringContaining('[createMcpProductionContainer] IConfigService required')
  );
  
  consoleErrorSpy.mockRestore();
});

it('should log error before throwing when config is not loaded', () => {
  const consoleErrorSpy = vi.spyOn(console, 'error');
  const config = new ChainglassConfigService({
    userConfigDir: tempUserDir,
    projectConfigDir: tempProjectDir,
  });
  // Don't call config.load()
  
  expect(() => createMcpProductionContainer(config)).to.throw('Config not loaded');
  
  expect(consoleErrorSpy).toHaveBeenCalledWith(
    expect.stringContaining('[createMcpProductionContainer] Config not loaded')
  );
  
  consoleErrorSpy.mockRestore();
});
```

**Step 2: Update function with logging (GREEN phase)**

```typescript
// packages/mcp-server/src/lib/di-container.ts

export function createMcpProductionContainer(config?: IConfigService): DependencyContainer {
  // Combined guard with console.error logging
  if (!config || !config.isLoaded()) {
    const errorMsg = !config
      ? 'IConfigService required - call config.load() before createMcpProductionContainer(config)'
      : 'Config not loaded - call config.load() before createMcpProductionContainer(config)';
    
    // Log to stderr for stdio transport visibility
    console.error(`[createMcpProductionContainer] ${errorMsg}`);
    
    throw new Error(errorMsg);
  }

  const childContainer = container.createChildContainer();

  // Register pre-loaded config as value
  childContainer.register<IConfigService>(MCP_DI_TOKENS.CONFIG, {
    useValue: config,
  });

  // ... rest unchanged
  
  return childContainer;
}
```

**Testing**:
- Run `pnpm test -- --run test/unit/mcp/di-container.test.ts`
- Verify new tests pass
- Verify console.error output appears in test output

---

## HIGH Fixes (Recommended Before Merge)

### FIX-004: Add Audit Trail for Config Loading

**Severity**: HIGH  
**Finding ID**: OBS-003  
**Affected Files**:
- `apps/web/src/services/sample.service.ts` (lines 135-141)

**Problem**: No record of which config was loaded or when. Cannot trace config-related issues.

**Fix** (Full TDD approach):

**Step 1: Write test for config loading log (RED phase)**

Add test to `test/unit/web/sample-service.test.ts`:

```typescript
it('should log when config is loaded at construction time', () => {
  const fakeLogger = new FakeLogger();
  const fakeConfig = new FakeConfigService({
    sample: { enabled: false, timeout: 60, name: 'audit-test' },
  });
  
  new SampleService(fakeLogger, fakeConfig);
  
  // Verify config loading was logged
  const infoLogs = fakeLogger.getLogs().filter(log => log.level === 'info');
  expect(infoLogs.some(log => 
    log.message.includes('Config loaded') && 
    log.message.includes('SampleConfig')
  )).to.be.true;
});
```

**Step 2: Add logging to SampleService constructor (GREEN phase)**

```typescript
// apps/web/src/services/sample.service.ts

export class SampleService {
  private readonly logger: ILogger;
  private readonly sampleConfig: SampleConfig;

  constructor(logger: ILogger, config: IConfigService) {
    this.logger = logger;
    
    // Load config at construction time (fail-fast if missing)
    this.sampleConfig = config.require(SampleConfigType);
    
    // Audit log: Record which config was loaded with values
    this.logger.info('SampleConfig loaded', {
      configType: 'SampleConfig',
      enabled: this.sampleConfig.enabled,
      timeout: this.sampleConfig.timeout,
      name: this.sampleConfig.name,
    });
  }

  // ... rest unchanged
}
```

**Testing**:
- Run `pnpm test -- --run test/unit/web/sample-service.test.ts`
- Verify new test passes
- Verify existing tests still pass (constructor now logs)

---

### FIX-005: Add Audit Trail for DI Registration

**Severity**: HIGH  
**Finding ID**: OBS-004  
**Affected Files**:
- `apps/web/src/lib/di-container.ts` (lines 52-58)
- `packages/mcp-server/src/lib/di-container.ts` (lines 220-226)

**Problem**: Config registration happens without any log events. No operational visibility.

**Fix**:

```typescript
// apps/web/src/lib/di-container.ts

export function createProductionContainer(
  config?: IConfigService,
  logger?: ILogger
): DependencyContainer {
  // ... validation guards ...

  const childContainer = container.createChildContainer();

  // Register pre-loaded config as value
  childContainer.register<IConfigService>(DI_TOKENS.CONFIG, {
    useValue: config,
  });
  
  // Audit log: Record config registration
  if (logger) {
    logger.info('Config registered in production DI container', {
      configLoaded: config.isLoaded(),
    });
  } else {
    console.log('[createProductionContainer] Config registered in DI container');
  }

  // ... rest unchanged
}
```

Apply same pattern to `packages/mcp-server/src/lib/di-container.ts`:

```typescript
// packages/mcp-server/src/lib/di-container.ts

export function createMcpProductionContainer(config?: IConfigService): DependencyContainer {
  // ... validation guards ...

  const childContainer = container.createChildContainer();

  childContainer.register<IConfigService>(MCP_DI_TOKENS.CONFIG, {
    useValue: config,
  });
  
  // Audit log to stderr for stdio visibility
  console.log('[createMcpProductionContainer] Config registered in MCP DI container');

  // ... rest unchanged
}
```

**Testing**:
- Run `pnpm test -- --run test/unit/web/di-container.test.ts test/unit/mcp/di-container.test.ts`
- Check console output for registration log messages
- Existing tests should still pass

---

## MEDIUM Fixes (Recommended)

### FIX-006: Implement Transactional Config Loading

**Severity**: MEDIUM  
**Finding ID**: SEC-001  
**Affected Files**:
- `packages/shared/src/config/chainglass-config.service.ts` (lines 39-41, 92-95, 121-128)

**Problem**: Secrets loaded to process.env before validation. If validation fails, process.env is corrupted.

**Fix Strategy**: Refactor loading pipeline to validate before committing to process.env

**Recommended Approach**:
1. Phase 1-6: Collect into temporary Map<string, string>
2. Phase 7: Validate entire pipeline
3. Phase 8 (new): Commit to process.env only on success

**Implementation**:

```typescript
// packages/shared/src/config/chainglass-config.service.ts

public load(): void {
  if (this._loaded) return;

  // Temporary state for transactional loading
  const pendingSecrets = new Map<string, string>();
  
  try {
    // Phase 1: Load secrets to temporary map (not process.env yet)
    const secretsLoaded = this.loadSecretsPhase(pendingSecrets);
    
    // Phases 2-6: Load configs as before
    const userYaml = this.loadYamlFiles();
    const envOverrides = this.parseEnvironmentVariables();
    const merged = this.mergeConfigs(userYaml, envOverrides);
    const expanded = this.expandPlaceholders(merged);
    
    // Phase 7: Validate (before process.env mutation)
    this.validateConfig(expanded);
    
    // Phase 8: Commit secrets to process.env (only on success)
    if (secretsLoaded) {
      for (const [key, value] of pendingSecrets.entries()) {
        process.env[key] = value;
      }
    }
    
    // Mark as loaded
    this._loaded = true;
    this.registry = expanded;
    
  } catch (error) {
    // Rollback: pendingSecrets not committed to process.env
    throw error;
  }
}

private loadSecretsPhase(pendingSecrets: Map<string, string>): boolean {
  // Load secrets into pendingSecrets map instead of process.env
  // Return true if secrets were loaded, false if no secrets.env found
  const secretsEnvPath = path.join(this.options.userConfigDir, 'secrets.env');
  
  if (!fs.existsSync(secretsEnvPath)) {
    return false; // No secrets to load
  }
  
  const secretsContent = fs.readFileSync(secretsEnvPath, 'utf-8');
  const parsed = /* dotenv parsing logic */;
  
  for (const [key, value] of Object.entries(parsed)) {
    pendingSecrets.set(key, value);
  }
  
  return true;
}
```

**Testing**:
- Add test for validation failure with secrets: verify process.env unchanged
- Verify existing integration tests still pass

---

### FIX-007: Add ReDoS Protection in Placeholder Expansion

**Severity**: MEDIUM  
**Finding ID**: SEC-002  
**Affected Files**:
- `packages/shared/src/config/loaders/secrets.loader.ts` (lines 116-153)

**Problem**: Recursive expansion without depth limit. Nested `${${VAR}}` could cause DOS.

**Fix**:

```typescript
// packages/shared/src/config/loaders/secrets.loader.ts

function expandValue(
  value: string,
  lookup: Record<string, string | undefined>,
  depth = 0
): string {
  // Guard against infinite recursion
  const MAX_DEPTH = 5;
  if (depth > MAX_DEPTH) {
    throw new Error(
      `Placeholder expansion exceeded max depth (${MAX_DEPTH}). Check for circular references or nested placeholders.`
    );
  }
  
  // If no more ${...} patterns, return as-is
  if (!value.includes('${')) {
    return value;
  }
  
  // Replace all ${VAR} patterns
  return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    const resolved = lookup[varName];
    
    if (resolved === undefined) {
      return match; // Leave unexpanded if not found
    }
    
    // Recursively expand with incremented depth
    return expandValue(resolved, lookup, depth + 1);
  });
}
```

**Testing**:
- Add test for nested placeholders: `${A}` → `${B}` → `value` (should work up to depth 5)
- Add test for circular refs: `${A}` → `${B}` → `${A}` (should throw after depth 5)
- Add test for excessive nesting: `${${${${${${VAR}}}}}}` (should throw)

---

### FIX-008: Migrate to Async File Operations

**Severity**: MEDIUM  
**Finding ID**: SEC-003  
**Affected Files**:
- `packages/shared/src/config/loaders/secrets.loader.ts` (line 58)

**Problem**: Synchronous file read blocks event loop during startup.

**Note**: This requires making `load()` async, which is a breaking change. Recommend deferring to Phase 5 or future refactor.

**Alternative (non-breaking)**: Document blocking behavior and recommend preloading in separate script if startup time is critical.

---

### FIX-009: Add Structured Error Context

**Severity**: MEDIUM  
**Finding ID**: OBS-005  
**Affected Files**:
- `apps/web/src/lib/di-container.ts` (lines 40-50)
- `packages/mcp-server/src/lib/di-container.ts` (lines 209-219)

**Problem**: Error messages are plain text, not machine-readable for metrics/alerts.

**Fix**:

```typescript
// apps/web/src/lib/di-container.ts

export function createProductionContainer(
  config?: IConfigService,
  logger?: ILogger
): DependencyContainer {
  if (!config || !config.isLoaded()) {
    const errorCode = !config ? 'CONFIG_REQUIRED' : 'CONFIG_NOT_LOADED';
    const errorMsg = !config
      ? 'IConfigService required - call config.load() before createProductionContainer(config)'
      : 'Config not loaded - call config.load() before createProductionContainer(config)';
    
    // Log with structured context
    const errorContext = {
      errorCode,
      service: 'production-container',
      configProvided: !!config,
      configLoaded: config?.isLoaded() ?? false,
    };
    
    if (logger) {
      logger.error(errorMsg, errorContext);
    } else {
      console.error(`[createProductionContainer] ${errorMsg}`, errorContext);
    }
    
    throw new Error(`${errorCode}: ${errorMsg}`);
  }

  // ... rest unchanged
}
```

**Testing**:
- Update existing tests to match new error message format
- Add test to verify structured context is logged

---

### FIX-010: Add Performance Metrics for Container Creation

**Severity**: MEDIUM  
**Finding ID**: OBS-006  
**Affected Files**:
- `apps/web/src/lib/di-container.ts` (lines 38-80)
- `packages/mcp-server/src/lib/di-container.ts` (lines 207-240)

**Problem**: Cannot detect slow DI container initialization. No baseline for optimization.

**Fix**:

```typescript
// apps/web/src/lib/di-container.ts

export function createProductionContainer(
  config?: IConfigService,
  logger?: ILogger
): DependencyContainer {
  const startTime = performance.now();
  
  // ... validation guards ...

  const childContainer = container.createChildContainer();

  // ... registrations ...

  const durationMs = performance.now() - startTime;
  
  if (logger) {
    logger.debug('Production DI container created', { durationMs });
  } else {
    console.log(`[createProductionContainer] Container created in ${durationMs.toFixed(2)}ms`);
  }

  return childContainer;
}
```

Apply same pattern to MCP container.

**Testing**:
- Run tests and check console output for timing logs
- Verify log messages include duration in milliseconds

---

### FIX-011: Add Observability for isLoaded() Transitions

**Severity**: MEDIUM  
**Finding ID**: OBS-007  
**Affected Files**:
- `packages/shared/src/fakes/fake-config.service.ts` (lines 309-311)

**Problem**: Cannot see when config transitions to loaded state.

**Fix**:

```typescript
// packages/shared/src/fakes/fake-config.service.ts

export class FakeConfigService implements IConfigService {
  private readonly registry: Map<string, unknown>;
  private wasLoaded = false; // Track state transitions

  constructor(initialConfig: Record<string, unknown> = {}) {
    this.registry = new Map();
    
    // Pre-populate with initial config
    for (const [key, value] of Object.entries(initialConfig)) {
      this.set(key as ConfigType, value);
    }
    
    if (this.registry.size > 0) {
      this.wasLoaded = true;
    }
  }

  set<T>(configType: ConfigType, value: T): void {
    const wasLoadedBefore = this.wasLoaded;
    
    this.registry.set(configType as string, value);
    
    // Detect state transition: false → true
    if (!wasLoadedBefore && this.registry.size > 0) {
      this.wasLoaded = true;
      console.log(`[FakeConfigService] Config loaded: ${configType}`);
    }
  }

  isLoaded(): boolean {
    return this.registry.size > 0;
  }

  // ... rest unchanged
}
```

**Testing**:
- Check console output in test runs for lifecycle logs
- Verify logs only appear on first set() call (state transition)

---

## Summary

**Total Fixes**: 11  
**CRITICAL**: 3 (must fix before merge)  
**HIGH**: 2 (should fix before merge)  
**MEDIUM**: 6 (recommended)

**Testing After Fixes**:
```bash
# Run full test suite
pnpm test -- --run

# Run type checking
pnpm tsc --noEmit

# Run specific test files if needed
pnpm test -- --run test/unit/web/di-container.test.ts
pnpm test -- --run test/unit/mcp/di-container.test.ts
pnpm test -- --run test/unit/web/sample-service.test.ts
```

**Next Steps**:
1. Implement CRITICAL fixes (FIX-001, FIX-002, FIX-003)
2. Implement HIGH fixes (FIX-004, FIX-005)
3. Run full test suite
4. Rerun `/plan-7-code-review` to validate fixes
5. Commit and proceed to merge

---

**Fix Tasks Complete**: Ready for implementation via `/plan-6-implement-phase --subtask fix-tasks`
