import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConfigurationError } from '../../../packages/shared/src/config/exceptions.js';
import {
  expandPlaceholders,
  validateNoUnexpandedPlaceholders,
} from '../../../packages/shared/src/config/loaders/expand-placeholders.js';

/**
 * Unit tests for expandPlaceholders() - ${VAR} syntax resolution from process.env.
 *
 * Per Critical Discovery 04, this function must:
 * - Expand ${VAR} patterns with values from process.env
 * - Recursively process nested objects
 * - Leave non-placeholder strings unchanged
 * - Leave missing env vars as ${VAR} (validation catches these)
 */
describe('expandPlaceholders', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('basic expansion', () => {
    it('should expand ${VAR} from process.env', () => {
      /*
      Test Doc:
      - Why: Core placeholder expansion functionality
      - Contract: ${VAR} replaced with process.env.VAR value
      - Usage Notes: Full string replacement when entire value is placeholder
      - Quality Contribution: Catches expansion logic bugs
      - Worked Example: { key: '${SECRET}' } with SECRET=abc → { key: 'abc' }
      */
      process.env.MY_SECRET = 'secret-value';

      const input = { api_key: '${MY_SECRET}' };
      const result = expandPlaceholders(input);

      expect(result).toEqual({ api_key: 'secret-value' });
    });

    it('should expand multiple placeholders in same string', () => {
      /*
      Test Doc:
      - Why: Connection strings often have multiple placeholders
      - Contract: All ${VAR} patterns in string expanded
      - Usage Notes: Each placeholder resolved independently
      - Quality Contribution: Multi-placeholder handling
      - Worked Example: '${HOST}:${PORT}' → 'localhost:5432'
      */
      process.env.DB_HOST = 'localhost';
      process.env.DB_PORT = '5432';

      const input = { connection: '${DB_HOST}:${DB_PORT}' };
      const result = expandPlaceholders(input);

      expect(result).toEqual({ connection: 'localhost:5432' });
    });

    it('should expand placeholders in prefix/suffix context', () => {
      /*
      Test Doc:
      - Why: Placeholders often embedded in larger strings
      - Contract: ${VAR} expanded even with surrounding text
      - Usage Notes: Only the placeholder portion replaced
      - Quality Contribution: Partial string expansion
      - Worked Example: 'Bearer ${TOKEN}' → 'Bearer abc123'
      */
      process.env.API_TOKEN = 'abc123';

      const input = { auth: 'Bearer ${API_TOKEN}' };
      const result = expandPlaceholders(input);

      expect(result).toEqual({ auth: 'Bearer abc123' });
    });
  });

  describe('nested expansion', () => {
    it('should expand nested object values', () => {
      /*
      Test Doc:
      - Why: Config is deeply nested
      - Contract: Recursive expansion of all string values
      - Usage Notes: Non-string values left unchanged
      - Quality Contribution: Deep expansion verification
      - Worked Example: { a: { b: '${VAR}' } } expanded recursively
      */
      process.env.NESTED_SECRET = 'nested-value';

      const input = {
        level1: {
          level2: {
            secret: '${NESTED_SECRET}',
          },
        },
      };
      const result = expandPlaceholders(input);

      expect(result).toEqual({
        level1: {
          level2: {
            secret: 'nested-value',
          },
        },
      });
    });

    it('should expand values in arrays', () => {
      /*
      Test Doc:
      - Why: Arrays may contain strings with placeholders
      - Contract: Array elements with ${VAR} expanded
      - Usage Notes: Each array element processed
      - Quality Contribution: Array expansion handling
      - Worked Example: { urls: ['${URL1}', '${URL2}'] } expanded
      */
      process.env.URL_A = 'https://a.example.com';
      process.env.URL_B = 'https://b.example.com';

      const input = { endpoints: ['${URL_A}', '${URL_B}'] };
      const result = expandPlaceholders(input);

      expect(result).toEqual({
        endpoints: ['https://a.example.com', 'https://b.example.com'],
      });
    });
  });

  describe('non-placeholder strings', () => {
    it('should leave non-placeholder strings unchanged', () => {
      /*
      Test Doc:
      - Why: Most config values are literal strings
      - Contract: Strings without ${...} returned as-is
      - Usage Notes: No modification to regular values
      - Quality Contribution: Precision - only placeholders changed
      - Worked Example: { name: 'literal' } → { name: 'literal' }
      */
      const input = { name: 'literal-value', count: 42 };
      const result = expandPlaceholders(input);

      expect(result).toEqual({ name: 'literal-value', count: 42 });
    });

    it('should preserve non-string types', () => {
      /*
      Test Doc:
      - Why: Config has numbers, booleans, etc.
      - Contract: Non-string values passed through unchanged
      - Usage Notes: Only strings can have placeholders
      - Quality Contribution: Type preservation
      - Worked Example: { enabled: true, count: 5 } unchanged
      */
      const input = {
        enabled: true,
        count: 42,
        ratio: 3.14,
        nothing: null,
      };
      const result = expandPlaceholders(input);

      expect(result).toEqual({
        enabled: true,
        count: 42,
        ratio: 3.14,
        nothing: null,
      });
    });
  });

  describe('missing env vars', () => {
    it('should leave missing env vars as ${VAR}', () => {
      /*
      Test Doc:
      - Why: Validation step catches unexpanded placeholders
      - Contract: Missing env var leaves ${VAR} in place
      - Usage Notes: validateNoUnexpandedPlaceholders() fails on these
      - Quality Contribution: Separation of expansion and validation
      - Worked Example: ${MISSING} stays as '${MISSING}'
      */
      const input = { missing: '${NONEXISTENT_VAR}' };
      const result = expandPlaceholders(input);

      expect(result).toEqual({ missing: '${NONEXISTENT_VAR}' });
    });
  });
});

