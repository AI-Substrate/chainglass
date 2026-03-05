import { isUserAllowed } from '@/features/063-login/lib/allowed-users';
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';

const nextAuth = NextAuth({
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

export const { handlers, signIn, signOut } = nextAuth;

// Wrap auth() to return a fake session when DISABLE_AUTH=true
const _auth = nextAuth.auth;
export const auth: typeof _auth = ((...args: any[]) => {
  if (process.env.DISABLE_AUTH === 'true' && args.length === 0) {
    return Promise.resolve({ user: { name: 'debug', email: 'debug@local' } }) as any;
  }
  return (_auth as any)(...args);
}) as any;
