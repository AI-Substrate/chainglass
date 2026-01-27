// test/setup.ts (minimal - NO @chainglass/* imports yet)
import 'reflect-metadata';
import * as React from 'react';
import '@testing-library/jest-dom/vitest';
import { container } from 'tsyringe';

// Make React available globally for JSX in tests (required for Vitest + jsdom)
globalThis.React = React;

// NOTE: Do NOT import from @chainglass/shared here - it doesn't exist until Phase 2
// Shared package imports will be added in Phase 2 after the package is created

// Mock EventSource for tests (SSE is not available in jsdom)
// Added in Phase 5 for useServerSession hook tests
class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  readyState = MockEventSource.OPEN;
  url: string;
  withCredentials = false;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  private listeners: Map<string, Set<EventListener>> = new Map();

  constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
    this.url = url.toString();
    // Simulate open event
    setTimeout(() => {
      const openEvent = new Event('open');
      this.dispatchEvent(openEvent);
    }, 0);
  }

  addEventListener(type: string, listener: EventListener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)?.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        listener(event);
      }
    }
    return true;
  }

  close(): void {
    this.readyState = MockEventSource.CLOSED;
    this.listeners.clear();
  }
}

globalThis.EventSource = MockEventSource as unknown as typeof EventSource;

beforeEach(() => {
  container.clearInstances();
});
