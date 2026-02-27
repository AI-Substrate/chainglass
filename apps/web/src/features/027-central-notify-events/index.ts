/**
 * Plan 027: Central Domain Event Notification System - Web Feature Barrel Export
 *
 * Re-exports the web-local service and bootstrap helper.
 * Phase 3 consumers will import from this barrel.
 */

// Service
export { CentralEventNotifierService } from './central-event-notifier.service.js';

// Bootstrap
export { startCentralNotificationSystem } from './start-central-notifications.js';
