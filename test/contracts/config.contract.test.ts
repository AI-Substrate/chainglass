import { FakeConfigService } from '@chainglass/shared/fakes';
import { configServiceContractTests } from './config.contract.js';

// Run contract tests for FakeConfigService
configServiceContractTests('FakeConfigService', () => new FakeConfigService());

// ChainglassConfigService contract tests added in Phase 3
