/**
 * Plan 027: Central Domain Event Notification System
 *
 * Real implementation of ICentralEventNotifier that wraps ISSEBroadcaster
 * with domain-aware routing.
 *
 * Follows AgentNotifierService structural pattern (Plan 019).
 *
 * Per ADR-0007: Domain value IS the SSE channel name.
 * emit() is a direct passthrough to broadcaster.broadcast().
 *
 * Note: SSEManager validates eventType against /^[a-zA-Z0-9_-]+$/ at runtime.
 * All current event types are valid. See DYK Insight #4.
 */

import type { ISSEBroadcaster } from '@chainglass/shared/features/019-agent-manager-refactor/sse-broadcaster.interface';
import type { ICentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/central-event-notifier.interface';
import type { WorkspaceDomainType } from '@chainglass/shared/features/027-central-notify-events/workspace-domain';

export class CentralEventNotifierService implements ICentralEventNotifier {
  constructor(private readonly broadcaster: ISSEBroadcaster) {}

  emit(domain: WorkspaceDomainType, eventType: string, data: Record<string, unknown>): void {
    // Per ADR-0007: Domain value IS the SSE channel name
    this.broadcaster.broadcast(domain, eventType, data);
  }
}
