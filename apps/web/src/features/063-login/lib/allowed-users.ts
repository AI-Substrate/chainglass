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
  const configPath = filePath ?? `${process.cwd()}/.chainglass/auth.yaml`;
  const allowed = loadAllowedUsers(configPath);
  return allowed.has(username.toLowerCase());
}
