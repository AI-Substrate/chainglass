/**
 * Run IWorkspaceRegistryAdapter contract tests against both implementations.
 *
 * Per Phase 1: Workspace Entity + Registry Adapter + Contract Tests
 * Per Critical Discovery 03: Contract tests prevent fake drift.
 *
 * Follows the established pattern from filesystem.contract.test.ts.
 */

import { FakeFileSystem, FakePathResolver } from '@chainglass/shared';
import {
  FakeWorkspaceRegistryAdapter,
  RegistryCorruptError,
  Workspace,
  WorkspaceRegistryAdapter,
} from '@chainglass/workflow';
import { describe, expect, it } from 'vitest';
import {
  type WorkspaceRegistryAdapterTestContext,
  workspaceRegistryAdapterContractTests,
} from './workspace-registry-adapter.contract.js';

// ==================== FakeWorkspaceRegistryAdapter Context ====================

function createFakeWorkspaceRegistryAdapterContext(): WorkspaceRegistryAdapterTestContext {
  const adapter = new FakeWorkspaceRegistryAdapter();

  return {
    name: 'FakeWorkspaceRegistryAdapter',
    adapter,
    setup: async () => {
      adapter.reset();
    },
    cleanup: async () => {
      adapter.reset();
    },
  };
}

// ==================== WorkspaceRegistryAdapter Context ====================

function createWorkspaceRegistryAdapterContext(): WorkspaceRegistryAdapterTestContext {
  const fs = new FakeFileSystem();
  const pathResolver = new FakePathResolver();
  const adapter = new WorkspaceRegistryAdapter(fs, pathResolver);

  return {
    name: 'WorkspaceRegistryAdapter',
    adapter,
    setup: async () => {
      fs.reset();
      // The FakePathResolver returns paths as-is, so ~/.config/chainglass/ will be the literal path
      // The adapter will create the registry file on first write
    },
    cleanup: async () => {
      fs.reset();
    },
  };
}

// ==================== Run Contract Tests ====================

// T009: FakeWorkspaceRegistryAdapter contract tests
workspaceRegistryAdapterContractTests(createFakeWorkspaceRegistryAdapterContext);

// T010: WorkspaceRegistryAdapter contract tests
workspaceRegistryAdapterContractTests(createWorkspaceRegistryAdapterContext);

// ==================== T008: Atomic Write + Preferences Pass-Through Tests ====================

