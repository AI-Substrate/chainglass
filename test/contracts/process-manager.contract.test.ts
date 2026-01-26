import { FakeLogger, FakeProcessManager, UnixProcessManager } from '@chainglass/shared';
import { processManagerContractTests } from './process-manager.contract.js';

// Run contract tests for FakeProcessManager
processManagerContractTests('FakeProcessManager', () => new FakeProcessManager());

// Run contract tests for UnixProcessManager (Phase 3)
// Uses FakeLogger for observability without real logging
processManagerContractTests('UnixProcessManager', () => new UnixProcessManager(new FakeLogger()));
