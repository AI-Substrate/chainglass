# Workshop: ASCII Art Animated Login Screen

**Type**: UI/Animation
**Plan**: 063-login
**Spec**: [login-spec.md](../login-spec.md)
**Created**: 2026-03-02
**Status**: Draft

**Related Documents**:
- [login-plan.md](../login-plan.md) — Phase 2 tasks reference this workshop
- [research-dossier.md](../research-dossier.md) — Finding 06: AsciiSpinner pattern

**Domain Context**:
- **Primary Domain**: `_platform/auth` (login page owned by auth domain)
- **Related Domains**: `_platform/panel-layout` (AsciiSpinner pattern reuse)

---

## Purpose

Design the animated ASCII art login screen — the first thing users see when accessing Chainglass. The screen should feel like a hacker console / cyberpunk terminal, with the Chainglass logo rendered in large ASCII art, animated background effects, and a "Sign in with GitHub" button that matches the aesthetic. This workshop defines the visual design, animation techniques, component architecture, and performance strategy.

## Key Questions Addressed

- What animation effects create the hacker-console feel?
- How to render the Chainglass logo in ASCII art?
- What color scheme and visual effects to use?
- How to make it performant (60fps) and accessible (prefers-reduced-motion)?
- What libraries (if any) to use vs building from scratch?
- How does it work responsively on mobile?

---

## Design Vision

### The Feel

A dark terminal screen boots up. Matrix-style characters rain down the screen. The Chainglass logo materializes in the center — large ASCII block text that glitches and flickers as if being transmitted through a noisy channel. Below it, a blinking terminal cursor, then a "Sign in with GitHub" button styled like a command prompt. Scanlines overlay everything. It feels like you're logging into a classified system.

### Reference Aesthetic

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ░▒▓ cascading matrix characters ▓▒░                               │
│  ░▒▓ different speeds, different opacity ▓▒░                       │
│                                                                     │
│         ██████╗██╗  ██╗ █████╗ ██╗███╗   ██╗                       │
│        ██╔════╝██║  ██║██╔══██╗██║████╗  ██║                       │
│        ██║     ███████║███████║██║██╔██╗ ██║                       │
│        ██║     ██╔══██║██╔══██║██║██║╚██╗██║                       │
│        ╚██████╗██║  ██║██║  ██║██║██║ ╚████║                       │
│         ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝                    │
│         ██████╗ ██╗      █████╗ ███████╗███████╗                    │
│        ██╔════╝ ██║     ██╔══██╗██╔════╝██╔════╝                   │
│        ██║  ███╗██║     ███████║███████╗███████╗                    │
│        ██║   ██║██║     ██╔══██║╚════██║╚════██║                   │
│        ╚██████╔╝███████╗██║  ██║███████║███████║                   │
│         ╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝                  │
│                                                                     │
│                    ▌ SYSTEM ACCESS REQUIRED ▐                       │
│                                                                     │
│                  ┌──────────────────────────┐                       │
│                  │  > Sign in with GitHub _  │                      │
│                  └──────────────────────────┘                       │
│                                                                     │
│  ░▒▓ scanline overlay ▓▒░                                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Animation Effects Stack

### Layer 1: Matrix Rain Background (lowest)

Falling columns of random characters at varying speeds and opacity. Pure CSS + minimal JS.

**Technique**: CSS `@keyframes` on absolutely-positioned `<span>` columns.

```
Approach: CSS-driven matrix rain
─────────────────────────────────────────────
• 30-50 columns of characters
• Each column: random speed (8-20s), random delay (0-10s)
• Characters: katakana + latin + digits (ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘ 0-9 A-Z)
• Color: #00ff41 (matrix green) with opacity gradient (1.0 → 0.0 top to bottom)
• Each column: 15-25 characters tall
• Animation: translateY from -100% to 100vh, infinite loop
• On mobile: reduce to 15-20 columns
```

**Implementation**:
```tsx
'use client';

const CHARS = 'ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function MatrixColumn({ delay, speed, left }: { delay: number; speed: number; left: string }) {
  // Generate random character string on mount
  const chars = useMemo(() =>
    Array.from({ length: 20 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('\n'),
    []
  );

  return (
    <span
      className="absolute top-0 font-mono text-xs text-green-400 opacity-70 whitespace-pre pointer-events-none select-none"
      style={{
        left,
        animation: `matrix-fall ${speed}s linear ${delay}s infinite`,
        textShadow: '0 0 8px rgba(0, 255, 65, 0.6)',
      }}
    >
      {chars}
    </span>
  );
}
```

