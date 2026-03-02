'use client';

import { signIn } from 'next-auth/react';

export function SignInButton() {
  return (
    <button
      type="button"
      onClick={() => signIn('github', { callbackUrl: '/' })}
      className="terminal-button font-mono text-sm uppercase tracking-[2px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00ff41] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
    >
      {'> Sign in with GitHub'}
    </button>
  );
}
