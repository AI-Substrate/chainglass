import { FakeProcessManager } from '@chainglass/shared';
import { processManagerContractTests } from './process-manager.contract.js';

// Run contract tests for FakeProcessManager
processManagerContractTests('FakeProcessManager', () => new FakeProcessManager());

// NOTE: Real ProcessManager tests will be added in Phase 3:
//
// processManagerContractTests('ProcessManager', () => new ProcessManager(...));
