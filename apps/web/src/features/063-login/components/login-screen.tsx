'use client';

import { AsciiLogo } from './ascii-logo';
import { CRTOverlay } from './crt-overlay';
import { MatrixRain } from './matrix-rain';
import { SignInButton } from './sign-in-button';

interface LoginScreenProps {
  error?: string;
  deniedUser?: string;
}

export function LoginScreen({ error, deniedUser }: LoginScreenProps) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#0a0a0a]">
      {/* Layer 1: Matrix rain background */}
      <MatrixRain />

      {/* Layer 3: CRT scanlines */}
      <CRTOverlay />

      {/* Layer 2+4: Center content */}
      <div className="relative z-10 flex flex-col items-center gap-8 px-4">
        <AsciiLogo />

        <p className="font-mono text-sm uppercase tracking-[0.3em]" style={{ color: '#ffb000' }}>
          System Access Required
        </p>

        <SignInButton />

        {error === 'AccessDenied' && (
          <p role="alert" className="font-mono text-sm" style={{ color: '#ff3333' }}>
            {deniedUser
              ? `Access denied: user '\u200B${deniedUser}\u200B' is not authorized`
              : 'Access denied: your GitHub account is not authorized'}
          </p>
        )}

        {error && error !== 'AccessDenied' && (
          <p role="alert" className="font-mono text-sm" style={{ color: '#ff3333' }}>
            Authentication failed. Please try again.
          </p>
        )}
      </div>
    </div>
  );
}
