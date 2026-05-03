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

// Wrap auth() to return a fake session when GitHub OAuth is disabled.
// Plan 084 Phase 5: accept both `DISABLE_GITHUB_OAUTH` (new canonical name) and
// `DISABLE_AUTH` (legacy alias, deprecated — emits warn-once at first
// disabled-mode call). Removal horizon: one release after Phase 5 lands.
// Two call signatures preserved:
//   1. auth() — no args, returns session (Server Components, Server Actions)
//   2. auth(callback) — proxy.ts middleware wrapper, returns a middleware function
//
// Warn-once flag lives on `globalThis` (Plan 084 Phase 5 Completeness fix #3 —
// module-level `let` resets across Next.js HMR module reloads; mirrors the
// `globalThis.__eventPopperServerInfoWritten` pattern from instrumentation.ts).
const _auth = nextAuth.auth;
const _globalAuthFlags = globalThis as typeof globalThis & {
  __CHAINGLASS_DISABLE_AUTH_WARNED?: boolean;
};

/**
 * True iff GitHub OAuth checks should be skipped (dev mode). Accepts both
 * `DISABLE_GITHUB_OAUTH` (canonical, Plan 084 Phase 5) and `DISABLE_AUTH`
 * (legacy alias — emits warn-once via `globalThis` flag).
 *
 * Exported so proxy.ts can share the same env-var contract (single source of
 * truth — eliminates risk of the two checks drifting).
 */
export function isOAuthDisabled(): boolean {
  const newName = process.env.DISABLE_GITHUB_OAUTH === 'true';
  const legacyName = process.env.DISABLE_AUTH === 'true';
  if (legacyName && !_globalAuthFlags.__CHAINGLASS_DISABLE_AUTH_WARNED) {
    _globalAuthFlags.__CHAINGLASS_DISABLE_AUTH_WARNED = true;
    // SECRET-FREE warn message (AC-22): no bootstrap code or secret values.
    console.warn(
      '[auth] DISABLE_AUTH is deprecated; use DISABLE_GITHUB_OAUTH instead. Will be removed in next release.',
    );
  }
  return newName || legacyName;
}

// biome-ignore lint/suspicious/noExplicitAny: NextAuth auth() has overloaded signatures that TypeScript can't express in a wrapper
export const auth: typeof _auth = ((...args: any[]) => {
  if (isOAuthDisabled()) {
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
