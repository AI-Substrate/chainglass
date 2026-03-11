'use client';

import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_ICON_THEME, ICON_BASE_PATH } from '../constants';
import type { IconThemeManifest } from '../types';

interface IconThemeContextValue {
  manifest: IconThemeManifest | null;
  isLoading: boolean;
  themeId: string;
}

const IconThemeContext = createContext<IconThemeContextValue | null>(null);

interface IconThemeProviderProps {
  children: ReactNode;
  themeId?: string;
}

/**
 * Provides the icon theme manifest to all icon components via React context.
 * Fetches the manifest JSON client-side from public/icons/{themeId}/.
 * Renders children immediately — icon components return null while loading.
 */
export function IconThemeProvider({
  children,
  themeId = DEFAULT_ICON_THEME,
}: IconThemeProviderProps) {
  const [manifest, setManifest] = useState<IconThemeManifest | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setManifest(null);

    fetch(`${ICON_BASE_PATH}/${themeId}/manifest.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load icon manifest: ${res.status}`);
        return res.json();
      })
      .then((data: IconThemeManifest) => {
        if (!cancelled) {
          setManifest(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[IconThemeProvider]', err);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [themeId]);

  return (
    <IconThemeContext.Provider value={{ manifest, isLoading, themeId }}>
      {children}
    </IconThemeContext.Provider>
  );
}

/**
 * Access the icon theme manifest from context.
 * Returns { manifest, isLoading, themeId }.
 * manifest is null while loading or if fetch failed.
 */
export function useIconManifest(): IconThemeContextValue {
  const ctx = useContext(IconThemeContext);
  if (!ctx) {
    throw new Error('useIconManifest must be used within <IconThemeProvider>');
  }
  return ctx;
}