**CSS keyframe**:
```css
@keyframes matrix-fall {
  0% { transform: translateY(-100%); opacity: 0; }
  10% { opacity: 0.7; }
  90% { opacity: 0.7; }
  100% { transform: translateY(100dvh); opacity: 0; }
}
```

**Why CSS over canvas/JS**: 
- GPU-accelerated (transform + opacity are compositor-only properties)
- No JavaScript per-frame overhead
- Naturally handles `prefers-reduced-motion` via CSS media query
- Consistent with codebase pattern (CSS keyframes in globals.css)

### Layer 2: ASCII Logo (middle)

Large block-letter "CHAINGLASS" logo using figlet-generated text, with a glitch animation.

**Technique**: Static ASCII text with CSS glitch effect (clip-path + color channel offset).

**Logo generation**: Use `figlet` npm package with `ANSI Shadow` font at build time or client-side.

```
 ██████╗██╗  ██╗ █████╗ ██╗███╗   ██╗ ██████╗ ██╗      █████╗ ███████╗███████╗
██╔════╝██║  ██║██╔══██╗██║████╗  ██║██╔════╝ ██║     ██╔══██╗██╔════╝██╔════╝
██║     ███████║███████║██║██╔██╗ ██║██║  ███╗██║     ███████║███████╗███████╗
██║     ██╔══██║██╔══██║██║██║╚██╗██║██║   ██║██║     ██╔══██║╚════██║╚════██║
╚██████╗██║  ██║██║  ██║██║██║ ╚████║╚██████╔╝███████╗██║  ██║███████║███████║
 ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝
```

**Glitch effect** (CSS-only, no JS):
```css
.ascii-logo {
  position: relative;
  color: #00ff41;
  text-shadow: 0 0 10px rgba(0, 255, 65, 0.5);
  animation: logo-glow 4s ease-in-out infinite alternate;
}

/* Glitch layers using ::before and ::after */
.ascii-logo::before,
.ascii-logo::after {
  content: attr(data-text);
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.ascii-logo::before {
  color: #ff0040;
  animation: glitch-1 3s infinite linear;
  clip-path: polygon(0 0, 100% 0, 100% 33%, 0 33%);
}

.ascii-logo::after {
  color: #0ff;
  animation: glitch-2 3s infinite linear;
  clip-path: polygon(0 67%, 100% 67%, 100% 100%, 0 100%);
}

@keyframes glitch-1 {
  0%, 94% { transform: translate(0); }
  95% { transform: translate(-3px, 1px); }
  96% { transform: translate(2px, -1px); }
  97% { transform: translate(-1px, 2px); }
  98% { transform: translate(3px, 0); }
  99% { transform: translate(-2px, -1px); }
  100% { transform: translate(0); }
}

@keyframes glitch-2 {
  0%, 92% { transform: translate(0); }
  93% { transform: translate(2px, -1px); }
  95% { transform: translate(-3px, 1px); }
  97% { transform: translate(1px, -2px); }
  99% { transform: translate(-1px, 2px); }
  100% { transform: translate(0); }
}

@keyframes logo-glow {
  from { text-shadow: 0 0 10px rgba(0, 255, 65, 0.3), 0 0 20px rgba(0, 255, 65, 0.1); }
  to { text-shadow: 0 0 15px rgba(0, 255, 65, 0.5), 0 0 30px rgba(0, 255, 65, 0.2); }
}
```

**Why figlet**: Browser-compatible, generates consistent ASCII art from any text, supports multiple fonts. Can pre-generate at build time and hardcode the string (zero runtime cost) or generate client-side for dynamic text.

**Why CSS glitch over JS**: No per-frame JS. Glitch fires infrequently (5-8% of animation cycle) — appears as occasional distortion, not constant noise. GPU-composited via transform + clip-path.

### Layer 3: CRT Scanline Overlay (highest)

Subtle horizontal lines + slight vignette for CRT monitor feel.

```css
.crt-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 50;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.05) 2px,
    rgba(0, 0, 0, 0.05) 4px
  );
  /* Vignette effect */
  box-shadow: inset 0 0 150px rgba(0, 0, 0, 0.5);
}
```

### Layer 4: UI Elements (sign-in button, status text)

```
┌─ Sign-in area ──────────────────────────────────────────┐
│                                                         │
│  "SYSTEM ACCESS REQUIRED" — static text, terminal font  │
│                                                         │
│  ┌───────────────────────────────┐                      │
│  │  > Sign in with GitHub _     │ ← blinking cursor     │
│  └───────────────────────────────┘                      │
│                                                         │
│  Error: "User 'xyz' is not authorized" (if denied)      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Button styling**: 
```css
.terminal-button {
  background: transparent;
  border: 1px solid #00ff41;
  color: #00ff41;
  font-family: ui-monospace, monospace;
  padding: 12px 24px;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 2px;
  position: relative;
}

