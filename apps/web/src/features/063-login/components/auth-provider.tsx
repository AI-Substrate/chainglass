'use client';

import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

// Server-renders its children. Never make this provider client-only
// (`dynamic(..., { ssr: false })`): every dashboard page would arrive as empty HTML.
// next-auth must stay out of serverExternalPackages for this to work (see next.config.mjs).
export function AuthProvider({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
