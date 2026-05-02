/**
 * Atomic persistence for `.chainglass/bootstrap-code.json`.
 *
 * Plan 084 Phase 1 T003. Reuses the temp+rename idiom from
 * `event-popper/port-discovery.ts:139-160` (do not import — copy the pattern).
 *
 * Permission errors (`EACCES`, `EROFS`, `ENOSPC`) intentionally propagate
 * to the caller — boot fails fast on misconfigured `.chainglass/`
 * permissions, which is the desired operator-actionable behaviour
 * (validation fix C-Comp1).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { generateBootstrapCode } from './generator.js';
import {
  BOOTSTRAP_CODE_FILE_PATH_REL,
  type BootstrapCodeFile,
  BootstrapCodeFileSchema,
  type EnsureResult,
} from './types.js';

/**
 * Read and validate the bootstrap-code file.
 *
 * Returns `null` for any of 5 invalid states:
 *   (a) missing file, (b) zero-byte file, (c) malformed JSON,
 *   (d) JSON missing required fields, (e) JSON with `code` failing the regex.
 *
 * Permission errors during read still throw (caller's problem).
 */
export function readBootstrapCode(filePath: string): BootstrapCodeFile | null {
  if (!existsSync(filePath)) return null;
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
  if (raw.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = BootstrapCodeFileSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

/**
 * Atomic write — temp file + rename. POSIX-atomic.
 *
 * Permission errors propagate (caller decides what to do).
 */
export function writeBootstrapCode(filePath: string, file: BootstrapCodeFile): void {
  const parent = dirname(filePath);
  mkdirSync(parent, { recursive: true });
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(file, null, 2), 'utf-8');
  renameSync(tmp, filePath);
}

/**
 * Read or generate the bootstrap-code file under `cwd`.
 *
 * Idempotent: if a valid file already exists, return it (`generated: false`).
 * Otherwise generate a new code, write atomically, and return
 * (`generated: true`).
 */
export function ensureBootstrapCode(cwd: string): EnsureResult {
  const filePath = join(cwd, BOOTSTRAP_CODE_FILE_PATH_REL);
  const existing = readBootstrapCode(filePath);
  if (existing) {
    return { path: filePath, data: existing, generated: false };
  }
  const now = new Date().toISOString();
  const data: BootstrapCodeFile = {
    version: 1,
    code: generateBootstrapCode(),
    createdAt: now,
    rotatedAt: now,
  };
  writeBootstrapCode(filePath, data);
  return { path: filePath, data, generated: true };
}