/**
 * Unit tests for validateNoUnexpandedPlaceholders() - Fail if any ${...} remain.
 *
 * Per Critical Discovery 04, this function must:
 * - Throw ConfigurationError if any ${...} patterns remain
 * - Include field path in error message
 * - Include unexpanded variable name in error message
 * - Recursively check nested objects and arrays
 */
describe('validateNoUnexpandedPlaceholders', () => {
  describe('validation passes', () => {
    it('should not throw for fully expanded config', () => {
      /*
      Test Doc:
      - Why: Valid config should pass validation
      - Contract: No error thrown when no ${...} patterns present
      - Usage Notes: Called after expandPlaceholders()
      - Quality Contribution: Happy path verification
      - Worked Example: { key: 'value' } → no error
      */
      const config = {
        sample: {
          enabled: true,
          timeout: 30,
          name: 'test',
        },
      };

      expect(() => validateNoUnexpandedPlaceholders(config)).not.toThrow();
    });

    it('should handle deeply nested valid config', () => {
      /*
      Test Doc:
      - Why: Validation must be recursive
      - Contract: Deep nesting checked completely
      - Usage Notes: All levels must pass
      - Quality Contribution: Recursive validation works
      - Worked Example: 3+ levels deep, no placeholders → pass
      */
      const config = {
        level1: {
          level2: {
            level3: {
              value: 'no placeholders here',
            },
          },
        },
      };

      expect(() => validateNoUnexpandedPlaceholders(config)).not.toThrow();
    });
  });

  describe('validation fails', () => {
    it('should throw on unexpanded placeholders after expansion', () => {
      /*
      Test Doc:
      - Why: Security - missing secrets must fail fast
      - Contract: ${VAR} in config throws ConfigurationError
      - Usage Notes: User must set the env var
      - Quality Contribution: Security gate for secrets
      - Worked Example: { key: '${MISSING}' } → throws
      */
      const config = { api_key: '${OPENAI_API_KEY}' };

      expect(() => validateNoUnexpandedPlaceholders(config)).toThrow();
    });

    it('should include field path in validation error', () => {
      /*
      Test Doc:
      - Why: User needs to know which field has the problem
      - Contract: Error message includes 'sample.api_key' path
      - Usage Notes: Dot-notation path for debugging
      - Quality Contribution: Actionable error messages
      - Worked Example: Error contains 'sample.api_key'
      */
      const config = {
        sample: {
          api_key: '${API_KEY}',
        },
      };

      try {
        validateNoUnexpandedPlaceholders(config);
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('sample.api_key');
      }
    });

    it('should include unexpanded var name in error', () => {
      /*
      Test Doc:
      - Why: User needs to know which env var to set
      - Contract: Error message includes 'API_KEY' or '${API_KEY}'
      - Usage Notes: Helps user fix the issue
      - Quality Contribution: Actionable error messages
      - Worked Example: Error contains 'API_KEY'
      */
      const config = { secret: '${MY_SECRET}' };

      try {
        validateNoUnexpandedPlaceholders(config);
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toMatch(/MY_SECRET|\$\{MY_SECRET\}/);
      }
    });

    it('should detect placeholders in nested objects', () => {
      /*
      Test Doc:
      - Why: Placeholders can be anywhere in config tree
      - Contract: Nested ${VAR} detected and reported
      - Usage Notes: Full recursive check
      - Quality Contribution: No hiding placeholders in deep nesting
      - Worked Example: { a: { b: { c: '${VAR}' } } } → throws
      */
      const config = {
        deeply: {
          nested: {
            secret: '${HIDDEN_SECRET}',
          },
        },
      };

      expect(() => validateNoUnexpandedPlaceholders(config)).toThrow();
    });

    it('should detect placeholders in arrays', () => {
      /*
      Test Doc:
      - Why: Arrays may contain unexpanded placeholders
      - Contract: Array elements checked for ${VAR}
      - Usage Notes: Each element validated
      - Quality Contribution: Array validation coverage
      - Worked Example: { urls: ['${URL}'] } → throws
      */
      const config = {
        endpoints: ['https://api.example.com', '${STAGING_URL}'],
      };

      expect(() => validateNoUnexpandedPlaceholders(config)).toThrow();
    });
  });
});
