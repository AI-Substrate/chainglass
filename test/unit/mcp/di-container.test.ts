/**
 * DI Container Tests for @chainglass/mcp-server
 *
 * Tests the MCP-specific DI container configuration:
 * - Production container uses stderr-configured logger
 * - Test container uses FakeLogger
 * - Config registration works correctly
 *
 * Per DYK-18: Logger is config-independent (no ordering concern).
 */

// Must import reflect-metadata before tsyringe
import 'reflect-metadata';
import {
  MCP_DI_TOKENS,
  createMcpProductionContainer,
  createMcpTestContainer,
} from '@chainglass/mcp-server/lib/di-container';
import {
  FakeConfigService,
  FakeLogger,
  type IConfigService,
  type ILogger,
  PinoLoggerAdapter,
  SampleConfigType,
} from '@chainglass/shared';
import { container } from 'tsyringe';
import { beforeEach, describe, expect, it } from 'vitest';

describe('MCP DI Container', () => {
  beforeEach(() => {
    container.clearInstances();
  });

  it('should resolve IConfigService from MCP production container', async () => {
    /*
    Test Doc:
    - Why: Verifies T009 - MCP container must register CONFIG token
    - Contract: createMcpProductionContainer(config) resolves MCP_DI_TOKENS.CONFIG
    - Usage Notes: Config must be pre-loaded before passing to container
    - Quality Contribution: Catches missing config registration in MCP DI
    - Worked Example: createMcpProductionContainer(loadedConfig).resolve(CONFIG) returns IConfigService
    */
    const { ChainglassConfigService } = await import('@chainglass/shared');
    const config = new ChainglassConfigService({
      userConfigDir: null,
      projectConfigDir: null,
    });
    config.load();

    const mcpContainer = createMcpProductionContainer(config);
    const resolvedConfig = mcpContainer.resolve<IConfigService>(MCP_DI_TOKENS.CONFIG);

    expect(resolvedConfig).toBe(config);
    expect(resolvedConfig.isLoaded()).toBe(true);
  });

  it('should use FakeConfigService in MCP test container', () => {
    /*
    Test Doc:
    - Why: Test container must use FakeConfigService for deterministic tests
    - Contract: createMcpTestContainer() resolves CONFIG to FakeConfigService
    - Usage Notes: FakeConfigService pre-populated with defaults
    - Quality Contribution: Catches test container misconfiguration
    - Worked Example: createMcpTestContainer().resolve(CONFIG) returns FakeConfigService
    */
    const mcpContainer = createMcpTestContainer();
    const configService = mcpContainer.resolve<IConfigService>(MCP_DI_TOKENS.CONFIG);

    expect(configService).toBeInstanceOf(FakeConfigService);
  });

  it('should resolve ILogger from MCP test container', () => {
    /*
    Test Doc:
    - Why: Verify logger registration works in test container
    - Contract: createMcpTestContainer() resolves LOGGER to FakeLogger
    - Usage Notes: FakeLogger allows log assertions in tests
    - Quality Contribution: Catches missing logger registration
    - Worked Example: createMcpTestContainer().resolve(LOGGER) returns FakeLogger
    */
    const mcpContainer = createMcpTestContainer();
    const logger = mcpContainer.resolve<ILogger>(MCP_DI_TOKENS.LOGGER);

    expect(logger).toBeInstanceOf(FakeLogger);
  });

  it('should throw if MCP production container created without config', () => {
    /*
    Test Doc:
    - Why: Fail-fast if config not provided; prevents runtime errors
    - Contract: createMcpProductionContainer() without config throws
    - Usage Notes: Always call config.load() before createMcpProductionContainer(config)
    - Quality Contribution: Catches startup bugs where config loading was forgotten
    - Worked Example: createMcpProductionContainer() → throws "CONFIG_REQUIRED: IConfigService required"
    */
    expect(() => createMcpProductionContainer()).toThrow('CONFIG_REQUIRED');
  });

  it('should throw if config not loaded before passing to MCP production container', async () => {
    /*
    Test Doc:
    - Why: Guards against unloaded config being passed to container
    - Contract: createMcpProductionContainer(unloadedConfig) throws
    - Usage Notes: Call config.load() before passing to container
    - Quality Contribution: Catches startup bugs where load() was not called
    - Worked Example: createMcpProductionContainer(new ConfigService()) → throws "CONFIG_NOT_LOADED: Config not loaded"
    */
    const { ChainglassConfigService } = await import('@chainglass/shared');
    const config = new ChainglassConfigService({
      userConfigDir: null,
      projectConfigDir: null,
    });
    // Intentionally NOT calling config.load()

    expect(() => createMcpProductionContainer(config)).toThrow('CONFIG_NOT_LOADED');
  });

  it('should pre-populate FakeConfigService with sample config in MCP test container', () => {
    /*
    Test Doc:
    - Why: Tests need sensible defaults without manual setup
    - Contract: createMcpTestContainer() provides FakeConfigService with SampleConfig
    - Usage Notes: Default name is 'mcp-test-fixture' to distinguish from web tests
    - Quality Contribution: Reduces boilerplate; ensures consistent test config
    - Worked Example: createMcpTestContainer().resolve(CONFIG).require(SampleConfigType).name === 'mcp-test-fixture'
    */
    const mcpContainer = createMcpTestContainer();
    const configService = mcpContainer.resolve<IConfigService>(MCP_DI_TOKENS.CONFIG);

    const sampleConfig = configService.require(SampleConfigType);

    expect(sampleConfig).toBeDefined();
    expect(sampleConfig.enabled).toBe(true);
    expect(sampleConfig.timeout).toBe(30);
    expect(sampleConfig.name).toBe('mcp-test-fixture');
  });
});
