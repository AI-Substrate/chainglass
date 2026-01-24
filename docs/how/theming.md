# Theme System Guide

This guide explains how the Chainglass dashboard implements theming with CSS custom properties and next-themes.

## Overview

The theme system provides:
- **Light and dark modes** with automatic system preference detection
- **FOUC prevention** (Flash of Unstyled Content)
- **CSS custom properties** for consistent styling
- **WCAG AA compliant** color contrast ratios

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ThemeProvider                          │
│  (next-themes wraps entire app in layout.tsx)              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐  │
│  │  useTheme   │────▶│ CSS Class   │────▶│ CSS Vars    │  │
│  │   Hook      │     │  .dark      │     │ Applied     │  │
│  └─────────────┘     └─────────────┘     └─────────────┘  │
│                                                             │
│  localStorage persists preference across sessions           │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

### Layout Setup

The theme provider is configured in `apps/web/app/layout.tsx`:

```tsx
import { ThemeProvider } from 'next-themes';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: Required for FOUC prevention
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"           // Theme via CSS class on <html>
          defaultTheme="system"       // Respect OS preference
          enableSystem                // Listen to system changes
          disableTransitionOnChange   // Prevent flash on toggle
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

**Critical**: The `suppressHydrationWarning` on `<html>` is mandatory. Without it, React will warn about hydration mismatches because next-themes injects a script that sets the theme before React hydrates.

### CSS Import Order

**IMPORTANT**: ReactFlow CSS must load before Tailwind:

```tsx
// apps/web/app/layout.tsx - CORRECT ORDER
import '@xyflow/react/dist/style.css';  // 1. ReactFlow FIRST
import './globals.css';                  // 2. Tailwind SECOND
```

If Tailwind loads first, ReactFlow node positioning and edge styles break.

## CSS Variables

### Color System (OKLCH)

The theme uses [OKLCH color space](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/oklch) for perceptually uniform colors:

```css
/* apps/web/app/globals.css */

:root {
  /* Light mode colors */
  --background: oklch(1 0 0);           /* Pure white */
  --foreground: oklch(0.145 0 0);       /* Near black */
  --primary: oklch(0.205 0 0);          /* Dark for contrast */
  --muted: oklch(0.97 0 0);             /* Light gray */
  --muted-foreground: oklch(0.556 0 0); /* Medium gray */
  /* ... more colors */
}

.dark {
  /* Dark mode overrides */
  --background: oklch(0.145 0 0);       /* Near black */
  --foreground: oklch(0.985 0 0);       /* Near white */
  --primary: oklch(0.922 0 0);          /* Light for contrast */
  /* ... more colors */
}
```

### Semantic Colors

| Variable | Light Mode | Dark Mode | Purpose |
|----------|------------|-----------|---------|
| `--background` | White | Near black | Page background |
| `--foreground` | Near black | Near white | Text color |
| `--primary` | Dark | Light | Primary actions |
| `--muted` | Light gray | Dark gray | Subtle backgrounds |
| `--destructive` | Red | Red | Error states |

### Status Colors

Engineering-convention status colors (same in both themes):

```css
:root {
  --status-critical: oklch(0.55 0.22 25);  /* Red */
  --status-success: oklch(0.55 0.2 145);   /* Green */
  --status-standby: oklch(0.55 0.18 250);  /* Blue */
}
```

### Using Variables in Components

```tsx
// Use Tailwind classes that reference CSS variables
<div className="bg-background text-foreground">
  <button className="bg-primary text-primary-foreground">
    Primary Button
  </button>
</div>

// Or use CSS directly
.custom-element {
  background-color: var(--background);
  color: var(--foreground);
  border-color: var(--border);
}
```

## Theme Toggle Component

The `ThemeToggle` component in `apps/web/src/components/theme-toggle.tsx`:

```tsx
'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  // Wait for hydration before rendering icons
  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = resolvedTheme ?? theme;
  const isDark = currentTheme === 'dark';

  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(isDark ? 'light' : 'dark')}>
      {mounted && (isDark ? <Sun /> : <Moon />)}
    </Button>
  );
}
```

**Key patterns**:
- Use `'use client'` directive (hooks require client component)
- Wait for `mounted` state to prevent hydration mismatch
- Use `resolvedTheme` to detect actual theme when set to 'system'

## Creating Custom Themes

### Adding a New Color Scheme

1. **Define CSS variables** in `globals.css`:

```css
/* Custom "ocean" theme */
.ocean {
  --background: oklch(0.95 0.02 220);
  --foreground: oklch(0.2 0.05 220);
  --primary: oklch(0.5 0.15 220);
  --primary-foreground: oklch(0.98 0.01 220);
  /* ... other variables */
}
```

2. **Register the theme** with next-themes:

```tsx
<ThemeProvider
  attribute="class"
  defaultTheme="system"
  themes={['light', 'dark', 'ocean']}  // Add custom theme
>
```

3. **Add toggle option**:

```tsx
const { setTheme } = useTheme();
setTheme('ocean');  // Switch to ocean theme
```

### Component-Level Theming

For component-specific styling that respects the theme:

```tsx
import { cn } from '@/lib/utils';

function StatusBadge({ status }: { status: 'success' | 'error' | 'pending' }) {
  return (
    <span className={cn(
      'px-2 py-1 rounded text-sm',
      status === 'success' && 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      status === 'error' && 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      status === 'pending' && 'bg-muted text-muted-foreground'
    )}>
      {status}
    </span>
  );
}
```

## Testing Themes

### Unit Tests with FakeLocalStorage

```tsx
import { renderHook, act } from '@testing-library/react';
import { useTheme } from 'next-themes';
import { FakeLocalStorage } from '@test/fakes';

describe('Theme persistence', () => {
  it('should persist theme to localStorage', () => {
    const storage = new FakeLocalStorage();
    // Inject into ThemeProvider via mock
    
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('dark'));
    
    expect(storage.getItem('theme')).toBe('dark');
  });
});
```

### Manual FOUC Test

1. Start dev server: `pnpm --filter @chainglass/web dev`
2. Open Chrome DevTools → Network → Throttle to "Slow 3G"
3. Navigate to `http://localhost:3000`
4. **Expected**: No white flash before theme loads
5. Toggle theme, hard refresh → Still no flash

## Troubleshooting

### Flash of White on Dark Mode

**Cause**: `suppressHydrationWarning` missing from `<html>` tag.

**Fix**: Ensure layout.tsx has:
```tsx
<html lang="en" suppressHydrationWarning>
```

### Theme Doesn't Persist

**Cause**: localStorage blocked or ThemeProvider not wrapping app.

**Fix**: Check browser settings allow localStorage; verify ThemeProvider is in root layout.

### Icons Wrong on First Render

**Cause**: Rendering theme-dependent content before hydration.

**Fix**: Use `mounted` state pattern:
```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
if (!mounted) return <Placeholder />;
```

## References

- [next-themes documentation](https://github.com/pacocoursey/next-themes)
- [OKLCH Color Picker](https://oklch.com/)
- [Tailwind CSS Dark Mode](https://tailwindcss.com/docs/dark-mode)
- [WCAG Contrast Checker](https://webaim.org/resources/contrastchecker/)