.terminal-button::after {
  content: '_';
  animation: blink 1s step-end infinite;
}

.terminal-button:hover {
  background: rgba(0, 255, 65, 0.1);
  box-shadow: 0 0 15px rgba(0, 255, 65, 0.3);
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}
```

---

## Color Palette

| Name | Hex | Usage |
|------|-----|-------|
| Terminal Black | `#0a0a0a` | Background |
| Matrix Green | `#00ff41` | Primary text, logo, button border |
| Matrix Green (dim) | `rgba(0, 255, 65, 0.3)` | Rain characters, glow effects |
| Glitch Red | `#ff0040` | Glitch ::before layer |
| Glitch Cyan | `#00ffff` | Glitch ::after layer |
| Error Red | `#ff3333` | "Not authorized" message |
| Muted Gray | `#333333` | Scanlines, secondary text |
| Amber | `#ffb000` | "SYSTEM ACCESS REQUIRED" header |

---

## Component Architecture

```
app/login/page.tsx (server component)
  ├── reads searchParams.error (await)
  └── renders <LoginScreen error={...} />

app/login/layout.tsx (server component)
  └── <SessionProvider> + <ThemeProvider> wrapper (no dashboard nav)

src/features/063-login/components/
  ├── login-screen.tsx        'use client' — full composition
  │   ├── <MatrixRain />      background layer
  │   ├── <AsciiLogo />       center logo with glitch
  │   ├── <CRTOverlay />      scanline overlay
  │   ├── <SignInButton />     terminal-styled button
  │   └── <AccessDenied />    error message (conditional)
  │
  ├── matrix-rain.tsx         'use client' — CSS-driven columns
  ├── ascii-logo.tsx          'use client' — figlet text + glitch CSS
  ├── crt-overlay.tsx         server component (pure CSS, no JS)
  └── sign-in-button.tsx      'use client' — calls signIn("github")
```

### login-screen.tsx (composition root)

```tsx
'use client';

import { MatrixRain } from './matrix-rain';
import { AsciiLogo } from './ascii-logo';
import { CRTOverlay } from './crt-overlay';
import { SignInButton } from './sign-in-button';

interface LoginScreenProps {
  error?: string;
  deniedUser?: string;
}

export function LoginScreen({ error, deniedUser }: LoginScreenProps) {
  return (
    <div className="relative min-h-screen bg-[#0a0a0a] overflow-hidden flex items-center justify-center">
      {/* Layer 1: Matrix rain background */}
      <MatrixRain />

      {/* Layer 3: CRT scanlines */}
      <CRTOverlay />

      {/* Layer 2+4: Center content */}
      <div className="relative z-10 flex flex-col items-center gap-8 px-4">
        <AsciiLogo />

        <p className="font-mono text-sm text-[#ffb000] tracking-[0.3em] uppercase">
          System Access Required
        </p>

        <SignInButton />

        {error === 'AccessDenied' && deniedUser && (
          <p className="font-mono text-sm text-[#ff3333]">
            Access denied: User &apos;{deniedUser}&apos; is not authorized
          </p>
        )}
      </div>
    </div>
  );
}
```

---

## Library Decision

### Recommended: `figlet` for ASCII text + Pure CSS for everything else

| Concern | Approach | Library? |
|---------|----------|----------|
| ASCII logo text | `figlet` npm package (browser-compatible) | **Yes — `figlet`** |
| Matrix rain | CSS `@keyframes` + `<span>` columns | No library |
| Glitch effect | CSS `::before`/`::after` + `clip-path` | No library |
| CRT scanlines | CSS `repeating-linear-gradient` | No library |
| Blinking cursor | CSS `@keyframes blink` | No library |
| Button styling | Tailwind + custom CSS | No library |

**Why not canvas**: Canvas requires `requestAnimationFrame` loop, more JS overhead, harder to make accessible, doesn't integrate with React rendering model. CSS animations are GPU-accelerated by default.

**Why not `react-terminal-ui`**: It's a terminal emulator component — overkill for a login screen. We're building a visual aesthetic, not an interactive terminal.

**Why `figlet`**: It's 1 dependency, browser-compatible, generates perfect ASCII art from any string. Alternative: hardcode the ASCII art as a string constant (zero runtime cost, but harder to change).

### Alternative: Hardcoded ASCII Art (Zero Dependencies)

If you prefer no extra dependency, hardcode the logo:

```typescript
const CHAINGLASS_LOGO = `
 ██████╗██╗  ██╗ █████╗ ██╗███╗   ██╗ ██████╗ ██╗      █████╗ ███████╗███████╗
