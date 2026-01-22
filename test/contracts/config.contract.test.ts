import { FakeConfigService, ChainglassConfigService } from '@chainglass/shared';
import { configServiceContractTests } from './config.contract.js';

// Run contract tests for FakeConfigService
configServiceContractTests('FakeConfigService', () => new FakeConfigService());

// Run contract tests for ChainglassConfigService (Phase 3)
// IMPORTANT: Contract tests expect a fresh service with no pre-loaded configs.
// We do NOT call load() here because:
// 1. load() auto-loads all registered ConfigTypes with defaults
// 2. Contract tests verify behavior like "get() returns undefined before set()"
// 3. Production code ALWAYS calls load() first, but contract tests verify the interface
//
// The key contract behaviors (get/set/require) work the same whether load() was called.
// The auto-loading behavior is ChainglassConfigService-specific, not part of IConfigService.
configServiceContractTests('ChainglassConfigService', () => {
  return new ChainglassConfigService({
    userConfigDir: null,
    projectConfigDir: null,
  });
  // Intentionally NOT calling load() - contract tests verify interface behavior
});
