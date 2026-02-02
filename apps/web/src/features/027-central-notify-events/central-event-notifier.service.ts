/**
 * Plan 027: Central Domain Event Notification System
 *
 * Real implementation of ICentralEventNotifier that wraps ISSEBroadcaster
 * with domain-aware routing and time-based suppression.
 *
 * Follows AgentNotifierService structural pattern (Plan 019).
 *
 * Per ADR-0007: Domain value IS the SSE channel name.
 * Per DYK-01: emit() owns suppression enforcement internally.
 * Per DYK Insight #1: Uses shared extractSuppressionKey() to match fake.
 * Per DYK Insight #2: Registered as useValue singleton in DI (stateful suppression map).
 *
 * Note: SSEManager validates eventType against /^[a-zA-Z0-9_-]+$/ at runtime.
 * All current event types are valid. See DYK Insight #4.
 */

import type { ISSEBroadcaster } from '@chainglass/shared/features/019-agent-manager-refactor/sse-broadcaster.interface';
import type { ICentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/central-event-notifier.interface';
import { extractSuppressionKey } from '@chainglass/shared/features/027-central-notify-events/extract-suppression-key';
import type { WorkspaceDomainType } from '@chainglass/shared/features/027-central-notify-events/workspace-domain';

export class CentralEventNotifierService implements ICentralEventNotifier {
  /**
   * Suppression map: `"domain:key"` → expiry timestamp (Date.now()-based).
   * No setTimeout — only Date.now() comparison with lazy cleanup.
   */
  private readonly suppressions = new Map<string, number>();

  constructor(private readonly broadcaster: ISSEBroadcaster) {}

  emit(domain: WorkspaceDomainType, eventType: string, data: Record<string, unknown>): void {
    // Per DYK-01: emit() owns suppression enforcement
    const key = extractSuppressionKey(data);
    if (key !== undefined && this.isSuppressed(domain, key)) {
      return; // Silently dropped per DYK-01
    }

    // Per ADR-0007: Domain value IS the SSE channel name
    this.broadcaster.broadcast(domain, eventType, data);
  }

  suppressDomain(domain: WorkspaceDomainType, key: string, durationMs: number): void {
    const compositeKey = `${domain}:${key}`;
    const expiry = Date.now() + durationMs;
    this.suppressions.set(compositeKey, expiry);
  }

  isSuppressed(domain: WorkspaceDomainType, key: string): boolean {
    const compositeKey = `${domain}:${key}`;
    const expiry = this.suppressions.get(compositeKey);
    if (expiry === undefined) {
      return false;
    }
    if (Date.now() >= expiry) {
      // Lazy cleanup — remove expired entry
      this.suppressions.delete(compositeKey);
      return false;
    }
    return true;
  }
}
