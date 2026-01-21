import fs from 'node:fs';
import path from 'node:path';

import { config as dotenvConfig } from 'dotenv';
import { expand as dotenvExpand } from 'dotenv-expand';

/**
 * Options for loading secrets to environment.
 */
export interface LoadSecretsOptions {
  /** Path to user config directory (~/.config/chainglass/) or null to skip */
  userConfigDir: string | null;
  /** Path to project config directory (.chainglass/) or null to skip */
  projectConfigDir: string | null;
}

/**
 * Result of loading secrets to a pending map for transactional loading.
 * FIX-006: Support validation before committing to process.env.
 */
export interface LoadSecretsToPendingResult {
  /** Whether any secrets were loaded */
  loaded: boolean;
  /** The pending secrets (not yet committed to process.env) */
  pending: Map<string, string>;
}

/**
 * Load a secrets.env file into process.env using dotenv with expansion.
 * Does not override existing values (first load wins).
 *
 * @param filePath - Absolute path to the secrets.env file
 * @returns true if file was loaded, false if file doesn't exist
 */
function loadSecretsFile(filePath: string): boolean {
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return false;
  }

  // Load the file with dotenv (does not override existing)
  const result = dotenvConfig({ path: filePath });

  // Expand ${VAR} references in the loaded values
  // dotenv-expand needs both the parsed values AND access to process.env
  if (result.parsed) {
    dotenvExpand({
      parsed: result.parsed,
      processEnv: process.env as Record<string, string>,
    });
  }

  return true;
}

/**
 * Load a secrets.env file, overriding any existing values in process.env.
 * Also supports ${VAR} expansion.
 *
 * @param filePath - Absolute path to the secrets.env file
 * @returns true if file was loaded, false if file doesn't exist
 */
function loadSecretsFileWithOverride(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  // Read and parse the file manually
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // First pass: parse all KEY=VALUE pairs without expansion
  const parsed: Record<string, string> = {};

  for (const line of lines) {
    // Skip empty lines and comments
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse KEY=VALUE
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalIndex).trim();
    let value = trimmed.slice(equalIndex + 1).trim();

    // Handle quoted values
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
      // Unescape \n in double-quoted strings
      if (
        trimmed
          .slice(equalIndex + 1)
          .trim()
          .startsWith('"')
      ) {
        value = value.replace(/\\n/g, '\n');
      }
    }

    parsed[key] = value;
  }

  // Second pass: expand ${VAR} references
  // Use dotenv-expand's algorithm to handle self-referential expansion
  const expanded = expandAllVariables(parsed);

  // Override values in process.env
  for (const [key, value] of Object.entries(expanded)) {
    process.env[key] = value;
  }

  return true;
}

/**
 * Expand all ${VAR} references in a set of parsed values.
 * Handles references to both existing process.env and newly defined values.
 */
function expandAllVariables(parsed: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};

  // Make a combined lookup that includes both process.env and the parsed values
  // Process.env values don't get expanded, only parsed values do
  const lookup = { ...process.env };

  // First, add all parsed values to lookup (unexpanded)
  for (const [key, value] of Object.entries(parsed)) {
    lookup[key] = value;
  }

  // Now expand each value
  for (const [key, value] of Object.entries(parsed)) {
    result[key] = expandValue(value, lookup);
  }

  return result;
}

/**
 * Maximum depth for recursive placeholder expansion.
 * FIX-007: Prevents ReDoS from nested/circular placeholders.
 */
const MAX_EXPANSION_DEPTH = 5;

/**
 * Expand ${VAR} references in a single value.
 * FIX-007: Added depth parameter to guard against infinite recursion.
 *
 * @param value - String to expand
 * @param lookup - Environment lookup for variable values
 * @param depth - Current recursion depth (internal)
 * @throws Error if expansion exceeds MAX_EXPANSION_DEPTH
 */
function expandValue(
  value: string,
  lookup: Record<string, string | undefined>,
  depth = 0
): string {
  // FIX-007: Guard against infinite recursion / ReDoS
  if (depth > MAX_EXPANSION_DEPTH) {
    throw new Error(
      `Placeholder expansion exceeded max depth (${MAX_EXPANSION_DEPTH}). ` +
        'Check for circular references or deeply nested placeholders.'
    );
  }

  // Match ${VAR} pattern
  return value.replace(/\$\{([^}]+)\}/g, (_match, varName) => {
    const lookupValue = lookup[varName];
    if (lookupValue === undefined) {
      return '';
    }
    // Recursively expand if the lookup value also has placeholders
    if (lookupValue.includes('${')) {
      return expandValue(lookupValue, lookup, depth + 1);
    }
    return lookupValue;
  });
}

