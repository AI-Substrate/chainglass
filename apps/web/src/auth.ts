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

// Wrap auth() to return a fake session when DISABLE_AUTH=true.
// Must work for ALL call signatures — Server Actions pass args to auth().
const _auth = nextAuth.auth;
export const auth: typeof _auth = ((...args: unknown[]) => {
  if (process.env.DISABLE_AUTH === 'true') {
    return Promise.resolve({ user: { name: 'debug', email: 'debug@local' } }) as ReturnType<
      typeof _auth
    >;
  }
  // biome-ignore lint/complexity/noBannedTypes: NextAuth auth() has complex overloaded signatures requiring dynamic dispatch
  return (_auth as Function)(...args);
}) as typeof _auth;
