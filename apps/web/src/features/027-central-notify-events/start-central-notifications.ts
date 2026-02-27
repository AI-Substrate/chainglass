/**
 * Plan 027: Central Domain Event Notification System
 *
 * Bootstrap helper for the central notification system.
 *
 * Resolves services from DI, creates the workgraph domain event adapter,
 * registers it with the filesystem watcher, and starts watching.
 *
 * Per Discovery 02: globalThis gating prevents double-start across HMR.
 * Per DYK Insight #2: Flag resets on failure for retry capability.
 * Per PL-14: Uses getContainer() for lazy DI resolution.
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared/di-tokens';
import type { ICentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/central-event-notifier.interface';
import type { ICentralWatcherService } from '@chainglass/workflow';
import {
  FileChangeWatcherAdapter,
  WorkGraphWatcherAdapter,
  WorkflowWatcherAdapter,
} from '@chainglass/workflow';
import { getContainer } from '../../lib/bootstrap-singleton';
import { FileChangeDomainEventAdapter } from './file-change-domain-event-adapter';
import { WorkflowDomainEventAdapter } from './workflow-domain-event-adapter';
import { WorkgraphDomainEventAdapter } from './workgraph-domain-event-adapter';

declare global {
  var __centralNotificationsStarted: boolean | undefined;
}

/**
 * Start the central notification system.
 *
 * Idempotent: safe to call multiple times (only executes once).
 * Uses globalThis flag to survive Next.js HMR reloads.
 *
 * Resolves CentralWatcherService and CentralEventNotifier from DI,
 * creates the WorkgraphDomainEventAdapter, registers the watcher adapter,
 * subscribes the domain adapter to watcher events, and starts watching.
 */
export async function startCentralNotificationSystem(): Promise<void> {
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
    const workgraphDomainAdapter = new WorkgraphDomainEventAdapter(notifier);
    const fileChangeDomainAdapter = new FileChangeDomainEventAdapter(notifier);
    const workflowDomainAdapter = new WorkflowDomainEventAdapter(notifier);

    // 3. Create and register watcher adapters
    const workgraphWatcherAdapter = new WorkGraphWatcherAdapter();
    watcher.registerAdapter(workgraphWatcherAdapter);

    const fileChangeWatcherAdapter = new FileChangeWatcherAdapter(300);
    watcher.registerAdapter(fileChangeWatcherAdapter);

    const workflowWatcherAdapter = new WorkflowWatcherAdapter();
    watcher.registerAdapter(workflowWatcherAdapter);

    // 4. Subscribe domain adapters to watcher adapter events
    workgraphWatcherAdapter.onGraphChanged((event) => workgraphDomainAdapter.handleEvent(event));
    fileChangeWatcherAdapter.onFilesChanged((changes) =>
      fileChangeDomainAdapter.handleEvent({ changes })
    );
    workflowWatcherAdapter.onStructureChanged((event) => workflowDomainAdapter.handleEvent(event));
    workflowWatcherAdapter.onStatusChanged((event) => workflowDomainAdapter.handleEvent(event));

    // 5. Start watching
    await watcher.start();
    console.info('[central-notifications] Started successfully');
  } catch (error) {
    // Per DYK Insight #2: Reset flag on failure so subsequent calls can retry
    globalThis.__centralNotificationsStarted = false;
    console.error('[central-notifications] Failed to start:', error);
  }
}
