'use client';

/**
 * Client-side providers wrapper.
 *
 * Includes:
 * - React Query (QueryClientProvider) for server state management
 * - nuqs (NuqsAdapter) for type-safe URL state management (Plan 041 Phase 2)
 * - Toaster (sonner) for global toast notifications (Plan 042)
 *
 * Part of Plan 015: Phase 3 notification-fetch architecture
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { type ReactNode, useState } from 'react';

import { SDKProvider } from '../lib/sdk/sdk-provider';
import { GlobalStateProvider } from '../lib/state';
import { Toaster } from './ui/toaster';

interface ProvidersProps {
  children: ReactNode;
}

/**
 * Client-side providers for the app.
 *
 * Creates QueryClient instance in state to ensure it's only created once
 * per component instance and survives across re-renders.
 */
export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Per Phase 3: staleTime 0 for real-time data
            // Data is considered stale immediately, but we rely on SSE notifications
            // to trigger refetch rather than polling
            staleTime: 0,
            // Keep unused data in cache for 5 minutes
            gcTime: 1000 * 60 * 5,
            // Retry failed requests up to 3 times
            retry: 3,
            // Don't refetch on window focus (SSE handles real-time updates)
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <NuqsAdapter>
        <SDKProvider>
          <GlobalStateProvider>{children}</GlobalStateProvider>
        </SDKProvider>
      </NuqsAdapter>
      {/* Toaster must be inside ThemeProvider (in layout.tsx above us) for dark mode — DYK-042-04 */}
      <Toaster />
    </QueryClientProvider>
  );
}
