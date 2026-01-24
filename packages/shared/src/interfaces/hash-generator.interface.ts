/**
 * Hash generator interface for content hashing.
 *
 * Per Phase 1 T002: Interface for SHA-256 content hashing.
 * Used by WorkflowRegistryService for checkpoint content hashing.
 */

/**
 * Interface for hash generation operations.
 *
 * Abstraction over cryptographic hash functions to enable
 * testability and potential future algorithm changes.
 */
export interface IHashGenerator {
  /**
   * Generate a SHA-256 hash of the input string.
   *
   * @param input - The string content to hash
   * @returns A 64-character lowercase hexadecimal string
   *
   * @example
   * ```typescript
   * const hash = await hashGenerator.sha256('hello world');
   * // Returns: "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
   * ```
   */
  sha256(input: string): Promise<string>;
}
