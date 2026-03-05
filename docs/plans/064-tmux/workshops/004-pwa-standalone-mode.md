# Workshop: PWA Support for iPad Standalone Mode

**Type**: Integration Pattern
**Plan**: 064-tmux
**Spec**: [tmux-spec.md](../tmux-spec.md)
**Created**: 2026-03-03
**Status**: Draft

**Related Documents**:
- [001-terminal-ui-main-and-popout.md](./001-terminal-ui-main-and-popout.md)
- [003-tmux-copy-buffer-button.md](./003-tmux-copy-buffer-button.md)
- [docs/how/dev/terminal-setup.md](../../../how/dev/terminal-setup.md)

**Domain Context**:
- **Primary Domain**: (shared) — PWA manifest is app-wide, not terminal-specific
- **Related Domains**: terminal (primary beneficiary), all workspace pages

---

## Purpose

Enable Chainglass to be installed as a Progressive Web App on iPad, eliminating the browser chrome (compact tab bar, address bar) that occludes the terminal and wastes screen real estate — especially with an external keyboard attached.

## Key Questions Addressed

- What files and config are needed for PWA standalone mode on iPadOS?
- What icon sizes are required for iPad home screen?
- How do we detect standalone mode and adapt the UI?
- Can we show an "install" prompt, and what does the UX flow look like?
- What are the gotchas with Next.js + PWA (service workers, caching)?
- Should we use a PWA library or go minimal/manual?

---

## Overview

iPadOS browsers (Safari, Edge) show persistent UI chrome — the compact floating tab bar, address bar, and navigation controls — that overlaps web content. This can't be suppressed from JavaScript or CSS. The only way to remove it is **PWA standalone mode**: the user "Adds to Home Screen" and the app launches without any browser chrome.

