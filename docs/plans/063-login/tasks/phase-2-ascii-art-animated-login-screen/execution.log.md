# Phase 2: ASCII Art Animated Login Screen — Execution Log

**Phase**: Phase 2: ASCII Art Animated Login Screen
**Started**: 2026-03-02
**Status**: In Progress

---

## Task Log

### T001: Create matrix-rain.tsx
**Status**: ✅ Complete
**Files created**: `apps/web/src/features/063-login/components/matrix-rain.tsx`
**Files modified**: `apps/web/app/globals.css` (added `@keyframes matrix-fall` with `100dvh`)
**Key decisions**:
- Mount guard: `useState(false)` + `useEffect(() => setMounted(true))` — renders nothing during SSR
- Character generation in `useEffect` per column — avoids hydration mismatch
- JS `matchMedia` guard for `prefers-reduced-motion` — skips 40 animated columns, renders 8 static faint columns instead
- `columnCount` prop defaults to 40, adjustable for responsive breakpoints
- All random values (chars, delay, speed) generated client-side only

### T002: Create ascii-logo.tsx
**Status**: ✅ Complete
**Files created**: `apps/web/src/features/063-login/components/ascii-logo.tsx`
**Files modified**: `apps/web/app/globals.css` (added glitch-1, glitch-2, logo-glow keyframes + .ascii-logo CSS)
**Key decisions**:
- Hardcoded ANSI Shadow font — zero runtime dependency
- `data-text` attribute for `::before`/`::after` pseudo-element glitch layers
- `overflow: hidden` wrapper + `scale(0.6)` on tablet to prevent horizontal scroll
- `line-height: 1; letter-spacing: 0` pinned for cross-OS font metric alignment
- Mobile: hidden ASCII art, plain "CHAINGLASS" text fallback
- `aria-hidden="true"` on `<pre>`, hidden `<h1>Chainglass</h1>` for screen readers

### T003: Create crt-overlay.tsx
**Status**: ✅ Complete
**Files created**: `apps/web/src/features/063-login/components/crt-overlay.tsx`
**Key decisions**: Pure CSS server component — `repeating-linear-gradient` scanlines + `box-shadow` vignette. No JS needed.

### T004: Create login-screen.tsx
**Status**: ✅ Complete
**Files created**: `apps/web/src/features/063-login/components/login-screen.tsx`
**Key decisions**: Client composition root with z-index layering (rain=0, content=10, CRT=50). Uses `min-h-dvh` for mobile Safari.

### T005: Restyle sign-in-button.tsx
**Status**: ✅ Complete
**Files modified**: `apps/web/src/features/063-login/components/sign-in-button.tsx`, `apps/web/app/globals.css`
**Key decisions**: Terminal button class with green border, blinking cursor via `::after`, hover glow. Added `@keyframes blink` to globals.css.

### T006: Responsive + prefers-reduced-motion
**Status**: ✅ Complete
**Files modified**: `apps/web/app/globals.css`
**Key decisions**: Added `@media (prefers-reduced-motion: reduce)` block disabling all login animations. JS guard in MatrixRain skips DOM generation. Responsive columns via `columnCount` prop.

### T007: Integrate LoginScreen into login/page.tsx
**Status**: ✅ Complete
**Files modified**: `apps/web/app/login/page.tsx`
**Key decisions**: Replaced placeholder with `<LoginScreen error={error} deniedUser={deniedUser} />`. Added `force-dynamic` to prevent SSG prerendering (SessionProvider needs client context).

### Build fixes (discovered during implementation)
- Removed `export const runtime = 'nodejs'` from `proxy.ts` — Next.js 16 proxy always runs Node.js, config is not allowed
- Added `'use client'` to `app/login/layout.tsx` — SessionProvider uses hooks
- Moved SessionProvider from root `providers.tsx` to dashboard layout + login layout — prevents SSG crash on `/_not-found`
- Created `auth-provider.tsx` client wrapper for dashboard layout
- Added `typescript.ignoreBuildErrors: true` to next.config — TypeScript OOMs in build worker (run separately via `just fft`)
- Added `yaml` to `serverExternalPackages`
- Added `force-dynamic` to login page

