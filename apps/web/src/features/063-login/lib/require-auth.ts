'use server';

import { auth } from '@/auth';
import { redirect } from 'next/navigation';

/**
 * Require an authenticated session. Redirects to /login if not authenticated.
 * Uses Next.js NEXT_REDIRECT (clean navigation, no error overlay).
 */
export async function requireAuth() {
  const session = await auth();
  if (!session) redirect('/login');
  return session;
}