describe('WorkspaceRegistryAdapter atomic write and preferences', () => {
  it('should use atomic write pattern (tmp+rename) for registry writes', async () => {
    /*
    Test Doc:
    - Why: Per Critical Discovery 01 — crash mid-write corrupts all workspace data
    - Contract: writeRegistry() writes to .tmp then renames to target
    - Quality Contribution: Prevents data loss on crash during write
    - Worked Example: save() → .tmp file written → renamed to workspaces.json
    */
    const fs = new FakeFileSystem();
    const pathResolver = new FakePathResolver();
    const adapter = new WorkspaceRegistryAdapter(fs, pathResolver);

    const workspace = Workspace.create({
      name: 'Test Atomic',
      path: '/home/user/test-atomic',
    });

    await adapter.save(workspace);

    // The registry file should exist with valid content
    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '';
    const registryPath = homeDir
      ? `${homeDir}/.config/chainglass/workspaces.json`
      : '~/.config/chainglass/workspaces.json';

    const exists = await fs.exists(registryPath);
    expect(exists).toBe(true);

    const content = await fs.readFile(registryPath);
    const registry = JSON.parse(content);
    expect(registry.workspaces).toHaveLength(1);
    expect(registry.workspaces[0].slug).toBe('test-atomic');

    // The .tmp file should NOT remain
    const tmpExists = await fs.exists(`${registryPath}.tmp`);
    expect(tmpExists).toBe(false);
  });

  it('should preserve preferences through save+load roundtrip', async () => {
    /*
    Test Doc:
    - Why: DYK-P1-01 — load()/list() must pass preferences to Workspace.create()
    - Contract: save with preferences → load returns same preferences
    - Quality Contribution: Prevents silent preference data loss
    - Worked Example: save(ws with emoji 🔮) → load() → preferences.emoji === '🔮'
    */
    const fs = new FakeFileSystem();
    const pathResolver = new FakePathResolver();
    const adapter = new WorkspaceRegistryAdapter(fs, pathResolver);

    const workspace = Workspace.create({
      name: 'Test Prefs',
      path: '/home/user/test-prefs',
      preferences: { emoji: '🔮', color: 'purple', starred: true, sortOrder: 5 },
    });

    await adapter.save(workspace);
    const loaded = await adapter.load('test-prefs');

    expect(loaded.preferences.emoji).toBe('🔮');
    expect(loaded.preferences.color).toBe('purple');
    expect(loaded.preferences.starred).toBe(true);
    expect(loaded.preferences.sortOrder).toBe(5);
  });

  it('should preserve preferences through save+list roundtrip', async () => {
    /*
    Test Doc:
    - Why: DYK-P1-01 — list() must also pass preferences
    - Contract: save with preferences → list() returns same preferences
    - Quality Contribution: Ensures list() and load() are consistent
    */
    const fs = new FakeFileSystem();
    const pathResolver = new FakePathResolver();
    const adapter = new WorkspaceRegistryAdapter(fs, pathResolver);

    const workspace = Workspace.create({
      name: 'Test Prefs List',
      path: '/home/user/test-prefs-list',
      preferences: { emoji: '🦊', color: 'orange', starred: false, sortOrder: 3 },
    });

    await adapter.save(workspace);
    const workspaces = await adapter.list();

    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].preferences.emoji).toBe('🦊');
    expect(workspaces[0].preferences.color).toBe('orange');
    expect(workspaces[0].preferences.sortOrder).toBe(3);
  });

  it('should handle missing preferences in registry JSON gracefully', async () => {
    /*
    Test Doc:
    - Why: DYK-P1-02 — v1 registries have no preferences field; must use defaults
    - Contract: Loading workspace without preferences in JSON returns DEFAULT_PREFERENCES
    - Quality Contribution: Backwards compatibility with v1 registry format
    */
    const fs = new FakeFileSystem();
    const pathResolver = new FakePathResolver();
    const adapter = new WorkspaceRegistryAdapter(fs, pathResolver);

    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '';
    const registryPath = homeDir
      ? `${homeDir}/.config/chainglass/workspaces.json`
      : '~/.config/chainglass/workspaces.json';

    // Write a v1-style registry without preferences
    const v1Registry = {
      version: 1,
      workspaces: [
        {
          slug: 'legacy',
          name: 'Legacy Workspace',
          path: '/home/user/legacy',
          createdAt: '2024-01-15T10:30:00.000Z',
        },
      ],
    };
    fs.setFile(registryPath, JSON.stringify(v1Registry));

    const loaded = await adapter.load('legacy');
    expect(loaded.preferences.emoji).toBe('');
    expect(loaded.preferences.color).toBe('');
    expect(loaded.preferences.starred).toBe(false);
    expect(loaded.preferences.sortOrder).toBe(0);
  });
});

