# Responsive Design Patterns

This document covers the responsive infrastructure implemented in Phase 6, including the `useResponsive` hook, container query utilities, and progressive enhancement patterns.

## Overview

The Chainglass web application uses a **three-tier responsive system**:

| Tier | Width | `deviceType` | `useMobilePatterns` |
|------|-------|--------------|---------------------|
| Phone | < 768px | `'phone'` | `true` |
| Tablet | 768px - 1023px | `'tablet'` | `false` |
| Desktop | >= 1024px | `'desktop'` | `false` |

**Key principle**: Tablets use desktop patterns. Only phones get mobile-specific UI like bottom navigation.

## useResponsive Hook

### Basic Usage

```typescript
import { useResponsive } from '@/hooks/useResponsive';

function NavigationWrapper() {
  const { useMobilePatterns, deviceType } = useResponsive();

  if (useMobilePatterns) {
    return <BottomTabBar />;
  }
  return <Sidebar />;
}
```

### Return Type

```typescript
interface ResponsiveState {
  isPhone: boolean;      // true if viewport < 768px
  isTablet: boolean;     // true if 768px <= viewport < 1024px
  isDesktop: boolean;    // true if viewport >= 1024px
  useMobilePatterns: boolean;  // true ONLY for phones
  deviceType: 'phone' | 'tablet' | 'desktop' | undefined;
}
```

### Exported Constants

```typescript
import { PHONE_BREAKPOINT, TABLET_BREAKPOINT } from '@/hooks/useResponsive';

// PHONE_BREAKPOINT = 768 (matches existing MOBILE_BREAKPOINT)
// TABLET_BREAKPOINT = 1024
```

### SSR Safety

The hook uses `useSyncExternalStore` with an explicit server snapshot for hydration safety:

- During SSR: `deviceType: undefined`, `isDesktop: true`
- After hydration: Real viewport values

This prevents hydration mismatches while defaulting to desktop experience during SSR.

### Compatibility with useIsMobile

The existing `useIsMobile()` hook remains unchanged. The new `useResponsive()` hook is additive:

| Hook | Purpose | Breakpoint |
|------|---------|------------|
| `useIsMobile()` | Legacy binary check | 768px |
| `useResponsive()` | Three-tier detection | 768px / 1024px |

## Container Queries

Container queries allow styling based on a container's size rather than viewport size. This is useful for reusable components that may appear in different contexts.

### CSS Classes

Apply `.cq-container` to make an element a container query target:

```html
<div class="cq-container">
  <div class="cq-hide-sm">Hidden when container < 300px</div>
  <div class="hidden cq-show-lg">Shown when container >= 768px</div>
</div>
```

### Available Classes

| Class | Effect |
|-------|--------|
| `.cq-container` | Makes element a CQ target |
| `.cq-container-sidebar` | Named container for sidebar |
| `.cq-container-main` | Named container for main content |
| `.cq-container-card` | Named container for cards |

**Hide classes** (hidden when container is smaller):
- `.cq-hide-sm` (< 300px)
- `.cq-hide-md` (< 500px)
- `.cq-hide-lg` (< 768px)
- `.cq-hide-xl` (< 1024px)

**Show classes** (shown when container is at least):
- `.cq-show-sm` (>= 300px)
- `.cq-show-md` (>= 500px)
- `.cq-show-lg` (>= 768px)
- `.cq-show-xl` (>= 1024px)

**Grid columns**:
- `.cq-grid-cols-2` (>= 500px)
- `.cq-grid-cols-3` (>= 768px)
- `.cq-grid-cols-4` (>= 1024px)

**Flex direction**:
- `.cq-flex-col` (column)
- `.cq-flex-row-md` (row at >= 500px)
- `.cq-flex-row-lg` (row at >= 768px)

### JavaScript Utilities

```typescript
import {
  hasContainerQuerySupport,
  addCqFallbacks,
  getResponsiveClasses,
} from '@/lib/container-query-utils';

// Check browser support
if (hasContainerQuerySupport()) {
  console.log('Container queries supported');
}

// Auto-add media query fallbacks
const className = addCqFallbacks('cq-hide-md cq-grid-cols-2');
// Returns: 'cq-hide-md max-[499px]:hidden cq-grid-cols-2 min-[500px]:grid-cols-2'

// Get classes with support info
const { className, supported, ssr } = getResponsiveClasses('cq-hide-md');
```

## Progressive Enhancement

Container queries have good browser support but may not work in older browsers. The utilities provide automatic fallbacks:

1. **Automatic**: Use `addCqFallbacks()` to add media query equivalents
2. **Manual**: Use `withFallback()` to specify exact fallbacks
3. **Detection**: Use `hasContainerQuerySupport()` for conditional logic

### Fallback Mapping

| CQ Class | Media Query Fallback |
|----------|---------------------|
| `cq-hide-md` | `max-[499px]:hidden` |
| `cq-show-lg` | `md:block` |
| `cq-grid-cols-2` | `min-[500px]:grid-cols-2` |

## Demo Page

Visit `/demo/responsive` to see all patterns in action with:
- Live viewport detection display
- Resizable container query demo
- Code examples

## Best Practices

1. **Use `useMobilePatterns` for navigation decisions** - Don't use `isPhone` directly
2. **Prefer container queries for component layout** - Use media queries for page-level changes
3. **Always provide fallbacks** - Use `addCqFallbacks()` for older browser support
4. **Test all three tiers** - Phone, tablet, and desktop have different behaviors

## Testing

Use `FakeMatchMedia` from `test/fakes/` for testing responsive hooks:

```typescript
import { FakeMatchMedia } from '@/test/fakes/fake-match-media';

const fake = new FakeMatchMedia(375); // Phone width
// Inject into window.matchMedia for testing
fake.setViewportWidth(1024); // Simulate resize to desktop
```

## Related Files

- `/apps/web/src/hooks/useResponsive.ts` - Main hook
- `/apps/web/src/lib/container-query-utils.ts` - CQ utilities
- `/apps/web/app/globals.css` - CSS classes
- `/test/fakes/fake-match-media.ts` - Test fake
- `/apps/web/app/(dashboard)/demo/responsive/page.tsx` - Demo page
