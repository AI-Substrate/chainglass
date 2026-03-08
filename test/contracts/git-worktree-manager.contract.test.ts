import { FakeGitWorktreeManager } from '@chainglass/workflow';
import { gitWorktreeManagerContractTests } from './git-worktree-manager.contract.js';

// Run contract tests for FakeGitWorktreeManager
gitWorktreeManagerContractTests('FakeGitWorktreeManager', () => new FakeGitWorktreeManager());

// Phase 2: Add real adapter here:
// gitWorktreeManagerContractTests('GitWorktreeManagerAdapter', () => createRealManager());
