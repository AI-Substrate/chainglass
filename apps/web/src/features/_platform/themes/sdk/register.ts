import type { IUSDK } from '@chainglass/shared/sdk';
import { themesContribution } from './contribution';

export function registerThemesSDK(sdk: IUSDK): void {
  for (const setting of themesContribution.settings) {
    sdk.settings.contribute(setting);
  }
}