/**
 * Load secrets from user and project secrets.env files into process.env.
 *
 * Per seven-phase pipeline (Phases 1-3):
 * 1. Load user secrets.env (lowest priority)
 * 2. Load project secrets.env (overrides user)
 *
 * Uses dotenv-expand to support ${VAR} references within secrets files.
 * Does NOT override pre-existing process.env values (dotenv convention).
 * However, project secrets DO override user secrets.
 *
 * @param options - Configuration for loading secrets
 */
export function loadSecretsToEnv(options: LoadSecretsOptions): void {
  const { userConfigDir, projectConfigDir } = options;

  // Phase 1: Load user secrets.env (lowest priority)
  // Uses standard dotenv (doesn't override existing)
  if (userConfigDir) {
    const userSecretsPath = path.join(userConfigDir, 'secrets.env');
    loadSecretsFile(userSecretsPath);
  }

  // Phase 2: Load project secrets.env (higher priority)
  // Uses custom loader that DOES override user secrets
  if (projectConfigDir) {
    const projectSecretsPath = path.join(projectConfigDir, 'secrets.env');
    loadSecretsFileWithOverride(projectSecretsPath);
  }
}

/**
 * FIX-006: Load secrets to a pending map for transactional loading.
 * Does NOT modify process.env - caller must commit with commitPendingSecrets().
 *
 * @param options - Configuration for loading secrets
 * @returns Result with loaded flag and pending secrets map
 */
export function loadSecretsToPending(options: LoadSecretsOptions): LoadSecretsToPendingResult {
  const { userConfigDir, projectConfigDir } = options;
  const pending = new Map<string, string>();

  // Phase 1: Load user secrets.env (lowest priority)
  if (userConfigDir) {
    const userSecretsPath = path.join(userConfigDir, 'secrets.env');
    loadSecretsFileToPending(userSecretsPath, pending, false);
  }

  // Phase 2: Load project secrets.env (higher priority, overrides user)
  if (projectConfigDir) {
    const projectSecretsPath = path.join(projectConfigDir, 'secrets.env');
    loadSecretsFileToPending(projectSecretsPath, pending, true);
  }

  return {
    loaded: pending.size > 0,
    pending,
  };
}

/**
 * FIX-006: Commit pending secrets to process.env.
 * Only call this after validation succeeds.
 *
 * @param pending - Map of secrets to commit
 */
export function commitPendingSecrets(pending: Map<string, string>): void {
  for (const [key, value] of pending.entries()) {
    process.env[key] = value;
  }
}

/**
 * Load a secrets.env file into a pending map instead of process.env.
 * Supports ${VAR} expansion.
 *
 * @param filePath - Absolute path to the secrets.env file
 * @param pending - Map to add secrets to
 * @param override - Whether to override existing values in pending map
 * @returns true if file was loaded, false if file doesn't exist
 */
function loadSecretsFileToPending(
  filePath: string,
  pending: Map<string, string>,
  override: boolean
): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  // Read and parse the file manually
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // First pass: parse all KEY=VALUE pairs without expansion
  const parsed: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalIndex).trim();
    let value = trimmed.slice(equalIndex + 1).trim();

    // Handle quoted values
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
      if (
        trimmed
          .slice(equalIndex + 1)
          .trim()
          .startsWith('"')
      ) {
        value = value.replace(/\\n/g, '\n');
      }
    }

    parsed[key] = value;
  }

  // Second pass: expand ${VAR} references
  // Create lookup combining process.env, existing pending, and new parsed values
  const lookup: Record<string, string | undefined> = { ...process.env };
  for (const [key, value] of pending.entries()) {
    lookup[key] = value;
  }
  for (const [key, value] of Object.entries(parsed)) {
    lookup[key] = value;
  }

  const expanded = expandAllVariablesWithLookup(parsed, lookup);

  // Add to pending map
  for (const [key, value] of Object.entries(expanded)) {
    if (override || !pending.has(key)) {
      pending.set(key, value);
    }
  }

  return true;
}

/**
 * Expand all ${VAR} references in a set of parsed values using custom lookup.
 */
function expandAllVariablesWithLookup(
  parsed: Record<string, string>,
  lookup: Record<string, string | undefined>
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(parsed)) {
    result[key] = expandValue(value, lookup);
  }

  return result;
}
