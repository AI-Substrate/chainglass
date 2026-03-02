'use client';

import { signIn } from 'next-auth/react';

export function SignInButton() {
  return (
    <button
      type="button"
      onClick={() => signIn('github', { callbackUrl: '/' })}
      className="rounded-md bg-neutral-800 px-6 py-3 font-mono text-sm text-white hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-green-500"
    >
      Sign in with GitHub
    </button>
  );
}
