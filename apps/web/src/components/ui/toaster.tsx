'use client';

/**
 * Theme-aware Toaster wrapper for sonner.
 *
 * Provides global toast notifications with automatic dark mode support.
 * Mount once in Providers — then call `import { toast } from 'sonner'`
 * from any client component, hook, or callback.
 *
 * Plan 042: Global Toast System
 * Domain: _platform/notifications
 *
 * Gotcha: toast() is client-only. Calling it from a Server Component or
 * server action is a silent no-op — no error, no feedback. The pattern is:
 * server returns result → client reads result → client calls toast().
 */

import { useTheme } from 'next-themes';
import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <SonnerToaster
      position="bottom-right"
      richColors
      closeButton
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      toastOptions={{
        className: 'font-sans',
      }}
    />
  );
}
