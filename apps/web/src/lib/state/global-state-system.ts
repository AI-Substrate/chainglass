/**
 * Plan 053: GlobalStateSystem — Real Implementation
 *
 * Centralized ephemeral runtime state registry. Domains publish runtime values
 * to colon-delimited state paths; consumers subscribe by path or pattern.
 *
 * Key invariants:
 * - PL-01: Store-first — Map updated BEFORE subscribers notified
 * - PL-07: Error isolation — try/catch per subscriber callback
 * - AC-03: Stable get() references — no defensive copies
 * - AC-26: Stable list() arrays — version-counter caching
 */

import type { IStateService } from '@chainglass/shared/state';
import type {
  StateChange,
  StateChangeCallback,
  StateDomainDescriptor,
  StateEntry,
  StateMatcher,
} from '@chainglass/shared/state';
import { createStateMatcher, parsePath } from '@chainglass/shared/state';

interface Subscription {
  pattern: string;
  matcher: StateMatcher;
  callback: StateChangeCallback;
}

interface ListCacheEntry {
  version: number;
  result: StateEntry[];
}

export class GlobalStateSystem implements IStateService {
  private readonly store = new Map<string, StateEntry>();
  private readonly domains = new Map<string, StateDomainDescriptor>();
  private readonly subscriptions = new Map<number, Subscription>();
  private readonly listCache = new Map<string, ListCacheEntry>();
  private nextSubId = 0;
  private storeVersion = 0;

  // ── Domain Registration ──

  registerDomain(descriptor: StateDomainDescriptor): void {
    if (this.domains.has(descriptor.domain)) {
      throw new Error(`Domain "${descriptor.domain}" is already registered`);
    }
    this.domains.set(descriptor.domain, descriptor);
  }

  listDomains(): StateDomainDescriptor[] {
    return [...this.domains.values()];
  }

  // ── Publishing ──

  publish<T>(path: string, value: T): void {
    const parsed = parsePath(path);
    this.validateDomain(parsed.domain, parsed.instanceId);

    const now = Date.now();
    const existing = this.store.get(path);
    const previousValue = existing?.value;

    // PL-01: Store-first — update Map before notifying
    const entry: StateEntry = { path, value, updatedAt: now };
    this.store.set(path, entry);
    this.storeVersion++;
    this.invalidateMatchingCaches(path);

    const change: StateChange = {
      path,
      domain: parsed.domain,
      instanceId: parsed.instanceId,
      property: parsed.property,
      value,
      previousValue,
      timestamp: now,
    };

    this.dispatch(change);
  }

  // ── Reading ──

  get<T>(path: string): T | undefined {
    const entry = this.store.get(path);
    return entry?.value as T | undefined;
  }

  list(pattern: string): StateEntry[] {
    const cached = this.listCache.get(pattern);
    if (cached && cached.version === this.storeVersion) {
      return cached.result;
    }

    const matcher = createStateMatcher(pattern);
    const result: StateEntry[] = [];
    for (const [path, entry] of this.store) {
      if (matcher(path)) {
        result.push(entry);
      }
    }

    this.listCache.set(pattern, { version: this.storeVersion, result });
    return result;
  }

  listInstances(domain: string): string[] {
    const ids = new Set<string>();
    for (const path of this.store.keys()) {
      const parsed = parsePath(path);
      if (parsed.domain === domain && parsed.instanceId !== null) {
        ids.add(parsed.instanceId);
      }
    }
    return [...ids];
  }

  // ── Removal ──

  remove(path: string): void {
    const entry = this.store.get(path);
    if (!entry) return;

    const parsed = parsePath(path);
    const previousValue = entry.value;

    this.store.delete(path);
    this.storeVersion++;
    this.invalidateMatchingCaches(path);

    const change: StateChange = {
      path,
      domain: parsed.domain,
      instanceId: parsed.instanceId,
      property: parsed.property,
      value: undefined,
      previousValue,
      timestamp: Date.now(),
      removed: true,
    };

    this.dispatch(change);
  }

  removeInstance(domain: string, instanceId: string): void {
    const prefix = `${domain}:${instanceId}:`;
    const toRemove: string[] = [];
    for (const path of this.store.keys()) {
      if (path.startsWith(prefix)) {
        toRemove.push(path);
      }
    }
    for (const path of toRemove) {
      this.remove(path);
    }
  }

  // ── Subscriptions ──

  subscribe(pattern: string, callback: StateChangeCallback): () => void {
    const id = this.nextSubId++;
    const matcher = createStateMatcher(pattern);
    this.subscriptions.set(id, { pattern, matcher, callback });

    return () => {
      this.subscriptions.delete(id);
    };
  }

  // ── Diagnostics ──

  get subscriberCount(): number {
    return this.subscriptions.size;
  }

  get entryCount(): number {
    return this.store.size;
  }

  // ── Private ──

  private validateDomain(domain: string, instanceId: string | null): void {
    const descriptor = this.domains.get(domain);
    if (!descriptor) {
      throw new Error(`Domain "${domain}" is not registered. Call registerDomain() first.`);
    }
    if (descriptor.multiInstance && instanceId === null) {
      throw new Error(
        `Domain "${domain}" is multi-instance but path has no instance ID. Use domain:instanceId:property format.`
      );
    }
    if (!descriptor.multiInstance && instanceId !== null) {
      throw new Error(
        `Domain "${domain}" is a singleton but path has instance ID "${instanceId}". Use domain:property format.`
      );
    }
  }

  private invalidateMatchingCaches(changedPath: string): void {
    for (const [pattern] of this.listCache) {
      const matcher = createStateMatcher(pattern);
      if (matcher(changedPath)) {
        this.listCache.delete(pattern);
      }
    }
  }

  private dispatch(change: StateChange): void {
    for (const sub of this.subscriptions.values()) {
      if (sub.matcher(change.path)) {
        // PL-07: Error isolation — one subscriber error must not block others
        try {
          sub.callback(change);
        } catch (err) {
          console.warn(`[GlobalStateSystem] Subscriber error for pattern "${sub.pattern}":`, err);
        }
      }
    }
  }
}
