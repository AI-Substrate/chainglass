/**
 * SDK Contract Tests — run against FakeUSDK (and real implementations when available).
 *
 * Per R-TEST-008: Contract tests run against both fake AND real.
 * Per Constitution P2: Fake passes contract tests first.
 */

import {
  FakeCommandRegistry,
  FakeContextKeyService,
  FakeKeybindingService,
  FakeSettingsStore,
} from '@chainglass/shared/fakes';

import { CommandRegistry } from '../../apps/web/src/lib/sdk/command-registry.js';
import { ContextKeyService } from '../../apps/web/src/lib/sdk/context-key-service.js';
import { KeybindingService } from '../../apps/web/src/lib/sdk/keybinding-service.js';
import { SettingsStore } from '../../apps/web/src/lib/sdk/settings-store.js';

import {
  sdkCommandRegistryContractTests,
  sdkContextKeyContractTests,
  sdkKeybindingContractTests,
  sdkSettingsStoreContractTests,
} from './sdk.contract.js';

// Run contract tests against Fake implementations
{
  // Shared context for when-clause testing
  let sharedCtx: FakeContextKeyService;
  sdkCommandRegistryContractTests(
    'FakeCommandRegistry',
    () => {
      sharedCtx = new FakeContextKeyService();
      return new FakeCommandRegistry(sharedCtx);
    },
    () => sharedCtx
  );
}
sdkSettingsStoreContractTests('FakeSettingsStore', () => new FakeSettingsStore());
sdkContextKeyContractTests('FakeContextKeyService', () => new FakeContextKeyService());

// Run contract tests against Real implementations
{
  let sharedCtx: ContextKeyService;
  sdkCommandRegistryContractTests(
    'CommandRegistry',
    () => {
      sharedCtx = new ContextKeyService();
      return new CommandRegistry(sharedCtx);
    },
    () => sharedCtx
  );
}
sdkSettingsStoreContractTests('SettingsStore', () => new SettingsStore());
sdkContextKeyContractTests('ContextKeyService', () => new ContextKeyService());

// Keybinding contract tests
{
  let sharedCtx: FakeContextKeyService;
  sdkKeybindingContractTests(
    'FakeKeybindingService',
    () => {
      sharedCtx = new FakeContextKeyService();
      return new FakeKeybindingService(sharedCtx);
    },
    () => sharedCtx
  );
}
{
  let sharedCtx: ContextKeyService;
  sdkKeybindingContractTests(
    'KeybindingService',
    () => {
      sharedCtx = new ContextKeyService();
      return new KeybindingService(sharedCtx);
    },
    () => sharedCtx
  );
}
