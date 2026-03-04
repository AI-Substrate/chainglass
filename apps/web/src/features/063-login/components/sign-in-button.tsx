'use client';

import { signIn } from 'next-auth/react';

export function SignInButton() {
  return (
    <button
      type="button"
      onClick={() => signIn('github', { callbackUrl: '/' })}
      className="terminal-button font-mono text-sm uppercase tracking-[2px] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
    >
      {'> Sign in with GitHub'}
    </button>
  );
}
