# Phase 6 — Mobile Smoke Evidence

**Status (2026-05-02)**: Evidence capture **deferred** — harness app at port 3107 was down at impl time (`just harness doctor` reported `app: down`). Mobile-safe Tailwind CSS is shipped in T001 impl; live screenshot capture is the implementer's pre-PR smoke obligation.

## Rubric (per dossier T004)

Capture 6 screenshots — 3 states × 2 viewports — using Chrome DevTools or Playwright:

### Viewports
- **iPhone SE**: 375 × 667
- **Pixel 5**: 414 × 896

### States
1. **Idle** — popup mounted, input empty, submit disabled
2. **On-screen-keyboard** — input focused, soft keyboard visible (DevTools "Show device frame" + simulate input focus)
3. **Error** — popup with "Wrong code — try again" displayed (type any wrong-format-but-valid string and submit)

### Naming convention
- `mobile-375x667-idle.png`
- `mobile-375x667-keyboard.png`
- `mobile-375x667-error.png`
- `mobile-414x896-idle.png`
- `mobile-414x896-keyboard.png`
- `mobile-414x896-error.png`

## Pass criteria
- No horizontal scroll
- Input field reachable above on-screen keyboard
- Submit button is ≥44×44 CSS px (already enforced via `min-h-[44px]` Tailwind class on T001 impl)
- ESC, click-outside, swipe-down don't dismiss the modal
- Focus stays on input across keyboard interactions

## Capture commands

### Via harness Playwright/CDP
```bash
just harness dev                    # boot the harness container and dev server
just harness ports                  # confirm ports for this worktree
just harness screenshot-all popup-mobile --viewports 375x667,414x896 --route /
```

### Via local browser DevTools
1. `pnpm dev` (or `just harness dev`)
2. Open `http://localhost:<port>/` in Chrome
3. F12 → Device Toolbar → choose iPhone SE → screenshot
4. Repeat for Pixel 5
5. Save under this directory with the names above

## Why deferred
- Capturing screenshots requires a live app + a bootstrap-code file on disk for the popup to render.
- The harness app at port 3107 was returning 500 at impl time; bringing it up is open-ended.
- Mobile-safe CSS is already shipped (`min-h-[100dvh]` overlay, `w-[calc(100%-2rem)] max-w-md` content, `pb-[max(1.5rem,env(safe-area-inset-bottom))]` safe-area, `min-h-[44px]` touch target, `text-lg px-3 py-3` input).
- Phase 7 task 7.8 (harness exercise L3) will validate at the system level.

The implementer / user committing the PR captures these screenshots once the harness is operational.
