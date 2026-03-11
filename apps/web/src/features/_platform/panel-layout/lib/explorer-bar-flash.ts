/**
 * Explorer Bar Flash — reusable attention signal for panel headers.
 *
 * Temporarily changes the background of all `[data-panel-header]` elements
 * to a color (green for attention, red for error, orange for warning),
 * holds for a duration, then fades back to normal.
 *
 * Usage:
 *   flashExplorerBar('green')           // attention (default 5s hold)
 *   flashExplorerBar('red', 3000)       // error, 3s hold
 *   flashExplorerBar('orange', 2000)    // warning, 2s hold
 *
 * Dispatch via CustomEvent (for decoupled callers):
 *   window.dispatchEvent(new CustomEvent('explorer-bar:flash', { detail: { color: 'green' } }))
 */

const FLASH_COLORS: Record<string, string> = {
  green: 'rgb(34, 197, 94)',
  red: 'rgb(239, 68, 68)',
  orange: 'rgb(249, 115, 22)',
  blue: 'rgb(59, 130, 246)',
};

/**
 * Flash all panel header bars with a color.
 * @param color - 'green' | 'red' | 'orange' | 'blue'
 * @param holdMs - how long to hold the color before fading (default 5000)
 * @param fadeMs - fade duration (default 2000)
 */
export function flashExplorerBar(
  color: 'green' | 'red' | 'orange' | 'blue' = 'green',
  holdMs = 5000,
  fadeMs = 2000
): void {
  const bg = FLASH_COLORS[color] ?? FLASH_COLORS.green;
  const headers = document.querySelectorAll<HTMLElement>('[data-explorer-bar]');

  for (const el of headers) {
    const original = el.style.backgroundColor;
    const originalTransition = el.style.transition;

    el.style.transition = 'background-color 150ms ease-in';
    el.style.backgroundColor = bg;

    setTimeout(() => {
      el.style.transition = `background-color ${fadeMs}ms ease-out`;
      el.style.backgroundColor = original;

      setTimeout(() => {
        el.style.transition = originalTransition;
      }, fadeMs + 100);
    }, holdMs);
  }
}

/**
 * Install the global event listener for explorer-bar:flash events.
 * Call once from a root component. Idempotent.
 *
 * Event detail: { color?: 'green'|'red'|'orange'|'blue', holdMs?: number, fadeMs?: number }
 */
let installed = false;
export function installExplorerBarFlashListener(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('explorer-bar:flash', ((e: CustomEvent) => {
    const { color, holdMs, fadeMs } = e.detail ?? {};
    flashExplorerBar(color ?? 'green', holdMs, fadeMs);
  }) as EventListener);
}
