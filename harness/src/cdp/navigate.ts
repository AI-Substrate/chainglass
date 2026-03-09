/**
 * Shared navigation helper for harness CLI commands.
 *
 * Centralizes page.goto() with configurable waitUntil and timeout.
 * Default: domcontentloaded (works on SSE-enabled pages).
 *
 * Plan 070 FX003: All CLI commands that navigate pages use this helper.
 */

import type { Page } from '@playwright/test';

export const WAIT_UNTIL_VALUES = ['commit', 'domcontentloaded', 'load', 'networkidle'] as const;
export type WaitUntilValue = (typeof WAIT_UNTIL_VALUES)[number];

export const DEFAULT_WAIT_UNTIL: WaitUntilValue = 'domcontentloaded';
export const DEFAULT_TIMEOUT = 30_000;
export const DEFAULT_DELAY = 0;

export interface NavigateOptions {
  waitUntil?: WaitUntilValue;
  timeout?: number;
  /** Post-navigation delay in ms — gives React time to hydrate before screenshots */
  delay?: number;
}

/**
 * Navigate to a URL with configurable wait strategy.
 *
 * @param page — Playwright page instance
 * @param url — URL to navigate to
 * @param options — waitUntil strategy, timeout, and post-navigation delay
 */
export async function navigateTo(
  page: Page,
  url: string,
  options: NavigateOptions = {},
): Promise<void> {
  const waitUntil = options.waitUntil ?? DEFAULT_WAIT_UNTIL;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const delay = options.delay ?? DEFAULT_DELAY;
  await page.goto(url, { waitUntil, timeout });
  if (delay > 0) {
    await page.waitForTimeout(delay);
  }
}
