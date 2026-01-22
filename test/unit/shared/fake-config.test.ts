import { describe, expect, it } from 'vitest';

import { FakeConfigService } from '@chainglass/shared/fakes';
import type { IConfigService } from '@chainglass/shared/interfaces';
import {
  type SampleConfig,
  SampleConfigType,
} from '../../../packages/shared/src/config/schemas/sample.schema.js';

/**
 * Unit tests for FakeConfigService.
 *
 * These tests cover FakeConfigService-specific functionality beyond the contract tests:
 * - Constructor injection of pre-populated configs
 * - Test helper methods (getSetConfigs, has, assertConfigSet)
 * - Type safety edge cases
 */
describe('FakeConfigService', () => {
  describe('constructor injection', () => {
    it('should accept pre-populated configs in constructor', () => {
      /*
      Test Doc:
      - Why: Enable easy test setup with predetermined config values
      - Contract: Constructor accepts Record<configPath, config> and populates registry
      - Usage Notes: Pass object keyed by configPath (e.g., 'sample' for SampleConfigType)
      - Quality Contribution: Simplifies test setup - no need to call set() individually
      - Worked Example: new FakeConfigService({ sample: { enabled: true, timeout: 30, name: 'test' } })
      */
      const prePopulated: SampleConfig = { enabled: true, timeout: 30, name: 'pre-populated' };
      const service = new FakeConfigService({ sample: prePopulated });

      expect(service.get(SampleConfigType)).toEqual(prePopulated);
    });

    it('should return pre-populated config via require()', () => {
      /*
      Test Doc:
      - Why: Verify constructor configs are accessible via require() as well as get()
      - Contract: Pre-populated configs satisfy both get() and require() calls
      - Usage Notes: require() should not throw after constructor injection
      - Quality Contribution: Ensures constructor injection is complete
      - Worked Example: new FakeConfigService({ sample: config }); require(SampleConfigType) → config
      */
      const prePopulated: SampleConfig = { enabled: false, timeout: 60, name: 'via-require' };
      const service = new FakeConfigService({ sample: prePopulated });

      expect(service.require(SampleConfigType)).toEqual(prePopulated);
    });

    it('should allow empty constructor', () => {
      /*
      Test Doc:
      - Why: Sometimes tests need a clean config service with no pre-populated values
      - Contract: new FakeConfigService() creates empty registry
      - Usage Notes: Use set() to add configs after construction
      - Quality Contribution: Verifies default constructor behavior
      - Worked Example: new FakeConfigService(); get(SampleConfigType) → undefined
      */
      const service = new FakeConfigService();

      expect(service.get(SampleConfigType)).toBeUndefined();
    });
  });

  describe('test helper methods', () => {
    it('should provide getSetConfigs() returning all configs', () => {
      /*
      Test Doc:
      - Why: Tests may need to verify which configs have been set
      - Contract: getSetConfigs() returns Map<configPath, config> of all registered configs
      - Usage Notes: Use for debugging or verifying config state in complex tests
      - Quality Contribution: Enables inspection of internal state for test assertions
      - Worked Example: service.set(type, config); getSetConfigs().get('sample') → config
      */
      const config: SampleConfig = { enabled: true, timeout: 45, name: 'getSetConfigs-test' };
      const service = new FakeConfigService({ sample: config });

      const allConfigs = service.getSetConfigs();

      expect(allConfigs).toBeInstanceOf(Map);
      expect(allConfigs.get('sample')).toEqual(config);
    });

    it('should provide has() for quick existence check', () => {
      /*
      Test Doc:
      - Why: Quick boolean check for config existence without fetching value
      - Contract: has(type) returns true if config set, false otherwise
      - Usage Notes: More readable than checking get() !== undefined
      - Quality Contribution: Improves test readability
      - Worked Example: service.has(SampleConfigType) → true/false
      */
      const service = new FakeConfigService();

      expect(service.has(SampleConfigType)).toBe(false);

      service.set(SampleConfigType, { enabled: true, timeout: 30, name: 'has-test' });

      expect(service.has(SampleConfigType)).toBe(true);
    });

    it('should provide assertConfigSet() that throws if not set', () => {
      /*
      Test Doc:
      - Why: Assertion-style helper for tests that expect config to be set
      - Contract: assertConfigSet(type) throws if config not set, returns void if set
      - Usage Notes: Use in test setup to verify preconditions
      - Quality Contribution: Provides clear failure message when config missing
      - Worked Example: assertConfigSet(SampleConfigType) throws if not set
      */
      const service = new FakeConfigService();

      expect(() => service.assertConfigSet(SampleConfigType)).toThrow();
      expect(() => service.assertConfigSet(SampleConfigType)).toThrow(/sample/);

      service.set(SampleConfigType, { enabled: true, timeout: 30, name: 'assertConfigSet-test' });

      expect(() => service.assertConfigSet(SampleConfigType)).not.toThrow();
    });

    it('should allow custom message in assertConfigSet()', () => {
      /*
      Test Doc:
      - Why: Custom messages improve test failure debugging
      - Contract: assertConfigSet(type, message) includes custom message in error
      - Usage Notes: Optional second parameter for custom context
      - Quality Contribution: Better error messages in complex test scenarios
      - Worked Example: assertConfigSet(type, 'during setup') → Error includes 'during setup'
      */
      const service = new FakeConfigService();

      expect(() => service.assertConfigSet(SampleConfigType, 'during test setup')).toThrow(
        /during test setup/
      );
    });
  });

  describe('type safety', () => {
    it('should reject null in set()', () => {
      /*
      Test Doc:
      - Why: Null configs should not be allowed - use undefined for missing
      - Contract: set(type, null) throws TypeError
      - Usage Notes: TypeScript should catch this at compile time, but runtime check is safety net
      - Quality Contribution: Prevents subtle bugs from null configs
      - Worked Example: service.set(SampleConfigType, null) → throws TypeError
      */
      const service = new FakeConfigService();

      expect(() => service.set(SampleConfigType, null as unknown as SampleConfig)).toThrow(
        TypeError
      );
    });

    it('should reject undefined in set()', () => {
      /*
      Test Doc:
      - Why: Setting undefined would make the config appear unset
      - Contract: set(type, undefined) throws TypeError
      - Usage Notes: To "unset" a config, implementations could add a clear() method
      - Quality Contribution: Prevents confusion between set-to-undefined and not-set
      - Worked Example: service.set(SampleConfigType, undefined) → throws TypeError
      */
      const service = new FakeConfigService();

      expect(() => service.set(SampleConfigType, undefined as unknown as SampleConfig)).toThrow(
        TypeError
      );
    });
  });

  describe('interface compliance', () => {
    it('should implement IConfigService', () => {
      /*
      Test Doc:
      - Why: Verify FakeConfigService can be used wherever IConfigService is expected
      - Contract: FakeConfigService assignable to IConfigService
      - Usage Notes: This is a compile-time check; runtime test is just a sanity check
      - Quality Contribution: Catches interface drift at compile time
      - Worked Example: const svc: IConfigService = new FakeConfigService() → compiles
      */
      const service: IConfigService = new FakeConfigService();

      expect(service.get).toBeDefined();
      expect(service.require).toBeDefined();
      expect(service.set).toBeDefined();
    });
  });
});
