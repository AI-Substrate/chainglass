import type { IUSDK } from '@chainglass/shared/sdk';
import { terminalContribution } from './contribution';

export function registerTerminalSDK(sdk: IUSDK): void {
  for (const setting of terminalContribution.settings) {
    sdk.settings.contribute(setting);
  }
}