██╔════╝██║  ██║██╔══██╗██║████╗  ██║██╔════╝ ██║     ██╔══██╗██╔════╝██╔════╝
██║     ███████║███████║██║██╔██╗ ██║██║  ███╗██║     ███████║███████╗███████╗
██║     ██╔══██║██╔══██║██║██║╚██╗██║██║   ██║██║     ██╔══██║╚════██║╚════██║
╚██████╗██║  ██║██║  ██║██║██║ ╚████║╚██████╔╝███████╗██║  ██║███████║███████║
 ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝`;
```

**Tradeoff**: Zero dependency, zero runtime cost. But changing the text or font requires manual regeneration.

---

## Responsive Strategy

| Breakpoint | Logo | Rain Columns | Font Size |
|------------|------|-------------|-----------|
| Mobile (<640px) | Hide ASCII logo, show plain text "CHAINGLASS" in large monospace | 15 columns | text-xs |
| Tablet (640-1024px) | Show ASCII logo, scale down with `transform: scale(0.7)` | 25 columns | text-xs |
| Desktop (>1024px) | Full ASCII logo | 40 columns | text-sm |

**Mobile fallback for logo**:
```tsx
<div className="hidden sm:block">
  <AsciiLogo /> {/* Full ASCII art */}
</div>
<h1 className="block sm:hidden font-mono text-3xl text-[#00ff41] tracking-wider">
  CHAINGLASS
</h1>
```

---

## Accessibility

### prefers-reduced-motion

```css
@media (prefers-reduced-motion: reduce) {
  .matrix-column { animation: none !important; opacity: 0.15; }
  .ascii-logo::before, .ascii-logo::after { animation: none !important; }
  .terminal-button::after { animation: none !important; opacity: 1; }
  .crt-overlay { background: none; }
}
```

**Reduced-motion experience**: Static matrix characters at low opacity (atmospheric without movement), logo without glitch effect, cursor visible but not blinking, no scanlines.

### Other Accessibility

- Button has proper focus ring (`:focus-visible` outline)
- Error message uses `role="alert"` for screen readers
- Color contrast: green (#00ff41) on black (#0a0a0a) = 12.6:1 ratio ✅ (WCAG AAA)
- ASCII art logo has `aria-hidden="true"` + visually hidden `<h1>Chainglass</h1>` for screen readers

---

## Performance Budget

| Metric | Target | Approach |
|--------|--------|----------|
| FPS | 60fps sustained | CSS animations only (GPU-composited) |
| JS bundle | <5KB for login screen | No heavy libraries |
| LCP | <1s | Static HTML + CSS, no data fetching |
| CLS | 0 | Fixed dimensions, no layout shift |
| Memory | <20MB | No canvas, no WebGL |

**Key insight**: All animations use CSS `transform` and `opacity` only — these are composited on the GPU and never trigger layout/paint. The browser's animation engine handles timing, not JavaScript.

---

## Implementation Sequence (Phase 2 Tasks)

1. **Create matrix-rain.tsx** — CSS columns with falling characters
2. **Create ascii-logo.tsx** — Hardcoded ANSI Shadow logo + CSS glitch
3. **Create crt-overlay.tsx** — Pure CSS scanline + vignette
4. **Create sign-in-button.tsx** — Terminal-styled button with cursor blink
5. **Create login-screen.tsx** — Compose all layers
6. **Add responsive breakpoints** — Mobile plain text, tablet scaled, desktop full
7. **Add prefers-reduced-motion** — Static fallback
8. **Integrate into /login page** — Replace Phase 1 placeholder

---

## Open Questions

### Q1: figlet dependency or hardcoded ASCII art?

**RECOMMENDATION: Hardcoded** — Zero runtime cost, zero dependency. The logo text "CHAINGLASS" won't change. Pre-generate with `npx figlet -f "ANSI Shadow" CHAINGLASS` and paste as a constant. If we want to experiment with fonts during development, temporarily install figlet, generate a few options, pick the best, hardcode it, and remove figlet.

### Q2: How much glitch is too much?

**RECOMMENDATION: Subtle** — Glitch fires during only 5-8% of the animation cycle (3s loop, ~200ms of glitch). Rest of the time the logo is stable with a gentle glow pulse. Users shouldn't feel nauseous or distracted — the glitch is a flavor, not the main event.

### Q3: Should the matrix rain characters change periodically?

**RECOMMENDATION: No** — Each column renders with random characters on mount and loops forever. Changing characters mid-animation requires JS intervention and breaks the pure-CSS approach. The visual effect is identical since users don't track individual characters.
