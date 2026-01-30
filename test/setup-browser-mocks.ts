/**
 * Browser Mocks Setup
 *
 * FIX-007: Consolidated browser API mocks for jsdom environment.
 * Import this in vitest.config.ts setupFiles for consistent mocks across all tests.
 */

import { vi } from 'vitest';

// Only apply browser mocks in jsdom environment
if (typeof window !== 'undefined') {
  // localStorage mock (FakeLocalStorage for consistency)
  const localStorageData: Map<string, string> = new Map();
  const localStorageMock: Storage = {
    get length() {
      return localStorageData.size;
    },
    getItem(key: string) {
      return localStorageData.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      localStorageData.set(key, value);
    },
    removeItem(key: string) {
      localStorageData.delete(key);
    },
    clear() {
      localStorageData.clear();
    },
    key(index: number) {
      const keys = Array.from(localStorageData.keys());
      return keys[index] ?? null;
    },
  };
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
  });
  // ResizeObserver mock (required by ReactFlow, dnd-kit, etc.)
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  // Element.scrollIntoView mock (not implemented in jsdom)
  Element.prototype.scrollIntoView = vi.fn();

  // matchMedia mock (required for responsive design, theme detection, etc.)
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Silence console.warn for specific known warnings in tests
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    // Filter out known harmless warnings
    const message = args[0];
    if (typeof message === 'string') {
      // d3-drag warnings in jsdom
      if (message.includes('Cannot read properties of null')) return;
      // SSE validation warnings during testing
      if (message.includes('Invalid sseChannel format')) return;
      if (message.includes('Invalid SSE message')) return;
    }
    originalWarn.apply(console, args);
  };
}
