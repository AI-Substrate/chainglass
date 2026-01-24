'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

/**
 * ThemeToggle - Button to switch between light and dark themes
 *
 * Uses next-themes for theme state management.
 * Shows moon icon in light mode (click to go dark).
 * Shows sun icon in dark mode (click to go light).
 *
 * Waits for hydration to complete before rendering icons to prevent
 * flash of incorrect icon during SSR/hydration mismatch.
 */
export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  // Only render icon after hydration to prevent mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Use resolvedTheme for 'system' mode detection, fallback to theme
  const currentTheme = resolvedTheme ?? theme;
  const isDark = currentTheme === 'dark';

  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
      {mounted ? (
        isDark ? (
          <Sun className="size-5" data-testid="sun-icon" />
        ) : (
          <Moon className="size-5" data-testid="moon-icon" />
        )
      ) : (
        <span className="size-5" />
      )}
    </Button>
  );
}
