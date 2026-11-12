'use client';

/**
 * Navigation-pending bar (Jordan, 2026-11-12: "right now it looks frozen"). A thin animated bar on
 * the bottom edge from the moment a client-side navigation starts until the new route renders.
 *
 * The App Router has no global navigation events, so the start is observed at its two sources:
 * - every in-app `<a>` click (Next `<Link>` renders one), from one document-level listener;
 * - programmatic `router.push`/`replace`, through {@link useProgressRouter} at those call sites.
 * The end is the URL the router renders: `usePathname()` + `useSearchParams()` changing.
 *
 * Shown only after {@link SHOW_DELAY_MS}, so navigations that finish sooner never flash it. A
 * navigation that never changes the URL (a click handler that cancels a `<Link>`, a failed
 * fetch) hides after {@link GIVE_UP_MS}.
 */

import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

export const SHOW_DELAY_MS = 150;
export const GIVE_UP_MS = 20_000;
const START_EVENT = 'navigation-progress:start';

/** `href` resolved against the current page, if it leaves this URL for another in-app one. */
function navigatesAway(href: string): boolean {
  const target = new URL(href, window.location.href);
  return (
    target.origin === window.location.origin &&
    (target.pathname !== window.location.pathname || target.search !== window.location.search)
  );
}

/** Announce a client-side navigation to `href`; a same-URL or off-site `href` is ignored. */
export function startNavigation(href: string): void {
  if (navigatesAway(href)) window.dispatchEvent(new Event(START_EVENT));
}

/** `useRouter()` whose `push` and `replace` show the navigation bar. */
export function useProgressRouter(): AppRouterInstance {
  const router = useRouter();
  return useMemo(
    () => ({
      ...router,
      push: (href, options) => {
        startNavigation(href);
        router.push(href, options);
      },
      replace: (href, options) => {
        startNavigation(href);
        router.replace(href, options);
      },
    }),
    [router]
  );
}

/** A plain left click on an in-app link that the browser would follow in this tab. */
function linkHref(event: MouseEvent): string | null {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return null;
  }
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute('download')) return null;
  if (anchor.target && anchor.target !== '_self') return null;
  return anchor.href;
}

export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  /** Increments per navigation start; 0 = none pending. */
  const [pending, setPending] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const start = () => setPending((n) => n + 1);
    const onClick = (event: MouseEvent) => {
      const href = linkHref(event);
      if (href) startNavigation(href);
    };
    window.addEventListener(START_EVENT, start);
    // Capture: a handler that stops propagation still navigates.
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener(START_EVENT, start);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  // The new route rendered.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname and search are the trigger.
  useEffect(() => {
    setPending(0);
    setVisible(false);
  }, [pathname, search]);

  useEffect(() => {
    if (pending === 0) return;
    const show = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    const giveUp = setTimeout(() => {
      setPending(0);
      setVisible(false);
    }, GIVE_UP_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(giveUp);
    };
  }, [pending]);

  if (!visible) return null;
  return (
    // <output> is a status region: screen readers announce the loading text.
    <output className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] block h-[3px] overflow-hidden bg-sky-500/25">
      <span className="sr-only">Loading page</span>
      <span className="navigation-progress-bar block h-full w-1/3 bg-sky-500" />
    </output>
  );
}
