/**
 * Plan 027: Central Domain Event Notification System
 *
 * Bootstrap helper for the central notification system.
 *
 * Per DYK Insight #3: Phase 2 delivers a minimal skeleton. The function body
 * is just the globalThis guard + flag set. Phase 3 fills in DI resolution,
 * adapter creation, and watcher activation.
 *
 * Per Discovery 02: globalThis gating prevents double-start across HMR.
 */

declare global {
  // biome-ignore lint: globalThis augmentation for HMR guard
  var __centralNotificationsStarted: boolean | undefined;
}

/**
 * Start the central notification system.
 *
 * Idempotent: safe to call multiple times (only executes once).
 * Uses globalThis flag to survive Next.js HMR reloads.
 *
 * Phase 2: Minimal skeleton — guard + flag only.
 * Phase 3: Will add DI resolution, adapter creation, watcher.start().
 */
export async function startCentralNotificationSystem(): Promise<void> {
  if (globalThis.__centralNotificationsStarted) {
    return;
  }
  globalThis.__centralNotificationsStarted = true;

  // Phase 3 will fill in:
  // 1. Resolve CentralWatcherService and CentralEventNotifier from DI via getContainer()
  // 2. Create WorkgraphDomainEventAdapter(notifier)
  // 3. Register adapter with watcher
  // 4. Call watcher.start()
}
