/**
 * Plan 027: Central Domain Event Notification System
 *
 * Next.js instrumentation hook — called once at server startup.
 * Starts the central notification system (filesystem watcher → SSE events).
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // CentralWatcherService uses Node.js APIs (chokidar, fs) — skip on Edge runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[central-notifications] instrumentation.register() called');
    const { startCentralNotificationSystem } = await import(
      './src/features/027-central-notify-events/start-central-notifications'
    );
    await startCentralNotificationSystem();
  }
}
