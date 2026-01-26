/**
 * Hash generator adapter using Node.js crypto module.
 *
 * Per Phase 1 T002: Production implementation of IHashGenerator.
 * Uses node:crypto for SHA-256 hashing.
 */

import { createHash } from 'node:crypto';
import type { IHashGenerator } from '../interfaces/hash-generator.interface.js';

/**
 * Production hash generator using Node.js crypto.
 *
 * Wraps node:crypto to implement IHashGenerator interface.
 * Used for checkpoint content hashing and duplicate detection.
 */
export class HashGeneratorAdapter implements IHashGenerator {
  /**
   * Generate a SHA-256 hash of the input string.
   *
   * @param input - The string content to hash
   * @returns A 64-character lowercase hexadecimal string
   */
  async sha256(input: string): Promise<string> {
    const hash = createHash('sha256');
    hash.update(input, 'utf8');
    return hash.digest('hex');
  }
}
