/**
 * @vitest-environment jsdom
 */
import { FakeLocalStorage } from '../../../fakes/fake-local-storage';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ThemeProvider, useTheme } from 'next-themes';
import type React from 'react';
/**
 * useTheme Hook Tests
 *
 * Tests the integration with next-themes useTheme hook behavior:
 * - System preference default
 * - Theme persistence to localStorage
 * - Theme retrieval from localStorage
 *
 * These tests verify our integration with next-themes, not the library itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('useTheme hook (next-themes integration)', () => {
  let fakeLocalStorage: FakeLocalStorage;
  let originalLocalStorage: Storage;
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    // Replace localStorage with fake
    fakeLocalStorage = new FakeLocalStorage();
    originalLocalStorage = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      value: fakeLocalStorage,
      writable: true,
    });

    // Mock matchMedia for system preference detection
    originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false, // Always return light mode preference for tests
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
    });
    window.matchMedia = originalMatchMedia;
  });

  // Wrapper for tests that need ThemeProvider
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );

  it('should default to system theme when localStorage is empty', async () => {
    /*
    Test Doc:
    - Why: Users expect theme to match OS preference on first visit
    - Contract: useTheme().theme returns 'system' when no stored preference
    - Usage Notes: Uses ThemeProvider wrapper; check 'theme' not 'resolvedTheme'
    - Quality Contribution: Ensures first-time user experience respects OS settings
    - Worked Example: Empty localStorage → theme === 'system'
    */
    const { result } = renderHook(() => useTheme(), { wrapper });

    await waitFor(() => {
      expect(result.current.theme).toBe('system');
    });
  });

  it('should persist theme to localStorage when setTheme is called', async () => {
    /*
    Test Doc:
    - Why: Theme preference must survive page refresh
    - Contract: setTheme(value) writes to localStorage under 'theme' key
    - Usage Notes: Use act() wrapper for state updates; verify fakeLocalStorage
    - Quality Contribution: Catches persistence bugs before UI integration
    - Worked Example: setTheme('dark') → localStorage.getItem('theme') === 'dark'
    */
    const { result } = renderHook(() => useTheme(), { wrapper });

    await act(async () => {
      result.current.setTheme('dark');
    });

    await waitFor(() => {
      expect(fakeLocalStorage.getItem('theme')).toBe('dark');
    });
  });

  it('should read theme from localStorage on mount', async () => {
    /*
    Test Doc:
    - Why: Stored preference should override system default
    - Contract: useTheme() reads from localStorage on mount
    - Usage Notes: Pre-populate fakeLocalStorage before rendering
    - Quality Contribution: Validates localStorage read logic
    - Worked Example: localStorage has 'light' → theme === 'light'
    */
    fakeLocalStorage.setItem('theme', 'light');

    const { result } = renderHook(() => useTheme(), { wrapper });

    await waitFor(() => {
      expect(result.current.theme).toBe('light');
    });
  });

  it('should toggle between light and dark themes', async () => {
    /*
    Test Doc:
    - Why: Core toggle interaction must work correctly
    - Contract: setTheme toggles between 'light' and 'dark' values
    - Usage Notes: Multiple act() calls for sequential toggles
    - Quality Contribution: End-to-end validation of toggle behavior
    - Worked Example: dark → setTheme('light') → theme === 'light'
    */
    fakeLocalStorage.setItem('theme', 'dark');

    const { result } = renderHook(() => useTheme(), { wrapper });

    await waitFor(() => {
      expect(result.current.theme).toBe('dark');
    });

    await act(async () => {
      result.current.setTheme('light');
    });

    await waitFor(() => {
      expect(result.current.theme).toBe('light');
    });

    await act(async () => {
      result.current.setTheme('dark');
    });

    await waitFor(() => {
      expect(result.current.theme).toBe('dark');
    });
  });
});
