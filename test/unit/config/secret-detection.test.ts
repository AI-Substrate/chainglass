import { describe, expect, it } from 'vitest';

import { LiteralSecretError } from '../../../packages/shared/src/config/exceptions.js';
import {
  detectLiteralSecret,
  validateNoLiteralSecrets,
} from '../../../packages/shared/src/config/security/secret-detection.js';

/**
 * Unit tests for detectLiteralSecret() and validateNoLiteralSecrets().
 *
 * Per Critical Discovery 05: These functions detect hardcoded API keys
 * and prevent them from being used in configuration.
 *
 * Secret patterns detected:
 * - OpenAI: sk-[20+ chars]
 * - GitHub PAT: ghp_[36 chars]
 * - Slack Bot: xoxb-[numbers]-[numbers]-[chars]
 * - Stripe: sk_(live|test)_[24 chars]
 * - AWS: AKIA[16 alphanumeric]
 *
 * Whitelist prefixes for test fixtures:
 * - sk_example
 * - ghp_test_
 */
describe('detectLiteralSecret', () => {
  describe('OpenAI detection', () => {
    it('should detect OpenAI sk- prefix', () => {
      /*
      Test Doc:
      - Why: Prevent hardcoded OpenAI API keys in config files
      - Contract: sk-[20+ chars] detected as "OpenAI" secret
      - Usage Notes: Returns secret type name; null for non-secrets
      - Quality Contribution: Security gate before config loaded
      - Worked Example: 'sk-abc123def456ghi789jkl012' → 'OpenAI'
      */
      const result = detectLiteralSecret('sk-abc123def456ghi789jkl012mno');
      expect(result).toBe('OpenAI');
    });

    it('should not detect short sk- prefixed strings', () => {
      /*
      Test Doc:
      - Why: Avoid false positives on short strings that happen to start with sk-
      - Contract: sk- followed by less than 20 chars is NOT a secret
      - Usage Notes: Real OpenAI keys are longer
      - Quality Contribution: Prevents false positives
      - Worked Example: 'sk-short' → null
      */
      expect(detectLiteralSecret('sk-short')).toBeNull();
    });
  });

  describe('GitHub PAT detection', () => {
    it('should detect GitHub PAT ghp_ prefix', () => {
      /*
      Test Doc:
      - Why: Prevent hardcoded GitHub tokens in config files
      - Contract: ghp_[36 alphanumeric] detected as "GitHub PAT" secret
      - Usage Notes: GitHub fine-grained PATs use this format
      - Quality Contribution: Catches leaked GitHub tokens
      - Worked Example: 'ghp_abcdefghijklmnopqrstuvwxyz1234567890' → 'GitHub PAT'
      */
      const result = detectLiteralSecret('ghp_abcdefghijklmnopqrstuvwxyz1234567890');
      expect(result).toBe('GitHub PAT');
    });

    it('should not detect short ghp_ prefixed strings', () => {
      /*
      Test Doc:
      - Why: Avoid false positives on strings that don't match full pattern
      - Contract: ghp_ followed by less than 36 chars is NOT a secret
      - Usage Notes: Real GitHub PATs are exactly ghp_ + 36 chars
      - Quality Contribution: Prevents false positives
      - Worked Example: 'ghp_short' → null
      */
      expect(detectLiteralSecret('ghp_short')).toBeNull();
    });
  });

  describe('Slack Bot Token detection', () => {
    it('should detect Slack Bot Token xoxb- prefix', () => {
      /*
      Test Doc:
      - Why: Prevent hardcoded Slack bot tokens in config files
      - Contract: xoxb-[numbers]-[numbers]-[chars] detected as "Slack Bot" secret
      - Usage Notes: Slack bot tokens follow this specific format
      - Quality Contribution: Catches leaked Slack tokens
      - Worked Example: 'xoxb-123456-789012-abc123def456' → 'Slack Bot'
      */
      const result = detectLiteralSecret('xoxb-123456789012-123456789012-abcdefghij123456789012');
      expect(result).toBe('Slack Bot');
    });

    it('should not detect malformed xoxb- strings', () => {
      /*
      Test Doc:
      - Why: Avoid false positives on strings that don't match Slack pattern
      - Contract: xoxb- without proper number-number-string format is NOT a secret
      - Usage Notes: Real Slack tokens have specific structure
      - Quality Contribution: Prevents false positives
      - Worked Example: 'xoxb-notavalidtoken' → null
      */
      expect(detectLiteralSecret('xoxb-notavalidtoken')).toBeNull();
    });
  });

  describe('Stripe detection', () => {
    it('should detect Stripe sk_live_ prefix', () => {
      /*
      Test Doc:
      - Why: Prevent hardcoded Stripe live API keys in config files
      - Contract: sk_live_[24+ chars] detected as "Stripe" secret
      - Usage Notes: Live keys can make real charges
      - Quality Contribution: Critical security for payment processing
      - Worked Example: 'sk_live_abc123def456ghi789jkl012' → 'Stripe'
      */
      const result = detectLiteralSecret('sk_live_abc123def456ghi789jkl012');
      expect(result).toBe('Stripe');
    });

    it('should detect Stripe sk_test_ prefix (DYK-10)', () => {
      /*
      Test Doc:
      - Why: Prevent hardcoded Stripe test API keys (DYK-10: test keys have real account access)
      - Contract: sk_test_[24+ chars] detected as "Stripe" secret
      - Usage Notes: Test keys should still use secrets.env + placeholder pattern
      - Quality Contribution: Consistent security posture for all Stripe keys
      - Worked Example: 'sk_test_abc123def456ghi789jkl012' → 'Stripe'
      */
      const result = detectLiteralSecret('sk_test_abc123def456ghi789jkl012');
      expect(result).toBe('Stripe');
    });

    it('should not detect short sk_live_ strings', () => {
      /*
      Test Doc:
      - Why: Avoid false positives on short strings
      - Contract: sk_live_ followed by less than 24 chars is NOT a secret
      - Usage Notes: Real Stripe keys are longer
      - Quality Contribution: Prevents false positives
      - Worked Example: 'sk_live_short' → null
      */
      expect(detectLiteralSecret('sk_live_short')).toBeNull();
    });
  });

  describe('AWS detection', () => {
    it('should detect AWS AKIA prefix', () => {
      /*
      Test Doc:
      - Why: Prevent hardcoded AWS access key IDs in config files
      - Contract: AKIA[16 alphanumeric uppercase] detected as "AWS" secret
      - Usage Notes: AWS access keys always start with AKIA
      - Quality Contribution: Catches leaked AWS credentials
      - Worked Example: 'AKIAIOSFODNN7EXAMPLE' → 'AWS'
      */
      const result = detectLiteralSecret('AKIAIOSFODNN7EXAMPLE');
      expect(result).toBe('AWS');
    });

    it('should not detect short AKIA strings', () => {
      /*
      Test Doc:
      - Why: Avoid false positives on strings that happen to start with AKIA
      - Contract: AKIA followed by less than 16 chars is NOT a secret
      - Usage Notes: Real AWS keys are exactly AKIA + 16 chars
      - Quality Contribution: Prevents false positives
      - Worked Example: 'AKIA123' → null
      */
      expect(detectLiteralSecret('AKIA123')).toBeNull();
    });
  });

  describe('whitelist prefixes', () => {
    it('should allow whitelisted sk_example prefix', () => {
      /*
      Test Doc:
      - Why: Test fixtures need to use realistic-looking values without triggering detection
      - Contract: sk_example* prefix is whitelisted and returns null
      - Usage Notes: Use sk_example_xxx for integration test fixtures
      - Quality Contribution: Enables testing with realistic patterns
      - Worked Example: 'sk_example_abc123def456ghi789jkl' → null
      */
      expect(detectLiteralSecret('sk_example_abc123def456ghi789jkl')).toBeNull();
    });

    it('should allow whitelisted ghp_test_ prefix', () => {
      /*
      Test Doc:
      - Why: Test fixtures need to use realistic-looking GitHub tokens
      - Contract: ghp_test_* prefix is whitelisted and returns null
      - Usage Notes: Use ghp_test_xxx for test fixtures
      - Quality Contribution: Enables testing with realistic patterns
      - Worked Example: 'ghp_test_abcdefghijklmnopqrstuvwxyz123456' → null
      */
      expect(detectLiteralSecret('ghp_test_abcdefghijklmnopqrstuvwxyz123456')).toBeNull();
    });
  });

  describe('non-secrets', () => {
    it('should return null for normal strings', () => {
      /*
      Test Doc:
      - Why: Normal configuration values should not be flagged
      - Contract: Strings not matching secret patterns return null
      - Usage Notes: Most config values are not secrets
      - Quality Contribution: Ensures no false positives for normal values
      - Worked Example: 'hello-world' → null
      */
      expect(detectLiteralSecret('hello-world')).toBeNull();
      expect(detectLiteralSecret('production')).toBeNull();
      expect(detectLiteralSecret('my-api-endpoint')).toBeNull();
    });

    it('should return null for empty string', () => {
      /*
      Test Doc:
      - Why: Empty strings should not trigger false positives
      - Contract: Empty string returns null
      - Usage Notes: Edge case handling
      - Quality Contribution: Robustness against edge cases
      - Worked Example: '' → null
      */
      expect(detectLiteralSecret('')).toBeNull();
    });

    it('should return null for placeholder strings', () => {
      /*
      Test Doc:
      - Why: Placeholder ${VAR} values should pass through secret detection
      - Contract: ${...} placeholders return null (will be expanded later)
      - Usage Notes: Placeholders are handled by expandPlaceholders()
      - Quality Contribution: Ensures placeholder pattern works correctly
      - Worked Example: '${OPENAI_API_KEY}' → null
      */
      expect(detectLiteralSecret('${OPENAI_API_KEY}')).toBeNull();
      expect(detectLiteralSecret('${STRIPE_SECRET_KEY}')).toBeNull();
    });
  });
});

