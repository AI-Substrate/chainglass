import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConfigurationError } from '../../../packages/shared/src/config/exceptions.js';
import { parseEnvVars } from '../../../packages/shared/src/config/loaders/env.parser.js';

/**
 * Unit tests for parseEnvVars() - CG_* environment variable parsing.
 *
 * Per Critical Discovery 03 and DYK-05, this function must:
 * - Parse CG_ prefixed variables into nested objects
 * - Use __ (double underscore) for nesting
 * - Lowercase all keys
 * - Enforce MAX_NESTING_DEPTH = 4
 * - Apply strict validation (reject malformed vars per DYK-05)
 */
describe('parseEnvVars', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    // Clear all CG_ variables
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('CG_')) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('basic parsing', () => {
    it('should parse CG_ prefixed variables', () => {
      /*
      Test Doc:
      - Why: Core env var parsing functionality
      - Contract: CG_KEY=value → { key: 'value' }
      - Usage Notes: All values are strings (Zod handles coercion)
      - Quality Contribution: Catches basic parsing errors
      - Worked Example: CG_DEBUG=true → { debug: 'true' }
      */
      process.env.CG_DEBUG = 'true';

      const result = parseEnvVars();

      expect(result).toEqual({ debug: 'true' });
    });

    it('should ignore non-CG_ variables', () => {
      /*
      Test Doc:
      - Why: Only Chainglass config vars should be parsed
      - Contract: Non-CG_ prefixed vars excluded from result
      - Usage Notes: Prevents pollution from unrelated env vars
      - Quality Contribution: Security and correctness
      - Worked Example: OTHER_VAR=x, CG_VAR=y → { var: 'y' }
      */
      process.env.OTHER_VAR = 'ignored';
      process.env.PATH = '/usr/bin';
      process.env.CG_INCLUDED = 'yes';

      const result = parseEnvVars();

      expect(result).not.toHaveProperty('other_var');
      expect(result).not.toHaveProperty('path');
      expect(result).toEqual({ included: 'yes' });
    });

    it('should handle single-level variables', () => {
      /*
      Test Doc:
      - Why: Simple config without nesting
      - Contract: CG_SIMPLE=value → { simple: 'value' }
      - Usage Notes: No double underscore means top-level key
      - Quality Contribution: Basic parsing verification
      - Worked Example: CG_TIMEOUT=30 → { timeout: '30' }
      */
      process.env.CG_TIMEOUT = '30';
      process.env.CG_ENABLED = 'true';

      const result = parseEnvVars();

      expect(result).toEqual({
        timeout: '30',
        enabled: 'true',
      });
    });
  });

  describe('nesting with __', () => {
    it('should convert __ to nested keys', () => {
      /*
      Test Doc:
      - Why: Environment variables are flat, config is nested
      - Contract: CG_A__B=x → { a: { b: 'x' } }
      - Usage Notes: Double underscore creates nesting level
      - Quality Contribution: Catches nesting logic bugs
      - Worked Example: CG_SAMPLE__TIMEOUT=30 → { sample: { timeout: '30' } }
      */
      process.env.CG_SAMPLE__TIMEOUT = '30';
      process.env.CG_SAMPLE__ENABLED = 'true';

      const result = parseEnvVars();

      expect(result).toEqual({
        sample: {
          timeout: '30',
          enabled: 'true',
        },
      });
    });

    it('should lowercase all keys', () => {
      /*
      Test Doc:
      - Why: Config keys should be consistent (lowercase)
      - Contract: CG_UPPER__CASE → { upper: { case: ... } }
      - Usage Notes: Env vars must be UPPERCASE (per DYK-05), but output keys are lowercase
      - Quality Contribution: Catches case handling bugs
      - Worked Example: CG_SAMPLE__TIMEOUT → sample.timeout (not SAMPLE.TIMEOUT)
      */
      process.env.CG_UPPER__CASE = 'value';
      process.env.CG_ANOTHER__DEEP__KEY = 'deep';

      const result = parseEnvVars();

      expect(result).toHaveProperty('upper.case', 'value');
      expect(result).toHaveProperty('another.deep.key', 'deep');
    });

    it('should handle three levels of nesting', () => {
      /*
      Test Doc:
      - Why: Config may need multiple nesting levels
      - Contract: CG_A__B__C=x → { a: { b: { c: 'x' } } }
      - Usage Notes: Up to 4 levels allowed (MAX_DEPTH)
      - Quality Contribution: Multi-level nesting works
      - Worked Example: CG_DB__POOL__MAX__SIZE=10 → { db: { pool: { max: { size: '10' } } } }
      */
      process.env.CG_LEVEL1__LEVEL2__LEVEL3 = 'deep';

      const result = parseEnvVars();

      expect(result).toEqual({
        level1: {
          level2: {
            level3: 'deep',
          },
        },
      });
    });
  });

  describe('depth limits', () => {
    it('should reject nesting > MAX_DEPTH (4)', () => {
      /*
      Test Doc:
      - Why: Prevent DOS via deeply nested env vars
      - Contract: Nesting > 4 levels throws ConfigurationError
      - Usage Notes: MAX_DEPTH = 4 (configurable in future)
      - Quality Contribution: Security boundary
      - Worked Example: CG_A__B__C__D__E=x → throws ConfigurationError
      */
      process.env.CG_A__B__C__D__E = 'too deep';

      expect(() => parseEnvVars()).toThrow();
    });

    it('should allow exactly 4 levels of nesting', () => {
      /*
      Test Doc:
      - Why: 4 levels is the maximum allowed
      - Contract: CG_A__B__C__D=x → { a: { b: { c: { d: 'x' } } } }
      - Usage Notes: Boundary case - exactly at MAX_DEPTH
      - Quality Contribution: Boundary condition verification
      - Worked Example: 4 levels works, 5 fails
      */
      process.env.CG_ONE__TWO__THREE__FOUR = 'exactly-four';

      const result = parseEnvVars();

      expect(result).toEqual({
        one: {
          two: {
            three: {
              four: 'exactly-four',
            },
          },
        },
      });
    });
  });

  describe('edge cases', () => {
    it('should preserve string values (no coercion)', () => {
      /*
      Test Doc:
      - Why: Zod handles type coercion, parser should preserve strings
      - Contract: All values returned as strings
      - Usage Notes: 'true' stays 'true', '30' stays '30'
      - Quality Contribution: Type handling correctness
      - Worked Example: CG_NUM=30 → { num: '30' } not { num: 30 }
      */
      process.env.CG_BOOL = 'true';
      process.env.CG_NUM = '30';
      process.env.CG_FLOAT = '3.14';

      const result = parseEnvVars();

      expect(typeof result.bool).toBe('string');
      expect(typeof result.num).toBe('string');
      expect(typeof result.float).toBe('string');
    });

    it('should handle empty CG_ value', () => {
      /*
      Test Doc:
      - Why: Empty string is a valid value
      - Contract: CG_KEY= → { key: '' }
      - Usage Notes: Empty string stored, Zod validates appropriateness
      - Quality Contribution: Edge case handling
      - Worked Example: CG_EMPTY= → { empty: '' }
      */
      process.env.CG_EMPTY = '';

      const result = parseEnvVars();

      expect(result).toEqual({ empty: '' });
    });
  });

  describe('strict validation (DYK-05)', () => {
    it('should reject lowercase after CG_ prefix', () => {
      /*
      Test Doc:
      - Why: Convention is CG_ followed by UPPERCASE (DYK-05)
      - Contract: CG_lowercase throws ConfigurationError
      - Usage Notes: Fail-fast for malformed env vars
      - Quality Contribution: Strict validation per codebase philosophy
      - Worked Example: CG_sample__timeout → throws (should be CG_SAMPLE__TIMEOUT)
      */
      process.env.CG_sample__timeout = '30';

      expect(() => parseEnvVars()).toThrow();
    });

    it('should reject trailing underscore', () => {
      /*
      Test Doc:
      - Why: Trailing underscore is malformed
      - Contract: CG_KEY_ throws ConfigurationError
      - Usage Notes: Common typo that should fail fast
      - Quality Contribution: Strict validation
      - Worked Example: CG_SAMPLE_ → throws
      */
      process.env.CG_SAMPLE_ = 'value';

      expect(() => parseEnvVars()).toThrow();
    });

    it('should reject empty path segments (triple underscore)', () => {
      /*
      Test Doc:
      - Why: Triple underscore creates empty path segment
      - Contract: CG_A___B throws ConfigurationError
      - Usage Notes: Indicates user error
      - Quality Contribution: Strict validation
      - Worked Example: CG___INVALID → throws
      */
      process.env.CG___INVALID = 'value';

      expect(() => parseEnvVars()).toThrow();
    });

    it('should reject invalid characters in key', () => {
      /*
      Test Doc:
      - Why: Only A-Z, 0-9, _ allowed in env var key portion
      - Contract: CG_INVALID-CHAR throws ConfigurationError
      - Usage Notes: Hyphens, dots, etc. are invalid
      - Quality Contribution: Strict validation
      - Worked Example: CG_SAMPLE-NAME → throws
      */
      process.env['CG_SAMPLE-NAME'] = 'value';

      expect(() => parseEnvVars()).toThrow();
    });
  });
});
