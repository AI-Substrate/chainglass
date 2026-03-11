/**
 * PR View — Feature Barrel Exports
 *
 * Server-only exports (lib/) must be imported directly, not via barrel.
 *
 * Plan 071: PR View & File Notes — Phase 4 (types), Phase 5 (hooks/components/SDK)
 */

export type {
  BranchChangedFile,
  ComparisonMode,
  DiffFileStats,
  DiffFileStatus,
  PRViewData,
  PRViewFile,
  PRViewFileState,
  PRViewResult,
} from './types';

export { PR_VIEW_STATE_DIR, PR_VIEW_STATE_FILE } from './types';

// Phase 5: Hooks
export { PRViewOverlayProvider, usePRViewOverlay } from './hooks/use-pr-view-overlay';
export { usePRViewData } from './hooks/use-pr-view-data';

// Phase 5: SDK
export { registerPRViewSDK } from './sdk/register';
export { prViewContribution } from './sdk/contribution';
