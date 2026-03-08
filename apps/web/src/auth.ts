import { isUserAllowed } from '@/features/063-login/lib/allowed-users';
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { NextResponse } from 'next/server';

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
// Two call signatures:
//   1. auth() — no args, returns session (Server Components, Server Actions)
//   2. auth(callback) — proxy.ts middleware wrapper, returns a middleware function
const _auth = nextAuth.auth;
export const auth: typeof _auth = ((...args: unknown[]) => {
  if (process.env.DISABLE_AUTH === 'true') {
    // Proxy/middleware call: auth(callback) — return a pass-through middleware
    if (args.length > 0 && typeof args[0] === 'function') {
      return (req: unknown) => NextResponse.next();
    }
    // Session call: auth() — return fake session
    return Promise.resolve({ user: { name: 'debug', email: 'debug@local' } }) as ReturnType<
      typeof _auth
    >;
  }
  // biome-ignore lint/complexity/noBannedTypes: NextAuth auth() has complex overloaded signatures requiring dynamic dispatch
  return (_auth as Function)(...args);
}) as typeof _auth;
