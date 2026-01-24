/**
 * Tests for IHashGenerator interface and implementations.
 *
 * Per Phase 1 T001: TDD - Write failing tests first.
 * Tests cover: sha256 returns 64-char hex, determinism, uniqueness.
 */

import { beforeEach, describe, expect, it } from 'vitest';

// Import will fail until T002 is implemented
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Interface doesn't exist yet (TDD RED phase)
import type { IHashGenerator } from '@chainglass/shared';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Implementation doesn't exist yet (TDD RED phase)
import { HashGeneratorAdapter, FakeHashGenerator } from '@chainglass/shared';

describe('IHashGenerator', () => {
  describe('HashGeneratorAdapter (Production)', () => {
    let hashGenerator: IHashGenerator;

    beforeEach(() => {
      hashGenerator = new HashGeneratorAdapter();
    });

    it('should return a 64-character hex string for SHA-256', async () => {
      /*
      Test Doc:
      - Why: SHA-256 produces a 256-bit (32-byte) hash, which is 64 hex characters
      - Contract: sha256(input) returns a 64-character lowercase hex string
      - Usage Notes: Output is always lowercase hex, no prefix (no 0x)
      - Quality Contribution: Ensures hash format is consistent for filename usage
      - Worked Example: sha256("test") → "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
      */
      const result = await hashGenerator.sha256('test');

      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce the same hash for the same input (deterministic)', async () => {
      /*
      Test Doc:
      - Why: Hash functions must be deterministic for content-based addressing
      - Contract: sha256(x) === sha256(x) for any input x
      - Usage Notes: Use for comparing file contents, detecting duplicates
      - Quality Contribution: Ensures checkpoint hashes are reproducible
      - Worked Example: sha256("hello") === sha256("hello") → true
      */
      const input = 'hello world';

      const hash1 = await hashGenerator.sha256(input);
      const hash2 = await hashGenerator.sha256(input);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', async () => {
      /*
      Test Doc:
      - Why: Hash uniqueness is critical for content detection
      - Contract: sha256(a) !== sha256(b) when a !== b (practically guaranteed)
      - Usage Notes: Collisions are theoretically possible but astronomically unlikely
      - Quality Contribution: Ensures different template versions get different checkpoint names
      - Worked Example: sha256("a") !== sha256("b") → true
      */
      const hash1 = await hashGenerator.sha256('input one');
      const hash2 = await hashGenerator.sha256('input two');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string input', async () => {
      /*
      Test Doc:
      - Why: Edge case - empty content should still produce valid hash
      - Contract: sha256("") returns valid 64-char hex (the SHA-256 of empty string)
      - Usage Notes: Empty files/content are valid inputs
      - Quality Contribution: Prevents crashes on edge cases
      - Worked Example: sha256("") → "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      */
      const result = await hashGenerator.sha256('');

      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[a-f0-9]{64}$/);
      // Known SHA-256 of empty string
      expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
  });

  describe('FakeHashGenerator (Test Double)', () => {
    let fakeHashGenerator: FakeHashGenerator;

    beforeEach(() => {
      fakeHashGenerator = new FakeHashGenerator();
    });

    it('should return configurable hash for preset inputs', async () => {
      /*
      Test Doc:
      - Why: Tests need to control hash output for predictable checkpoint names
      - Contract: setHash(input, output) makes sha256(input) return output
      - Usage Notes: Set up expected hashes before test assertions
      - Quality Contribution: Enables testing checkpoint naming without real crypto
      - Worked Example: setHash("content", "abc123...") → sha256("content") === "abc123..."
      */
      fakeHashGenerator.setHash('my-content', 'a'.repeat(64));

      const result = await fakeHashGenerator.sha256('my-content');

      expect(result).toBe('a'.repeat(64));
    });

    it('should return default hash for unknown inputs', async () => {
      /*
      Test Doc:
      - Why: Tests shouldn't fail just because a hash wasn't pre-configured
      - Contract: sha256(unknown) returns a valid default 64-char hex string
      - Usage Notes: Default hash allows tests to work without full setup
      - Quality Contribution: Makes fake easier to use in tests
      - Worked Example: sha256("anything") → valid 64-char hex (auto-generated or fixed)
      */
      const result = await fakeHashGenerator.sha256('unconfigured-input');

      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should track call count', async () => {
      /*
      Test Doc:
      - Why: Tests may need to verify hash was actually called
      - Contract: getCallCount() returns number of sha256() invocations
      - Usage Notes: Use to verify caching/memoization or expected operation count
      - Quality Contribution: Enables verification of expected call patterns
      - Worked Example: sha256("a"), sha256("b") → getCallCount() === 2
      */
      await fakeHashGenerator.sha256('first');
      await fakeHashGenerator.sha256('second');
      await fakeHashGenerator.sha256('third');

      expect(fakeHashGenerator.getCallCount()).toBe(3);
    });

    it('should reset state', async () => {
      /*
      Test Doc:
      - Why: Tests need isolation; reset clears configured hashes and call count
      - Contract: reset() clears all preset hashes and resets call count to 0
      - Usage Notes: Call in beforeEach to ensure test isolation
      - Quality Contribution: Prevents test pollution
      - Worked Example: setHash(...), sha256(...), reset() → getCallCount() === 0, presets cleared
      */
      fakeHashGenerator.setHash('key', 'value'.padEnd(64, '0'));
      await fakeHashGenerator.sha256('key');

      fakeHashGenerator.reset();

      expect(fakeHashGenerator.getCallCount()).toBe(0);
      // After reset, should return default, not preset
      const result = await fakeHashGenerator.sha256('key');
      expect(result).not.toBe('value'.padEnd(64, '0'));
    });
  });
});
