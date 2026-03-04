import { isUserAllowed } from '@/features/063-login/lib/allowed-users';
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  trustHost: true,
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    signIn: async ({ profile }) => {
      const login = typeof profile?.login === 'string' ? profile.login : '';
      if (!isUserAllowed(login)) {
        return `/login?error=AccessDenied&user=${encodeURIComponent(login)}`;
      }
      return true;
    },
  },
});
