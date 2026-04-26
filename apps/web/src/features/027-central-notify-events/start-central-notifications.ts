/**
 * Plan 027: Central Domain Event Notification System
 *
 * Bootstrap helper for the central notification system.
 *
 * Resolves services from DI, creates domain event adapters,
 * registers them with the filesystem watcher, and starts watching.
 *
 * Per Discovery 02: globalThis gating prevents double-start across HMR.
 * Per DYK Insight #2: Flag resets on failure for retry capability.
 * Per PL-14: Uses getContainer() for lazy DI resolution.
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared/di-tokens';
import type { ICentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/central-event-notifier.interface';
import type { ICentralWatcherService, IWorkspaceService } from '@chainglass/workflow';
import {
  FileChangeWatcherAdapter,
  WorkUnitCatalogWatcherAdapter,
  WorkflowWatcherAdapter,
} from '@chainglass/workflow';
import { getContainer } from '../../lib/bootstrap-singleton';
import { FileChangeDomainEventAdapter } from './file-change-domain-event-adapter';
import { UnitCatalogDomainEventAdapter } from './unit-catalog-domain-event.adapter';
import { WorkflowDomainEventAdapter } from './workflow-domain-event-adapter';

declare global {
  var __centralNotificationsStarted: boolean | undefined;
  /**
   * Plan 084 (live-monitoring-rescan): unsubscribe handle for the
   * `IWorkspaceService.onMutation` listener. Pinned to globalThis so the
   * listener can be detached on HMR before re-attaching to the new
   * `WorkspaceService` instance — prevents listener leaks and stale
   * dead-instance subscriptions across server-file edits.
   */
  var __watcherMutationUnsubscribe__: (() => void) | undefined;
}

/**
 * Detach any prior mutation listener and re-attach to the current
 * `IWorkspaceService` instance.
 *
 * Runs UNCONDITIONALLY on every call to `startCentralNotificationSystem` —
 * i.e., NOT gated by the `__centralNotificationsStarted` flag. This is
 * deliberate: HMR re-evaluations may bring a fresh `WorkspaceService` from DI;
 * the listener must follow it. Without this, a naive splice of the
 * subscription inside the flag-guarded body would leave the post-HMR listener
 * attached to a dead instance, silently breaking live file monitoring after
 * the first save of a server file.
 *
 * Per Plan 084 (live-monitoring-rescan) Workshop 003 § Lifecycle Ownership +
 * validate-v2 Forward-Compat fix F1.
 */
function attachMutationListener(): void {
  try {
    // Detach prior listener first (HMR safety). Idempotent — the unsubscribe
    // returned by IWorkspaceService.onMutation is safe to call repeatedly.
    globalThis.__watcherMutationUnsubscribe__?.();
    globalThis.__watcherMutationUnsubscribe__ = undefined;

    const container = getContainer();
    const watcher = container.resolve<ICentralWatcherService>(
      WORKSPACE_DI_TOKENS.CENTRAL_WATCHER_SERVICE
    );
    const workspaceService = container.resolve<IWorkspaceService>(
      WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
    );

    globalThis.__watcherMutationUnsubscribe__ = workspaceService.onMutation(() => {
      watcher.rescan().catch((err) => {
        console.error('[central-notifications] mutation-driven rescan failed:', err);
      });
    });
    console.info('[central-notifications] mutation listener attached');
  } catch (err) {
    // Failure here must not propagate — the rest of bootstrap can still proceed,
    // and a subsequent HMR or restart will retry the attach.
    console.error('[central-notifications] failed to attach mutation listener:', err);
  }
}

/**
 * Start the central notification system.
 *
 * Idempotent: safe to call multiple times (only executes once).
 * Uses globalThis flag to survive Next.js HMR reloads.
 *
 * Resolves CentralWatcherService and CentralEventNotifier from DI,
 * creates domain event adapters, registers watcher adapters,
 * subscribes domain adapters to watcher events, and starts watching.
 */
export async function startCentralNotificationSystem(): Promise<void> {
  // Always (re-)attach the workspace mutation listener. This MUST run before
  // the __centralNotificationsStarted guard so HMR re-runs refresh the listener
  // even when the rest of the wire-up is skipped. (Plan 084 — live-monitoring-rescan)
  attachMutationListener();

  if (globalThis.__centralNotificationsStarted) {
    return;
  }
  globalThis.__centralNotificationsStarted = true;

  try {
    // 1. Resolve services from DI
    const container = getContainer();
    const watcher = container.resolve<ICentralWatcherService>(
      WORKSPACE_DI_TOKENS.CENTRAL_WATCHER_SERVICE
    );
    const notifier = container.resolve<ICentralEventNotifier>(
      WORKSPACE_DI_TOKENS.CENTRAL_EVENT_NOTIFIER
    );

    // 2. Create domain event adapters
    const fileChangeDomainAdapter = new FileChangeDomainEventAdapter(notifier);
    const workflowDomainAdapter = new WorkflowDomainEventAdapter(notifier);
    const unitCatalogDomainAdapter = new UnitCatalogDomainEventAdapter(notifier);

    // 3. Create and register watcher adapters
    const fileChangeWatcherAdapter = new FileChangeWatcherAdapter(300);
    watcher.registerAdapter(fileChangeWatcherAdapter);

    const workflowWatcherAdapter = new WorkflowWatcherAdapter();
    watcher.registerAdapter(workflowWatcherAdapter);

    const unitCatalogWatcherAdapter = new WorkUnitCatalogWatcherAdapter();
    watcher.registerAdapter(unitCatalogWatcherAdapter);

    // 4. Subscribe domain adapters to watcher adapter events
    fileChangeWatcherAdapter.onFilesChanged((changes) =>
      fileChangeDomainAdapter.handleEvent({ changes })
    );
    workflowWatcherAdapter.onStructureChanged((event) => workflowDomainAdapter.handleEvent(event));
    workflowWatcherAdapter.onStatusChanged((event) => workflowDomainAdapter.handleEvent(event));
    unitCatalogWatcherAdapter.onUnitChanged((event) => unitCatalogDomainAdapter.handleEvent(event));

    // 5. Start watching
    await watcher.start();
    console.info('[central-notifications] Started successfully');
  } catch (error) {
    // Per DYK Insight #2: Reset flag on failure so subsequent calls can retry
    globalThis.__centralNotificationsStarted = false;
    console.error('[central-notifications] Failed to start:', error);
  }
}
