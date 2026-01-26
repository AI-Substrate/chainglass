'use client';

import { useSyncExternalStore } from 'react';

/**
 * Device type for three-tier responsive system.
 * - 'phone': viewport < 768px
 * - 'tablet': 768px <= viewport < 1024px
 * - 'desktop': viewport >= 1024px
 * - undefined: SSR/unknown context
 */
export type DeviceType = 'phone' | 'tablet' | 'desktop' | undefined;

/**
 * State returned by useResponsive hook.
 */
export interface ResponsiveState {
  /** True if viewport < 768px (phone-sized device) */
  isPhone: boolean;
  /** True if 768px <= viewport < 1024px (tablet-sized device) */
  isTablet: boolean;
  /** True if viewport >= 1024px (desktop-sized device) */
  isDesktop: boolean;
  /**
   * True ONLY for phones - tablets use desktop patterns.
   * Use this to determine which navigation paradigm to use.
   */
  useMobilePatterns: boolean;
  /** String device type or undefined during SSR */
  deviceType: DeviceType;
}

/**
 * Breakpoint for phone/tablet boundary.
 * Matches existing MOBILE_BREAKPOINT in use-mobile.ts for consistency.
 */
export const PHONE_BREAKPOINT = 768;

/**
 * Breakpoint for tablet/desktop boundary.
 */
export const TABLET_BREAKPOINT = 1024;

/**
 * Cached snapshot to avoid creating new objects on every call.
 * useSyncExternalStore requires referential equality for unchanged snapshots.
 */
let cachedSnapshot: ResponsiveState | null = null;
let cachedDeviceType: DeviceType = undefined;

/**
 * Computes device type from width.
 */
function computeDeviceType(width: number): DeviceType {
  if (width < PHONE_BREAKPOINT) return 'phone';
  if (width < TABLET_BREAKPOINT) return 'tablet';
  return 'desktop';
}

/**
 * Gets current viewport state. Pure function for getSnapshot.
 * Called by useSyncExternalStore to read current state.
 * Returns cached snapshot if device type hasn't changed.
 */
function getResponsiveSnapshot(): ResponsiveState {
  if (typeof window === 'undefined') {
    return getServerResponsiveSnapshot();
  }

  const width = window.innerWidth;
  const newDeviceType = computeDeviceType(width);

  // Return cached snapshot if device type hasn't changed
  if (cachedSnapshot !== null && cachedDeviceType === newDeviceType) {
    return cachedSnapshot;
  }

  // Compute new snapshot
  const isPhone = newDeviceType === 'phone';
  const isTablet = newDeviceType === 'tablet';
  const isDesktop = newDeviceType === 'desktop';

  cachedSnapshot = {
    isPhone,
    isTablet,
    isDesktop,
    useMobilePatterns: isPhone, // Only phones get mobile patterns
    deviceType: newDeviceType,
  };
  cachedDeviceType = newDeviceType;

  return cachedSnapshot;
}

/**
 * Server-side snapshot for hydration safety.
 * Called during SSR and hydration to ensure matching output.
 * Defaults to desktop-like experience with deviceType undefined
 * to indicate the server doesn't know the actual device.
 */
const serverSnapshot: ResponsiveState = {
  isPhone: false,
  isTablet: false,
  isDesktop: true, // Default to desktop experience
  useMobilePatterns: false,
  deviceType: undefined, // Marks as server/unknown context
};

function getServerResponsiveSnapshot(): ResponsiveState {
  return serverSnapshot;
}

/**
 * Subscribes to viewport changes via matchMedia.
 * Returns cleanup function that removes listeners.
 *
 * matchMedia fires only on boundary transitions (not continuously),
 * so no debouncing is needed.
 */
function subscribeToResponsiveChanges(callback: () => void): () => void {
  // Create media queries for boundary transitions
  const phoneQuery = window.matchMedia(`(max-width: ${PHONE_BREAKPOINT - 1}px)`);
  const tabletQuery = window.matchMedia(
    `(min-width: ${PHONE_BREAKPOINT}px) and (max-width: ${TABLET_BREAKPOINT - 1}px)`
  );

  // Single handler for all transitions
  const handleChange = () => callback();

  // Subscribe to both queries
  phoneQuery.addEventListener('change', handleChange);
  tabletQuery.addEventListener('change', handleChange);

  // Cleanup function
  return () => {
    phoneQuery.removeEventListener('change', handleChange);
    tabletQuery.removeEventListener('change', handleChange);
  };
}

/**
 * Hook for three-tier responsive device detection.
 *
 * Uses useSyncExternalStore for:
 * - SSR hydration safety (explicit getServerSnapshot)
 * - Concurrent rendering consistency (no tearing)
 * - Efficient subscription management
 *
 * Breakpoints:
 * - phone: < 768px (useMobilePatterns: true)
 * - tablet: 768px - 1023px (useMobilePatterns: false)
 * - desktop: >= 1024px (useMobilePatterns: false)
 *
 * @example
 * const { deviceType, isPhone, useMobilePatterns } = useResponsive();
 *
 * if (useMobilePatterns) {
 *   return <BottomTabBar />;
 * }
 * return <Sidebar />;
 */
export function useResponsive(): ResponsiveState {
  return useSyncExternalStore(
    subscribeToResponsiveChanges,
    getResponsiveSnapshot,
    getServerResponsiveSnapshot
  );
}