```
┌─────────────────────────────────────────────────┐
│ Browser Mode                                     │
│ ┌─────────────────────────────────────────────┐ │
│ │ Address Bar                                  │ │
│ ├─────────────────────────────────────────────┤ │
│ │                                             │ │
│ │         Web App Content                     │ │
│ │                                             │ │
│ ├─────────────────────────────────────────────┤ │
│ │ 💬 ⌨️ 📌  Compact Tab Bar (can't remove)   │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ PWA Standalone Mode                              │
│ ┌─────────────────────────────────────────────┐ │
│ │ Status Bar (translucent)                     │ │
│ ├─────────────────────────────────────────────┤ │
│ │                                             │ │
│ │         Web App Content                     │ │
│ │         (FULL SCREEN)                       │ │
│ │                                             │ │
│ │                                             │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

---

## Decision: Minimal vs Library Approach

### Option A: Manual manifest (no library) — RECOMMENDED

Add a `manifest.webmanifest` and Apple meta tags. No service worker, no offline caching, no build-time integration. The app is always online anyway (terminal needs WebSocket).

**Pros**: Zero dependencies, zero build complexity, zero risk of caching bugs
**Cons**: No offline support (irrelevant for our use case)

### Option B: next-pwa library

Adds service worker with caching strategies, automatic manifest generation, workbox integration.

**Pros**: Offline support, asset caching
**Cons**: Adds dependency, caching can cause stale content bugs, unnecessary for always-online terminal app

**Decision: Option A.** We don't need offline support. The terminal is useless without a network connection. Keep it simple.

---

## Implementation Spec

### File Structure

```
apps/web/
├── public/
│   ├── manifest.webmanifest      # PWA manifest
│   ├── icon-192.png              # Standard PWA icon
│   ├── icon-512.png              # Large PWA icon
│   └── apple-touch-icon.png      # 180×180 for iOS
├── app/
│   └── layout.tsx                # Add meta tags + manifest link
```

### manifest.webmanifest

```json
{
  "name": "Chainglass",
  "short_name": "Chainglass",
  "description": "Spec-driven development enrichment workflow tool",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1e1e1e",
  "theme_color": "#1e1e1e",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

**Why these values**:
- `display: "standalone"` — removes all browser chrome on iPadOS
- `background_color: "#1e1e1e"` — matches dark theme, smooth splash transition
- `theme_color: "#1e1e1e"` — dark status bar on iPad
- `start_url: "/"` — launches to dashboard, not a specific workspace

### Meta Tags (layout.tsx)

```tsx
export const metadata = {
  title: 'Chainglass',
  description: 'Spec-driven development enrichment workflow tool',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Chainglass',
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
  themeColor: '#1e1e1e',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
  },
};
```

**Why `black-translucent`**: The status bar becomes transparent and your app content draws behind it — more immersive, consistent with dark terminal theme.

**Why `viewport-fit: cover`**: Extends content into safe areas (notch, home indicator). Use `env(safe-area-inset-*)` CSS to pad where needed.

### Apple-Specific Tags

Next.js `metadata` handles most of these, but verify these render in `<head>`:

```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Chainglass">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#1e1e1e">
```

---

## Icon Requirements

| File | Size | Purpose | Format |
|------|------|---------|--------|
| `icon-192.png` | 192×192 | Standard PWA icon (Android, manifest) | PNG, no transparency |
| `icon-512.png` | 512×512 | Large PWA icon (splash, install dialog) | PNG, no transparency |
| `apple-touch-icon.png` | 180×180 | iOS home screen icon | PNG, no transparency |

**iPadOS-specific sizes** (optional, for pixel-perfect display):

| Size | Device |
|------|--------|
| 152×152 | iPad (non-retina) |
| 167×167 | iPad Pro |
| 180×180 | iPhone (also works for iPad) |

**Minimum viable**: Just `apple-touch-icon.png` at 180×180 + manifest icons at 192 and 512. iPadOS will scale from 180 for home screen.

**Icon design**: Should work on both light and dark home screen backgrounds. Solid background color (not transparent). Rounded corners are applied automatically by iPadOS.

### Placeholder Icon Strategy

If no designer-made icon is available, generate a simple placeholder:
- Dark background (#1e1e1e)
- White/cyan terminal icon or "CG" text
- Can be replaced later without code changes (just swap the PNG files)

---

## Standalone Mode Detection

Detect if the app is running as an installed PWA vs in a browser:

```typescript
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}
```

**Uses**:
1. **Hide "Install" banner** when already in standalone mode
2. **Adjust safe areas** — standalone mode uses `env(safe-area-inset-*)` differently
3. **Remove the hardcoded 140px bottom padding** in terminal — no browser chrome to dodge

### CSS Media Query

```css
@media (display-mode: standalone) {
  .terminal-container {
    /* No bottom padding needed — no browser chrome */
    bottom: 0;
  }
}
```

---

## Install Prompt UX

Since iPadOS doesn't support `beforeinstallprompt`, we show a **manual instruction banner**.

### Design

```
┌──────────────────────────────────────────────────────────────┐
│ 📱  For fullscreen mode: tap Share (↑) → Add to Home Screen │
│                                                         [✕]  │
└──────────────────────────────────────────────────────────────┘
```

### Behavior

| Condition | Show Banner? |
|-----------|-------------|
| Already in standalone mode | No |
| Desktop browser | No |
| iOS/iPadOS browser, first visit | Yes |
| User dismissed banner | No (localStorage flag) |
| User hasn't dismissed, return visit | Yes (once per session) |

### Detection Logic

```typescript
function shouldShowInstallBanner(): boolean {
  if (isStandalone()) return false;
  if (typeof window === 'undefined') return false;

  // Only show on iOS/iPadOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIOS) return false;

  // Check dismissal
  const dismissed = localStorage.getItem('pwa-banner-dismissed');
  if (dismissed) return false;

  return true;
}
```

### Dismissal

- Click ✕ → set `localStorage.setItem('pwa-banner-dismissed', 'true')`
- Banner doesn't show again until localStorage is cleared

---

## Terminal Bottom Padding Fix

Currently `terminal-inner.tsx` has hardcoded `bottom: 140px` for iPad safe area. With PWA detection:

```typescript
// In terminal-inner.tsx
const bottomOffset = isStandalone()
  ? 'env(safe-area-inset-bottom, 0px)'  // PWA: just safe area
  : '140px';                              // Browser: account for chrome
```

**Better approach**: Use `visualViewport` API to dynamically detect available space:

```typescript
useEffect(() => {
  if (!window.visualViewport) return;

  const handleResize = () => {
    const offset = window.innerHeight - window.visualViewport!.height;
    containerRef.current?.style.setProperty('--keyboard-offset', `${offset}px`);
  };

  window.visualViewport.addEventListener('resize', handleResize);
  return () => window.visualViewport?.removeEventListener('resize', handleResize);
}, []);
```

```css
.terminal-container {
  bottom: max(var(--keyboard-offset, 0px), env(safe-area-inset-bottom, 0px));
}
```

This handles all scenarios: browser with chrome, PWA standalone, keyboard open, keyboard closed.

---

## Navigation in Standalone Mode

**Important**: In standalone PWA mode, there's no browser back button. The app needs its own navigation.

Chainglass already has sidebar navigation, so this is fine. But verify:
- [ ] All workspace pages reachable from sidebar
- [ ] No dead ends (pages with no way to navigate back)
- [ ] Deep links work (user opens PWA → navigates to `/workspaces/slug/terminal`)

The `start_url: "/"` means the PWA always opens to the dashboard, which has full navigation.

---

## Implementation Tasks

| # | Task | Effort | Notes |
|---|------|--------|-------|
| 1 | Create `apps/web/public/` directory + placeholder icons | Small | Can use SVG→PNG conversion or simple canvas-drawn icon |
| 2 | Create `manifest.webmanifest` in public/ | Small | Copy from spec above |
| 3 | Update `layout.tsx` metadata with PWA fields | Small | Use Next.js `metadata` export |
| 4 | Replace hardcoded 140px with `visualViewport` + `env(safe-area-inset-bottom)` | Medium | Benefits all users, not just PWA |
| 5 | Add standalone mode detection utility | Small | `lib/is-standalone.ts` |
| 6 | Optional: Add install instruction banner for iOS users | Medium | Dismissable, localStorage-persisted |
| 7 | Test on iPad: install, launch, verify no browser chrome | Manual | Requires iPad device |

---

## Gotchas & Edge Cases

### Service Worker Not Needed

Some PWA guides insist on a service worker. **iPadOS does NOT require one** for "Add to Home Screen" to work. The manifest + meta tags are sufficient. Don't add one — it'll just cause caching headaches for a dev tool that's always online.

### Updates in Standalone Mode

When you deploy new code, PWA users see it on next launch (not live — there's no service worker pushing updates). The browser cache handles it. For a dev tool on localhost, this is fine — `next dev` serves fresh content.

### HTTPS Requirement

PWA manifest requires HTTPS (or localhost). We already have `just dev-https` for remote iPad access, so this is covered.

### Theme Color with next-themes

The `theme_color` in manifest is static (`#1e1e1e` for dark). If the user switches to light theme, the status bar color won't match. Options:
1. Accept it (dark status bar always — fine for terminal-focused use)
2. Add a `<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff">` for system-level theme detection

**Recommendation**: Accept dark always. Terminal users overwhelmingly prefer dark mode.

### iPad Split View

PWAs support iPad Split View (side-by-side with another app). The layout should respond to width changes. Chainglass already uses responsive layout with resizable panels, so this should work.

---

## Open Questions

### Q1: Where do icons come from?

**OPEN**: No designer-made Chainglass icon exists yet.
- Option A: Generate placeholder (dark bg + terminal icon)
- Option B: Use a simple text "CG" icon
- Option C: Wait for design team to provide proper icon

**Recommendation**: Option A (placeholder), swap later when real icon arrives.

### Q2: Should install banner show on all iOS pages or just terminal?

**OPEN**:
- Option A: Show on all pages (benefits all users)
- Option B: Show only on terminal page (targeted, less annoying)
- Option C: Show on first visit only, regardless of page

**Recommendation**: Option C — first visit, any page. The PWA benefits everything, not just terminal.

### Q3: Should we remove the 140px hardcode now or keep both?

**RESOLVED**: Replace with `visualViewport` approach. It handles all cases dynamically — browser with chrome, PWA standalone, keyboard open/closed. No conditional logic needed.

---

## Quick Reference

```bash
# Test PWA on iPad
PORT=3002 just dev-https

# On iPad Safari:
# 1. Navigate to https://192.168.1.32:3002
# 2. Tap Share button (↑)
# 3. Tap "Add to Home Screen"
# 4. Tap "Add"
# 5. Open Chainglass from home screen → full screen, no browser chrome
```

### Verify Manifest

```bash
# Check manifest is served
curl -s https://localhost:3002/manifest.webmanifest | jq .

# Check meta tags in HTML
curl -s https://localhost:3002 | grep -i "apple-mobile\|manifest\|theme-color"
```

### Detect Standalone in DevTools

```javascript
// Browser console
window.matchMedia('(display-mode: standalone)').matches
// true = PWA, false = browser
```
