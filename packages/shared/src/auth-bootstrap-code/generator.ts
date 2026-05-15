/**
 * generateBootstrapCode — random Crockford-base32 secret with 60 bits entropy.
 *
 * Plan 084 Phase 1 T002. Output format `XXXX-XXXX-XXXX` matching
 * BOOTSTRAP_CODE_PATTERN. Uses node:crypto.randomInt for cryptographic
 * randomness (not Math.random); index-into-alphabet has no modulo bias
 * because 32 evenly divides 2^32.
 */
import { randomInt } from 'node:crypto';

/**
 * Crockford base32: 32 chars, excludes I, L, O, U.
 * Module-private — consumers should depend on `generateBootstrapCode()`,
 * not the alphabet itself (encapsulation; rejected validation finding C-FC5).
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Returns a 14-character Crockford-base32 code: `'XXXX-XXXX-XXXX'`. */
export function generateBootstrapCode(): string {
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) out.push('-');
    out.push(ALPHABET[randomInt(0, ALPHABET.length)]);
  }
  return out.join('');
}
