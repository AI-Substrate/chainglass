/**
 * Plan 027: Central Domain Event Notification System
 *
 * Fake implementation of ICentralEventNotifier for testing.
 *
 * Uses injectable `now()` function and `advanceTime(ms)` for deterministic
 * time control in contract tests. No real timers — only Date.now() comparison.
 *
 * Per Deviation Ledger: No setTimeout in production or test.
 */

import type { DomainEvent, ICentralEventNotifier } from './central-event-notifier.interface.js';
import { extractSuppressionKey } from './extract-suppression-key.js';
import type { WorkspaceDomainType } from './workspace-domain.js';

/**
 * Fake implementation of ICentralEventNotifier for testing.
 *
 * Exposes:
 * - `emittedEvents: DomainEvent[]` for assertion
 * - `advanceTime(ms)` for deterministic time control in contract tests
 *
 * Per DYK-01: `emit()` internally checks `isSuppressed()` before recording.
 * Per DYK-02: `advanceTime()` is exposed for the contract test time control protocol.
 */
export class FakeCentralEventNotifier implements ICentralEventNotifier {
  /** Recorded domain events for test inspection */
  public readonly emittedEvents: DomainEvent[] = [];

  /**
   * Suppression map: `"domain:key"` → expiry timestamp (from internal clock).
   * Uses `Date.now()` comparison — no setTimeout.
   */
  private readonly suppressions = new Map<string, number>();

  /** Internal clock offset in milliseconds */
  private clockOffset = 0;

  /** Get the current time (Date.now() + offset for deterministic testing) */
  private now(): number {
    return Date.now() + this.clockOffset;
  }

  emit(domain: WorkspaceDomainType, eventType: string, data: Record<string, unknown>): void {
    // Per DYK-01: emit() owns suppression enforcement
    // Extract key from data for suppression check
    // The key is domain-specific — for workgraphs it's graphSlug, for agents it's agentId
    // We check suppression for each data value that might be a key
    const key = extractSuppressionKey(data);
    if (key !== undefined && this.isSuppressed(domain, key)) {
      return; // Silently dropped per DYK-01
    }

    this.emittedEvents.push({ domain, eventType, data });
  }

  suppressDomain(domain: WorkspaceDomainType, key: string, durationMs: number): void {
    const compositeKey = `${domain}:${key}`;
    const expiry = this.now() + durationMs;
    this.suppressions.set(compositeKey, expiry);
  }

  isSuppressed(domain: WorkspaceDomainType, key: string): boolean {
    const compositeKey = `${domain}:${key}`;
    const expiry = this.suppressions.get(compositeKey);
    if (expiry === undefined) {
      return false;
    }
    if (this.now() >= expiry) {
      // Lazy cleanup — remove expired entry
      this.suppressions.delete(compositeKey);
      return false;
    }
    return true;
  }

  /**
   * Advance the internal clock by `ms` milliseconds.
   * Used in contract tests for deterministic expiry testing.
   */
  advanceTime(ms: number): void {
    this.clockOffset += ms;
  }

  // Key extraction delegated to shared extractSuppressionKey() per DYK Insight #1
}
