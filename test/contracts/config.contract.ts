import { beforeEach, describe, expect, it } from 'vitest';

import type { IConfigService } from '@chainglass/shared/interfaces';
import { MissingConfigurationError } from '../../packages/shared/src/config/exceptions.js';
import {
  type SampleConfig,
  SampleConfigType,
} from '../../packages/shared/src/config/schemas/sample.schema.js';

/**
 * Contract tests for IConfigService implementations.
 *
 * Per Critical Discovery 08: Contract tests prevent fake drift by ensuring
 * both FakeConfigService and ChainglassConfigService pass the same behavioral tests.
 *
 * Usage:
 * ```typescript
 * import { configServiceContractTests } from '@test/contracts/config.contract';
 *
 * configServiceContractTests('FakeConfigService', () => new FakeConfigService());
 * configServiceContractTests('ChainglassConfigService', () => {
 *   const svc = new ChainglassConfigService();
 *   svc.load();
 *   return svc;
 * });
 * ```
 */
export function configServiceContractTests(name: string, createService: () => IConfigService) {
  describe(`${name} implements IConfigService contract`, () => {
    let service: IConfigService;

    beforeEach(() => {
      service = createService();
    });

    it('should return undefined for unset config type', () => {
      /*
      Test Doc:
      - Why: Contract tests ensure FakeConfigService and ChainglassConfigService behave identically; prevents fake drift
      - Contract: get(ConfigType) returns T | undefined; returns undefined when config type not set
      - Usage Notes: Use require() if config must exist; get() for optional configs
      - Quality Contribution: Catches null vs undefined handling errors
      - Worked Example: service.get(SampleConfigType) → undefined (when not set)
      */
      const result = service.get(SampleConfigType);
      expect(result).toBeUndefined();
    });

    it('should throw MissingConfigurationError on require() for unset type', () => {
      /*
      Test Doc:
      - Why: Verify require() fails fast when config missing; ensures early error detection
      - Contract: require(ConfigType) throws MissingConfigurationError if config type not set
      - Usage Notes: Error message includes config type's configPath for debugging
      - Quality Contribution: Catches missing config at startup, not runtime
      - Worked Example: service.require(SampleConfigType) → throws MissingConfigurationError('sample')
      */
      expect(() => service.require(SampleConfigType)).toThrow(MissingConfigurationError);
    });

    it('should include config path in MissingConfigurationError message', () => {
      /*
      Test Doc:
      - Why: Error messages must be actionable; developer needs to know which config is missing
      - Contract: MissingConfigurationError message contains the configPath string
      - Usage Notes: configPath is 'sample' for SampleConfigType
      - Quality Contribution: Improves developer experience when debugging config issues
      - Worked Example: Error message contains "sample" for SampleConfigType
      */
      try {
        service.require(SampleConfigType);
        expect.fail('Should have thrown MissingConfigurationError');
      } catch (e) {
        expect(e).toBeInstanceOf(MissingConfigurationError);
        expect((e as Error).message).toContain('sample');
      }
    });

    it('should return config after set()', () => {
      /*
      Test Doc:
      - Why: Verify set() stores and get() retrieves correctly; core round-trip functionality
      - Contract: set(type, config) stores; get(type) returns same object
      - Usage Notes: Type safety ensures correct config/type pairing at compile time
      - Quality Contribution: Catches registry storage bugs
      - Worked Example: set(SampleConfigType, sample); get(SampleConfigType) → sample
      */
      const sample: SampleConfig = { enabled: true, timeout: 30, name: 'test' };
      service.set(SampleConfigType, sample);

      expect(service.get(SampleConfigType)).toEqual(sample);
    });

    it('should return config after set() via require()', () => {
      /*
      Test Doc:
      - Why: Verify require() returns config after set(); both get() and require() should work
      - Contract: set(type, config) enables require(type) to return the config
      - Usage Notes: require() is preferred when config is mandatory
      - Quality Contribution: Ensures require() and get() are consistent
      - Worked Example: set(SampleConfigType, sample); require(SampleConfigType) → sample
      */
      const sample: SampleConfig = { enabled: true, timeout: 60, name: 'test-require' };
      service.set(SampleConfigType, sample);

      expect(service.require(SampleConfigType)).toEqual(sample);
    });

    it('should allow overwriting config via set()', () => {
      /*
      Test Doc:
      - Why: Config may need to be updated during runtime or testing
      - Contract: Multiple set() calls for same type overwrites the previous value
      - Usage Notes: Useful for tests that need different configs per scenario
      - Quality Contribution: Catches mutation bugs where old values persist
      - Worked Example: set(type, v1); set(type, v2); get(type) → v2
      */
      const initial: SampleConfig = { enabled: true, timeout: 30, name: 'initial' };
      const updated: SampleConfig = { enabled: false, timeout: 60, name: 'updated' };

      service.set(SampleConfigType, initial);
      service.set(SampleConfigType, updated);

      expect(service.get(SampleConfigType)).toEqual(updated);
    });
  });
}
