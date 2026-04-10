/**
 * SDK domain registrations — app-level wiring.
 *
 * This module lives at the app level (not _platform/sdk infrastructure)
 * because it imports from business domains (file-browser, events).
 * Infrastructure must not depend on business — domain registrations
 * are wired by the caller, not by bootstrap itself.
 *
 * Per Plan 047, Phase 6, FT-002 (code review fix).
 */

import type { IUSDK } from '@chainglass/shared/sdk';

import { registerEventsSDK } from '@/features/027-central-notify-events/sdk/register';
import { registerFileBrowserSDK } from '@/features/041-file-browser/sdk/register';
import { registerTerminalSDK } from '@/features/064-terminal/sdk/register';
import { registerFileNotesSDK } from '@/features/071-file-notes/sdk/register';
import { registerPRViewSDK } from '@/features/071-pr-view/sdk/register';
import { registerThemesSDK } from '@/features/_platform/themes/sdk/register';

/**
 * Register all domain SDK contributions.
 * Called after bootstrapSDK() returns, before the SDK is made available.
 */
export function registerAllDomains(sdk: IUSDK): void {
  registerFileBrowserSDK(sdk);
  registerEventsSDK(sdk);
  registerFileNotesSDK(sdk);
  registerPRViewSDK(sdk);
  registerTerminalSDK(sdk);
  registerThemesSDK(sdk);
}
