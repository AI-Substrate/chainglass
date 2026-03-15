/**
 * Global accessor for WorkflowExecutionManager singleton.
 * Plan 074: Workflow Execution from Web UI — Phase 2.
 *
 * The manager is bootstrapped in instrumentation.ts and stored on globalThis.
 * This getter provides type-safe access from server-side code (server actions, API routes).
 */

import type { IWorkflowExecutionManager } from './workflow-execution-manager.types.js';

declare global {
  // biome-ignore lint/style/noVar: globalThis augmentation requires var
  var __workflowExecutionManager: IWorkflowExecutionManager | undefined;
}

export function getWorkflowExecutionManager(): IWorkflowExecutionManager {
  const manager = globalThis.__workflowExecutionManager;
  if (!manager) {
    throw new Error(
      'WorkflowExecutionManager not initialized. ' +
        'Ensure instrumentation.ts has bootstrapped the manager before accessing it. ' +
        'This error typically means the server is still starting or initialization failed.'
    );
  }
  return manager;
}
