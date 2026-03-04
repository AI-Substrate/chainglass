'use client';

import { signOut, useSession } from 'next-auth/react';

export { signOut };

export function useAuth() {
  const { data: session, status } = useSession();

  return {
    user: session?.user ?? null,
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
  };
}