describe('validateNoLiteralSecrets', () => {
  describe('valid configs (no secrets)', () => {
    it('should pass for config with no secrets', () => {
      /*
      Test Doc:
      - Why: Valid configs without secrets should pass validation
      - Contract: validateNoLiteralSecrets() does not throw for clean configs
      - Usage Notes: Most configs should pass this validation
      - Quality Contribution: Confirms happy path works
      - Worked Example: { sample: { name: 'test' } } → no error
      */
      const config = {
        sample: {
          enabled: true,
          timeout: 30,
          name: 'test',
        },
      };

      expect(() => validateNoLiteralSecrets(config)).not.toThrow();
    });

    it('should pass for config with whitelisted prefixes', () => {
      /*
      Test Doc:
      - Why: Whitelisted test fixture values should pass validation
      - Contract: Config with sk_example or ghp_test_ prefixes passes
      - Usage Notes: Use whitelist prefixes in integration test fixtures
      - Quality Contribution: Confirms whitelist works in recursive scan
      - Worked Example: { sample: { api_key: 'sk_example_xxx' } } → no error
      */
      const config = {
        sample: {
          api_key: 'sk_example_test123456789012345',
        },
      };

      expect(() => validateNoLiteralSecrets(config)).not.toThrow();
    });

    it('should pass for config with placeholder values', () => {
      /*
      Test Doc:
      - Why: Placeholder values are the intended pattern for secrets
      - Contract: Config with ${VAR} placeholders passes secret detection
      - Usage Notes: This is the recommended pattern for API keys
      - Quality Contribution: Confirms placeholder pattern is accepted
      - Worked Example: { sample: { api_key: '${OPENAI_API_KEY}' } } → no error
      */
      const config = {
        sample: {
          api_key: '${OPENAI_API_KEY}',
        },
      };

      expect(() => validateNoLiteralSecrets(config)).not.toThrow();
    });
  });

  describe('invalid configs (secrets detected)', () => {
    it('should throw LiteralSecretError for OpenAI key', () => {
      /*
      Test Doc:
      - Why: Hardcoded OpenAI keys must be rejected
      - Contract: Throws LiteralSecretError with field path for detected secrets
      - Usage Notes: Error includes field path and secret type for debugging
      - Quality Contribution: Catches hardcoded secrets before production
      - Worked Example: { api_key: 'sk-xxx...' } → LiteralSecretError('api_key', 'OpenAI')
      */
      const config = {
        api_key: 'sk-abc123def456ghi789jkl012mno',
      };

      expect(() => validateNoLiteralSecrets(config)).toThrow(LiteralSecretError);
    });

    it('should include field path in LiteralSecretError', () => {
      /*
      Test Doc:
      - Why: Error messages must help developers find the problematic field
      - Contract: LiteralSecretError contains the nested field path
      - Usage Notes: Path format is 'parent.child.field'
      - Quality Contribution: Actionable error messages
      - Worked Example: { sample: { api_key: 'sk-xxx' } } → fieldPath = 'sample.api_key'
      */
      const config = {
        sample: {
          api_key: 'sk-abc123def456ghi789jkl012mno',
        },
      };

      try {
        validateNoLiteralSecrets(config);
        expect.fail('Should have thrown LiteralSecretError');
      } catch (e) {
        expect(e).toBeInstanceOf(LiteralSecretError);
        expect((e as LiteralSecretError).fieldPath).toBe('sample.api_key');
        expect((e as LiteralSecretError).secretType).toBe('OpenAI');
      }
    });

    it('should include secret type in LiteralSecretError', () => {
      /*
      Test Doc:
      - Why: Developers need to know which type of secret was detected
      - Contract: LiteralSecretError contains secretType property
      - Usage Notes: secretType matches pattern name (OpenAI, GitHub PAT, etc.)
      - Quality Contribution: Clear identification of secret type
      - Worked Example: Stripe key → secretType = 'Stripe'
      */
      const config = {
        stripe_key: 'sk_live_abc123def456ghi789jkl012',
      };

      try {
        validateNoLiteralSecrets(config);
        expect.fail('Should have thrown LiteralSecretError');
      } catch (e) {
        expect(e).toBeInstanceOf(LiteralSecretError);
        expect((e as LiteralSecretError).secretType).toBe('Stripe');
      }
    });

    it('should detect secrets in deeply nested objects', () => {
      /*
      Test Doc:
      - Why: Secrets can be hidden in nested config structures
      - Contract: Recursive scan finds secrets at any depth
      - Usage Notes: Validates entire config tree, not just top level
      - Quality Contribution: Comprehensive security scanning
      - Worked Example: { a: { b: { c: { key: 'ghp_xxx' } } } } → detects
      */
      const config = {
        level1: {
          level2: {
            level3: {
              github_token: 'ghp_abcdefghijklmnopqrstuvwxyz1234567890',
            },
          },
        },
      };

      expect(() => validateNoLiteralSecrets(config)).toThrow(LiteralSecretError);
    });

    it('should detect secrets in arrays', () => {
      /*
      Test Doc:
      - Why: Secrets might appear in array values
      - Contract: Recursive scan checks array elements
      - Usage Notes: Array indices included in field path as [n]
      - Quality Contribution: No hiding secrets in arrays
      - Worked Example: { tokens: ['sk-xxx'] } → fieldPath = 'tokens[0]'
      */
      const config = {
        tokens: ['sk-abc123def456ghi789jkl012mno'],
      };

      try {
        validateNoLiteralSecrets(config);
        expect.fail('Should have thrown LiteralSecretError');
      } catch (e) {
        expect(e).toBeInstanceOf(LiteralSecretError);
        expect((e as LiteralSecretError).fieldPath).toBe('tokens[0]');
      }
    });

    it('should detect secrets in nested arrays', () => {
      /*
      Test Doc:
      - Why: Config might have arrays of objects containing secrets
      - Contract: Recursive scan handles array of objects
      - Usage Notes: Complex path like 'services[1].api_key'
      - Quality Contribution: Handles real-world config structures
      - Worked Example: { services: [{ key: 'AKIAXXXX' }] } → detects
      */
      const config = {
        services: [
          { name: 'safe', key: 'normal-value' },
          { name: 'unsafe', key: 'AKIAIOSFODNN7EXAMPLE' },
        ],
      };

      try {
        validateNoLiteralSecrets(config);
        expect.fail('Should have thrown LiteralSecretError');
      } catch (e) {
        expect(e).toBeInstanceOf(LiteralSecretError);
        expect((e as LiteralSecretError).fieldPath).toBe('services[1].key');
        expect((e as LiteralSecretError).secretType).toBe('AWS');
      }
    });
  });

  describe('non-string values', () => {
    it('should skip non-string values', () => {
      /*
      Test Doc:
      - Why: Numbers, booleans, and null should not be scanned
      - Contract: Only string values are checked for secrets
      - Usage Notes: Type check before pattern matching
      - Quality Contribution: Performance and correctness
      - Worked Example: { timeout: 30, enabled: true } → no error
      */
      const config = {
        timeout: 30,
        enabled: true,
        data: null,
        ratio: 0.5,
      };

      expect(() => validateNoLiteralSecrets(config)).not.toThrow();
    });
  });
});
