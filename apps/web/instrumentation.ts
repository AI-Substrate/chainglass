/**
 * Plan 027: Central Domain Event Notification System
 *
 * Next.js instrumentation hook — called once at server startup.
 * Starts the central notification system (filesystem watcher → SSE events).
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  const { startCentralNotificationSystem } = await import(
    './src/features/027-central-notify-events/start-central-notifications'
  );
  await startCentralNotificationSystem();
}
