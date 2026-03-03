'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

// Skip SSR for SessionProvider — next-auth in serverExternalPackages
// resolves React differently during SSR, causing useState to be null.
// SessionProvider is client-only anyway (fetches /api/auth/session on mount).
const ClientSessionProvider = dynamic(
  () => import('next-auth/react').then((mod) => mod.SessionProvider),
  { ssr: false }
);

export function AuthProvider({ children }: { children: ReactNode }) {
  return <ClientSessionProvider>{children}</ClientSessionProvider>;
}
