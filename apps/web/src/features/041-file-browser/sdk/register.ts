/**
 * File-browser SDK registration.
 *
 * Binds handlers to the static contribution manifest and registers
 * bootstrap-safe commands (copyPath). Commands needing React refs or
 * page-level props (openFileAtLine, restartFlowspace) are registered via
 * useEffect in browser-client.tsx.
 *
 * Per ADR-0009: registerXxxSDK(sdk) pattern.
 * Per Plan 047, Phase 6, Task T001.
 *
 * FX001-3: restartFlowspace was previously registered here with a handler
 * that read `?worktree=` from window.location — but the dashboard URL pattern
 * is `/workspaces/[slug]/browser?file=…`, no `worktree` query param. The
 * command was a silent no-op. It now lives in browser-client.tsx where the
 * live worktreePath prop is in scope.
 */

import type { IUSDK } from '@chainglass/shared/sdk';

import { fileBrowserContribution } from './contribution';

/**
 * Register file-browser SDK contributions that don't need component refs.
 * Called from bootstrapSDK().
 */
export function registerFileBrowserSDK(sdk: IUSDK): void {
  // Contribute settings
  for (const setting of fileBrowserContribution.settings) {
    sdk.settings.contribute(setting);
  }

  // Register copyPath — needs no refs, just reads current URL
  const copyPathCmd = fileBrowserContribution.commands.find(
    (c) => c.id === 'file-browser.copyPath'
  );
  if (copyPathCmd) {
    sdk.commands.register({
      ...copyPathCmd,
      handler: async () => {
        const url = new URL(window.location.href);
        const file = url.searchParams.get('file');
        if (file) {
          await navigator.clipboard.writeText(file);
          sdk.toast.success(`Copied: ${file}`);
        } else {
          sdk.toast.info('No file selected');
        }
      },
    });
  }

  // Register keybindings
  for (const binding of fileBrowserContribution.keybindings) {
    sdk.keybindings.register(binding);
  }
}
