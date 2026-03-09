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

// biome-ignore lint/suspicious/noExplicitAny: NextAuth signIn type is not portable across module boundaries
export const { handlers, signIn, signOut } = nextAuth as any as {
  handlers: typeof nextAuth.handlers;
  // biome-ignore lint/suspicious/noExplicitAny: NextAuth overloaded signIn signature
  signIn: (...args: any[]) => any;
  signOut: typeof nextAuth.signOut;
};

// Wrap auth() to return a fake session when DISABLE_AUTH=true.
// Two call signatures:
//   1. auth() — no args, returns session (Server Components, Server Actions)
//   2. auth(callback) — proxy.ts middleware wrapper, returns a middleware function
const _auth = nextAuth.auth;
// biome-ignore lint/suspicious/noExplicitAny: NextAuth auth() has overloaded signatures that TypeScript can't express in a wrapper
export const auth: typeof _auth = ((...args: any[]) => {
  if (process.env.DISABLE_AUTH === 'true') {
    // Proxy/middleware call: auth(callback) — return a pass-through middleware
    if (args.length > 0 && typeof args[0] === 'function') {
      return (req: unknown) => NextResponse.next();
    }
    // Session call: auth() — return fake session
    return Promise.resolve({ user: { name: 'debug', email: 'debug@local' } });
  }
  // biome-ignore lint/suspicious/noExplicitAny: NextAuth overloaded auth() signatures
  return (_auth as any)(...args);
  // biome-ignore lint/suspicious/noExplicitAny: NextAuth overloaded auth() signatures
}) as any;
