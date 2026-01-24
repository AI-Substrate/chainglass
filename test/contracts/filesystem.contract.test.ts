import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FakeFileSystem, NodeFileSystemAdapter } from '@chainglass/shared';
import { fileSystemContractTests } from './filesystem.contract.js';

/**
 * Run IFileSystem contract tests against both implementations.
 *
 * Per Critical Discovery 08: Contract tests ensure fake matches real behavior.
 */

// Test NodeFileSystemAdapter
fileSystemContractTests('NodeFileSystemAdapter', () => {
  let tempDir: string;
  const adapter = new NodeFileSystemAdapter();

  return {
    fs: adapter,
    setup: async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'contract-test-'));
      return tempDir;
    },
    cleanup: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    },
    createFile: async (filePath: string, content: string) => {
      await fs.writeFile(filePath, content);
    },
    createDir: async (dirPath: string) => {
      await fs.mkdir(dirPath, { recursive: true });
    },
  };
});

// Test FakeFileSystem
fileSystemContractTests('FakeFileSystem', () => {
  const fake = new FakeFileSystem();

  return {
    fs: fake,
    setup: async () => {
      fake.reset();
      fake.setDir('/test');
      return '/test';
    },
    cleanup: async () => {
      fake.reset();
    },
    createFile: async (filePath: string, content: string) => {
      fake.setFile(filePath, content);
    },
    createDir: async (dirPath: string) => {
      fake.setDir(dirPath);
    },
  };
});