describe('WorkspaceRegistryAdapter security', () => {
  it('should reject loading workspaces with traversal paths from corrupt registry', async () => {
    /*
    Test Doc:
    - Why: Security - tampered registry should not load malicious paths
    - Contract: load() throws error for invalid paths in registry
    - Quality Contribution: Defense in depth for registry tampering
    - Worked Example: Manually corrupt registry with ../etc/passwd → load() throws
    */
    const fs = new FakeFileSystem();
    const pathResolver = new FakePathResolver();
    const adapter = new WorkspaceRegistryAdapter(fs, pathResolver);

    // The adapter expands ~ to HOME env var
    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '';
    const registryPath = homeDir
      ? `${homeDir}/.config/chainglass/workspaces.json`
      : '~/.config/chainglass/workspaces.json';

    // Manually create corrupt registry with malicious path
    const corruptRegistry = {
      version: 1,
      workspaces: [
        {
          slug: 'evil-workspace',
          name: 'Evil Workspace',
          path: '/home/user/../etc/passwd',
          createdAt: new Date().toISOString(),
        },
      ],
    };
    fs.setFile(registryPath, JSON.stringify(corruptRegistry));

    // Attempting to load should fail
    await expect(adapter.load('evil-workspace')).rejects.toThrow();
  });

  it('should reject loading workspaces with URL-encoded traversal paths from corrupt registry', async () => {
    /*
    Test Doc:
    - Why: Security - URL-encoded traversal in registry should be caught
    - Contract: load() throws error for URL-encoded traversal paths in registry
    - Quality Contribution: Complete bypass prevention even in tampered data
    */
    const fs = new FakeFileSystem();
    const pathResolver = new FakePathResolver();
    const adapter = new WorkspaceRegistryAdapter(fs, pathResolver);

    // The adapter expands ~ to HOME env var
    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '';
    const registryPath = homeDir
      ? `${homeDir}/.config/chainglass/workspaces.json`
      : '~/.config/chainglass/workspaces.json';

    // Manually create corrupt registry with URL-encoded malicious path
    const corruptRegistry = {
      version: 1,
      workspaces: [
        {
          slug: 'evil-workspace-2',
          name: 'Evil Workspace 2',
          path: '/home/user/%2e%2e/etc/passwd',
          createdAt: new Date().toISOString(),
        },
      ],
    };
    fs.setFile(registryPath, JSON.stringify(corruptRegistry));

    // Attempting to load should fail
    await expect(adapter.load('evil-workspace-2')).rejects.toThrow();
  });

  it('should throw RegistryCorruptError for invalid JSON in registry', async () => {
    /*
    Test Doc:
    - Why: Silent data loss is dangerous - corrupt registry should be detected
    - Contract: list()/load() throws RegistryCorruptError for invalid JSON
    - Quality Contribution: Prevents silent data loss from registry corruption
    - Worked Example: Invalid JSON in registry → RegistryCorruptError thrown
    */
    const fs = new FakeFileSystem();
    const pathResolver = new FakePathResolver();
    const adapter = new WorkspaceRegistryAdapter(fs, pathResolver);

    // The adapter expands ~ to HOME env var
    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '';
    const registryPath = homeDir
      ? `${homeDir}/.config/chainglass/workspaces.json`
      : '~/.config/chainglass/workspaces.json';

    // Create corrupt JSON in registry
    fs.setFile(registryPath, 'this is not valid json {{{');

    // list() should throw RegistryCorruptError
    await expect(adapter.list()).rejects.toThrow(RegistryCorruptError);
  });

  it('should throw RegistryCorruptError for missing workspaces array', async () => {
    /*
    Test Doc:
    - Why: Registry with wrong structure should not silently return empty
    - Contract: list() throws RegistryCorruptError for invalid structure
    - Quality Contribution: Detects structural corruption
    */
    const fs = new FakeFileSystem();
    const pathResolver = new FakePathResolver();
    const adapter = new WorkspaceRegistryAdapter(fs, pathResolver);

    // The adapter expands ~ to HOME env var
    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '';
    const registryPath = homeDir
      ? `${homeDir}/.config/chainglass/workspaces.json`
      : '~/.config/chainglass/workspaces.json';

    // Create registry with wrong structure
    fs.setFile(registryPath, JSON.stringify({ version: 1 }));

    // list() should throw RegistryCorruptError
    await expect(adapter.list()).rejects.toThrow(RegistryCorruptError);
  });
});
