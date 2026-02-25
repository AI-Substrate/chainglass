/**
 * Plan 045: Live File Events
 *
 * Contract test runner for file change watcher adapters.
 * Both real and fake must pass the same contract suite.
 */

import { FakeFileChangeWatcherAdapter, FileChangeWatcherAdapter } from '@chainglass/workflow';
import { fileChangeWatcherContractTests } from './file-change-watcher.contract';

// Real adapter
fileChangeWatcherContractTests('FileChangeWatcherAdapter (Real)', () => {
  return new FileChangeWatcherAdapter(300);
});

// Fake adapter
fileChangeWatcherContractTests('FakeFileChangeWatcherAdapter (Fake)', () => {
  return new FakeFileChangeWatcherAdapter();
});
