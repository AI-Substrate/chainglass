import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChainglassConfigService } from '../../packages/shared/src/config/chainglass-config.service.js';
import {
  ConfigurationError,
  LiteralSecretError,
} from '../../packages/shared/src/config/exceptions.js';
import {
  type SampleConfig,
  SampleConfigType,
} from '../../packages/shared/src/config/schemas/sample.schema.js';

/**
 * Integration tests for ChainglassConfigService.
 *
 * These tests verify the complete seven-phase loading pipeline:
 * 1. Load user secrets.env
 * 2. Load project secrets.env
 * 3. Load CWD .env with dotenv-expand
 * 4. Load YAML configs (user → project)
 * 5. Parse CG_* env vars
 * 6. Deep merge all sources
 * 7. Validate (placeholders, secrets, Zod)
 */
describe('ChainglassConfigService', () => {
  let tempDir: string;
  let userDir: string;
  let projectDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment (DYK-11: load() mutates process.env)
    originalEnv = { ...process.env };

    // Create temp directories
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-service-test-'));
    userDir = path.join(tempDir, 'user-config');
    projectDir = path.join(tempDir, 'project-config');
    fs.mkdirSync(userDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;

    // Clean up temp directories
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('basic loading', () => {
    it('should load config from user config.yaml', () => {
      /*
      Test Doc:
      - Why: Basic loading scenario - user config only
      - Contract: ChainglassConfigService loads and validates user config
      - Usage Notes: User config path passed to constructor
      - Quality Contribution: Verifies single-source loading works
      - Worked Example: User config.yaml { sample: { timeout: 45 } } → config.timeout = 45
      */
      fs.writeFileSync(
        path.join(userDir, 'config.yaml'),
        'sample:\n  enabled: true\n  timeout: 45\n  name: user-test\n'
      );

      const service = new ChainglassConfigService({
        userConfigDir: userDir,
        projectConfigDir: null,
      });
      service.load();

      const config = service.require(SampleConfigType);
      expect(config.timeout).toBe(45);
      expect(config.name).toBe('user-test');
    });

    it('should load config from project config.yaml', () => {
      /*
      Test Doc:
      - Why: Project-only config scenario
      - Contract: ChainglassConfigService loads project config when no user config
      - Usage Notes: Project config typically in .chainglass/config.yaml
      - Quality Contribution: Verifies project config loading
      - Worked Example: Project config.yaml { sample: { timeout: 90 } } → config.timeout = 90
      */
      fs.writeFileSync(
        path.join(projectDir, 'config.yaml'),
        'sample:\n  enabled: false\n  timeout: 90\n  name: project-test\n'
      );

      const service = new ChainglassConfigService({
        userConfigDir: null,
        projectConfigDir: projectDir,
      });
      service.load();

      const config = service.require(SampleConfigType);
      expect(config.timeout).toBe(90);
      expect(config.enabled).toBe(false);
    });
  });

  describe('precedence', () => {
    it('should override user config with project config', () => {
      /*
      Test Doc:
      - Why: Verify project-level overrides work
      - Contract: Project config values override user config values
      - Usage Notes: User values preserved if not overridden
      - Quality Contribution: Verifies precedence order
      - Worked Example: User timeout=30, Project timeout=60 → timeout=60
      */
      fs.writeFileSync(
        path.join(userDir, 'config.yaml'),
        'sample:\n  enabled: true\n  timeout: 30\n  name: user\n'
      );
      fs.writeFileSync(path.join(projectDir, 'config.yaml'), 'sample:\n  timeout: 60\n');

      const service = new ChainglassConfigService({
        userConfigDir: userDir,
        projectConfigDir: projectDir,
      });
      service.load();

      const config = service.require(SampleConfigType);
      expect(config.timeout).toBe(60); // Project overrides
      expect(config.enabled).toBe(true); // User preserved
      expect(config.name).toBe('user'); // User preserved
    });

    it('should override YAML config with CG_* env vars', () => {
      /*
      Test Doc:
      - Why: Env vars should have highest precedence
      - Contract: CG_SAMPLE__TIMEOUT overrides YAML timeout
      - Usage Notes: Double underscore for nesting in env vars
      - Quality Contribution: Verifies env var precedence
      - Worked Example: YAML timeout=30, CG_SAMPLE__TIMEOUT=120 → timeout=120
      */
      fs.writeFileSync(
        path.join(userDir, 'config.yaml'),
        'sample:\n  enabled: true\n  timeout: 30\n  name: yaml-config\n'
      );
      process.env.CG_SAMPLE__TIMEOUT = '120';

      const service = new ChainglassConfigService({
        userConfigDir: userDir,
        projectConfigDir: null,
      });
      service.load();

      const config = service.require(SampleConfigType);
      expect(config.timeout).toBe(120); // Env var wins
      expect(config.name).toBe('yaml-config'); // YAML preserved
    });

    it('should load config from all sources with correct precedence', () => {
      /*
      Test Doc:
      - Why: Verify complete precedence chain: env > project > user > defaults
      - Contract: Each source overrides lower-priority sources
      - Usage Notes: This is the full seven-phase pipeline test
      - Quality Contribution: Comprehensive precedence verification
      - Worked Example: User timeout=30, Project timeout=60, env CG_SAMPLE__TIMEOUT=90 → 90
      */
      fs.writeFileSync(
        path.join(userDir, 'config.yaml'),
        'sample:\n  enabled: true\n  timeout: 30\n  name: user-name\n'
      );
      fs.writeFileSync(
        path.join(projectDir, 'config.yaml'),
        'sample:\n  timeout: 60\n  name: project-name\n'
      );
      process.env.CG_SAMPLE__TIMEOUT = '90';

      const service = new ChainglassConfigService({
        userConfigDir: userDir,
        projectConfigDir: projectDir,
      });
      service.load();

      const config = service.require(SampleConfigType);
      expect(config.timeout).toBe(90); // env wins
      expect(config.name).toBe('project-name'); // project wins over user
      expect(config.enabled).toBe(true); // user preserved
    });
  });

  describe('placeholder expansion', () => {
    it('should expand ${VAR} placeholders from process.env', () => {
      /*
      Test Doc:
      - Why: Secrets use ${VAR} pattern to reference env vars
      - Contract: ${VAR} in config is replaced with process.env.VAR value
      - Usage Notes: Expansion happens after merge, before validation
      - Quality Contribution: Verifies placeholder expansion works
      - Worked Example: api_key: ${TEST_KEY} + process.env.TEST_KEY='secret' → api_key='secret'
      */
      process.env.TEST_API_KEY = 'expanded-api-key-value';
      fs.writeFileSync(
        path.join(userDir, 'config.yaml'),
        'sample:\n  enabled: true\n  timeout: 30\n  name: ${TEST_API_KEY}\n'
      );

      const service = new ChainglassConfigService({
        userConfigDir: userDir,
        projectConfigDir: null,
      });
      service.load();

      const config = service.require(SampleConfigType);
      expect(config.name).toBe('expanded-api-key-value');
    });

    it('should throw ConfigurationError for unexpanded placeholders', () => {
      /*
      Test Doc:
      - Why: Unexpanded ${VAR} indicates missing env var - security issue
      - Contract: Throws ConfigurationError if ${...} patterns remain after expansion
      - Usage Notes: Error message includes variable name and remediation hint
      - Quality Contribution: Catches missing secret configuration
      - Worked Example: ${MISSING_VAR} without env var → ConfigurationError
      */
      fs.writeFileSync(
        path.join(userDir, 'config.yaml'),
        'sample:\n  enabled: true\n  timeout: 30\n  name: ${MISSING_ENV_VAR}\n'
      );

      const service = new ChainglassConfigService({
        userConfigDir: userDir,
        projectConfigDir: null,
      });

      expect(() => service.load()).toThrow(ConfigurationError);
      expect(() => service.load()).toThrow(/MISSING_ENV_VAR/);
    });
  });

  describe('secret detection', () => {
    it('should throw LiteralSecretError for hardcoded OpenAI key', () => {
      /*
      Test Doc:
      - Why: Prevent hardcoded secrets in config files
      - Contract: Throws LiteralSecretError for detected secret patterns
      - Usage Notes: Error includes field path and secret type
      - Quality Contribution: Security gate for config loading
      - Worked Example: api_key: 'sk-xxx...' → LiteralSecretError('sample.api_key', 'OpenAI')
      */
      fs.writeFileSync(
        path.join(userDir, 'config.yaml'),
        'sample:\n  enabled: true\n  timeout: 30\n  name: sk-abc123def456ghi789jkl012mno\n'
      );

      const service = new ChainglassConfigService({
        userConfigDir: userDir,
        projectConfigDir: null,
      });

      expect(() => service.load()).toThrow(LiteralSecretError);
    });

    it('should throw LiteralSecretError for hardcoded Stripe test key (DYK-10)', () => {
      /*
      Test Doc:
      - Why: DYK-10: Stripe test keys detected as secrets (not whitelisted)
      - Contract: sk_test_* triggers LiteralSecretError just like sk_live_*
      - Usage Notes: Use secrets.env + ${STRIPE_SECRET_KEY} pattern instead
      - Quality Contribution: Consistent security for all Stripe keys
      - Worked Example: name: 'sk_test_xxx' → LiteralSecretError
      */
      fs.writeFileSync(
        path.join(userDir, 'config.yaml'),
        'sample:\n  enabled: true\n  timeout: 30\n  name: sk_test_abc123def456ghi789jkl012\n'
      );

      const service = new ChainglassConfigService({
        userConfigDir: userDir,
        projectConfigDir: null,
      });

      expect(() => service.load()).toThrow(LiteralSecretError);
    });

    it('should allow whitelisted test fixture prefixes', () => {
      /*
      Test Doc:
      - Why: Integration tests need realistic-looking values
      - Contract: sk_example_* prefix passes secret detection
      - Usage Notes: Use whitelist prefixes in test fixtures only
      - Quality Contribution: Enables testing with realistic patterns
      - Worked Example: name: 'sk_example_test123' → no error
      */
      fs.writeFileSync(
        path.join(userDir, 'config.yaml'),
        'sample:\n  enabled: true\n  timeout: 30\n  name: sk_example_test123456789012345\n'
      );

      const service = new ChainglassConfigService({
        userConfigDir: userDir,
        projectConfigDir: null,
      });

      // Should not throw
      service.load();
      const config = service.require(SampleConfigType);
      expect(config.name).toBe('sk_example_test123456789012345');
    });
  });

  describe('Zod validation', () => {
    it('should validate config against Zod schema', () => {
      /*
      Test Doc:
      - Why: Config values must pass Zod validation
      - Contract: Invalid values throw ZodError (wrapped as ConfigurationError)
      - Usage Notes: Zod provides type coercion (string "30" → number 30)
      - Quality Contribution: Type safety for all config values
      - Worked Example: timeout: 'invalid' → validation error
      */
      fs.writeFileSync(
        path.join(userDir, 'config.yaml'),
        'sample:\n  enabled: true\n  timeout: not-a-number\n  name: test\n'
      );

      const service = new ChainglassConfigService({
        userConfigDir: userDir,
        projectConfigDir: null,
      });

      expect(() => service.load()).toThrow();
    });

    it('should apply Zod defaults for missing fields', () => {
      /*
      Test Doc:
      - Why: Schema defaults fill in missing config values
      - Contract: Missing fields get Zod schema default values
      - Usage Notes: Partial config is valid - Zod fills in gaps
      - Quality Contribution: Zero-config startup possible
      - Worked Example: Empty config → { enabled: true, timeout: 30, name: 'default' }
      */
      fs.writeFileSync(path.join(userDir, 'config.yaml'), 'sample:\n  timeout: 45\n');

      const service = new ChainglassConfigService({
        userConfigDir: userDir,
        projectConfigDir: null,
      });
      service.load();

      const config = service.require(SampleConfigType);
      expect(config.timeout).toBe(45);
      expect(config.enabled).toBe(true); // Default
      expect(config.name).toBe('default'); // Default
    });

    it('should coerce string numbers to numbers (Zod coerce)', () => {
      /*
      Test Doc:
      - Why: Env vars are always strings, need coercion to numbers
      - Contract: z.coerce.number() converts "30" to 30
      - Usage Notes: YAML numbers parse as numbers, but env vars don't
      - Quality Contribution: Seamless env var override support
      - Worked Example: CG_SAMPLE__TIMEOUT="45" → timeout: 45 (number)
      */
      process.env.CG_SAMPLE__TIMEOUT = '75';
      fs.writeFileSync(
        path.join(userDir, 'config.yaml'),
        'sample:\n  enabled: true\n  name: test\n'
      );

      const service = new ChainglassConfigService({
        userConfigDir: userDir,
        projectConfigDir: null,
      });
      service.load();

      const config = service.require(SampleConfigType);
      expect(config.timeout).toBe(75);
      expect(typeof config.timeout).toBe('number');
    });
  });

  describe('lifecycle', () => {
    it('should be idempotent - second load() returns same config', () => {
      /*
      Test Doc:
      - Why: Multiple load() calls should be safe
      - Contract: Calling load() twice returns identical config
      - Usage Notes: Config is cached after first load
      - Quality Contribution: Prevents double-loading issues
      - Worked Example: load(); load(); → same result, no errors
      */
      fs.writeFileSync(
        path.join(userDir, 'config.yaml'),
        'sample:\n  enabled: true\n  timeout: 55\n  name: idempotent-test\n'
      );

      const service = new ChainglassConfigService({
        userConfigDir: userDir,
        projectConfigDir: null,
      });

      service.load();
      const config1 = service.require(SampleConfigType);

      service.load(); // Second load
      const config2 = service.require(SampleConfigType);

      expect(config1).toEqual(config2);
    });

    it('should return false for isLoaded() before load()', () => {
      /*
      Test Doc:
      - Why: DI factories need to verify config is loaded
      - Contract: isLoaded() returns false before load() is called
      - Usage Notes: Use to guard container creation
      - Quality Contribution: Explicit lifecycle state
      - Worked Example: new ChainglassConfigService() → isLoaded() = false
      */
      const service = new ChainglassConfigService({
        userConfigDir: userDir,
        projectConfigDir: null,
      });

      expect(service.isLoaded()).toBe(false);
    });

    it('should return true for isLoaded() after load()', () => {
      /*
      Test Doc:
      - Why: Verify isLoaded() state transition
      - Contract: isLoaded() returns true after successful load()
      - Usage Notes: State changes from false → true on load()
      - Quality Contribution: Lifecycle correctness
      - Worked Example: load() → isLoaded() = true
      */
      fs.writeFileSync(
        path.join(userDir, 'config.yaml'),
        'sample:\n  enabled: true\n  timeout: 30\n  name: test\n'
      );

      const service = new ChainglassConfigService({
        userConfigDir: userDir,
        projectConfigDir: null,
      });
      service.load();

      expect(service.isLoaded()).toBe(true);
    });
  });

  describe('missing config sources', () => {
    it('should work when all config sources are missing (uses defaults)', () => {
      /*
      Test Doc:
      - Why: Zero-config startup is a design goal
      - Contract: No config files + no env vars → Zod defaults only
      - Usage Notes: This is valid for first-run experience
      - Quality Contribution: Verifies graceful degradation
      - Worked Example: No configs at all → { enabled: true, timeout: 30, name: 'default' }
      */
      const service = new ChainglassConfigService({
        userConfigDir: userDir, // Empty dir
        projectConfigDir: projectDir, // Empty dir
      });
      service.load();

      const config = service.require(SampleConfigType);
      expect(config.enabled).toBe(true);
      expect(config.timeout).toBe(30);
      expect(config.name).toBe('default');
    });

    it('should handle null config directories', () => {
      /*
      Test Doc:
      - Why: Both directories can be null
      - Contract: null directories are skipped, uses defaults only
      - Usage Notes: Valid for minimal/embedded use cases
      - Quality Contribution: Null safety
      - Worked Example: Both null → loads with Zod defaults
      */
      const service = new ChainglassConfigService({
        userConfigDir: null,
        projectConfigDir: null,
      });
      service.load();

      const config = service.require(SampleConfigType);
      expect(config).toBeDefined();
      expect(config.timeout).toBe(30); // Default
    });
  });

  describe('performance', () => {
    it('should complete load() in <100ms', () => {
      /*
      Test Doc:
      - Why: Config loading should not slow startup
      - Contract: load() completes in under 100ms
      - Usage Notes: Synchronous loading - timing matters
      - Quality Contribution: Performance gate
      - Worked Example: load() takes ~10-50ms typically
      */
      fs.writeFileSync(
        path.join(userDir, 'config.yaml'),
        'sample:\n  enabled: true\n  timeout: 30\n  name: perf-test\n'
      );

      const service = new ChainglassConfigService({
        userConfigDir: userDir,
        projectConfigDir: projectDir,
      });

      const start = performance.now();
      service.load();
      const elapsed = performance.now() - start;

      console.log(`ChainglassConfigService.load() took ${elapsed.toFixed(2)}ms`);
      expect(elapsed).toBeLessThan(100);
    });
  });
});
