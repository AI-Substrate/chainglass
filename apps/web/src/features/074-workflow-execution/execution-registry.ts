/**
 * Execution Registry: read/write module.
 * Plan 074: Workflow Execution from Web UI — Phase 5 T002.
 *
 * Persists execution state to ~/.config/chainglass/execution-registry.json.
 * Uses synchronous FS operations (P5-DYK #2) to prevent write interleaving.
 * Uses write-to-temp + renameSync for atomic writes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getUserConfigDir } from '@chainglass/shared';
import {
  type ExecutionRegistry,
  ExecutionRegistrySchema,
  type IExecutionRegistry,
  createEmptyRegistry,
} from './execution-registry.types';

const REGISTRY_FILENAME = 'execution-registry.json';

function getRegistryPath(): string {
  return path.join(getUserConfigDir(), REGISTRY_FILENAME);
}

function ensureRegistryDir(): void {
  const dir = getUserConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  }
}

/**
 * Read the execution registry from disk.
 * Returns an empty registry if the file is missing, corrupt, or fails validation.
 * P5-DYK #3: Never throws — always returns a valid registry.
 */
function readRegistry(): ExecutionRegistry {
  const registryPath = getRegistryPath();
  try {
    if (!fs.existsSync(registryPath)) {
      return createEmptyRegistry();
    }
    const raw = fs.readFileSync(registryPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const result = ExecutionRegistrySchema.safeParse(parsed);
    if (!result.success) {
      console.warn(
        '[execution-registry] Registry file failed validation, returning empty:',
        result.error.message
      );
      return createEmptyRegistry();
    }
    return result.data;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[execution-registry] Failed to read registry, returning empty: ${msg}`);
    return createEmptyRegistry();
  }
}

/**
 * Write the execution registry to disk atomically.
 * P5-DYK #2: Uses writeFileSync + renameSync (synchronous) to prevent
 * interleaving when multiple transitions happen rapidly.
 */
function writeRegistry(registry: ExecutionRegistry): void {
  ensureRegistryDir();
  const registryPath = getRegistryPath();
  const tempPath = `${registryPath}.tmp`;
  const content = JSON.stringify({ ...registry, updatedAt: new Date().toISOString() }, null, 2);

  try {
    fs.writeFileSync(tempPath, content, 'utf-8');
    fs.renameSync(tempPath, registryPath);
  } catch (error) {
    // Best-effort cleanup of temp file
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // ignore cleanup errors
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[execution-registry] Failed to write registry: ${msg}`);
  }
}

/**
 * Remove the registry file from disk.
 * P5-DYK #3: Used for self-healing — delete corrupt registry so next restart is clean.
 */
function removeRegistry(): void {
  const registryPath = getRegistryPath();
  try {
    if (fs.existsSync(registryPath)) {
      fs.unlinkSync(registryPath);
      console.warn('[execution-registry] Registry file deleted (self-healing)');
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[execution-registry] Failed to delete registry: ${msg}`);
  }
}

/**
 * Create an IExecutionRegistry implementation backed by the filesystem.
 * This is the production implementation injected into the manager via DI.
 */
export function createFileExecutionRegistry(): IExecutionRegistry {
  return {
    read: readRegistry,
    write: writeRegistry,
    remove: removeRegistry,
  };
}

// Re-export for direct usage in tests or bootstrap
export { readRegistry, writeRegistry, removeRegistry, getRegistryPath, REGISTRY_FILENAME };
