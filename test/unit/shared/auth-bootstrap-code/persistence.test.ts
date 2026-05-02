/**
 * read/write/ensureBootstrapCode — atomic persistence + edge cases
 *
 * Why: Plan 084 Phase 1 T003. The bootstrap code lives in
 *      `.chainglass/bootstrap-code.json` and must survive boot,
 *      regenerate when missing/corrupt, and never partially-write.
 * Contract: `readBootstrapCode(path)` returns the parsed file or `null`
 *           for any of 5 invalid states (missing, empty, malformed JSON,
 *           missing field, bad regex on `code`). `writeBootstrapCode(path, file)`
 *           uses atomic temp+rename. `ensureBootstrapCode(cwd)` reuses
 *           valid files and regenerates invalid ones.
 * Usage: Phase 2 instrumentation calls `ensureBootstrapCode(process.cwd())`.
 * Quality contribution: real-fs temp-dir tests (Constitution P4); zero mocks;
 *                       per-test cleanup (validation fix Comp-H2).
 * Worked example:
 *   ```ts
 *   const cwd = mkTempCwd();
 *   const result = ensureBootstrapCode(cwd);
 *   // result.path === '<cwd>/.chainglass/bootstrap-code.json'
 *   // result.generated === true (file was missing → regenerated)
 *   ```
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BOOTSTRAP_CODE_FILE_PATH_REL,
  type BootstrapCodeFile,
  ensureBootstrapCode,
  readBootstrapCode,
  writeBootstrapCode,
} from '@chainglass/shared/auth-bootstrap-code';

import { mkBootstrapCodeFile, mkTempCwd } from './test-fixtures';

describe('readBootstrapCode', () => {
  let cwd: string;
  let filePath: string;

  beforeEach(() => {
    cwd = mkTempCwd();
    filePath = join(cwd, BOOTSTRAP_CODE_FILE_PATH_REL);
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('round-trips a valid file', () => {
    const file = mkBootstrapCodeFile();
    writeBootstrapCode(filePath, file);
    expect(readBootstrapCode(filePath)).toEqual(file);
  });

  // 5 invalid-state scenarios per validation fix C2 + Cross-Ref MEDIUM enumeration.

  it('(a) missing file → null', () => {
    expect(readBootstrapCode(filePath)).toBeNull();
  });

  it('(b) zero-byte file → null', () => {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, '');
    expect(readBootstrapCode(filePath)).toBeNull();
  });

  it('(c) malformed JSON → null', () => {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, '{not-json');
    expect(readBootstrapCode(filePath)).toBeNull();
  });

  it('(d) JSON missing required field → null', () => {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(
      filePath,
      JSON.stringify({ version: 1, code: 'TEST-TEST-TEST' }), // no createdAt/rotatedAt
    );
    expect(readBootstrapCode(filePath)).toBeNull();
  });

  it('(e) JSON with `code` failing the regex → null', () => {
    mkdirSync(dirname(filePath), { recursive: true });
    const now = new Date().toISOString();
    writeFileSync(
      filePath,
      JSON.stringify({
        version: 1,
        code: 'lowercase-bad', // fails the regex
        createdAt: now,
        rotatedAt: now,
      }),
    );
    expect(readBootstrapCode(filePath)).toBeNull();
  });
});

describe('writeBootstrapCode', () => {
  let cwd: string;
  let filePath: string;

  beforeEach(() => {
    cwd = mkTempCwd();
    filePath = join(cwd, BOOTSTRAP_CODE_FILE_PATH_REL);
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('creates parent directory if missing', () => {
    const file = mkBootstrapCodeFile();
    writeBootstrapCode(filePath, file);
    expect(readBootstrapCode(filePath)).toEqual(file);
  });

  it('overwrites an existing file atomically', () => {
    const first = mkBootstrapCodeFile({ code: 'FIRS-TFIR-STFI' });
    const second = mkBootstrapCodeFile({ code: 'SCND-SCND-SCND' });
    writeBootstrapCode(filePath, first);
    writeBootstrapCode(filePath, second);
    expect(readBootstrapCode(filePath)).toEqual(second);
  });
});

describe('ensureBootstrapCode', () => {
  let cwd: string;
  let filePath: string;

  beforeEach(() => {
    cwd = mkTempCwd();
    filePath = join(cwd, BOOTSTRAP_CODE_FILE_PATH_REL);
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('regenerates when file is missing (generated: true)', () => {
    const result = ensureBootstrapCode(cwd);
    expect(result.path).toBe(filePath);
    expect(result.generated).toBe(true);
    expect(result.data.version).toBe(1);
    expect(result.data.code).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/,
    );
    // Persisted on disk
    expect(readBootstrapCode(filePath)).toEqual(result.data);
  });

  it('reuses an existing valid file (generated: false)', () => {
    const existing: BootstrapCodeFile = mkBootstrapCodeFile({
      code: 'KEEP-KEEP-KEEP',
    });
    writeBootstrapCode(filePath, existing);
    const result = ensureBootstrapCode(cwd);
    expect(result.generated).toBe(false);
    expect(result.data).toEqual(existing);
  });

  it('regenerates when file is corrupt JSON', () => {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, '{corrupt');
    const result = ensureBootstrapCode(cwd);
    expect(result.generated).toBe(true);
    expect(result.data.code).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/,
    );
  });

  it('regenerates when file is zero-byte', () => {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, '');
    const result = ensureBootstrapCode(cwd);
    expect(result.generated).toBe(true);
  });

  it('regenerates when JSON is missing a required field', () => {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify({ version: 1, code: 'TEST-TEST-TEST' }));
    const result = ensureBootstrapCode(cwd);
    expect(result.generated).toBe(true);
  });

  it('regenerates when JSON `code` fails the regex', () => {
    mkdirSync(dirname(filePath), { recursive: true });
    const now = new Date().toISOString();
    writeFileSync(
      filePath,
      JSON.stringify({
        version: 1,
        code: 'invalid-format',
        createdAt: now,
        rotatedAt: now,
      }),
    );
    const result = ensureBootstrapCode(cwd);
    expect(result.generated).toBe(true);
  });
});
