/**
 * useResponsive Tests - TDD RED Phase
 *
 * Tests for the three-tier responsive device detection hook.
 * Following TDD approach: write tests first, expect them to fail.
 *
 * Uses FakeMatchMedia for testing without browser dependencies.
 *
 * @vitest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FakeMatchMedia } from '../../../../test/fakes/fake-match-media';

import {
  useResponsive,
  PHONE_BREAKPOINT,
  TABLET_BREAKPOINT,
  type ResponsiveState,
  type DeviceType,
} from '../../../../apps/web/src/hooks/useResponsive';

describe('useResponsive', () => {
  let fakeMatchMedia: FakeMatchMedia;
  let originalMatchMedia: typeof window.matchMedia;
  let originalInnerWidth: number;

  beforeEach(() => {
    // Save original window properties
    originalMatchMedia = window.matchMedia;
    originalInnerWidth = window.innerWidth;

    // Create fake with desktop default
    fakeMatchMedia = new FakeMatchMedia(1920);

    // Inject fake into window
    (window as any).matchMedia = (query: string) =>
      fakeMatchMedia.matchMedia(query);

    // Mock innerWidth for snapshot functions
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920,
    });
  });

  afterEach(() => {
    // Restore original window properties
    window.matchMedia = originalMatchMedia;
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
    fakeMatchMedia.clearAllListeners();
  });

  describe('exported constants', () => {
    it('should export PHONE_BREAKPOINT as 768', () => {
      /*
      Test Doc:
      - Why: Breakpoint must match existing useIsMobile MOBILE_BREAKPOINT for consistency
      - Contract: PHONE_BREAKPOINT === 768
      - Usage Notes: This is the boundary between phone and tablet
      - Quality Contribution: Catches incorrect breakpoint values
      - Worked Example: PHONE_BREAKPOINT = 768
      */
      expect(PHONE_BREAKPOINT).toBe(768);
    });

    it('should export TABLET_BREAKPOINT as 1024', () => {
      /*
      Test Doc:
      - Why: Tablet/desktop boundary at 1024px is industry standard
      - Contract: TABLET_BREAKPOINT === 1024
      - Usage Notes: This is the boundary between tablet and desktop
      - Quality Contribution: Catches incorrect breakpoint values
      - Worked Example: TABLET_BREAKPOINT = 1024
      */
      expect(TABLET_BREAKPOINT).toBe(1024);
    });
  });

  describe('phone viewport detection (AC-35, AC-37)', () => {
    it('should detect phone viewport at 375px', () => {
      /*
      Test Doc:
      - Why: Need to identify phone-sized devices correctly
      - Contract: Viewport < 768px → isPhone: true, useMobilePatterns: true
      - Usage Notes: useMobilePatterns is true ONLY for phones
      - Quality Contribution: Catches breakpoint calculation errors
      - Worked Example: 375px width → isPhone: true, deviceType: 'phone'
      */
      Object.defineProperty(window, 'innerWidth', { value: 375 });
      fakeMatchMedia.setViewportWidth(375);

      const { result } = renderHook(() => useResponsive());

      expect(result.current.isPhone).toBe(true);
      expect(result.current.isTablet).toBe(false);
      expect(result.current.isDesktop).toBe(false);
      expect(result.current.useMobilePatterns).toBe(true);
      expect(result.current.deviceType).toBe('phone');
    });

    it('should detect phone viewport at 767px (boundary)', () => {
      /*
      Test Doc:
      - Why: Boundary conditions are critical for responsive design
      - Contract: 767px (one pixel below PHONE_BREAKPOINT) is still phone
      - Usage Notes: PHONE_BREAKPOINT is exclusive for phone detection
      - Quality Contribution: Catches off-by-one errors
      - Worked Example: 767px → isPhone: true
      */
      Object.defineProperty(window, 'innerWidth', { value: 767 });
      fakeMatchMedia.setViewportWidth(767);

      const { result } = renderHook(() => useResponsive());

      expect(result.current.isPhone).toBe(true);
      expect(result.current.deviceType).toBe('phone');
    });
  });

  describe('tablet viewport detection (AC-35, AC-37)', () => {
    it('should detect tablet viewport at 768px (boundary)', () => {
      /*
      Test Doc:
      - Why: Tablet detection starts at exactly 768px
      - Contract: 768px → isTablet: true, useMobilePatterns: false
      - Usage Notes: Tablets use desktop patterns, not mobile patterns
      - Quality Contribution: Catches tablet classification errors
      - Worked Example: 768px → isTablet: true, useMobilePatterns: false
      */
      Object.defineProperty(window, 'innerWidth', { value: 768 });
      fakeMatchMedia.setViewportWidth(768);

      const { result } = renderHook(() => useResponsive());

      expect(result.current.isPhone).toBe(false);
      expect(result.current.isTablet).toBe(true);
      expect(result.current.isDesktop).toBe(false);
      expect(result.current.useMobilePatterns).toBe(false); // Critical: tablets use desktop patterns
      expect(result.current.deviceType).toBe('tablet');
    });

    it('should detect tablet viewport at 900px (mid-range)', () => {
      /*
      Test Doc:
      - Why: Mid-range tablet viewport should be correctly identified
      - Contract: 768-1023px range is tablet territory
      - Usage Notes: All tablets get useMobilePatterns: false
      - Quality Contribution: Catches mid-range classification bugs
      - Worked Example: 900px → isTablet: true
      */
      Object.defineProperty(window, 'innerWidth', { value: 900 });
      fakeMatchMedia.setViewportWidth(900);

      const { result } = renderHook(() => useResponsive());

      expect(result.current.isTablet).toBe(true);
      expect(result.current.useMobilePatterns).toBe(false);
      expect(result.current.deviceType).toBe('tablet');
    });

    it('should detect tablet viewport at 1023px (upper boundary)', () => {
      /*
      Test Doc:
      - Why: Upper tablet boundary is critical for desktop transition
      - Contract: 1023px (one pixel below TABLET_BREAKPOINT) is still tablet
      - Usage Notes: TABLET_BREAKPOINT is exclusive for tablet detection
      - Quality Contribution: Catches off-by-one errors at upper boundary
      - Worked Example: 1023px → isTablet: true
      */
      Object.defineProperty(window, 'innerWidth', { value: 1023 });
      fakeMatchMedia.setViewportWidth(1023);

      const { result } = renderHook(() => useResponsive());

      expect(result.current.isTablet).toBe(true);
      expect(result.current.isDesktop).toBe(false);
      expect(result.current.deviceType).toBe('tablet');
    });
  });

  describe('desktop viewport detection (AC-35)', () => {
    it('should detect desktop viewport at 1024px (boundary)', () => {
      /*
      Test Doc:
      - Why: Desktop detection starts at exactly 1024px
      - Contract: 1024px → isDesktop: true
      - Usage Notes: Desktop is the default experience for tablets and up
      - Quality Contribution: Catches desktop boundary errors
      - Worked Example: 1024px → isDesktop: true, deviceType: 'desktop'
      */
      Object.defineProperty(window, 'innerWidth', { value: 1024 });
      fakeMatchMedia.setViewportWidth(1024);

      const { result } = renderHook(() => useResponsive());

      expect(result.current.isPhone).toBe(false);
      expect(result.current.isTablet).toBe(false);
      expect(result.current.isDesktop).toBe(true);
      expect(result.current.useMobilePatterns).toBe(false);
      expect(result.current.deviceType).toBe('desktop');
    });

    it('should detect desktop viewport at 1920px (wide screen)', () => {
      /*
      Test Doc:
      - Why: Wide screens should be clearly desktop
      - Contract: Large viewports are desktop
      - Usage Notes: No upper limit for desktop
      - Quality Contribution: Catches wide screen classification errors
      - Worked Example: 1920px → isDesktop: true
      */
      Object.defineProperty(window, 'innerWidth', { value: 1920 });
      fakeMatchMedia.setViewportWidth(1920);

      const { result } = renderHook(() => useResponsive());

      expect(result.current.isDesktop).toBe(true);
      expect(result.current.deviceType).toBe('desktop');
    });
  });

  describe('responsive state properties (AC-36)', () => {
    it('should return all required ResponsiveState properties', () => {
      /*
      Test Doc:
      - Why: Hook must return complete state object
      - Contract: useResponsive returns { isPhone, isTablet, isDesktop, useMobilePatterns, deviceType }
      - Usage Notes: All properties are always present (no undefined values except deviceType during SSR)
      - Quality Contribution: Catches missing properties in return type
      - Worked Example: All five properties are defined
      */
      const { result } = renderHook(() => useResponsive());

      expect(result.current).toHaveProperty('isPhone');
      expect(result.current).toHaveProperty('isTablet');
      expect(result.current).toHaveProperty('isDesktop');
      expect(result.current).toHaveProperty('useMobilePatterns');
      expect(result.current).toHaveProperty('deviceType');
    });

    it('should return boolean values for tier flags', () => {
      /*
      Test Doc:
      - Why: Type safety requires boolean values for tier flags
      - Contract: isPhone, isTablet, isDesktop, useMobilePatterns are all booleans
      - Usage Notes: TypeScript enforces this, but runtime check is valuable
      - Quality Contribution: Catches incorrect return types
      - Worked Example: typeof isPhone === 'boolean'
      */
      const { result } = renderHook(() => useResponsive());

      expect(typeof result.current.isPhone).toBe('boolean');
      expect(typeof result.current.isTablet).toBe('boolean');
      expect(typeof result.current.isDesktop).toBe('boolean');
      expect(typeof result.current.useMobilePatterns).toBe('boolean');
    });

    it('should have exactly one tier flag true at a time', () => {
      /*
      Test Doc:
      - Why: Device can only be in one tier at a time
      - Contract: Exactly one of isPhone, isTablet, isDesktop is true
      - Usage Notes: This is a logical constraint, not a type constraint
      - Quality Contribution: Catches logic errors in tier detection
      - Worked Example: Desktop viewport → only isDesktop is true
      */
      Object.defineProperty(window, 'innerWidth', { value: 900 });
      fakeMatchMedia.setViewportWidth(900);

      const { result } = renderHook(() => useResponsive());

      const tierCount = [
        result.current.isPhone,
        result.current.isTablet,
        result.current.isDesktop,
      ].filter(Boolean).length;

      expect(tierCount).toBe(1);
    });
  });

  describe('viewport resize handling (AC-39)', () => {
    it('should trigger re-render on viewport resize from desktop to phone', async () => {
      /*
      Test Doc:
      - Why: Dynamic viewport changes must update state
      - Contract: Resize triggers listener → state updates
      - Usage Notes: Uses FakeMatchMedia.setViewportWidth() to simulate
      - Quality Contribution: Catches missing resize listeners
      - Worked Example: 1920px → 375px → isPhone becomes true
      */
      Object.defineProperty(window, 'innerWidth', { value: 1920 });
      fakeMatchMedia.setViewportWidth(1920);

      const { result } = renderHook(() => useResponsive());

      expect(result.current.isDesktop).toBe(true);
      expect(result.current.isPhone).toBe(false);

      // Simulate resize to phone
      act(() => {
        Object.defineProperty(window, 'innerWidth', { value: 375 });
        fakeMatchMedia.setViewportWidth(375);
      });

      await waitFor(() => {
        expect(result.current.isPhone).toBe(true);
        expect(result.current.isDesktop).toBe(false);
        expect(result.current.deviceType).toBe('phone');
      });
    });

    it('should trigger re-render on viewport resize from phone to tablet', async () => {
      /*
      Test Doc:
      - Why: All breakpoint transitions should work
      - Contract: Crossing phone→tablet boundary updates state
      - Usage Notes: Tests upward transition
      - Quality Contribution: Catches one-way resize bugs
      - Worked Example: 375px → 800px → isTablet becomes true
      */
      Object.defineProperty(window, 'innerWidth', { value: 375 });
      fakeMatchMedia.setViewportWidth(375);

      const { result } = renderHook(() => useResponsive());

      expect(result.current.isPhone).toBe(true);

      act(() => {
        Object.defineProperty(window, 'innerWidth', { value: 800 });
        fakeMatchMedia.setViewportWidth(800);
      });

      await waitFor(() => {
        expect(result.current.isTablet).toBe(true);
        expect(result.current.isPhone).toBe(false);
      });
    });

    it('should trigger re-render on viewport resize from tablet to desktop', async () => {
      /*
      Test Doc:
      - Why: Tablet to desktop transition is common on orientation change
      - Contract: Crossing tablet→desktop boundary updates state
      - Usage Notes: Tests upward transition to desktop
      - Quality Contribution: Catches transition bugs
      - Worked Example: 900px → 1200px → isDesktop becomes true
      */
      Object.defineProperty(window, 'innerWidth', { value: 900 });
      fakeMatchMedia.setViewportWidth(900);

      const { result } = renderHook(() => useResponsive());

      expect(result.current.isTablet).toBe(true);

      act(() => {
        Object.defineProperty(window, 'innerWidth', { value: 1200 });
        fakeMatchMedia.setViewportWidth(1200);
      });

      await waitFor(() => {
        expect(result.current.isDesktop).toBe(true);
        expect(result.current.isTablet).toBe(false);
      });
    });
  });

  describe('SSR safety (AC-36b)', () => {
    it('should handle server-side rendering without errors', () => {
      /*
      Test Doc:
      - Why: SSR environments don't have window.matchMedia
      - Contract: Hook returns safe defaults during SSR
      - Usage Notes: getServerSnapshot provides SSR defaults
      - Quality Contribution: Catches SSR crashes
      - Worked Example: SSR → deviceType: undefined, all flags safe
      */
      // Note: In actual SSR, window would be undefined
      // This test verifies the hook doesn't crash and returns a valid state
      const { result } = renderHook(() => useResponsive());

      // The hook should return a valid ResponsiveState, never throw
      expect(result.current).toBeDefined();
      expect(typeof result.current.isPhone).toBe('boolean');
      expect(typeof result.current.isTablet).toBe('boolean');
      expect(typeof result.current.isDesktop).toBe('boolean');
    });
  });

  describe('useMobilePatterns behavior (AC-37)', () => {
    it('should return useMobilePatterns: true only for phones', () => {
      /*
      Test Doc:
      - Why: useMobilePatterns drives mobile-specific UI patterns (bottom nav, etc.)
      - Contract: useMobilePatterns is true ONLY when isPhone is true
      - Usage Notes: Tablets get useMobilePatterns: false (they use desktop patterns)
      - Quality Contribution: Critical for Phase 7 mobile navigation
      - Worked Example: phone → true, tablet → false, desktop → false
      */
      // Phone
      Object.defineProperty(window, 'innerWidth', { value: 375 });
      fakeMatchMedia.setViewportWidth(375);
      const { result: phoneResult } = renderHook(() => useResponsive());
      expect(phoneResult.current.useMobilePatterns).toBe(true);

      // Tablet
      Object.defineProperty(window, 'innerWidth', { value: 900 });
      fakeMatchMedia.setViewportWidth(900);
      const { result: tabletResult } = renderHook(() => useResponsive());
      expect(tabletResult.current.useMobilePatterns).toBe(false);

      // Desktop
      Object.defineProperty(window, 'innerWidth', { value: 1920 });
      fakeMatchMedia.setViewportWidth(1920);
      const { result: desktopResult } = renderHook(() => useResponsive());
      expect(desktopResult.current.useMobilePatterns).toBe(false);
    });
  });

  describe('listener cleanup', () => {
    it('should cleanup listeners on unmount', () => {
      /*
      Test Doc:
      - Why: Memory leaks occur if listeners aren't removed
      - Contract: Unmounting hook removes all matchMedia listeners
      - Usage Notes: Verify via FakeMatchMedia.getListenerCount()
      - Quality Contribution: Prevents memory leaks
      - Worked Example: unmount → listener count drops to 0
      */
      const { unmount } = renderHook(() => useResponsive());

      // Listeners should exist while mounted
      const phoneQuery = `(max-width: ${PHONE_BREAKPOINT - 1}px)`;
      const tabletQuery = `(min-width: ${PHONE_BREAKPOINT}px) and (max-width: ${TABLET_BREAKPOINT - 1}px)`;

      // After unmount, listeners should be removed
      unmount();

      expect(fakeMatchMedia.getListenerCount(phoneQuery)).toBe(0);
      expect(fakeMatchMedia.getListenerCount(tabletQuery)).toBe(0);
    });
  });

  describe('deviceType string values', () => {
    it('should return deviceType as "phone" for phone viewports', () => {
      Object.defineProperty(window, 'innerWidth', { value: 375 });
      fakeMatchMedia.setViewportWidth(375);
      const { result } = renderHook(() => useResponsive());
      expect(result.current.deviceType).toBe('phone');
    });

    it('should return deviceType as "tablet" for tablet viewports', () => {
      Object.defineProperty(window, 'innerWidth', { value: 900 });
      fakeMatchMedia.setViewportWidth(900);
      const { result } = renderHook(() => useResponsive());
      expect(result.current.deviceType).toBe('tablet');
    });

    it('should return deviceType as "desktop" for desktop viewports', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1920 });
      fakeMatchMedia.setViewportWidth(1920);
      const { result } = renderHook(() => useResponsive());
      expect(result.current.deviceType).toBe('desktop');
    });
  });
});
