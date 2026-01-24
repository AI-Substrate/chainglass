/**
 * Fake hash generator for testing.
 *
 * Per Phase 1 T002: Test double for IHashGenerator.
 * Supports preset hashes for deterministic testing.
 */

import type { IHashGenerator } from '../interfaces/hash-generator.interface.js';

/**
 * Fake hash generator for testing.
 *
 * Allows tests to configure specific hash outputs for inputs,
 * track call counts, and reset state between tests.
 */
export class FakeHashGenerator implements IHashGenerator {
  /** Preset hash values: input -> output */
  private presets = new Map<string, string>();

  /** Counter for sha256 calls */
  private callCount = 0;

  /** Seed for generating default hashes */
  private hashSeed = 0;

  // ==================== Test Helpers ====================

  /**
   * Set a preset hash value for a specific input (test helper).
   *
   * @param input - The input string to match
   * @param hash - The 64-character hex hash to return
   */
  setHash(input: string, hash: string): void {
    if (hash.length !== 64) {
      throw new Error(`Hash must be 64 characters, got ${hash.length}`);
    }
    this.presets.set(input, hash);
  }

  /**
   * Get the number of times sha256() was called (test helper).
   *
   * @returns Number of sha256 invocations
   */
  getCallCount(): number {
    return this.callCount;
  }

  /**
   * Reset all state (test helper).
   */
  reset(): void {
    this.presets.clear();
    this.callCount = 0;
    this.hashSeed = 0;
  }

  // ==================== IHashGenerator Implementation ====================

  /**
   * Generate a SHA-256 hash of the input string.
   *
   * Returns preset value if configured, otherwise generates
   * a deterministic default hash.
   *
   * @param input - The string content to hash
   * @returns A 64-character lowercase hexadecimal string
   */
  async sha256(input: string): Promise<string> {
    this.callCount++;

    // Return preset if configured
    const preset = this.presets.get(input);
    if (preset !== undefined) {
      return preset;
    }

    // Generate deterministic default hash based on input
    // This is NOT cryptographically secure but provides consistent test behavior
    this.hashSeed++;
    let hash = '';
    for (let i = 0; i < 64; i++) {
      // Create a simple deterministic pattern based on input + position
      const charCode = (input.charCodeAt(i % input.length) || 0) + i + this.hashSeed;
      hash += (charCode % 16).toString(16);
    }
    return hash;
  }
}
