/**
 * Plan 084 Phase 3 — `<BootstrapGate>` server component.
 *
 * Reads the `chainglass-bootstrap` cookie via `cookies()` from `next/headers`,
 * verifies it against the active code + signing key, and passes the boolean
 * result to the client `<BootstrapPopup>` so the popup can paint over
 * `{children}` when the user is unverified.
 *
 * Lives in RootLayout (apps/web/app/layout.tsx) — wraps every route
 * including `/login`.
 */
import {
  BOOTSTRAP_COOKIE_NAME,
  verifyCookieValue,
} from '@chainglass/shared/auth-bootstrap-code';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { getBootstrapCodeAndKey } from '@/lib/bootstrap-code';

import { BootstrapPopup } from './bootstrap-popup';

/**
 * Pure helper — exported for unit tests so we don't need to mock `cookies()`.
 * Returns `true` iff the cookie value HMACs to the active code+key.
 */
export function computeBootstrapVerified(
  cookieValue: string | undefined,
  code: string,
  key: Buffer,
): boolean {
  return verifyCookieValue(cookieValue, code, key);
}

export async function BootstrapGate({
  children,
}: {
  children: ReactNode;
}) {
  let bootstrapVerified = false;
  try {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(BOOTSTRAP_COOKIE_NAME)?.value;
    const { code, key } = await getBootstrapCodeAndKey();
    bootstrapVerified = computeBootstrapVerified(cookieValue, code, key);
  } catch {
    // File missing/unreadable — render unverified so the popup paints. The
    // operator sees the gate UI even in this degraded state rather than a
    // crashed layout.
    bootstrapVerified = false;
  }
  return (
    <BootstrapPopup bootstrapVerified={bootstrapVerified}>
      {children}
    </BootstrapPopup>
  );
}
