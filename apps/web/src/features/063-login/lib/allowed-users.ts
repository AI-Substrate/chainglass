import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';

const AuthConfigSchema = z.object({
  allowed_users: z.array(z.string()),
});

/**
 * Load allowed users from a YAML file.
 * Returns a Set of lowercase usernames.
 * Returns empty Set if file is missing or invalid.
 */
export function loadAllowedUsers(filePath: string): Set<string> {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = parse(content);
    const validated = AuthConfigSchema.parse(parsed);
    return new Set(validated.allowed_users.map((u) => u.toLowerCase()));
  } catch (error) {
    console.warn('[auth] Failed to load allowlist from', filePath, error);
    return new Set();
  }
}

/**
 * Check if a GitHub username is allowed.
 * Case-insensitive comparison.
 */
export function isUserAllowed(username: string, filePath?: string): boolean {
  // Walk up from cwd to find .chainglass/auth.yaml (handles monorepo where cwd is apps/web)
  const configPath = filePath ?? findAuthConfig();
  const allowed = loadAllowedUsers(configPath);
  return allowed.has(username.toLowerCase());
}

function findAuthConfig(): string {
  const { existsSync } = require('node:fs') as typeof import('node:fs');
  const { resolve, dirname } = require('node:path') as typeof import('node:path');
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = resolve(dir, '.chainglass/auth.yaml');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(process.cwd(), '.chainglass/auth.yaml');
}
