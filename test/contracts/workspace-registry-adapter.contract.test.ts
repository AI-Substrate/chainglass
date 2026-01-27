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

// ==================== WorkspaceRegistryAdapter Security Tests ====================

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
    fs.setFile('~/.config/chainglass/workspaces.json', JSON.stringify(corruptRegistry));

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
    fs.setFile('~/.config/chainglass/workspaces.json', JSON.stringify(corruptRegistry));

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

    // Create corrupt JSON in registry
    fs.setFile('~/.config/chainglass/workspaces.json', 'this is not valid json {{{');

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

    // Create registry with wrong structure
    fs.setFile('~/.config/chainglass/workspaces.json', JSON.stringify({ version: 1 }));

    // list() should throw RegistryCorruptError
    await expect(adapter.list()).rejects.toThrow(RegistryCorruptError);
  });
});
