/**
 * Plan 084 Phase 2 T001 — pure helpers in apps/web/src/auth-bootstrap/boot.ts.
 *
 * Constitution P3 (TDD: RED→GREEN) + P4 (Fakes Over Mocks — zero vi.mock).
 *
 * 14 cases per dossier (a–n).
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  checkBootstrapMisconfiguration,
  writeBootstrapCodeOnBoot,
} from '@/auth-bootstrap/boot';
import { BOOTSTRAP_CODE_FILE_PATH_REL } from '@chainglass/shared/auth-bootstrap-code';

import { mkTempCwd } from '../../shared/auth-bootstrap-code/test-fixtures';

const ENV_KEYS = ['AUTH_SECRET', 'DISABLE_AUTH', 'DISABLE_GITHUB_OAUTH'] as const;

function clearEnv(): void {
  for (const k of ENV_KEYS) {
    delete process.env[k];
  }
}

describe('checkBootstrapMisconfiguration', () => {
  beforeEach(() => clearEnv());
  afterEach(() => clearEnv());

  it('(a) all unset → { ok: false } with reason mentioning AUTH_SECRET and GitHub OAuth', () => {
    const result = checkBootstrapMisconfiguration(process.env);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/AUTH_SECRET/);
      expect(result.reason).toMatch(/GitHub OAuth/i);
    }
  });

  it('(b) AUTH_SECRET="" (empty) treated as unset → { ok: false }', () => {
    process.env.AUTH_SECRET = '';
    const result = checkBootstrapMisconfiguration(process.env);
    expect(result.ok).toBe(false);
  });

  it('(c) AUTH_SECRET="   " (whitespace-only) treated as unset → { ok: false }', () => {
    process.env.AUTH_SECRET = '   ';
    const result = checkBootstrapMisconfiguration(process.env);
    expect(result.ok).toBe(false);
  });

  it('(d) AUTH_SECRET="set" → { ok: true }', () => {
    process.env.AUTH_SECRET = 'set';
    expect(checkBootstrapMisconfiguration(process.env)).toEqual({ ok: true });
  });

  it('(e) DISABLE_AUTH=true + no AUTH_SECRET → { ok: true } (HKDF fallback allowed)', () => {
    process.env.DISABLE_AUTH = 'true';
    expect(checkBootstrapMisconfiguration(process.env)).toEqual({ ok: true });
  });

  it('(f) DISABLE_GITHUB_OAUTH=true + no AUTH_SECRET → { ok: true }', () => {
    process.env.DISABLE_GITHUB_OAUTH = 'true';
    expect(checkBootstrapMisconfiguration(process.env)).toEqual({ ok: true });
  });

  it('(g) DISABLE_AUTH="false" (literal) treated as not-disabled → { ok: false } when no AUTH_SECRET', () => {
    process.env.DISABLE_AUTH = 'false';
    const result = checkBootstrapMisconfiguration(process.env);
    expect(result.ok).toBe(false);
  });

  it('(h) DISABLE_AUTH="1" → not-disabled (only literal "true" disables)', () => {
    process.env.DISABLE_AUTH = '1';
    expect(checkBootstrapMisconfiguration(process.env).ok).toBe(false);
    process.env.DISABLE_AUTH = 'TRUE';
    expect(checkBootstrapMisconfiguration(process.env).ok).toBe(false);
  });

  it('(i) DISABLE_AUTH=true + DISABLE_GITHUB_OAUTH=false → either-side wins → { ok: true }', () => {
    process.env.DISABLE_AUTH = 'true';
    process.env.DISABLE_GITHUB_OAUTH = 'false';
    expect(checkBootstrapMisconfiguration(process.env)).toEqual({ ok: true });
  });
});

describe('writeBootstrapCodeOnBoot', () => {
  let cwd: string;
  const logs: string[] = [];
  const log = (m: string): void => {
    logs.push(m);
  };

  beforeEach(() => {
    cwd = mkTempCwd('phase2-boot-');
    logs.length = 0;
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('(j) cold call creates the file, returns generated:true, logs path + "generated"', async () => {
    const result = await writeBootstrapCodeOnBoot(cwd, log);

    expect(result.generated).toBe(true);
    expect(existsSync(join(cwd, BOOTSTRAP_CODE_FILE_PATH_REL))).toBe(true);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain(join(cwd, BOOTSTRAP_CODE_FILE_PATH_REL));
    expect(logs[0]).toMatch(/generated/);
  });

  it('(k) second call returns generated:false, log says "active" not "generated"', async () => {
    await writeBootstrapCodeOnBoot(cwd, log);
    logs.length = 0;
    const result = await writeBootstrapCodeOnBoot(cwd, log);

    expect(result.generated).toBe(false);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/active/);
    expect(logs[0]).not.toMatch(/generated/);
  });

  it('(l) log message NEVER contains the code value (AC-22 / spec default 8)', async () => {
    const cold = await writeBootstrapCodeOnBoot(cwd, log);
    const warm = await writeBootstrapCodeOnBoot(cwd, log);
    expect(cold.data.code).toBe(warm.data.code);
    for (const line of logs) {
      expect(line).not.toContain(cold.data.code);
    }
    // belt-and-suspenders: also check the file is NOT empty + the code is in the file but not the log
    const fileContents = readFileSync(join(cwd, BOOTSTRAP_CODE_FILE_PATH_REL), 'utf-8');
    expect(fileContents).toContain(cold.data.code);
  });

  it('(m) propagates EACCES from ensureBootstrapCode (read-only parent dir)', async () => {
    // Create the .chainglass dir read-only so the temp+rename cannot mkdir/write.
    const { chmodSync, mkdirSync } = await import('node:fs');
    const chainglassDir = join(cwd, '.chainglass');
    mkdirSync(chainglassDir, { recursive: true, mode: 0o555 });
    try {
      await expect(writeBootstrapCodeOnBoot(cwd, log)).rejects.toThrow(/EACCES|EROFS|EPERM/);
    } finally {
      // Restore writable so afterEach rmSync succeeds.
      chmodSync(chainglassDir, 0o755);
    }
  });

  it('(n) import-sanity: both helpers are exported from boot.ts', async () => {
    const mod = await import('@/auth-bootstrap/boot');
    expect(typeof mod.checkBootstrapMisconfiguration).toBe('function');
    expect(typeof mod.writeBootstrapCodeOnBoot).toBe('function');
  });
});
