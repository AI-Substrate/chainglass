/**
 * Viewport definitions for responsive harness testing.
 *
 * Four standard viewports covering the primary breakpoints agents need to verify.
 * Used by playwright.config.ts to create per-viewport test projects.
 */

export interface HarnessViewport {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly description: string;
}

export const HARNESS_VIEWPORTS = {
  'desktop-lg': {
    name: 'desktop-lg',
    width: 1440,
    height: 900,
    description: 'Large desktop — primary development viewport',
  },
  'desktop-md': {
    name: 'desktop-md',
    width: 1280,
    height: 800,
    description: 'Medium desktop — common laptop resolution',
  },
  tablet: {
    name: 'tablet',
    width: 768,
    height: 1024,
    description: 'Tablet portrait — iPad breakpoint',
  },
  mobile: {
    name: 'mobile',
    width: 375,
    height: 812,
    description: 'Mobile portrait — iPhone breakpoint',
  },
} as const satisfies Record<string, HarnessViewport>;

export type ViewportName = keyof typeof HARNESS_VIEWPORTS;

export const DEFAULT_VIEWPORT: ViewportName = 'desktop-lg';
