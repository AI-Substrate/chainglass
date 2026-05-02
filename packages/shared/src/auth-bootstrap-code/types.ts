/**
 * Bootstrap-code auth — types, regex, schema, file-path constant, cookie name.
 *
 * This is the contract layer for Plan 084 phase 1. Every other phase imports
 * exclusively through the barrel (`@chainglass/shared/auth-bootstrap-code`).
 *
 * The Crockford alphabet used by `generateBootstrapCode()` is intentionally
 * NOT exported — it lives module-private inside `generator.ts`. Consumers
 * depend on the function, not the alphabet.
 */
import { z } from 'zod';

/**
 * Format of `.chainglass/bootstrap-code.json`. Persistent, gitignored,
 * regenerated only when missing or invalid.
 */
export interface BootstrapCodeFile {
  version: 1;
  /** 12 Crockford-base32 chars in three groups: 'XXXX-XXXX-XXXX'. */
  code: string;
  /** ISO-8601 timestamp of the first generation in this file's lifetime. */
  createdAt: string;
  /** ISO-8601 timestamp of the most recent generation/rotation. */
  rotatedAt: string;
}

/**
 * Result of `ensureBootstrapCode(cwd)` — the absolute path written to,
 * the parsed file, and whether it was newly generated this call.
 *
 * Phase 2 instrumentation logs `path` and `generated` only — never the
 * `data.code` value.
 */
export interface EnsureResult {
  path: string;
  data: BootstrapCodeFile;
  generated: boolean;
}

/**
 * Regex for a single bootstrap code: 12 Crockford-base32 characters
 * (`0-9`, `A-Z` minus `I L O U`) in three hyphen-separated 4-char groups.
 *
 * Class breakdown: `0-9` (10), `A-H` (8), `JKMN` (4 — note no `L`),
 * `P-T` (5), `V-Z` (5) → 32 chars; excludes `I`, `L`, `O`, `U`.
 */
export const BOOTSTRAP_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

/** Name of the HttpOnly cookie that proves bootstrap-code possession. */
export const BOOTSTRAP_COOKIE_NAME = 'chainglass-bootstrap';

/** Path relative to `cwd` where the bootstrap code lives on disk. */
export const BOOTSTRAP_CODE_FILE_PATH_REL = '.chainglass/bootstrap-code.json';

export const BootstrapCodeFileSchema = z
  .object({
    version: z.literal(1),
    code: z.string().regex(BOOTSTRAP_CODE_PATTERN),
    createdAt: z.string().datetime(),
    rotatedAt: z.string().datetime(),
  })
  .strict();
