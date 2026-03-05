/**
 * Initiate a tmux buffer copy with clipboard write in user gesture context.
 *
 * Must be called directly from a click handler (not via custom event dispatch)
 * so the browser preserves the user activation for clipboard.write().
 *
 * Flow: clipboard.write(deferred) → WS request → WS response → resolve → clipboard populated
 */
export function copyTmuxBuffer(): void {
  // Check if clipboard API is available (requires secure context)
  if (!navigator.clipboard?.write) {
    console.warn('[copy] clipboard.write not available — not a secure context?');
    // Still request the data, modal fallback will handle it
    window.dispatchEvent(new CustomEvent('terminal:copy-buffer'));
    // Listen for data to show modal
    const handler = (e: Event) => {
      window.removeEventListener('terminal:clipboard-data', handler);
      const { data } = (e as CustomEvent).detail;
      if (data) window.dispatchEvent(new CustomEvent('terminal:show-copy-modal'));
    };
    window.addEventListener('terminal:clipboard-data', handler);
    return;
  }

  // 1. Set up deferred data promise — resolved when terminal:clipboard-data fires
  const dataPromise = new Promise<Blob>((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('terminal:clipboard-data', handler);
      reject(new Error('timeout'));
    }, 5000);

    function handler(e: Event) {
      clearTimeout(timeout);
      window.removeEventListener('terminal:clipboard-data', handler);
      const { data, error } = (e as CustomEvent).detail;
      if (error || !data) {
        reject(new Error(error ?? 'empty'));
      } else {
        resolve(new Blob([data], { type: 'text/plain' }));
      }
    }
    window.addEventListener('terminal:clipboard-data', handler);
  });

  // 2. Start clipboard write NOW — captures user gesture
  navigator.clipboard
    .write([new ClipboardItem({ 'text/plain': dataPromise })])
    .then(async () => {
      const { toast } = await import('sonner');
      toast.success('Copied to clipboard');
    })
    .catch(async (err) => {
      console.warn('[copy] clipboard.write failed:', err);
      // Clipboard write failed (HTTP or unsupported) — request modal fallback
      window.dispatchEvent(new CustomEvent('terminal:show-copy-modal'));
    });

  // 3. Trigger WS request for tmux buffer data
  window.dispatchEvent(new CustomEvent('terminal:copy-buffer'));
}
