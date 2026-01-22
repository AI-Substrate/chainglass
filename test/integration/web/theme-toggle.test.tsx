/**
 * @vitest-environment jsdom
 */
import { FakeLocalStorage } from '../../fakes/fake-local-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider, useTheme } from 'next-themes';
import type React from 'react';
/**
 * ThemeToggle Component Integration Tests
 *
 * Tests the ThemeToggle component behavior with ThemeProvider:
 * - Click toggles between light and dark themes
 * - Displays correct icon based on current theme
 *
 * These are integration tests that verify the component
 * works correctly within the ThemeProvider context.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeToggle } from '@/components/theme-toggle';

describe('ThemeToggle component', () => {
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

  // Wrapper that also shows current theme for debugging
  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );

  it('should toggle theme from light to dark when clicked', async () => {
    /*
    Test Doc:
    - Why: Core interaction must switch themes correctly
    - Contract: Clicking toggle calls setTheme() with opposite value
    - Usage Notes: Start with defaultTheme="light"; click should change to dark
    - Quality Contribution: End-to-end validation of toggle behavior
    - Worked Example: Light theme → click → dark theme
    */
    fakeLocalStorage.setItem('theme', 'light');

    render(<ThemeToggle />, { wrapper: TestWrapper });

    const button = screen.getByRole('button', { name: /toggle theme/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(fakeLocalStorage.getItem('theme')).toBe('dark');
    });
  });

  it('should toggle theme from dark to light when clicked', async () => {
    /*
    Test Doc:
    - Why: Toggle must work in both directions
    - Contract: Clicking toggle when dark switches to light
    - Usage Notes: Pre-populate localStorage with 'dark'
    - Quality Contribution: Validates bidirectional toggle
    - Worked Example: Dark theme → click → light theme
    */
    fakeLocalStorage.setItem('theme', 'dark');

    render(<ThemeToggle />, { wrapper: TestWrapper });

    const button = screen.getByRole('button', { name: /toggle theme/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(fakeLocalStorage.getItem('theme')).toBe('light');
    });
  });

  it('should display moon icon in light mode', async () => {
    /*
    Test Doc:
    - Why: Visual feedback helps users understand what clicking will do
    - Contract: In light mode, show moon (indicating "switch to dark")
    - Usage Notes: Check for aria-label or test-id on icon
    - Quality Contribution: Ensures UI provides clear affordance
    - Worked Example: Light mode → moon icon visible
    */
    fakeLocalStorage.setItem('theme', 'light');

    render(<ThemeToggle />, { wrapper: TestWrapper });

    await waitFor(() => {
      // Look for the moon icon (visible in light mode)
      const moonIcon = document.querySelector('[data-testid="moon-icon"]');
      expect(moonIcon).toBeInTheDocument();
    });
  });

  it('should display sun icon in dark mode', async () => {
    /*
    Test Doc:
    - Why: Visual feedback in dark mode should show sun
    - Contract: In dark mode, show sun (indicating "switch to light")
    - Usage Notes: Check for data-testid on icon
    - Quality Contribution: Validates icon state matches theme
    - Worked Example: Dark mode → sun icon visible
    */
    fakeLocalStorage.setItem('theme', 'dark');

    render(<ThemeToggle />, { wrapper: TestWrapper });

    await waitFor(() => {
      // Look for the sun icon (visible in dark mode)
      const sunIcon = document.querySelector('[data-testid="sun-icon"]');
      expect(sunIcon).toBeInTheDocument();
    });
  });
});
